import { appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function qqId(value, label = 'QQ 号或群号') {
  const id = String(value ?? '');
  assert(/^[1-9]\d{4,11}$/.test(id), `${label}必须是 5–12 位数字字符串`);
  return id;
}

/**
 * 本地日期 YYYY-MM-DD。
 *
 * 不要用 `new Date().toISOString().slice(0, 10)`：那是 UTC。
 * 东八区 0 点到 8 点之间，UTC 还停在前一天 ——
 * 归档会写进前一天的文件，记忆的日配额要到早上 8 点才翻转。
 */
export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function integer(value, fallback, min, max, label = '参数') {
  if (value === undefined) return fallback;
  assert(Number.isInteger(value) && value >= min && value <= max, `${label}必须是 ${min}–${max} 的整数`);
  return value;
}
/**
 * 允许小数的数值校验。
 *
 * integer() 卡死整数，但经纬度天然是小数，用 integer 会直接拒绝合法配置。
 * 和风 v1 接口最多接受小数点后两位，这里不做截断，只校验范围。
 */
export function decimal(value, fallback, min, max, label = '参数') {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  assert(Number.isFinite(n) && n >= min && n <= max, `${label}必须是 ${min}–${max} 之间的数字`);
  return n;
}

export function textArg(value, label = '文本', limit = 4000) {
  assert(typeof value === 'string' && value.trim().length > 0, `${label}不能为空`);
  assert([...value].length <= limit, `${label}不能超过 ${limit} 字符`);
  return value;
}

export function requestId(value) {
  assert(typeof value === 'string' && /^[a-zA-Z0-9:_-]{8,160}$/.test(value), 'request_id 必须是 8–160 位字母、数字、冒号、下划线或短横线');
  return value;
}

export function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function newId(prefix = 'qq') { return `${prefix}:${randomUUID()}`; }
export function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }

/**
 * 把宿主的模型选择压成 agentOptions。
 *
 * 宿主的选择是 { provider, model, reasoningEffort? } 三件套。以前这里只取前两个
 * 字段，于是用户调的推理等级只对主对话生效，主动消息、情感分析、表情分类这些
 * 一次性回合全部悄悄退回服务商默认，面板上写的等级和实际跑的不是一回事。
 */
export function hostSelection(selection) {
  if (!selection || typeof selection !== 'object') return undefined;
  const provider = String(selection.provider ?? '').trim();
  const model = String(selection.model ?? '').trim();
  if (!provider || !model) return undefined;
  const raw = selection.reasoningEffort;
  const effort = raw === undefined || raw === null ? '' : String(raw).trim();
  return { provider, model, ...(effort ? { reasoningEffort: effort } : {}) };
}
export function checkSignal(signal) { signal?.throwIfAborted(); }
export function combinedSignal(signal, timeoutMs) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
}

// Callers waiting for a mutex may cancel; the running operation must still settle
// before a later caller enters. This is especially important for browser profiles.
export class Mutex {
  #tail = Promise.resolve();
  run(task) {
    const next = this.#tail.then(task);
    this.#tail = next.catch(() => {});
    return next;
  }
}

