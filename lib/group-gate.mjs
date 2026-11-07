/**
 * Group-chat reply gating: decide whether a message is worth answering.
 *
 * The problem this solves is volume. In a busy group every message used to be a
 * candidate under `group: "all"`, and `group: "mention"` swings the other way —
 * she says nothing unless explicitly summoned, which reads as a dead account.
 * The middle ground people actually want is "reply when it is about me, when it
 * is addressed to me, or when the topic is something I care about".
 *
 * Three properties matter more than the scoring itself:
 *
 *   - THE DECISION MUST BE CHEAP AND SYNCHRONOUS. It runs inside `accept()` on
 *     every inbound group message. A model call here would add latency to every
 *     line in the group and cost money for messages she then ignores. So this is
 *     pure string work, with an optional learned interest list.
 *
 *   - SILENCE MUST BE THE DEFAULT. Every rule below can only ADD a reason to
 *     reply; with no signal at all the answer is "no". The failure mode of a
 *     chatty bot is far worse than the failure mode of a quiet one.
 *
 *   - DIRECT ADDRESS ALWAYS WINS. A mention, a quote-reply to her, or her name in
 *     the text bypasses every threshold. Ignoring someone who called your name is
 *     the single most broken thing a chat bot can do.
 *
 * Interest scoring is deliberately transparent: named lists plus a small learned
 * map, not an opaque model judgement. When she stays quiet, "why" should be
 * answerable by looking at the numbers.
 */

/**
 * Reasons, in priority order. `direct` reasons always pass; `scored` reasons are
 * compared against the threshold.
 */
export const REPLY_REASONS = {
  MENTION: 'mention',
  QUOTE: 'quote',
  NAME: 'name',
  SELF_REFERENCE: 'self_reference',
  QUESTION_TO_GROUP: 'question',
  INTEREST: 'interest',
  TOPIC: 'topic',
};

/** Phrases that mean "someone is talking about me" without an @. */
export const SELF_REFERENCE_PATTERNS = [
  /你(在|在干嘛|在吗|干嘛呢|说什么|觉得|怎么|是不是|会|能)/,
  /你们(在|说|聊)/,
  /(bot|机器人|小助手)/i,
];

/** Question shapes that are usually aimed at whoever will answer. */
export const GROUP_QUESTION_PATTERNS = [
  /有(人|没有?人)(知道|了解|会|在)/,
  /谁(知道|了解|会|在|能)/,
  /(怎么|如何|为什么|为啥)(办|做|弄|搞|解决|回事)/,
  /(求|需要)(推荐|帮助|解答)/,
  /[?？]\s*$/,
];

/**
 * Default topic interests. Kept short and generic on purpose — the user extends
 * this through config, and a huge default list would make her reply to everything.
 */
export const DEFAULT_INTERESTS = [
  // 娱乐
  '游戏', '动漫', '动画', '电影', '剧', '音乐', '歌', '小说',
  // 学习与技术
  '编程', '代码', '算法', '学习', '考试', '作业', '论文', '题',
  // 生活
  '吃饭', '午饭', '晚饭', '早饭', '美食', '吃什么', '好吃', '奶茶', '咖啡',
  '旅游', '出去玩', '天气', '下雨', '下雪',
  // 动物
  '猫', '狗', '宠物',
];

/**
 * Score one group message.
 *
 * Returns `{ reply, score, reason, detail }`. `reason` is the strongest single
 * justification found, which is what gets logged so a surprising silence or a
 * surprising reply can both be explained.
 */
