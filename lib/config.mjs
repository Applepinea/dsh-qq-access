import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { assert, integer, qqId } from './util.mjs';

export const defaultConfigPath = () => process.env.DSH_QQ_CONFIG || join(homedir(), '.dsh-qq-access', 'config.json');

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
    group: raw.reply?.group ?? 'mention',
    mentionSender: raw.reply?.mentionSender !== false,
    maxChars: integer(raw.reply?.maxChars, 2000, 100, 4000, '回复字数'),
    contextMessages: integer(raw.reply?.contextMessages, 20, 0, 100, '上下文条数'),
    timeoutMs: integer(raw.reply?.timeoutMs, 180_000, 1000, 1_800_000, '回复超时'),
    maxQueuePerConversation: integer(raw.reply?.maxQueuePerConversation, 20, 1, 100, '会话队列上限'),
    maxQueuedTotal: integer(raw.reply?.maxQueuedTotal, 100, 1, 1000, '总队列上限'),
    concurrency: integer(raw.reply?.concurrency, 4, 1, 16, '并发数'),
    maxLiveSessions: integer(raw.reply?.maxLiveSessions, 64, 1, 1000, '活跃会话上限'),
    idleMs: integer(raw.reply?.idleMs, 1_800_000, 1000, 86_400_000, '空闲会话清理时间'),
  };
  assert(typeof reply.private === 'boolean' && ['off', 'mention', 'all'].includes(reply.group), 'reply.private 必须为布尔值，reply.group 为 off / mention / all');
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
    retentionDays: integer(raw.retentionDays, 30, 1, 3650, '保留天数'),
    // Safety net for dropped push events: ask NapCat for recent messages on a timer.
    poll: {
      enabled: raw.poll?.enabled !== false,
      intervalMs: integer(raw.poll?.intervalMs, 60_000, 15_000, 3_600_000, '轮询间隔'),
      count: integer(raw.poll?.count, 10, 1, 50, '轮询条数'),
    },
    ownerHarnessTools: raw.ownerHarnessTools === true,
    route: { ...(raw.model?.provider ? { provider: String(raw.model.provider) } : {}), ...(raw.model?.model ? { model: String(raw.model.model) } : {}) },
    persona: sections,
    rate: {
      globalGapMs: integer(raw.rate?.globalGapMs, 1000, 0, 60_000, '全局发送间隔'),
      peerGapMs: integer(raw.rate?.peerGapMs, 3000, 0, 60_000, '同会话发送间隔'),
      maxPerMinute: integer(raw.rate?.maxPerMinute, 20, 1, 120, '每分钟发送上限'),
    },
    qzone: {
      enabled: q.enabled ?? true,
      headless: q.headless ?? false,
      channel: q.channel ?? (process.platform === 'win32' ? 'msedge' : ''),
      profileDir: absolute(q.profileDir ?? 'data/qzone-profile'),
      timeoutMs: integer(q.timeoutMs, 30_000, 1000, 120_000, 'QQ 空间超时'),
      // Override these only after inspecting your own QQ Space page.
      editorFrame: q.editorFrame ?? 'veditor1_Iframe',
      guestbookFrame: q.guestbookFrame ?? 'tgb',
      submitSelector: q.submitSelector ?? '#btnPostMsg',
      itemSelector: q.itemSelector ?? '#msgList > li, #msgList .msg_item, .msg_list .msg_item, .msgList .msgItem',
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
