/**
 * Emotional state and relationship progression.
 *
 * Distilled from asakiyoshi/EmotionAI-Pro (v4.0.0), which fuses EmotionAI's
 * 8-dimension emotion model with FavourPro's favor/intimacy pair. The parts kept
 * here are the ones that change what she SAYS; the parts dropped are the ones that
 * only exist to serve a command interface (/好感排行, /缓存统计, /备份数据 …),
 * because this plugin has no command surface — the panel and tools replace it.
 *
 * Three mechanisms carry almost all of the value, and each replaces a specific
 * way a "好感度" feature usually goes wrong:
 *
 *   - LAG BANDS on stage transitions. A raw threshold makes the stage flicker when
 *     the score sits on the boundary ("深化期→初识期→深化期" within three
 *     messages). Rising uses the nominal threshold, falling uses threshold−5, so a
 *     stage once reached needs a real drop to be lost.
 *
 *   - TRANSITION PROTECTION. When a stage is newly reached the composite score is
 *     pinned to at least the previous peak, and intimacy gains are multiplied
 *     (×4.0 in 初识期 … ×1.0 in 共生期). Without this the score visibly jumps
 *     backwards right after advancing, which reads as the relationship resetting.
 *
 *   - NEGATIVE FAVOR IS A SEPARATE REGIME, not a low positive one. Below zero the
 *     intimacy weight collapses to 0 and the stage names switch to 冷淡/反感/敌对.
 *     Averaging a hostile relationship into the same four-stage ladder would let
 *     intimacy keep it alive after favor has gone.
 *
 * Everything here is pure arithmetic over a plain state object: no timers, no I/O,
 * no model calls. Persistence and the model-facing text live in emotion-store.mjs
 * and the runtime.
 */

export const EMOTION_DIMENSIONS = [
  'joy', 'trust', 'fear', 'surprise', 'sadness', 'disgust', 'anger', 'anticipation',
];

export const EMOTION_LABELS = {
  joy: '喜悦', trust: '信任', fear: '恐惧', surprise: '惊讶',
  sadness: '悲伤', disgust: '厌恶', anger: '愤怒', anticipation: '期待',
};

export const FAVOR_MIN = -100;
export const FAVOR_MAX = 100;
export const INTIMACY_MIN = 0;
export const INTIMACY_MAX = 100;
export const EMOTION_MIN = 0;
export const EMOTION_MAX = 100;

/** Per-turn change caps. Favor/intimacy move slower than single emotions. */
export const MAX_DELTA_RELATION = 5;
export const MAX_DELTA_EMOTION = 3;

/**
 * Stage ladder. `key` is stable for storage; `name` is what the panel shows.
 * `compositeThreshold` is the rising threshold; falling uses threshold − LAG.
 */
export const STAGES = [
  {
    key: 'INITIAL',
    name: '初识期',
    description: '好感驱动，建立吸引',
    favorWeight: 0.7,
    intimacyWeight: 0.3,
    compositeThreshold: 25,
    transitionBuffer: 3,
    intimacyBoostFactor: 4.0,
    advice: '多展示个人魅力，建立良好第一印象。通过有趣的话题和积极的互动提升好感度。',
  },
  {
    key: 'DEEPENING',
    name: '深化期',
    description: '互动平衡，共同成长',
    favorWeight: 0.5,
    intimacyWeight: 0.5,
    compositeThreshold: 55,
    transitionBuffer: 5,
    intimacyBoostFactor: 3.6,
    advice: '分享更多个人经历和情感，建立信任基础。共同经历和深度交流是关键。',
  },
  {
    key: 'COMMITMENT',
    name: '承诺期',
    description: '亲密主导，根基稳固',
    favorWeight: 0.3,
    intimacyWeight: 0.7,
    compositeThreshold: 80,
    transitionBuffer: 7,
    intimacyBoostFactor: 3.0,
    advice: '巩固信任和默契，在困难时刻相互支持。关系的深度比广度更重要。',
  },
  {
    key: 'SYMBIOSIS',
    name: '共生期',
    description: '完全融合，不分彼此',
    favorWeight: 0.5,
    intimacyWeight: 0.5,
    compositeThreshold: 95,
    transitionBuffer: 10,
    intimacyBoostFactor: 1.0,
    advice: '维持情感的深度连接，共同成长和创造美好回忆。',
  },
];

