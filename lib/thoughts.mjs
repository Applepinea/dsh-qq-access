import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const VERSION = 1;
// 每人最多留多少条。念头是「最近在想什么」，不是完整日记：
// 太多会把提示词挤满，而且一个月前的念头和现在的对话已经无关。
const MAX_PER_PERSON = 40;

/**
 * 「想过但没说出口」的内容。
 *
 * 模型的 reasoning 只活在宿主会话里。会话一被回收（或进程重启），
 * 那部分就没了 —— 于是她「刚才想过要问的事」下一轮就不记得了。
 *
 * 归档 messages/ 存的是真正发出去的文字，记忆存的是对方说过的话，
 * 两者都补不上这个缺口。所以这里单独存一份。
 *
 * 和记忆的区别：
 *   记忆 = 对方告诉我的事（第三人称，客观）
 *   念头 = 我自己想的事（第一人称，内心活动）
 * 混在一起会让注入的提示词分不清「他说过」和「我想过」。
 */
export class ThoughtStore {
  constructor({ dataDir, logger = console, limit = MAX_PER_PERSON } = {}) {
    this.root = join(dataDir, 'thoughts');
    this.file = join(this.root, 'thoughts.json');
    this.logger = logger;
    this.limit = Math.max(1, Number(limit) || MAX_PER_PERSON);
    // { [personId]: [{ at, text, source }] }，越靠后越新。
    this.people = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.root, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.people && typeof raw.people === 'object') {
        this.people = raw.people;
      }
    } catch { /* 文件不存在或坏了就从空开始 */ }
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

  /** 某人最近的念头，新的在前。 */
  list(personId, { limit = 5, maxAgeHours = 48, now = Date.now() } = {}) {
    const key = String(personId ?? '').trim();
    if (!key) return [];
    const cutoff = now - Math.max(1, maxAgeHours) * 3600_000;
    // people[key] 的历史形状有两种：
    //   旧：{ thoughts: [...] }（早期版本写的）
    //   新：[...]（当前 #save 写的）
    // 只认数组会让旧文件在 list() 里抛 "all.filter is not a function"，
    // 而它在 reply() 里被调用 —— 一次异常就能打断整轮回复。
    const all = arrayOf(this.people[key]);
    return all
      .filter((t) => Number(t.at) >= cutoff)
      .slice(-Math.max(1, limit))
      .reverse();
  }

  /**
   * 记一批念头。
   *
   * 同一个人短时间内可能产生很多段 reasoning（多步工具调用）。
   * 这里按内容去重，并且只留最后 limit 条 —— 否则一次长任务就能塞满。
   */
  async remember(personId, thoughts, { source = '', now = Date.now() } = {}) {
    const key = String(personId ?? '').trim();
    if (!key) return 0;
    const incoming = (Array.isArray(thoughts) ? thoughts : [thoughts])
      .map((t) => String(t ?? '').replace(/\s+/g, ' ').trim())
      // 太短的多半是「好的」「让我看看」这类过程话，存下来没有价值。
      .filter((t) => t.length >= 8)
      .slice(0, 10);
    if (!incoming.length) return 0;

    const list = arrayOf(this.people[key]);
    const seen = new Set(list.map((t) => t.text));
    let added = 0;
    for (const text of incoming) {
      if (seen.has(text)) continue;
      seen.add(text);
      list.push({ at: now, text: text.slice(0, 400), source: String(source).slice(0, 40) });
      added += 1;
    }
    if (!added) return 0;
    this.people[key] = list.slice(-this.limit);
    await this.#save();
    return added;
  }

  async flush() { await this.writeChain; }
}

/**
 * 把念头拼成提示词片段。
 *
 * 必须明确要求「不要复述」：不写的话模型会把内心独白当台词念出来，
 * 或者生硬地提「我之前想过……」—— 那是人设崩塌，不是自然对话。
 */
export function renderThoughtBlock({ thoughts = [], now = Date.now() } = {}) {
  if (!thoughts.length) return '';
  const lines = [
    '你自己最近想过这些（是你的内心活动，不要复述、不要说「我之前想过」，自然地带进对话就好）：',
  ];
  for (const thought of thoughts) {
    const when = formatWhen(thought.at, now);
    lines.push('- ' + (when ? when + '：' : '') + thought.text);
  }
  return lines.join('\n');
}


/**
 * 把 people[key] 归一成数组。
 *
 * 早期版本写进去的是 { thoughts: [...] }，后来改成直接存数组。
 * 两种都可能出现在磁盘上，读的时候统一一下，写出去永远是新形状。
 * 读到既不是数组也不是 { thoughts } 的脏数据时返回空数组，不抛错 ——
 * 这个函数在回复路径上被调用，抛一次就会毁掉整轮对话。
 */
function arrayOf(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.thoughts)) return value.thoughts;
  return [];
}
function formatWhen(at, now) {
  const ms = Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const diff = Math.max(0, now - ms);
  if (diff < 3600_000) return Math.max(1, Math.round(diff / 60_000)) + ' 分钟前';
  if (diff < 86400_000) return Math.round(diff / 3600_000) + ' 小时前';
  const d = new Date(ms);
  return (d.getMonth() + 1) + '-' + d.getDate();
}
