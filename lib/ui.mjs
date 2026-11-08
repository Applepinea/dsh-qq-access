import { DEFAULT_INTERESTS } from './group-gate.mjs';
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
  reply: ['private', 'group', 'maxChars', 'contextMessages', 'linkParse', 'linkMaxImages', 'smartThreshold', 'selfNames', 'interests', 'learnInterests'],
  access: ['privateMode', 'groupMode', 'privateIds', 'groupIds', 'blockedUsers', 'blockedGroups'],
  napcat: ['mode', 'webuiPort', 'autoInstall', 'autoOpenLogin', 'maxRestarts'],
  poll: ['enabled', 'intervalMs', 'count'],
  rate: ['segmentMinMs', 'segmentMaxMs', 'segmentPerCharMs', 'globalGapMs', 'peerGapMs', 'maxPerMinute'],
  memes: ['enabled', 'maxEntries', 'autoCollect', 'autoCollectChance', 'requireApproval', 'visionClassify', 'autoSend', 'autoSendChance'],
  search: ['enabled', 'apiKey', 'timeoutMs'],
  life: ['enabled', 'inject', 'proactive', 'proactivePrivate', 'proactiveGroup', 'proactiveMaxPerDay', 'proactiveMinGapMinutes', 'proactiveTargets'],
  qzoneProactive: ['enabled', 'maxPerDay', 'dailyChance', 'timeTone', 'windowStart', 'windowEnd', 'minGapMinutes', 'topic', 'useLife', 'allowDetails'],
  emotion: ['enabled', 'perSession', 'useModel', 'provider', 'model', 'significanceThreshold', 'privacyLevel', 'inject', 'maxProfiles'],
  memory: ['enabled', 'halfLifeDays', 'recallLimit', 'factLimit', 'minScore', 'dailyQuota', 'useModel', 'inject'],
  root: ['ownerIds', 'persona', 'retentionDays', 'ownerHarnessTools', 'model', 'memes', 'life', 'qzoneProactive', 'emotion', 'memory'],
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
      // 群聊判定用的默认兴趣表，面板要能展示「实际生效的是什么」
      groupGate: { defaultInterests: DEFAULT_INTERESTS },
      access: raw.access ?? {},
      napcat: raw.napcat ?? {},
      poll: raw.poll ?? {},
      rate: raw.rate ?? {},
      ownerIds: raw.ownerIds ?? [],
      persona: raw.persona ?? '',
      // 0 是「永久保存」的哨兵值，必须原样回传给面板，不能回退成 30。
      retentionDays: raw.retentionDays ?? 30,
      ownerHarnessTools: raw.ownerHarnessTools === true,
      // Absent means "follow the Host default"; the panel renders that as a choice.
      model: raw.model ?? null,
      memes: raw.memes ?? {},
      search: raw.search ?? {},
      life: raw.life ?? {},
      qzoneProactive: raw.qzoneProactive ?? {},
      emotion: raw.emotion ?? {},
      memory: raw.memory ?? {},
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
    // Every section that has a whitelist is patchable. Deriving the list from
    // PATCHABLE means a section can never be silently left out of a save again.
    const sections = Object.keys(PATCHABLE).filter((key) => key !== 'root');
    for (const section of sections) {
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
      if (runtime.store) {
        runtime.store.retentionDays = normalized.retentionDays;
        // 从「永久」切回按天时，超期文件应立刻清掉，而不是等下一个 60s 周期。
        runtime.store.prune().catch(() => {});
      }
      const napcatChanged = normalized.napcat.mode !== runtime.config.napcat.mode
        || normalized.napcat.webuiPort !== runtime.config.napcat.webuiPort;
      hot = !napcatChanged;
      // Behavioural flags do not rewire the child process, so they can hot-apply.
      const intervalChanged = (runtime.config.poll?.intervalMs ?? 60_000) !== normalized.poll.intervalMs
        || (runtime.config.poll?.enabled !== false) !== normalized.poll.enabled;
      runtime.config.poll = normalized.poll;
      // 动态调度每次 tick 都重新读配置，直接替换即可即时生效。
      runtime.config.qzoneProactive = normalized.qzoneProactive;
      // 情感配置每次读取，直接替换即可；开关变化由 runtime 侧判断。
      runtime.config.emotion = normalized.emotion;
      runtime.config.memory = normalized.memory;
      // 分段间隔在每次发送时读取，直接替换即可即时生效。
      runtime.config.rate = normalized.rate;
      // The route is read when an agent is created, so a changed model must also
      // invalidate every cached agent -- otherwise the old model keeps answering.
      const routeChanged = JSON.stringify(normalized.route) !== JSON.stringify(runtime.config.route ?? {});
      runtime.config.route = normalized.route;
      // RateLimiter 在构造时拷贝了配额字段，热更新时一并刷新，否则改 globalGapMs 不生效。
      if (runtime.rate) Object.assign(runtime.rate, {
        globalGapMs: normalized.rate.globalGapMs,
        peerGapMs: normalized.rate.peerGapMs,
        maxPerMinute: normalized.rate.maxPerMinute,
      });
      if (intervalChanged && typeof runtime.armPollTimer === 'function') runtime.armPollTimer();
      if (routeChanged && typeof runtime.dropSessions === 'function') runtime.dropSessions();
      runtime.config.napcat.autoOpenLogin = normalized.napcat.autoOpenLogin;
      runtime.config.napcat.autoInstall = normalized.napcat.autoInstall;
      runtime.config.napcat.maxRestarts = normalized.napcat.maxRestarts;
    }

    return json(res, 200, { ok: true, hot, note: hot ? '已即时生效' : 'NapCat 相关改动需重载插件后生效' });
  });

  // Every model the Host can currently route, grouped by provider. The panel uses
  // this instead of a hard-coded list so a provider gaining or losing a model is
  // reflected without shipping a new plugin version.
  register(`${PREFIX}/models`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const llm = ctx.get?.('llm');
    if (!llm || typeof llm.listProviders !== 'function') {
      return json(res, 200, { ok: true, groups: [], failures: [], note: 'Host 未提供模型目录服务' });
    }
    const defaultSelection = (() => {
      try { return ctx.get?.('agentDefaultModel')?.currentSelection?.() ?? null; } catch { return null; }
    })();
    const groups = [];
    const failures = [];
    for (const provider of llm.listProviders()) {
      try {
        const models = await llm.listModels(provider.id);
        if (!models?.length) continue;
        groups.push({
          id: provider.id,
          name: provider.name ?? provider.id,
          models: models.map(m => ({ id: m.id, name: m.name ?? m.id, ...(m.description ? { description: m.description } : {}) })),
        });
      } catch (error) {
        failures.push({ id: provider.id, name: provider.name ?? provider.id, message: String(error?.message ?? error) });
      }
    }
    return json(res, 200, { ok: true, default: defaultSelection, groups, failures });
  });

  // ---- sticker library ---------------------------------------------------
  const memes = () => runtime.memes;

  // ---- virtual life ------------------------------------------------------
  register(`${PREFIX}/life`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const life = runtime.life;
    if (!life) return json(res, 200, { ok: true, enabled: false, snapshot: null });
    await life.init();
    return json(res, 200, { ok: true, enabled: true, snapshot: life.snapshot() });
  });

  // Conversations the user can turn proactive messaging on/off for. Built from the
  // archive so only chats that actually exist are offered.
  register(`${PREFIX}/life/targets`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const life = runtime.life;
    if (!life) return json(res, 200, { ok: true, enabled: false, conversations: [] });
    const raw = await loadRaw();
    const configured = new Map(
      (raw.life?.proactiveTargets ?? []).map((t) => [t.kind + ':' + t.peerId, t.enabled !== false]),
    );
    const conversations = (runtime.store?.conversations?.() ?? [])
      .filter((c) => c.kind === 'private' || c.kind === 'group')
      .map((c) => {
        const key = c.kind + ':' + c.peerId;
        return {
          kind: c.kind,
          peerId: String(c.peerId),
          lastAt: c.lastAt ?? null,
          // Only entries present in the saved list are targets at all.
          selected: configured.has(key),
          enabled: configured.get(key) === true,
        };
      })
      .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
      .slice(0, 200);
    return json(res, 200, { ok: true, enabled: true, conversations });
  });
  register(`${PREFIX}/life/action`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const life = runtime.life;
    if (!life) return json(res, 400, { ok: false, error: '虚拟人生未启用' });
    await life.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const action = String(body.action ?? '');
    try {
      if (action === 'generate') {
        if (!runtime.lifeGenerator) return json(res, 400, { ok: false, error: '生成器未启用' });
        // Generation calls a model and can take a while; the panel shows a spinner.
        const result = await runtime.lifeGenerator.generate({ force: body.force === true });
        return json(res, 200, result.ok ? { ...result, snapshot: life.snapshot() } : result);
      }
      if (action === 'clear') {
        const snapshot = await life.reset();
        return json(res, 200, { ok: true, snapshot });
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  // ---- 主动发动态 --------------------------------------------------------
  register(`${PREFIX}/qzone/proactive`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const state = runtime.qzoneProactive;
    if (!state) return json(res, 200, { ok: true, enabled: false, snapshot: null });
    await state.init();
    const cfg = runtime.config.qzoneProactive ?? {};
    return json(res, 200, {
      ok: true,
      enabled: cfg.enabled === true,
      config: cfg,
      qzoneEnabled: runtime.config.qzone?.enabled !== false,
      snapshot: state.snapshot(cfg),
    });
  });

  register(`${PREFIX}/qzone/action`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const state = runtime.qzoneProactive;
    if (!state) return json(res, 400, { ok: false, error: '动态调度未启用' });
    await state.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }

    const action = String(body.action ?? '');
    try {
      if (action === 'post') {
        if (runtime.config.qzone?.enabled === false) {
          return json(res, 400, { ok: false, error: 'QQ 空间功能未启用' });
        }
        if (state.pending) {
          return json(res, 409, { ok: false, error: '还有一条待确认的动态，请先等它完成或清空' });
        }
        const cfg = runtime.config.qzoneProactive ?? {};
        const text = String(body.text ?? '').trim() || await runtime.composeQzoneForPanel(cfg);
        if (!text) return json(res, 400, { ok: false, error: '生成内容为空，请重试或手动填写' });
        await state.setPending({ slotId: 'manual-' + Date.now(), text });
        await runtime.finishQzonePendingForPanel(state.pending);
        const after = state.snapshot(cfg);
        const latest = after.history[0] ?? null;
        return json(res, 200, {
          ok: true,
          status: latest?.status ?? 'unknown',
          tid: latest?.tid ?? '',
          text,
          snapshot: after,
        });
      }
      if (action === 'clear') {
        const snapshot = await state.reset();
        return json(res, 200, { ok: true, snapshot });
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  // ---- 情感与关系 --------------------------------------------------------
  register(`${PREFIX}/emotion`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const store = runtime.emotion;
    if (!store) return json(res, 200, { ok: true, enabled: false, profiles: [], stats: null });
    await store.init();
    const cfg = runtime.config.emotion ?? {};
    return json(res, 200, {
      ok: true,
      enabled: cfg.enabled === true,
      config: cfg,
      stats: store.stats(),
      profiles: store.list({ limit: cfg.maxProfiles ?? 50 }),
    });
  });

  register(`${PREFIX}/emotion/action`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const store = runtime.emotion;
    if (!store) return json(res, 400, { ok: false, error: '情感系统未启用' });
    await store.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const action = String(body.action ?? '');
    const peerId = String(body.peerId ?? '').trim();
    try {
      if (action === 'reset') {
        if (!peerId) return json(res, 400, { ok: false, error: '缺少 peerId' });
        const key = store.keyFor({ peerId, kind: 'private' });
        const { state, stage } = await store.reset(key);
        return json(res, 200, { ok: true, favor: state.favor, intimacy: state.intimacy, stage: stage.stageName });
      }
      if (action === 'set') {
        if (!peerId) return json(res, 400, { ok: false, error: '缺少 peerId' });
        const patch = {};
        if (body.favor !== undefined) patch.favor = Math.round(Math.min(100, Math.max(-100, Number(body.favor) || 0)));
        if (body.intimacy !== undefined) patch.intimacy = Math.round(Math.min(100, Math.max(0, Number(body.intimacy) || 0)));
        if (body.attitude !== undefined) patch.attitude = String(body.attitude).slice(0, 40);
        if (body.relationship !== undefined) patch.relationship = String(body.relationship).slice(0, 60);
        if (!Object.keys(patch).length) return json(res, 400, { ok: false, error: '没有要修改的字段' });
        const key = store.keyFor({ peerId, kind: 'private' });
        const { state, stage } = await store.set(key, patch);
        return json(res, 200, { ok: true, favor: state.favor, intimacy: state.intimacy, stage: stage.stageName });
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  // ---- 长期记忆 ----------------------------------------------------------
  register(`${PREFIX}/memory`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const store = runtime.memory;
    if (!store) return json(res, 200, { ok: true, enabled: false, people: [] });
    await store.init();
    const cfg = runtime.config.memory ?? {};
    return json(res, 200, {
      ok: true,
      enabled: cfg.enabled === true,
      config: cfg,
      ...store.snapshot({ limit: 100 }),
    });
  });

  register(`${PREFIX}/memory/action`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const store = runtime.memory;
    if (!store) return json(res, 400, { ok: false, error: '长期记忆未启用' });
    await store.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const action = String(body.action ?? '');
    const personId = String(body.personId ?? '').trim();
    try {
      if (action === 'forget') {
        if (!personId || !body.memoryId) return json(res, 400, { ok: false, error: '缺少 personId 或 memoryId' });
        const ok = await store.forget(personId, String(body.memoryId));
        return json(res, 200, { ok, deleted: ok });
      }
      if (action === 'add') {
        if (!personId || !body.text) return json(res, 400, { ok: false, error: '缺少 personId 或 text' });
        const result = await store.remember(personId, {
          text: String(body.text).slice(0, 400),
          kind: body.kind === 'fact' ? 'fact' : 'event',
          importance: Number(body.importance) || 1,
          factKey: String(body.factKey ?? '').slice(0, 40),
        });
        return json(res, 200, { ok: Boolean(result), id: result?.entry?.id ?? '' });
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  register(`${PREFIX}/memes`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const lib = memes();
    if (!lib) return json(res, 200, { ok: true, enabled: false, stats: null, entries: [], pending: [] });
    await lib.init();
    const url = new URL(req.url, 'http://127.0.0.1');
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 120));
    const pick = (e) => ({
      id: e.id, width: e.width, height: e.height, mediaType: e.mediaType,
      description: e.description ?? '', tags: e.tags ?? [], emotions: e.emotions ?? [],
      note: e.note ?? '', source: e.source ?? '', uses: e.uses ?? 0,
      classified: Boolean(e.classifiedAt), addedAt: e.addedAt,
    });
    return json(res, 200, {
      ok: true,
      enabled: true,
      stats: lib.stats(),
      entries: lib.entries.slice(-limit).reverse().map(pick),
      pending: lib.pending.slice(-limit).reverse().map(pick),
    });
  });

  register(`${PREFIX}/memes/action`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const lib = memes();
    if (!lib) return json(res, 400, { ok: false, error: '表情包图库未启用' });
    await lib.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const action = String(body.action ?? '');
    try {
      if (action === 'approve') return json(res, 200, await lib.approve(String(body.id ?? '')));
      if (action === 'reject') return json(res, 200, await lib.reject(String(body.id ?? '')));
      if (action === 'remove') return json(res, 200, await lib.remove(String(body.id ?? '')));
      if (action === 'import') return json(res, 200, await lib.importFolder(String(body.folder ?? ''), { note: String(body.note ?? '') }));
      if (action === 'classify') {
        if (!runtime.classifier) return json(res, 400, { ok: false, error: '分类器未启用' });
        return json(res, 200, await runtime.classifier.runOnce({ max: Math.min(40, Math.max(1, Number(body.max) || 8)) }));
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  // One image, so the panel can show what is in the library without base64 blobs
  // inside the JSON listing.
  register(`${PREFIX}/memes/image`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const lib = memes();
    if (!lib) return json(res, 404, { ok: false, error: '表情包图库未启用' });
    await lib.init();
    const url = new URL(req.url, 'http://127.0.0.1');
    const id = String(url.searchParams.get('id') ?? '');
    const pending = url.searchParams.get('pending') === '1';
    const entry = (pending ? lib.pending : lib.entries).find((e) => e.id === id);
    if (!entry) return json(res, 404, { ok: false, error: '找不到这张图' });
    try {
      const bytes = await lib.bytesOf(entry, { pending });
      res.writeHead(200, { 'Content-Type': entry.mediaType, 'Cache-Control': 'max-age=3600' });
      res.end(bytes);
    } catch (error) {
      return json(res, 404, { ok: false, error: String(error?.message ?? error) });
    }
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
