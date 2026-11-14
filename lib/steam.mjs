/**
 * Steam 状态查询。
 *
 * 只做一件事：知道「对方现在在 Steam 上做什么」。
 *   - 在线状态（在线 / 离开 / 离线…）
 *   - 正在玩的游戏名（如果有）
 *   - 最近玩过什么、玩多久（游戏详情公开时才有）
 *
 * 为什么不做成「工具」而做成上下文注入：
 * 模型不会无缘无故去查一个工具。你打游戏时她不会主动说「你在玩 XX 啊」，
 * 除非她自己决定去调 —— 而多数时候她不会。注入是「她本来就知道」，
 * 符合这里其他信息（记忆、情感、生活状态）的一贯做法。
 *
 * 隐私：Steam 的「游戏详情」必须是公开，否则接口返回空 response
 * （不是报错！）。空 response 和「真的没玩过游戏」在协议层长得一样，
 * 所以调用方必须能区分「拿不到」和「没有数据」。
 */
import { checkSignal } from './util.mjs';

const API = 'https://api.steampowered.com';

/** 和风的错误码那套思路：配置问题单独提示，别让它变成一个哑巴 null。 */
/**
 * 把可能含 API Key 的 URL 变成可安全打印的形式。
 *
 * Steam 的接口要求 Key 放在查询串里，所以任何「打印请求地址」的便利写法
 * 都会把 Key 写进日志。要打就打这个。
 */
export function redactSteamUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.searchParams.has('key')) u.searchParams.set('key', '***');
    return u.toString();
  } catch {
    return '<无效地址>';
  }
}

export class SteamError extends Error {
  constructor(message, code = '') {
    super(message);
    this.name = 'SteamError';
    this.code = code;
  }
}

/** Steam 的 personastate 数值 → 中文。 */
const PERSONA_STATE = {
  0: '离线',
  1: '在线',
  2: '忙碌',
  3: '离开',
  4: '打盹',
  5: '想交易',
  6: '想玩游戏',
};

/**
 * 把 GetPlayerSummaries 的一条记录整理成内部形状。
 *
 * 只留会影响「她怎么接话」的字段。头像、个人主页链接这些对聊天没用，
 * 传进提示词只会稀释重点。
 */
export function normalizePlayer(player) {
  if (!player || typeof player !== 'object') return null;
  const steamId = String(player.steamid ?? '').trim();
  if (!steamId) return null;
  const personaState = Number(player.personastate);
  const inGame = String(player.gameextrainfo ?? '').trim();
  // sinceMinutes（「这次已经玩了多久」）Steam 的 GetPlayerSummaries 不提供，
  // 只有本地客户端或 Rich Presence 才有。这里不编造：字段留空，
  // describeSteamStatus 里那句「已经玩了大约多久」自然不出现。
  return {
    steamId,
    nickname: String(player.personaname ?? '').trim(),
    state: PERSONA_STATE[personaState] ?? '未知',
    stateCode: Number.isFinite(personaState) ? personaState : -1,
    // 正在玩的游戏。离线时 Steam 不会给这个字段。
    inGame: inGame || '',
    gameId: String(player.gameid ?? '').trim(),
    // 「正在玩」和「在线」是两回事：挂机在线但没开游戏也很常见。
    lastLogoff: Number(player.lastlogoff) > 0 ? Number(player.lastlogoff) : null,
  };
}

/**
 * 把已拥有的游戏（含时长）整理成好读的形状。
 *
 * playtime_forever 单位是分钟。Steam 只在「最近两周玩过」时给 playtime_2weeks，
 * 所以它是可选的。
 */
export function normalizeOwnedGames(payload, { limit = 8, recentOnly = true } = {}) {
  const games = Array.isArray(payload?.response?.games) ? payload.response.games : [];
  const mapped = games
    .map((g) => ({
      appId: Number(g.appid),
      name: String(g.name ?? '').trim(),
      minutes: Number(g.playtime_forever) || 0,
      minutes2Weeks: Number(g.playtime_2weeks) || 0,
      lastPlayed: Number(g.rtime_last_played) > 0 ? Number(g.rtime_last_played) : null,
    }))
    .filter((g) => g.name);
  // 「最近在玩」必须是最近两周真的开过的。
  //
  // 以前这里按「近两周时长 → 总时长」排序，两周都没玩时就用总时长兜底。
  // 于是提示词里会出现「最近在玩：某游戏（几千小时）」—— 那其实是几年前玩的库存。
  // 她会照着「最近」去接话，说出来的东西和时间对不上。
  //
  // 没有近两周记录时返回空数组，让调用方说「最近没怎么玩」，而不是编一个。
  const recent = mapped.filter((g) => g.minutes2Weeks > 0);
  const pool = recentOnly ? recent : mapped;
  return pool
    .sort((a, b) => (b.minutes2Weeks - a.minutes2Weeks) || (b.minutes - a.minutes))
    .slice(0, Math.max(1, limit));
}

