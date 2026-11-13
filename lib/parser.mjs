/**
 * Link parser: turn a pasted social-media link into something worth sending.
 *
 * Ported in spirit from astrbot_plugin_parser, but this is not a translation:
 * that project is Python and renders PIL cards, while this plugin speaks Node and
 * sends plain text plus real media. What is kept is the useful half -- recognise
 * a link, ask the platform for its metadata, and hand back images and a caption.
 *
 * VIDEO IS NEVER DOWNLOADED. A phone-shot clip is tens of megabytes and QQ caps
 * what it will accept, so a video link is answered with its title, cover and the
 * original URL. Galleries (which are small and are the actual reason to parse)
 * are sent as images.
 *
 * Every platform degrades to "link only" instead of throwing: a parser that
 * breaks the reply is worse than one that echoes the URL.
 */
import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

function trace(line) {
  try {
    appendFileSync(
      join(homedir(), '.dsh-qq-access', 'debug.log'),
      new Date().toISOString() + ' parse ' + line + '\n',
    );
  } catch { /* diagnostics must never break parsing */ }
}

/** Fetch a URL as text, following redirects, with a hard per-request budget. */
async function fetchText(url, { timeoutMs = 15_000, ua = DESKTOP_UA, headers = {} } = {}) {
  // `ua: ''` means "send no User-Agent at all", which is not the same as sending an
  // empty one: at least one API (B站) treats the presence of a browser UA as a
  // risk-control signal and only answers 200 when the header is absent.
  const base = {
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
  };
  if (ua) base['user-agent'] = ua;
  const response = await fetch(url, {
    // 不跟随跳转。
    // 短链（b23.tv / xhslink.com）若跳到内网或元数据地址，请求是插件进程发的，
    // 正文会进模型和回复。平台匹配只保证「起始 URL 是已知平台的」，
    // 管不住它跳到哪里。
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { ...base, ...headers },
  });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return { text: await response.text(), finalUrl: response.url };
}

async function fetchJson(url, options) {
  const { text, finalUrl } = await fetchText(url, options);
  return { data: JSON.parse(text), finalUrl };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
      const key = code.toLowerCase();
      if (ENTITIES[key] !== undefined) return ENTITIES[key];
      if (key.startsWith('#x')) return String.fromCodePoint(parseInt(key.slice(2), 16));
      if (key.startsWith('#')) return String.fromCodePoint(parseInt(key.slice(1), 10));
      return whole;
    })
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Pull `<meta property/name=... content=...>` pairs out of an HTML document. */
function metaTags(html) {
  const out = {};
  for (const tag of html.match(/<meta\s[^>]*>/gi) ?? []) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    const value = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!key || value === undefined) continue;
    const name = key.toLowerCase();
    if (out[name] === undefined) out[name] = decodeEntities(value);
  }
  return out;
}

/** Collect image URLs a page declares through the usual social-media tags. */
function imageTags(html, meta) {
  const found = [];
  for (const key of ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']) {
    if (meta[key]) found.push(meta[key]);
  }
  // Some sites only expose the gallery as JSON-LD.
  for (const block of html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    const body = block.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    try {
      const walk = (node) => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!node || typeof node !== 'object') return;
        for (const [k, v] of Object.entries(node)) {
          if (/^(image|contentUrl|thumbnailUrl)$/i.test(k)) {
            if (typeof v === 'string') found.push(v);
            else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && found.push(x));
            else if (v && typeof v === 'object' && typeof v.url === 'string') found.push(v.url);
          } else walk(v);
        }
      };
      walk(JSON.parse(body));
    } catch { /* a malformed JSON-LD block is not an error */ }
  }
  return found;
}

/** Make a possibly relative or protocol-relative URL absolute, and reject junk. */
function absolute(url, base) {
  const raw = String(url ?? "").trim();
  if (!raw || raw.startsWith("data:")) return "";
  try {
    const resolved = new URL(raw.startsWith("//") ? "https:" + raw : raw, base);
    if (resolved.protocol === "http:") {
      // QQ fetches media over https and silently drops an http cover, so upgrade
      // it here instead of handing the client a URL it will not use.
      resolved.protocol = "https:";
    }
    return resolved.protocol === "https:" ? resolved.href : "";
  } catch { return ""; }
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n >= 100_000_000) return (n / 100_000_000).toFixed(1) + '亿';
  if (n >= 10_000) return (n / 10_000).toFixed(1) + '万';
  return String(n);
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return m + ':' + String(s).padStart(2, '0');
}

/**
 * One parser per platform.
 *
 * `match` receives the URL and returns an id/context or null. `parse` receives
 * that context plus the shared fetch helpers and returns a result object; it may
 * throw, in which case the caller falls back to a link-only reply.
 */
