import { mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { Mutex, assert, checkSignal, combinedSignal, qqId, textArg } from './util.mjs';

export function qzoneUrl(uin, section = 'home') {
  qqId(uin);
  assert(['home', 'guestbook', 'shuoshuo'].includes(section), 'QQ 空间页面必须为 home / guestbook / shuoshuo');
  return `https://user.qzone.qq.com/${uin}${section === 'guestbook' ? '/334' : section === 'shuoshuo' ? '/311' : ''}`;
}

function isQzoneUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && (url.hostname === 'qzs.qq.com' || url.hostname === 'qzone.qq.com' || url.hostname.endsWith('.qzone.qq.com'));
  } catch { return false; }
}

function trustedFrame(frame) {
  for (let current = frame; current; current = current.parentFrame()) {
    const url = current.url();
    if (url === 'about:blank' || url === 'about:srcdoc' || !url) continue;
    return isQzoneUrl(url);
  }
  return false;
}

async function namedFrame(page, name) {
  const found = [];
  for (const frame of page.frames()) {
    if (!trustedFrame(frame)) continue;
    let id = '';
    if (frame.parentFrame()) {
      try { const element = await frame.frameElement(); id = await element.getAttribute('id') ?? ''; await element.dispose(); }
      catch { continue; }
    }
    if (frame.name() === name || id === name) found.push(frame);
  }
  assert(found.length <= 1, `页面中存在多个 ${name} 框架，已停止操作`);
  return found[0];
}

export function parseGuestbookResponse(text) {
  try {
    const start = text.indexOf('{'), end = text.lastIndexOf('}');
    if (start < 0 || end < start) return null;
    const data = JSON.parse(text.slice(start, end + 1));
    const code = data.code ?? data.ret ?? data.result?.code ?? data.data?.code;
    if (typeof code !== 'number') return null;
    return { accepted: code === 0, code };
  } catch { return null; }
}

