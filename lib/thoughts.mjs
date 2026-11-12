/**
 * 她想过、但没说出口的内容。
 *
 * 为什么需要单独一份存储：模型的 reasoning 只活在宿主那个会话日志里。会话一被回收、
 * 进程一重启，下一个 QQ 会话是全新的空白 agent，之前的思考全没了 —— 于是同一个人
 * 隔天再来，她既不记得上次想过什么，也不知道自己当时为什么那样回。
 *
 * 归档（messages/*.jsonl）只保存真正发出去的文字，所以补不了这个缺口；记忆（memory）
 * 存的是「对方说过什么」，也不是她自己的念头。这份是第三样东西。
 *
 * 三条设计约束：
 *   - 只存不念。这些是内心活动，注入时明确要求「不要复述」，否则她会把
 *     「我是个傲娇女友人设」这种元叙述直接说给用户听。
 *   - 有寿命。超过 N 小时的念头不再注入：三天前想的事和现在的对话无关，
 *     留着只会污染人格。
 *   - 去重 + 截断。同一个模型经常连续几轮想同一件事，原文也常常几百字，
 *     全存会把文件撑爆、把提示词撑爆。
 */
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 1;
/** 每人最多留几条，超出按时间淘汰最旧的。 */
const MAX_PER_PERSON = 80;
/** 单条念头保留的字符数。原文常常几百字，只留开头这一截。 */
const MAX_TEXT = 300;
/**
 * 过滤掉「Now reply.」这类无信息量的过场。
 *
 * 不能直接比字符数：一个汉字承载的信息量远大于一个字母，
 * 「想说说今天操场风很大」只有 11 个字却是有内容的，
 * 而「Now reply.」10 个字符什么都没说。所以汉字按 2 计权。
 */
const MIN_WEIGHT = 20;

function thoughtWeight(text) {
  let weight = 0;
  for (const ch of String(text ?? '')) weight += /[\u4e00-\u9fa5]/.test(ch) ? 2 : 1;
  return weight;
}

/** 从宿主会话事件里取出 reasoning 片段。 */
export function extractThoughtParts(events) {
  const out = [];
  for (const event of events ?? []) {
    if (event?.type !== 'assistant/message') continue;
    for (const part of event.data?.message?.content ?? []) {
      if (part?.type !== 'reasoning') continue;
      const text = String(part.text ?? '').trim();
      if (thoughtWeight(text) >= MIN_WEIGHT) out.push(text);
    }
  }
  return out;
}

/** 归一化：压掉换行和多余空白，截断。 */
function normalize(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

export class ThoughtStore {
  constructor({ dataDir, logger = console } = {}) {
    this.root = join(dataDir, 'thoughts');
    this.file = join(this.root, 'thoughts.json');
    this.logger = logger;
    this.people = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.people && typeof raw.people === 'object') this.people = raw.people;
    } catch { /* 缺失或损坏都当空开始 */ }
    this.loaded = true;
    return this;
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(this.root, { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify({ version: VERSION, people: this.people }, null, 2) + '\n');
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('念头写入失败：' + error.message));
    return this.writeChain;
  }

  /**
   * 记一批念头。
   *
   * 同一句话重复出现只留第一次（模型经常连着几轮想同样的东西）。
   * @returns 实际新增的条数。
   */
  async remember(personId, texts, { at = Date.now(), source = '', maxPerPerson = MAX_PER_PERSON } = {}) {
    const id = String(personId ?? '').trim();
    if (!id) return 0;
    const list = Array.isArray(texts) ? texts : [texts];
    const record = this.people[id] ?? { thoughts: [], updatedAt: 0 };
    const existing = Array.isArray(record.thoughts) ? record.thoughts : [];
    const seen = new Set(existing.map((t) => t.text));
    let added = 0;
    for (const raw of list) {
      const text = normalize(raw);
      if (thoughtWeight(text) < MIN_WEIGHT || seen.has(text)) continue;
      seen.add(text);
      existing.push({
        id: `t${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        text,
        at: Number(at) || Date.now(),
        source: String(source ?? '').slice(0, 40),
      });
      added += 1;
    }
    if (!added) return 0;
    // 按时间保留最近的若干条。
    existing.sort((a, b) => a.at - b.at);
    record.thoughts = existing.slice(-maxPerPerson);
    record.updatedAt = Date.now();
    this.people[id] = record;
    await this.#save();
    return added;
  }

  /** 最近的念头，新的在前。 */
  recent(personId, { limit = 3, maxAgeHours = 48, now = Date.now() } = {}) {
    const record = this.people[String(personId ?? '')];
    const thoughts = Array.isArray(record?.thoughts) ? record.thoughts : [];
    const cutoff = Number(maxAgeHours) > 0 ? now - Number(maxAgeHours) * 3_600_000 : -Infinity;
    return thoughts
      .filter((t) => t && typeof t.text === 'string' && t.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, Math.max(0, limit));
  }

  /** Delete one thought by id. */
  async forget(personId, thoughtId) {
    const id = String(personId ?? '');
    const record = this.people[id];
    if (!record?.thoughts) return false;
    const before = record.thoughts.length;
    record.thoughts = record.thoughts.filter((t) => t.id !== thoughtId);
    if (record.thoughts.length === before) return false;
    await this.#save();
    return true;
  }
  /** 面板摘要。 */
  snapshot({ limit = 100 } = {}) {
    const rows = [];
    for (const [personId, record] of Object.entries(this.people)) {
      const thoughts = Array.isArray(record?.thoughts) ? record.thoughts : [];
      if (!thoughts.length) continue;
      const sorted = [...thoughts].sort((a, b) => b.at - a.at);
      rows.push({
        personId,
        total: thoughts.length,
        latestAt: sorted[0]?.at ?? null,
        thoughts: sorted.slice(0, 20).map((t) => ({ id: t.id, text: t.text, at: t.at, source: t.source })),
      });
    }
    rows.sort((a, b) => (b.latestAt ?? 0) - (a.latestAt ?? 0));
    return { people: rows.slice(0, Math.min(200, Math.max(1, limit))), totalPeople: rows.length };
  }

  async flush() { await this.writeChain; }
}

/**
 * 渲染成提示词片段。
 *
 * 措辞刻意强调「内心活动」和「不要复述」：这些原文里全是
 * 「我是傲娇女友人设，要说 1-3 条」这类元叙述，照念出来会当场破功。
 */
export function renderThoughtBlock({ thoughts = [] } = {}) {
  if (!thoughts.length) return '';
  const lines = [
    '你之前想过的（你自己的内心活动，只当背景，绝对不要复述、不要提到「人设」「设定」「提示词」这类词）：',
  ];
  for (const t of thoughts) lines.push(`- ${t.text}`);
  return lines.join('\n');
}
