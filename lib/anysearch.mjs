/**
 * Anysearch: realtime web search over the Anysearch MCP endpoint.
 *
 * The upstream AstrBot plugin is ~200 lines of Python around one JSON-RPC call;
 * this is the same idea in Node, plus the guard the upstream README warns about
 * (no localhost, no private ranges) enforced locally rather than trusted to the
 * remote.
 *
 * Works anonymously. An API key raises the quota, not the capability, so the key
 * is optional everywhere and never required to boot.
 */

const ENDPOINT = 'https://api.anysearch.com/mcp';

/** Raised for a transport, JSON-RPC or upstream error. */
export class AnySearchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AnySearchError';
  }
}

/**
 * Whether a URL is safe to hand to a third-party fetcher.
 *
 * The upstream plugin documents this as the caller's responsibility and this is
 * that check: only http(s), and only hosts that are not the local machine, a
 * private network, link-local, multicast or the unspecified address. Hostnames are
 * resolved by the remote service, so a literal check is what can be done here --
 * enough to stop the obvious SSRF attempts (`http://127.0.0.1`, `http://10.0.0.1`,
 * `http://[::1]`), which is what the warning is about.
 */
export function isPublicHttpUrl(raw) {
  let url;
  try { url = new URL(String(raw ?? '').trim()); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host === '::1' || host === '::') return false;
  // IPv4 literal: reject loopback, private, link-local, CGNAT, multicast, reserved.
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  // IPv6 literal: unique-local (fc00::/7) and link-local (fe80::/10).
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return false;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return false;
  return true;
}

/** Pull the readable text out of an MCP tool result. */
export function resultText(payload) {
  const content = payload?.result?.content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((item) => item && item.type === 'text')
      .map((item) => String(item.text ?? ''));
    if (texts.length) return texts.join('\n');
  }
  return JSON.stringify(payload?.result ?? payload, null, 2);
}

export class AnySearchClient {
  constructor({ apiKey = '', timeoutMs = 30_000, logger = console } = {}) {
    this.apiKey = String(apiKey ?? '').trim();
    this.timeoutMs = timeoutMs;
    this.logger = logger;
  }

  /** One JSON-RPC `tools/call`, with the error shapes the endpoint actually uses. */
  async #call(toolName, args) {
    const headers = { 'content-type': 'application/json', accept: 'application/json' };
    // The key is a quota upgrade, not a requirement: anonymous calls work.
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const kind = error?.name === 'TimeoutError' ? '请求超时' : '连接失败';
      throw new AnySearchError(`Anysearch ${kind}：${error?.message ?? error}`);
    }
    const text = await response.text();
    if (!response.ok) throw new AnySearchError(`Anysearch HTTP ${response.status}：${text.slice(0, 300)}`);
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new AnySearchError(`Anysearch 返回了非 JSON：${text.slice(0, 300)}`); }
    if (payload.error) {
      const message = typeof payload.error === 'object'
        ? payload.error.message ?? JSON.stringify(payload.error)
        : String(payload.error);
      throw new AnySearchError(`Anysearch 接口错误：${message}`);
    }
    return resultText(payload);
  }

  /** General realtime search. */
  search(query, { maxResults, freshness, contentTypes } = {}) {
    const args = { query: String(query ?? '').trim() };
    if (!args.query) throw new AnySearchError('搜索关键词为空');
    if (Number.isFinite(maxResults)) args.max_results = Math.min(20, Math.max(1, Math.trunc(maxResults)));
    if (freshness) args.freshness = String(freshness);
    if (Array.isArray(contentTypes) && contentTypes.length) args.content_types = contentTypes.map(String);
    return this.#call('search', args);
  }

  /** Run 1..5 independent searches in one round trip. */
  batchSearch(queries) {
    const list = (Array.isArray(queries) ? queries : [])
      .map((q) => (typeof q === 'string' ? { query: q } : q))
      .filter((q) => q && String(q.query ?? '').trim())
      .slice(0, 5)
      .map((q) => ({ ...q, query: String(q.query).trim() }));
    if (!list.length) throw new AnySearchError('批量搜索需要至少一个关键词');
    return this.#call('batch_search', { queries: list });
  }

  /** Fetch one public page as readable text. */
  extract(url) {
    const target = String(url ?? '').trim();
    if (!isPublicHttpUrl(target)) {
      throw new AnySearchError('只允许提取公网 http/https 页面（拒绝本机、内网、链路本地与保留地址）');
    }
    return this.#call('extract', { url: target });
  }
}