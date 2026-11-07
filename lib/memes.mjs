/**
 * Sticker (meme) library: storage, retrieval and selection.
 *
 * Distilled from astrbot_plugin_meme_manager and astrbot_plugin_stealer, both of
 * which are Python. What survives the port is the part that actually earns its
 * keep: keep a folder of images, know what each one means, and pick a fitting one
 * quickly. What is deliberately left behind is the WebUI back office, the image-host
 * syncing and faiss -- the first is a second frontend nobody asked for here, the
 * second has nothing to do with QQ, and the third has no Node equivalent worth a
 * native dependency.
 *
 * Retrieval is BM25 over the text the library already holds (tags, emotions,
 * description). That replaces faiss cosine search: it needs no embedding service,
 * costs nothing per query, and for a few thousand stickers with hand-written or
 * VLM-written labels it ranks better than embeddings would, because the labels are
 * exactly the vocabulary a message is likely to share.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat, unlink, copyFile } from 'node:fs/promises';
import { join, extname, basename, resolve, dirname } from 'node:path';

const INDEX_VERSION = 1;

/** Extensions accepted when importing a folder. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

const MEDIA_BY_EXTENSION = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
};

/**
 * Read pixel dimensions from an image header.
 *
 * Used to reject things that are not stickers: a 20x20 emoji or a 4000x3000 photo
 * both make a poor addition to a sticker library. Handles the four formats QQ
 * actually delivers; returns null rather than guessing when the bytes do not match
 * a known container.
 */
export function imageSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  // PNG: IHDR is always the first chunk.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), mediaType: 'image/png' };
  }
  // GIF: logical screen descriptor.
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), mediaType: 'image/gif' };
  }
  // WEBP: VP8 / VP8L / VP8X each store the size differently.
  if (bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') {
    const kind = bytes.slice(12, 16).toString('ascii');
    if (kind === 'VP8 ') return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff, mediaType: 'image/webp' };
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, mediaType: 'image/webp' };
    }
    if (kind === 'VP8X') {
      return { width: (bytes.readUIntLE(24, 3)) + 1, height: (bytes.readUIntLE(27, 3)) + 1, mediaType: 'image/webp' };
    }
    return null;
  }
  // JPEG: walk the marker chain to the SOF segment.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      // SOF0..SOF15 minus the non-frame markers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), mediaType: 'image/jpeg' };
      }
      offset += 2 + length;
    }
  }
  return null;
}

/**
 * Tokenise text for BM25.
 *
 * Latin runs become whole words; CJK runs become overlapping bigrams, which is the
 * cheapest scheme that still matches "好开心" against "开心" without a dictionary.
 */