const PARSERS = [
  {
    id: 'bilibili',
    name: 'B站',
    match(url) {
      if (/(^|\.)b23\.tv$/i.test(url.hostname)) return { short: true };
      if (!/(^|\.)bilibili\.com$/i.test(url.hostname)) return null;
      const bv = url.pathname.match(/\/(BV[0-9A-Za-z]+)/);
      if (bv) return { bvid: bv[1] };
      const av = url.pathname.match(/\/av(\d+)/i);
      if (av) return { aid: av[1] };
      return null;
    },
    async parse(ctx, helpers) {
      let { bvid, aid } = ctx;
      let base = 'https://www.bilibili.com/';
      if (ctx.short) {
        // A b23.tv link only redirects; follow it to learn what it points at.
        const { finalUrl } = await helpers.fetchText('https://' + helpers.host + helpers.pathname, { ua: MOBILE_UA });
        const m = String(finalUrl).match(/\/(BV[0-9A-Za-z]+)/);
        if (!m) throw new Error('短链未指向视频');
        bvid = m[1];
        base = finalUrl;
      }
      const query = bvid ? 'bvid=' + bvid : 'aid=' + aid;
      // Deliberately NO User-Agent. Measured against the live API: a Chrome UA
      // answers HTTP 412 (-412 risk control) while an empty header set answers 200.
      // Sending the "polite" headers here is what breaks it.
      const { data } = await helpers.fetchJson('https://api.bilibili.com/x/web-interface/view?' + query, {
        ua: '',
        headers: {},
      });
      if (data?.code !== 0 || !data.data) throw new Error('B站接口返回 ' + (data?.code ?? 'unknown'));
      const v = data.data;
      const stat = v.stat ?? {};
      const parts = [
        '▶ ' + formatCount(stat.view),
        '👍 ' + formatCount(stat.like),
        '🪙 ' + formatCount(stat.coin),
        '⭐ ' + formatCount(stat.favorite),
      ].filter((p) => !p.endsWith(' '));
      return {
        platform: 'bilibili',
        platformName: 'B站',
        kind: 'video',
        url: 'https://www.bilibili.com/video/' + v.bvid,
        title: v.title,
        author: v.owner?.name,
        description: v.desc,
        cover: absolute(v.pic, 'https://www.bilibili.com/'),
        images: [],
        meta: [formatDuration(v.duration), parts.join(' ')].filter(Boolean).join(' · '),
      };
    },
  },
  {
    id: 'youtube',
    name: 'YouTube',
    match(url) {
      if (/(^|\.)youtu\.be$/i.test(url.hostname)) return { id: url.pathname.slice(1) };
      if (!/(^|\.)youtube\.com$/i.test(url.hostname)) return null;
      const v = url.searchParams.get('v');
      if (v) return { id: v };
      const shorts = url.pathname.match(/\/(?:shorts|embed)\/([\w-]+)/);
      return shorts ? { id: shorts[1] } : null;
    },
    async parse(ctx, helpers) {
      const canonical = 'https://www.youtube.com/watch?v=' + ctx.id;
      // oEmbed needs no key and answers with exactly the fields worth showing.
      const { data } = await helpers.fetchJson(
        'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(canonical),
      );
      return {
        platform: 'youtube',
        platformName: 'YouTube',
        kind: 'video',
        url: canonical,
        title: data.title,
        author: data.author_name,
        description: '',
        cover: absolute(data.thumbnail_url, 'https://www.youtube.com/'),
        images: [],
        meta: '',
      };
    },
  },
  {
    id: 'twitter',
    name: 'X',
    match(url) {
      if (!/(^|\.)(x|twitter)\.com$/i.test(url.hostname)) return null;
      const m = url.pathname.match(/\/status(?:es)?\/(\d+)/);
      return m ? { id: m[1], handle: url.pathname.split('/')[1] || '' } : null;
    },
    async parse(ctx, helpers) {
      // fxtwitter is a public mirror that returns the tweet as JSON, including
      // media, without needing a token. It falls back to the OG tags below.
      const canonical = 'https://x.com/' + (ctx.handle ? ctx.handle + '/' : 'i/') + 'status/' + ctx.id;
      // fxtwitter mirrors a tweet as JSON without a token. The handle form is
      // tried first because that is the shape its resolver expects; `i` is the
      // documented fallback for links whose handle segment is not a username.
      let tweet;
      for (const prefix of [ctx.handle, 'i'].filter(Boolean)) {
        try {
          const { data } = await helpers.fetchJson('https://api.fxtwitter.com/' + prefix + '/status/' + ctx.id);
          if (data?.tweet) { tweet = data.tweet; break; }
        } catch { /* try the next shape */ }
      }
      if (!tweet) throw new Error('X 接口未返回内容');
      const photos = (tweet.media?.photos ?? []).map((p) => absolute(p.url, 'https://x.com/'));
      const videos = (tweet.media?.videos ?? []).map((v) => absolute(v.thumbnail_url, 'https://x.com/')).filter(Boolean);
      return {
        platform: 'twitter',
        platformName: 'X',
        kind: photos.length ? 'gallery' : 'video',
        url: canonical,
        title: String(tweet.text ?? '').split('\n')[0].slice(0, 120),
        author: '@' + (tweet.author?.screen_name ?? ctx.handle),
        description: String(tweet.text ?? '').slice(0, 400),
        cover: videos[0] ?? photos[0] ?? '',
        images: photos,
        meta: [formatCount(tweet.likes), formatCount(tweet.replies)].filter(Boolean).join(' · '),
      };
    },
  },
  {
    id: 'xiaohongshu',
    name: '小红书',
    match(url) {
      if (/(^|\.)xhslink\.com$/i.test(url.hostname)) return { short: true };
      if (!/(^|\.)xiaohongshu\.com$/i.test(url.hostname)) return null;
      const m = url.pathname.match(/\/(?:explore|discovery\/item|note)\/([0-9a-f]+)/i);
      return m ? { noteId: m[1] } : null;
    },
    async parse(ctx, helpers) {
      let target = ctx.short ? null : "https://www.xiaohongshu.com/explore/" + ctx.noteId;
      if (ctx.short) {
        const page = await helpers.fetchText("https://" + helpers.host + helpers.pathname, { ua: MOBILE_UA });
        target = page.finalUrl;
      }
      const page = await helpers.fetchText(target, { ua: MOBILE_UA });
      const finalUrl = page.finalUrl || target;
      // 短链（xhslink.com）匹配时没有 noteId，真正的 id 在跳转后的地址里。
      // 以前直接拿 ctx.noteId 拼 URL，404 分支和成功分支都会写出
      // https://www.xiaohongshu.com/explore/undefined。从 finalUrl 里补一次。
      const resolvedNoteId = String(ctx.noteId ?? '')
        || (String(finalUrl).match(/\/(?:explore|discovery\/item|note)\/([0-9a-f]+)/i)?.[1] ?? '');
      const noteUrl = resolvedNoteId
        ? 'https://www.xiaohongshu.com/explore/' + resolvedNoteId
        : finalUrl;
      // A note that does not exist (or is region-blocked) redirects to an error
      // page whose og:title is the error URL itself. Detect that shape instead of
      // publishing a wall of percent-encoded query string as a "title".
      if (/\/404\/|error_code=|当前笔记暂时无法浏览|sec_/i.test(finalUrl) || /\/404\/|error_code=/i.test(page.text.slice(0, 4000))) {
        return {
          platform: "xiaohongshu",
          platformName: "小红书",
          kind: "video",
          url: noteUrl,
          title: "",
          author: "",
          description: "",
          cover: "",
          images: [],
          meta: "",
          linkOnly: true,
        };
      }
      const meta = metaTags(page.text);
      const inline = [...page.text.matchAll(/https?:\/\/sns-img[^"'\\\s)]+/gi)].map((m) => m[0]);
      const images = unique([...imageTags(page.text, meta), ...inline].map((u) => absolute(u, finalUrl)));
      const title = (meta["og:title"] || meta.title || "").replace(/\s*-\s*小红书.*$/, "").trim();
      const description = (meta["og:description"] || meta.description || "").slice(0, 300);
      return {
        platform: "xiaohongshu",
        platformName: "小红书",
        kind: images.length > 1 ? "gallery" : "video",
        url: noteUrl,
        title: title.slice(0, 140),
        author: "",
        description,
        cover: images[0] ?? "",
        images: images.slice(1),
        meta: "",
        linkOnly: !title && images.length === 0,
      };
    },
  },
  {
    id: 'instagram',
    name: 'Instagram',
    match(url) {
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return null;
      const m = url.pathname.match(/\/(?:p|reel|reels|tv)\/([\w-]+)/);
      return m ? { code: m[1] } : null;
    },
    async parse(ctx, helpers) {
      const canonical = 'https://www.instagram.com/p/' + ctx.code + '/';
      // Instagram answers every anonymous request with a login wall: measured on
      // /p/<code>/embed/captioned/ for empty, bogus and plausible codes alike --
      // identical ~186 KB pages, all carrying a login prompt and no media tags.
      // The upstream Python project reads it through gallery-dl plus cookies, which
      // this plugin has no equivalent of, so this platform degrades to link-only
      // rather than failing the whole reply.
      let title = "";
      let images = [];
      try {
        const page = await helpers.fetchText(canonical, { ua: DESKTOP_UA });
        const meta = metaTags(page.text);
        title = meta["og:title"] || "";
        images = unique(imageTags(page.text, meta).map((u) => absolute(u, page.finalUrl)));
      } catch { /* the link itself is still worth sending */ }
      return {
        platform: 'instagram',
        platformName: 'Instagram',
        kind: images.length > 1 ? 'gallery' : 'video',
        url: canonical,
        title: title.slice(0, 140),
        author: '',
        description: '',
        cover: images[0] ?? '',
        images: images.slice(1),
        meta: '',
        linkOnly: !title && images.length === 0,
      };
    },
  },
  {
    id: 'xiaoheihe',
    name: '小黑盒',
    match(url) {
      if (!/(^|\.)xiaoheihe\.cn$/i.test(url.hostname)) return null;
      const m = url.pathname.match(/\/(?:bbs\/)?(?:link|app|share)?\/?(\d{6,})/);
      return m ? { id: m[1] } : null;
    },
    async parse(ctx, helpers) {
      // 小黑盒 renders its share pages client-side and exposes no public metadata
      // endpoint, so whatever the static HTML carries is all there is. When that is
      // nothing the link is still returned, instead of an error the reader cannot act on.
      const target = 'https://www.xiaoheihe.cn' + helpers.pathname;
      let title = "";
      let description = "";
      let images = [];
      let finalUrl = target;
      try {
        const page = await helpers.fetchText(target, { ua: MOBILE_UA });
        finalUrl = page.finalUrl;
        const meta = metaTags(page.text);
        title = meta["og:title"] || meta.title || "";
        description = meta["og:description"] || meta.description || "";
        images = unique(imageTags(page.text, meta).map((u) => absolute(u, finalUrl)));
      } catch { /* link-only */ }
      return {
        platform: 'xiaoheihe',
        platformName: '小黑盒',
        kind: images.length > 1 ? 'gallery' : 'video',
        url: finalUrl,
        title: title.slice(0, 140),
        author: '',
        description: description.slice(0, 300),
        cover: images[0] ?? '',
        images: images.slice(1),
        meta: '',
        linkOnly: !title && images.length === 0,
      };
    },
  },
];

/** Every URL-looking token in a message, trimmed of trailing punctuation. */
export function extractLinks(text) {
  const found = String(text ?? '').match(/https?:\/\/[^\s<>"'）)】\]]+/gi) ?? [];
  return unique(found.map((raw) => raw.replace(/[.,;:!?。，；：！？]+$/, '')));
}

/** Find the parser that claims this URL, if any. */
export function findParser(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  for (const parser of PARSERS) {
    try {
      const ctx = parser.match(url);
      if (ctx) return { parser, ctx, url };
    } catch { /* a parser with a broken matcher must not stop the others */ }
  }
  return null;
}

/**
 * Parse one link.
 *
 * @returns the result object, or null when the link belongs to no known platform.
 * @throws  when a platform was recognised but its metadata could not be read.
 */
export async function parseLink(rawUrl, { timeoutMs = 20_000 } = {}) {
  const hit = findParser(rawUrl);
  if (!hit) return null;
  const url = new URL(rawUrl);
  const helpers = {
    host: url.host,
    pathname: url.pathname + url.search,
    fetchText: (target, options = {}) => fetchText(target, { timeoutMs, ...options }),
    fetchJson: (target, options = {}) => fetchJson(target, { timeoutMs, ...options }),
  };
  const result = await hit.parser.parse(hit.ctx, helpers);
  result.sourceUrl = rawUrl;
  return result;
}

/**
 * Render a parsed result into the messages that should be sent.
 *
 * A video becomes a caption plus its cover (never the file); a gallery becomes a
 * caption plus each image. The original URL is always last so the reader can
 * open the thing this came from.
 */
export function renderResult(result, { maxImages = 9 } = {}) {
  const url = result.url || result.sourceUrl || "";
  // A platform that could not be read still gets a useful message: the title if
  // there is one, and always the URL. Sending an empty caption would look broken.
  if (result.linkOnly) {
    const lines = ["【" + result.platformName + "】" + (result.title || "链接")];
    if (result.description) lines.push(result.description);
    lines.push(url);
    return { text: lines.join("\n"), images: [] };
  }
  const lines = [];
  lines.push("【" + result.platformName + "】" + (result.kind === "gallery" ? "图集" : "视频"));
  if (result.title) lines.push(result.title);
  const sub = [result.author, result.meta].filter(Boolean).join(" · ");
  if (sub) lines.push(sub);
  if (result.description) {
    const clipped = result.description.length > 120 ? result.description.slice(0, 120) + "…" : result.description;
    if (clipped !== result.title) lines.push(clipped);
  }
  lines.push(url);
  const images = unique([result.cover, ...(result.images ?? [])]).slice(0, Math.max(0, maxImages));
  return { text: lines.join("\n"), images };
}

export const SUPPORTED_PLATFORMS = PARSERS.map((p) => ({ id: p.id, name: p.name }));