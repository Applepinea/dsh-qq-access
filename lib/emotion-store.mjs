/**
 * Persistence for the emotional state, plus the model-facing analysis call.
 *
 * Split from emotion.mjs on purpose: emotion.mjs is pure arithmetic and can be
 * unit-tested without touching disk or a model. This file owns the two things that
 * are genuinely stateful — where the numbers live, and who decides how they move.
 *
 * Two decisions worth stating:
 *
 *   - STATE IS KEYED BY QQ NUMBER, NOT BY SESSION. EmotionAI-Pro defaults to
 *     per-session (`session_based: false` means shared, despite the name). For a
 *     persona with one owner and a few group friends, per-QQ is the honest model:
 *     the same person talking in two groups is the same relationship. The config
 *     still exposes `perSession` for people who want the other behaviour.
 *
 *   - THE MODEL PROPOSES, THIS FILE DISPOSES. The analyser returns deltas; caps,
 *     clamping, stage maths and persistence all happen here. Letting a model write
 *     the score directly is how a "好感度" system ends up at 100 in one evening.
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import {
  applyDeltas, createEmotionState, evaluateStage, isSignificant,
  normalizeEmotionState, EMOTION_DIMENSIONS,
} from './emotion.mjs';

const VERSION = 1;
const MAX_USERS = 2000;

/**
 * Keyword scoring, used when the auxiliary model is unavailable.
 *
 * Ported from SmartUpdateManager._analyze_emotional_keywords. Negative and
 * conflict words weigh more than positive ones (3 vs 2) because a bad turn moves a
 * relationship more than a good one — that asymmetry is in the original and it is
 * also how people actually work.
 */
export const KEYWORD_GROUPS = {
  positive: ['喜欢', '爱', '开心', '高兴', '谢谢', '感谢', '感动', '温暖', '棒', '不错', '可爱', '漂亮', '美丽', '想你'],
  negative: ['讨厌', '恨', '生气', '愤怒', '伤心', '难过', '失望', '烦', '滚', '傻', '笨', '蠢', '垃圾', '别烦我'],
  intimate: ['想你', '想念', '关心', '担心', '在乎', '重要', '宝贝', '亲爱的', '抱抱', '拥抱', '亲亲'],
  conflict: ['吵架', '争执', '不满', '抱怨', '批评', '指责', '反对', '不同意', '分手'],
};

const INTENSIFIERS = ['非常', '特别', '极其', '太', '真的', '超级'];

/**
 * Cheap heuristic analysis. Returns the same shape as the model analyser so the
 * caller does not care which one produced it.
 */
export function analyzeKeywords(userMessage, aiResponse = '') {
  const message = String(userMessage ?? '').toLowerCase();
  const detected = new Set();
  let score = 0;
  for (const [category, words] of Object.entries(KEYWORD_GROUPS)) {
    for (const word of words) {
      if (!message.includes(word)) continue;
      detected.add(category);
      score += category === 'negative' || category === 'conflict' ? 3 : 2;
      break; // one hit per category is enough; repeating a word is not a stronger feeling
    }
  }
  // Intensifiers and punctuation nudge the magnitude without changing the category.
  if (INTENSIFIERS.some((w) => message.includes(w))) score += 2;
  if (/[！!]/.test(message)) score += 1;
  if (/[？?]/.test(message)) score += 0.5;

  const deltas = {};
  if (!detected.size) return { deltas, category: 'neutral', reason: '', intensity: 0 };
  const positive = detected.has('positive') || detected.has('intimate');
  const negative = detected.has('negative') || detected.has('conflict');
  if (positive && !negative) {
    deltas.favor = score >= 4 ? 2 : 1;
    deltas.joy = 2;
    deltas.trust = 1;
    if (detected.has('intimate')) { deltas.intimacy = 2; deltas.anticipation = 1; }
  } else if (negative && !positive) {
    // Negative turns move favor more than positive ones at the same intensity:
    // a single insult should not weigh the same as a single thank-you. -2 is the
    // floor for a detected negative word, -3 once it is also intensified.
    deltas.favor = score >= 5 ? -3 : -2;
    deltas.joy = -1;
    deltas.anger = detected.has('conflict') ? 2 : 1;
    deltas.trust = -1;
    if (detected.has('conflict')) deltas.intimacy = -1;
  }
  const category = positive && negative ? 'mixed'
    : negative ? (detected.has('conflict') ? 'negative_conflict' : 'negative')
      : detected.has('intimate') ? 'positive_intimate' : 'positive';
  return {
    deltas,
    category,
    reason: category === 'mixed' ? '对话同时包含正负情感' : '对话包含情感关键词',
    intensity: Math.min(5, Math.round(score)),
  };
}

