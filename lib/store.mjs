import { appendFile, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {Mutex, assert, checkSignal, digest, jsonClone, isoDate } from './util.mjs';

function lockOwnerAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code === 'EPERM'; }
}

export async function acquireLock(dataDir) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, 'runtime.lock');
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    // A lock left behind by a process that no longer exists is stale: take it over.
    let owner = null;
    try { owner = JSON.parse(await readFile(path, 'utf8')); } catch {}
    if (owner && lockOwnerAlive(owner.pid)) throw new Error(`数据目录已被使用：进程 ${owner.pid} 仍持有锁 ${path}。`);
    await rm(path, { force: true });
    try { file = await open(path, 'wx', 0o600); }
    catch (retryError) {
      if (retryError.code === 'EEXIST') throw new Error(`数据目录已被使用或上次异常退出留下锁。确认所有插件进程已关闭后，手动删除 ${path}。`);
      throw retryError;
    }
  }
  const token = randomUUID();
  await file.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
  await file.close();
  return async () => {
    try {
      const current = JSON.parse(await readFile(path, 'utf8'));
      if (current.token === token) await rm(path);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
}

async function atomicJson(path, data) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(data)); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}

async function tailLines(path, limitBytes = 16 * 1024 * 1024) {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const start = Math.max(0, size - limitBytes);
    const bytes = Buffer.alloc(size - start);
    await file.read(bytes, 0, bytes.length, start);
    let text = bytes.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return { lines: text.split('\n').filter(Boolean).reverse(), truncated: start > 0 };
  } finally { await file.close(); }
}

const messageKey = m => `${m.selfId}:${m.kind}:${m.peerId}:${m.direction}:${m.messageId}`;

