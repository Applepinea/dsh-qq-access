import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { assert, decimal, integer, qqId } from './util.mjs';

/**
 * `HH:MM` 校验，返回补零后的字符串。
 *
 * 只接受 00:00–24:00；24:00 单独放行是因为「到今天结束」比「23:59」更准确。
 * 非法值在这里就报错，而不是等到调度时静默算出 NaN 时间。
 */
function clock(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim();
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  assert(m, `${label}必须是 HH:MM 格式`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  assert(h <= 24 && min <= 59, `${label}必须是 00:00–24:00 之间的时间`);
  assert(h < 24 || min === 0, `${label}的 24 点只能写成 24:00`);
  return String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
}

/**
 * 和风 API Key 的形状校验。
 *
 * 出过一次事故：面板把人格设定整段写进了 weather.apiKey，保存成功、
 * 界面显示「已保存」，但那个字段根本不是 key。所以这里不只是 trim，
 * 而是拒绝明显不像 key 的内容 —— 宁可当没填，也不要存一段垃圾进去。
 */
function weatherApiKey(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (!/^[A-Za-z0-9._-]{8,128}$/.test(text)) return '';
  return text;
}

export const defaultConfigPath = () => process.env.DSH_QQ_CONFIG || join(homedir(), '.dsh-qq-access', 'config.json');

/**
 * 一份能直接通过 normalizeConfig 的配置模板。
 *
 * cli.mjs setup 和面板的「首次配置」都用它，避免同一组默认值写两遍 ——
 * 以前热应用、PATCHABLE、capabilities 这些手维护清单都因为两边不同步出过事。
 * token / secret / webuiToken 每次调用都重新随机，绝不写死。
 */
export function bootstrapConfig({ selfId, ownerIds = [], platform = process.platform, arch = process.arch } = {}) {
  const token = randomBytes(24).toString('hex');
  const secret = randomBytes(24).toString('hex');
  const managed = platform === 'win32' && arch === 'x64';
  return {
    selfId, ownerIds, dataDir: './data',
    onebot: { apiUrl: 'http://127.0.0.1:3000', token, timeoutMs: 15000 },
    events: { port: 5701, secret },
    napcat: { mode: managed ? 'managed' : 'external', autoInstall: true, autoOpenLogin: true, webuiPort: 6099, webuiToken: randomBytes(24).toString('hex') },
    access: { privateMode: 'all', groupMode: 'all', privateIds: [], groupIds: [], blockedUsers: [], blockedGroups: [] },
    reply: { private: true, group: 'off', smartThreshold: 3, selfNames: [], interests: [], learnInterests: true, maxChars: 2000, contextMessages: 20, concurrency: 4, maxLiveSessions: 64 },
    retentionDays: 30, ownerHarnessTools: false,
    rate: { globalGapMs: 1000, peerGapMs: 3000, maxPerMinute: 20 },
    qzone: { enabled: true, timeoutMs: 30000, cookieTtlMs: 600000 },
    emotion: { enabled: false, perSession: false, useModel: true, inject: true, privacyLevel: 1, significanceThreshold: 5 },
    life: { enabled: true, inject: true, proactive: false },
    memes: { enabled: true, autoCollect: false, requireApproval: true, visionClassify: true, autoSend: false },
    thoughts: { enabled: true, inject: true, limit: 3, maxAgeHours: 48 },
    search: { enabled: true, apiKey: '' },
    steam: { enabled: false, apiKey: '', cacheTtlMs: 60000, withGames: true, inject: true, injectProactive: true, privateOnly: true },
    qzoneProactive: { enabled: false, maxPerDay: 1, dailyChance: 100, timeTone: true, windowStart: '08:00', windowEnd: '23:00', minGapMinutes: 180 },
    persona: '你是一名友好自然的 AI QQ 助手。使用中文简洁聊天，诚实说明自己是 AI；不发送思考过程、工具日志或其他人的私聊内容。',
  };
}

/**
 * Turn the panel's model choice into a complete provider/model route.
 *
 * Absent or null means "follow the Host default" and yields {} -- the runtime then
 * omits agentOptions and the Host's current selection is used. A partial selection
 * is a mistake rather than an instruction, so it throws with a message the panel
 * shows verbatim.
 */
function modelRoute(model) {
  if (model === undefined || model === null) return {};
  if (typeof model !== 'object' || Array.isArray(model)) throw new Error('模型设置必须是对象或 null');
  const provider = model.provider ? String(model.provider).trim() : '';
  const id = model.model ? String(model.model).trim() : '';
  if (!provider && !id) return {};
  if (!provider) throw new Error('已选择模型但缺少服务商（provider）');
  if (!id) throw new Error('已选择服务商但缺少模型（model）');
  // 推理等级是同一个选择对象里的第三项。空串就是宿主的「服务商默认」，
  // 落盘时干脆省掉这个键 —— 存一个空串只会让人以为设过什么。
  const rawEffort = model.reasoningEffort;
  const effort = rawEffort === undefined || rawEffort === null ? '' : String(rawEffort).trim();
  assert(!effort || /^[A-Za-z0-9_.-]{1,40}$/.test(effort), '推理等级（reasoningEffort）取值不合法');
  return { provider, model: id, ...(effort ? { reasoningEffort: effort } : {}) };
}

export function normalizeConfig(raw, filePath = defaultConfigPath()) {
  assert(raw && typeof raw === 'object' && !Array.isArray(raw), '配置必须是 JSON 对象');
  const base = dirname(resolve(filePath));
  const absolute = value => isAbsolute(value) ? value : resolve(base, value);
  const url = new URL(raw.onebot?.apiUrl ?? 'http://127.0.0.1:3000');
  assert(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'OneBot API URL 必须为无内嵌凭据的 HTTP(S) 地址');
  // This release deliberately uses a same-machine QQ bridge.
  assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'OneBot API 请绑定本机 127.0.0.1 / localhost / ::1');
  const token = process.env.NAPCAT_TOKEN || raw.onebot?.token || '';
  const eventSecret = process.env.NAPCAT_EVENT_SECRET || raw.events?.secret || '';
  assert(typeof token === 'string' && token.length >= 16 && !/[\r\n]/.test(token), '请配置至少 16 位 OneBot token');
  assert(typeof eventSecret === 'string' && eventSecret.length >= 16, '请配置至少 16 位事件签名 secret');
  // 「待登录」：首次配置时不再要求用户填 QQ 号，改成扫码后从 NapCat 日志里读出来。
  // 这一阶段 selfId 是空串，配置只用于把 NapCat 拉起来扫码，不参与收发消息。
  // 拿到真实号之后会写回 config.json，并提示用户重启 DSH。
  const loginPending = raw.loginPending === true && !String(raw.selfId ?? '').trim();
  const selfId = loginPending ? '' : qqId(raw.selfId, '登录 QQ 号');
  const owners = (raw.ownerIds ?? []).map(x => qqId(x, '管理员 QQ 号'));
  assert(!selfId || !owners.includes(selfId), '管理员私聊需要使用另一个 QQ 号；selfId 自身的消息会被忽略');
  const list = x => (x ?? []).map(y => qqId(y));
  const access = {
    privateMode: raw.access?.privateMode ?? 'all', groupMode: raw.access?.groupMode ?? 'all',
    privateIds: list(raw.access?.privateIds), groupIds: list(raw.access?.groupIds),
    blockedUsers: list(raw.access?.blockedUsers), blockedGroups: list(raw.access?.blockedGroups),
  };
  for (const mode of [access.privateMode, access.groupMode]) assert(['all', 'allowlist', 'disabled'].includes(mode), '访问模式必须为 all / allowlist / disabled');
  const reply = {
    private: raw.reply?.private ?? true,
    // off = 只归档；mention = 仅被 @；smart = 感兴趣/与自己有关/被 @；all = 每条都回。
    // 默认 off：群聊里默认不回。
    // 群里消息又多又杂，默认「smart」会让新用户一装好就在一堆群里被认成话痨 ——
    // 而且是拿她的身份在公开群里说话，风险比私聊大得多。要开自己开。
    group: raw.reply?.group ?? 'off',
    mentionSender: raw.reply?.mentionSender !== false,
    // smart 模式的具体参数。放在 reply 段里，因为它们只影响「回不回」。
    smartThreshold: integer(raw.reply?.smartThreshold, 3, 1, 10, '智能回复阈值'),
    // 她的群昵称/别名，被叫到就回。QQ 号本身总是算在内。
    selfNames: (Array.isArray(raw.reply?.selfNames) ? raw.reply.selfNames : [])
      .map((x) => String(x ?? '').trim())
      .filter((x) => x && x.length <= 20)
      .slice(0, 10),
    // 感兴趣的话题词；留空用内置默认表。
    interests: (Array.isArray(raw.reply?.interests) ? raw.reply.interests : [])
      .map((x) => String(x ?? '').trim())
      .filter((x) => x && x.length <= 20)
      .slice(0, 100),
    // 是否让她从自己回过的话里学习话题。
    learnInterests: raw.reply?.learnInterests !== false,
    vision: raw.reply?.vision !== false,
    maxImages: integer(raw.reply?.maxImages, 4, 0, 8, '单条消息最多图片数'),
    maxChars: integer(raw.reply?.maxChars, 2000, 100, 4000, '回复字数'),
    contextMessages: integer(raw.reply?.contextMessages, 20, 0, 100, '上下文条数'),
    timeoutMs: integer(raw.reply?.timeoutMs, 180_000, 1000, 1_800_000, '回复超时'),
    // 收到消息后等多久再合并回复。
    // 默认 1200：推送到达就排一次短防抖，连发的几句合并成一轮。
    // 设成 >= poll.intervalMs 等于关掉即时触发，回到「每轮轮询处理一次」。
    debounceMs: integer(raw.reply?.debounceMs, 1200, 0, 600_000, '回复防抖'),
    maxQueuePerConversation: integer(raw.reply?.maxQueuePerConversation, 20, 1, 100, '会话队列上限'),
    maxQueuedTotal: integer(raw.reply?.maxQueuedTotal, 100, 1, 1000, '总队列上限'),
    concurrency: integer(raw.reply?.concurrency, 4, 1, 16, '并发数'),
    maxLiveSessions: integer(raw.reply?.maxLiveSessions, 64, 1, 1000, '活跃会话上限'),
    // Link parsing. `linkParse` is a master switch: off means links are left as
    // plain text and no network request is made for them.
    linkParse: raw.reply?.linkParse !== false,
    linkTimeoutMs: integer(raw.reply?.linkTimeoutMs, 20_000, 1000, 60_000, '链接解析超时'),
    linkMaxImages: integer(raw.reply?.linkMaxImages, 9, 0, 20, '链接最多图片数'),
    // 会话空闲多久后被回收（销毁 agent，释放内存）。
    // 0 是「永不回收」的哨兵值：一直保留 agent，重启才清。
    // 之前这里只允许 1 秒–24 小时，想永不回收就只能填 24 小时，
    // 但那和「一直留着」是两回事 —— 隔一天照样会被销毁。
    idleMs: integer(raw.reply?.idleMs, 1_800_000, 0, 86_400_000, '空闲会话清理时间'),
    // 复读：她连续几轮说同一句话是很常见的问题。上下文里有她说过的原话，
    // 但模型并不总会去比对，所以除了提示词约束外，这里再做一次机械检测。
    // 命中就重问一次；重问后仍然重复就照发（宁可重复，也不能把回复吞掉）。
    avoidRepeat: raw.reply?.avoidRepeat !== false,
    // 相似度阈值：2 字滑窗覆盖率达到这个值就算重复。
    // 0.7 能抓住「加语气词 / 换标点 / 多一句尾巴」这类改写，同时不会把
    // 「我在吃饭」和「我刚吃完饭」这种正常换说法误判成复读。
    repeatThreshold: decimal(raw.reply?.repeatThreshold, 0.7, 0.5, 1, '复读判定阈值'),
  };
  assert(typeof reply.private === 'boolean' && ['off', 'mention', 'smart', 'all'].includes(reply.group), 'reply.private 必须为布尔值，reply.group 为 off / mention / smart / all');
  const q = raw.qzone ?? {};
  assert(q.enabled === undefined || typeof q.enabled === 'boolean', 'qzone.enabled 必须为布尔值');
  assert(q.headless === undefined || typeof q.headless === 'boolean', 'qzone.headless 必须为布尔值');
  const sections = raw.persona ?? '你是一名友好、自然的 QQ 助手。用中文简洁聊天；诚实说明你是 AI。不要把思考过程、工具日志或其他人的私人信息发到聊天中。';
  assert(typeof sections === 'string' && sections.length <= 12_000, 'persona 必须是最多 12000 字符的字符串');
  const n = raw.napcat ?? {};
  const napcat = {
    mode: n.mode ?? 'external',
    directory: absolute(n.directory ?? 'data/napcat'),
    autoInstall: n.autoInstall ?? true,
    autoOpenLogin: n.autoOpenLogin ?? true,
    webuiPort: integer(n.webuiPort, 6099, 1, 65535, 'NapCat 登录端口'),
    webuiToken: n.webuiToken ?? '',
    loginTimeoutMs: integer(n.loginTimeoutMs, 600_000, 1000, 3_600_000, 'NapCat 登录等待时间'),
    // 冷启动宽限期：这段时间内连不上 NapCat 属于正常（它还在起），
    // 不要急着弹 WebUI 浏览器。0 = 立刻判需要扫码（老行为）。
    loginGraceMs: integer(n.loginGraceMs, 20_000, 0, 300_000, 'NapCat 冷启动宽限期'),
    maxRestarts: integer(n.maxRestarts, 2, 0, 5, 'NapCat 最大重启次数'),
  };
  assert(['external', 'managed'].includes(napcat.mode), 'napcat.mode 必须为 external 或 managed');
  assert(typeof napcat.autoInstall === 'boolean' && typeof napcat.autoOpenLogin === 'boolean', 'NapCat 自动安装／打开登录页选项必须为布尔值');
  if (napcat.mode === 'managed') {
    assert(typeof napcat.webuiToken === 'string' && /^[a-zA-Z0-9_-]{24,128}$/.test(napcat.webuiToken), '托管模式需配置 24–128 位 napcat.webuiToken，可运行 napcat-enable 自动生成');
    assert(url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['/', ''].includes(url.pathname), '托管模式的 OneBot 地址必须为 http://127.0.0.1:端口');
    assert(new Set([Number(url.port || 80), raw.events?.port ?? 5701, napcat.webuiPort]).size === 3, 'QQ API、事件接收、NapCat 登录页端口不能相同');
    assert((raw.events?.port ?? 5701) !== 0, '托管模式需要固定的事件端口');
  }
  return {
    selfId, ownerIds: owners, dataDir: absolute(raw.dataDir ?? 'data'), configPath: resolve(filePath),
    // true = 还没扫码，selfId 未知。runtime 只把 NapCat 拉起来等登录，不做收发。
    loginPending,
    onebot: { apiUrl: url.href.replace(/\/$/, ''), token, timeoutMs: integer(raw.onebot?.timeoutMs, 15_000, 100, 120_000, 'API 超时') },
    events: { host: '127.0.0.1', port: integer(raw.events?.port, 5701, 0, 65535, '事件端口'), secret: eventSecret, maxBytes: 1024 * 1024 },
    access, reply, napcat,
    // 0 是显式哨兵值：永久保留，不按天清理，查询也不设时间下限。
    retentionDays: integer(raw.retentionDays, 30, 0, 3650, '保留天数'),
    // Safety net for dropped push events: ask NapCat for recent messages on a timer.
    poll: {
      enabled: raw.poll?.enabled !== false,
      intervalMs: integer(raw.poll?.intervalMs, 60_000, 15_000, 3_600_000, '轮询间隔'),
      count: integer(raw.poll?.count, 10, 1, 50, '轮询条数'),
    },
    ownerHarnessTools: raw.ownerHarnessTools === true,
    // A route is all-or-nothing: half of a selection would be handed to the Host as
    // `agentOptions` and fail at request time, so an incomplete pair is rejected here
    // while it is still a settings error the panel can report.
    route: modelRoute(raw.model),
    persona: sections,
    rate: {
      // Per-segment pacing for multi-message replies.
      segmentMinMs: integer(raw.rate?.segmentMinMs, 1000, 0, 30_000, '分段最小间隔'),
      segmentMaxMs: integer(raw.rate?.segmentMaxMs, 10_000, 0, 60_000, '分段最大间隔'),
      segmentPerCharMs: integer(raw.rate?.segmentPerCharMs, 60, 0, 500, '每字追加间隔'),
      globalGapMs: integer(raw.rate?.globalGapMs, 1000, 0, 60_000, '全局发送间隔'),
      peerGapMs: integer(raw.rate?.peerGapMs, 3000, 0, 60_000, '同会话发送间隔'),
      maxPerMinute: integer(raw.rate?.maxPerMinute, 20, 1, 120, '每分钟发送上限'),
    },
    // Sticker library. `enabled` off means the tools are absent and nothing is
    // collected; the folder on disk is left untouched either way.
    // Realtime web search (Anysearch). Anonymous works; a key only raises quota.
    // Virtual life: one generated week, reused until regenerated.
    life: {
      enabled: raw.life?.enabled !== false,
      inject: raw.life?.inject !== false,
      // Proactive messages ride the existing poll loop, so this is a switch and a
      // cap rather than a schedule.
      proactive: raw.life?.proactive === true,
      proactivePrivate: raw.life?.proactivePrivate !== false,
      proactiveGroup: raw.life?.proactiveGroup === true,
      // 每天最多几次。实际次数按正态分布在 0..这个值之间抽，不是固定发满。
      proactiveMaxPerDay: integer(raw.life?.proactiveMaxPerDay, 5, 0, 24, '每天最多几次主动消息'),
      // 次数分布的离散程度，用「标准差 / 均值」表示。
      // 0.1 很集中（几乎每天一样多），0.5 是标准钟形，1.0 接近均匀。
      // 用比值而不是绝对值，换 maxPerDay 时松紧感觉保持一致。
      proactiveSpread: decimal(raw.life?.proactiveSpread, 0.5, 0.05, 2, '主动消息次数离散度'),
      // 两次主动消息之间至少隔多久。窗口数量由上面的最大值决定，
      // 这个值保证它们不会挤在一起。
      proactiveMinGapMinutes: integer(raw.life?.proactiveMinGapMinutes, 90, 10, 720, '主动消息最小间隔'),
      // 时间随机化：窗口时间是模型按日程写的「大概这个点」，
      // 如果每天都精确到同一分钟，几天就能被看出是程序发的。
      // 偏移量由「日期 + 窗口 id」播种，当天固定、跨天不同、重启不变 ——
      // 不能在轮询里现抽，否则 60 秒一次等于必然提前触发。
      proactiveJitterMinutes: integer(raw.life?.proactiveJitterMinutes, 45, 0, 240, '主动消息时间随机幅度'),
      // 到点后允许多久之内补发。随机化之后窗口是一个区间而不是一个点，
      // 这个值决定区间的宽度。
      proactiveGraceMinutes: integer(raw.life?.proactiveGraceMinutes, 30, 5, 180, '主动消息补发窗口'),
      // 主动消息的内容方向。留空就完全按日程里的 intent 走。
      // 非空时作为额外要求拼进提示词，用来长期约束她主动说话的主题 ——
      // 比如「多聊生活小事，别总问我在干嘛」。
      proactiveHint: String(raw.life?.proactiveHint ?? '').slice(0, 500),
      // Per-conversation switches. An empty list means "no conversation", which is
      // deliberate: the previous behaviour (most recently active chat) could message
      // someone who never opted in.
      proactiveTargets: (Array.isArray(raw.life?.proactiveTargets) ? raw.life.proactiveTargets : [])
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const kind = entry.kind === 'group' ? 'group' : entry.kind === 'private' ? 'private' : '';
          const peerId = String(entry.peerId ?? '').trim();
          if (!kind || !/^\d{5,12}$/.test(peerId)) return null;
          return { kind, peerId, enabled: entry.enabled !== false };
        })
        .filter(Boolean)
        .slice(0, 200),
    },
    // 和风天气：给虚拟人生的穿搭和日程提供真实天气。
    // 没配齐就当没启用，生成时退化成「按日期和季节猜」，不会因此失败。
    weather: {
      enabled: raw.weather?.enabled === true,
      apiHost: String(raw.weather?.apiHost ?? '').trim(),
      // 和风的 API Key 是短串，绝不该是一段文字。这里做形状校验，
      // 因为出过一次事故：人格设定被当成 key 写进配置，面板还显示「已保存」。
      apiKey: weatherApiKey(raw.weather?.apiKey ?? process.env.QWEATHER_API_KEY),
      // 默认坐标刻意用美国白宫：公开地标，不代表任何真实用户的位置。
      // 插件是公开分发的，默认值写成真实住址等于把位置随包发出去。
      latitude: decimal(raw.weather?.latitude, 38.90, -90, 90, '纬度'),
      longitude: decimal(raw.weather?.longitude, -77.04, -180, 180, '经度'),
      city: String(raw.weather?.city ?? '华盛顿').slice(0, 40),
      // 漏了这个字段会让 AbortSignal.timeout(undefined) 直接抛，
      // 表现是「点生成就报错」，而且堆栈指向 weather.mjs 完全看不出是配置缺项。
      timeoutMs: integer(raw.weather?.timeoutMs, 8000, 2000, 60_000, '天气超时'),
    },
    steam: {
      // 默认关：没配 API Key 之前它什么也做不了，开着只会每轮多一次失败的网络请求。
      enabled: raw.steam?.enabled === true,
      // Steam Web API key 是 32 位十六进制。和 weatherApiKey 一样做形状校验：
      // 把一整段说明文字粘贴进来是真实发生过的错误。
      apiKey: (() => {
        const v = String(process.env.STEAM_API_KEY || raw.steam?.apiKey || '').trim();
        if (!v) return '';
        // 接受 32 位十六进制；不符合就丢掉，不要带着一个注定 401 的值去请求。
        return /^[0-9A-Fa-f]{32}$/.test(v) ? v : '';
      })(),
      // 没有「默认 SteamID」了：绑定只能在面板里做，查谁完全看绑定表。
      // 留着这个字段会让「没绑定的人查到你」变成默认行为，那是隐私问题。
      // 缓存时间可调。0 = 每次都查；上限 1 天，避免填个天文数字后状态永远不变。
      cacheTtlMs: integer(raw.steam?.cacheTtlMs, 60_000, 0, 86_400_000, 'Steam 缓存时间'),
      // 是否连游戏时长一起拉。关掉可以少一个请求，也少一点隐私暴露。
      withGames: raw.steam?.withGames !== false,
      // 是否注入到聊天上下文（她自己就知道你在玩什么）。
      inject: raw.steam?.inject !== false,
      // 主动消息时也注入，但提示词里明确要求「不要每次都提」。
      injectProactive: raw.steam?.injectProactive !== false,
      // 只在私聊注入。群里有别人，把「你老板在玩文明6」说出去很难收场。
      privateOnly: raw.steam?.privateOnly !== false,
      timeoutMs: integer(raw.steam?.timeoutMs, 6000, 2000, 30_000, 'Steam 超时'),
    },

    search: {
      enabled: raw.search?.enabled !== false,
      apiKey: String(process.env.ANYSEARCH_API_KEY || raw.search?.apiKey || ''),
      timeoutMs: integer(raw.search?.timeoutMs, 30_000, 3000, 120_000, '搜索超时'),
    },
    memes: {
      enabled: raw.memes?.enabled !== false,
      maxEntries: integer(raw.memes?.maxEntries, 5000, 10, 100000, '表情包上限'),
      autoCollect: raw.memes?.autoCollect === true,
      autoCollectChance: Number.isFinite(Number(raw.memes?.autoCollectChance)) ? Math.min(1, Math.max(0, Number(raw.memes.autoCollectChance))) : 0.2,
      requireApproval: raw.memes?.requireApproval !== false,
      visionClassify: raw.memes?.visionClassify !== false,
      autoSend: raw.memes?.autoSend === true,
      autoSendChance: Number.isFinite(Number(raw.memes?.autoSendChance)) ? Math.min(1, Math.max(0, Number(raw.memes.autoSendChance))) : 0.15,
    },
    // 主动发动态：在设定时间窗内由模型自己写一条说说。
    // 与虚拟人生共用「一次生成、按周循环」的思路，但发布节奏由这里单独控制。
    qzoneProactive: (() => {
      const windowStart = clock(raw.qzoneProactive?.windowStart, '08:00', '动态时间窗开始');
      const windowEnd = clock(raw.qzoneProactive?.windowEnd, '23:00', '动态时间窗结束');
      // 结束必须晚于开始：反过来会让 slotsFor 算出空列表，表现为「打开了却永远不发」。
      assert(windowEnd > windowStart, '动态时间窗的结束时间必须晚于开始时间');
      return {
        enabled: raw.qzoneProactive?.enabled === true,
        // 每天最多发几条（0 = 关闭，等价于 enabled:false）。
        maxPerDay: integer(raw.qzoneProactive?.maxPerDay, 1, 0, 6, '每天动态条数'),
        // 每日发送概率，整数百分比。用 0–100 而不是 0–1 的小数：
        // 面板里直接显示「%」，也避免 0.1+0.2 这类浮点表示问题。
        // 100 = 每天都发，0 = 永远不发（与 enabled:false 不同，见 qzone-proactive.mjs）。
        dailyChance: integer(raw.qzoneProactive?.dailyChance, 100, 0, 100, '每日发送概率'),
        // 按时间调整内容：开启动态的语气会跟随发布时段（清晨/中午/深夜…）。
        // 默认开启：关掉等于回到「任何时间都是同一副语气」，那才是异常状态。
        timeTone: raw.qzoneProactive?.timeTone !== false,
        // 允许发布的时间窗，避免凌晨发动态。
        windowStart,
        windowEnd,
        // 两条动态之间的最小间隔，防止时间窗被压得很短时连发。
        minGapMinutes: integer(raw.qzoneProactive?.minGapMinutes, 180, 30, 1440, '动态最小间隔'),
        // 内容倾向，作为提示词的一部分。
        topic: String(raw.qzoneProactive?.topic ?? '').slice(0, 500),
        // 是否带上当前生活状态（穿搭/三餐/在做什么）作为素材。
        useLife: raw.qzoneProactive?.useLife !== false,
        // 是否允许模型在动态里提到具体地点/人名等细节。
        allowDetails: raw.qzoneProactive?.allowDetails !== false,
      };
    })(),
    // 情感与关系：好感/亲密度双核 + 8 维情感 + 四阶段演进。
    // 移植自 asakiyoshi/EmotionAI-Pro，去掉了只为命令界面存在的部分。
    emotion: {
      enabled: raw.emotion?.enabled === true,
      // 默认按 QQ 号累积：同一个人在两个群里还是同一个人。
      // perSession=true 时改为按会话隔离。
      perSession: raw.emotion?.perSession === true,
      // 用模型判断这一轮的情感变化；关闭时退回关键词启发式（免费但粗糙）。
      useModel: raw.emotion?.useModel !== false,
      // 独立的情感分析模型；留空沿用主模型。
      provider: String(raw.emotion?.provider ?? '').trim(),
      model: String(raw.emotion?.model ?? '').trim(),
      // 变化多大才值得记进长期记忆。
      significanceThreshold: integer(raw.emotion?.significanceThreshold, 5, 1, 30, '情感记忆阈值'),
      // 0=不注入 1=只给阶段 2=连数值一起给
      privacyLevel: integer(raw.emotion?.privacyLevel, 1, 0, 2, '情感隐私级别'),
      // 注入到人格提示里的情感描述开关。
      inject: raw.emotion?.inject !== false,
      // 面板显示最近多少条档案。
      maxProfiles: integer(raw.emotion?.maxProfiles, 50, 1, 200, '情感档案上限'),
    },
    // QQ 空间走 NapCat 的 cookie + 纯 HTTP，没有浏览器、没有页面选择器。
    // 早先基于 Playwright 的字段（headless / channel / profileDir / 各种 selector）
    // 已经没有任何代码读取，留着只会让人以为还要配浏览器。
    // 念头：她自己想过、但没发出去的内容。
    // 和记忆分开：记忆是「对方告诉我的事」，念头是「我自己在想什么」。
    // 混在一起会让提示词分不清「他说过」和「我想过」。
    thoughts: {
      // 默认开：这个功能零额外模型调用（reasoning 本来就在事件里）。
      enabled: raw.thoughts?.enabled !== false,
      inject: raw.thoughts?.inject !== false,
      // 每轮注入几条。太多会把人格层挤满。
      limit: integer(raw.thoughts?.limit, 3, 0, 10, '念头注入条数'),
      // 超过这个小时数的念头不再注入：三天前想的事和现在无关。
      maxAgeHours: integer(raw.thoughts?.maxAgeHours, 48, 1, 720, '念头有效期（小时）'),
    },

    // 长期记忆：按「人」存，不按会话存。
    // 同一个人在群里和私聊里是同一份记忆，这是这个功能的核心。
    memory: {
      enabled: raw.memory?.enabled === true,
      // 半衰期：越久越难想起来，但不删除。
      halfLifeDays: integer(raw.memory?.halfLifeDays, 30, 1, 3650, '记忆半衰期'),
      // 每轮最多注入几条「事件」（事实不占这个额度）。
      recallLimit: integer(raw.memory?.recallLimit, 4, 0, 20, '记忆召回条数'),
      // 常驻事实条数。
      factLimit: integer(raw.memory?.factLimit, 6, 0, 20, '常驻事实条数'),
      // 命中阈值：越高越少提旧事。
      minScore: (() => {
        const n = Number(raw.memory?.minScore);
        return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.12;
      })(),
      // 每人每天最多记几条，防止把上下文塞满。
      dailyQuota: integer(raw.memory?.dailyQuota, 12, 0, 100, '每日记忆配额'),
      // 用模型判断「这轮值不值得记」；关闭则只用启发式。
      useModel: raw.memory?.useModel === true,
      // 是否把记忆注入到提示词。
      inject: raw.memory?.inject !== false,
    },
    qzone: {
      enabled: q.enabled ?? true,
      timeoutMs: integer(q.timeoutMs, 30_000, 1000, 120_000, 'QQ 空间超时'),
      // cookie 缓存时长：短了每次操作都要向 NapCat 取一次，长了容易用到过期的。
      cookieTtlMs: integer(q.cookieTtlMs, 600_000, 0, 3_600_000, 'QQ 空间 cookie 缓存'),
    },
  };
}

