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
    assert(isQzoneUrl(page.url()), 'QQ 空间跳转到登录或其他页面，请重新扫码或检查访问权限');
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
      // Lazy module frames finish loading shortly after the iframe appears.
      await delay(1500, undefined, { signal: operationSignal }).catch(() => {});
      const frames = [];
      let remaining = maxChars, truncated = false, inaccessibleFrames = 0;
      for (const frame of page.frames()) {
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
  async close() {
    this.#closed = true;
    await this.#context?.close();
    // Drain pending operations before releasing a profile lock upstream.
    await this.#mutex.run(async () => {});
  }
}
