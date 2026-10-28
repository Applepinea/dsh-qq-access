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

export function segmentsText(message) {
  if (typeof message === 'string') {
    // Legacy CQ strings are data, never sent back as raw CQ commands.
    return message.replace(/\[CQ:([^,\]]+)[^\]]*\]/g, '[$1]');
  }
  if (!Array.isArray(message)) return '';
  const labels = { image: '图片', record: '语音', video: '视频', file: '文件', face: '表情', reply: '引用消息', forward: '合并转发', json: '分享卡片', xml: '分享卡片' };
  return message.map(s => {
    if (s?.type === 'text') return String(s.data?.text ?? '');
    if (s?.type === 'at') return `@${s.data?.qq ?? ''}`;
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
  const replySegment = Array.isArray(event.message)
    ? event.message.find(x => x?.type === 'reply' && x?.data?.id !== undefined)
    : undefined;
  return {
    selfId, kind, peerId, senderId,
    replyId: replySegment ? String(replySegment.data.id) : '',
    messageId: String(event.message_id), messageSeq: String(event.message_seq ?? event.real_seq ?? ''),
    nickname: String(event.sender?.card || event.sender?.nickname || senderId).slice(0, 80),
    time: Number.isFinite(ts) && ts > 0 ? ts : Math.floor(Date.now() / 1000),
    direction: 'in', text: segmentsText(event.message ?? event.raw_message),
    mentioned: Array.isArray(event.message) && event.message.some(x => x?.type === 'at' && String(x.data?.qq) === selfId),
  };
}
