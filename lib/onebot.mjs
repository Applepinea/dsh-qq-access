import { assert, checkSignal, combinedSignal } from './util.mjs';

export class OneBotClient {
  constructor(config, fetcher = fetch) { this.config = config; this.fetcher = fetcher; }
  async call(action, params = {}, signal) {
    assert(/^[a-z][a-z0-9_]+$/.test(action), '无效 OneBot action');
    checkSignal(signal);
    let response;
    try {
      response = await this.fetcher(`${this.config.apiUrl}/${action}`, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.token}` },
        body: JSON.stringify(params), signal: combinedSignal(signal, this.config.timeoutMs),
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
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    assert(contentLength <= 8 * 1024 * 1024, `${action} 响应过大`);
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

  /** Send one image from a local path, http(s) URL, or base64 payload. */
  async sendImage(kind, peerId, file, signal, mentions = [], caption = '') {
    const message = [];
    if (kind === 'group') for (const target of mentions) message.push({ type: 'at', data: { qq: String(target) } });
    message.push({ type: 'image', data: { file } });
    if (caption) message.push({ type: 'text', data: { text: caption } });
    const params = { [kind === 'group' ? 'group_id' : 'user_id']: peerId, message };
    return this.call(kind === 'group' ? 'send_group_msg' : 'send_private_msg', params, signal);
  }

  /** Resolve one message by id, used to expand quoted replies. */
  getMessage(messageId, signal) {
    return this.call('get_msg', { message_id: String(messageId) }, signal);
  }

  /** Recall one message by id. */
  recall(messageId, signal) {
    return this.call('delete_msg', { message_id: String(messageId) }, signal);
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
  const replySegment = Array.isArray(event.message)
    ? event.message.find(x => x?.type === 'reply' && x?.data?.id !== undefined)
    : undefined;
  return {
    selfId, kind, peerId, senderId,
    replyId: replySegment ? String(replySegment.data.id) : '',
    images: imageSegments,
    messageId: String(event.message_id), messageSeq: String(event.message_seq ?? event.real_seq ?? ''),
    nickname: String(event.sender?.card || event.sender?.nickname || senderId).slice(0, 80),
    time: Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000),
    direction: 'in', text: segmentsText(event.message ?? event.raw_message),
    mentioned: Array.isArray(event.message) && event.message.some(x => x?.type === 'at' && String(x.data?.qq) === selfId),
  };
}
