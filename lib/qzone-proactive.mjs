/**
 * Proactive QZone posts ("主动发动态").
 *
 * The transport already exists (`QzoneHttp.publish`); what was missing is the
 * decision layer: when to post, what to post, and — the part that actually
 * matters — how to guarantee a slot never produces two 说说.
 *
 * Three design choices, each of which replaces a specific failure mode:
 *
 *   - SLOTS ARE SEEDED BY DATE, not rolled per tick. A naive `Math.random()`
 *     check inside a 60-second poll loop re-rolls every minute, so the post time
 *     is uniform noise and a restart changes it. Here the day's slot times are a
 *     pure function of (date, maxPerDay, window), so they survive a restart and
 *     are stable enough to reason about.
 *
 *   - THE COMPOSED TEXT IS PERSISTED BEFORE PUBLISHING. If the publish call dies
 *     mid-flight the process cannot know whether the post landed. Keeping the
 *     exact text means the confirmation step can look for THAT text rather than
 *     for whatever the model happens to write on the retry.
 *
 *   - A SLOT IS BURNED ON "sent" *AND* ON "uncertain". Reporting uncertainty is
 *     correct; retrying is not. A duplicate 说说 on someone's public timeline is
 *     worse than a missed one, so only a definite failure (`code != 0`) is
 *     eligible for another attempt, and even that is capped.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { isoDate, hhmmOf, minutesOf } from './virtual-life.mjs';
import { toneSnapshot, bandAt } from './qzone-tone.mjs';

const VERSION = 1;
const MAX_ATTEMPTS = 3;
/** How long after its scheduled time a slot may still fire. */
const DEFAULT_GRACE_MINUTES = 15;

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** `HH:MM`, or NaN when the string is not a usable time of day. */
export function parseClock(value) {
  const minutes = minutesOf(value);
  return Number.isFinite(minutes) ? minutes : NaN;
}

