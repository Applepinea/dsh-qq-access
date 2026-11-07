/**
 * Time-of-day tone for proactive QZone posts.
 *
 * The problem this solves: a single fixed prompt produces the same voice at 07:00
 * and at 02:00. "早安，今天也要加油" posted at 3am reads as a bot, and so does
 * "夜深了" at noon. The band is chosen from the POST time, not from the wall clock
 * at generation time, so a slot scheduled for 07:10 keeps its morning voice even if
 * the poll loop happens to run it at 07:24.
 *
 * Two deliberate choices:
 *
 *   - Bands are a closed partition of 00:00–24:00. `bandAt` is total: every minute
 *     of the day maps to exactly one band. A gap would make the prompt silently
 *     lose its time context, which is worse than a slightly odd band.
 *
 *   - Guidance is phrased as MATERIAL and AVOID lists, not as sentences to copy.
 *     Handing the model finished sentences makes every morning post identical;
 *     handing it "what is true at this hour" lets it write something new.
 */

/** Minutes since midnight, or NaN. Duplicated from virtual-life to keep this file standalone. */
function minutesOf(hhmm) {
  const m = String(hhmm ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return NaN;
  return h * 60 + min;
}

export function hhmmOf(minutes) {
  const total = Math.max(0, Math.min(1440, Math.round(minutes)));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

/**
 * The eight bands, in order. `start` inclusive, `end` exclusive, minutes since midnight.
 * Contiguity is asserted below rather than trusted.
 */
export const BANDS = [
  {
    id: 'late-night',
    label: '凌晨',
    start: '00:00',
    end: '05:00',
    mood: '安静、独处，多数人已经睡了',
    material: ['失眠或刚醒的零碎念头', '夜宵', '窗外很静', '还没睡着的疲惫'],
    avoid: ['早安', '元气满满', '新的一天开始了', '今天也要加油'],
  },
  {
    id: 'dawn',
    label: '清晨',
    start: '05:00',
    end: '08:00',
    mood: '刚醒，安静，空气还凉',
    material: ['起床后的第一件事', '早饭', '天刚亮的光线', '还没完全清醒的状态'],
    avoid: ['晚安', '要睡了', '夜深了', '今天结束了'],
  },
  {
    id: 'morning',
    label: '上午',
    start: '08:00',
    end: '11:00',
    mood: '一天正式开始，节奏偏快',
    material: ['通勤路上', '刚开始做事', '上午的安排', '一杯咖啡或茶'],
    avoid: ['晚安', '要睡了', '午饭吃什么（还没到）'],
  },
  {
    id: 'noon',
    label: '中午',
    start: '11:00',
    end: '13:30',
    mood: '吃饭和歇一会儿的时间',
    material: ['午饭吃了什么', '午休', '上午忙完的松弛', '晒太阳'],
    avoid: ['晚安', '要睡了', '下班了'],
  },
  {
    id: 'afternoon',
    label: '下午',
    start: '13:30',
    end: '17:00',
    mood: '容易犯困，事情还在继续',
    material: ['下午的困意', '继续做手上的事', '一杯提神的东西', '窗外的光'],
    avoid: ['晚安', '早安', '要睡了'],
  },
  {
    id: 'evening',
    label: '傍晚',
    start: '17:00',
    end: '19:30',
    mood: '天色在变，一天的收尾',
    material: ['下班或放学的路上', '天色的变化', '晚饭前的一段空', '今天的收尾感'],
    avoid: ['早安', '刚起床', '午饭'],
  },
  {
    id: 'night',
    label: '晚上',
    start: '19:30',
    end: '23:00',
    mood: '放松下来，自己的时间',
    material: ['晚饭', '追剧或打游戏', '洗完澡的松弛', '睡前的一点空闲'],
    avoid: ['早安', '上午的安排', '通勤'],
  },
  {
    id: 'late-night-2',
    label: '深夜',
    start: '23:00',
    end: '24:00',
    mood: '一天快结束了，人少了',
    material: ['准备睡了', '还在刷手机', '一天的最后一点念头', '很安静'],
    avoid: ['早安', '元气满满', '今天也要加油'],
  },
];

/** Parse a band boundary, throwing on a typo instead of producing NaN comparisons. */
function boundary(text, id) {
  const minutes = minutesOf(text);
  if (!Number.isFinite(minutes)) throw new Error(`时间带 ${id} 的边界不是合法时刻：${text}`);
  return minutes;
}

// Fail loudly at import time if the table is not a clean partition. A silent gap
// would surface only as a prompt that mysteriously lost its time context.
const RESOLVED = BANDS.map((band) => ({
  ...band,
  startMinutes: boundary(band.start, band.id),
  endMinutes: boundary(band.end, band.id),
}));
for (let i = 0; i < RESOLVED.length; i++) {
  const band = RESOLVED[i];
  if (band.endMinutes <= band.startMinutes) throw new Error(`时间带 ${band.id} 的结束不晚于开始`);
  if (i === 0 && band.startMinutes !== 0) throw new Error('时间带必须从 00:00 开始');
  if (i > 0 && band.startMinutes !== RESOLVED[i - 1].endMinutes) {
    throw new Error(`时间带 ${band.id} 与上一段不连续`);
  }
}
if (RESOLVED[RESOLVED.length - 1].endMinutes !== 1440) throw new Error('时间带必须在 24:00 结束');

/**
 * The band covering `minutes`. Total over 00:00–23:59; 24:00 maps to the last band
 * so that "23:59:59" and "24:00" cannot disagree.
 */
export function bandAt(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m)) return RESOLVED[RESOLVED.length - 1];
  const clamped = Math.max(0, Math.min(1439, Math.floor(m)));
  for (const band of RESOLVED) {
    if (clamped >= band.startMinutes && clamped < band.endMinutes) return band;
  }
  return RESOLVED[RESOLVED.length - 1];
}

/** The band for a Date. */
export function bandForDate(date = new Date()) {
  return bandAt(date.getHours() * 60 + date.getMinutes());
}

/**
 * Prompt fragment describing the hour.
 *
 * `clock` is the intended post time, which may differ from "now" by the poll
 * interval. Passing it explicitly keeps the text honest about when the post will
 * appear rather than when it was written.
 */
export function describeBand(band, clock) {
  if (!band) return '';
  const lines = [
    `发布时间：${clock ?? ''}（${band.label}）`.replace('（）', ''),
    `这个时段的感觉：${band.mood}。`,
  ];
  if (band.material?.length) lines.push('可以写到的素材：' + band.material.join('、') + '。');
  if (band.avoid?.length) lines.push('不要出现：' + band.avoid.join('、') + '。');
  return lines.join('\n');
}

/** Everything the panel and tools need about "right now". */
export function toneSnapshot(minutes) {
  const band = bandAt(minutes);
  return {
    band: band.id,
    label: band.label,
    window: band.start + '–' + band.end,
    clock: hhmmOf(minutes),
    mood: band.mood,
    material: [...(band.material ?? [])],
    avoid: [...(band.avoid ?? [])],
  };
}

/** All bands, for the panel's reference table. */
export function bandTable() {
  return RESOLVED.map((band) => ({
    id: band.id, label: band.label, window: band.start + '–' + band.end, mood: band.mood,
  }));
}