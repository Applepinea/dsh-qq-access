/**
 * QQ Zone over plain HTTP.
 *
 * Replaces the Playwright implementation, which drove the real web UI and was the
 * source of every problem this file exists to end: comments landing on the wrong
 * post (DOM ids do not identify a feed), 30-second timeouts on a cold browser,
 * skey expiring every few hours, and a window popping up on the desktop.
 *
 * The HTTP endpoints take a `g_tk` derived from `p_skey` and identify a post by
 * `{uin}_{tid}__1`, so there is no page to load and no selector to guess. Cookies
 * come from NapCat's own `get_cookies`, which means the login the QQ client already
 * has is reused -- no QR scan, no profile directory, no separate session to expire.
 *
 * Publishing a 说说 WITH IMAGES is supported. The upload endpoint is
 * `up.qzone.qq.com/cgi-bin/upload/cgi_upload_image` with `base64=1`: it takes the
 * image as a base64 form field (no multipart, no signed request), authenticates
 * with the same p_skey/g_tk as every other call, and answers with an HTML wrapper
 * around a `callback({...})` JSON payload. Verified live 2026-11-15: upload then
 * publish produced a feed that the list endpoint reports with `pic` populated.
 *
 * Still NOT here: anything that needs the mobile app's signature scheme.
 */
import { assert, combinedSignal } from './util.mjs';

const BASE = 'https://user.qzone.qq.com';
const LIST_URL = BASE + '/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6';
const COMMENT_URL = BASE + '/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds';
const PUBLISH_URL = BASE + '/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6';
const DELETE_URL = 'https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delete_v6';
const DETAIL_URL = 'https://h5.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msgdetail_v6';
// 图片上传。注意不是 multipart：这个接口接受 base64 文本字段（base64=1），
// 所以现有的 application/x-www-form-urlencoded 请求就能直接发，不需要重构 request()。
const UPLOAD_URL = 'https://up.qzone.qq.com/cgi-bin/upload/cgi_upload_image';

/**
 * 说说可见范围。
 *
 * 值是 QQ 空间自己的 ugc_right 编码，抓包核对过：
 *   1   公开
 *   4   好友可见（QQ 好友）
 *   64  仅自己可见
 *   128 仅密友可见
 *
 * 配置里存的是可读的字符串键，发请求时才换成数字。
 * 'default' 表示**不传**这个字段，沿用账号自己的默认设置。
 */
export const QZONE_RIGHTS = {
  public: 1,
  friends: 4,
  private: 64,
  // 注意：128（仅密友可见）实测会被服务端拒绝，
  // 回 code/subcode = -10082，message =「未设置指定人，请设置后再发表」——
  // 它要求同时传一列具体的 uin（to_uins），本插件不提供这个参数。
  // 这里保留编码是为了让「手工把配置写成 close」能给出可读的失败原因，
  // 面板与配置归一化都不提供这个选项。
  close: 128,
};

export const QZONE_RIGHT_KEYS = ['default', ...Object.keys(QZONE_RIGHTS)];

/**
 * 把配置值换成 publish() 要的 ugc_right。
 *
 * 返回 undefined 表示「这项不要传」—— 不是「没有权限」。
 * 非法值直接抛：静默退回默认会让用户以为设置生效了，
 * 而那条说说的可见范围其实和上一次一样。
 */
export function resolveRight(value) {
  const key = String(value ?? '').trim();
  if (!key || key === 'default') return undefined;
  const mapped = QZONE_RIGHTS[key];
  if (mapped !== undefined) return mapped;
  // 也接受直接写数字，方便手工改 config.json。
  const n = Number(key);
  if ([1, 4, 64, 128].includes(n)) return n;
  throw new Error('说说可见范围的取值不合法：' + key + '（可用：' + QZONE_RIGHT_KEYS.join(' / ') + '）');
}

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * The `g_tk` every QQ web endpoint expects.
 *
 * A DJB-style rolling hash over `p_skey`, masked to 31 bits. It is not a signature:
 * it only proves the caller holds the cookie, which is why it can be computed
 * locally instead of scraped from a page.
 */
