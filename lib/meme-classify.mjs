/**
 * Vision classification for the sticker library.
 *
 * The upstream Python projects run a dedicated VLM over every image. This does the
 * same with the Host's own agent runtime: one throwaway agent per batch, given the
 * images as attachment parts and asked for structured labels back.
 *
 * Two things make it affordable. Images are classified in SMALL BATCHES so one
 * agent turn covers several stickers, and the result is written to the index so a
 * sticker is never classified twice. \`visionClassify\` turns it off entirely.
 */
import { assert } from './util.mjs';
import { sessionEventList } from './runtime.mjs';

/** The prompt is deliberately narrow: labels are for retrieval, not for prose. */
const CLASSIFY_PROMPT = `你在给一个表情包图库打标签，标签会用于以后按语境检索。

对每张图输出一个对象，不要解释、不要客套，只输出 JSON 数组：
[{"index":0,"description":"一句话说清这张图表达什么","tags":["关键词"],"emotions":["情绪"]}]

规则：
- description 写这张图在聊天里用来表达什么，不超过 30 字，不要以「这张图」开头。
- tags 是检索词：画面内容、文字、常见使用场景，2–5 个。
- emotions 是情绪，从这些里选 1–3 个：开心 无语 生气 难过 害羞 惊讶 得意 敷衍 安慰 撒娇 疑惑 尴尬
- 图上的文字要原样收进 tags。
- 只输出 JSON，不要 markdown 代码块。`;

/**
 * Pull a JSON array out of whatever the model actually returned.
 *
 * Models wrap JSON in prose or fences often enough that a bare JSON.parse fails on
 * otherwise usable answers; this recovers the array instead of losing the batch.
 */
export function extractJsonArray(text) {
  const source = String(text ?? '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : source;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

/** Normalise one model-produced label object into the shape the library stores. */
export function normalizeLabels(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const clean = (value, limit) => {
    const list = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[,，、\s]+/) : []);
    return [...new Set(list.map((x) => String(x ?? '').trim()).filter(Boolean))].slice(0, limit);
  };
  const description = String(raw.description ?? '').trim().slice(0, 300);
  const tags = clean(raw.tags, 8);
  const emotions = clean(raw.emotions, 4);
  if (!description && tags.length === 0 && emotions.length === 0) return null;
  return { description, tags, emotions };
}

export class MemeClassifier {
  constructor(runtime, { batchSize = 4, logger = console } = {}) {
    this.runtime = runtime;
    this.batchSize = batchSize;
    this.logger = logger;
    this.running = false;
  }

  /** Whether the Host can hand an image to a model at all. */
  canClassify() {
    const attachments = this.runtime.ctx?.get?.('attachments');
    return Boolean(attachments && typeof attachments.saveImage === 'function' && this.runtime.ctx?.agents?.create);
  }

  /**
   * Classify up to \`max\` unclassified stickers.
   *
   * Returns a tally rather than throwing: a failed batch leaves its stickers
   * unclassified, which means the next run simply retries them.
   */
  async runOnce({ max = 8 } = {}) {
    if (this.running) return { ok: false, reason: '已有分类任务在跑' };
    if (!this.canClassify()) return { ok: false, reason: 'Host 不支持把图片交给模型' };
    const library = this.runtime.memes;
    if (!library) return { ok: false, reason: '表情包图库未启用' };
    await library.init();

    const targets = library.unclassified(max);
    if (!targets.length) return { ok: true, classified: 0, remaining: 0, note: '没有待分类的表情包' };

    this.running = true;
    let classified = 0;
    const failures = [];
    try {
      const attachments = this.runtime.ctx.get('attachments');
      for (let offset = 0; offset < targets.length; offset += this.batchSize) {
        const batch = targets.slice(offset, offset + this.batchSize);
        try {
          const parts = [{ type: 'text', text: CLASSIFY_PROMPT + `\n\n本批共 ${batch.length} 张图，index 从 0 开始。` }];
          for (const [index, entry] of batch.entries()) {
            const bytes = await library.bytesOf(entry);
            const ref = await attachments.saveImage({
              data: new Uint8Array(bytes),
              mediaType: entry.mediaType,
              name: 'meme-' + entry.id,
            });
            parts.push({ type: 'text', text: `第 ${index} 张：` });
            parts.push({ type: 'image', attachment: ref });
          }
          const reply = await this.#ask(parts);
          const labels = extractJsonArray(reply);
          if (!labels) { failures.push({ batch: offset, reason: '模型未返回可解析的 JSON' }); continue; }
          for (const item of labels) {
            const index = Number(item?.index);
            if (!Number.isInteger(index) || index < 0 || index >= batch.length) continue;
            const normalized = normalizeLabels(item);
            if (!normalized) continue;
            await library.annotate(batch[index].id, normalized);
            classified++;
          }
        } catch (error) {
          failures.push({ batch: offset, reason: String(error?.message ?? error).slice(0, 200) });
        }
      }
    } finally {
      this.running = false;
    }
    return {
      ok: true,
      classified,
      remaining: library.unclassified(1).length ? library.stats().unclassified : 0,
      failures,
    };
  }

  /**
   * One throwaway agent turn that returns the model's raw text.
   *
   * The agent is disposed immediately: classification has no conversation state,
   * and keeping one alive per batch would leak sessions for a job that runs once.
   */
  async #ask(content) {
    const runtime = this.runtime;
    const defaultSelection = runtime.ctx.get?.('agentDefaultModel')?.currentSelection?.();
    const route = Object.keys(runtime.config.route ?? {}).length ? runtime.config.route : undefined;
    const agentOptions = route ?? (defaultSelection?.provider && defaultSelection?.model
      ? { provider: defaultSelection.provider, model: defaultSelection.model }
      : undefined);
    const id = `qq-meme-classify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = await runtime.ctx.agents.create({
      sessionId: id,
      meta: { cwd: runtime.config.dataDir },
      ...(agentOptions ? { agentOptions } : {}),
      setup: async (agentCtx) => {
        // No tools: this turn must answer, not act.
        if (typeof agentCtx.tools?.restrict === 'function') agentCtx.tools.restrict({ allow: [] });
        agentCtx.systemPrompt.section({
          name: 'meme-classifier', order: 500,
          text: '你是一个图像标注器。只输出调用方要求的 JSON，不写解释。',
        });
      },
    });
    try {
      assert(handle?.agent && typeof handle.agent.whenIdle === 'function', 'Host Agent API 不兼容');
      const before = Number.isInteger(handle.agent.session?.seq) ? handle.agent.session.seq : 0;
      handle.agent.followup(runtime.createUserMessage({ content, source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      const events = sessionEventList(handle.agent.session).slice(before);
      const texts = [];
      for (const event of events) {
        if (event.type !== 'assistant/message') continue;
        for (const part of event.data?.message?.content ?? []) {
          if (part?.type === 'text' && part.text) texts.push(part.text);
        }
      }
      return texts.join('\n');
    } finally {
      try { await handle?.dispose?.(); } catch { /* the turn is already over */ }
    }
  }
}