/** 分钟 → 「3 小时 20 分钟」。0 返回空串，别在提示词里塞「0 分钟」。 */
export function formatPlaytime(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (!m) return '';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h} 小时 ${rest} 分钟`;
  if (h) return `${h} 小时`;
  return `${rest} 分钟`;
}

/**
 * 一条给模型看的状态描述。没有可用信息时返回空串（调用方据此跳过注入）。
 *
 * 刻意写得很短：这段每次回复都会进上下文，太长会挤掉真正重要的内容。
 */
export function describeSteamStatus(status, { now = Date.now() } = {}) {
  if (!status) return '';
  const parts = [];
  if (status.inGame) {
    parts.push(`对方现在正在 Steam 上玩《${status.inGame}》`);
    if (status.sinceMinutes && status.sinceMinutes > 0) {
      parts.push(`已经玩了大约 ${formatPlaytime(status.sinceMinutes)}`);
    }
  } else if (status.stateCode === 0) {
    const hours = status.lastLogoff ? Math.round((now - status.lastLogoff * 1000) / 3600000) : 0;
    if (hours > 0 && hours < 72) parts.push(`对方 Steam 已经离线约 ${hours} 小时`);
    else parts.push('对方 Steam 当前离线');
  } else {
    parts.push(`对方 Steam ${status.state}`);
  }
  // 只列近两周真的玩过的。时长也用近两周的，不能用总时长 ——
  // 「最近在玩：某游戏（3000 小时）」是在说几年前的事。
  const recent = (status.recentGames ?? [])
    .filter((g) => g.name && g.minutes2Weeks > 0)
    .slice(0, 3);
  if (recent.length) {
    const list = recent
      .map((g) => {
        const t = formatPlaytime(g.minutes2Weeks);
        return t ? `${g.name}（近两周 ${t}）` : g.name;
      })
      .join('、');
    parts.push(`最近在玩：${list}`);
  } else if (status.gamesUnavailable) {
    // 「拿不到」不等于「没玩」：游戏详情没公开时 Steam 返回 { response: {} }，
    // 以前这里统一说「最近两周没有玩游戏的记录」，等于替对方编了一个结论。
    if (status.stateCode !== 0 || status.inGame) {
      parts.push('游戏详情没有公开，拿不到最近两周的游玩时长');
    }
  } else if (status.stateCode !== 0 && !status.inGame) {
    // 在线但两周没开过游戏：说清楚，别让她以为对方最近在玩什么。
    // 正在玩的时候不能说这句 —— 会和上一句「正在玩《X》」直接矛盾。
    parts.push('最近两周没有玩游戏的记录');
  }
  return parts.join('；') + '。';
}

export class SteamClient {
  /**
   * @param {object} options
   * @param {string} options.apiKey      Steam Web API key（steamcommunity.com/dev/apikey 申请）
   * @param {string} options.steamId     不再使用（保留形参只为兼容旧调用）
   * @param {number} options.cacheTtlMs  结果缓存多久（用户可调，面板里叫「缓存时间」）
   * @param {boolean} options.withGames  是否同时拉取游戏时长（需要「游戏详情」公开）
   */
  constructor({
    apiKey = '', steamId = '', timeoutMs = 6000, cacheTtlMs = 60_000,
    withGames = true, gameLimit = 8, errorCacheTtlMs = 60_000, logger = console,
  } = {}) {
    this.apiKey = String(apiKey ?? '').trim();
    this.steamId = String(steamId ?? '').trim();
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 6000);
    // 0 表示不缓存。上限一天，防止有人填个天文数字之后状态永远不更新。
    this.cacheTtlMs = Math.max(0, Math.min(86_400_000, Number(cacheTtlMs) || 0));
    this.withGames = withGames !== false;
    this.gameLimit = Math.max(1, Math.min(50, Number(gameLimit) || 8));
    this.logger = logger;
    // steamId → { at, status }
    // 失败结果单独一个 TTL：默认 60 秒，上限同样一天。
    this.errorCacheTtlMs = Math.max(0, Math.min(86_400_000, Number(errorCacheTtlMs) || 60_000));
    this.cache = new Map();
  }

  get enabled() { return Boolean(this.apiKey); }

  /** 换配置时调用，避免旧缓存继续生效。 */
  reconfigure(patch = {}) {
    if (patch.apiKey !== undefined) this.apiKey = String(patch.apiKey ?? '').trim();
    if (patch.steamId !== undefined) this.steamId = String(patch.steamId ?? '').trim();
    if (patch.cacheTtlMs !== undefined) {
      this.cacheTtlMs = Math.max(0, Math.min(86_400_000, Number(patch.cacheTtlMs) || 0));
    }
    if (patch.withGames !== undefined) this.withGames = patch.withGames !== false;
    if (patch.timeoutMs !== undefined) this.timeoutMs = Math.max(1000, Number(patch.timeoutMs) || 6000);
    this.cache.clear();
  }

  /**
   * 把一次失败记进缓存。
   *
   * 只记短时间：修好 Key 或网络恢复之后，不该还要等一个完整的成功缓存周期。
   * 存的是 Error 对象本身，命中时原样抛出 —— 调用方拿到的错误和真实现场一致。
   */
  #rememberFailure(id, error) {
    if (this.errorCacheTtlMs <= 0) return;
    this.cache.set(id, { at: Date.now(), error });
  }

  async #get(path, params, signal) {
    const url = new URL(API + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = AbortSignal.any ? AbortSignal.any([signal, timeout].filter(Boolean)) : timeout;
    let response;
    try {
      response = await fetch(url, { signal: combined, redirect: 'error' });
    } catch (error) {
      // 绝不把 URL 拼进错误信息。
      //
      // Steam 的接口把 API Key 放在查询串里（这是它规定的用法，没法改成 header）。
      // 一旦某条日志顺手把完整地址打出来，Key 就永久留在 debug.log 里了。
      // 这里只保留错误类型和原因，不带地址。
      const reason = String(error?.name ?? 'Error') === 'TimeoutError'
        ? '请求超时'
        : String(error?.message ?? error);
      throw new SteamError('Steam 请求中断或连接失败：' + reason, 'network');
    }
    if (response.status === 401 || response.status === 403) {
      throw new SteamError('Steam API Key 无效或没有权限', 'auth');
    }
    if (response.status === 429) {
      throw new SteamError('Steam 接口请求过于频繁，稍后再试', 'rate');
    }
    if (!response.ok) {
      throw new SteamError(`Steam 返回 HTTP ${response.status}`, 'http');
    }
    try { return await response.json(); }
    catch { throw new SteamError('Steam 返回的不是合法 JSON', 'format'); }
  }

  /**
   * 查一个人现在的状态。
   *
   * steamId 为空时用构造函数里那个。缓存按 steamId 分开存 ——
   * 群里不同人的绑定不能互相串。
   */
  async status(steamId = this.steamId, { signal, force = false } = {}) {
    const id = String(steamId ?? '').trim() || this.steamId;
    if (!this.apiKey) throw new SteamError('还没有配置 Steam API Key', 'config');
    if (!id) throw new SteamError('还没有绑定 SteamID', 'config');
    checkSignal(signal);

    // 成功和失败都进缓存，但 TTL 不同。
    //
    // 以前只有成功才 cache.set。Key 失效或者 Steam 慢的时候，每一条私聊都要
    // 先等满这一轮超时（玩家摘要 + 游戏库各最多 6 秒）才开始生成 ——
    // 聊天会稳定地变慢，而且问题越持续越明显。
    //
    // 失败用一个很短的 TTL（最多 60 秒），既能挡住连续的等待，又不至于
    // 让用户修好 Key 之后还要等很久才恢复。
    const cached = this.cache.get(id);
    if (!force && cached) {
      const ttl = cached.error ? Math.min(this.cacheTtlMs || 60_000, this.errorCacheTtlMs) : this.cacheTtlMs;
      if (ttl > 0 && Date.now() - cached.at < ttl) {
        if (cached.error) throw cached.error;
        return { ...cached.status, cached: true };
      }
    }

    // 包一层：任何失败都记进缓存（带 error 标记），然后原样抛出去。
    let payload;
    try {
      payload = await this.#get('/ISteamUser/GetPlayerSummaries/v2/', {
        key: this.apiKey, steamids: id,
      }, signal);
    } catch (error) {
      this.#rememberFailure(id, error);
      throw error;
    }
    const player = Array.isArray(payload?.response?.players) ? payload.response.players[0] : null;
    if (!player) {
      // 空 players 只说明「查不到」。最常见的原因是隐私没开或 ID 写错，
      // 而不是「这个人不存在」。区分不出来，所以两条可能都提一下。
      const error = new SteamError('查不到这个 Steam 账号：检查 SteamID 是否正确、以及「游戏详情」是否设为公开', 'notfound');
      this.#rememberFailure(id, error);
      throw error;
    }
    const status = normalizePlayer(player);
    if (!status) {
      const error = new SteamError('Steam 返回的数据缺 steamid', 'format');
      this.#rememberFailure(id, error);
      throw error;
    }

    // 正在玩游戏时才有必要拉时长，而且只拉一次。
    if (this.withGames) {
      try {
        const owned = await this.#get('/IPlayerService/GetOwnedGames/v1/', {
          key: this.apiKey, steamid: id, include_appinfo: 1, include_played_free_games: 1,
        }, signal);
        const games = normalizeOwnedGames(owned, { limit: this.gameLimit });
        if (games.length) status.recentGames = games;
        // 这个接口在隐私没开时返回 { response: {} } —— 不是错误。
        // 明确记下来，好让面板提示「时长拿不到」而不是让人以为没玩过游戏。
        else status.gamesUnavailable = true;
      } catch { /* 时长是附加信息，拿不到不影响在线状态 */ }
    }

    this.cache.set(id, { at: Date.now(), status });
    return { ...status, cached: false };
  }

  /** 面板「测试连接」用：只看一眼能不能通，不写缓存。 */
  async probe(steamId = this.steamId, { signal } = {}) {
    return this.status(steamId, { signal, force: true });
  }
}