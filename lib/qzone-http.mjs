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
 * What is intentionally NOT here: publishing a 说说 with images (the upload endpoint
 * is documented upstream as fragile) and anything that needs the mobile app's
 * signature scheme. Those still return a clear error instead of half-working.
 */
import { assert } from './util.mjs';

const BASE = 'https://user.qzone.qq.com';
const LIST_URL = BASE + '/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6';
const COMMENT_URL = BASE + '/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds';
const PUBLISH_URL = BASE + '/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_publish_v6';
const DELETE_URL = 'https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_delete_v6';
const DETAIL_URL = 'https://h5.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msgdetail_v6';

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
    const pSkey = jar.get('p_skey') ?? jar.get('skey') ?? '';
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
      signal: signal ?? AbortSignal.timeout(Number(this.config.qzone?.timeoutMs ?? 20_000)),
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

  /** Publish a text-only 说说. */
  async publish(content, { signal } = {}) {
    const ctx = await this.context();
    const text = String(content ?? '').trim();
    assert(text, '说说内容为空');
    assert(text.length <= 2000, '说说过长');
    const data = await this.request(PUBLISH_URL, {
      method: 'POST',
      signal,
      params: { g_tk: ctx.gtk },
      form: {
        syn_tweet_verson: 1,
        paramstr: 1,
        who: 1,
        con: text,
        feedversion: 1,
        ver: 1,
        uin: ctx.uin,
        hostuin: ctx.uin,
        code_version: 1,
        format: 'jsonp',
        qzreferrer: `${BASE}/${ctx.uin}`,
      },
    });
    return { code: Number(data?.code ?? -1), tid: String(data?.tid ?? ''), message: String(data?.message ?? data?.msg ?? ''), raw: data };
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
        feedsTime: Math.floor(Date.now() / 1000),
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