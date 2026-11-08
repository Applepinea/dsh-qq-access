/**
 * Long-term memory, keyed by PERSON rather than by conversation.
 *
 * The problem this solves is specific and was measured: emotion state and history
 * were keyed by `peerId`, which in a group is the GROUP number and in a private
 * chat is the person's QQ number. So the same friend talking to her in two places
 * produced two unrelated relationships — she would not recall a promise made in
 * the group while chatting privately, and vice versa. This module keys everything
 * on `senderId` (the actual person), so a person has ONE memory across every
 * conversation they share with her.
 *
 * Design borrowed from Yuuyuko-uu/dsh-fish-memory, with three adaptations:
 *
 *   - FRESHNESS DECAY instead of deletion. Every memory has a half-life; older
 *     ones are harder to recall but never lost. A hard TTL loses exactly the
 *     things people care about (a promise from six months ago).
 *
 *   - EVIDENCE-GATED RECALL, not embedding search. A memory is recalled when the
 *     query shares a RARE enough word with it. Common words ("我""今天") carry
 *     almost no weight, so "车" cannot drag in every memory containing "车站".
 *     This needs no vector store and no extra model call.
 *
 *   - FACTS ARE ALWAYS PRESENT. Identity facts (name, preferences, promises) are
 *     pinned by importance and injected every turn regardless of the query,
 *     because "do you remember my name" must never depend on retrieval luck.
 *
 * What is deliberately NOT here: rewriting old archives, an import pipeline, and a
 * management UI beyond the panel list. Those are the reference plugin's scope; this
 * one only needs to make her remember the people she talks to.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 1;
/** Days for a memory's freshness to halve. */
export const DEFAULT_HALF_LIFE_DAYS = 30;
/** Memories below this freshness are still stored but rarely recalled. */
const MIN_FRESHNESS = 0.02;
const MAX_MEMORIES_PER_PERSON = 400;

/**
 * Word-level rarity table.
 *
 * A tiny hand-built frequency list is enough here: the gate only needs to know
 * "this word is distinctive" versus "this word appears in every sentence". A real
 * corpus would be better but would also add a megabyte of data to a QQ plugin.
 */
const COMMON_WORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '这', '那', '这个', '那个',
  '的', '了', '是', '在', '有', '和', '就', '都', '也', '很', '还', '要', '会', '能',
  '不', '没', '好', '吧', '啊', '呢', '吗', '呀', '哦', '嗯', '哈', '对', '说', '做',
  '今天', '明天', '昨天', '现在', '时候', '一个', '什么', '怎么', '为什么', '因为',
  '所以', '但是', '而且', '然后', '可以', '应该', '需要', '觉得', '知道', '看看',
  '一下', '一点', '有点', '真的', '其实', '已经', '还是', '就是', '这样', '那样',
]);