export class EmotionStore {
  constructor({ dataDir, logger = console, perSession = false, significanceThreshold = 5, privacyLevel = 1 } = {}) {
    this.root = join(dataDir, 'emotion');
    this.file = join(this.root, 'state.json');
    this.logger = logger;
    this.perSession = perSession === true;
    this.significanceThreshold = significanceThreshold;
    this.privacyLevel = privacyLevel;
    this.users = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
    // Coalesce concurrent turns: the analyser is async and two replies can land
    // at once, which would otherwise read-modify-write the same key and lose one.
    this.locks = new Map();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.users && typeof raw.users === 'object') this.users = raw.users;
    } catch { /* missing or corrupt starts empty */ }
    this.loaded = true;
    return this;
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(this.root, { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify({ version: VERSION, users: this.users }, null, 2) + '\n');
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('情感状态写入失败：' + error.message));
    return this.writeChain;
  }

  /** Serialise work per user key. */
  async #withLock(key, fn) {
    const prior = this.locks.get(key) ?? Promise.resolve();
    const run = prior.then(fn, fn);
    // Store a swallowed variant so a rejected turn cannot poison the next one,
    // and compare against THAT object (calling .catch() again would make a new
    // promise every time, so the equality test would never be true and the entry
    // would leak forever).
    const settled = run.catch(() => {});
    this.locks.set(key, settled);
    try { return await run; } finally {
      if (this.locks.get(key) === settled) this.locks.delete(key);
    }
  }

  /** Storage key for a QQ number (or conversation, when perSession is on). */
  keyFor({ peerId, kind = 'private', sessionId = '' } = {}) {
    const id = String(peerId ?? '').trim();
    if (!id) return '';
    return this.perSession ? `${kind}:${sessionId || id}` : id;
  }

  get(userKey) {
    const raw = this.users[userKey];
    if (!raw) return createEmotionState(userKey);
    return normalizeEmotionState(raw, userKey);
  }

  /** Current state plus derived stage info, for prompts and the panel. */
  describe(userKey) {
    const state = this.get(userKey);
    return { state, stage: evaluateStage(state) };
  }

  /**
   * Record one turn.
   *
   * `deltas` may come from a model or from `analyzeKeywords`; either way the caps
   * and clamping in emotion.mjs apply. Returns the new state and whether this turn
   * was significant enough to remember.
   */
  async record(userKey, { deltas = {}, attitude = '', relationship = '', note = '', category = 'neutral', at = Date.now() } = {}) {
    if (!userKey) return null;
    return this.#withLock(userKey, async () => {
      const before = this.get(userKey);
      let next = applyDeltas(before, deltas);
      // Let the model rewrite the free-text labels, but never let it blank them.
      if (attitude) next.attitude = String(attitude).slice(0, 40) || before.attitude;
      if (relationship) next.relationship = String(relationship).slice(0, 60) || before.relationship;
      next.totalTurns = before.totalTurns + 1;
      if (category === 'positive' || category === 'positive_intimate') next.positiveTurns = before.positiveTurns + 1;
      if (category === 'negative' || category === 'negative_conflict') next.negativeTurns = before.negativeTurns + 1;
      next.lastInteractionAt = at;
      next.lastUpdatedAt = at;

      const stage = evaluateStage(next);
      next = stage.state;

      const significant = isSignificant(deltas, this.significanceThreshold);
      if (significant && note) {
        next.memories = [...(next.memories ?? []), { at, note: String(note).slice(0, 160), category, stage: stage.stageName }].slice(-40);
      }

      this.users[userKey] = next;
      this.#trim();
      await this.#save();
      return { state: next, stage, significant };
    });
  }

  /** Manual override, used by the panel and the tools. */
  async set(userKey, patch = {}) {
    if (!userKey) return null;
    return this.#withLock(userKey, async () => {
      const before = this.get(userKey);
      const next = normalizeEmotionState({ ...before, ...patch }, userKey);
      const stage = evaluateStage(next);
      this.users[userKey] = stage.state;
      await this.#save();
      return { state: stage.state, stage };
    });
  }

  async reset(userKey) {
    if (!userKey) return null;
    return this.#withLock(userKey, async () => {
      const fresh = createEmotionState(userKey);
      this.users[userKey] = fresh;
      await this.#save();
      return { state: fresh, stage: evaluateStage(fresh) };
    });
  }

  /** Newest-first list for the panel. */
  list({ limit = 50 } = {}) {
    const rows = Object.keys(this.users).map((key) => {
      const state = this.get(key);
      const stage = evaluateStage(state);
      return {
        userKey: key,
        favor: state.favor,
        intimacy: state.intimacy,
        stage: stage.stageName,
        attitude: state.attitude,
        relationship: state.relationship,
        totalTurns: state.totalTurns,
        lastInteractionAt: state.lastInteractionAt,
        dominant: Object.entries(state.emotions).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      };
    }).sort((a, b) => (b.lastInteractionAt ?? 0) - (a.lastInteractionAt ?? 0));
    return rows.slice(0, Math.min(200, Math.max(1, limit)));
  }

  stats() {
    const keys = Object.keys(this.users);
    let total = 0;
    let positive = 0;
    let negative = 0;
    for (const key of keys) {
      const s = this.get(key);
      total += s.totalTurns;
      positive += s.positiveTurns;
      negative += s.negativeTurns;
    }
    return { users: keys.length, totalTurns: total, positiveTurns: positive, negativeTurns: negative, perSession: this.perSession };
  }

  /** Drop the least recently seen entries so the file cannot grow without bound. */
  #trim() {
    const keys = Object.keys(this.users);
    if (keys.length <= MAX_USERS) return;
    keys.sort((a, b) => (Number(this.users[a]?.lastInteractionAt) || 0) - (Number(this.users[b]?.lastInteractionAt) || 0));
    for (const key of keys.slice(0, keys.length - MAX_USERS)) delete this.users[key];
  }

  async flush() { await this.writeChain; }
}