export function gtk(pSkey) {
  let hash = 5381;
  for (const ch of String(pSkey ?? '')) hash += (hash << 5) + ch.codePointAt(0);
  return String(hash & 0x7fffffff);
}

/** Strip the JSONP wrapper the `format=jsonp` endpoints reply with. */
export function unwrapJsonp(text) {
  const body = String(text ?? "").trim();
  // Three shapes come back from the same gateway:
  //   _preloadCallback({...});                          (list / detail)
  //   <html>...frameElement.callback({...})...</html>    (comment / publish)
  //   {...}                                             (a few endpoints)
  // The write endpoints wrap their JSON in an HTML shim so an iframe can consume
  // it. Two wrong ways to find the payload, both of which cost a debugging session:
  // searching for the first "{" lands inside the shim's own try/catch, and
  // searching for the last "(" lands inside an onclick="" attribute in the
  // escaped feed HTML. The callback INVOCATION is the only unambiguous anchor.
  let begin = -1;
  for (const marker of ["frameElement.callback(", "callback(", "_preloadCallback("]) {
    const at = body.lastIndexOf(marker);
    if (at < 0) continue;
    const from = at + marker.length;
    const offset = body.slice(from).search(/[{\[]/);
    if (offset >= 0) { begin = from + offset; break; }
  }
  if (begin < 0) {
    const offset = body.search(/[{\[]/);
    if (offset < 0) throw new Error("响应中没有 JSON");
    begin = offset;
  }
  const openChar = body[begin];
  const closeChar = openChar === "{" ? "}" : "]";
  // Walk with string awareness: the payload contains escaped quotes and braces.
  let depth = 0, inString = false, escaped = false, endIndex = -1;
  for (let k = begin; k < body.length; k++) {
    const ch = body[k];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === openChar) depth++;
    else if (ch === closeChar) { depth--; if (depth === 0) { endIndex = k; break; } }
  }
  if (endIndex < 0) throw new Error("响应中的 JSON 不完整");
  return JSON.parse(body.slice(begin, endIndex + 1));
}

/**
 * Turn a QQ Zone "em" placeholder into something readable.
 *
 * The web UI renders `[em]e401159[/em]` as an image; without a mapping the best
 * available answer is to drop it rather than leave the raw token in a caption.
 */
export function cleanZoneText(text) {
  return String(text ?? '')
    .replace(/\[em\]e?\d+\[\/em\]/gi, '')
    .replace(/@\{uin:(\d+),nick:([^,}]*)[^}]*\}/g, '@$2')
    .replace(/\[em\][^[]*\[\/em\]/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Normalise one feed entry from `emotion_cgi_msglist_v6`. */
export function normalizeFeed(raw, hostUin) {
  const images = (raw.pic ?? [])
    .map((p) => String(p?.url2 || p?.url1 || p?.url3 || p?.url || ''))
    .map((u) => (u.startsWith('http://') ? 'https://' + u.slice(7) : u))
    .filter(Boolean);
  const comments = (raw.commentlist ?? []).map((c) => ({
    id: String(c.id ?? c.commentid ?? ''),
    uin: String(c.uin ?? ''),
    name: String(c.name ?? c.nickname ?? c.uin ?? ''),
    content: cleanZoneText(c.content ?? ''),
    time: Number(c.create_time ?? c.createTime ?? 0) || null,
  }));
  return {
    tid: String(raw.tid ?? ''),
    hostUin: String(hostUin ?? ''),
    // The value every write endpoint wants: `{hostUin}_{tid}__1`.
    topicId: `${hostUin}_${raw.tid}__1`,
    content: cleanZoneText(raw.content ?? ''),
    created: Number(raw.created_time ?? 0) || null,
    images,
    comments,
    commentCount: Number(raw.commentnum ?? comments.length) || 0,
    likeCount: Number(raw.likenum ?? 0) || 0,
    forwardCount: Number(raw.fwdnum ?? 0) || 0,
    secret: Number(raw.secret ?? 0) || 0,
  };
}

export class QzoneHttp {
  constructor(config, { client, logger = console } = {}) {
    this.config = config;
    this.client = client;
    this.logger = logger;
    this.cache = null;
    this.cacheAt = 0;
  }

  /**
   * Cookie jar + identity, refreshed when it goes stale.
   *
   * \`get_cookies\` answers with one header string; parsing it here keeps every
   * caller from re-deriving uin and p_skey.
   */
  async context({ force = false } = {}) {
    const ttlMs = Math.max(0, Number(this.config.qzone?.cookieTtlMs ?? 600_000));
    if (!force && this.cache && Date.now() - this.cacheAt < ttlMs) return this.cache;
    const data = await this.client.call('get_cookies', { domain: 'user.qzone.qq.com' }, undefined);
    const jar = new Map();
    for (const part of String(data?.cookies ?? '').split(';')) {
      const eq = part.indexOf('=');
      if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
    const uin = String(jar.get('uin') ?? '').replace(/^o/, '');
    // g_tk 必须由 p_skey 算。
    // 以前 p_skey 缺失时退到 skey，只要字符串非空就通过断言 ——
    // 但用 skey 算出来的请求会拿到登录页或错误页，然后被说成「cookie 失效」，
    // 排查方向从一开始就是错的。
    const pSkey = jar.get('p_skey') ?? '';
    assert(uin, 'NapCat 未返回 QQ 空间 cookie（uin 缺失）；请确认 QQ 已登录');
    assert(pSkey, 'NapCat 未返回 QQ 空间 cookie（p_skey 缺失）；请重新登录 QQ');
    this.cache = {
      uin,
      skey: jar.get('skey') ?? '',
      pSkey,
      gtk: gtk(pSkey),
      cookie: [...jar].map(([k, v]) => k + '=' + v).join('; '),
    };
    this.cacheAt = Date.now();
    return this.cache;
  }

  /** One request against a Zone endpoint, with the headers the gateways expect. */
  /**
   * 发一个请求，返回**原始文本**。
   *
   * 和 request() 分开是因为并非所有接口都回 JSONP：图片上传回的是
   * 一个 HTML 页面（内嵌 `callback({...})`），交给 JSONP 解包会直接抛错。
   */
  async requestText(url, { method = 'GET', params = {}, form, signal } = {}) {
    const ctx = await this.context();
    const target = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
    const headers = {
      cookie: ctx.cookie,
      referer: `${BASE}/${ctx.uin}`,
      origin: BASE,
      'user-agent': DESKTOP_UA,
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
    };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const response = await fetch(target, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      // B21：以前写的是 `signal ?? AbortSignal.timeout(...)`，看起来合理，
      // 但调用方永远会传一个 shutdown.signal（它平时不 abort），
      // 于是 `??` 永远取左边，空间接口自己的超时从来没生效过。
      // 上传卡住时会一直占着，配合轮询就变成同一条说说发两遍。
      // 现在两个信号取交集：超时和取消都算数。
      signal: combinedSignal(signal, Number(this.config.qzone?.timeoutMs ?? 20_000)),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`QQ 空间接口 HTTP ${response.status}`);
    return text;
  }
  async request(url, { method = 'GET', params = {}, form, signal } = {}) {
    const ctx = await this.context();
    const target = new URL(url);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) target.searchParams.set(key, String(value));
    }
    const headers = {
      cookie: ctx.cookie,
      referer: `${BASE}/${ctx.uin}`,
      origin: BASE,
      'user-agent': DESKTOP_UA,
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9',
    };
    let body;
    if (form) {
      headers['content-type'] = 'application/x-www-form-urlencoded';
      body = new URLSearchParams(form).toString();
    }
    const response = await fetch(target, {
      method,
      headers,
      ...(body === undefined ? {} : { body }),
      // B21：以前写的是 `signal ?? AbortSignal.timeout(...)`，看起来合理，
      // 但调用方永远会传一个 shutdown.signal（它平时不 abort），
      // 于是 `??` 永远取左边，空间接口自己的超时从来没生效过。
      // 上传卡住时会一直占着，配合轮询就变成同一条说说发两遍。
      // 现在两个信号取交集：超时和取消都算数。
      signal: combinedSignal(signal, Number(this.config.qzone?.timeoutMs ?? 20_000)),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`QQ 空间接口 HTTP ${response.status}`);
    try {
      return unwrapJsonp(text);
    } catch {
      // An expired cookie answers with a login page, not JSON; surface that clearly
      // instead of a JSON parse error the caller cannot act on.
      this.cache = null;
      throw new Error('QQ 空间返回了非 JSON 内容（cookie 可能已失效，请重新登录 QQ）');
    }
  }

  /**
   * Read one user's 说说 list.
   *
   * \`self\` reads the logged-in account; any other uin reads that user's public
   * space, which is what the previous browser implementation needed a separate
   * iframe for.
   */
  async list({ uin, limit = 10, replyNum = 5, signal } = {}) {
    const ctx = await this.context();
    const target = String(uin ?? ctx.uin) || ctx.uin;
    const data = await this.request(LIST_URL, {
      signal,
      params: {
        uin: target,
        ftype: 0,
        sort: 0,
        pos: 0,
        num: Math.min(40, Math.max(1, limit)),
        replynum: Math.min(20, Math.max(0, replyNum)),
        g_tk: ctx.gtk,
        callback: '_preloadCallback',
        code_version: 1,
        format: 'jsonp',
        need_private_comment: 1,
      },
    });
    assert(data?.code === 0 || data?.code === undefined, `QQ 空间读取失败（code=${data?.code}）`);
    const feeds = (data?.msglist ?? []).map((raw) => normalizeFeed(raw, target));
    return { uin: target, total: Number(data?.total ?? feeds.length), feeds, nickname: data?.logininfo?.name ?? '' };
  }

  /** Fetch one 说说 by tid, used to confirm a write landed. */
  async detail(tid, { uin, signal } = {}) {
    const ctx = await this.context();
    const host = String(uin ?? ctx.uin);
    const data = await this.request(DETAIL_URL, {
      signal,
      params: {
        uin: host, tid, g_tk: ctx.gtk,
        callback: '_preloadCallback', code_version: 1, format: 'jsonp',
      },
    });
    return data;
  }

  /** Post a comment on one 说说. */
  async comment(feed, content, { signal } = {}) {
    const ctx = await this.context();
    const text = String(content ?? '').trim();
    assert(text, '评论内容为空');
    assert(text.length <= 1000, '评论过长');
    assert(feed?.tid, '缺少说说 tid，无法定位要评论的那一条');
    const data = await this.request(COMMENT_URL, {
      method: 'POST',
      signal,
      params: { g_tk: ctx.gtk },
      form: {
        topicId: feed.topicId ?? `${feed.hostUin ?? ctx.uin}_${feed.tid}__1`,
        uin: ctx.uin,
        hostUin: feed.hostUin ?? ctx.uin,
        feedsType: 100,
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        plat: 'qzone',
        source: 'ic',
        platformid: 52,
        format: 'fs',
        ref: 'feeds',
        content: text,
      },
    });
    return { code: Number(data?.code ?? -1), message: String(data?.message ?? data?.msg ?? ''), raw: data };
  }

  /**
   * Upload one image to the account's 说说 album and return what publish() needs.
   *
   * The endpoint returns an HTML page whose inline script calls
   * `frameElement.callback({...})`. That wrapper exists because the real client
   * loads it in a hidden iframe; we only need the JSON inside.
   *
   * `pic_bo` is NOT always present in the response. The reference request sends the
   * same constant twice separated by a tab, and publishing works with that value,
   * so a missing pic_bo falls back to it rather than failing the whole upload.
   */
  async uploadImage(bytes, { signal, mimeType = 'image/jpeg' } = {}) {
    assert(bytes && bytes.length, '图片内容为空');
    const ctx = await this.context();
    const form = {
      filename: 'filename',
      uin: ctx.uin,
      skey: ctx.skey,
      zzpaneluin: ctx.uin,
      zzpanelkey: '',
      p_uin: ctx.uin,
      p_skey: ctx.pSkey,
      qzonetoken: '',
      uploadtype: '1',
      albumtype: '7',
      exttype: '0',
      refer: 'shuoshuo',
      output_type: 'jsonhtml',
      charset: 'utf-8',
      output_charset: 'utf-8',
      upload_hd: '1',
      hd_width: '2048',
      hd_height: '10000',
      hd_quality: '96',
      backUrls: 'http://upbak.photo.qzone.qq.com/cgi-bin/upload/cgi_upload_image,http://119.147.64.75/cgi-bin/upload/cgi_upload_image',
      url: `${UPLOAD_URL}?g_tk=${ctx.gtk}`,
      base64: '1',
      jsonhtml_callback: 'callback',
      picfile: Buffer.from(bytes).toString('base64'),
    };
    // 上传接口回的是 HTML，不走 request() 的 JSONP 解包。
    const raw = await this.requestText(UPLOAD_URL, { method: 'POST', params: { g_tk: ctx.gtk }, form, signal });
    const match = raw.match(/callback\((\{[\s\S]*\})\);/);
    if (!match) throw new Error('QQ 空间上传接口返回了无法解析的内容');
    let data;
    try { data = JSON.parse(match[1]); }
    catch { throw new Error('QQ 空间上传接口返回了非法 JSON'); }
    if (Number(data?.ret ?? -1) !== 0) {
      throw new Error('QQ 空间图片上传被拒绝（ret=' + String(data?.ret) + '）');
    }
    const info = data.data ?? {};
    assert(info.lloc && info.sloc, '上传接口没有返回图片标识');
    return {
      albumId: String(info.albumid ?? ''),
      lloc: String(info.lloc),
      sloc: String(info.sloc),
      type: Number(info.type ?? 3),
      width: Number(info.width ?? 0) || 0,
      height: Number(info.height ?? 0) || 0,
      picBo: String(info.pic_bo ?? 'QAboAwAAAAAWEI0!'),
      url: String(info.url ?? ''),
      mimeType,
    };
  }

  /**
   * 把一张或多张已上传的图片拼成 publish() 需要的两个字段。
   *
   * richval 的格式（照实抓的请求）：
   *   ,<albumid>,<lloc>,<sloc>,<type>,<w>,<h>,,<w>,<h>
   * 多张图时重复这一段，整体仍以一个逗号开头、没有分隔符。
   *
   * pic_bo 是每张图一段、用 tab 分隔。
   */
  buildRichval(images) {
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    const richval = list
      .map((i) => `,${i.albumId},${i.lloc},${i.sloc},${i.type},${i.width},${i.height},,${i.width},${i.height}`)
      .join('');
    const picBo = list.map((i) => i.picBo).join('\t');
    return { richval, picBo };
  }
  /**
   * Publish a 说说, optionally with images.
   *
   * `images` are the objects returned by uploadImage(). When present the request
   * gains `richtype`/`richval`/`pic_bo`/`subrichtype` and drops `who` — that is
   * exactly the shape the real client sends for an image post (captured live).
   *
   * `right` maps to `ugc_right`:
   *   1   公开
   *   4   好友可见（QQ 好友）
   *   64  仅自己可见
   *   128 仅密友可见
   * Omit it to keep the account's default.
   */
  async publish(content, { signal, images = [], right } = {}) {
    const ctx = await this.context();
    const text = String(content ?? '').trim();
    const list = Array.isArray(images) ? images.filter(Boolean) : [];
    // 带图时可以只有图不写字；纯文字时正文不能为空。
    assert(text || list.length, '说说内容为空');
    assert(text.length <= 2000, '说说过长');
    const form = {
      syn_tweet_verson: 1,
      paramstr: 1,
      con: text,
      feedversion: 1,
      ver: 1,
      uin: ctx.uin,
      hostuin: ctx.uin,
      code_version: 1,
      format: 'jsonp',
      qzreferrer: `${BASE}/${ctx.uin}`,
    };
    if (list.length) {
      const { richval, picBo } = this.buildRichval(list);
      Object.assign(form, {
        pic_template: '',
        richtype: 1,
        richval,
        special_url: '',
        subrichtype: 1,
        pic_bo: picBo,
      });
    } else {
      // 纯文字请求带 who=1；带图请求里有 richtype 就不要它了。
      form.who = 1;
    }
    if (right !== undefined && right !== null && right !== '') {
      const n = Number(right);
      assert([1, 4, 64, 128].includes(n), '权限值不合法（只能是 1/4/64/128）');
      form.ugc_right = n;
      form.to_sign = 0;
    }
    const data = await this.request(PUBLISH_URL, {
      method: 'POST',
      signal,
      params: { g_tk: ctx.gtk },
      form,
    });
    // 响应里帖子的 id 有两个名字：纯文字发布回 `tid`，带图发布回 `t1_tid`。
    // 只取 tid 的话，所有带图说说都会拿到空字符串 —— 上层虽然能靠正文回读
    // 确认发布成功，但日志里 tid 空了就查不到是哪条。
    const tid = String(data?.tid ?? data?.t1_tid ?? '');
    return { code: Number(data?.code ?? -1), tid, message: String(data?.message ?? data?.msg ?? ''), images: list.length };
  }

  /** Delete one of the account's own 说说. */
  async remove(feed, { signal } = {}) {
    const ctx = await this.context();
    assert(feed?.tid, "缺少说说 tid");
    // Deleting needs the feed's own identity fields, not just its topicId: the
    // gateway answers code -3 ("参数错误") when feedsKey/appid/time are missing.
    const data = await this.request(DELETE_URL, {
      method: "POST",
      signal,
      params: { g_tk: ctx.gtk },
      form: {
        uin: ctx.uin,
        topicId: feed.topicId ?? `${feed.hostUin ?? ctx.uin}_${feed.tid}__1`,
        feedsType: 0,
        feedsFlag: 0,
        feedsKey: feed.tid,
        feedsAppid: 311,
        // 用这条说说自己的创建时间，不是「现在」。
        // 同文件注释和 docs/VALIDATION.md 都写着缺 feedsTime 会返回 -3；
        // 而 feedsTime 的语义是「哪天发的」，列表解析时已经拿到了 created_time。
        // 传 now 时，删除今天以前的说说会稳定失败。
        feedsTime: Number(feed.created ?? feed.createdAt ?? feed.feedsTime) || Math.floor(Date.now() / 1000),
        fupdate: 1,
        ref: "feeds",
        qzreferrer: `${BASE}/proxy/domain/ic2.qzone.qq.com/cgi-bin/feeds/feeds_html_module?g_iframeUser=1&i_uin=${ctx.uin}&i_login_uin=${ctx.uin}&mode=4&previewV8=1&style=35&version=8&needDelOpr=true`,
      },
    });
    return { code: Number(data?.code ?? -1), message: String(data?.message ?? data?.msg ?? ""), raw: data };
  }

  /** Nothing to release: there is no browser and no long-lived socket. */
  async close() {
    this.cache = null;
  }
}