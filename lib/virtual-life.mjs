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

/**
 * 把模型写的天气标签整理成固定集合。
 *
 * 模型可能写「雨天」「下雨」「小雨」，这里统一成 `rain`。
 * 认不出来的标签直接丢掉 —— 留着会让过滤逻辑以为它匹配上了。
 */
export function normalizeWeatherTags(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,，、\s]+/);
  const tags = new Set();
  for (const item of list) {
    const text = String(item ?? '').trim().toLowerCase();
    if (!text) continue;
    if (/雨|rain|shower|storm/.test(text)) tags.add('rain');
    else if (/雪|snow/.test(text)) tags.add('snow');
    else if (/晴|sun|clear/.test(text)) tags.add('sun');
    else if (/阴|云|overcast|cloud/.test(text)) tags.add('cloud');
    else if (/风|wind/.test(text)) tags.add('wind');
    // any 表示「任何天气都能穿」，用于打底、内衣这类。
    else if (/any|通用|都行/.test(text)) tags.add('any');
  }
  return [...tags];
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

  // 温度区间：模型可能给 "7-15"、"7~15"、[7,15] 或 {min,max}。
  // 解析不出来就留 null，drawFor 会把「没有区间」当成任何温度都行。
  //
  // 这里刻意接受多种写法：模型对 tempRange 这个名字明显不敏感，
  // 两轮生成 34 套里一次都没写出来。多认几种，比反复调提示词有效。
  let tempMin = null;
  let tempMax = null;
  const pickNum = (...values) => {
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return NaN;
  };

  // 1) 平铺的两个字段，最直观，优先认。
  tempMin = pickNum(raw.tempMin, raw.minTemp, raw.minimumTemp, raw.lowestTemp);
  tempMax = pickNum(raw.tempMax, raw.maxTemp, raw.maximumTemp, raw.highestTemp);

  // 2) 区间对象/数组/字符串。
  if (!Number.isFinite(tempMin) || !Number.isFinite(tempMax)) {
    const range = raw.tempRange ?? raw.temperatureRange ?? raw.temp ?? raw.temperature ?? null;
    if (Array.isArray(range) && range.length >= 2) {
      tempMin = pickNum(range[0]);
      tempMax = pickNum(range[1]);
    } else if (range && typeof range === 'object') {
      tempMin = pickNum(range.min, range.low, range.from);
      tempMax = pickNum(range.max, range.high, range.to);
    } else if (typeof range === 'string' || typeof range === 'number') {
      const m = String(range).match(/(-?\d+(?:\.\d+)?)\s*[-~到至]\s*(-?\d+(?:\.\d+)?)/);
      if (m) { tempMin = Number(m[1]); tempMax = Number(m[2]); }
    }
  }

  const valid = Number.isFinite(tempMin) && Number.isFinite(tempMax) && tempMin <= tempMax;
  if (!valid) { tempMin = null; tempMax = null; }

  return {
    id: String(raw.id ?? '').trim() || `outfit-${Math.random().toString(36).slice(2, 8)}`,
    style: String(raw.style ?? '').trim().slice(0, 40),
    summary: String(raw.summary ?? '').trim().slice(0, 120),
    pieces: pieces.slice(0, 16),
    weather: normalizeWeatherTags(raw.weather),
    tempMin,
    tempMax,
  };
}

/**
 * 一条预报对应哪些天气标签。
 *
 * 判据刻意宽松：降水概率到 40% 就算「可能下雨」，因为没带伞的代价比多穿一件大。
 * 温度不进标签，温度用 tempRange 单独判断。
 */