export function scoreGroupMessage(message, options = {}) {
  const {
    selfId = '',
    selfNames = [],
    interests = [],
    threshold = 3,
    // How much weight a learned/observed interest carries versus a configured one.
    learnedWeight = 2,
    learned = {},
    replyToSelf = false,
  } = options;

  const text = String(message?.text ?? '').trim();
  if (!text) return { reply: false, score: 0, reason: 'empty', detail: '空消息' };

  // ---- direct address: unconditional -------------------------------------
  if (message?.mentioned) {
    return { reply: true, score: 99, reason: REPLY_REASONS.MENTION, detail: '被 @' };
  }
  if (replyToSelf) {
    return { reply: true, score: 99, reason: REPLY_REASONS.QUOTE, detail: '引用了你的消息' };
  }
  // Name matching must be boundary-aware. A plain `includes` makes a QQ number
  // match any message containing those digits — with a short id (or the "1" some
  // tests use) every message looks like a mention of her. Digits need a
  // non-digit boundary; CJK nicknames just need to not be part of a longer run.
  for (const name of [String(selfId), ...selfNames].filter(Boolean)) {
    const needle = String(name);
    if (!needle) continue;
    const isNumeric = /^\d+$/.test(needle);
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = isNumeric
      ? new RegExp(`(^|\\D)${escaped}(\\D|$)`)
      : new RegExp(escaped);
    if (pattern.test(text)) {
      return { reply: true, score: 95, reason: REPLY_REASONS.NAME, detail: `提到「${needle}」` };
    }
  }

  // ---- scored signals ----------------------------------------------------
  let score = 0;
  let reason = '';
  const notes = [];

  // Talking TO someone ("你在干嘛") rather than about them.
  for (const pattern of SELF_REFERENCE_PATTERNS) {
    if (pattern.test(text)) {
      score += 3;
      reason = REPLY_REASONS.SELF_REFERENCE;
      notes.push('像在对人说话');
      break;
    }
  }

  // A question nobody in particular was asked.
  //
  // "有没有人知道…" and "谁…" are addressed to the room and are exactly the case
  // this feature exists for, so they carry the full threshold on their own. A bare
  // trailing "?" is much weaker evidence (people end statements with it), so it
  // only adds partial weight.
  if (!reason) {
    for (const pattern of GROUP_QUESTION_PATTERNS) {
      if (pattern.test(text)) {
        const strong = !/\[?？?\]?$/.test(pattern.source) || pattern.source.length > 8;
        score += strong ? 3 : 2;
        reason = REPLY_REASONS.QUESTION_TO_GROUP;
        notes.push(strong ? '在向群里提问' : '像是提问');
        break;
      }
    }
  }

  // Configured interests. A single hit is worth the full threshold on its own:
  // "she replies to things she is interested in" is the feature, and making one
  // keyword worth only 2/3 of a threshold would mean the common case (one topic)
  // never fires. Additional hits add less each time.
  const lower = text.toLowerCase();
  let hits = 0;
  for (const topic of interests) {
    const word = String(topic ?? '').trim().toLowerCase();
    if (word && lower.includes(word)) hits += 1;
  }
  if (hits) {
    score += Math.min(6, 3 + (hits - 1));
    if (!reason) reason = REPLY_REASONS.INTEREST;
    notes.push(`命中兴趣 ${hits} 项`);
  }

  // Learned topics (from messages she actually answered) carry less weight.
  let learnedHits = 0;
  for (const [topic, weight] of Object.entries(learned ?? {})) {
    const word = String(topic ?? '').trim().toLowerCase();
    if (word && lower.includes(word)) learnedHits += Math.min(2, Number(weight) || 0);
  }
  if (learnedHits) {
    // Learned topics are weaker evidence than configured ones: they come from
    // her own past replies, which can drift. Still enough to reach the threshold
    // on its own when the topic repeats.
    score += Math.min(4, 2 + learnedHits);
    if (!reason) reason = REPLY_REASONS.TOPIC;
    notes.push(`命中历史话题 ${learnedHits}`);
  }

  // Length is a weak signal: a long message is more likely to deserve an answer
  // than "嗯". Capped at 1 so it can never carry a decision on its own.
  if ([...text].length >= 30) {
    score += 1;
    notes.push('内容较长');
  }

  const reply = score >= threshold;
  return {
    reply,
    score,
    reason: reply ? (reason || REPLY_REASONS.INTEREST) : 'below_threshold',
    detail: notes.join('，') || '没有明显信号',
  };
}

/**
 * Track which topics actually got answered, so the gate adapts a little.
 *
 * Bounded and decayed: without both, the learned map converges on "everything"
 * and the gate stops filtering at all.
 */
export class InterestLearner {
  // decay 0.75/day: a topic seen once is forgotten in about a week, one seen a
  // few times survives longer. At 0.9 a single observation lingered for weeks and
  // the map only ever grew.
  constructor({ maxTopics = 60, decay = 0.75 } = {}) {
    this.maxTopics = maxTopics;
    this.decay = decay;
    this.topics = new Map();
  }

  /** Record a topic from a message she replied to. */
  observe(text, words = []) {
    const lower = String(text ?? '').toLowerCase();
    if (!lower) return;
    for (const word of words) {
      const key = String(word ?? '').trim().toLowerCase();
      if (!key || !lower.includes(key)) continue;
      this.topics.set(key, Math.min(6, (this.topics.get(key) ?? 0) + 1));
    }
    this.#trim();
  }

  /** Decay every topic by one step; call once per day. */
  decayAll() {
    for (const [key, value] of this.topics) {
      const next = value * this.decay;
      if (next < 0.3) this.topics.delete(key); else this.topics.set(key, next);
    }
  }

  #trim() {
    if (this.topics.size <= this.maxTopics) return;
    const sorted = [...this.topics.entries()].sort((a, b) => b[1] - a[1]);
    this.topics = new Map(sorted.slice(0, this.maxTopics));
  }

  /** Plain object for config/persistence and for scoreGroupMessage. */
  toObject() {
    const out = {};
    for (const [key, value] of this.topics) out[key] = Math.round(value * 10) / 10;
    return out;
  }

  load(raw) {
    this.topics = new Map();
    if (!raw || typeof raw !== 'object') return this;
    for (const [key, value] of Object.entries(raw)) {
      const n = Number(value);
      if (key && Number.isFinite(n) && n > 0) this.topics.set(String(key).toLowerCase(), Math.min(6, n));
    }
    return this;
  }
}

/**
 * Cheap topic extraction: CJK bigrams plus latin words.
 *
 * Bigrams are crude but language-agnostic enough for Chinese without a segmenter,
 * and this only feeds a heuristic, so precision is not critical.
 */
export function extractTopicWords(text, { limit = 40 } = {}) {
  const body = String(text ?? '').toLowerCase();
  const out = new Set();
  for (const word of body.match(/[a-z][a-z0-9_+#.-]{2,}/g) ?? []) out.add(word);
  const cjk = body.match(/[\u4e00-\u9fa5]+/g) ?? [];
  for (const run of cjk) {
    if (run.length === 1) continue;
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  }
  return [...out].slice(0, limit);
}