/**
 * 判断一段内容像不像「被写坏的文件」。
 *
 * 断电后常见的损坏形状有两种：长度正常但全是 0x00，或者只剩一堆 NUL 字符。
 * JSON.parse 对这两种都会抛 SyntaxError，但报错信息看不出根因，
 * 所以这里单独识别一下，好给出「可能是断电导致」这种能直接行动的提示。
 */
function looksCorrupted(text) {
  if (!text) return true;
  if (text.trim() === '') return false;   // 空文件是「没写过」，不是损坏
  // 全 0x00 或者有效字符极少
  const printable = [...text].filter((c) => c >= ' ' || c === '\n' || c === '\r' || c === '\t').length;
  return printable / text.length < 0.5;
}

export async function loadConfig(path = defaultConfigPath()) {
  let text;
  try { text = await readFile(path, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') {
      // 带上 code：调用方要区分「还没配置」和其它读取失败。
      // 前者是可恢复的首次安装状态（面板照常出现），后者必须继续抛。
      const wrapped = new Error(`未找到配置 ${path}。请先运行 node cli.mjs setup。`);
      wrapped.code = 'ENOENT';
      throw wrapped;
    }
    throw new Error(`无法读取配置：${error.name}。检查文件权限。`);
  }

  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    // 主文件解析失败时先试 .bak —— 原子写每次都会留一份上一版。
    const bakPath = path + '.bak';
    let recovered = null;
    try {
      const bakText = await readFile(bakPath, 'utf8');
      recovered = JSON.parse(bakText);
    } catch { /* 没有备份或备份也坏了 */ }

    if (recovered) {
      // 备份能用就继续跑，同时把坏文件改名留住，方便事后查。
      try {
        const { rename } = await import('node:fs/promises');
        await rename(path, `${path}.corrupt-${Date.now()}`);
      } catch { /* 改名失败不影响恢复 */ }
      console.warn?.(`[dsh-qq-access] 配置解析失败，已从 ${bakPath} 恢复。损坏的原文件已保留。`);
      // 把备份写回主文件。
      // 以前只把坏文件改名、用备份内容继续跑，但不写回 config.json ——
      // 进程活着时用的是内存配置，下次启动主文件已经不在，走 ENOENT 分支，
      // 用户看到「未找到配置」，得自己把 .bak 拷回来。
      try {
        const { writeFile, rename: renameFile } = await import('node:fs/promises');
        const tmp = `${path}.restore-${Date.now()}.tmp`;
        await writeFile(tmp, JSON.stringify(recovered, null, 2) + '\n', { mode: 0o600 });
        await renameFile(tmp, path);
      } catch { /* 写回失败不影响本次运行，下次启动仍可从 .bak 恢复 */ }
      return normalizeConfig(recovered, path);
    }

    const hint = looksCorrupted(text)
      ? '文件内容看起来全是 0x00 或不可打印字符，通常是断电/强制关机导致写盘未完成。'
      : 'JSON 格式有误。';
    throw new Error(`无法读取配置（${path}）：${hint} 没有可用的 ${bakPath} 备份，需要手动修复或重新运行 node cli.mjs setup。`);
  }
  return normalizeConfig(raw, path);
}

export function allowConversation(config, kind, peerId, senderId) {
  const a = config.access;
  if (a.blockedUsers.includes(senderId)) return false;
  if (kind === 'group' && a.blockedGroups.includes(peerId)) return false;
  const mode = kind === 'private' ? a.privateMode : a.groupMode;
  const ids = kind === 'private' ? a.privateIds : a.groupIds;
  return mode === 'all' || (mode === 'allowlist' && ids.includes(peerId));
}