const STAGE_BY_KEY = new Map(STAGES.map((s) => [s.key, s]));
const STAGE_INDEX = new Map(STAGES.map((s, i) => [s.key, i]));

/** How far the score may fall below a threshold before the stage is lost. */
export const STAGE_LAG = 5;

/** Negative-favor regimes, checked in order from mildest. */
export const NEGATIVE_REGIMES = [
  { key: 'COLD', name: '冷淡期', min: -30, description: '关系冷淡，需要修复', advice: '需要真诚道歉和积极行动来修复关系，避免进一步恶化。' },
  { key: 'AVERSE', name: '反感期', min: -70, description: '存在反感情绪', advice: '需要时间和耐心来缓解负面情绪，避免直接冲突。' },
  { key: 'HOSTILE', name: '敌对期', min: -100, description: '关系敌对', advice: '关系极度紧张，需要保持距离或寻求第三方调解。' },
];

/** A brand-new acquaintance. Favor 0 / intimacy 0 lands in 初识期. */
export function createEmotionState(userKey = '') {
  const emotions = {};
  for (const dimension of EMOTION_DIMENSIONS) emotions[dimension] = 0;
  return {
    version: 1,
    userKey: String(userKey ?? ''),
    favor: 0,
    intimacy: 0,
    emotions,
    // Free-text labels the model writes and later reads back.
    attitude: '中立',
    relationship: '陌生人',
    // Bookkeeping used by the stage maths.
    stage: 'INITIAL',
    previousComposite: 0,
    transitionPeak: 0,
    totalTurns: 0,
    positiveTurns: 0,
    negativeTurns: 0,
    lastInteractionAt: 0,
    lastUpdatedAt: 0,
    // Important moments, newest last. Bounded.
    memories: [],
  };
}

export function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Coerce a possibly-corrupt persisted state into a valid one. */
export function normalizeEmotionState(raw, userKey = '') {
  const base = createEmotionState(userKey);
  if (!raw || typeof raw !== 'object') return base;
  const state = {
    ...base,
    ...raw,
    userKey: String(raw.userKey ?? userKey ?? ''),
    favor: Math.round(clamp(raw.favor ?? 0, FAVOR_MIN, FAVOR_MAX)),
    intimacy: Math.round(clamp(raw.intimacy ?? 0, INTIMACY_MIN, INTIMACY_MAX)),
    emotions: { ...base.emotions },
    memories: Array.isArray(raw.memories) ? raw.memories.slice(-40) : [],
    totalTurns: Math.max(0, Math.round(Number(raw.totalTurns) || 0)),
    positiveTurns: Math.max(0, Math.round(Number(raw.positiveTurns) || 0)),
    negativeTurns: Math.max(0, Math.round(Number(raw.negativeTurns) || 0)),
  };
  for (const dimension of EMOTION_DIMENSIONS) {
    state.emotions[dimension] = Math.round(clamp(raw.emotions?.[dimension] ?? 0, EMOTION_MIN, EMOTION_MAX));
  }
  state.attitude = String(raw.attitude ?? '中立').slice(0, 40) || '中立';
  state.relationship = String(raw.relationship ?? '陌生人').slice(0, 60) || '陌生人';
  state.stage = STAGE_BY_KEY.has(raw.stage) ? raw.stage : 'INITIAL';
  state.previousComposite = Number.isFinite(Number(raw.previousComposite)) ? Number(raw.previousComposite) : 0;
  state.transitionPeak = Number.isFinite(Number(raw.transitionPeak)) ? Number(raw.transitionPeak) : 0;
  state.lastInteractionAt = Number(raw.lastInteractionAt) || 0;
  state.lastUpdatedAt = Number(raw.lastUpdatedAt) || 0;
  return state;
}

