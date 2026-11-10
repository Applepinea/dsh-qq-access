import { DEFAULT_INTERESTS } from './group-gate.mjs';
import { readFile, rename, open, copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bootstrapConfig, normalizeConfig } from './config.mjs';

const webuiUrl = raw => {
  const port = raw?.napcat?.webuiPort ?? 6800;
  const token = raw?.napcat?.webuiToken ?? '';
  return `http://127.0.0.1:${port}/webui${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};


/**
 * 原子地写配置文件，并保留上一份备份。
 *
 * 直接 writeFile 有个致命弱点：断电或硬复位时，文件系统可能只把
 * 「文件长度」这类元数据落盘，数据块还在缓存里 —— 恢复后得到的是一个
 * 长度正常、内容全是 0x00 的文件。2026-11-10 那次 DSH 启动崩溃就是这么来的
 * （profile 下三个配置文件全变 0），不是程序写坏，是断电。
 *
 * 这里做三件事：
 *   1. 写到 .tmp，fsync 之后才 rename —— 数据真正落盘后才替换原文件，
 *      中途断电最多丢掉新内容，旧文件仍然完整。
 *   2. 替换前把旧文件复制成 .bak —— 万一新内容有问题还能回退。
 *   3. 写完再 fsync 一次目录项（Windows 上 rename 已经足够原子）。
 */
async function atomicWriteJson(path, text) {
  const tmp = path + '.tmp';
  const bak = path + '.bak';

  // 先备份现有文件（不存在就跳过）。
  try { await copyFile(path, bak); } catch (error) {
    // 首次创建时没有旧文件，ENOENT 属于正常。其它错误（文件被占用等）以前被
    // 一起吞掉，结果是一次没有备份的写入被当成成功。
    if (error?.code !== 'ENOENT') console.warn?.(`[dsh-qq-access] 备份 ${bak} 失败：${error?.code ?? error}`);
  }

  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(text, 'utf8');
    // fsync 把数据从 OS 缓存刷到磁盘。跳过这一步等于白写临时文件。
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, path);
}
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
  reply: ['private', 'group', 'maxChars', 'contextMessages', 'linkParse', 'linkMaxImages', 'smartThreshold', 'selfNames', 'interests', 'learnInterests', 'idleMs', 'maxLiveSessions'],
  access: ['privateMode', 'groupMode', 'privateIds', 'groupIds', 'blockedUsers', 'blockedGroups'],
  napcat: ['mode', 'webuiPort', 'autoInstall', 'autoOpenLogin', 'maxRestarts'],
  poll: ['enabled', 'intervalMs', 'count'],
  rate: ['segmentMinMs', 'segmentMaxMs', 'segmentPerCharMs', 'globalGapMs', 'peerGapMs', 'maxPerMinute'],
  memes: ['enabled', 'maxEntries', 'autoCollect', 'autoCollectChance', 'requireApproval', 'visionClassify', 'autoSend', 'autoSendChance'],
  search: ['enabled', 'apiKey', 'timeoutMs'],
  life: ['enabled', 'inject', 'proactive', 'proactivePrivate', 'proactiveGroup', 'proactiveMaxPerDay', 'proactiveSpread', 'proactiveMinGapMinutes', 'proactiveJitterMinutes', 'proactiveGraceMinutes', 'proactiveHint', 'proactiveTargets'],
  weather: ['enabled', 'apiHost', 'apiKey', 'latitude', 'longitude', 'city', 'timeoutMs'],
  qzoneProactive: ['enabled', 'maxPerDay', 'dailyChance', 'timeTone', 'windowStart', 'windowEnd', 'minGapMinutes', 'topic', 'useLife', 'allowDetails'],
  emotion: ['enabled', 'perSession', 'useModel', 'provider', 'model', 'significanceThreshold', 'privacyLevel', 'inject', 'maxProfiles'],
  memory: ['enabled', 'halfLifeDays', 'recallLimit', 'factLimit', 'minScore', 'dailyQuota', 'useModel', 'inject'],
  // root 只放「没有独立分段」的散字段。曾经这里也列了 weather/life/memes 等，
  // 但那些字段本来就有自己的分段；两边都登记会让 root 先做一次整体替换，
  // 把分段里没有的键（比如 weather.apiKey）直接抹掉。
  root: ['ownerIds', 'persona', 'retentionDays', 'ownerHarnessTools', 'model'],
};

function pick(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) if (key in source) out[key] = source[key];
  return out;
}

/**
 * 把密钥换成「是否已保存」的标记，绝不把明文发给浏览器。
 *
 * 面板需要知道「有没有存过 key」，否则用户看不出自己填的到底保存没保存；
 * 但它不需要知道 key 是什么。之前这里直接把 raw.weather 整个回传，
 * 明文 apiKey 会出现在 /state 的响应里，任何能读这个接口的人都拿得到。
 */
function maskSecret(section, field = 'apiKey') {
  if (!section || typeof section !== 'object') return {};
  const { [field]: secret, ...rest } = section;
  const flag = 'has' + field.charAt(0).toUpperCase() + field.slice(1);
  return { ...rest, [flag]: Boolean(String(secret ?? '').trim()) };
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
      // webuiToken 是 NapCat WebUI 的访问票据，和 apiKey 同级。
      // loginPage 那条链接里带了它（用户点开就要能免输），但配置段不该再回传一份明文。
      napcat: maskSecret(raw.napcat, 'webuiToken'),
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
      search: maskSecret(raw.search),
      weather: maskSecret(raw.weather),
      life: raw.life ?? {},
      qzoneProactive: raw.qzoneProactive ?? {},
      emotion: raw.emotion ?? {},
      memory: raw.memory ?? {},
    },
    // 主动消息的运行状态。面板要能直接看到「今天发了几次、还剩几次、下次窗口几点」，
    // 否则只能翻 debug.log 猜她为什么没主动说话。
    proactive: runtime?.proactiveSnapshot?.() ?? { enabled: false },
    poll: runtime ? {
      enabled: runtime.config?.poll?.enabled !== false,
      intervalMs: runtime.config?.poll?.intervalMs ?? null,
      runs: runtime.pollRuns ?? 0,
      lastPollAt: runtime.lastPollAt ?? null,
    } : null,
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

  /**
   * 读配置；文件还不存在时返回一份模板并标记 missing。
   *
   * 首次安装就是这个状态：插件被装上了，但用户还没跑过 setup。
   * 以前 apply() 会因此直接抛异常，宿主跳过整个 bundle，面板根本不出现 ——
   * 新用户只能看到一行 stderr，连该填什么都不知道。
   * 现在面板照常挂上，只是渲染成「生成配置」的引导页。
   */
  const exists = async (path) => {
    try { await stat(path); return true; } catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
  };
  const loadRawOrTemplate = async () => {
    try { return { raw: await loadRaw(), missing: false }; }
    catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      return { raw: bootstrapConfig({ selfId: '' }), missing: true };
    }
  };

  register(`${PREFIX}/state`, async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const { raw, missing } = await loadRawOrTemplate();
    raw.__path = configPath;
    const state = publicState(runtime, raw);
    // runtimeReady 是面板判断「要不要提示重载」的唯一依据：
    // runtime 为 null 说明插件只是挂了面板，QQ 接入并没有在跑。
    return json(res, 200, {
      ...state,
      // 缺配置时给不出真链接：模板里的 webuiToken 是临时生成的，扫了也没用。
      loginPage: missing ? null : state.loginPage,
      missingConfig: missing,
      runtimeReady: Boolean(runtime),
      configPath,
    });
  });

  // 首次配置：只问两个 QQ 号，token / secret / 端口全部由服务端随机生成。
  // 面板里不让用户手写密钥 —— 新用户根本没有这些值，让他填等于劝退。
  register(`${PREFIX}/bootstrap`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const selfId = String(body.selfId ?? '').trim();
    const owners = (Array.isArray(body.ownerIds) ? body.ownerIds : [body.ownerId])
      .map((value) => String(value ?? '').trim()).filter(Boolean);
    const template = bootstrapConfig({ selfId, ownerIds: owners });
    // 先用 normalizeConfig 过一遍：非法号码在这里就报错，而不是写进磁盘等着插件起不来。
    try { normalizeConfig(template, configPath); }
    catch (error) { return json(res, 400, { ok: false, error: error.message }); }
    // 已经存在就别覆盖：可能是两个标签页都打开了首次配置那一屏。
    if (await exists(configPath)) {
      return json(res, 409, { ok: false, error: '配置已经存在了：' + configPath + '。刷新面板即可。', missingConfig: false });
    }
    try {
      await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
      await atomicWriteJson(configPath, JSON.stringify(template, null, 2) + '\n');
    } catch (error) {
      return json(res, 500, { ok: false, error: '写入配置失败：' + String(error?.message ?? error) });
    }
    return json(res, 200, { ok: true, configPath, napcatMode: template.napcat.mode });
  });

  register(`${PREFIX}/config`, async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const body = JSON.parse((await readBody(req)) || '{}');
    const patch = body.patch ?? body;
    // 还没有配置文件时，保存只能走 /bootstrap：面板里根本没有 selfId 输入框，
    // 拿一份 selfId 为空的模板去过 normalizeConfig 只会得到一句「登录 QQ 号必须是 5–12 位数字」。
    const loaded = await loadRawOrTemplate();
    if (loaded.missing) {
      return json(res, 409, { ok: false, error: '还没有配置文件。请先在页面顶部填写登录 QQ 号，点「生成配置」。', missingConfig: true });
    }
    const raw = loaded.raw;
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
    await atomicWriteJson(configPath, JSON.stringify(persisted, null, 2) + '\n');

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
      // 虚拟人生 / 主动消息：tickProactive 每次 tick 都重新读 runtime.config.life，
      // 直接替换即可即时生效。之前漏了这一行，面板改完写进了磁盘，
      // 但运行中的实例还拿着旧对象，开关和上限都要重启才生效。
      runtime.config.life = normalized.life;
      // 表情包：runtime 每次收到图片都重新读 this.config.memes，
      // 直接替换即可。autoSend / autoCollect 这类开关不必重启。
      runtime.config.memes = normalized.memes;
      // 搜索：AnySearchClient 在构造时拷贝了 apiKey/timeoutMs，
      // 光换 config 不够，得同时写回实例字段，否则改了 key 仍然用旧的。
      runtime.config.search = normalized.search;
      if (runtime.search) {
        runtime.search.apiKey = String(normalized.search?.apiKey ?? '').trim();
        runtime.search.timeoutMs = normalized.search.timeoutMs;
      }
      // 天气：和搜索同理，WeatherClient 在构造时拷了 host/key/经纬度，
      // 光换 config 不够，得写回实例，否则改完 key 还在用旧的。
      runtime.config.weather = normalized.weather;
      if (runtime.weather) {
        runtime.weather.apiHost = String(normalized.weather?.apiHost ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        runtime.weather.apiKey = String(normalized.weather?.apiKey ?? '').trim();
        runtime.weather.latitude = normalized.weather?.latitude;
        runtime.weather.longitude = normalized.weather?.longitude;
        runtime.weather.timeoutMs = normalized.weather?.timeoutMs;
      }
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
  const memes = () => runtime?.memes;

  // ---- virtual life ------------------------------------------------------
  register(`${PREFIX}/life`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const life = runtime?.life;
    if (!life) return json(res, 200, { ok: true, enabled: false, snapshot: null });
    await life.init();
    return json(res, 200, { ok: true, enabled: true, snapshot: life.snapshot() });
  });

  // Conversations the user can turn proactive messaging on/off for. Built from the
  // archive so only chats that actually exist are offered.
  register(`${PREFIX}/life/targets`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    // POST 保存勾选结果；GET 返回可选项。之前只有 GET，勾选只改浏览器内存，
    // 重启就全丢，用户会以为「设置又失效了」。
    if (req.method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(req)) || '{}'); }
      catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
      const list = Array.isArray(body.targets) ? body.targets : null;
      if (!list) return json(res, 400, { ok: false, error: 'targets 必须是数组' });
      const clean = list.map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const kind = entry.kind === 'group' ? 'group' : entry.kind === 'private' ? 'private' : '';
        const peerId = String(entry.peerId ?? '').trim();
        if (!kind || !/^\d{5,12}$/.test(peerId)) return null;
        return { kind, peerId, enabled: entry.enabled !== false };
      }).filter(Boolean).slice(0, 200);
      const { raw } = await loadRawOrTemplate();
      raw.life = { ...(raw.life ?? {}), proactiveTargets: clean };
      const { __path, ...persisted } = raw;
    await atomicWriteJson(configPath, JSON.stringify(persisted, null, 2) + '\n');
      // 运行中的实例立刻用上新列表，不必重启。
      if (runtime?.config?.life) runtime.config.life.proactiveTargets = clean;
      return json(res, 200, { ok: true, saved: clean.length });
    }
    const life = runtime?.life;
    if (!life) return json(res, 200, { ok: true, enabled: false, conversations: [] });
    const { raw } = await loadRawOrTemplate();
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
    const life = runtime?.life;
    if (!life) return json(res, 400, { ok: false, error: '虚拟人生未启用' });
    await life.init();
    let body;
    try { body = JSON.parse((await readBody(req)) || '{}'); }
    catch { return json(res, 400, { ok: false, error: '请求体不是合法 JSON' }); }
    const action = String(body.action ?? '');
    try {
      if (action === 'generate') {
        if (!runtime?.lifeGenerator) return json(res, 400, { ok: false, error: '生成器未启用' });
        // Generation calls a model and can take a while; the panel shows a spinner.
        const result = await runtime.lifeGenerator.generate({ force: body.force === true });
        return json(res, 200, result.ok ? { ...result, snapshot: life.snapshot() } : result);
      }
      if (action === 'clear') {
        const snapshot = await life.reset();
        return json(res, 200, { ok: true, snapshot });
      }
      // 改完上限/离散度/间隔之后，今天的窗口还是按旧参数算的。
      // 这个操作清掉「已触发」记录，让窗口按当前参数重算，不用等到明天。
      if (action === 'reset-today') {
        const result = await life.resetToday();
        return json(res, 200, { ok: true, ...result, proactive: runtime.proactiveSnapshot?.() ?? null });
      }
      // 手动触发一次主动消息，用来验证「开关打开后到底会不会发」。
      // 平时它只由 60 秒轮询驱动，出问题时无法复现，只能等到下一个窗口。
      if (action === 'test-proactive') {
        if (runtime.config.life?.proactive !== true) {
          return json(res, 400, { ok: false, error: '主动消息没开启（life.proactive 不是 true）' });
        }
        if (!runtime.connected) {
          return json(res, 400, { ok: false, error: 'QQ 未连接，先看 qq_status' });
        }
        const before = { sentToday: life.sentCount(new Date()), lastSentAt: life.lastSentAt() };
        const result = await runtime.triggerProactiveForTest();
        const after = { sentToday: life.sentCount(new Date()), lastSentAt: life.lastSentAt() };
        return json(res, 200, { ok: result.ok !== false, ...result, before, after });
      }
      return json(res, 400, { ok: false, error: '未知操作：' + action });
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) });
    }
  });

  // ---- 主动发动态 --------------------------------------------------------
  register(`${PREFIX}/qzone/proactive`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const state = runtime?.qzoneProactive;
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
    const state = runtime?.qzoneProactive;
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
    const store = runtime?.emotion;
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
    const store = runtime?.emotion;
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
    const store = runtime?.memory;
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
    const store = runtime?.memory;
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
        if (!runtime?.classifier) return json(res, 400, { ok: false, error: '分类器未启用' });
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
    const { raw } = await loadRawOrTemplate();
    const port = raw.napcat?.webuiPort ?? 6800;
    let opened = false;
    try { const { openLoginBrowser } = await import('./napcat.mjs'); await openLoginBrowser({ napcat: { webuiPort: port } }); opened = true; }
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

  // 某一个模型支持哪些推理档位。和 /models 分开是因为它要对每个模型问一次
  // resolveModelInfo；面板只看用户当前选中的那一组，没必要一次问完 38 个。
  register(`${PREFIX}/model-reasoning`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    const url = new URL(req.url, 'http://127.0.0.1');
    const provider = String(url.searchParams.get('provider') ?? '').trim();
    const model = String(url.searchParams.get('model') ?? '').trim();
    const empty = { ok: true, efforts: [], defaultEffort: null };
    if (!provider || !model) return json(res, 200, empty);
    const llm = ctx.get?.('llm');
    if (!llm || typeof llm.resolveModelInfo !== 'function') {
      return json(res, 200, { ...empty, note: 'Host 未提供模型详情服务' });
    }
    try {
      const info = await llm.resolveModelInfo(provider, model);
      const reasoning = info?.reasoning;
      // 没有 reasoning 段就是这个模型根本不给调，面板要能说出这一点，
      // 而不是显示一个空下拉框让人以为加载失败。
      if (!reasoning) return json(res, 200, { ...empty, supported: false });
      return json(res, 200, {
        ok: true,
        supported: true,
        efforts: (reasoning.efforts ?? []).map((effort) => ({
          id: String(effort.id),
          name: effort.name ?? String(effort.id),
          ...(effort.description ? { description: effort.description } : {}),
        })),
        defaultEffort: reasoning.defaultEffort === undefined || reasoning.defaultEffort === null
          ? null
          : String(reasoning.defaultEffort),
      });
    } catch (error) {
      return json(res, 200, { ...empty, ok: false, error: String(error?.message ?? error) });
    }
  });

  register(`${PREFIX}/reload-hint`, async (req, res) => {
    if (!trusted(req)) return json(res, 403, { ok: false, error: '不受信任的访问来源' });
    return json(res, 200, { ok: true, hint: 'NapCat 模式/端口、人格与范围之外的持久化项，重载插件后生效' });
  });

  return () => { for (const dispose of disposers) { try { dispose?.(); } catch {} } };
}
