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

export function integer(value, fallback, min, max, label = '参数') {
  if (value === undefined) return fallback;
  assert(Number.isInteger(value) && value >= min && value <= max, `${label}必须是 ${min}–${max} 的整数`);
  return value;
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