/** Weighted favor/intimacy score for the CURRENT stage. */
export function rawComposite(state, stageKey = state.stage) {
  if (state.favor < 0) return state.favor;
  const config = STAGE_BY_KEY.get(stageKey) ?? STAGES[0];
  return state.favor * config.favorWeight + state.intimacy * config.intimacyWeight;
}

/**
 * Stage for a score, with the lag band applied.
 *
 * `previousKey` decides which threshold is used: advancing needs the nominal
 * value, falling needs nominal − LAG. That asymmetry is the whole point — a stage
 * that was just reached should not be lost to a rounding error.
 */
export function stageForScore(score, previousKey = 'INITIAL') {
  if (score < 0) return previousKey;
  let rawTarget = 'INITIAL';
  for (const stage of STAGES) if (score >= stage.compositeThreshold) rawTarget = stage.key;
  const targetIndex = STAGE_INDEX.get(rawTarget) ?? 0;
  const previousIndex = STAGE_INDEX.get(previousKey) ?? 0;

  // Advancing needs the target's full threshold.
  if (targetIndex > previousIndex) return rawTarget;

  // Staying or falling uses the PREVIOUS stage's threshold minus the lag band.
  //
  // The subtlety: the band must be anchored on the stage being left, not on the
  // raw target. Anchoring on the target means that after reaching 深化期 (55) a
  // score of 54 computes target=INITIAL (whose threshold is 25), 25-5=20, so 54
  // passes and the stage is lost immediately — the lag band silently does nothing.
  // Anchored on 深化期 it needs to fall below 55-5=50 before dropping.
  if (previousIndex > 0) {
    const holdThreshold = STAGE_BY_KEY.get(previousKey).compositeThreshold - STAGE_LAG;
    if (score >= holdThreshold) return previousKey;
  }
  return rawTarget;
}

/**
 * Full stage evaluation: the stage, the protected composite, and whether a
 * transition is in progress.
 *
 * Returns a NEW state object rather than mutating, so a caller that decides not to
 * keep the turn (e.g. an aborted reply) can simply drop it.
 */
