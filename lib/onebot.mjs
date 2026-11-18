import { assert, checkSignal, combinedSignal } from './util.mjs';

export class OneBotClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  async call(action, params = {}, signal, timeoutMs) {
    assert(/^[a-z][a-z0-9_]+$/.test(action), '无效 OneBot action');
    checkSignal(signal);
    let response;
    try {
      response = await this.fetcher(`${this.config.apiUrl}/${action}`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.token}` },
        body: JSON.stringify(params), signal: combinedSignal(signal, timeoutMs ?? this.config.timeoutMs),
      });
    } catch (error) {
      const failure = new Error(`${action} 请求中断或连接失败；发送类操作请先检查 QQ，避免重复发送。`);
      failure.name = error.name === 'AbortError' || signal?.aborted ? 'AbortError' : 'OneBotTransportError';
      throw failure;
    }
    if (!response.ok) {
      const error = new Error(`${action} 返回 HTTP ${response.status}；检查 NapCat 和 token。`);
      error.name = 'OneBotTransportError';
      throw error;
    }
  // Content-Length 可能是 'abc' 或空：Number() 得到 NaN，而 NaN <= 8MiB 是 false，
  // 于是一个没有长度头（或头不合法）的正常响应会被断言成「响应过大」。
  // 只在这个头真的是有限数字时才用它做前置判断；真实字节数下面还会再数一遍。
  const declaredLength = Number(response.headers.get('content-length'));
  assert(!Number.isFinite(declaredLength) || declaredLength <= 8 * 1024 * 1024, `${action} 响应过大`);
    const reader = response.body.getReader();
    let bytes = 0; const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        assert(bytes <= 8 * 1024 * 1024, `${action} 响应过大`);
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new Error(`${action} 返回了无效 JSON`); }
    if (body?.status !== 'ok' || body.retcode !== 0) {
      const error = new Error(`${action} 被 OneBot 拒绝，retcode=${Number.isFinite(body?.retcode) ? body.retcode : 'unknown'}。`);
      error.name = 'OneBotRejectedError';
      throw error;
    }
    return body.data;
  }
  async verifyIdentity(expectedId, signal) {
    const me = await this.call('get_login_info', {}, signal);
    assert(String(me?.user_id) === expectedId, 'NapCat 登录账号与配置 selfId 不一致，已停止接入');
    return { userId: String(me.user_id), nickname: String(me.nickname ?? '') };
  }
  send(kind, peerId, text, signal, mentions = []) {
    const message = [];
    if (kind === 'group') {
      for (const target of mentions) message.push({ type: 'at', data: { qq: String(target) } });
    }
    if (text) message.push({ type: 'text', data: { text } });
    const params = { [kind === 'group' ? 'group_id' : 'user_id']: peerId, message };
    return this.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params, signal);
  }

  /** Send one QQ system face by id. */
  sendFace(kind, peerId, faceId, signal, mentions = [], caption = '') {
    const message = [];
    if (kind === 'group') for (const target of mentions) message.push({ type: 'at', data: { qq: String(target) } });
    message.push({ type: 'face', data: { id: String(faceId) } });
    if (caption) message.push({ type: 'text', data: { text: caption } });
    const params = { [kind === 'group' ? 'group_id' : 'user_id']: peerId, message };
    return this.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params, signal);
  }

  /**
   * Send one image from a local path, http(s) URL, or base64 payload.
   *
   * 图片要单独给一个更长的超时：
   * 生图拿到的是几 MB 的 PNG，转成 base64 后比文本消息大三个量级。
   * 用文本的 15 秒上限，稍微慢一点的网络就会在上传到一半时被中断，
   * 表现为「图生成了但发送失败」。
   */
  async sendImage(kind, peerId, file, signal, mentions = [], caption = '') {
    const message = [];
    if (kind === 'group') for (const target of mentions) message.push({ type: 'at', data: { qq: String(target) } });
    message.push({ type: 'image', data: { file } });
    if (caption) message.push({ type: 'text', data: { text: caption } });
    const params = { [kind === 'group' ? 'group_id' : 'user_id']: peerId, message };
    // 至少 60 秒；配置里调得更大时以配置为准。
    const timeoutMs = Math.max(60_000, Number(this.config.timeoutMs) || 0);
    return this.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params, signal, timeoutMs);
  }

  /** Resolve one message by id, used to expand quoted replies. */
  getMessage(messageId, signal) {
    return this.call('get_msg', { message_id: String(messageId) }, signal);
  }

  /** Recall one message by id. */
  recall(messageId, signal) {
    return this.call('delete_msg', { message_id: String(messageId) }, signal);
  }
  /** Poke someone: a private friend or a group member. */
  /**
   * Send pre-built OneBot segments as-is.
   *
   * Repeating a message needs the ORIGINAL segments: re-encoding them as text
   * loses images, faces and @ targets, which is the whole reason to repeat it.
   */
  sendSegments(kind, peerId, segments, signal, mentions = []) {
    const message = [];
    if (kind === "group") {
      for (const target of mentions) message.push({ type: "at", data: { qq: String(target) } });
    // 带图片时上传体积大：几 MB 的图用文本的 15 秒上限会被掐断，
    // 表现为「她明明说了要发图，却只发出一句文字」。
    const hasImage = Array.isArray(segments) && segments.some((s) => s?.type === "image");
    const timeoutMs = hasImage ? Math.max(60_000, Number(this.config.timeoutMs) || 0) : undefined;
    }
    for (const seg of Array.isArray(segments) ? segments : []) {
      if (!seg || typeof seg !== "object" || typeof seg.type !== "string") continue;
      message.push({ type: seg.type, data: { ...(seg.data ?? {}) } });
    }
    const params = { [kind === "group" ? "group_id" : "user_id"]: peerId, message };
    return this.call(kind === "group" ? "send_group_msg" : "send_private_msg", params, signal);
  }

  poke(kind, peerId, userId, signal) {
    // 群戳是 group_id + user_id；私聊只有一个 user_id。
    // 以前私聊两个键都叫 user_id，后写的 userId 把会话 peerId 盖掉 ——
    // 工具允许两个号不同，于是可能戳到不是当前私聊对象的人。
    if (kind === "group") {
      return this.call("group_poke", { group_id: String(peerId), user_id: String(userId) }, signal);
    }
    // 私聊：戳的就是会话对象本身。
    return this.call("friend_poke", { user_id: String(peerId) }, signal);
  }

  /** Public profile of any QQ number. */
  userInfo(userId, signal) {
    return this.call("get_stranger_info", { user_id: String(userId), no_cache: false }, signal);
  }

  /** Full message structure by id, including segments the archive flattened. */
  messageDetail(messageId, signal) {
    return this.call("get_msg", { message_id: String(messageId) }, signal);
  }

  /** Every member of a group, with cards and roles. */
  groupMembers(groupId, signal) {
    return this.call("get_group_member_list", { group_id: String(groupId), no_cache: false }, signal);
  }

  /** Change a member's group card. */
  setGroupCard(groupId, userId, card, signal) {
    return this.call("set_group_card", { group_id: String(groupId), user_id: String(userId), card: String(card ?? "") }, signal);
  }

  /** Mute one member for a number of seconds; 0 lifts the mute. */
  groupBan(groupId, userId, durationSeconds, signal) {
    return this.call("set_group_ban", { group_id: String(groupId), user_id: String(userId), duration: Math.max(0, Math.floor(durationSeconds)) }, signal);
  }

  /** Mark one message as a group essence. */
  setEssence(messageId, signal) {
    return this.call("set_essence_msg", { message_id: String(messageId) }, signal);
  }

  /** Give someone profile likes; QQ caps this at 10 per interaction. */
  sendLike(userId, times, signal) {
    return this.call("send_like", { user_id: String(userId), times: Math.min(10, Math.max(1, Math.floor(times))) }, signal);
  }

  history(kind, peerId, count, beforeSeq, signal) {
    return this.call(kind === 'group' ? 'get_group_msg_history' : 'get_friend_msg_history', {
      [kind === 'group' ? 'group_id' : 'user_id']: peerId,
      count, message_seq: beforeSeq ?? '0',
    }, signal);
  }
}

/** Collect @ targets that the model wrote as raw CQ codes. */
export function cqMentions(text) {
  return [...String(text ?? '').matchAll(/\[CQ:at,qq=([^,\]]+)[^\]]*\]/g)].map(m => m[1]);
}

/** Remove @ CQ codes so they are not delivered as literal text. */
export function stripCqAt(text) {
  return String(text ?? '').replace(/\[CQ:at,qq=[^,\]]+[^\]]*\]/g, '').trim();
}

/** Common QQ system-face ids; unknown ids fall back to the raw id. */
const FACE_NAMES = {
  0: '惊讶', 1: '撇嘴', 2: '色', 3: '发呆', 4: '得意', 5: '流泪', 6: '害羞', 7: '闭嘴',
  8: '睡', 9: '大哭', 10: '尴尬', 11: '发怒', 12: '调皮', 13: '呲牙', 14: '微笑', 15: '难过',
  16: '酷', 18: '抓狂', 19: '吐', 20: '偷笑', 21: '可爱', 22: '白眼', 23: '傲慢', 24: '饥饿',
  25: '困', 26: '惊恐', 27: '流汗', 28: '憨笑', 29: '悠闲', 30: '奋斗', 31: '咒骂', 32: '疑问',
  33: '嘘', 34: '晕', 35: '折磨', 36: '衰', 37: '骷髅', 38: '敲打', 39: '再见', 41: '发抖',
  42: '爱情', 43: '跳跳', 46: '猪头', 49: '拥抱', 53: '蛋糕', 54: '闪电', 55: '炸弹', 56: '刀',
  57: '足球', 59: '便便', 60: '咖啡', 61: '饭', 63: '玫瑰', 64: '凋谢', 66: '爱心', 67: '心碎',
  69: '礼物', 74: '太阳', 75: '月亮', 76: '赞', 77: '踩', 78: '握手', 79: '胜利', 85: '飞吻',
  86: '怄火', 89: '西瓜', 96: '冷汗', 97: '擦汗', 98: '抠鼻', 99: '鼓掌', 100: '糗大了',
  101: '坏笑', 102: '左哼哼', 103: '右哼哼', 104: '哈欠', 105: '鄙视', 106: '委屈', 107: '快哭了',
  108: '阴险', 109: '亲亲', 110: '吓', 111: '可怜', 112: '菜刀', 113: '啤酒', 114: '篮球',
  115: '乒乓', 116: '示爱', 117: '瓢虫', 118: '抱拳', 119: '勾引', 120: '拳头', 121: '差劲',
  122: '爱你', 123: 'NO', 124: 'OK', 125: '转圈', 126: '磕头', 127: '回头', 128: '跳绳',
  129: '挥手', 130: '激动', 131: '街舞', 132: '献吻', 133: '左太极', 134: '右太极',
};

/** Resolve a face by numeric id or by its Chinese name (e.g. "偷笑"). */
export function faceIdByName(name) {
  const value = String(name ?? '').trim();
  if (!value) return '';
  if (/^\d+$/.test(value)) return value;
  const bare = value.replace(/^\[|\]$/g, '');
  for (const [id, label] of Object.entries(FACE_NAMES)) if (label === bare) return id;
  return '';
}

/**
 * 图片地址的判定：路径以图片扩展名结尾（允许带 query / hash）。
 */
const IMAGE_URL_RE = /\/[^\/?#]+\.(?:png|jpe?g|webp|gif|bmp)(?:[?#]\S*)?$/i;

/**
 * 把一段纯文本拆成 OneBot 消息段。
 *
 * 为什么需要：模型不会「调用工具」发图或发表情，它更可能在正文里直接写
 *   - Markdown 图片：`![alt](https://…/a.png)`
 *   - 裸图片地址：`https://…/a.png`
 *   - 表情标记：`[偷笑]`
 * 以前这些都被当成普通文字发出去，对方看到的是链接和方括号 ——
 * 她的本意明明是发一张图、发一个表情。
 *
 * 只认「明确是图片」的地址（扩展名）与「明确在系统表情表里」的名字；
 * 其它一律保留为文字，不猜。
 *
 * `maxImages` 是上限：一条消息里塞十几张图会被 NapCat 拖死，也会刷屏。
 */
export function parseRichText(text, { maxImages = 4 } = {}) {
  const src = String(text ?? '');
  const parts = [];
  let buf = '';
  let images = 0;
  const flush = () => {
    if (buf) { parts.push({ type: 'text', data: { text: buf } }); buf = ''; }
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);

    // 1) CQ 码原样保留（@ 由调用方单独处理，其它码不解析）
    if (rest.startsWith('[CQ:')) {
      const end = src.indexOf(']', i);
      if (end > 0) { buf += src.slice(i, end + 1); i = end + 1; continue; }
    }

    // 2) Markdown 图片
    const md = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/.exec(rest);
    if (md && images < maxImages) {
      flush();
      parts.push({ type: 'image', data: { file: md[1] } });
      images++;
      i += md[0].length;
      continue;
    }

    // 3) 裸图片地址：只有出现在词首时才算，避免把句子中间的路径截断。
    if (rest.startsWith('http') && (i === 0 || /[\s(\[（【]/.test(src[i - 1]))) {
      const m = /^https?:\/\/[^\s)\]>"'，。；、]+/.exec(rest);
      if (m) {
        const url = m[0].replace(/[.,;!?]+$/, '');
        if (images < maxImages && IMAGE_URL_RE.test(url)) {
          flush();
          parts.push({ type: 'image', data: { file: url } });
          images++;
          i += url.length;
          continue;
        }
      }
    }

    // 4) 表情标记：必须能在系统表情表里查到，否则原样当文字。
    if (src[i] === '[') {
      const m = /^\[([^\[\]\r\n]{1,6})\]/.exec(rest);
      // 只认中文名。`[0]` 这种更像是数组下标（`a[0]`），当成表情 0 就闹笑话了；
      // 想发表情 0 可以写 `[惊讶]`，或者直接调 qq_send_face。
      if (m && !/^\d+$/.test(m[1])) {
        const id = faceIdByName(m[1]);
        if (id) {
          flush();
          parts.push({ type: 'face', data: { id } });
          i += m[0].length;
          continue;
        }
      }
    }

    buf += src[i];
    i++;
  }
  flush();
  return parts;
}

/**
 * 把消息段还原成「对方会看到的文字」：图片记成 [图片]，表情记成 [偷笑]。
 *
 * 归档和后续上下文都用它 —— 存原始地址会让模型以为图没发出去，
 * 下一轮又发一遍。
 */
export function segmentsToText(parts) {
  return (parts ?? []).map((part) => {
    if (part?.type === 'text') return String(part.data?.text ?? '');
    if (part?.type === 'image') return '[图片]';
    if (part?.type === 'face') {
      const id = String(part.data?.id ?? '');
      return '[' + (FACE_NAMES[id] ?? '表情') + ']';
    }
    return '';
  }).join('');
}

export function segmentsText(message) {
  if (typeof message === 'string') {
    // Legacy CQ strings are data, never sent back as raw CQ commands.
    return message.replace(/\[CQ:([^,\]]+)[^\]]*\]/g, '[$1]');
  }
  if (!Array.isArray(message)) return '';
  const labels = { image: '图片', record: '语音', video: '视频', file: '文件', face: '表情', reply: '引用消息', forward: '合并转发', json: '分享卡片', xml: '分享卡片', poke: '戳一戳', dice: '骰子', rps: '猜拳', shake: '窗口抖动', markdown: '富文本' };
  return message.map(s => {
    if (s?.type === 'text') return String(s.data?.text ?? '');
    if (s?.type === 'at') return `@${s.data?.qq ?? ''}`;
    // QQ 小黄脸与表情包在 NapCat 里是 image 段 + summary，保留语义比"图片"有用得多。
    if (s?.type === 'image') {
      const summary = String(s.data?.summary ?? '').trim();
      if (summary) return summary.startsWith('[') ? summary : `[${summary}]`;
      return '[图片]';
    }
    // 传统 face 段：能拿到 faceText 就用，否则按 id 映射常用表情名。
    if (s?.type === 'face') {
      const text = String(s.data?.raw?.faceText ?? s.data?.faceText ?? '').trim();
      if (text) return `[${text}]`;
      const id = String(s.data?.id ?? s.data?.raw?.faceIndex ?? '');
      const name = FACE_NAMES[id];
      return name ? `[${name}]` : `[表情${id ? ' ' + id : ''}]`;
    }
    return `[${labels[s?.type] ?? '非文本消息'}]`;
  }).join('').slice(0, 16_000);
}

export function normalizeEvent(event, selfId) {
  if (!event || event.post_type !== 'message' || !['private', 'group'].includes(event.message_type)) return null;
  if (String(event.self_id) !== selfId || String(event.user_id) === selfId) return null;
  const kind = event.message_type;
  const senderId = String(event.user_id ?? '');
  const peerId = kind === 'group' ? String(event.group_id ?? '') : senderId;
  if (!/^[1-9]\d{4,11}$/.test(senderId) || !/^[1-9]\d{4,11}$/.test(peerId)) return null;
  if (event.message_id === undefined || event.message_id === null || !/^-?\d{1,30}$/.test(String(event.message_id))) return null;
  const ts = Number(event.time);
  // QQ faces and sticker packs arrive as image segments with a summary; only real
  // photos/screenshots are worth sending to the vision model.
  const isSticker = x => {
    const summary = String(x?.data?.summary ?? '').trim();
    const subType = Number(x?.data?.sub_type ?? 0);
    return summary.length > 0 || subType === 1 || subType === 7;
  };
  const imageSegments = Array.isArray(event.message)
    ? event.message
        .filter(x => x?.type === 'image' && !isSticker(x))
        .map(x => ({ url: String(x.data?.url ?? ''), file: String(x.data?.file ?? '') }))
        .filter(x => x.url || x.file)
        .slice(0, 4)
    : [];
  // 贴纸单独留一份。
  //
  // 上面 imageSegments 故意把贴纸排除掉，因为「把贴纸送给视觉模型看」没有意义 ——
  // 它会试图描述一张表情包的画面，而那和聊天内容无关。
  // 但「自动收集表情」要的恰恰是这些贴纸。两个用途共用一个数组时，
  // 收集到的是照片、贴纸进不了库 —— 正好和功能名相反。
  const stickerSegments = Array.isArray(event.message)
    ? event.message
        .filter(x => x?.type === 'image' && isSticker(x))
        .map(x => ({ url: String(x.data?.url ?? ''), file: String(x.data?.file ?? '') }))
        .filter(x => x.url || x.file)
        .slice(0, 4)
    : [];
  const replySegment = Array.isArray(event.message)
    ? event.message.find(x => x?.type === 'reply' && x?.data?.id !== undefined)
    : undefined;
  return {
    selfId, kind, peerId, senderId,
    replyId: replySegment ? String(replySegment.data.id) : '',
    images: imageSegments,
    stickers: stickerSegments,
    messageId: String(event.message_id), messageSeq: String(event.message_seq ?? event.real_seq ?? ''),
    nickname: String(event.sender?.card || event.sender?.nickname || senderId).slice(0, 80),
    time: Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000),
    direction: 'in', text: segmentsText(event.message ?? event.raw_message),
    // @全体 在 OneBot 里是 qq='all'，不算「点名找她」的话，
    // mention 模式下她永远不理 @全体，而发出去的方向却支持 ['all'] —— 收发不对称。
    mentioned: Array.isArray(event.message) && event.message.some((x) => {
      if (x?.type !== 'at') return false;
      const qq = String(x.data?.qq ?? '');
      return qq === selfId || qq === 'all';
    }),
  };
}
    // 带图片时上传体积大：几 MB 的图用文本的 15 秒上限会被掐断，
    // 表现为「她明明说了要发图，却只发出一句文字」。