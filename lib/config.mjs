import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { assert, integer, qqId } from './util.mjs';

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

export const defaultConfigPath = () => process.env.DSH_QQ_CONFIG || join(homedir(), '.dsh-qq-access', 'config.json');

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
  return { provider, model: id };
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
  const selfId = qqId(raw.selfId, '登录 QQ 号');
  const owners = (raw.ownerIds ?? []).map(x => qqId(x, '管理员 QQ 号'));
  assert(!owners.includes(selfId), '管理员私聊需要使用另一个 QQ 号；selfId 自身的消息会被忽略');
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
    group: raw.reply?.group ?? 'smart',
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
    maxQueuePerConversation: integer(raw.reply?.maxQueuePerConversation, 20, 1, 100, '会话队列上限'),
    maxQueuedTotal: integer(raw.reply?.maxQueuedTotal, 100, 1, 1000, '总队列上限'),
    concurrency: integer(raw.reply?.concurrency, 4, 1, 16, '并发数'),
    maxLiveSessions: integer(raw.reply?.maxLiveSessions, 64, 1, 1000, '活跃会话上限'),
    // Link parsing. `linkParse` is a master switch: off means links are left as
    // plain text and no network request is made for them.
    linkParse: raw.reply?.linkParse !== false,
    linkTimeoutMs: integer(raw.reply?.linkTimeoutMs, 20_000, 1000, 60_000, '链接解析超时'),
    linkMaxImages: integer(raw.reply?.linkMaxImages, 9, 0, 20, '链接最多图片数'),
    idleMs: integer(raw.reply?.idleMs, 1_800_000, 1000, 86_400_000, '空闲会话清理时间'),
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
      proactiveMaxPerDay: integer(raw.life?.proactiveMaxPerDay, 3, 0, 12, '每日主动消息上限'),
      proactiveMinGapMinutes: integer(raw.life?.proactiveMinGapMinutes, 90, 10, 720, '主动消息最小间隔'),
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

export async function loadConfig(path = defaultConfigPath()) {
  let raw;
  try { raw = JSON.parse(await readFile(path, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') throw new Error(`未找到配置 ${path}。请先运行 node cli.mjs setup。`);
    throw new Error(`无法读取配置：${error.name}。检查 JSON 格式及权限。`);
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
