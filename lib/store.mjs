import { appendFile, mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Mutex, assert, checkSignal, digest, jsonClone } from './util.mjs';

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
    if (this.#seen.size > 100_000) this.#seen.delete(this.#seen.values().next().value);
    const key = `${message.kind}:${message.peerId}`;
    const old = this.#conversations.get(key);
    if (!old || old.time <= message.time) this.#conversations.set(key, {
      kind: message.kind, peerId: message.peerId, time: message.time,
      lastText: message.text.slice(0, 100), nickname: message.nickname,
    });
  }
  append(message) {
    return this.#mutex.run(async () => {
      if (this.#seen.has(messageKey(message))) return false;
      const entry = jsonClone(message);
      // Archive by receipt date, not an untrusted sender-supplied timestamp.
      const date = new Date().toISOString().slice(0, 10);
      await appendFile(join(this.dir, `${date}.jsonl`), JSON.stringify(entry) + '\n', { mode: 0o600 });
      this.#remember(entry);
      this.appended += 1;
      return true;
    });
  }
  async prune() {
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    for (const name of await readdir(this.dir)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && Date.parse(name.slice(0, 10)) + 86_400_000 < cutoff) await rm(join(this.dir, name));
    }
  }
  conversations() { return [...this.#conversations.values()].sort((a, b) => b.time - a.time); }
  async query({ kind, peerId, keyword = '', limit = 50, days = this.retentionDays, signal } = {}) {
    checkSignal(signal);
    const names = (await readdir(this.dir)).filter(n => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort().reverse();
    const cutoff = Date.now() - days * 86_400_000;
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
        if ((kind && m.kind !== kind) || (peerId && m.peerId !== peerId) || !m.text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())) continue;
        messages.push(m);
        if (messages.length >= limit) { truncated = true; break outer; }
      }
    }
    return { messages: messages.reverse(), scanned, truncated, corruptLines, source: 'local_archive', retentionDays: this.retentionDays };
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
    const prior = await this.#mutex.run(async () => {
      const entry = this.#entries.get(requestId);
      if (entry) {
        assert(entry.payloadHash === hash, '同一 request_id 不能用于不同内容或目标');
        return { ...entry, duplicate: true };
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