export function tokenize(text) {
  const out = [];
  const source = String(text ?? '').toLowerCase();
  for (const match of source.matchAll(/[a-z0-9]+|[\u4e00-\u9fff]+/g)) {
    const run = match[0];
    if (/^[a-z0-9]+$/.test(run)) { out.push(run); continue; }
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

/**
 * BM25 ranking over an in-memory document set.
 *
 * k1/b are the usual defaults. Documents are the library entries' searchable text;
 * the corpus statistics are recomputed per query because the library is small and
 * changes rarely, and a stale index is a worse bug than a few microseconds.
 */
export function bm25(queryTokens, documents, { k1 = 1.5, b = 0.75 } = {}) {
  const N = documents.length;
  if (N === 0 || queryTokens.length === 0) return documents.map(() => 0);
  const avgLength = documents.reduce((sum, d) => sum + d.tokens.length, 0) / N || 1;
  const df = new Map();
  for (const doc of documents) {
    for (const term of new Set(doc.tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const scores = new Array(N).fill(0);
  for (const term of new Set(queryTokens)) {
    const freq = df.get(term);
    if (!freq) continue;
    const idf = Math.log(1 + (N - freq + 0.5) / (freq + 0.5));
    for (let i = 0; i < N; i++) {
      const doc = documents[i];
      const tf = doc.terms.get(term) ?? 0;
      if (tf === 0) continue;
      const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + b * (doc.tokens.length / avgLength)));
      scores[i] += idf * norm;
    }
  }
  return scores;
}

/** Deterministic id from content, so re-importing the same file cannot duplicate it. */
function contentId(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export class MemeLibrary {
  constructor({ dataDir, maxEntries = 5000, minPixels = 48, maxPixels = 4096, logger = console } = {}) {
    this.root = join(dataDir, 'memes');
    this.imagesDir = join(this.root, 'images');
    this.pendingDir = join(this.root, 'pending');
    this.indexPath = join(this.root, 'index.json');
    this.maxEntries = maxEntries;
    this.minPixels = minPixels;
    this.maxPixels = maxPixels;
    this.logger = logger;
    this.entries = [];
    this.pending = [];
    this.loaded = false;
    this.writeChain = Promise.resolve();
  }

  async init() {
    if (this.loaded) return this;
    await mkdir(this.imagesDir, { recursive: true });
    await mkdir(this.pendingDir, { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.indexPath, 'utf8'));
      if (raw?.version === INDEX_VERSION) {
        this.entries = Array.isArray(raw.entries) ? raw.entries : [];
        this.pending = Array.isArray(raw.pending) ? raw.pending : [];
      }
    } catch { /* a missing or corrupt index starts an empty library */ }
    this.loaded = true;
    return this;
  }

  /** Serialise writes: two concurrent imports must not interleave into one file. */
  #save() {
    this.writeChain = this.writeChain.then(async () => {
      const payload = JSON.stringify({ version: INDEX_VERSION, entries: this.entries, pending: this.pending }, null, 2);
      await writeFile(this.indexPath, payload + '\n');
    }).catch((error) => { this.logger.warn?.('表情包索引写入失败：' + error.message); });
    return this.writeChain;
  }

  stats() {
    const byEmotion = {};
    for (const entry of this.entries) {
      for (const emotion of entry.emotions ?? []) byEmotion[emotion] = (byEmotion[emotion] ?? 0) + 1;
    }
    return {
      total: this.entries.length,
      pending: this.pending.length,
      classified: this.entries.filter((e) => e.classifiedAt).length,
      unclassified: this.entries.filter((e) => !e.classifiedAt).length,
      byEmotion,
      root: this.root,
    };
  }

  /** Whether these bytes are worth keeping as a sticker. */
  #accept(bytes) {
    const size = imageSize(bytes);
    if (!size) return { ok: false, reason: '无法识别图片格式' };
    const { width, height } = size;
    if (width < this.minPixels || height < this.minPixels) {
      return { ok: false, reason: `图片太小（${width}x${height}）` };
    }
    if (width > this.maxPixels || height > this.maxPixels) {
      return { ok: false, reason: `图片太大（${width}x${height}）` };
    }
    // A sticker is roughly square; a 4000x400 banner is not one.
    const ratio = width / height;
    if (ratio > 3 || ratio < 1 / 3) return { ok: false, reason: `长宽比不合适（${width}x${height}）` };
    return { ok: true, size };
  }

  /**
   * Add one image from bytes.
   *
   * \`source\` records where it came from so the panel can explain the library.
   * Collected images land in the pending pool and wait for approval; manual imports
   * go straight in, because a person already chose them.
   */
  async addBuffer(bytes, { source = 'manual', note = '', groupId = '', senderId = '', requireApproval = false } = {}) {
    await this.init();
    if (!bytes || !bytes.length) return { ok: false, reason: '空文件' };
    const verdict = this.#accept(bytes);
    if (!verdict.ok) return verdict;

    const hash = contentId(bytes);
    // `already: 'library' | 'pending'` lets the caller stay quiet instead of
    // logging the same picture as a failure every time it is seen again.
    if (this.entries.some((e) => e.hash === hash)) return { ok: false, reason: '已存在', duplicate: true, already: 'library' };
    if (this.pending.some((e) => e.hash === hash)) return { ok: false, reason: '已在待审核池', duplicate: true, already: 'pending' };
    if (this.entries.length + this.pending.length >= this.maxEntries) return { ok: false, reason: `图库已达上限（${this.maxEntries}）` };

    const extension = Object.entries(MEDIA_BY_EXTENSION).find(([, type]) => type === verdict.size.mediaType)?.[0] ?? '.png';
    const name = hash.slice(0, 24) + extension;
    const record = {
      id: hash.slice(0, 16),
      hash,
      file: name,
      mediaType: verdict.size.mediaType,
      width: verdict.size.width,
      height: verdict.size.height,
      source,
      note,
      groupId: groupId ? String(groupId) : '',
      senderId: senderId ? String(senderId) : '',
      tags: [],
      emotions: [],
      description: '',
      addedAt: Date.now(),
      classifiedAt: null,
      uses: 0,
      enabled: true,
    };

    if (requireApproval) {
      await writeFile(join(this.pendingDir, name), bytes);
      this.pending.push(record);
      await this.#save();
      return { ok: true, record, pending: true };
    }
    await writeFile(join(this.imagesDir, name), bytes);
    this.entries.push(record);
    await this.#save();
    return { ok: true, record, pending: false };
  }

  /**
   * Import every image in a folder.
   *
   * Recursive, because sticker packs arrive as nested directories far more often
   * than flat ones. Returns a tally instead of throwing on the first bad file.
   */
  async importFolder(folder, { recursive = true, note = '' } = {}) {
    await this.init();
    const target = resolve(String(folder ?? ''));
    let info;
    try { info = await stat(target); } catch { return { ok: false, reason: '目录不存在：' + target }; }
    if (!info.isDirectory()) return { ok: false, reason: '不是目录：' + target };

    const files = [];
    const walk = async (dir) => {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, item.name);
        if (item.isDirectory()) { if (recursive) await walk(full); continue; }
        if (IMAGE_EXTENSIONS.has(extname(item.name).toLowerCase())) files.push(full);
      }
    };
    await walk(target);

    let added = 0;
    const skipped = [];
    for (const file of files) {
      try {
        const bytes = await readFile(file);
        // The folder name is a useful default label: sticker packs are usually
        // organised as "开心/", "无语/" and so on.
        const folderNote = note || basename(dirname(file)) || '';
        const result = await this.addBuffer(bytes, { source: 'folder', note: folderNote });
        if (result.ok) added++;
        else skipped.push({ file: basename(file), reason: result.reason });
      } catch (error) {
        skipped.push({ file: basename(file), reason: error.message });
      }
    }
    return { ok: true, scanned: files.length, added, skipped: skipped.slice(0, 20), skippedTotal: skipped.length, folder: target };
  }

  /** Move a pending record into the library. */
  async approve(id) {
    await this.init();
    const index = this.pending.findIndex((e) => e.id === id);
    if (index < 0) return { ok: false, reason: '待审核池中没有这条' };
    const record = this.pending[index];
    try {
      await copyFile(join(this.pendingDir, record.file), join(this.imagesDir, record.file));
      await unlink(join(this.pendingDir, record.file));
    } catch (error) {
      return { ok: false, reason: '移动文件失败：' + error.message };
    }
    this.pending.splice(index, 1);
    this.entries.push(record);
    await this.#save();
    return { ok: true, record };
  }

  /** Drop a pending record and its file. */
  async reject(id) {
    await this.init();
    const index = this.pending.findIndex((e) => e.id === id);
    if (index < 0) return { ok: false, reason: '待审核池中没有这条' };
    const [record] = this.pending.splice(index, 1);
    try { await unlink(join(this.pendingDir, record.file)); } catch { /* already gone */ }
    await this.#save();
    return { ok: true };
  }

  /** Remove a library entry and its file. */
  async remove(id) {
    await this.init();
    const index = this.entries.findIndex((e) => e.id === id);
    if (index < 0) return { ok: false, reason: '图库中没有这条' };
    const [record] = this.entries.splice(index, 1);
    try { await unlink(join(this.imagesDir, record.file)); } catch { /* already gone */ }
    await this.#save();
    return { ok: true };
  }

  /** Absolute path of an entry's image, for sending. */
  pathOf(entry) {
    return join(this.imagesDir, entry.file);
  }

  /** Absolute path of a pending entry's image. */
  pendingPathOf(entry) {
    return join(this.pendingDir, entry.file);
  }

  /** Store what the vision pass learned about one entry. */
  async annotate(id, { tags = [], emotions = [], description = '' } = {}) {
    await this.init();
    const record = this.entries.find((e) => e.id === id) ?? this.pending.find((e) => e.id === id);
    if (!record) return { ok: false, reason: '找不到这条' };
    record.tags = [...new Set([...(record.tags ?? []), ...tags.map(String).filter(Boolean)])].slice(0, 12);
    record.emotions = [...new Set([...(record.emotions ?? []), ...emotions.map(String).filter(Boolean)])].slice(0, 8);
    if (description) record.description = String(description).slice(0, 300);
    record.classifiedAt = Date.now();
    await this.#save();
    return { ok: true, record };
  }

  /** The text BM25 indexes for one entry. */
  #searchText(entry) {
    return [entry.description, ...(entry.tags ?? []), ...(entry.emotions ?? []), entry.note].filter(Boolean).join(' ');
  }

  /**
   * Rank library entries against a query.
   *
   * @returns entries with a \`score\`, best first. An empty query returns nothing
   *          rather than the whole library, because "no signal" is not "any sticker".
   */
  search(query, { limit = 5, minScore = 0.1, emotions = [] } = {}) {
    const pool = this.entries.filter((e) => e.enabled !== false);
    if (pool.length === 0) return [];
    let candidates = pool;
    if (emotions.length) {
      const wanted = new Set(emotions.map((x) => String(x).toLowerCase()));
      const filtered = pool.filter((e) => (e.emotions ?? []).some((x) => wanted.has(String(x).toLowerCase())));
      // An emotion filter that matches nothing must not empty the result: fall back
      // to the full pool so a rare mood still gets an answer.
      if (filtered.length) candidates = filtered;
    }
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return [];
    const documents = candidates.map((entry) => {
      const tokens = tokenize(this.#searchText(entry));
      const terms = new Map();
      for (const token of tokens) terms.set(token, (terms.get(token) ?? 0) + 1);
      return { tokens, terms };
    });
    const scores = bm25(queryTokens, documents);
    return candidates
      .map((entry, i) => ({ entry, score: scores[i] }))
      .filter((row) => row.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Record that an entry was sent, so the panel can show what gets used. */
  async markUsed(id) {
    const record = this.entries.find((e) => e.id === id);
    if (!record) return;
    record.uses = (record.uses ?? 0) + 1;
    record.lastUsedAt = Date.now();
    await this.#save();
  }

  /** Entries the vision pass has not seen yet, oldest first. */
  unclassified(limit = 5) {
    return this.entries.filter((e) => !e.classifiedAt).slice(0, limit);
  }

  /** Read one entry's bytes, for classification or sending. */
  async bytesOf(entry, { pending = false } = {}) {
    return readFile(pending ? this.pendingPathOf(entry) : this.pathOf(entry));
  }
}

/** Small helper so callers do not import path just to build a display name. */
export function displayName(entry) {
  return entry.note || (entry.tags ?? [])[0] || entry.id;
}