/**
 * Prompt for the auxiliary emotion analyser.
 *
 * Ported from EmotionAnalysisExpert._build_emotion_analysis_prompt, with the
 * delta range narrowed to ±3 and the output restricted to the fields we consume.
 * Asking for a narrative instead of JSON is what makes this call cheap to parse.
 */
export function buildAnalysisPrompt({ userMessage, aiResponse, state, history = [] }) {
  const recent = history.slice(-3).map((h) => `${h.role === 'user' ? '对方' : '你'}：${h.text}`).join('\n');
  return [
    '你在分析一段 QQ 聊天里「对方」对「你」的情感影响，只输出 JSON。',
    '',
    '最近对话：',
    recent || '（无）',
    '',
    `本轮对方说：「${String(userMessage ?? '').slice(0, 500)}」`,
    `你回：「${String(aiResponse ?? '').slice(0, 500)}」`,
    '',
    '当前关系状态：',
    `- 好感度 ${state.favor}（-100 到 100）`,
    `- 亲密度 ${state.intimacy}（0 到 100）`,
    `- 累计互动 ${state.totalTurns} 次`,
    '',
    '请给出这一轮带来的变化，每项是 -3 到 3 的整数（没有变化就写 0）：',
    'favor（好感）、intimacy（亲密）、joy（喜悦）、trust（信任）、fear（恐惧）、',
    'surprise（惊讶）、sadness（悲伤）、disgust（厌恶）、anger（愤怒）、anticipation（期待）',
    '',
    '另外给出两个很短的描述：',
    '- attitude：你此刻对他的态度，2-8 个字（例如「有点在意」「保持距离」）',
    '- relationship：你们现在的关系，2-10 个字（例如「刚认识」「很熟的朋友」）',
    '',
    '只输出这个 JSON，不要解释：',
    '{"deltas":{"favor":0,"intimacy":0,"joy":0,"trust":0,"fear":0,"surprise":0,"sadness":0,"disgust":0,"anger":0,"anticipation":0},"attitude":"","relationship":"","note":"一句话记下这轮发生了什么"}',
  ].join('\n');
}

/** Pull the JSON object out of a model reply, tolerating fences and prose. */
export function extractAnalysis(text) {
  const body = String(text ?? '');
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : body;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(candidate.slice(start, end + 1));
    if (!data || typeof data !== 'object') return null;
    const deltas = {};
    for (const key of ['favor', 'intimacy', ...EMOTION_DIMENSIONS]) {
      const value = Number(data.deltas?.[key] ?? data[key] ?? 0);
      if (Number.isFinite(value)) deltas[key] = Math.max(-3, Math.min(3, Math.round(value)));
    }
    return {
      deltas,
      attitude: typeof data.attitude === 'string' ? data.attitude.slice(0, 40) : '',
      relationship: typeof data.relationship === 'string' ? data.relationship.slice(0, 60) : '',
      note: typeof data.note === 'string' ? data.note.slice(0, 160) : '',
    };
  } catch { return null; }
}