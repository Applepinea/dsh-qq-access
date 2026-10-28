import { allowConversation } from './config.mjs';
import { segmentsText, faceIdByName } from './onebot.mjs';
import { assert, checkSignal, combinedSignal, integer, qqId, requestId, textArg } from './util.mjs';

const string = description => ({ type: 'string', description });
const enumeration = values => ({ type: 'string', enum: values });
const target = { kind: enumeration(['private', 'group']), peer_id: string('私聊对方 QQ 号或群号，用字符串') };

export function makeTools(runtime) {
  const { access, config } = runtime;
  const definitions = [];
  const tool = (name, description, properties, required, execute) => {
    definitions.push({
      name, description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => {
          // Tool results can carry image blocks; the model only sees what render emits,
          // so pass them through instead of flattening everything into JSON text.
          const attachments = Array.isArray(value?.content)
            ? value.content.filter(part => part && part.type === 'image' && part.attachment)
            : [];
          const rest = attachments.length ? { ...value, content: undefined } : value;
          const text = { type: 'text', text: JSON.stringify(rest) };
          return attachments.length ? [text, ...attachments] : [text];
        },
      },
      execute: async (args, exec) => {
        assert(args && typeof args === 'object' && !Array.isArray(args), '工具参数必须为对象');
        for (const key of required) assert(args[key] !== undefined, `缺少参数 ${key}`);
        for (const key of Object.keys(args)) assert(Object.hasOwn(properties, key), `未知参数 ${key}`);
        const denied = access.guard({ ...exec, name });
        assert(!denied, denied);
        checkSignal(exec.signal);
        const signal = AbortSignal.any([exec.signal, runtime.shutdown.signal]);
        return runtime.runTool(() => execute(args, { ...exec, signal: combinedSignal(signal, name.startsWith('qq_qzone') ? 150_000 : 120_000) }), { allowOffline: name === 'qq_status' });
      },
    });
  };
  tool('qq_status', '查看 QQ 接入状态。普通 QQ 联系人只可见本会话状态。', {}, [], async (_args, exec) => runtime.status(exec.agent));
  tool('qq_list_contacts', '列出当前登录 QQ 的好友或群。仅本机 Harness / 管理员私聊可调用。返回 QQ 号用于后续操作。', {
    kind: enumeration(['friends', 'groups']), offset: { type: 'integer' }, limit: { type: 'integer' },
  }, ['kind'], async (args, exec) => {
    access.requireManager(exec.agent);
    assert(['friends', 'groups'].includes(args.kind), 'kind 必须为 friends 或 groups');
    const offset = integer(args.offset, 0, 0, 100_000, 'offset');
    const limit = integer(args.limit, 100, 1, 200, 'limit');
    const data = await runtime.client.call(args.kind === 'friends' ? 'get_friend_list' : 'get_group_list', {}, exec.signal);
    assert(Array.isArray(data), 'QQ 联系人接口返回格式不兼容');
    const records = data.map(row => args.kind === 'friends'
      ? { id: String(row.user_id), nickname: String(row.nickname ?? ''), remark: String(row.remark ?? '') }
      : { id: String(row.group_id), name: String(row.group_name ?? ''), memberCount: row.member_count ?? null })
      .filter(row => allowConversation(config, args.kind === 'friends' ? 'private' : 'group', row.id, args.kind === 'friends' ? row.id : ''));
    return { kind: args.kind, records: records.slice(offset, offset + limit), total: records.length, nextOffset: offset + limit < records.length ? offset + limit : null };
  });
  tool('qq_list_conversations', '列出本插件已归档的最近会话；从开始运行后累积，不代表 QQ 全部历史会话。', {
    offset: { type: 'integer' }, limit: { type: 'integer' },
  }, [], async (args, exec) => {
    access.requireManager(exec.agent);
    const offset = integer(args.offset, 0, 0, 100_000, 'offset'), limit = integer(args.limit, 50, 1, 200, 'limit');
    const records = runtime.store.conversations().filter(r => allowConversation(config, r.kind, r.peerId, r.kind === 'private' ? r.peerId : ''));
    return { records: records.slice(offset, offset + limit), total: records.length, indexTruncated: runtime.store.indexTruncated ?? false, nextOffset: offset + limit < records.length ? offset + limit : null };
  });
  tool('qq_read_history', '读取一个会话的最近消息。source=local 读取本地归档；source=qq 调用 NapCat 历史接口，可用 before_seq 翻页。QQ 历史可能不完整。', {
    ...target, source: enumeration(['local', 'qq']), count: { type: 'integer' }, before_seq: string('QQ 历史分页序号，来自返回的 message_seq'),
  }, ['kind', 'peer_id'], async (args, exec) => {
    const { kind, peerId } = access.target(args, exec.agent);
    const count = integer(args.count, 30, 1, 100, 'count');
    assert(args.source === undefined || ['local', 'qq'].includes(args.source), 'source 必须为 local 或 qq');
    if (args.source !== 'qq') return runtime.store.query({ kind, peerId, limit: count, signal: exec.signal });
    if (args.before_seq !== undefined) assert(typeof args.before_seq === 'string' && /^\d{1,30}$/.test(args.before_seq), 'before_seq 必须是数字字符串');
    const data = await runtime.client.history(kind, peerId, count, args.before_seq, exec.signal);
    assert(Array.isArray(data?.messages), 'QQ 历史消息接口不兼容或不可用。可改用 source=local。');
    const messages = data.messages.slice(-count).map(m => ({
      message_id: String(m.message_id ?? ''), message_seq: String(m.message_seq ?? m.real_seq ?? ''),
      sender_id: String(m.user_id ?? m.sender?.user_id ?? ''), nickname: String(m.sender?.card || m.sender?.nickname || ''),
      time: m.time ?? null, text: segmentsText(m.message ?? m.raw_message),
    })).filter(m => !config.access.blockedUsers.includes(m.sender_id));
    return { source: 'qq', messages, nextBeforeSeq: messages[0]?.message_seq || null, completeness: 'unknown', note: '接口可能只返回客户端已加载或服务器允许获取的记录。' };
  });
  tool('qq_search_messages', '按关键词搜索本地归档的一个指定会话，返回保留期内最近的匹配记录。', {
    ...target, keyword: string('要搜索的原文关键词'), count: { type: 'integer' },
  }, ['kind', 'peer_id', 'keyword'], async (args, exec) => {
    const { kind, peerId } = access.target(args, exec.agent, { management: true });
    return runtime.store.query({ kind, peerId, keyword: textArg(args.keyword, '关键词', 200), limit: integer(args.count, 30, 1, 100, 'count'), signal: exec.signal });
  });
  tool('qq_send_message', '向指定私聊或群聊发送文本，可在群聊中 @ 成员。request_id 是本次操作的唯一标识；重试相同操作必须复用它。仅 status=sent 可声称发送成功。', {
    ...target,
    text: string('完整消息正文'),
    mentions: {
      type: 'array',
      description: '仅群聊可用：要 @ 的 QQ 号字符串数组；传 ["all"] 表示 @全体成员。最多 10 个。',
      items: { type: 'string' },
    },
    request_id: string('8–160 位唯一操作标识；重试必须复用'),
  }, ['kind', 'peer_id', 'text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const { kind, peerId } = access.target(args, exec.agent, { management: true });
    const mentions = args.mentions === undefined ? [] : args.mentions;
    assert(Array.isArray(mentions) && mentions.length <= 10, 'mentions 必须是数组且最多 10 项');
    const normalized = mentions.map(value => {
      const text = String(value);
      if (text === 'all') return 'all';
      return qqId(text, '@ 的 QQ 号');
    });
    if (normalized.length) assert(kind === 'group', '@ 成员只在群聊中有效');
    return runtime.send(kind, peerId, textArg(args.text, '消息', 4000), requestId(args.request_id), exec.signal, normalized);
  });
  tool('qq_group_member_info', '读取群成员资料（群名片、昵称、角色）。不传 user_id 时返回本账号在该群的资料，用于确认自己的群昵称。', {
    group_id: string('群号'), user_id: string('要查询的 QQ 号；留空表示本账号'),
  }, ['group_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const groupId = qqId(args.group_id, '群号');
    const userId = args.user_id === undefined ? config.selfId : qqId(args.user_id, 'QQ 号');
    const info = await runtime.client.call('get_group_member_info', { group_id: groupId, user_id: userId, no_cache: true }, exec.signal);
    return {
      groupId, userId,
      card: String(info?.card ?? ''),
      nickname: String(info?.nickname ?? ''),
      displayName: String(info?.card || info?.nickname || ''),
      role: String(info?.role ?? ''),
      isSelf: userId === config.selfId,
    };
  });
  tool('qq_send_image', '发送一张图片。source 可以是本地绝对路径、http(s) URL、data:image/... 或 base64:// 内容。request_id 防止重复发送。', {
    ...target,
    source: string('图片来源：本地绝对路径 / http(s) URL / data URL / base64:// / qq:<消息id>（转发收到过的图）'),
    caption: string('可选：图片后附带的文字说明'),
    mentions: { type: 'array', description: '仅群聊可用：要 @ 的 QQ 号；["all"] 表示全体。最多 10 个。', items: { type: 'string' } },
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['kind', 'peer_id', 'source', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const { kind, peerId } = access.target(args, exec.agent, { management: true });
    const mentions = args.mentions === undefined ? [] : args.mentions;
    assert(Array.isArray(mentions) && mentions.length <= 10, 'mentions 必须是数组且最多 10 项');
    const normalized = mentions.map(value => String(value) === 'all' ? 'all' : qqId(String(value), '@ 的 QQ 号'));
    if (normalized.length) assert(kind === 'group', '@ 成员只在群聊中有效');
    const caption = args.caption === undefined ? '' : textArg(args.caption, '图片说明', 2000);
    return runtime.sendImage(kind, peerId, args.source, requestId(args.request_id), exec.signal, normalized, caption);
  });
  tool('qq_send_face', '发送一个 QQ 系统表情。face 可以是数字 id（如 "20"）或中文名（如 "偷笑"）。request_id 防止重复发送。', {
    ...target,
    face: string('表情 id 或中文名，例如 "20" / "偷笑"'),
    caption: string('可选：表情后附带的文字'),
    mentions: { type: 'array', description: '仅群聊可用：要 @ 的 QQ 号；["all"] 表示全体。最多 10 个。', items: { type: 'string' } },
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['kind', 'peer_id', 'face', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const { kind, peerId } = access.target(args, exec.agent, { management: true });
    const faceId = faceIdByName(args.face);
    assert(faceId, `无法识别表情「${args.face}」；请用数字 id 或已知中文名`);
    const mentions = args.mentions === undefined ? [] : args.mentions;
    assert(Array.isArray(mentions) && mentions.length <= 10, 'mentions 必须是数组且最多 10 项');
    const normalized = mentions.map(value => String(value) === 'all' ? 'all' : qqId(String(value), '@ 的 QQ 号'));
    if (normalized.length) assert(kind === 'group', '@ 成员只在群聊中有效');
    const caption = args.caption === undefined ? '' : textArg(args.caption, '表情说明', 2000);
    return runtime.sendFace(kind, peerId, faceId, requestId(args.request_id), exec.signal, normalized, caption);
  });
  tool('qq_recall_message', '撤回本账号自己发出的一条消息（2 分钟内）。message_id 可省略，省略时撤回本会话最近一条自己发的消息。群里只能撤回自己发的，不能撤回他人消息。', {
    ...target,
    message_id: string('要撤回的消息 message_id；留空表示本会话最近一条自己发的消息'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['kind', 'peer_id', 'request_id'], async (args, exec) => {
    const { kind, peerId } = access.target(args, exec.agent);
    let own;
    if (args.message_id === undefined || String(args.message_id).trim() === '') {
      own = await runtime.findLatestOwnMessage(kind, peerId, 120);
      assert(own, '本会话最近 2 分钟内没有本账号发出的消息可撤回');
    } else {
      const messageId = String(args.message_id).trim();
      assert(/^-?\d{1,30}$/.test(messageId), 'message_id 必须为数字字符串');
      own = await runtime.findOwnMessage(kind, peerId, messageId);
      assert(own, '只能撤回本账号在本会话中发出、且已被归档的消息');
      const ageSeconds = Math.floor(Date.now() / 1000) - Number(own.time ?? 0);
      assert(ageSeconds <= 120, `超过撤回窗口（该消息已发出 ${ageSeconds} 秒，上限 120 秒）`);
    }
    return runtime.recall(String(own.messageId), requestId(args.request_id), exec.signal);
  });
  tool('qq_qzone_read', '读取已登录账号有权访问的 QQ 空间当前可见文本：home 首页、guestbook 留言板、shuoshuo 说说。不是全量导出。', {
    uin: string('目标 QQ 号'), section: enumeration(['home', 'guestbook', 'shuoshuo']), max_chars: { type: 'integer' },
  }, ['uin'], async (args, exec) => {
    access.requireManager(exec.agent);
    const section = args.section ?? 'home';
    const result = await runtime.qzone.read(qqId(args.uin), section, integer(args.max_chars, 12_000, 500, 30_000, 'max_chars'), exec.signal);
    // Attach the page's real images so the model can actually look at them.
    const urls = (result.images ?? []).map(image => image.url);
    const parts = urls.length ? await runtime.urlImageParts(urls, exec.signal, 6) : [];
    return { ...result, imageCount: urls.length, attachedImages: parts.length, content: parts };
  });
  tool('qq_qzone_leave_message', '在指定 QQ 空间的【留言板】发表纯文本留言。需先运行 qzone-login。request_id 防止重复；status=uncertain/pending 必须先人工核对。', {
    uin: string('目标 QQ 号'), text: string('完整留言正文'), request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['uin', 'text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const uin = qqId(args.uin), text = textArg(args.text, '留言', 2000), id = requestId(args.request_id);
    return runtime.ledger.run(id, { action: 'qzone_guestbook', uin, text }, async () => {
      await runtime.rate.wait(`qzone:${uin}`, exec.signal);
      return runtime.qzone.leaveMessage(uin, text, exec.signal);
    });
  });
  tool('qq_qzone_publish', '发表一条 QQ 空间说说（纯文本）。request_id 防止重复；status=uncertain 必须先人工核对，不要直接重发。', {
    text: string('说说正文'), request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const text = textArg(args.text, '说说正文', 2000), id = requestId(args.request_id);
    return runtime.ledger.run(id, { action: 'qzone_publish', text }, async () => {
      await runtime.rate.wait('qzone:publish', exec.signal);
      return runtime.qzone.publishShuoshuo(text, exec.signal);
    });
  });
  tool('qq_qzone_comment', '评论一条 QQ 空间说说。uin 是说说主人的 QQ 号（留空=自己），feed_id 留空表示该空间最新一条。request_id 防止重复；status=uncertain 必须先人工核对。', {
    text: string('评论正文'),
    uin: string('说说主人的 QQ 号；留空表示自己'),
    feed_id: string('说说 id（留空=最新一条）'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const text = textArg(args.text, '评论正文', 1000), id = requestId(args.request_id);
    const feedId = args.feed_id === undefined || String(args.feed_id).trim() === '' ? '' : String(args.feed_id).trim();
    assert(!feedId || /^[0-9a-zA-Z_-]{1,64}$/.test(feedId), 'feed_id 格式不正确');
    const uin = args.uin === undefined || String(args.uin).trim() === '' ? '' : qqId(args.uin, '说说主人 QQ 号');
    return runtime.ledger.run(id, { action: 'qzone_comment', text, feedId, uin }, async () => {
      await runtime.rate.wait('qzone:comment', exec.signal);
      return runtime.qzone.commentShuoshuo(text, feedId, exec.signal, uin);
    });
  });
  return definitions;
}