export function evaluateStage(state) {
  const next = { ...state, emotions: { ...state.emotions } };
  if (next.favor < 0) {
    // Negative regime: intimacy no longer participates at all.
    const regime = NEGATIVE_REGIMES.find((r) => next.favor >= r.min) ?? NEGATIVE_REGIMES.at(-1);
    return {
      state: { ...next, stage: 'INITIAL', previousComposite: next.favor, transitionPeak: 0 },
      stageKey: null,
      stageName: regime.name,
      description: regime.description,
      advice: regime.advice,
      composite: next.favor,
      favorWeight: 1,
      intimacyWeight: 0,
      isTransitioning: false,
      transitionProgress: 0,
      intimacyBoostActive: false,
      neededIntimacy: 0,
      progressToNext: regime.key === 'COLD'
        ? Math.max(0, ((next.favor + 30) / 30) * 100)
        : regime.key === 'AVERSE'
          ? Math.max(0, ((next.favor + 70) / 40) * 100)
          : 0,
      negative: true,
      regime: regime.key,
    };
  }

  const composite = rawComposite(next, next.stage);
  const targetKey = stageForScore(composite, next.stage);
  const target = STAGE_BY_KEY.get(targetKey);
  const advanced = (STAGE_INDEX.get(targetKey) ?? 0) > (STAGE_INDEX.get(next.stage) ?? 0);
  const dropped = (STAGE_INDEX.get(targetKey) ?? 0) < (STAGE_INDEX.get(next.stage) ?? 0);

  // Protection: never let the visible score fall below the peak reached in the
  // current stage, so advancing does not look like a setback.
  const peak = Math.max(Number(next.transitionPeak) || 0, composite, Number(next.previousComposite) || 0);
  const protectedComposite = advanced ? Math.max(composite, next.transitionPeak || 0) : composite;

  // Intimacy still needed to make the protected score honest under the new weights.
  let neededIntimacy = 0;
  if (advanced && target.intimacyWeight > 0) {
    const required = (protectedComposite - next.favor * target.favorWeight) / target.intimacyWeight;
    neededIntimacy = Math.max(0, Math.min(100, Math.round(required)) - next.intimacy);
  }
  const transitionProgress = neededIntimacy <= 0
    ? 100
    : Math.min(100, (next.intimacy / (next.intimacy + neededIntimacy)) * 100);

  // Weights during a transition lean on intimacy, which is what the boost is for.
  let favorWeight = target.favorWeight;
  let intimacyWeight = target.intimacyWeight;
  const boostActive = advanced && neededIntimacy > 0;
  if (boostActive) {
    const boosted = target.intimacyWeight * target.intimacyBoostFactor;
    const total = target.favorWeight + boosted;
    favorWeight = target.favorWeight / total;
    intimacyWeight = boosted / total;
  }

  const progressToNext = Math.max(0, Math.min(100, (protectedComposite / target.compositeThreshold) * 100));

  const updated = {
    ...next,
    stage: targetKey,
    previousComposite: protectedComposite,
    transitionPeak: dropped ? composite : peak,
    // Persist the boost decision. `applyDeltas` needs it on the NEXT turn, when
    // re-evaluating would no longer see a transition (the stage already moved).
    intimacyBoost: boostActive ? target.intimacyBoostFactor : 0,
  };

  return {
    state: updated,
    stageKey: targetKey,
    stageName: target.name,
    description: target.description,
    advice: target.advice,
    composite: protectedComposite,
    favorWeight,
    intimacyWeight,
    isTransitioning: advanced,
    transitionProgress,
    intimacyBoostActive: boostActive,
    neededIntimacy,
    progressToNext,
    negative: false,
    regime: null,
  };
}

/**
 * Apply per-turn deltas.
 *
 * Favor and intimacy are capped per turn; the eight emotions are capped tighter
 * because a single sentence should not max out an emotion. The intimacy boost is
 * applied here (not in the stage maths) so the stored value reflects it.
 */
export function applyDeltas(state, deltas = {}) {
  const next = { ...state, emotions: { ...state.emotions } };
  // Evaluate the state as it stands BEFORE the deltas, so a stage that was just
  // reached on the previous turn keeps its boost. Reading the raw `state` here
  // would miss the transition (its `stage` field is still the old one) and the
  // multiplier would silently never apply.
  const stage = evaluateStage(next);
  // Prefer the persisted factor: a transition is a one-turn event, so recomputing
  // it here would miss every turn after the stage already advanced.
  const persistedBoost = Number(next.intimacyBoost) || 0;
  const boost = persistedBoost > 0
    ? persistedBoost
    : (stage.intimacyBoostActive ? (STAGE_BY_KEY.get(stage.stageKey)?.intimacyBoostFactor ?? 1) : 1);

  next.favor = Math.round(clamp(next.favor + clamp(deltas.favor ?? 0, -MAX_DELTA_RELATION, MAX_DELTA_RELATION), FAVOR_MIN, FAVOR_MAX));
  const intimacyDelta = clamp(deltas.intimacy ?? 0, -MAX_DELTA_RELATION, MAX_DELTA_RELATION);
  // Only amplify positive intimacy; a boost must never make a slight worse.
  const boosted = intimacyDelta > 0 ? Math.round(intimacyDelta * boost) : intimacyDelta;
  next.intimacy = Math.round(clamp(next.intimacy + boosted, INTIMACY_MIN, INTIMACY_MAX));

  for (const dimension of EMOTION_DIMENSIONS) {
    const delta = clamp(deltas[dimension] ?? 0, -MAX_DELTA_EMOTION, MAX_DELTA_EMOTION);
    next.emotions[dimension] = Math.round(clamp(next.emotions[dimension] + delta, EMOTION_MIN, EMOTION_MAX));
  }
  return next;
}