/** Split into candidate tokens: CJK bigrams plus latin/number words. */
export function tokenize(text) {
  const body = String(text ?? '').toLowerCase();
  const out = new Set();
  for (const word of body.match(/[a-z][a-z0-9_+#.-]{1,}/g) ?? []) {
    if (word.length >= 2) out.add(word);
  }
  for (const run of body.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    // Bigrams give the precision ("车站" vs "车"), single characters give recall
    // ("猫" must find "布偶猫" even though bigrams alone never overlap).
    //
    // Both are indexed for every run. The noise from single characters is handled
    // at SCORING time, not indexing time: a single-character hit counts 0.4 instead
    // of 1.0, so it can nudge a memory up but cannot carry one in on its own. Doing
    // the filtering here instead would break short queries, which is exactly the
    // case a user types most often.
    if (run.length === 1) { out.add(run); continue; }
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
    for (const ch of run) out.add(ch);
  }
  return [...out];
}

/**
 * Distinctive tokens carry weight; common ones are dropped entirely.
 *
 * Single characters are KEPT. Dropping them looked reasonable ("one character is
 * not evidence") but broke the most common query shape: searching "猫" returned
 * nothing because every stored token was a bigram. The fix is to keep them and
 * weight them lower at scoring time, not to delete them here.
 */
export function evidenceTokens(text) {
  return tokenize(text).filter((token) => !COMMON_WORDS.has(token));
}

/**
 * Freshness in [0,1] after `days` since the memory was formed.
 *
 * Exponential decay with a configurable half-life. `boost` lets an important
 * memory decay slower — a promise should outlive small talk.
 */
export function freshness(createdAt, now = Date.now(), { halfLifeDays = DEFAULT_HALF_LIFE_DAYS, boost = 1 } = {}) {
  const days = Math.max(0, (now - Number(createdAt || 0)) / 86_400_000);
  const life = Math.max(1, halfLifeDays * Math.max(0.25, Number(boost) || 1));
  return Math.pow(0.5, days / life);
}

/** `YYYY-MM-DD HH:MM`, with a year prefix only when it is not the current year. */
export function memoryTime(value, now = Date.now()) {
  const date = new Date(Number(value) || 0);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return sameYear ? md : `${date.getFullYear()}-${md}`;
}

/**
 * Score one memory against a query.
 *
 * Returns 0 when the memory shares no distinctive word with the query, which is
 * what keeps unrelated memories out. The score combines three independent things
 * so a very fresh but irrelevant memory cannot win:
 *
 *   evidence (0..1) × freshness (0..1) × (importance, emotion) weighting
 */
export function scoreMemory(memory, queryTokens, now = Date.now(), weights = {}) {
  const {
    evidence = 0.5, freshness: freshW = 0.3, importance = 0.15, emotion = 0.05,
    halfLifeDays = DEFAULT_HALF_LIFE_DAYS,
  } = weights;

  const tokens = new Set(memory.tokens ?? tokenize(memory.text ?? ''));
  if (!tokens.size || !queryTokens.length) return 0;

  // A single-character hit is weak evidence ("猫" appears in many sentences); a
  // multi-character hit is strong. Weighting them equally would let one common
  // character drag in unrelated memories.
  let hits = 0;
  for (const token of queryTokens) {
    if (!tokens.has(token)) continue;
    hits += token.length >= 2 ? 1 : 0.4;
  }
  if (!hits) return 0;
  // Normalise by the QUERY length, not the memory length: a long memory should not
  // be penalised for containing more words than the question.
  const evidenceScore = Math.min(1, hits / Math.max(2, queryTokens.length));

  const fresh = freshness(memory.createdAt, now, { halfLifeDays, boost: memory.importance ?? 1 });
  if (fresh < MIN_FRESHNESS) return 0;

  return (
    evidence * evidenceScore
    + freshW * fresh
    + importance * Math.min(1, Number(memory.importance) || 1) / 3
    + emotion * Math.min(1, Math.abs(Number(memory.emotion) || 0))
  );
}

/**
 * Decide whether a turn is worth remembering.
 *
 * Two independent triggers, either is enough:
 *   - the turn contains a distinctive word AND is substantive (not "嗯");
 *   - the caller marks it important (a promise, a stated preference).
 *
 * `quota` is enforced by the store, not here, so this stays a pure predicate.
 */
export function isMemorable({ text, important = false, minChars = 8 } = {}) {
  const body = String(text ?? '').trim();
  if (important) return body.length >= 2;
  // A first-person statement about identity or preferences is worth keeping even
  // when it is short: "我养了狗" is four characters but it is exactly the kind of
  // fact that must survive. Length alone is a bad filter for these.
  if (/(我叫|我的名字|我是|我喜欢|我不喜欢|我住|我在|我养|我有|我讨厌|我生日|约好|答应|说好)/.test(body)) {
    return [...body].length >= 3;
  }
  if ([...body].length < minChars) return false;
  return evidenceTokens(body).length > 0;
}

/**
 * Persistent store: one file, keyed by person QQ number.
 *
 * Every write is serialised per person, because two conversations with the same
 * person can be answered concurrently and a naive read-modify-write loses one.
 */
export class MemoryStore {
  constructor({ dataDir, logger = console, halfLifeDays = DEFAULT_HALF_LIFE_DAYS } = {}) {
    this.root = join(dataDir, 'memory');
    this.file = join(this.root, 'people.json');
    this.logger = logger;
    this.halfLifeDays = halfLifeDays;
    this.people = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
    this.locks = new Map();
    // Per-person daily quota bookkeeping: { personId: { date, count } }
    this.quotas = {};
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.people && typeof raw.people === 'object') {
        this.people = raw.people;
        this.quotas = raw.quotas ?? {};
      }
    } catch { /* missing or corrupt starts empty */ }
    this.loaded = true;
    return this;
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(this.root, { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify({ version: VERSION, people: this.people, quotas: this.quotas }, null, 2) + '\n');
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('长期记忆写入失败：' + error.message));
    return this.writeChain;
  }

  async #withLock(key, fn) {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    const settled = run.catch(() => {});
    this.locks.set(key, settled);
    try { return await run; } finally {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    }
  }

  /** All memories for a person, newest first. */
  list(personId) {
    const record = this.people[String(personId)];
    if (!record?.memories) return [];
    return [...record.memories].sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Pinned facts: identity, preferences, promises. Always injected. */
  facts(personId, { limit = 6 } = {}) {
    return this.list(personId)
      .filter((m) => m.kind === 'fact' && !m.supersededBy)
      .sort((a, b) => (b.importance ?? 1) - (a.importance ?? 1) || b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  /** How many memories were added today for this person. */
  #todayCount(personId, now = new Date()) {
    const date = now.toISOString().slice(0, 10);
    const entry = this.quotas[String(personId)];
    if (!entry || entry.date !== date) return 0;
    return Number(entry.count) || 0;
  }

  /**
   * Add one memory.
   *
   * `factKey` implements "same fact, keep newest": writing `她.身高` again marks the
   * previous entry superseded instead of piling up contradictions. The key must NOT
   * contain the value — `她.身高170` would never collide with `她.身高165`.
   */
  async remember(personId, {
    text, kind = 'event', importance = 1, emotion = 0, factKey = '',
    source = '', at = Date.now(), dailyQuota = 0,
  } = {}) {
    const id = String(personId ?? '').trim();
    const body = String(text ?? '').trim();
    if (!id || !body) return null;

    return this.#withLock(id, async () => {
      if (dailyQuota > 0 && this.#todayCount(id) >= dailyQuota) return null;

      const record = this.people[id] ?? { memories: [], updatedAt: 0 };
      const memories = Array.isArray(record.memories) ? record.memories : [];

      // Supersede the previous entry with the same fact key.
      let superseded = null;
      if (factKey) {
        const previous = memories.find((m) => m.factKey === factKey && !m.supersededBy);
        if (previous) {
          const newId = `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          previous.supersededBy = newId;
          superseded = previous.id;
        }
      }

      const entry = {
        id: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        text: body.slice(0, 400),
        kind: kind === 'fact' ? 'fact' : 'event',
        importance: Math.max(0.2, Math.min(3, Number(importance) || 1)),
        emotion: Math.max(-1, Math.min(1, Number(emotion) || 0)),
        factKey: String(factKey ?? '').slice(0, 40),
        source: String(source ?? '').slice(0, 60),
        tokens: evidenceTokens(body),
        createdAt: Number(at) || Date.now(),
      };

      memories.push(entry);
      // Trim the least valuable entries, never the pinned facts.
      if (memories.length > MAX_MEMORIES_PER_PERSON) {
        const now = Date.now();
        const sorted = [...memories].sort((a, b) => {
          if (a.kind === 'fact' && b.kind !== 'fact') return -1;
          if (b.kind === 'fact' && a.kind !== 'fact') return 1;
          return freshness(b.createdAt, now, { halfLifeDays: this.halfLifeDays }) - freshness(a.createdAt, now, { halfLifeDays: this.halfLifeDays });
        });
        record.memories = sorted.slice(0, MAX_MEMORIES_PER_PERSON);
      } else {
        record.memories = memories;
      }

      record.updatedAt = Date.now();
      this.people[id] = record;

      const date = new Date().toISOString().slice(0, 10);
      const quota = this.quotas[id];
      this.quotas[id] = quota?.date === date
        ? { date, count: (Number(quota.count) || 0) + 1 }
        : { date, count: 1 };

      await this.#save();
      return { entry, superseded };
    });
  }

  /**
   * Recall memories relevant to a query.
   *
   * Facts are returned separately and always (up to `factLimit`), because they must
   * not compete for the event slots. Events are ranked by score and cut at
   * `limit`, and anything scoring 0 (no shared distinctive word) never appears.
   */
  recall(personId, query, {
    limit = 4, factLimit = 6, minScore = 0.12, now = Date.now(),
  } = {}) {
    const id = String(personId ?? '');
    const queryTokens = evidenceTokens(query);
    const all = this.list(id);

    // Facts are always injected, but ORDER still matters: with a small limit the
    // most relevant one should survive the cut. Ranking purely by importance put
    // "likes iced americano" above "has a cat" when the user asked about the cat.
    // Relevance nudges the order without ever excluding a fact.
    const facts = this.facts(id, { limit: factLimit })
      .map((memory) => ({ memory, score: scoreMemory(memory, queryTokens, now, { halfLifeDays: this.halfLifeDays }) }))
      .sort((a, b) => (b.memory.importance ?? 1) - (a.memory.importance ?? 1) || b.score - a.score)
      .map((row) => row.memory);

    const scored = [];
    for (const memory of all) {
      if (memory.kind === 'fact') continue;
      if (memory.supersededBy) continue;
      const score = scoreMemory(memory, queryTokens, now, { halfLifeDays: this.halfLifeDays });
      if (score >= minScore) scored.push({ memory, score });
    }
    scored.sort((a, b) => b.score - a.score);

    return {
      facts,
      events: scored.slice(0, Math.max(0, limit)),
      // Everything that was considered but not injected, for the panel's "why not".
      considered: scored.length,
      queryTokens: queryTokens.length,
    };
  }

  /** Delete one memory by id. */
  async forget(personId, memoryId) {
    const id = String(personId ?? '');
    return this.#withLock(id, async () => {
      const record = this.people[id];
      if (!record?.memories) return false;
      const before = record.memories.length;
      record.memories = record.memories.filter((m) => m.id !== memoryId);
      if (record.memories.length === before) return false;
      await this.#save();
      return true;
    });
  }

  /** Newest-first summary for the panel. */
  snapshot({ limit = 200 } = {}) {
    const rows = [];
    for (const [personId, record] of Object.entries(this.people)) {
      const memories = Array.isArray(record?.memories) ? record.memories : [];
      if (!memories.length) continue;
      const active = memories.filter((m) => !m.supersededBy);
      const latest = active.reduce((max, m) => Math.max(max, m.createdAt), 0);
      rows.push({
        personId,
        total: memories.length,
        facts: active.filter((m) => m.kind === 'fact').length,
        events: active.filter((m) => m.kind !== 'fact').length,
        latestAt: latest || null,
        memories: [...active].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map((m) => ({
          id: m.id, text: m.text, kind: m.kind, factKey: m.factKey,
          createdAt: m.createdAt, time: memoryTime(m.createdAt),
          importance: m.importance,
        })),
      });
    }
    rows.sort((a, b) => (b.latestAt ?? 0) - (a.latestAt ?? 0));
    return { people: rows.slice(0, Math.min(200, Math.max(1, limit))), totalPeople: rows.length };
  }

  async flush() { await this.writeChain; }
}

/**
 * Render recalled memories as a prompt block.
 *
 * Deliberately short and factual: the model should treat these as things it
 * already knows, not as a document to summarise. The time tag on each line is what
 * lets it say "上次你说…" without inventing when that was.
 */
export function renderMemoryBlock({ facts = [], events = [], now = Date.now(), personLabel = '' } = {}) {
  if (!facts.length && !events.length) return '';
  const lines = [personLabel ? `关于${personLabel}，你记得这些（是你自己的记忆，不要念出来，自然地带进对话）：` : '你记得这些（不要念出来，自然地带进对话）：'];
  if (facts.length) {
    lines.push('一直记着的：');
    for (const m of facts) lines.push(`- ${m.text}`);
  }
  if (events.length) {
    lines.push('相关的事：');
    for (const { memory } of events) {
      lines.push(`- ${memoryTime(memory.createdAt, now)}：${memory.text}`);
    }
  }
  return lines.join('\n');
}