export class QzoneBrowser {
  #mutex = new Mutex();
  #context;
  #closed = false;
  constructor(config, selfId, { chromium } = {}) { Object.assign(this, { config, selfId, chromium }); }
  async #launch(headless) {
    assert(!this.#closed, 'QQ 空间浏览器已关闭');
    await mkdir(this.config.profileDir, { recursive: true, mode: 0o700 });
    const chromium = this.chromium ?? (await import('playwright')).chromium;
    try {
      this.#context = await chromium.launchPersistentContext(this.config.profileDir, {
        headless, ...(this.config.channel ? { channel: this.config.channel } : {}),
        viewport: { width: 1365, height: 900 }, locale: 'zh-CN',
      });
    } catch {
      throw new Error('无法启动 QQ 空间浏览器。关闭 qzone-login 窗口并检查浏览器是否已安装；Chromium 可运行 npx playwright install chromium。');
    }
    this.#context.setDefaultTimeout(this.config.timeoutMs);
    return this.#context;
  }
  async #verifyLogin(context) {
    const cookies = await context.cookies('https://user.qzone.qq.com', 'https://qzone.qq.com');
    const identities = cookies.filter(c => ['uin', 'p_uin'].includes(c.name)).map(c => c.value.replace(/^o0*/, ''));
    assert(identities.includes(this.selfId), 'QQ 空间未登录或登录了其他账号，请运行 qzone-login 并使用配置的 selfId 扫码');
    assert(cookies.some(c => ['skey', 'p_skey'].includes(c.name) && c.value), 'QQ 空间登录态缺失，请重新扫码');
  }
  async login(waitForUser) {
    return this.#mutex.run(async () => {
      const context = await this.#launch(false);
      try {
        const page = context.pages()[0] ?? await context.newPage();
        await page.goto('https://qzone.qq.com/', { waitUntil: 'domcontentloaded' });
        await waitForUser();
        await this.#verifyLogin(context);
        return { loggedIn: true, selfId: this.selfId };
      } finally { await context.close(); this.#context = undefined; }
    });
  }
  async #withPage(task, signal) {
    assert(this.config.enabled, 'QQ 空间功能已在配置中关闭');
    return this.#mutex.run(async () => {
      checkSignal(signal);
      const operationSignal = combinedSignal(signal, this.config.timeoutMs + 15_000);
      const context = await this.#launch(this.config.headless);
      const abort = () => { context.close().catch(() => {}); };
      operationSignal.addEventListener('abort', abort, { once: true });
      try {
        checkSignal(operationSignal);
        await this.#verifyLogin(context);
        const page = context.pages()[0] ?? await context.newPage();
        return await task(page, operationSignal);
      } finally {
        operationSignal.removeEventListener('abort', abort);
        await context.close();
        this.#context = undefined;
      }
    });
  }
  async #open(page, uin, section, signal) {
    checkSignal(signal);
    await page.goto(qzoneUrl(uin, section), { waitUntil: 'domcontentloaded', timeout: this.config.timeoutMs });
    const landed = page.url();
    if (/\/\/i\.qq\.com\//i.test(landed) || /login/i.test(landed)) {
      throw new Error('QQ 空间登录态已失效（被重定向到登录页）。请运行 qzone-login 重新扫码后再试。');
    }
    assert(isQzoneUrl(landed), `QQ 空间跳转到其他页面（${landed.slice(0, 60)}），请重新扫码或检查访问权限`);
    if (section === 'guestbook') {
      const deadline = Date.now() + Math.min(15_000, this.config.timeoutMs);
      while (Date.now() < deadline) {
        checkSignal(signal);
        if (await namedFrame(page, this.config.guestbookFrame)) return;
        await delay(150, undefined, { signal });
      }
      throw new Error('未找到留言板框架。可能是空间关闭、需要访问权限或 QQ 页面结构已变更。请在本机检查 /334 页面与 qzone.guestbookFrame。');
    }
    // Give lazy-loaded module frames a bounded opportunity to appear.
    await page.waitForLoadState('load', { timeout: Math.min(5000, this.config.timeoutMs) }).catch(() => {});
  }
  async read(uin, section, maxChars, signal) {
    return this.#withPage(async (page, operationSignal) => {
      await this.#open(page, uin, section, operationSignal);
      // Lazy module frames finish loading shortly after the iframe appears. The
      // shuoshuo list is injected later still, so give it its own bounded wait.
      await delay(1500, undefined, { signal: operationSignal }).catch(() => {});
      if (section === 'shuoshuo' || section === 'home') {
        // Feeds render well after the frame appears (measured ~5s on other people's
        // spaces), and the count keeps growing. Wait for it to stop changing.
        const deadline = Date.now() + Math.min(25_000, this.config.timeoutMs);
        let last = -1, stable = 0;
        while (Date.now() < deadline) {
          checkSignal(operationSignal);
          const frame = await namedFrame(page, this.config.shuoshuoFrame).catch(() => undefined);
          const count = frame ? await frame.locator('li.feed').count().catch(() => 0) : 0;
          if (count > 0 && count === last) {
            if (++stable >= 2) break;
          } else stable = 0;
          last = count;
          await delay(600, undefined, { signal: operationSignal });
        }
      }
      // Image URLs live only in the DOM, so collect them for the model to fetch.
      const images = [];
      if (section === 'shuoshuo' || section === 'home') {
        const feedFrame = await namedFrame(page, this.config.shuoshuoFrame).catch(() => undefined);
        if (feedFrame) {
          const feeds = feedFrame.locator('li.feed');
          const total = await feeds.count().catch(() => 0);
          for (let i = 0; i < Math.min(total, 6); i++) {
            const item = feeds.nth(i);
            const urls = await this.#feedImages(item);
            const head = (await item.innerText().catch(() => '')).replace(/\n+/g, ' ').slice(0, 60);
            for (const url of urls) images.push({ feed: i, text: head, url });
            if (images.length >= 12) break;
          }
        }
      }
      const frames = [];
      let remaining = maxChars, truncated = false, inaccessibleFrames = 0;
      // Content lives in child frames; the main frame is mostly chrome. Read the
      // child frames first so a small maxChars budget is not spent on navigation.
      const ordered = [...page.frames()].sort((a, b) => {
        const rank = frame => (frame === page.mainFrame() ? 1 : 0);
        return rank(a) - rank(b);
      });
      for (const frame of ordered) {
        checkSignal(operationSignal);
        if (!trustedFrame(frame)) continue;
        if (remaining <= 0) { truncated = true; break; }
        try {
          const text = await frame.locator('body').innerText({ timeout: 2000 });
          const excerpt = text.slice(0, remaining);
          if (excerpt.trim()) frames.push({ name: frame.name(), text: excerpt });
          remaining -= excerpt.length;
          truncated ||= excerpt.length < text.length;
        } catch {
          // One retry covers frames that were mid-navigation on the first pass.
          try {
            await delay(800, undefined, { signal: operationSignal });
            const text = await frame.locator('body').innerText({ timeout: 3000 });
            const excerpt = text.slice(0, remaining);
            if (excerpt.trim()) frames.push({ name: frame.name(), text: excerpt });
            remaining -= excerpt.length;
            truncated ||= excerpt.length < text.length;
          } catch { inaccessibleFrames++; }
        }
      }
      return {
        uin, section, url: page.url(), frames, truncated, inaccessibleFrames,
        images,
        note: '这是当前页面可见文本，不代表完整空间备份；图片、未加载内容、相册原图和受限内容不在本工具输出中。',
      };
    }, signal);
  }
  async leaveMessage(uin, text, signal) {
    qqId(uin); textArg(text, '留言', 2000);
    let clicked = false;
    try {
      return await this.#withPage(async (page, operationSignal) => {
        await this.#open(page, uin, 'guestbook', operationSignal);
        const guestbook = await namedFrame(page, this.config.guestbookFrame);
        // Current Qzone keeps the editor collapsed until "我要留言" (#btnWantPost)
        // is clicked; the editor is then the veditor1_Iframe rich-text frame.
        // A textarea fallback stays for layouts that render #maskEditor directly.
        let writeText, readText;
        const findEditorFrame = async () => {
          try { return await namedFrame(page, this.config.editorFrame); } catch { return undefined; }
        };
        let editorFrame = this.config.editorFrame ? await findEditorFrame() : undefined;
        if (!editorFrame) {
          const want = guestbook.locator('#btnWantPost').first();
          if (await want.count()) await want.click({ timeout: 5000 }).catch(() => {});
          const revealDeadline = Date.now() + Math.min(15_000, this.config.timeoutMs);
          while (Date.now() < revealDeadline && !editorFrame) {
            checkSignal(operationSignal);
            editorFrame = await findEditorFrame();
            if (!editorFrame) await delay(200, undefined, { signal: operationSignal });
          }
        }
        if (editorFrame) {
          const editor = editorFrame.locator('body');
          await editor.waitFor({ state: 'visible' });
          const editable = await editor.evaluate(el => el.isContentEditable || el.ownerDocument.designMode === 'on');
          assert(editable, '留言编辑框不可编辑，可能缺少留言权限');
          readText = () => editor.innerText();
          writeText = async () => { await editor.click(); await editor.press('ControlOrMeta+A'); await page.keyboard.insertText(text); };
        } else {
          const field = guestbook.locator('textarea#maskEditor').first();
          await field.waitFor({ state: 'visible', timeout: Math.min(15_000, this.config.timeoutMs) });
          readText = () => field.inputValue();
          writeText = async () => { await field.click(); await field.fill(text); };
        }
        const submit = guestbook.locator(this.config.submitSelector);
        assert(await submit.count() === 1, '未唯一定位留言发表按钮；请检查 qzone.submitSelector');
        const itemCount = async () => {
          // The guestbook iframe is re-created after a successful post, so the
          // frame must be resolved freshly on every poll.
          const frame = await namedFrame(page, this.config.guestbookFrame).catch(() => undefined);
          if (!frame) return 0;
          const texts = await frame.locator(this.config.itemSelector).allTextContents().catch(() => []);
          return texts.filter(t => t.includes(text)).length;
        };
        checkSignal(operationSignal);
        const before = await itemCount();
        await writeText();
        assert((await readText()).replace(/\r\n/g, '\n').trim() === text.replace(/\r\n/g, '\n').trim(), '编辑框内容核对失败，已取消发表');
        checkSignal(operationSignal);
        // Observe only a guestbook ADD request. Reading the message list must
        // never be mistaken for a successful write.
        const responsePromise = page.waitForResponse(response => {
          const url = new URL(response.url());
          return isQzoneUrl(url.href) && response.request().method() === 'POST' && /add_msgb|msgb_add|msgbadd|msgb.*add|add.*msgb/i.test(url.pathname);
        }, { timeout: Math.min(10_000, this.config.timeoutMs) }).then(async r => parseGuestbookResponse(await r.text())).catch(() => null);
        clicked = true;
        await submit.click({ timeout: this.config.timeoutMs });
        const response = await responsePromise;
        if (response && !response.accepted) return { status: 'failed', submitted: true, code: response.code, note: 'QQ 空间明确拒绝了留言。检查验证码、权限或频率限制。' };
        if (response?.accepted) return { status: 'sent', submitted: true, confirmedBy: 'guestbook_add_response' };
        // Some Qzone layouts hide the response behind a transport wrapper.
        // Confirm a new rendered entry, excluding the editor frame itself.
        for (let attempt = 0; attempt < 20; attempt++) {
          checkSignal(operationSignal);
          try { if (await itemCount() > before) return { status: 'sent', submitted: true, confirmedBy: 'new_guestbook_entry' }; } catch {}
          await delay(250, undefined, { signal: operationSignal });
        }
        // Qzone often re-renders the list only on a fresh load; verify by reloading.
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: this.config.timeoutMs });
          const deadline2 = Date.now() + Math.min(20_000, this.config.timeoutMs);
          while (Date.now() < deadline2) {
            checkSignal(operationSignal);
            const frame = await namedFrame(page, this.config.guestbookFrame).catch(() => undefined);
            if (frame) {
              const texts = await frame.locator(this.config.itemSelector).allTextContents().catch(() => []);
              if (texts.some(t => t.includes(text))) return { status: 'sent', submitted: true, confirmedBy: 'guestbook_reload' };
            }
            await delay(500, undefined, { signal: operationSignal });
          }
        } catch {}
        return { status: 'uncertain', submitted: true, note: '已点击发表，未取得明确成功证据。请查看空间留言板；不要直接重试，以免重复留言。' };
      }, signal);
    } catch (error) {
      if (!clicked) { error.name = 'NotSubmittedError'; throw error; }
      return { status: 'uncertain', submitted: true, note: '发表操作后页面或连接中断。请手动核对留言板，避免重复留言。' };
    }
  }
  /**
   * Publish a plain-text shuoshuo.
   *
   * The composer only lives on the profile home page (`/<uin>`): the shuoshuo list
   * (`/<uin>/311`) has no publish entry at all. Clicking the placeholder
   * `$1_substitutor_content` activates the real editor `$1_content_content`, and the
   * `a.btn-post` beside it submits.
   */
  async publishShuoshuo(text, signal) {
    textArg(text, '说说正文', 2000);
    let clicked = false;
    try {
      return await this.#withPage(async (page, operationSignal) => {
        await page.goto(qzoneUrl(this.selfId, 'home'), { waitUntil: 'domcontentloaded', timeout: this.config.timeoutMs });
        const frame = page.mainFrame();
        const placeholder = frame.locator('#\\$1_substitutor_content').first();
        await placeholder.waitFor({ state: 'visible', timeout: Math.min(15_000, this.config.timeoutMs) });
        await placeholder.click();
        const editor = frame.locator('#\\$1_content_content').first();
        await editor.waitFor({ state: 'visible', timeout: Math.min(15_000, this.config.timeoutMs) });
        await editor.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.insertText(text);
        await delay(600, undefined, { signal: operationSignal });
        assert((await editor.innerText()).trim() === text.trim(), '编辑框内容核对失败，已取消发表');

        // Count existing entries before publishing; the publish response is async, so
        // navigating away immediately is what made the first attempt silently fail.
        // Home entries are div.f-item; the shuoshuo list uses li.feed.
        const feeds = frame.locator('div.f-item, li.feed');
        const before = await feeds.count().catch(() => 0);
        const submit = frame.locator('a.btn-post').first();
        assert(await submit.count() === 1, '未唯一定位发表按钮');
        clicked = true;
        await submit.click({ timeout: this.config.timeoutMs });

        // Stay on the page: wait for the composer to clear, then for a new entry.
        const clearDeadline = Date.now() + Math.min(15_000, this.config.timeoutMs);
        while (Date.now() < clearDeadline) {
          checkSignal(operationSignal);
          const left = await editor.innerText().catch(() => '');
          if (!left.trim()) break;
          await delay(300, undefined, { signal: operationSignal });
        }
        const confirmDeadline = Date.now() + Math.min(20_000, this.config.timeoutMs);
        while (Date.now() < confirmDeadline) {
          checkSignal(operationSignal);
          const now = await commentItems.count().catch(() => 0);
          if (now > before) return { status: 'sent', confirmedBy: 'new_comment_entry', feedId: targetId, commentsBefore: before, commentsAfter: now };
          await delay(700, undefined, { signal: operationSignal });
        }
        return { status: 'uncertain', submitted: true, feedId: targetId, note: '已点击发表但未确认评论出现，请到空间核对；不要直接重发。' };
      }, signal);
    } catch (error) {
      if (!clicked) { error.name = 'NotSubmittedError'; throw error; }
      return { status: 'uncertain', submitted: true, note: '发表操作后页面或连接中断，请手动核对。' };
    }
  }

  /**
   * Comment on one shuoshuo.
   *
   * Comments only exist on the profile home timeline: every `.f-single` carries a
   * `placeholder="评论"` editor, and its id is `fct_<uin>_311_0_<timestamp>_0_1`.
   * The shuoshuo list (`/311`) is a read-only archive with a different id scheme
   * (`comment_btn_<uin>_<hash>_1`), which is why commenting there never worked.
   */
  async commentShuoshuo(text, feedId, signal, uin) {
    textArg(text, '评论正文', 1000);
    let clicked = false;
    try {
      return await this.#withPage(async (page, operationSignal) => {
        const target = uin ? qqId(uin) : this.selfId;
        await page.goto(qzoneUrl(target, 'home'), { waitUntil: 'domcontentloaded', timeout: this.config.timeoutMs });
        const frame = await this.#feedsFrame(page, operationSignal);
        assert(frame, '未找到动态列表（时间线未加载或该空间不可访问）');
        const singles = frame.locator('.f-single');
        const total = await singles.count().catch(() => 0);
        assert(total > 0, '未找到任何动态（时间线未加载或该空间不可访问）');
        // The timeline renders before its delegated handlers are bound; interacting
        // too early silently does nothing. Wait for the network to settle.
        await page.waitForLoadState('load', { timeout: Math.min(20_000, this.config.timeoutMs) }).catch(() => {});
        await delay(4000, undefined, { signal: operationSignal });

        const single = await this.#homeFeed(frame, singles, feedId);
        assert(single, feedId ? `首页未找到动态 ${feedId}` : '未找到动态');
        const targetId = await single.getAttribute('id').catch(() => '');

        // Home timeline: .comments-item (hyphen). The /311 list page uses li.comments_item.
        const commentItems = single.locator('.comments-item');
        const before = await commentItems.count().catch(() => 0);

        // The comment box is the feed's own contenteditable placeholder.
        const placeholder = single.locator('[contenteditable][placeholder="评论"]').first();
        await placeholder.waitFor({ state: 'visible', timeout: Math.min(15_000, this.config.timeoutMs) });
        // Real pointer click: the widget binds delegated handlers that ignore
        // synthetic el.click(), so Playwright must drive actual input events.
        await placeholder.click({ timeout: this.config.timeoutMs, force: true });
        await delay(800, undefined, { signal: operationSignal });
        let editor = null;
        const editorDeadline = Date.now() + Math.min(15_000, this.config.timeoutMs);
        while (Date.now() < editorDeadline) {
          checkSignal(operationSignal);
          // The editor mounts inside the same feed, but search every frame as a fallback
          // because the widget may be relocated by the legacy frame bridge.
          const scopes = [single, ...page.frames().filter(f => f !== frame)];
          for (const scope of scopes) {
            const candidate = scope.locator('[contenteditable][id$="_content_content"]').first();
            if (await candidate.count().catch(() => 0) && await candidate.isVisible().catch(() => false)) { editor = candidate; break; }
          }
          if (editor) break;
          const local = single.locator('[contenteditable]:visible').first();
          const localId = await local.getAttribute('id').catch(() => '');
          if (localId && localId.endsWith('_content_content')) { editor = local; break; }
          await delay(300, undefined, { signal: operationSignal });
        }
        assert(editor, '未找到评论编辑框（点击评论占位符后未出现）');
        const editorId = await editor.getAttribute('id').catch(() => '');
        await editor.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        // type() emits real key events; insertText() alone leaves QQ's internal
        // draft state empty, so the publish button submits nothing.
        await page.keyboard.type(text, { delay: 12 });
        await editor.dispatchEvent('input').catch(() => {});
        await editor.dispatchEvent('keyup').catch(() => {});
        // The rich-text editor settles asynchronously; retry before failing.
        let typed = '';
        for (let attempt = 0; attempt < 12; attempt++) {
          await delay(300, undefined, { signal: operationSignal });
          typed = (await editor.innerText().catch(() => '')).trim();
          if (typed === text.trim()) break;
        }
        assert(typed === text.trim(), `编辑框内容核对失败（editor=${editorId} 实际：${JSON.stringify(typed.slice(0, 40))}），已取消评论`);

        // The publish button is the visible `a.btn-post` inside this feed; drive it
        // with real pointer events, then verify by watching the comment list grow.
        const buttons = single.locator('a.btn-post');
        const buttonCount = await buttons.count();
        let submit = null;
        for (let i = 0; i < buttonCount; i++) {
          const candidate = buttons.nth(i);
          if (await candidate.isVisible().catch(() => false)) { submit = candidate; break; }
        }
        assert(submit, '未找到可见的评论发表按钮');
        await delay(600, undefined, { signal: operationSignal });
        clicked = true;
        let submitError = null;
        try {
          await submit.click({ timeout: Math.min(10_000, this.config.timeoutMs) });
        } catch (error) {
          submitError = error;
          // Overlay or re-render can swallow the click; force it and retry once.
          await submit.click({ timeout: Math.min(10_000, this.config.timeoutMs), force: true }).catch(e => { submitError = e; });
        }

        const confirmDeadline = Date.now() + Math.min(20_000, this.config.timeoutMs);
        while (Date.now() < confirmDeadline) {
          checkSignal(operationSignal);
          const now = await commentItems.count().catch(() => 0);
          if (now > before) return { status: 'sent', confirmedBy: 'new_comment_entry', feedId: targetId, commentsBefore: before, commentsAfter: now };
          await delay(700, undefined, { signal: operationSignal });
        }
        return { status: 'uncertain', submitted: true, feedId: targetId, note: '已点击发表但未确认评论出现，请到空间核对；不要直接重发。' };
      }, signal);
    } catch (error) {
      if (!clicked) { error.name = 'NotSubmittedError'; throw error; }
      return { status: 'uncertain', submitted: true, note: '评论操作后页面或连接中断：' + String(error?.message ?? error).split('\n')[0].slice(0, 160) };
    }
  }


  /** Find one home-timeline entry by `fct_..._<timestamp>_...` id, or the newest one. */
  async #homeFeed(frame, singles, feedId) {
    const count = await singles.count();
    if (!count) return null;
    if (!feedId) return singles.first();
    const needle = String(feedId).trim();
    for (let i = 0; i < count; i++) {
      const single = singles.nth(i);
      const id = await single.getAttribute('id').catch(() => '');
      if (id && id.includes(needle)) return single;
    }
    const seen = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      const id = await singles.nth(i).getAttribute('id').catch(() => '');
      if (id) seen.push(id.replace(/^fct_\d+_\d+_\d+_/, '').replace(/_\d+_\d+$/, ''));
    }
    throw new Error(`首页未找到动态 ${needle}；当前可见 id：${seen.join(', ') || '无'}`);
  }

  /**
   * The feed list lives in the main frame on your own profile but inside
   * `QM_Feeds_Iframe` on other people's profiles. Pick whichever has feeds.
   */
  async #feedsFrame(page, signal, timeoutMs = 20_000) {
    const deadline = Date.now() + Math.min(timeoutMs, this.config.timeoutMs);
    while (Date.now() < deadline) {
      checkSignal(signal);
      const candidates = [page.mainFrame(), ...page.frames().filter(f => /QM_Feeds_Iframe/i.test(f.name()))];
      for (const frame of candidates) {
        const count = await frame.locator('.f-single').count().catch(() => 0);
        if (count > 0) return frame;
      }
      await delay(500, undefined, { signal });
    }
    return null;
  }

  async #waitFrame(page, name, signal) {
    const deadline = Date.now() + Math.min(20_000, this.config.timeoutMs);
    while (Date.now() < deadline) {
      checkSignal(signal);
      const frame = await namedFrame(page, name).catch(() => undefined);
      if (frame) return frame;
      await delay(200, undefined, { signal });
    }
    throw new Error(`未找到框架 ${name}`);
  }

  /**
   * Locate one feed. Each feed carries `a#comment_btn_<uin>_<feedId>_1`, which is the
   * only stable identity in the DOM — `li.feed` itself has no id attribute.
   */
  /**
   * Locate one feed. Each feed carries `a#comment_btn_<uin>_<feedId>_1`, which is the
   * only stable identity in the DOM — `li.feed` itself has no id attribute.
   * A requested feedId is never downgraded to "the first feed": commenting on the
   * wrong post is worse than failing.
   */
  async #shuoshuoItem(frame, feedId) {
    const items = frame.locator('li.feed');
    const count = await items.count();
    if (!count) return null;
    if (!feedId) return items.first();
    for (let i = 0; i < count; i++) {
      const item = items.nth(i);
      const buttonId = await item.locator('a[id^="comment_btn_"]').first().getAttribute('id').catch(() => null);
      if (buttonId && buttonId.includes(feedId)) return item;
    }
    const seen = [];
    for (let i = 0; i < Math.min(count, 8); i++) {
      const buttonId = await items.nth(i).locator('a[id^="comment_btn_"]').first().getAttribute('id').catch(() => null);
      if (buttonId) seen.push(buttonId.replace(/^comment_btn_\d+_/, '').replace(/_\d+$/, ''));
    }
    throw new Error(`未找到说说 ${feedId}；当前可见的 feedId：${seen.join(', ') || '无'}`);
  }

  /** Extract image URLs from one feed, skipping avatars, emoji sprites and blanks. */
  async #feedImages(item) {
    const urls = await item.evaluate(el => {
      const skip = /qlogo\d?\.store\.qq\.com\/qzone\/|qzonestyle\.gtimg\.cn\/qzone\/em\/|\/blank\.gif|qzs\.qq\.com\/qzone\/app\/mood/i;
      const out = [];
      for (const img of el.querySelectorAll('img')) {
        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
        if (!src || src.startsWith('data:') || skip.test(src)) continue;
        if (!/^https?:/i.test(src)) continue;
        out.push(src);
      }
      return [...new Set(out)].slice(0, 6);
    }).catch(() => []);
    return urls;
  }

  async close() {
    this.#closed = true;
    await this.#context?.close();
    // Drain pending operations before releasing a profile lock upstream.
    await this.#mutex.run(async () => {});
  }
}
