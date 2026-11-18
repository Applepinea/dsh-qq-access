/**
 * 让模型「想发图时」真的能生一张图。
 *
 * 为什么不是直接调 dsh-connect-doubao 的函数：
 * 那个插件虽然导出了 chat()/streamChat()，但它们依赖 DSH 注入的 peer 依赖
 * （@earendil-works/pi-ai），在普通 Node 进程里 import 会直接 ERR_MODULE_NOT_FOUND。
 * 那样等于给本插件加一个「必须同时装另一个插件、且版本匹配」的硬依赖。
 *
 * 所以这里走 DSH 自己的 Provider 路由：豆包插件把「豆包 生图」注册成 provider
 * "doubao" 下的模型 "image-gen"，我们只需要起一个短期 agent，用这个路由发一句话，
 * 它就会把 Seedream 生成的图片以 Markdown 图片的形式返回。DSH 负责凭据、鉴权、
 * 会话续期——我们不用碰任何 cookie。
 *
 * 这条路线的代价：拿不到 image_ori_raw 的无水印原图，拿到的是插件写进正文的
 * Markdown 链接。取舍是「稳」优先：不需要跟着豆包插件内部实现改。
 */

/** 默认路由：豆包插件注册的 provider 与生图模型别名。 */
export const DEFAULT_IMAGE_ROUTE = Object.freeze({ provider: 'doubao', model: 'image-gen' });

/** 提示词长度上限。豆包那边一次也就几百字，太长反而容易跑偏。 */
const MAX_PROMPT = 1200;
/** 单次生图最多等多久。实测 20~25 秒出图，给足余量但必须有上限。 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 把 Markdown 图片链接从一段文字里抠出来。
 *
 * 豆包生图的返回是「说明文字 + ![](url)」，而 QQ 发送需要的是图片本身，
 * 所以这里只取 URL。也兼容 <img src>（个别响应会是 HTML）。
 */