export class Semaphore {
  #active = 0;
  #waiting = [];
  constructor(limit) { this.limit = limit; }
  async run(task) {
    if (this.#active >= this.limit) await new Promise(resolve => this.#waiting.push(resolve));
    else this.#active++;
    try { return await task(); }
    finally {
      const next = this.#waiting.shift();
      if (next) next(); // Transfer the occupied slot directly to the waiter.
      else this.#active--;
    }
  }
}

export class RateLimiter {
  #mutex = new Mutex();
  #lastGlobal = 0;
  #lastPeer = new Map();
  #minute = [];
  constructor({ globalGapMs, peerGapMs, maxPerMinute }) { Object.assign(this, { globalGapMs, peerGapMs, maxPerMinute }); }
  /**
   * Reserve the next send slot for `peer`.
   *
   * `paceMs` is the caller's own idea of the gap between two consecutive messages of the
   * same multi-message reply. It REPLACES peerGapMs instead of being max()'d with it, so a
   * user setting of 1s is honoured even though the default same-conversation gap is 3s.
   * The global gap and the per-minute quota still apply as hard floors.
   */
  async wait(peer, signal, paceMs = 0) {
    // 锁里只做「算要等多久」和「把这次发送预定到未来某个时刻」，等待放到锁外。
    //
    // 以前 delay 是在 mutex.run 内部 await 的：一段拆成 8 条的回复，每条之间有
    // 1–10 秒的打字间隔，那几十秒里整个全局锁被占着。后果是所有会话的发送、
    // 戳一戳、空间发布、甚至工具调用全部排队，一段长回复能把整机 QQ 输出卡住。
    //
    // 现在下一个调用进锁时看到的是「已经预定好的未来时间」，从那个时间往后算，
    // 所以多人并发时的总节奏和以前一致，只是不再互相阻塞。
    const ms = await this.#mutex.run(async () => {
      checkSignal(signal);
      const now = Date.now();
      this.#minute = this.#minute.filter(t => now - t < 60_000);
      const quotaWait = this.#minute.length >= this.maxPerMinute ? this.#minute[0] + 60_000 - now : 0;
      const peerGap = paceMs > 0 ? paceMs : this.peerGapMs;
      const wait = Math.max(0, this.#lastGlobal + this.globalGapMs - now, (this.#lastPeer.get(peer) ?? 0) + peerGap - now, quotaWait);
      // 预定到未来的时间点：下一个调用看到的 lastGlobal / lastPeer 就是这里。
      const at = now + wait;
      this.#lastGlobal = at;
      this.#lastPeer.set(peer, at);
      if (this.#lastPeer.size > 10_000) this.#lastPeer.delete(this.#lastPeer.keys().next().value);
      // 配额按「预定时刻」计入，否则等待期间新进来的调用会看到空配额。
      this.#minute.push(at);
      return wait;
    });
    if (ms > 0) {
      // 被取消时不撤回已经预定的时间点。撤回会让两个发送挤在同一毫秒，
      // 多等一次永远比发太快安全。
      await delay(ms, undefined, { signal });
    }
  }
}

/**
 * 往 debug.log 记一行纯文本，不带异常堆栈。
 *
 * 用途是记「本该发生却没发生」的事 —— 比如主动消息为什么没发出去。
 * 这类失败原来只在返回值里，轮询直接丢掉，日志里一点痕迹都没有，
 * 用户只能看到「她没说话」，查不出原因。
 */
export function noteLog(label) {
  try {
    const dir = process.env.DSH_QQ_CONFIG ? dirname(process.env.DSH_QQ_CONFIG) : join(homedir(), '.dsh-qq-access');
    appendFileSync(join(dir, 'debug.log'), `${new Date().toISOString()} ${String(label).slice(0, 2000)}\n`);
  } catch { /* diagnostics must never break the plugin */ }
}

export function safeLog(logger, label, error) {
  // Do not leak upstream bodies, message text, API tokens, cookies or browser paths.
  const kind = error?.name ?? 'Error';
  // Local diagnostic trail: the desktop host keeps plugin console output out of reach.
  try {
    const dir = process.env.DSH_QQ_CONFIG ? dirname(process.env.DSH_QQ_CONFIG) : join(homedir(), '.dsh-qq-access');
    appendFileSync(join(dir, 'debug.log'), `${new Date().toISOString()} ${label} (${kind}) ${String(error?.stack ?? error?.message ?? error).slice(0, 4000)}\n`);
  } catch { /* diagnostics must never break the plugin */ }
  logger.warn?.(`${label} (${kind})；详细原因可在本机 doctor 或 Harness 工具结果中查看。`);
}

/**
 * 判断一段话是不是在重复已经说过的话。
 *
 * 模型在多轮里翻来覆去说同一句是很常见的问题：开场白、「记得早点睡」、
 * 同一个梗反复用。上下文里虽然带着她说过的原话，但模型并不总会比对。
 *
 * 做法：把两段文字都拆成「有意义的片段」，算出重合比例。
 * 用片段而不是整句哈希，是因为复述几乎总会差几个字（换个标点、加个语气词），
 * 整句比对会全部漏过去。
 *
 * 中文不靠空格分词，所以按 2 字滑窗切：既有区分度，又不会因为分词失败而误判。
 */
export function repeatRatio(text, previous) {
  const norm = (s) => String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?~～…；;：:"'「」『』（）()\[\]【】]/g, '')
    .toLowerCase();
  const a = norm(text);
  const b = norm(previous);
  if (!a || !b) return 0;
  // 短句单独处理。以前这里对不足 4 个字直接返回 0，「晚安」对「晚安」永远判不出来 ——
  // 而那正是最典型的口头禅复读。完全相同就是 1，包含关系按长度折算。
  if (a.length < 4 || b.length < 4) {
    if (a === b) return 1;
    // 短句被长句包含时，按长度比折算，不能一律 0.9。
    //
    // 「在的」vs「在的呀」：3/4 的长度，确实是同一句，判 0.9 合理。
    // 「早点睡」vs「今天辛苦了，记得早点睡哦，明天还有会」：短句只占长句的一小段，
    // 那是「顺口提到」，不是复述。以前一律给 0.9 会把这种判成重复。
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length <= b.length ? b : a;
    if (shorter.length >= 2 && longer.includes(shorter)) {
      const coverage = shorter.length / longer.length;
      // 只有短句占长句一半以上，才算「同一句的两个版本」。
      return coverage >= 0.5 ? 0.9 : 0;
    }
    return 0;
  }
  const grams = (s) => {
    const set = new Set();
    for (let i = 0; i + 2 <= s.length; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(a);
  const gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let hit = 0;
  for (const g of ga) if (gb.has(g)) hit += 1;
  // 除以「较短那一段」的片段数，而不是固定除 a。
  // 复述几乎总是改写：加个语气词、换个标点、多一句尾巴。
  // 拿长的那段当分母时，「嗯嗯，记得早点睡吧」对「记得早点睡哦」只有 0.57，
  // 永远够不到阈值；改成除以较短段就能反映「核心内容基本一样」。
  return hit / Math.min(ga.size, gb.size);
}

/**
 * 在最近她说过的话里，找出与 text 最像的一条。
 *
 * 返回 { ratio, text } —— ratio 为 0 表示没找到明显重复。
 * 只看她自己发的（direction === 'out'），别人说的话重复不算问题。
 */
/**
 * 抽「话题词」：连续 2–4 个汉字里，去掉虚词和代词后剩下的片段。
 *
 * 为什么需要它：同一件事可以换很多说法。
 * 「今天下雨了，出门记得带伞」和「外面今天下雨了，别忘了带伞哦」
 * 字面相似度只有 0.50，但说的明明是同一件事。
 * 光比对字面会漏掉这类复述，所以再按话题词交集判一次。
 */
export function topicWords(text) {
  const s = String(text ?? '')
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .trim();
  if (!s) return [];
  const STOP = new Set([
    '今天', '明天', '昨天', '现在', '刚才', '已经', '还是', '就是', '这样', '那样',
    '什么', '怎么', '为什么', '可以', '应该', '真的', '有点', '一下', '一个', '这个', '那个',
    '我们', '你们', '他们', '自己', '东西', '事情', '时候', '地方', '感觉', '知道',
    '记得', '不要', '不会', '没有', '然后', '但是', '因为', '所以', '如果',
  ]);
  const out = new Set();
  for (const chunk of s.split(/\s+/)) {
    if (!chunk || chunk.length < 2) continue;
    // 英文/数字整体算一个词
    if (/^[a-zA-Z0-9]+$/.test(chunk)) { out.add(chunk.toLowerCase()); continue; }
    // 中文按 2–4 字滑窗取片段，再滤掉虚词
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= chunk.length; i++) {
        const w = chunk.slice(i, i + n);
        if (STOP.has(w)) continue;
        if (/^[的一了是不在有个和就都也还我你他她它这那就很太更最]+$/.test(w)) continue;
        out.add(w);
      }
    }
  }
  return [...out];
}

/**
 * 两条文本共有的、最长的若干个话题词。
 * 取最长的若干条，短片段（2 字）噪音大，长片段才真正代表「说的事」。
 */
export function sharedTopics(a, b, { max = 3 } = {}) {
  const share = new Set(topicWords(a));
  const other = new Set(topicWords(b));
  const common = [...share].filter((w) => other.has(w));
  // 去掉被更长片段包含的短片段：有「下雨了」就不必再留「下雨」。
  const kept = common.filter((w) => !common.some((o) => o !== w && o.includes(w) && o.length > w.length));
  return kept.sort((x, y) => y.length - x.length).slice(0, max);
}

export function findRepeatedReply(text, recentOutbound, { threshold = 0.7, window = 12 } = {}) {
  const mine = (Array.isArray(recentOutbound) ? recentOutbound : [])
    // 只比她说过的话。别人说「记得早点睡」不算她重复。
    .filter((m) => m && m.direction === 'out' && typeof m.text === 'string' && m.text.trim())
    .slice(-Math.max(1, window));
  let best = { ratio: 0, text: '', topics: [] };
  for (const m of mine) {
    const ratio = repeatRatio(text, m.text);
    // 话题词只当「加权」，不能单方面把结果抬过阈值。
    //
    // 以前的写法是：只要有一个 3 字以上的共同片段，就把有效相似度写成
    // Math.max(ratio, 0.75) —— 而默认阈值是 0.7，等于「一个三字词就直接判重」。
    // 「我去吃饭了」对「你吃饭了吗」共有一个「吃饭了」就被判成复读；
    // 「早点睡」对「今天辛苦了，记得早点睡哦」也是。这类日常词太常见了。
    //
    // 现在改成：片段只贡献有限加分（最多 +0.15），且加分后仍要跨过阈值。
    // 真正同义改写的两条（字面 0.5、片段重合度高）仍然能被抓住，
    // 但单个日常三字词不足以构成复读。
    const topics = sharedTopics(text, m.text);
    const longTopics = topics.filter((t) => t.length >= 3);
    // 有几个「实质话题」重合：越多越可能是同一件事。
    //
    // 门槛是「至少 2 个不同的长片段」。单个三字词（吃饭了 / 早点睡 / 下雨了）
    // 在中文里太常见，一个不足以说明说的是同一件事 —— 那正是之前误判的根源。
    // 两个以上（今天下雨 + 带伞）才可能是真的在讲同一件事。
    const bonus = longTopics.length >= 2 ? Math.min(0.30, 0.10 + longTopics.length * 0.08) : 0;
    const effective = ratio + bonus;
    if (effective > best.ratio) best = { ratio: effective, text: m.text, topics };
  }
  return best.ratio >= threshold ? best : { ratio: best.ratio, text: '', topics: [] };
}