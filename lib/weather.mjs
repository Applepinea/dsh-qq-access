/**
 * 和风天气（QWeather）每日预报。
 *
 * 只做一件事：把未来几天的天气拿回来，整理成虚拟人生生成器能直接用的形状。
 *
 * 几个刻意的选择：
 *
 *   - 用 API KEY 而不是 JWT。两者和风都支持，但 JWT 要先生成 Ed25519 密钥对、
 *     把公钥传到控制台、每次请求再签一个 token。对一个只要「今天几度、下不下雨」
 *     的插件来说，这个复杂度换不来什么。
 *
 *   - 必须用自己的 API Host。和风的公共域名（api.qweather.com 等）正在停用，
 *     而且 API Host 本身也是认证的一部分。
 *
 *   - 失败一律返回 null，不抛。天气是锦上添花：拿不到就退化成「按日期和季节猜」，
 *     绝不能让虚拟人生生成失败。
 */
import { checkSignal } from './util.mjs';

/** 和风天气的错误码里，这几个是配置问题，值得单独提示。 */
const CONFIG_ERRORS = new Map([
  ['401', 'API Key 无效或未启用'],
  ['402', '账号余额不足'],
  ['403', '没有访问该接口的权限'],
  ['404', '查询的位置不存在'],
  ['400', '请求参数有误'],
]);

export class WeatherError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WeatherError';
  }
}

/**
 * 把和风的响应整理成生成器好用的形状。
 *
 * 只留会真正影响「穿什么」的字段：最高最低温、白天天气、降水概率、风。
 * 紫外线、气压、能见度这些对穿搭没影响，传进提示词只会稀释重点。
 */
export function normalizeForecast(payload) {
  const days = Array.isArray(payload?.days) ? payload.days : [];
  const out = [];
  for (const day of days) {
    const date = String(day?.forecastStartTime ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const max = Number(day?.temperatureMax?.value);
    const min = Number(day?.temperatureMin?.value);
    if (!Number.isFinite(max) || !Number.isFinite(min)) continue;
    const text = String(day?.daytime?.condition?.text ?? '').trim();
    const nightText = String(day?.nighttime?.condition?.text ?? '').trim();
    // probability 是 0–1 的小数，转成百分比更好读。
    const rawProb = day?.daytime?.precipitation?.probability;
    const rainChance = Number.isFinite(Number(rawProb)) ? Math.round(Number(rawProb) * 100) : null;
    out.push({
      date,
      textDay: text,
      textNight: nightText,
      tempMax: Math.round(max),
      tempMin: Math.round(min),
      rainChance,
      windScale: Number.isFinite(Number(day?.daytime?.wind?.scale)) ? Number(day.daytime.wind.scale) : null,
    });
  }
  return out;
}

/** 一行人类可读的天气，给提示词用。 */
export function describeDay(day) {
  if (!day) return '';
  const parts = [`${day.tempMin}~${day.tempMax}℃`];
  if (day.textDay) parts.push(day.textDay);
  if (Number.isFinite(day.rainChance) && day.rainChance >= 30) parts.push(`降水概率 ${day.rainChance}%`);
  if (Number.isFinite(day.windScale) && day.windScale >= 4) parts.push(`${day.windScale} 级风`);
  return parts.join('，');
}

export class WeatherClient {
  constructor({ apiHost = '', apiKey = '', latitude = null, longitude = null, timeoutMs = 8000, logger = console } = {}) {
    this.apiHost = String(apiHost ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    this.apiKey = String(apiKey ?? '').trim();
    this.latitude = latitude;
    this.longitude = longitude;
    // 兜底：调用方传 undefined 时（配置漏字段）不能让它变成 AbortSignal.timeout(undefined)，
    // 那会在 fetch 之前就抛，堆栈还指向这里，完全看不出是配置缺项。
    const ms = Number(timeoutMs);
    this.timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 8000;
    this.logger = logger;
  }

  /** 配置齐全才值得发请求；缺任何一项就当没启用。 */
  get enabled() {
    // 不能直接 Number()：Number(null) === 0 会被当成合法坐标（0,0 在几内亚湾）。
    const lat = this.latitude === null || this.latitude === undefined ? NaN : Number(this.latitude);
    const lon = this.longitude === null || this.longitude === undefined ? NaN : Number(this.longitude);
    return Boolean(this.apiHost && this.apiKey && Number.isFinite(lat) && Number.isFinite(lon));
  }
  /**
   *
   * 失败返回 null 而不是抛：调用方（虚拟人生生成）不该因为天气挂了就整个失败。
   * 但会把原因写进日志，否则「为什么她总穿错」会变成没法查的悬案。
   */
  async forecast({ days = 7, signal } = {}) {
    if (!this.enabled) return null;
    checkSignal(signal);
    const lat = Number(this.latitude).toFixed(2);
    const lon = Number(this.longitude).toFixed(2);
    const url = `https://${this.apiHost}/weather/v1/daily/${lat}/${lon}?days=${Math.min(10, Math.max(1, days))}&localTime=true`;

    const timeout = AbortSignal.timeout?.(this.timeoutMs);
    const combined = timeout && signal ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
    let response;
    try {
      response = await fetch(url, {
        headers: { 'X-QW-Api-Key': this.apiKey, accept: 'application/json' },
        ...(combined ? { signal: combined } : {}),
      });
    } catch (error) {
      // 超时和网络错误都在这里，静默降级。
      this.logger.warn?.('天气请求失败：' + error.message);
      return null;
    }

    if (!response.ok) {
      const hint = CONFIG_ERRORS.get(String(response.status)) ?? `HTTP ${response.status}`;
      this.logger.warn?.('天气请求被拒绝：' + hint);
      return null;
    }

    let payload;
    try { payload = await response.json(); }
    catch (error) {
      this.logger.warn?.('天气返回的不是 JSON：' + error.message);
      return null;
    }

    const forecast = normalizeForecast(payload);
    if (!forecast.length) {
      this.logger.warn?.('天气返回里没有可用的日预报');
      return null;
    }
    return forecast;
  }
}
