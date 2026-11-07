/**
 * Time context for chat history.
 *
 * The bug this fixes: `recent_messages` was sent to the model with sender, text
 * and direction but no time at all. The model saw a flat list of turns and had no
 * way to tell "you said this two minutes ago" from "you said this last Tuesday",
 * so it treated every archived line as if it had just been said. The observable
 * symptom is her answering an old message as though it were the current topic.
 *
 * Two design rules, both learned from what models actually do with timestamps:
 *
 *   - RELATIVE FIRST, ABSOLUTE SECOND. A raw epoch or an ISO string forces the
 *     model to do date arithmetic, which it does badly. "3 天前" is what a person
 *     would say and needs no computation. The absolute clock is still included so
 *     that "上周三" style references remain answerable.
 *
 *   - THE GAP IS MORE IMPORTANT THAN THE STAMP. A message from 6 days ago that is
 *     one line above the current message reads as continuous conversation. So the
 *     gap since the previous turn is emitted as its own field, and a long gap gets
 *     an explicit marker the model cannot miss.
 */

/** Time-of-day bucket, used only to pick a natural phrasing. */
function partOfDay(date) {
  const h = date.getHours();
  if (h < 5) return '凌晨';
  if (h < 8) return '早上';
  if (h < 11) return '上午';
  if (h < 13) return '中午';
  if (h < 17) return '下午';
  if (h < 19) return '傍晚';
  if (h < 23) return '晚上';
  return '深夜';
}

const pad = (n) => String(n).padStart(2, '0');

/** `YYYY-MM-DD HH:MM` in local time. */
export function absoluteTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Accept epoch seconds, epoch milliseconds, Date, or a parseable string.
 *
 * QQ timestamps arrive in seconds; anything already in milliseconds is detected
 * by magnitude. Getting this wrong shifts every message by decades, so the
 * heuristic is deliberately generous at the boundary (year 2286 in seconds).
 */
export function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    // Anything below ~1e11 is seconds (1e11 s ≈ year 5138; 1e11 ms ≈ 1973).
    const ms = n < 1e11 ? n * 1000 : n;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Whole days between two calendar dates (not 24h periods). */
function calendarDaysBetween(a, b) {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((db - da) / 86_400_000);
}

/**
 * Human-readable distance into the past.
 *
 * Deliberately coarse: "刚刚" / "5 分钟前" / "2 小时前" / "3 天前" / "上个月".
 * Precision beyond that adds tokens without changing how the model should behave.
 */
export function relativeTime(value, now = new Date()) {
  const date = toDate(value);
  if (!date) return '';
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    const ahead = -diffMs;
    if (ahead < 60_000) return '刚刚';
    if (ahead < 3_600_000) return `${Math.round(ahead / 60_000)} 分钟后`;
    return `${Math.round(ahead / 3_600_000)} 小时后`;
  }
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  const days = calendarDaysBetween(date, now);

  // Same calendar day: prefer hours so "3 小时前" beats a vague "今天".
  if (days === 0) return `${hours} 小时前`;
  if (days === 1) return `昨天${partOfDay(date)}`;
  if (days === 2) return `前天${partOfDay(date)}`;
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前`;
  return `${Math.floor(days / 365)} 年前`;
}

/**
 * A gap long enough that the conversation should be treated as restarted.
 *
 * Two hours is the point where "continuing the same thread" stops being a
 * reasonable assumption for casual chat.
 */
export const LONG_GAP_MINUTES = 120;

/**
 * Duration of the silence before a message, or '' when it is continuous.
 *
 * This describes a LENGTH, not a point in time. Returning `relativeTime` here was
 * a real bug: "上一轮是 3 小时前，中间隔了 3 小时前" — the same fact twice, and
 * the second half is not even grammatical. A duration is what the sentence needs.
 */
export function gapDescription(previousValue, currentValue) {
  const prev = toDate(previousValue);
  const cur = toDate(currentValue);
  if (!prev || !cur) return '';
  const minutes = Math.floor((cur.getTime() - prev.getTime()) / 60_000);
  if (minutes < 1) return '';
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = calendarDaysBetween(prev, cur);
  if (days < 7) return `${days} 天`;
  if (days < 30) return `${Math.floor(days / 7)} 周`;
  if (days < 365) return `${Math.floor(days / 30)} 个月`;
  return `${Math.floor(days / 365)} 年`;
}

/**
 * Build the per-message time fields to attach to a history row.
 *
 * `previous` is the timestamp of the row before this one, so a long silence can
 * be surfaced inline. Returns an empty object when the timestamp is unusable, so
 * callers can spread it unconditionally.
 */
export function timeFields(value, { now = new Date(), previous = null } = {}) {
  const date = toDate(value);
  if (!date) return {};
  const gap = previous ? gapDescription(previous, date) : '';
  return {
    time: absoluteTime(date),
    ago: relativeTime(date, now),
    ...(gap ? { since_previous: gap } : {}),
  };
}

/**
 * A one-line "now" header for the whole input.
 *
 * Without this the model has to infer the current time from the newest message,
 * which is exactly the inference that fails after a long silence.
 */
export function nowLine(now = new Date()) {
  const date = toDate(now) ?? new Date();
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${absoluteTime(date)} ${weekdays[date.getDay()]}（${partOfDay(date)}）`;
}

/**
 * Flag a conversation that has been idle long enough to need re-orienting.
 *
 * Returns null when the last exchange was recent, otherwise a sentence the model
 * can act on. This is the difference between "she picks up where she left off"
 * and "she answers a week-old question as if it were asked now".
 */
export function idleNotice(lastValue, now = new Date(), { thresholdMinutes = LONG_GAP_MINUTES } = {}) {
  const last = toDate(lastValue);
  if (!last) return null;
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60_000);
  if (minutes < thresholdMinutes) return null;
  return `上一轮对话是${relativeTime(last, now)}（${absoluteTime(last)}），中间隔了 ${gapDescription(last, now)}。`;
}