export function weatherTagsFor(forecast, { part = 'both' } = {}) {
  const tags = new Set();
  if (!forecast) return [];
  // part 决定看白天、夜间还是两者都看。
  // 白天和夜间分开，是因为「白天多云、夜里小雨」这种日子：
  // 白天穿防水冲锋衣会显得夸张，晚上出门不带伞又会淋湿。
  const day = String(forecast.textDay ?? '');
  const night = String(forecast.textNight ?? '');
  const text = part === 'day' ? day : part === 'night' ? night : day + ' ' + night;
  if (/雨|雪|雷/.test(text)) tags.add(/雪/.test(text) ? 'snow' : 'rain');
  // 降水概率是整天的，只有「看白天」时用它补 rain，
  // 否则会把白天的多云也标成雨天。
  if (part !== 'night' && Number.isFinite(Number(forecast.rainChance)) && Number(forecast.rainChance) >= 40) tags.add('rain');
  if (/晴/.test(text)) tags.add('sun');
  if (/阴|云/.test(text)) tags.add('cloud');
  if (Number.isFinite(Number(forecast.windScale)) && Number(forecast.windScale) >= 4) tags.add('wind');
  if (!tags.size) tags.add('cloud');
  return [...tags];
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
      // 主动消息的实际发送记录：{ 'YYYY-MM-DD': [at, at, ...] }。
      // 必须落盘。只放内存的话重启就清零，同一天能超额发出好几条。
      sent: {},
      // 每天抽样种子的轮次：{ 'YYYY-MM-DD': n }。
      // 重抽一次 n 加一，抽样结果就变一次；必须落盘，
      // 否则重启后又回到 r0，安排会莫名其妙变回去。
      seeds: {},
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

  /**
   * 等所有挂起的写盘完成。
   *
   * drawFor() 里的 #save() 是故意不 await 的 —— 抽个穿搭不该卡在磁盘上。
   * 但调用方要关掉数据目录（测试、迁移、清理）时，必须等它写完，
   * 否则会撞上 ENOTEMPTY：目录里还有正在写的 .tmp 文件。
   */
  async flush() {
    await this.writeChain;
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
  async setWeek({ week, longTerm, outfits, meals, personaHash, forecast }) {
    await this.init();
    this.state.week = week;
    this.state.longTerm = String(longTerm ?? '').slice(0, 1200);
    this.state.outfits = (Array.isArray(outfits) ? outfits : []).map(normalizeOutfit).filter(Boolean).slice(0, 60);
    this.state.meals = (Array.isArray(meals) ? meals : []).map(normalizeMeal).filter(Boolean).slice(0, 80);
    this.state.generatedAt = Date.now();
    // 存下生成时的预报：drawFor 要靠它决定当天从哪个子池里抽穿搭。
    // 只留日期/温度/天气这些字段，够用且不会把整个响应塞进 life.json。
    this.state.forecast = (Array.isArray(forecast) ? forecast : []).map((d) => ({
      date: String(d?.date ?? ''),
      textDay: String(d?.textDay ?? ''),
      textNight: String(d?.textNight ?? ''),
      tempMin: Number(d?.tempMin),
      tempMax: Number(d?.tempMax),
      rainChance: Number.isFinite(Number(d?.rainChance)) ? Number(d.rainChance) : null,
      windScale: Number.isFinite(Number(d?.windScale)) ? Number(d.windScale) : null,
    })).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date));
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
    this.state.forecast = [];
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
  /**
   * 今天适合穿哪几套。
   *
   * 池子是按天气预报写的，但「按日期随机抽一套」会抽错：中雨天抽到速干短袖，
   * 十四度抽到「七度出门也不抖」的大衣。所以先按当天的实际天气筛一遍，
   * 只在合适的里面抽。
   *
   * 筛选分两级，逐级放宽 —— 严格条件如果一套都不剩，宁可放宽也不要空手：
   *   1. 天气标签匹配 且 温度落在区间内
   *   2. 只要天气标签匹配（温度未知时不参与判断）
   *   3. 全部（老数据没有标签，或标签全都没命中）
   *
   * 老数据（没有 weather/tempMin/tempMax）在第 1、2 级都会被排除，
   * 但第 3 级兜底，所以升级后不必强制重新生成也能正常显示。
   */
  outfitsFor(date = new Date(), forecast = null, { part = 'both' } = {}) {
    const all = this.state.outfits ?? [];
    if (!all.length) return [];
    if (!forecast) return all;

    const tags = weatherTagsFor(forecast, { part });
    // 用当天的最低/最高温，不用平均值：
    // 平均值会把「15~18℃」压成 16.5，一套标注 8~16℃ 的外套就被判成不合身，
    // 可它明明是早上出门穿的。区间有重叠就算能用。
    const dayMin = Number.isFinite(Number(forecast.tempMin)) ? Number(forecast.tempMin) : null;
    const dayMax = Number.isFinite(Number(forecast.tempMax)) ? Number(forecast.tempMax) : null;

    const listOf = (o) => (Array.isArray(o.weather) ? o.weather : []);
    // 明确匹配：标签里有一个命中了当天的天气，且不是只靠 any 撑着的。
    const matchesExact = (o) => {
      const list = listOf(o);
      if (!list.length) return false;
      return tags.some((t) => list.includes(t));
    };
    // any 是「什么天气都能穿」的兜底，但它不该抢专门为这天写的那几套。
    const isAnyOnly = (o) => {
      const list = listOf(o);
      return list.length > 0 && !matchesExact(o) && list.includes('any');
    };
    const tempOk = (o) => {
      if (dayMin === null || dayMax === null) return true;
      if (!Number.isFinite(o.tempMin) || !Number.isFinite(o.tempMax)) return true;
      // 两段区间有交集就算合适。
      return o.tempMin <= dayMax && o.tempMax >= dayMin;
    };

    // 分级，逐级放宽。前两级都优先「专门为这天写的」，any 只在没有专门款时才上：
    //   1. 明确匹配天气 + 温度合适   ← 最理想，雨天抽到防水风衣
    //   2. 明确匹配天气             ← 温度没标或没交集，但天气对
    //   3. 只有 any                 ← 实在没有专门款，才用通用打底
    //   4. 全部                     ← 老数据没有任何标签
    const exact = all.filter(matchesExact);
    const exactTemp = exact.filter(tempOk);
    if (exactTemp.length) return exactTemp;
    if (exact.length) return exact;

    const anyOnly = all.filter(isAnyOnly);
    const anyTemp = anyOnly.filter(tempOk);
    if (anyTemp.length) return anyTemp;
    if (anyOnly.length) return anyOnly;

    return all;
  }

  /** 当天这一天的预报，没有就返回 null。 */
  forecastFor(date = new Date()) {
    const key = isoDate(date);
    return (this.state.forecast ?? []).find((d) => d.date === key) ?? null;
  }

  drawFor(date = new Date(), forecast = null) {
    const key = isoDate(date);
    if (!this.ready) return { outfit: null, eveningOutfit: null, meals: [] };
    const existing = this.state.draws[key];
    if (existing) return existing;

    const day = forecast ?? this.forecastFor(date);

    // 白天和晚上各抽一套。
    //
    // 分两套是因为「白天多云、夜里小雨」这种日子：白天穿防水冲锋衣太夸张，
    // 晚上出门不带伞又会淋湿。两套各自按对应时段的天气筛，种子也分开，
    // 否则同一天两次抽取会因为池子大小接近而经常抽到同一套。
    //
    // 晚上那套在昼夜天气一致时，允许和白天相同 —— 那本来就是一回事，
    // 硬凑成两套反而奇怪。所以只在标签不同时才另抽。
    const dayPool = this.outfitsFor(date, day, { part: 'day' });
    const outfit = dayPool.length ? dayPool[hashSeed(key + ':outfit:day') % dayPool.length] : null;

    const nightTags = day ? weatherTagsFor(day, { part: 'night' }) : [];
    const dayTags = day ? weatherTagsFor(day, { part: 'day' }) : [];
    const sameWeather = nightTags.length && dayTags.length
      && nightTags.every((t) => dayTags.includes(t)) && dayTags.every((t) => nightTags.includes(t));

    let eveningOutfit = outfit;
    if (!sameWeather) {
      const nightPool = this.outfitsFor(date, day, { part: 'night' });
      // 夜间池子里只有一套时就用它；和白天相同时也保留，不必强行不同。
      eveningOutfit = nightPool.length ? nightPool[hashSeed(key + ':outfit:night') % nightPool.length] : outfit;
    }

    // Each meal slot draws from its own hash of (date, slot).
    //
    // A single shared seed plus a per-slot constant offset looks random but is not:
    // every day shifts all three slots by the same amount, so only one combination
    // per pool size ever appears. Hashing the slot name into the seed makes the
    // three choices independent, which is what 随意排列组合 actually requires.
    const meals = [];
    for (const slot of Object.keys(MEAL_SLOTS)) {
      const mealsPool = this.state.meals.filter((m) => m.slot === slot);
      if (!mealsPool.length) continue;
      meals.push(mealsPool[hashSeed(key + ':meal:' + slot) % mealsPool.length]);
    }
    const draw = { outfit, eveningOutfit, meals };
    this.state.draws[key] = draw;
    // Keep only the last 14 draws: this is a cache, not history.
    const keys = Object.keys(this.state.draws).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - 14))) delete this.state.draws[old];
    this.#save();
    return draw;
  }

  /**
   * 某个窗口在某一天实际落在几点。
   *
   * 模型写的 `at` 是「大概这个点」，直接用会每天分秒不差，几天就能看出是机器发的。
   * 这里按 (日期, 窗口 id) 播种出一个偏移量，于是：
   *   - 同一天永远是同一个时间，重启、多次调用都不变
   *   - 不同天不同，前后抖动
   *   - 不在轮询里现抽，否则 60 秒一次的轮询等于必然提前触发
   *
   * 偏移范围是 ±jitter，但会夹在 0:00–23:59 之内，避免跨到前一天或后一天。
   */
  windowAt(date, window, { jitterMinutes = 0 } = {}) {
    const base = minutesOf(window?.at);
    if (!Number.isFinite(base)) return NaN;
    const jitter = Math.max(0, Number(jitterMinutes) || 0);
    if (!jitter) return base;
    const key = isoDate(date);
    // 两倍范围加一，取模后减去 jitter，得到 [-jitter, +jitter]。
    const span = jitter * 2 + 1;
    const offset = (hashSeed(key + ':proactive-at:' + String(window?.id ?? '')) % span) - jitter;
    return Math.min(23 * 60 + 59, Math.max(0, base + offset));
  }

  /**
   * 当天抽样用的种子。
   *
   * 默认是 'r0'，重抽一次变 'r1'、'r2'……
   * 种子存在 state.seeds[日期] 里，所以重启后还是同一个值 ——
   * 否则每次重启都会重抽，用户会觉得「她的安排怎么老在变」。
   *
   * 只按日期播种的话，同一天怎么重抽结果都一样，重抽按钮就没意义了。
   */
  daySeed(date = new Date()) {
    const key = isoDate(date);
    const n = Number(this.state.seeds?.[key] ?? 0);
    return 'r' + (Number.isFinite(n) ? n : 0);
  }

  /**
   * 今天所有主动消息的时间点。
   *
   * 和旧实现的关键差别：次数不再由模型给的窗口数决定，
   * 而是按日期从 0..maxPerDay 里按正态分布抽一个数。
   * 旧实现每天只有 0-2 个窗口，配额写 5 也只能发 1 次。
   *
   * 返回 `[{ id, at, intent, audience }]`，`at` 是 HH:MM 字符串 ——
   * 和模型生成的窗口保持同一种形状，调用方不用改。
   */
  plannedWindows(date = new Date(), { maxPerDay = 5, minGapMinutes = 60, spread = 0.5, seed = '', jitterMinutes = 0, defaultAudience = 'private' } = {}) {
    const plan = this.planFor(date);
    if (!plan) return [];
    const key = isoDate(date);
    // 没显式传 seed 就用当天的（可能已经被重抽过若干次）。
    const daySeed = seed || this.daySeed(date);
    const timeline = plan.timeline ?? [];
    // 模型写的窗口按 intent 保留：那是它自己想的「想说什么」，比通用文案自然。
    const authored = Array.isArray(plan.proactiveWindows) ? plan.proactiveWindows : [];

    const count = sampleDailyCount(date, maxPerDay, spread, daySeed);
    if (count === 0) return [];

    // 时间随机幅度：在各自所属的可用时段内前后挪动，不跨出时段。
    // 按 (日期, 种子, 序号) 播种，所以同一天稳定；0 表示精确按抽到的点。
    // 面板上那个「时间随机幅度」滑块就是这个值 —— 抽样的抖动只决定
    // 「落在时段的哪个位置」，这个值决定「在那个位置附近再晃多少」。
    const jitter = Math.max(0, Number(jitterMinutes) || 0);
    const spans = (Array.isArray(timeline) ? timeline : [])
      .filter((t) => ['available', 'social'].includes(String(t?.state)))
      .map((t) => ({ start: Number(t.start), end: Number(t.end) }))
      .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
    const shift = (minutes, index) => {
      if (!jitter) return minutes;
      const span = spans.find((s) => minutes >= s.start && minutes < s.end);
      if (!span) return minutes;
      const offset = (hashSeed(key + ':jit:' + daySeed + ':' + index) % (jitter * 2 + 1)) - jitter;
      return Math.min(span.end - 1, Math.max(span.start, minutes + offset));
    };

    const times = sampleDailyTimes(date, { count, timeline, minGapMinutes, seed: daySeed });
    return times.map((minutes, index) => {
      // 前几个用模型写的 intent，用完就用通用的。
      // 不重复用同一个 intent，否则一天里几次都说着同一句话。
      const src = authored[index];
      return {
        id: `w-${key}-${daySeed}-${index}`,
        at: hhmmOf(shift(minutes, index)),
        intent: src?.intent || '想随口说点什么',
        // 模型没写 audience 时不能一律当私聊。
      // 用户只打开「群聊主动」时不填这里，这些窗口会以 no-target 结束 ——
      // 表现就是「点测试能发到群，到点却不发」（测试窗口的受众是 both）。
      // 由调用方通过 defaultAudience 传入当前允许的受众。
      audience: src?.audience || defaultAudience,
      };
    });
  }
  dueWindows(date, minutes, { graceMinutes = 10, jitterMinutes = 0, maxPerDay = 5, minGapMinutes = 60, spread = 0.5, defaultAudience = 'private' } = {}) {
    const windows = this.plannedWindows(date, { maxPerDay, minGapMinutes, spread, jitterMinutes, defaultAudience });
    if (!windows.length) return [];
    const key = isoDate(date);
    const fired = this.state.fired[key] ?? [];
    return windows.filter((w) => {
      // plannedWindows 已经算好时间点，不再叠加 windowAt 的抖动，
      // 否则会二次偏移，而 sampleDailyTimes 里已经做过哈希抖动。
      const at = minutesOf(w.at);
      if (!Number.isFinite(at)) return false;
      if (fired.includes(w.id)) return false;
      return minutes >= at && minutes < at + graceMinutes;
    });
  }

  /**
   * 记下一次主动发送。
   *
   * `sent` 的每一项是 `{ at, target }`：at 是时间戳，target 是 `kind:peerId`。
   * 只有时间戳的话，「上次发给谁了」就答不出来，多目标轮换顺序重启后会丢，
   * 于是一直发给列表里排第一的那个。
   *
   * 兼容旧数据：以前存的是纯数字数组 `[1794124181714]`，
   * 读取时统一走 sentList() 归一，不要求用户手动迁移。
   */
  async markFired(date, windowId, target = null) {
    const key = isoDate(date);
    const list = this.state.fired[key] ?? [];
    if (!list.includes(windowId)) list.push(windowId);
    this.state.fired[key] = list;
    // 同时记下这次发送的时间和目标。配额、最小间隔、多目标轮换都靠它。
    this.state.sent ??= {};
    const sent = sentList(this.state.sent[key]);
    sent.push({ at: Date.now(), target: target ? String(target) : null });
    this.state.sent[key] = sent;
    // Keep two days of bookkeeping.
    for (const old of Object.keys(this.state.fired)) {
      if (old < isoDate(new Date(Date.now() - 2 * 86400000))) delete this.state.fired[old];
    }
    for (const old of Object.keys(this.state.sent)) {
      if (old < isoDate(new Date(Date.now() - 2 * 86400000))) delete this.state.sent[old];
    }
    await this.#save();
  }


  /**
  /**
   * 重抽今天的主动消息安排。
   *
   * 做两件事：
   *   1. 种子加一 —— 抽样完全由 (日期, 种子) 决定，换种子就换结果，
   *      次数和时间点都会变。只清 fired 而不换种子的话，重抽出来的
   *      还是同一批时间点，按钮等于没作用。
   *   2. 清掉今天的 fired（已触发记录），否则新抽出来的窗口可能被
   *      旧的「已发」标记挡住。
   *
   * 不动 sent —— 那是真实发送记录，清掉会让配额从零开始，
   * 一天能发出的次数就超过上限了。
   */
  async resetToday(date = new Date()) {
    const key = isoDate(date);
    const cleared = (this.state.fired[key] ?? []).length;
    delete this.state.fired[key];
    this.state.seeds ??= {};
    const next = Number(this.state.seeds[key] ?? 0) + 1;
    this.state.seeds[key] = next;
    // 只留最近两天，和 fired / sent 的清理策略保持一致。
    for (const old of Object.keys(this.state.seeds)) {
      if (old < isoDate(new Date(Date.now() - 2 * 86400000))) delete this.state.seeds[old];
    }
    await this.#save();
    return {
      date: key,
      cleared,
      sentKept: sentList(this.state.sent?.[key]).length,
      seed: next,
    };
  }
  /** 今天已经主动发了几「次」。一次消息不管拆成几段，都只算一次。 */
  sentCount(date = new Date()) {
    return sentList(this.state.sent?.[isoDate(date)]).length;
  }

  /** 上一次主动发送的时间戳，没有就返回 0。 */
  lastSentAt() {
    let newest = 0;
    for (const list of Object.values(this.state.sent ?? {})) {
      for (const entry of sentList(list)) newest = Math.max(newest, entry.at);
    }
    return newest;
  }

  /**
   * 每个目标上一次收到主动消息的时间，返回 `{ 'kind:peerId': 时间戳 }`。
   *
   * 多目标时用它挑「最久没收到的那一个」，让几个会话轮流收到，
   * 而不是永远发给列表里排第一的。没有记录的目标不出现在结果里。
   */
  lastSentByTarget() {
    const out = {};
    for (const list of Object.values(this.state.sent ?? {})) {
      for (const entry of sentList(list)) {
        if (!entry.target) continue;
        out[entry.target] = Math.max(out[entry.target] ?? 0, entry.at);
      }
    }
    return out;
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
    // 白天和晚上可能不是同一套。只在她确实换了的时候才写第二句，
    // 否则每天都会出现两句几乎一样的话，读起来很啰嗦。
    if (draw.outfit) {
      const pieces = draw.outfit.pieces.slice(0, 6).map((p) => p.name).join('、');
      lines.push(`今天穿的是${draw.outfit.style || '日常'}：${pieces}。`);
      const evening = draw.eveningOutfit;
      if (evening && evening.id !== draw.outfit.id) {
        const nightPieces = evening.pieces.slice(0, 6).map((p) => p.name).join('、');
        lines.push(`晚上换成了${evening.style || '另一套'}：${nightPieces}。`);
      }
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

/**
 * 从种子生成一个标准正态分布样本（均值 0、标准差 1）。
 *
 * 用 Box-Muller：两个均匀分布推两个独立正态。
 * 这里只取第一个，因为同一天只需要一个数。
 *
 * 关键是「由种子决定」而不是 Math.random() —— 同一天必须稳定，
 * 否则每次轮询重新抽，一天的次数会一直变。
 */
// splitmix32 的一次混淆。纯算术，不依赖 crypto，输出和输入的相关性被彻底打散。
function mix32(x) {
  let h = (x ^ (x >>> 16)) >>> 0;
  h = Math.imul(h, 0x7feb352d) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function gaussianFromSeed(seed) {
  // 不能直接用 hashSeed() % N —— 那样得到的均匀分布有周期性锯齿，
  // 转成正态后会让某些次数异常高频（实测 max=24 时 8、12、16 出现尖峰）。
  // splitmix32 混淆后再归一化，分布是平滑的。
  const peak = Math.max(mix32(hashSeed(seed + ':u1')), 1);  // 避免 0 让 log 炸掉
  const u1 = peak / 4294967297;
  const u2 = mix32(hashSeed(seed + ':u2')) / 4294967296;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
/**
 * 今天要发几次主动消息。
 *
 * 按正态分布在 0..max 之间抽：均值固定取 max/2，标准差由 `spread` 决定。
 *
 * `spread` 是「离散程度」，用 sigma / 均值 的比值表示：
 *   - 0.1  → 很集中，几乎每天都发差不多那么多次
 *   - 0.5（默认）→ 标准差 = max/4，钟形分布
 *   - 1.0  → 很散，接近均匀分布，0 次和上限都有可观概率
 *
 * 用比值而不是绝对值，是为了让同一个 `spread` 在 max=5 和 max=24 下
 * 表现出同一种「松紧感觉」，换上限不用重新调这个参数。
 *
 * 截断到 [0, max] 后取整。种子是日期，所以同一天恒定、跨天不同、重启不变。
 */
export function sampleDailyCount(date, max, spread = 0.5, seed = '') {
  const limit = Math.max(0, Math.min(24, Math.round(Number(max) || 0)));
  if (limit === 0) return 0;
  // seed 非空时拼进种子 —— 重抽当天安排就是换一个 seed。
  const key = isoDate(date) + (seed ? ':' + seed : '');
  const mu = limit / 2;
  const tightness = Math.max(0.02, Math.min(2, Number(spread) || 0.5));
  // sigma = 均值 × 离散度。0.5 就是原来的 max/4。
  const sigma = Math.max(0.35, mu * tightness);
  const raw = mu + sigma * gaussianFromSeed(key + ':proactive-count');
  return Math.max(0, Math.min(limit, Math.round(raw)));
}

/**
 * 今天所有主动消息的时间点（分钟数，已排序）。
 *
 * 设计要点：
 *
 *   - 数量来自 sampleDailyCount()，不是模型给几个窗口就用几个。
 *   - 时间点只落在当天的「可说话」时段里：timeline 里 state 为 available
 *     或 social 的区间。凌晨睡觉、上课时不该主动发消息。
 *   - 相邻两次至少隔 minGapMinutes，避免挤在一起。
 *   - 全部由 (日期, 序号) 播种，同一天稳定。
 *
 * 抽不出足够多的时间点时返回能放下的那么多，不硬凑 ——
 * 硬凑会导致间隔被压缩，反而更假。
 */
export function sampleDailyTimes(date, { count = 0, timeline = [], minGapMinutes = 60, seed = '' } = {}) {
  const total = Math.max(0, Math.round(Number(count) || 0));
  if (total === 0) return [];
  // seed 拼进 key，重抽时换一个 seed 就能得到完全不同的时间点。
  const key = isoDate(date) + (seed ? ':' + seed : '');
  const gap = Math.max(0, Number(minGapMinutes) || 0);

  // 可用时段：只取可以随便说话的区间。
  // available = 闲着，social = 在社交场合，两种都适合主动发消息。
  // busy / focus / transit / sleep 时不发 —— 上课路上、睡觉时发消息都很怪。
  const spans = [];
  for (const item of Array.isArray(timeline) ? timeline : []) {
    if (!['available', 'social'].includes(String(item?.state))) continue;
    const start = Number(item.start);
    const end = Number(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    spans.push({ start, end, size: end - start });
  }
  if (!spans.length) {
    // 模型没给可用的 state 时退回白天，避开 0:00-7:00 和 23:00 之后。
    spans.push({ start: 7 * 60, end: 23 * 60, size: 16 * 60 });
  }

  // 按段的时长分配名额：长段放得多，短段放得少。
  // 具体做法是逐段算出「这一段按比例该有几个点」，至少 1 个。
  const totalSize = spans.reduce((sum, s) => sum + s.size, 0);
  if (totalSize <= 0) return [];

  // 段数比目标数还多时，只挑几段来用 —— 否则「每段至少一个」会超出目标。
  // 挑法是按段长降序，长的优先，因为它们更能容纳一个不突兀的时间点。
  let used = spans;
  if (spans.length > total) {
    const ranked = [...spans]
      .map((s, i) => ({ s, i, rank: hashSeed(key + ':span:' + i) % 1000 }))
      .sort((a, b) => b.s.size - a.s.size || a.rank - b.rank);
    const keep = new Set(ranked.slice(0, total).map((r) => r.i));
    used = spans.filter((_, i) => keep.has(i));
  }

  const usedSize = used.reduce((sum, s) => sum + s.size, 0);
  const plan = used.map((s) => {
    const share = (s.size / usedSize) * total;
    return { ...s, want: Math.max(1, Math.round(share)) };
  });
  // 分配后可能仍超（每段至少 1 个），从「每个点占用时长最小」的段开始削减。
  let assigned = plan.reduce((sum, p) => sum + p.want, 0);
  while (assigned > total) {
    let worst = null;
    for (const p of plan) {
      if (p.want <= 1) continue;
      const density = p.size / p.want;
      if (!worst || density < worst.size / worst.want) worst = p;
    }
    if (!worst) break;
    worst.want -= 1;
    assigned -= 1;
  }

  // 每段内部按 want 均分，位置加一点哈希抖动避免等间距。
  const picked = [];
  let seq = 0;
  for (const p of plan) {
    for (let i = 0; i < p.want; i++) {
      const step = p.size / p.want;
      const jitter = (hashSeed(key + ':slot:' + seq) % 1000) / 1000;
      const at = p.start + step * (i + jitter);
      picked.push(Math.round(Math.min(p.end - 1, Math.max(p.start, at))));
      seq += 1;
    }
  }

  // 间隔太近的点删掉后面那个。宁可少发，也不要把两条挤在一分钟里。
  const result = [];
  for (const at of picked.sort((a, b) => a - b)) {
    if (result.length && at - result[result.length - 1] < gap) continue;
    result.push(at);
  }
  return result;
}
/**
 * 把 `sent` 里的一天归一成 `[{ at, target }]`。
 *
 * 早期版本存的是纯数字数组，升级后不能要求用户重来一遍，
 * 所以读的时候统一转换。写成函数而不是在每个调用点判断，
 * 是因为漏掉一处的后果是「配额算错」或「轮换顺序错」，很难看出来。
 */
function sentList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (typeof entry === 'number' || typeof entry === 'string') {
      const at = Number(entry);
      if (Number.isFinite(at) && at > 0) out.push({ at, target: null });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const at = Number(entry.at);
      if (!Number.isFinite(at) || at <= 0) continue;
      out.push({ at, target: entry.target ? String(entry.target) : null });
    }
  }
  return out;
}
