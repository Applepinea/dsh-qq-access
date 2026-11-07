/**
 * Virtual life: a generated week, a wardrobe and a meal pool.
 *
 * Distilled from astrbot_plugin_virtual_life, but the generation strategy is
 * different on purpose. That plugin regenerates a schedule every morning and
 * delays replies by an "interruptibility" score; both need a daily timer and a
 * second LLM call per day. Here:
 *
 *   - the SCHEDULE is generated ONCE as a seven-day template and reused, with a
 *     per-weekday variation so the week does not read as one day repeated;
 *   - OUTFITS and MEALS are generated once as POOLS and drawn at random each day;
 *   - PROACTIVE MESSAGES reuse the existing 60-second poll loop instead of adding
 *     a scheduler, because a second timer inside a plugin that is disposed with
 *     the host is how the shutdown bug happened.
 *
 * The result is one generation call for the week rather than one per day, and a
 * persona that keeps a stable life instead of one that is rewritten every morning.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 1;

export const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export const STATES = ['sleep', 'busy', 'focus', 'transit', 'available', 'social'];
export const STATE_LABELS = {
  sleep: '睡觉', busy: '忙碌', focus: '专注', transit: '通勤', available: '空闲', social: '社交',
};

/** Minutes since midnight for a `HH:MM` string, or NaN. */
export function minutesOf(hhmm) {
  const m = String(hhmm ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return NaN;
  return h * 60 + min;
}

export function hhmmOf(minutes) {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/**
 * Validate and normalise one day's timeline.
 *
 * The generator is asked for a gap-free 00:00..24:00 chain, but a model will
 * occasionally emit one anyway. Rather than reject the whole week, the segments
 * are sorted, clamped and stitched: a slightly-adjusted day is far more useful
 * than no schedule at all.
 */
export function normalizeTimeline(items) {
  const parsed = [];
  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const start = minutesOf(raw.start);
    let end = minutesOf(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    if (end <= start) continue;
    const activity = String(raw.activity ?? '').trim();
    if (!activity) continue;
    parsed.push({
      id: String(raw.id ?? `item-${parsed.length + 1}`).trim() || `item-${parsed.length + 1}`,
      start, end,
      activity: activity.slice(0, 80),
      location: String(raw.location ?? '').trim().slice(0, 40),
      state: STATES.includes(String(raw.state)) ? String(raw.state) : 'available',
      availability: ['blocked', 'low', 'normal', 'high'].includes(String(raw.availability))
        ? String(raw.availability) : 'normal',
    });
  }
  if (!parsed.length) return [];
  parsed.sort((a, b) => a.start - b.start);

  // Stitch: force the first to start at 00:00, the last to end at 24:00, and make
  // every boundary meet the previous end so lookups never fall into a hole.
  const out = [];
  for (const item of parsed) {
    const prev = out[out.length - 1];
    const start = prev ? prev.end : 0;
    const end = Math.max(start + 1, item.end);
    if (end <= start) continue;
    out.push({ ...item, start, end: Math.min(1440, end), id: item.id || `item-${out.length + 1}` });
  }
  if (out.length) {
    out[0].start = 0;
    out[out.length - 1].end = 1440;
  }
  // Collapse any zero-length remainder created by clamping.
  return out.filter((item) => item.end > item.start);
}

/** The timeline entry active at a given minute. */
export function itemAt(timeline, minutes) {
  for (const item of timeline ?? []) {
    if (minutes >= item.start && minutes < item.end) return item;
  }
  return null;
}

/** `HH:MM - HH:MM` for display. */
export function span(item) {
  return hhmmOf(item.start) + '-' + (item.end >= 1440 ? '24:00' : hhmmOf(item.end));
}

/** Validate one outfit object. */
export function normalizeOutfit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const pieces = [];
  for (const piece of Array.isArray(raw.pieces) ? raw.pieces : []) {
    if (!piece || typeof piece !== 'object') continue;
    const name = String(piece.name ?? '').trim();
    if (!name) continue;
    pieces.push({
      category: String(piece.category ?? 'other').trim().slice(0, 20),
      name: name.slice(0, 60),
      detail: String(piece.detail ?? '').trim().slice(0, 120),
    });
  }
  if (!pieces.length) return null;
  return {
    id: String(raw.id ?? '').trim() || `outfit-${Math.random().toString(36).slice(2, 8)}`,
    style: String(raw.style ?? '').trim().slice(0, 40),
    summary: String(raw.summary ?? '').trim().slice(0, 120),
    pieces: pieces.slice(0, 16),
  };
}

/** Validate one meal object. */
export function normalizeMeal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const dishes = (Array.isArray(raw.dishes) ? raw.dishes : [])
    .map((d) => String(d ?? '').trim())
    .filter(Boolean)
    .slice(0, 10);
  if (!dishes.length) return null;
  return {
    id: String(raw.id ?? '').trim() || `meal-${Math.random().toString(36).slice(2, 8)}`,
    slot: ['breakfast', 'lunch', 'dinner'].includes(String(raw.slot)) ? String(raw.slot) : 'lunch',
    place: String(raw.place ?? '').trim().slice(0, 40),
    dishes,
    note: String(raw.note ?? '').trim().slice(0, 100),
  };
}

