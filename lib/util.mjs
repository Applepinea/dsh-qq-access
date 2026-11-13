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
  wait(peer, signal, paceMs = 0) {
    return this.#mutex.run(async () => {
      checkSignal(signal);
      let now = Date.now();
      this.#minute = this.#minute.filter(t => now - t < 60_000);
      const quotaWait = this.#minute.length >= this.maxPerMinute ? this.#minute[0] + 60_000 - now : 0;
      const peerGap = paceMs > 0 ? paceMs : this.peerGapMs;
      const ms = Math.max(0, this.#lastGlobal + this.globalGapMs - now, (this.#lastPeer.get(peer) ?? 0) + peerGap - now, quotaWait);
      if (ms > 0) await delay(ms, undefined, { signal });
      now = Date.now();
      this.#lastGlobal = now;
      this.#lastPeer.set(peer, now);
      if (this.#lastPeer.size > 10_000) this.#lastPeer.delete(this.#lastPeer.keys().next().value);
      this.#minute = this.#minute.filter(t => now - t < 60_000);
      this.#minute.push(now);
    });
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