/** The strongest emotion, or null when everything is flat. */
export function dominantEmotion(state) {
  let best = null;
  for (const dimension of EMOTION_DIMENSIONS) {
    const value = state.emotions?.[dimension] ?? 0;
    if (!best || value > best.value) best = { dimension, value };
  }
  if (!best || best.value <= 0) return null;
  return { ...best, label: EMOTION_LABELS[best.dimension] };
}

/**
 * How she should behave, derived from favor/intimacy.
 *
 * Mirrors AttitudeRelationshipManager.BEHAVIOR_STYLES. Kept as text fragments
 * rather than finished sentences so the model still writes in her own voice.
 */
export function behaviorStyle(state) {
  const composite = state.favor * 0.6 + state.intimacy * 0.4;
  if (state.favor < -50) return { key: 'hostile', text: '极其简短、尖锐，可以拒绝回应' };
  if (state.favor < -10) return { key: 'cold', text: '冷淡、简洁、不耐烦' };
  if (composite >= 75) return { key: 'intimate', text: '热情、主动、富有情感，可以用亲昵的称呼' };
  if (composite >= 40) return { key: 'friendly', text: '积极、乐于回应、带一点正面情绪' };
  return { key: 'neutral', text: '自然、保持一点距离、不过分热情' };
}

/** Tone fragment for the dominant emotion, above a threshold. */
export const TONE_INSTRUCTIONS = {
  joy: '语气轻快、有活力，愿意多聊两句',
  trust: '语气平和、真诚、让人安心',
  fear: '语气有点谨慎、不安，会犹豫',
  surprise: '语气里带着意外和好奇',
  sadness: '语气低落，句子偏短，有点无力',
  disgust: '语气里带着抗拒，想回避',
  anger: '语气急躁，句子短，不太耐烦',
  anticipation: '语气里带着期待，关注接下来会怎样',
};

export function toneInstruction(state, threshold = 30) {
  const dominant = dominantEmotion(state);
  if (dominant && dominant.value > threshold) {
    return { emotion: dominant.dimension, label: dominant.label, text: TONE_INSTRUCTIONS[dominant.dimension] };
  }
  if (state.favor >= 40) return { emotion: null, label: null, text: '友好积极的语气' };
  if (state.favor >= -10) return { emotion: null, label: null, text: '中立、自然的语气' };
  return { emotion: null, label: null, text: '简洁、冷淡的语气' };
}

/**
 * Whether this turn is significant enough to remember.
 *
 * The threshold is on the ABSOLUTE size of the change, so a big fight and a big
 * confession are both remembered while ordinary small talk is not.
 */
export function isSignificant(deltas = {}, threshold = 5) {
  let magnitude = 0;
  for (const key of ['favor', 'intimacy', ...EMOTION_DIMENSIONS]) {
    magnitude += Math.abs(Number(deltas[key]) || 0);
  }
  return magnitude >= threshold;
}

/** A short human-readable summary of the relationship, for prompts. */
export function describeState(state, { privacyLevel = 1 } = {}) {
  if (privacyLevel === 0) return '';
  const stage = evaluateStage(state);
  const lines = [];
  lines.push(`关系阶段：${stage.stageName}（${stage.description}）`);
  if (privacyLevel >= 2) {
    lines.push(`好感度 ${state.favor}（-100..100），亲密度 ${state.intimacy}（0..100）。`);
    const dominant = dominantEmotion(state);
    if (dominant) lines.push(`此刻最明显的情绪是${dominant.label}（${dominant.value}/100）。`);
    if (stage.isTransitioning) {
      lines.push(`正在向新阶段过渡，还需要 ${stage.neededIntimacy} 点亲密度，进度 ${Math.round(stage.transitionProgress)}%。`);
    }
  }
  if (state.relationship && state.relationship !== '陌生人') lines.push(`你们的关系：${state.relationship}`);
  if (state.attitude && state.attitude !== '中立') lines.push(`你对他的态度：${state.attitude}`);
  return lines.join('\n');
}