export const MEAL_SLOTS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };

export class VirtualLife {
  constructor({ dataDir, logger = console } = {}) {
    this.root = join(dataDir, 'virtual-life');
    this.file = join(this.root, 'life.json');
    this.logger = logger;
    this.state = {
      version: VERSION,
      generatedAt: null,
      personaHash: null,
      // week: { '0'..'6': { theme, mood, timeline: [...] } } indexed by JS weekday.
      week: null,
      longTerm: '',
      outfits: [],
      meals: [],
      // Per-day draws, keyed by ISO date, so a day's outfit/meals stay stable
      // once chosen instead of re-rolling on every message.
      draws: {},
      // Proactive bookkeeping: which windows already fired, per ISO date.
      fired: {},
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
    } catch { /* a missing or corrupt file starts empty */ }
    this.loaded = true;
    return this;
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      // Re-create the directory on every write: the plugin can outlive a manual
      // cleanup of its data dir, and a rename into a missing folder fails silently
      // otherwise (which is how a whole generation could be lost).
      await mkdir(this.root, { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify(this.state, null, 2) + '\n');
      // Atomic replace: a crash mid-write must not leave a truncated life file.
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('虚拟人生写入失败：' + error.message));
    return this.writeChain;
  }

  get ready() {
    return Boolean(this.state.week && Object.keys(this.state.week).length === 7);
  }

  /** Everything the panel shows. */
  snapshot() {
    return {
      ready: this.ready,
      generatedAt: this.state.generatedAt,
      longTerm: this.state.longTerm,
      week: this.state.week,
      outfits: this.state.outfits,
      meals: this.state.meals,
      counts: {
        days: this.state.week ? Object.keys(this.state.week).length : 0,
        outfits: this.state.outfits.length,
        meals: this.state.meals.length,
      },
    };
  }

  /** Replace the generated week. */
  async setWeek({ week, longTerm, outfits, meals, personaHash }) {
    await this.init();
    this.state.week = week;
    this.state.longTerm = String(longTerm ?? '').slice(0, 1200);
    this.state.outfits = (Array.isArray(outfits) ? outfits : []).map(normalizeOutfit).filter(Boolean).slice(0, 60);
    this.state.meals = (Array.isArray(meals) ? meals : []).map(normalizeMeal).filter(Boolean).slice(0, 80);
    this.state.generatedAt = Date.now();
    this.state.personaHash = personaHash ?? null;
    // A regenerated week invalidates today's draws and fired windows.
    this.state.draws = {};
    this.state.fired = {};
    await this.#save();
    return this.snapshot();
  }

  /** Drop everything generated so far. */
  async reset() {
    await this.init();
    this.state.week = null;
    this.state.outfits = [];
    this.state.meals = [];
    this.state.longTerm = '';
    this.state.generatedAt = null;
    this.state.draws = {};
    this.state.fired = {};
    await this.#save();
    return this.snapshot();
  }