export class QzoneProactive {
  constructor({ dataDir, logger = console } = {}) {
    this.root = join(dataDir, 'qzone-proactive');
    this.file = join(this.root, 'state.json');
    this.logger = logger;
    this.state = {
      version: VERSION,
      // { 'YYYY-MM-DD': ['qzone-2026-01-01-0', ...] }
      fired: {},
      // 每个槽位已经失败的次数。必须独立于 pending 保存：明确的失败会清掉
      // pending 等下一轮重试，如果计数跟着 pending 一起没了，重试就永远
      // 到不了上限，变成无限重发。
      attempts: {},
      // A composed-but-not-yet-confirmed post. At most one at a time.
      pending: null,
      // Newest last; capped, because this is a receipt log, not an archive.
      history: [],
    };
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION) this.state = { ...this.state, ...raw };
    } catch { /* missing or corrupt state starts clean */ }
    this.loaded = true;
    return this;
  }

  /**
   * 写盘。
   *
   * **失败必须让调用方知道。** 以前 catch 之后只打日志、返回的 Promise 仍然成功。
   * 发布顺序是「先 setPending 落盘 → 请求空间 → markFired 清 pending 并烧槽位」。
   * 若 setPending 写进去了、markFired 这次写盘失败：内存里槽位已烧、pending 已空，
   * 磁盘上仍是「待发布」。进程活着时不会再发，一重启就重走一遍 ——
   * 第一次如果已经出现在空间里，就是第二条重复的说说。
   * 现在让失败沿着 writeChain 传播出去，调用方据此决定要不要清内存状态。
   */
  #save() {
    const next = this.writeChain.then(async () => {
      // Re-create the directory every write: the data dir can be cleaned while
      // the plugin is running, and a rename into a missing folder fails silently.
      await mkdir(this.root, { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify(this.state, null, 2) + '\n');
      await rename(tmp, this.file);
    });
    // writeChain 吞掉失败，保证后续写入还能继续排队；但把真实结果返回给调用方。
    this.writeChain = next.catch((error) => {
      this.logger.warn?.('动态调度状态写入失败：' + error.message);
    });
    return next;
  }

  get pending() { return this.state.pending ?? null; }
  get lastPostAt() {
    const last = this.state.history[this.state.history.length - 1];
    return last ? Number(last.at) || 0 : 0;
  }

  /**
   * 今天要不要发 —— 每天抽一次签，结果由日期决定。
   *
   * 这是整个功能里最容易写错的地方。看起来自然的写法是在轮询里掷骰子：
   *
   *   if (Math.random() * 100 < cfg.dailyChance) { ... }   // 不要这样做
   *
   * 60 秒轮询一天要跑 1440 次，30% 的概率在那一天里几乎必然命中，
   * 于是「30% 的日子发」悄悄变成了「每天都发」。而且重启一次结果就变了。
   *
   * 用日期做种子，抽签结果当天固定：命中就是命中，不命中一整天都不发。
   * `value < chance` 在 0–99 上取值，所以 chance=100 恒成立、chance=0 恒不成立。
   */
  dayRoll(date = new Date(), { dailyChance = 100 } = {}) {
    const key = isoDate(date);
    const chance = Math.min(100, Math.max(0, Math.round(Number(dailyChance) || 0)));
    const value = hashSeed(key + ':qzone:daily') % 100;
    return { date: key, chance, value, pass: value < chance };
  }

  /**
   * The day's slot times, as a pure function of the date.
   *
   * The window is cut into `count` equal buckets and each bucket gets one slot,
   * so times can never collide or come out in a different order than intended.
   * Bucketing also means adding a slot shifts the others by less than a bucket
   * instead of re-rolling the whole day.
   */
  slotsFor(date, { maxPerDay = 2, windowStart = '08:00', windowEnd = '23:00' } = {}) {
    const count = Math.min(6, Math.max(0, Math.round(Number(maxPerDay) || 0)));
    if (!count) return [];
    const start = parseClock(windowStart);
    const end = parseClock(windowEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
    const span = end - start;
    // Below ~20 minutes per slot the times are indistinguishable and the
    // min-gap check would block most of them anyway.
    if (span < count * 20) return [];

    const key = isoDate(date);
    const slots = [];
    for (let i = 0; i < count; i++) {
      const lo = start + Math.floor((span * i) / count);
      const hi = start + Math.floor((span * (i + 1)) / count);
      const width = Math.max(1, hi - lo);
      const at = lo + (hashSeed(key + ':qzone:' + i) % width);
      slots.push({
        id: 'qzone-' + key + '-' + i,
        index: i,
        at: hhmmOf(at),
        minutes: at,
        fired: (this.state.fired[key] ?? []).includes('qzone-' + key + '-' + i),
      });
    }
    return slots;
  }

  /**
   * Slots that are due right now and have not fired yet.
   *
   * 每日抽签没中时直接返回空列表 —— 判断放在这里而不是调用方，是为了让
   * 「今天不发」对所有入口（定时、面板、工具）都一致生效。
   */
  dueSlots(date, minutes, cfg, { graceMinutes = DEFAULT_GRACE_MINUTES } = {}) {
    if (!this.dayRoll(date, cfg).pass) return [];
    return this.slotsFor(date, cfg)
      .filter((slot) => !slot.fired)
      .filter((slot) => minutes >= slot.minutes && minutes < slot.minutes + graceMinutes);
  }

  /**
   * Record a composed post so a retry reuses the exact same text.
   *
   * `attempts` is seeded from the per-slot counter rather than 0: a definite
   * failure clears `pending` and lets the next poll try again, so resetting the
   * count here would make the attempt cap unreachable.
   */
  async setPending({ slotId, text, at = Date.now() }) {
    this.state.pending = {
      slotId, text: String(text ?? ''), at,
      attempts: Number(this.state.attempts?.[slotId] ?? 0),
    };
    await this.#save();
    return this.state.pending;
  }

  /** Count one publish attempt against the pending post. */
  async bumpAttempt() {
    if (!this.state.pending) return 0;
    const { slotId } = this.state.pending;
    const next = Number(this.state.pending.attempts ?? 0) + 1;
    this.state.pending.attempts = next;
    this.state.attempts ??= {};
    this.state.attempts[slotId] = next;
    await this.#save();
    return next;
  }

  get maxAttempts() { return MAX_ATTEMPTS; }

  /**
   * Burn a slot and record the outcome.
   *
   * Called for `sent` and `uncertain` alike: the slot must never fire twice.
   * `failed` is recorded too, but by the caller only after the attempt cap, so a
   * transient error gets its retries first.
   */
  async markFired(date, slotId, entry = {}) {
    const key = isoDate(date);
    const list = this.state.fired[key] ?? [];
    if (slotId && !list.includes(slotId)) list.push(slotId);
    this.state.fired[key] = list;
    this.state.pending = null;
    // 槽位已了结，计数没有继续保留的意义。
    if (slotId && this.state.attempts) delete this.state.attempts[slotId];

    this.state.history.push({
      at: Number(entry.at ?? Date.now()),
      date: key,
      slotId: slotId ?? '',
      status: String(entry.status ?? 'unknown'),
      tid: String(entry.tid ?? ''),
      text: String(entry.text ?? '').slice(0, 2000),
      message: String(entry.message ?? '').slice(0, 300),
      attempts: Number(entry.attempts ?? 1),
      manual: entry.manual === true,
    });
    if (this.state.history.length > 50) this.state.history = this.state.history.slice(-50);

    // Three days of slot bookkeeping is plenty: slots are date-scoped, so an
    // older key can never be consulted again.
    const cutoff = isoDate(new Date(Date.now() - 3 * 86400000));
    for (const old of Object.keys(this.state.fired)) if (old < cutoff) delete this.state.fired[old];
    try {
      await this.#save();
    } catch (error) {
      // 内存状态已经改好（槽位已烧、pending 已清），但磁盘没记住。
      // 标一个标记，让 snapshot() 和面板能看到「重启后可能重发」，
      // 而不是静默地把内存当成已经落盘。
      this.state.dirty = true;
      this.state.dirtyAt = Date.now();
      throw error;
    }
  }

  /** Drop the pending post without burning its slot (used after a definite failure). */
  async clearPending() {
    if (!this.state.pending) return;
    this.state.pending = null;
    await this.#save();
  }

  /** Everything the panel shows. */
  snapshot(cfg = {}) {
    const today = new Date();
    const key = isoDate(today);
    const fired = this.state.fired[key] ?? [];
    const slots = this.slotsFor(today, cfg);
    return {
      today: key,
      // 今天抽签的结果，面板据此显示「今天发 / 今天跳过」。
      daily: this.dayRoll(today, cfg),
      // 当前时段的语气信息，以及每个槽位自己的时段（槽位可能跨时段）。
      tone: toneSnapshot(today.getHours() * 60 + today.getMinutes()),
      slots: slots.map((slot) => ({
        ...slot,
        fired: fired.includes(slot.id),
        tone: toneSnapshot(slot.minutes),
      })),
      firedToday: fired.length,
      attempts: { ...(this.state.attempts ?? {}) },
      lastPostAt: this.lastPostAt || null,
      pending: this.state.pending
        ? { slotId: this.state.pending.slotId, at: this.state.pending.at, attempts: this.state.pending.attempts ?? 0, text: this.state.pending.text }
        : null,
      history: [...this.state.history].slice(-20).reverse(),
    };
  }

  async reset() {
    this.state.fired = {};
    this.state.attempts = {};
    this.state.pending = null;
    this.state.history = [];
    await this.#save();
    return this.snapshot();
  }
}