export function extractImageUrls(text) {
  const value = String(text ?? '');
  const urls = [];
  const push = (raw) => {
    let url = String(raw ?? '').trim();
    if (!url) return;
    // 去掉 Markdown 的尖括号包装：![x](<C:/a b.png>)
    if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1).trim();
    if (!url) return;
    // 接受三类来源：
    //   1. http(s) 远程图；
    //   2. Windows 盘符路径 C:/... 或 C:\...；
    //   3. file:// URL。
    // 豆包 image-gen 返回的正是第 2 类——它把图直接写在本机。
    // 以前这里只收 http，于是本地路径被整条扔掉，
    // 判定成「模型没有返回图片」，而图其实已经在磁盘上躺着了。
    const isRemote = /^https?:\/\//i.test(url);
    const isWindows = /^[a-zA-Z]:[\\/]/.test(url);
    const isFileUrl = /^file:\/\//i.test(url);
    if (!isRemote && !isWindows && !isFileUrl) return;
    // 只收图片扩展名：Markdown 里的普通文件链接不该被当成图去下载。
    if (!/\.(?:png|jpe?g|webp|gif|bmp)$/i.test(url)) return;
    // 保留原样（盘符路径或 file://）。
    // 不要转成 file:///：runtime.imageBytes 的 isLocalPath 只认盘符和 / 开头，
    // 转成 file:// 反而让它走不到本地读取分支。
    if (isWindows) url = url.replace(/\\/g, '/');
    if (urls.includes(url)) return;
    urls.push(url);
  };
  // ![alt](url)
  // ![alt](url) 和 ![alt](<path with spaces>)：
  // DSH 自己的 system prompt 就要求在路径含空格时用尖括号包起来，
  // 所以两种都必须认，否则带空格的文件名会被截断成半条路径。
  for (const m of value.matchAll(/!\[[^\]]*\]\(<([^>]+)>/g)) push(m[1]);
  for (const m of value.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) push(m[1]);
  // <img src="url">
  for (const m of value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(m[1]);
  // 裸链接兜底：只在明确是图片扩展名时收，避免把普通网页当图
  for (const m of value.matchAll(/(?<![a-z])https?:\/\/[^\s)<>"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)<>"']*)?/gi)) push(m[0]);
  // 本地路径的裸形式（没写进 Markdown 时）：C:/a/b.png
  for (const m of value.matchAll(/(?<![a-zA-Z0-9_\-\\/])[a-zA-Z]:[\\/][^\s)<>"']*\.(?:png|jpe?g|webp|gif)(?![a-zA-Z0-9])/gi)) push(m[0]);
  return urls;
}

/**
 * 把用户随口一句话补成更像「画图描述」的提示词。
 *
 * 为什么需要：模型说「给我发张图」时往往只给几个词（「可爱的猫」）。
 * 直接丢给生图模型，出来的东西随机性很大。补上画质与构图要求能明显稳定结果，
 * 但**不能**改用户指定的主体、风格、颜色——那些是用户的意思。
 */
export function buildImagePrompt({ prompt, style = '', aspectRatio = '' } = {}) {
  const subject = String(prompt ?? '').trim().slice(0, MAX_PROMPT);
  if (!subject) return '';
  const parts = [subject];
  const styleText = String(style ?? '').trim();
  if (styleText) parts.push('风格：' + styleText.slice(0, 80));
  const ratio = String(aspectRatio ?? '').trim();
  if (/^\d{1,2}:\d{1,2}$/.test(ratio)) parts.push('画面比例：' + ratio);
  parts.push('画面完整、构图清晰、光线自然，不要文字水印。');
  return parts.join('。');
}

/** 从路由配置里解析出 { provider, model }，缺项时回落到默认值。 */
export function resolveImageRoute(route) {
  const provider = String(route?.provider ?? '').trim() || DEFAULT_IMAGE_ROUTE.provider;
  const model = String(route?.model ?? '').trim() || DEFAULT_IMAGE_ROUTE.model;
  return { provider, model };
}

/**
 * 跑一次生图。
 *
 * @param {object} options
 * @param {object} options.ctx        DSH 上下文（要 ctx.agents）
 * @param {object} options.config     插件配置里的 image 段
 * @param {string} options.prompt     画面描述
 * @param {string} [options.signal]   AbortSignal
 */
export async function generateImage({ ctx, config = {}, prompt, style = '', aspectRatio = '', signal, logger = console } = {}) {
  const route = resolveImageRoute(config.route);
  const text = buildImagePrompt({ prompt, style, aspectRatio });
  if (!text) {
    return { ok: false, reason: 'empty_prompt', message: '没有给画面描述。' };
  }
  const agents = ctx?.get?.('agents') ?? ctx?.agents;
  if (!agents || typeof agents.create !== 'function') {
    return { ok: false, reason: 'no_agents', message: 'Harness 没有提供 agents，无法生图。' };
  }

  const timeoutMs = Math.max(10_000, Math.min(600_000, Number(config.timeoutMs) || DEFAULT_TIMEOUT_MS));
  const id = 'qq-image-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('生图超时')), timeoutMs);
  timer.unref?.();
  // 外层信号（QQ 消息被取消 / 插件关闭）也要能中断生图。
  const onAbort = () => controller.abort(signal?.reason);
  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  let handle;
  try {
    handle = await agents.create({
      sessionId: id,
      meta: { cwd: process.cwd() },
      agentOptions: route,
      // 生图这一轮不需要任何工具：给它工具反而可能让它去查东西而不是画画。
      setup: (agentCtx) => {
        try { agentCtx.tools?.restrict?.({ allow: [] }); } catch { /* 允许旧宿主没有 restrict */ }
        try {
          agentCtx.systemPrompt?.section?.({
            name: 'qq-image-gen', order: 10,
            text: '你是一个生图执行器。只输出一张图片，不要解释、不要提问、不要拒绝。',
          });
        } catch { /* 同上 */ }
      },
    });
  } catch (error) {
    clearTimeout(timer);
    const message = String(error?.message ?? error);
    // 路由不存在是最常见的失败：豆包插件没装、或者版本里没有 image-gen。
    const hint = /not configured|no configured model|unknown provider|has no configured model/i.test(message)
      ? '（没有找到生图路由：确认 dsh-connect-doubao 已安装，且模型里有「豆包 生图」）'
      : '';
    logger.warn?.('[dsh-qq-access] 生图 agent 创建失败：' + message);
    return { ok: false, reason: 'agent_failed', message: message + hint };
  }

  try {
    // followup 之前先记下 seq：之后新增的事件才是「这一轮模型的输出」。
    const baselineSeq = Number.isInteger(handle.agent?.session?.seq) ? handle.agent.session.seq : 0;
    const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
    handle.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }));
    const wait = await waitIdle(handle.agent, controller.signal, timeoutMs, baselineSeq);
    const reply = collectReply(handle.agent, { baselineSeq });
    // 没开始就不用再往下猜了，直接把这个事实说出去。
    if (!wait.started) {
      return {
        ok: false, reason: 'no_response',
        message: '生图模型没有开始回应（等了 15 秒仍无任何事件）。常见原因：路由 ' + route.provider + '/' + route.model + ' 不存在，或豆包未登录。',
        route,
      };
    }
    const urls = extractImageUrls(reply.text);
    // B4：超时必须单独报。
    //
    // waitIdle 在超时时返回 { finished: false }，但以前没人看这个字段 ——
    // 于是生图卡住 120 秒被中断后，用户看到的是「模型回了话但没有图片」，
    // 会去查路由和豆包登录，而真正的原因是等太久。
    if (!wait.finished) {
      return {
        ok: false, reason: 'timeout',
        message: '生图超时（' + Math.round(timeoutMs / 1000) + ' 秒）。图可能还在生成，也可能卡住了；可以把超时调大再试。',
        text: reply.text.slice(0, 400),
        route,
      };
    }
    // 这里把「为什么没图」区分开：空回合、有文字没图、完全没响应，
    // 三种原因的排查方向完全不同。
    // 会话里一定有用户那条 prompt，所以「有没有模型输出」不能再用 seq 是否为 0 判断；
    // 改成看 collectReply 有没有在我们的过滤后拿到任何内容块。
    const produced = reply.rawTypes.length > 0;
    if (!produced) {
      return {
        ok: false, reason: 'empty_turn',
        message: '生图模型没有产生任何回应（会话为空）。常见原因：路由 ' + route.provider + '/' + route.model + ' 不存在，或豆包未登录。',
        route,
      };
    }
    if (!urls.length) {
      // 也许图不在文本里，而是 DSH 的 image block。
      // 这时图已经在 attachment 里了，不需要再下载。
      if (reply.imageParts.length) {
        return { ok: true, urls: [], text: reply.text, imageParts: reply.imageParts, route };
      }
      return {
        ok: false, reason: 'no_image',
        message: '模型回了话但没有图片。',
        text: reply.text.slice(0, 600),
        imageParts: 0,
        rawTypes: reply.rawTypes.slice(0, 20),
        route,
      };
    }
    return { ok: true, urls, text: reply.text, imageParts: reply.imageParts, route };
  } catch (error) {
    const aborted = controller.signal.aborted;
    return {
      ok: false,
      reason: aborted ? 'timeout' : 'failed',
      message: aborted ? `生图超时（${Math.round(timeoutMs / 1000)} 秒）` : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
    try { signal?.removeEventListener?.('abort', onAbort); } catch { /* ignore */ }
    // 会话用完就丢：生图不需要记忆，留着只会占 maxLiveSessions。
    try { Promise.resolve(handle?.dispose?.()).catch(() => {}); } catch { /* ignore */ }
  }
}

/**
 * 等这一轮真的跑完。
 *
 * 为什么不能直接 `await agent.whenIdle()`：
 * agent 刚创建时本身就是 idle 的，followup() 刚发出去的那一瞬间
 * whenIdle() 可能立刻 resolve——于是我们在模型还没开始流式回复时就去读
 * 会话，读到空，然后在 finally 里把会话销毁掉。
 *
 * 表现就是：每次生图都创建了一个只有元数据的空会话，
 * 图其实可能正在生成。
 *
 * 所以分两步：先等任何一个事件出现（说明轮次真的开始了），
 * 再等 idle（说明它结束了）。两步都有硬上限。
 */
async function waitIdle(agent, signal, timeoutMs, baselineSeq = 0) {
  const deadline = Date.now() + timeoutMs;
  const aborted = () => signal.aborted;

  // 第一步：等会话里出现**模型**的事件。
  //
  // 基准必须是调用 followup 之前的 seq：用户那条 prompt 自己也会让 seq 加一，
  // 拿 >0 当条件等于一进来就通过，这道「等它真的开始」的防线就不存在了。
  // 超时向上取 15 秒——路由不存在时它不会报错，只是什么都不会发生。
  const baseline = Number.isInteger(baselineSeq) && baselineSeq > 0 ? baselineSeq : 0;
  const started = Date.now();
  while (Date.now() - started < Math.min(15_000, timeoutMs)) {
    if (aborted()) return { started: false, finished: false, cancelled: true };
    const seq = Number.isInteger(agent?.session?.seq) ? agent.session.seq : 0;
    if (seq > baseline) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const seqAfterStart = Number.isInteger(agent?.session?.seq) ? agent.session.seq : 0;
  if (seqAfterStart <= baseline) {
    return { started: false, finished: false, cancelled: false };
  }

  // 第二步：等这一轮结束。
  const idle = Promise.resolve().then(() => agent.whenIdle()).then(() => true).catch(() => true);
  const cancelled = new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    signal.addEventListener('abort', () => resolve(false), { once: true });
  });
  const guard = new Promise((resolve) => {
    const left = Math.max(0, deadline - Date.now());
    const t = setTimeout(() => resolve(false), left);
    t.unref?.();
  });
  const ok = await Promise.race([idle, cancelled, guard]);
  if (!ok) {
    if (signal.aborted) return { started: true, finished: false, cancelled: true };
    try { agent.cancel({ kind: 'user' }); } catch { /* ignore */ }
    return { started: true, finished: false, cancelled: false };
  }
  return { started: true, finished: true, cancelled: false };
}

/**
 * 从会话事件里拼出这一轮的回复。
 *
 * 两件事都要做：
 *   1. 拿文本——有些路由把图片以 Markdown 链接写进正文；
 *   2. 拿图片块——DSH 的图片是独立的 {type:"image", attachment}，
 *      **不会**出现在文本里。只看文本会以为模型没画图。
 *
 * 为什么不读 `session.events`：DSH 的 session 是 `seq` + `eventAt(i)`。
 */
/**
 * 从会话里取出这一轮模型的输出。
 *
 * 两个过滤缺一不可：
 *
 * 1. **只从 baselineSeq 之后取**。会话在 followup(createUserMessage(...)) 之后就已经
 *    有事件了（用户那句话本身）。从 0 开始扫会把我们自己发出去的 prompt 当成模型输出。
 * 2. **只要 assistant 的消息**。以前这里不过滤角色，于是 prompt 里的文本混进 texts：
 *    - prompt 里带图片链接时，extractImageUrls 会把「用户给的参考图」当成生图结果去发；
 *    - 模型完全没回（空回合）时，texts 里仍有 prompt，错误会报成「回了话但没有图」，
 *      把真正的原因（路由没响应）盖掉。
 *
 * 其它模块（meme-classify / virtual-life-generate / 情感分析）一直都是这么过滤的，
 * 只有这里漏了。
 */
function collectReply(agent, { baselineSeq = 0 } = {}) {
  const session = agent?.session;
  const start = Number.isInteger(baselineSeq) && baselineSeq > 0 ? baselineSeq : 0;
  const events = [];
  try {
    const end = Number.isInteger(session?.seq) ? session.seq : 0;
    if (typeof session?.eventAt === 'function') {
      for (let i = start; i < end; i++) {
        try { const event = session.eventAt(i); if (event) events.push(event); } catch { /* ignore */ }
      }
    } else if (Array.isArray(session?.events)) {
      events.push(...session.events.slice(start));
    }
  } catch { /* ignore */ }

  const texts = [];
  const imageParts = [];
  const rawTypes = [];
  for (const event of events) {
    // 能确定不是 assistant 的直接跳过；宿主没给 type/role 时保持旧行为，
    // 免得换了宿主版本之后这里把正常输出也滤掉。
    if (event?.type && event.type !== 'assistant/message') continue;
    const role = event?.data?.message?.role ?? event?.message?.role;
    if (role && role !== 'assistant') continue;
    const content = event?.data?.message?.content ?? event?.message?.content ?? event?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part) continue;
      rawTypes.push(String(part.type));
      if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
      if (part.type === 'image') imageParts.push(part);
    }
  }
  return { text: texts.join('\n').trim(), imageParts, rawTypes };
}
