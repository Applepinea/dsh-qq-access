import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { normalizeConfig } from './config.mjs';
import { openLoginBrowser } from './napcat.mjs';

const webuiUrl = raw => {
  const port = raw?.napcat?.webuiPort ?? 6800;
  const token = raw?.napcat?.webuiToken ?? '';
  return `http://127.0.0.1:${port}/webui${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

const PREFIX = '/dsh-qq/api';

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function isLoopback(req) {
  const host = String(req.headers?.host ?? '').toLowerCase();
  const h = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]' || h === '::1';
}

function trusted(req) {
  if (isLoopback(req)) return true;
  const origin = String(req.headers?.origin ?? '');
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch { return false; }
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 64 * 1024) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const PATCHABLE = {
  reply: ['private', 'group', 'maxChars', 'contextMessages'],
  access: ['privateMode', 'groupMode', 'privateIds', 'groupIds', 'blockedUsers', 'blockedGroups'],
  napcat: ['mode', 'webuiPort', 'autoInstall', 'autoOpenLogin', 'maxRestarts'],
  poll: ['enabled', 'intervalMs', 'count'],
  root: ['ownerIds', 'persona', 'retentionDays', 'ownerHarnessTools'],
};

function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

function publicState(runtime, raw) {
  const napcatStatus = runtime?.napcat?.publicStatus?.() ?? null;
  return {
    ok: true,
    selfId: raw.selfId,
    connected: Boolean(runtime?.connected),
    liveSessions: runtime?.sessions?.size ?? 0,
    configPath: runtime?.config?.configPath,
    config: {
      reply: raw.reply ?? {},
      access: raw.access ?? {},
      napcat: raw.napcat ?? {},
      poll: raw.poll ?? {},
      ownerIds: raw.ownerIds ?? [],
      persona: raw.persona ?? '',
      retentionDays: raw.retentionDays ?? 30,
      ownerHarnessTools: raw.ownerHarnessTools === true,
    },
    napcat: napcatStatus,
    loginPage: webuiUrl(raw),
  };
}

export function registerUi(ctx, runtime, configPath) {
  const webServer = ctx.get?.('webServer') ?? ctx.webServer;
  if (!webServer || typeof webServer.register !== 'function') return () => {};
  const disposers = [];

  const register = (path, handler) => {
    disposers.push(webServer.register({
      kind: 'exact',
      path,
      handler: async (req, res) => {
        try { await handler(req, res); }
        catch (error) { try { json(res, 500, { ok: false, error: String(error?.message ?? error) }); } catch {} }
      },
    }));
  };

  const loadRaw = async () => JSON.parse(await readFile(configPath, 'utf8'));

  register(`${PREFIX}/state`, async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const raw = await loadRaw();
    raw.__path = configPath;
    return json(res, 200, publicState(runtime, raw));
  });

  register(`${PREFIX}/config`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const body = JSON.parse((await readBody(req)) || '{}');
    const patch = body.patch ?? body;
    const raw = await loadRaw();

    for (const key of PATCHABLE.root) if (key in patch) raw[key] = patch[key];
    for (const section of ['reply', 'access', 'napcat', 'poll']) {
      const incoming = pick(patch[section], PATCHABLE[section]);
      if (Object.keys(incoming).length) raw[section] = { ...(raw[section] ?? {}), ...incoming };
    }
    if (Array.isArray(raw.ownerIds)) raw.ownerIds = raw.ownerIds.map(String);
    if (raw.access) {
      for (const key of ['privateIds', 'groupIds', 'blockedUsers', 'blockedGroups']) {
        if (Array.isArray(raw.access[key])) raw.access[key] = raw.access[key].map(String);
      }
    }

    let normalized;
    try { normalized = normalizeConfig(raw, configPath); }
    catch (error) { return json(res, 400, { ok: false, error: error.message }); }

    const { __path, ...persisted } = raw;
    await writeFile(configPath, JSON.stringify(persisted, null, 2) + '\n');

    // Hot-apply the parts the running runtime reads per message; NapCat wiring needs a reload.
    let hot = true;
    if (runtime?.config) {
      runtime.config.reply = normalized.reply;
      runtime.config.access = normalized.access;
      runtime.config.persona = normalized.persona;
      runtime.config.ownerIds = normalized.ownerIds;
      runtime.config.retentionDays = normalized.retentionDays;
      if (runtime.store) runtime.store.retentionDays = normalized.retentionDays;
      const napcatChanged = normalized.napcat.mode !== runtime.config.napcat.mode
        || normalized.napcat.webuiPort !== runtime.config.napcat.webuiPort;
      hot = !napcatChanged;
      // Behavioural flags do not rewire the child process, so they can hot-apply.
      const intervalChanged = (runtime.config.poll?.intervalMs ?? 60_000) !== normalized.poll.intervalMs
        || (runtime.config.poll?.enabled !== false) !== normalized.poll.enabled;
      runtime.config.poll = normalized.poll;
      if (intervalChanged && typeof runtime.armPollTimer === 'function') runtime.armPollTimer();
      runtime.config.napcat.autoOpenLogin = normalized.napcat.autoOpenLogin;
      runtime.config.napcat.autoInstall = normalized.napcat.autoInstall;
      runtime.config.napcat.maxRestarts = normalized.napcat.maxRestarts;
    }

    return json(res, 200, { ok: true, hot, note: hot ? '已即时生效' : 'NapCat 相关改动需重载插件后生效' });
  });

  register(`${PREFIX}/napcat/open`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const raw = await loadRaw();
    const port = raw.napcat?.webuiPort ?? 6800;
    let opened = false;
    try { await openLoginBrowser({ napcat: { webuiPort: port } }); opened = true; }
    catch { opened = false; }
    return json(res, 200, { ok: true, url: webuiUrl(raw), opened });
  });

  register(`${PREFIX}/roster`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const cm = ctx.get?.('clientModules');
    if (!cm) return json(res, 200, { ok: false, error: 'clientModules service unavailable' });
    let graph = null;
    try { graph = cm.graph?.() ?? null; } catch (error) { graph = { error: String(error?.message ?? error) }; }
    let path = null;
    try { path = cm.clientPath?.('dsh-qq-access') ?? null; } catch (error) { path = { error: String(error?.message ?? error) }; }
    const rows = Array.isArray(graph) ? graph.filter((row) => JSON.stringify(row).includes('qq-access')) : null;
    return json(res, 200, {
      ok: true,
      clientPath: path,
      graphType: Array.isArray(graph) ? 'array' : typeof graph,
      graphSize: Array.isArray(graph) ? graph.length : null,
      qqAccessRows: rows,
    });
  });

  register(`${PREFIX}/ping`, async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    try {
      await appendFile('C:/Users/csa/.dsh-qq-access/debug.log', new Date().toISOString() + ' client ' + JSON.stringify(Object.fromEntries(url.searchParams)) + '\n');
    } catch {}
    return json(res, 200, { ok: true });
  });

  register(`${PREFIX}/reload-hint`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    return json(res, 200, { ok: true, hint: 'NapCat 模式/端口、人格与范围之外的持久化项，重载插件后生效' });
  });

  return () => { for (const dispose of disposers) { try { dispose?.(); } catch {} } };
}