export class MessageStore {
  #mutex = new Mutex();
  #seen = new Set();
  #conversations = new Map();
  constructor(dataDir, retentionDays) { this.dir = join(dataDir, 'messages'); this.retentionDays = retentionDays; this.appended = 0; }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await this.prune();
    const recent = await this.query({ limit: 50_000, days: this.retentionDays });
    for (const m of recent.messages) this.#remember(m);
    this.indexTruncated = recent.truncated;
  }
  #remember(message) {
    this.#seen.add(messageKey(message));
    // 超过上限时淘汰最旧的一条。这只影响内存去重集合，所以还不够 ——
    // 被淘汰的 message_id 若再次被推送（重连、轮询补漏），append() 会认为它是新消息，
    // accept() 于是再排一次回复，用户看到第二条。
    // 真正的兜底在 append() 里：靠归档文件回查，见 #archiveHas()。
    if (this.#seen.size > 500_000) this.#seen.delete(this.#seen.values().next().value);
    const key = `${message.kind}:${message.peerId}`;
    const old = this.#conversations.get(key);
    if (!old || old.time <= message.time) this.#conversations.set(key, {
      kind: message.kind, peerId: message.peerId, time: message.time,
      // lastAt 是毫秒（给面板排序和「最近活跃」用）。
      // time 是 Unix 秒，直接喂给 new Date() 会落到 1970 年 ——
      // 而 ui.mjs 读的是 lastAt，那个字段以前根本不存在，
      // 于是面板里每条都显示「无活跃记录」、排序也全是 0。
      lastAt: Number(message.time) * 1000,
      lastText: message.text.slice(0, 100), nickname: message.nickname,
    });
  }
  /**
   * 当天归档里有没有这条消息（内存去重集合的兜底）。
   *
   * 归档是 `YYYY-MM-DD.jsonl` 一行一条。只查当天的文件：
   * 回放的都是最近的重复推送，查全量文件会拖慢每条消息。
   */
  async #archiveHas(message) {
    const id = String(message?.messageId ?? '').trim();
    if (!id) return false;
    const file = join(this.dir, `${isoDate(new Date())}.jsonl`);
    let text;
    try { text = await readFile(file, 'utf8'); }
    catch { return false; }
    const kind = message.kind;
    const peerId = String(message.peerId ?? '');
    const needle = `"messageId":"${id}"`;
    for (const line of text.split('\n')) {
      if (!line.includes(needle)) continue;
      try {
        const m = JSON.parse(line);
        if (m.kind === kind && String(m.peerId) === peerId) return true;
      } catch { /* 半截行（正在写）：忽略 */ }
    }
    return false;
  }

  append(message) {
    return this.#mutex.run(async () => {
      if (this.#seen.has(messageKey(message))) return false;
      // 内存去重集合有上限，被淘汰的旧 id 会漏过去。
      // 落盘前再回查一次当天归档：同一条消息不应该被回复两次。
      if (await this.#archiveHas(message)) { this.#seen.add(messageKey(message)); return false; }
      const entry = jsonClone(message);
      // Archive by receipt date, not an untrusted sender-supplied timestamp.
      // 用本地日期切文件：UTC 会让东八区凌晨的消息落进前一天。
    const date = isoDate(new Date());
      await appendFile(join(this.dir, `${date}.jsonl`), JSON.stringify(entry) + '\n', { mode: 0o600 });
      this.#remember(entry);
      this.appended += 1;
      return true;
    });
  }
  async prune() {
    // 0 = 永久保存：不设 cutoff，也就不删任何一天。
    if (!(this.retentionDays > 0)) return;
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    for (const name of await readdir(this.dir)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && Date.parse(name.slice(0, 10)) + 86_400_000 < cutoff) await rm(join(this.dir, name));
    }
  }
  conversations() { return [...this.#conversations.values()].sort((a, b) => b.time - a.time); }
  async query({ kind, peerId, keyword = '', limit = 50, days = this.retentionDays, direction = '', signal } = {}) {
    checkSignal(signal);
    const names = (await readdir(this.dir)).filter(n => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse();
    // days = 0 表示永久保存：用 -Infinity 作为下限，任何日期文件都不会被跳过。
    const cutoff = days > 0 ? Date.now() - days * 86_400_000 : -Infinity;
    let scanned = 0, truncated = false, corruptLines = 0;
    const messages = [];
    outer: for (const name of names) {
      checkSignal(signal);
      if (Date.parse(name.slice(0, 10)) + 86_400_000 < cutoff) continue;
      let file;
      try { file = await tailLines(join(this.dir, name)); }
      catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      truncated ||= file.truncated;
      for (const line of file.lines) {
        checkSignal(signal);
        if (++scanned > 100_000) { truncated = true; break outer; }
        let m;
        try { m = JSON.parse(line); }
        catch { corruptLines++; continue; }
        if (!m || typeof m.text !== 'string') { corruptLines++; continue; }
        // direction 过滤必须发生在计入 limit 之前。
        //
        // 撤回工具要在「最近 50 条」里找她自己的出站消息。热闹的群里，
        // 两分钟内可能进来 50 条别人的话，她刚才那条直接被挤出窗口 ——
        // 于是「撤不回自己刚发的消息」。先按方向过滤，limit 才真的是「最近 N 条我发的」。
        
        if (direction && m.direction !== direction) continue;
        if ((kind && m.kind !== kind) || (peerId && m.peerId !== peerId) || !m.text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) continue;
        messages.push(m);
        if (messages.length >= limit) { truncated = true; break outer; }
      }
    }
    return {
      messages: messages.reverse(), scanned, truncated, corruptLines, source: 'local_archive',
      direction: direction || 'both',
      retentionDays: this.retentionDays,
      retention: this.retentionDays > 0 ? `最近 ${this.retentionDays} 天` : '永久保存（不按天清理）',
    };
  }
}

export class ActionLedger {
  #mutex = new Mutex();
  #entries = new Map();
  constructor(dataDir) { this.path = join(dataDir, 'action-receipts.json'); }
  async init() {
    try {
      const entries = JSON.parse(await readFile(this.path, 'utf8'));
      assert(Array.isArray(entries), '操作记录损坏');
      for (const entry of entries) this.#entries.set(entry.requestId, entry);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  async #save() {
    while (this.#entries.size > 10_000) this.#entries.delete(this.#entries.keys().next().value);
    await atomicJson(this.path, [...this.#entries.values()]);
  }
  async run(requestId, payload, operation) {
    const hash = digest(payload);
    // 同一个 request_id 再来一次，按上次的结果分别处理：
    //
    //   sent      → 真的发过了，短路（这正是去重的目的）
    //   uncertain → 可能已经送到 QQ，只差没拿到 message_id；宁可漏发也不能重发
    //   failed    → 确定被拒绝，什么都没发出去，**必须允许重做**
    //   pending   → 上次执行到一半进程被杀；超时后允许重做，没超时说明还在跑
    //
    // 以前不区分，只要有条目就短路。于是「确定失败」也被当成「已处理」，
    // 而 reply() 又不看 status —— 用户永远收不到这条，额度还在烧。
    const pendingTimeoutMs = Math.max(30_000, Number(this.pendingTimeoutMs ?? 120_000));
    const prior = await this.#mutex.run(async () => {
      const entry = this.#entries.get(requestId);
      if (entry) {
        const retriable = entry.status === 'failed'
          || (entry.status === 'pending' && Date.now() - entry.time > pendingTimeoutMs);
        // 先判断能不能重做，再判断内容是否一致。
        //
        // 顺序反了会有个很难受的后果：发送失败后模型往往会改写措辞再试
        //（「我下楼买点东西」→「我去楼下买点东西」），
        // 而旧代码先断言哈希相同，于是永远卡在「同一 request_id 不能用于不同内容」，
        // 这一轮剩下的段也一起发不出去。
        //
        //   failed / 超时 pending：允许换正文重做（上一次没发出去，换句话是正常的）
        //   sent：换正文仍然要拒绝（同一个编号不能把另一段话发给同一个人）
        //   uncertain：不重做，也不抛错（可能已经发出去了，重发会出两条）
        //   pending 未超时：不重做，内容变了才报错（正发着的时候换内容说不通）
        if (retriable) {
          // 允许覆盖。下面会写入新的 payloadHash。
        } else {
          if (entry.status === 'uncertain') {
            // 不确定有没有发出去：短路，且绝不能抛 —— 抛了会让恢复逻辑每轮撞一次，
            // 模型被反复调用而消息还是发不出去。
            return { ...entry, duplicate: true };
          }
          assert(entry.payloadHash === hash, '同一 request_id 不能用于不同内容或目标');
          return { ...entry, duplicate: true };
        }
      }
      this.#entries.set(requestId, { requestId, payloadHash: hash, status: 'pending', time: Date.now() });
      try { await this.#save(); }
      catch (error) { this.#entries.delete(requestId); throw error; }
      return null;
    });
    if (prior) return prior;
    try {
      const result = await operation();
      const entry = { requestId, payloadHash: hash, status: result.status ?? 'sent', time: Date.now(), result: jsonClone(result) };
      await this.#mutex.run(async () => { this.#entries.set(requestId, entry); await this.#save(); });
      return entry;
    } catch (error) {
      const status = ['OneBotRejectedError', 'NotSubmittedError'].includes(error.name) ? 'failed' : 'uncertain';
      const entry = { requestId, payloadHash: hash, status, time: Date.now() };
      await this.#mutex.run(async () => { this.#entries.set(requestId, entry); await this.#save(); });
      throw error;
    }
  }
}
