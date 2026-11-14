/**
 * 「这条入站消息已经放弃回复」的小记录。
 *
 * 为什么需要它：
 * 回合超时（agent.whenIdle() 超过上限）时，这一轮什么都没发出去。
 * 恢复逻辑 restorePending 只比较归档里「最后一条入站」和「最后一条出站」的时间，
 * 超时没有出站记录，于是每一轮刷新都判定「这条还没回」，把同一条消息再送进模型 ——
 * 在 10 分钟窗口里反复烧额度，而且可能收到几条互相矛盾的回复。
 *
 * 为什么不写进聊天归档：
 * 归档会被当成「她说过的话」注入下一轮上下文。写一条假的出站消息进去，
 * 等于让她以为自己已经回过这句话了，比不回复更糟。
 * 所以单独放一个小文件，只用来回答一个问题：这条入站是不是已经处理过了。
 *
 * 存储形状（dataDir/reply-settled.json）：
 *   { "version": 1, "entries": { "<kind>:<peerId>:<messageId>": { "reason": "timeout", "at": 1794... } } }
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const VERSION = 1;
/** 最多留多少条。这是「最近放弃过什么」的短期记忆，不需要永久保留。 */
const MAX_ENTRIES = 2000;
/** 超过这个时长的记录可以直接丢：恢复窗口本身只有 10 分钟。 */
const MAX_AGE_MS = 86_400_000;

export class ReplySettledStore {
  constructor({ dataDir, logger = console } = {}) {
    this.file = join(dataDir, 'reply-settled.json');
    this.logger = logger;
    this.entries = {};
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      if (raw?.version === VERSION && raw.entries && typeof raw.entries === 'object') {
        this.entries = raw.entries;
      }
    } catch { /* 文件不存在或坏了就从空开始 —— 这一层是锦上添花，不能反过来拦住启动 */ }
    this.#prune();
    this.loaded = true;
    return this;
  }

  #key(kind, peerId, messageId) {
    return `${String(kind ?? '')}:${String(peerId ?? '')}:${String(messageId ?? '')}`;
  }

  #prune() {
    const now = Date.now();
    const keep = Object.entries(this.entries)
      .filter(([, v]) => v && now - Number(v.at ?? 0) < MAX_AGE_MS)
      .sort((a, b) => Number(b[1].at ?? 0) - Number(a[1].at ?? 0))
      .slice(0, MAX_ENTRIES);
    this.entries = Object.fromEntries(keep);
  }

  #save() {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      await writeFile(tmp, JSON.stringify({ version: VERSION, entries: this.entries }, null, 2) + '\n');
      await rename(tmp, this.file);
    }).catch((error) => this.logger.warn?.('回复放弃记录写入失败：' + error.message));
    return this.writeChain;
  }

  /** 这条入站是不是已经决定不回了。 */
  has(kind, peerId, messageId) {
    if (messageId === undefined || messageId === null || String(messageId) === '') return false;
    return Boolean(this.entries[this.#key(kind, peerId, messageId)]);
  }

  /**
   * 记一条「放弃回复」。
   *
   * 写盘失败只记日志，不抛 —— 调用点在超时收尾路径上，
   * 那里再抛一次异常只会让状态更乱。写失败的最坏结果是多问一轮模型，
   * 比让整轮回复崩掉要轻。
   */
  async mark(kind, peerId, messageId, reason = 'timeout') {
    if (messageId === undefined || messageId === null || String(messageId) === '') return false;
    // 同一秒内重复标记同一条是可能的（超时收尾 + 恢复逻辑），幂等即可。
    this.entries[this.#key(kind, peerId, messageId)] = { reason: String(reason).slice(0, 40), at: Date.now() };
    this.#prune();
    await this.#save();
    return true;
  }

  async flush() { await this.writeChain; }
}