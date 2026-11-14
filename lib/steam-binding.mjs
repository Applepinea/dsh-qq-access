/**
 * QQ ↔ Steam 绑定表。
 *
 * 为什么需要单独一张表而不是一个 steamId 配置项：
 * 一个群里可能有好几个人都开了 Steam，她得知道「问我的这个人」在玩什么，
 * 而不是永远只看号主一个人。
 *
 * 存储形状（dataDir/steam-bindings.json）：
 *   { "version": 1, "people": { "<QQ号>": { "steamId": "...", "nickname": "...", "source": "manual" | "code", "boundAt": 1794... } } }
 *
 * 写入一律走原子替换：这个文件被读的频率远高于写，但一旦写坏，
 * 所有绑定信息就没了，重建只能靠人一个个重新输。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const VERSION = 1;
/** 一人最多能绑几个。正常只需要一个，留几个是给「小号也想知道」的情况。 */
const MAX_PER_PERSON = 3;

export class SteamBindingStore {
  constructor({ dataDir, logger = console } = {}) {
    this.file = join(dataDir, 'steam-bindings.json');
    this.logger = logger;
    // { [qq]: [{ steamId, nickname, source, boundAt }] }
    this.people = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.people && typeof raw.people === 'object') {
        this.people = raw.people;
      }
    } catch { /* 文件不存在或坏了就从空开始 */ }
    this.loaded = true;
    return this;
  }

  #normalize(raw) {
    if (!raw || typeof raw !== 'object') return [];
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw.bindings) ? raw.bindings : []);
    return list
      .filter((b) => b && typeof b === 'object' && String(b.steamId ?? '').trim())
      .map((b) => ({
        steamId: String(b.steamId).trim(),
        nickname: String(b.nickname ?? '').trim().slice(0, 60),
        source: String(b.source ?? 'manual').slice(0, 20),
        boundAt: Number(b.boundAt) || 0,
      }))
      .slice(0, MAX_PER_PERSON);
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify({ version: VERSION, people: this.people }, null, 2) + '\n');
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('Steam 绑定写入失败：' + error.message));
    return this.writeChain;
  }

  /** 某个 QQ 绑定的全部 SteamID（最新的在前）。 */
  list(qq) {
    const key = String(qq ?? '').trim();
    if (!key) return [];
    const list = this.#normalize(this.people[key]);
    return list.slice().sort((a, b) => b.boundAt - a.boundAt);
  }

  /** 优先返回最近绑定的那个；没绑定返回 null。 */
  primary(qq) {
    return this.list(qq)[0] ?? null;
  }

  /** 反查：这个 SteamID 绑在哪个 QQ 上。 */
  whoIs(steamId) {
    const id = String(steamId ?? '').trim();
    if (!id) return '';
    for (const [qq, raw] of Object.entries(this.people)) {
      if (this.#normalize(raw).some((b) => b.steamId === id)) return qq;
    }
    return '';
  }

  async bind(qq, steamId, { nickname = '', source = 'manual' } = {}) {
    const key = String(qq ?? '').trim();
    const id = String(steamId ?? '').trim();
    if (!key || !id) return { ok: false, reason: '参数为空' };
    if (!/^\d{17}$/.test(id)) {
      // SteamID64 固定 17 位。填成自定义 URL 名或 32 位 ID 时直接报清楚，
      // 否则会变成「查不到账号」这种看不出原因的失败。
      return { ok: false, reason: 'SteamID 必须是 17 位数字（SteamID64）' };
    }
    const list = this.list(key);
    const existing = list.find((b) => b.steamId === id);
    if (existing) {
      // 已存在时不要直接 return：面板绑定成功后会再查一次 Steam，
      // 想把真实昵称补进记录。以前这里 duplicate 直接返回，不改原记录，
      // 于是第一次绑定（还没有昵称）补写永远不落盘 —— 面板当次看得到，
      // 重启后再打开只剩一串数字。
      const merged = { ...existing };
      let changed = false;
      const nextNick = String(nickname ?? '').trim().slice(0, 60);
      if (nextNick && nextNick !== existing.nickname) { merged.nickname = nextNick; changed = true; }
      if (source && source !== existing.source) { merged.source = source; changed = true; }
      if (changed) {
        this.people[key] = list.map((b) => (b.steamId === id ? merged : b));
        await this.#save();
      }
      return { ok: true, duplicate: true, updated: changed, binding: merged };
    }
    if (list.length >= MAX_PER_PERSON) {
      return { ok: false, reason: `一个 QQ 最多绑定 ${MAX_PER_PERSON} 个 Steam 账号` };
    }
    const binding = { steamId: id, nickname: String(nickname ?? '').trim().slice(0, 60), source, boundAt: Date.now() };
    this.people[key] = [...list, binding];
    await this.#save();
    return { ok: true, binding };
  }

  async unbind(qq, steamId) {
    const key = String(qq ?? '').trim();
    const id = String(steamId ?? '').trim();
    const list = this.list(key);
    const next = id ? list.filter((b) => b.steamId !== id) : [];
    if (next.length === list.length) return { ok: false, reason: '没有这条绑定' };
    if (next.length) this.people[key] = next;
    else delete this.people[key];
    await this.#save();
    return { ok: true, removed: list.length - next.length };
  }

  async flush() { await this.writeChain; }
}