  /** The plan for one ISO date. */
  planFor(date = new Date()) {
    if (!this.ready) return null;
    // JS getDay(): 0 = Sunday. WEEKDAYS starts at Monday, so shift.
    const index = (date.getDay() + 6) % 7;
    const day = this.state.week[String(index)];
    if (!day) return null;
    return { ...day, weekday: WEEKDAYS[index], index };
  }

  /**
   * Today's outfit and meals, drawn once per date.
   *
   * Drawing is seeded by the date so the same day always yields the same result
   * even across a restart, while different days differ.
   */
  drawFor(date = new Date()) {
    const key = isoDate(date);
    if (!this.ready) return { outfit: null, meals: [] };
    const existing = this.state.draws[key];
    if (existing) return existing;
    const outfit = this.state.outfits.length
      ? this.state.outfits[hashSeed(key + ':outfit') % this.state.outfits.length]
      : null;
    // Each meal slot draws from its own hash of (date, slot).
    //
    // A single shared seed plus a per-slot constant offset looks random but is not:
    // every day shifts all three slots by the same amount, so only one combination
    // per pool size ever appears. Hashing the slot name into the seed makes the
    // three choices independent, which is what "随意排列组合" actually requires.
    const meals = [];
    for (const slot of Object.keys(MEAL_SLOTS)) {
      const pool = this.state.meals.filter((m) => m.slot === slot);
      if (!pool.length) continue;
      meals.push(pool[hashSeed(key + ':meal:' + slot) % pool.length]);
    }
    const draw = { outfit, meals };
    this.state.draws[key] = draw;
    // Keep only the last 14 draws: this is a cache, not history.
    const keys = Object.keys(this.state.draws).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 14))) delete this.state.draws[old];
    this.#save();
    return draw;
  }

  /** The proactive windows for one date that are due at `minutes`. */
  dueWindows(date, minutes, { graceMinutes = 10 } = {}) {
    const plan = this.planFor(date);
    if (!plan?.proactiveWindows?.length) return [];
    const key = isoDate(date);
    const fired = this.state.fired[key] ?? [];
    return plan.proactiveWindows.filter((w) => {
      const at = minutesOf(w.at);
      if (!Number.isFinite(at)) return false;
      if (fired.includes(w.id)) return false;
      return minutes >= at && minutes < at + graceMinutes;
    });
  }

  /** Remember that a window fired, so it never fires twice. */
  async markFired(date, windowId) {
    const key = isoDate(date);
    const list = this.state.fired[key] ?? [];
    if (!list.includes(windowId)) list.push(windowId);
    this.state.fired[key] = list;
    // Keep two days of bookkeeping.
    for (const old of Object.keys(this.state.fired)) {
      if (old < isoDate(new Date(Date.now() - 2 * 86400000))) delete this.state.fired[old];
    }
    await this.#save();
  }

  /** A short human-readable status for prompt injection. */
  describe(date = new Date(), minutes = nowMinutes()) {
    const plan = this.planFor(date);
    if (!plan) return '';
    const current = itemAt(plan.timeline, minutes);
    const draw = this.drawFor(date);
    const lines = [];
    lines.push(`今天是${plan.weekday}，主题「${plan.theme || '日常'}」，心情${plan.mood || '平静'}。`);
    if (current) {
      lines.push(`现在是${hhmmOf(minutes)}，你正在${current.activity}${current.location ? '（' + current.location + '）' : ''}，状态是${STATE_LABELS[current.state] ?? current.state}。`);
    }
    if (draw.outfit) {
      const pieces = draw.outfit.pieces.slice(0, 6).map((p) => p.name).join('、');
      lines.push(`今天穿的是${draw.outfit.style || '日常'}：${pieces}。`);
    }
    for (const meal of draw.meals) {
      lines.push(`${MEAL_SLOTS[meal.slot]}在${meal.place || '附近'}吃${meal.dishes.slice(0, 4).join('、')}。`);
    }
    return lines.join('\n');
  }
}

export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function hashSeed(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}