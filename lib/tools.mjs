import { allowConversation } from './config.mjs';
import { segmentsText, faceIdByName } from './onebot.mjs';
import { assert, checkSignal, combinedSignal, integer, qqId, requestId, textArg } from './util.mjs';
import { hhmmOf } from './virtual-life.mjs';

const string = description => ({ type: 'string', description });
const enumeration = values => ({ type: 'string', enum: values });
const target = { kind: enumeration(['private', 'group']), peer_id: string('私聊对方 QQ 号或群号，用字符串') };

// 未连接（等扫码 / 断开）时仍然可用的工具。
// 这些不依赖 QQ 连接：查本地归档、读日程、抓网页、收集表情。
// 未连接（等扫码 / 断开）时仍然可用的工具。
// 这些不依赖 QQ 连接：查本地归档、读日程、抓网页、收集表情、查资料。
const OFFLINE_TOOLS = new Set([
  'qq_qzone_read',
  'qq_meme_collect',
  'qq_get_user_info',
  'qq_get_avatar',
  'qq_get_message',
  'qq_get_group_members',
  'qq_web_search',
  'qq_web_extract',
  'qq_web_batch',
  'qq_life_status',
  'qq_life_generate',
  // Steam 状态查询不走 QQ 连接，断开时照样能用。
  'qq_steam_status',
]);

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
        // exec.signal is optional: AbortSignal.any() throws on a non-signal entry, so
    // filter first. Without this, any call that omits a signal fails before the
    // tool body ever runs.
    const signals = [exec.signal, runtime.shutdown.signal].filter((s) => s && typeof s.addEventListener === 'function');
    const signal = signals.length > 1 ? AbortSignal.any(signals) : (signals[0] ?? new AbortController().signal);
        // 外层不能一刀切。
        // 以前这里固定 allowOffline: name === 'qq_status'，把内层工具自己声明的
        // allowOffline: true 全部盖掉 —— 扫码等待期间模型连网页搜索、日程、表情收集
        // 都用不了，而面板上同样的按钮却能用（面板不走工具表）。
        return runtime.runTool(
          () => execute(args, { ...exec, signal: combinedSignal(signal, name.startsWith('qq_qzone') ? 150_000 : 120_000) }),
          { allowOffline: name === 'qq_status' || OFFLINE_TOOLS.has(name) },
        );
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
  tool('qq_emotion_status', '查看某个 QQ 号当前的情感状态：好感度、亲密度、关系阶段、八维情绪和最近的重要记忆。留空 peer_id 表示查询本会话的人。', {
    peer_id: string('要查询的 QQ 号；留空表示本会话的对方'),
  }, [], async (args, exec) => {
    const store = runtime.emotion;
    assert(store, '情感系统未启用');
    await store.init();
    const origin = runtime.access.context(exec.agent);
    const target = args.peer_id
      ? qqId(args.peer_id)
      : (origin?.peerId ?? runtime.config.ownerIds[0] ?? '');
    assert(target, '无法确定要查询的 QQ 号');
    // 非管理员只能看自己的；跨人查询需要管理员私聊或本机。
    runtime.access.requireManager(exec.agent);
    const key = store.keyFor({ peerId: target, kind: 'private' });
    const { state, stage } = store.describe(key);
    return {
      peer_id: target,
      favor: state.favor,
      intimacy: state.intimacy,
      stage: stage.stageName,
      description: stage.description,
      negative: stage.negative,
      transitioning: stage.isTransitioning,
      composite: Number(stage.composite.toFixed(1)),
      emotions: { ...state.emotions },
      attitude: state.attitude,
      relationship: state.relationship,
      totalTurns: state.totalTurns,
      memories: (state.memories ?? []).slice(-5).map(m => ({ at: m.at, note: m.note, stage: m.stage })),
    };
  });

  tool('qq_emotion_adjust', '直接设置某个 QQ 号的好感度或亲密度。仅管理员私聊可用。用于纠正明显不准的数值。', {
    peer_id: string('目标 QQ 号'),
    favor: { type: 'integer', description: '好感度 -100 到 100' },
    intimacy: { type: 'integer', description: '亲密度 0 到 100' },
  }, ['peer_id'], async (args, exec) => {
    const store = runtime.emotion;
    assert(store, '情感系统未启用');
    access.requireManager(exec.agent);
    await store.init();
    const target = qqId(args.peer_id);
    const patch = {};
    if (args.favor !== undefined) patch.favor = integer(args.favor, 0, -100, 100, '好感度');
    if (args.intimacy !== undefined) patch.intimacy = integer(args.intimacy, 0, 0, 100, '亲密度');
    assert(Object.keys(patch).length, '至少提供 favor 或 intimacy 之一');
    const key = store.keyFor({ peerId: target, kind: 'private' });
    const { state, stage } = await store.set(key, patch);
    return { peer_id: target, favor: state.favor, intimacy: state.intimacy, stage: stage.stageName };
  });

  tool('qq_memory_status', '查看某个 QQ 号被你记住的事情：长期事实和相关事件。留空 peer_id 表示本会话的对方。', {
    peer_id: string('要查询的 QQ 号；留空表示本会话的对方'),
    query: string('想回忆的关键词；留空则只看长期事实'),
  }, [], async (args, exec) => {
    const store = runtime.memory;
    assert(store, '长期记忆未启用');
    await store.init();
    const origin = runtime.access.context(exec.agent);
    const target = args.peer_id ? qqId(args.peer_id) : (origin?.peerId ?? '');
    assert(target, '无法确定要查询的 QQ 号');
    const recalled = store.recall(target, String(args.query ?? ''), {
      limit: 10, factLimit: 10, minScore: 0,
    });
    return {
      peer_id: target,
      facts: recalled.facts.map((m) => ({ text: m.text, time: m.createdAt, key: m.factKey || undefined })),
      events: recalled.events.map((e) => ({ text: e.memory.text, time: e.memory.createdAt, score: Number(e.score.toFixed(3)) })),
      total: store.list(target).length,
    };
  });

  tool('qq_memory_save', '主动把一件事记进长期记忆。用于对方明确让你记住，或出现了必须记住的约定。', {
    text: string('要记住的内容，一句话'),
    peer_id: string('记给哪个 QQ 号；留空表示本会话的对方'),
    kind: enumeration(['fact', 'event']),
    fact_key: string('可选。会变的事用「对象.方面」，例如 对方.身高；不要写具体值'),
  }, ['text'], async (args, exec) => {
    const store = runtime.memory;
    assert(store, '长期记忆未启用');
    await store.init();
    const origin = runtime.access.context(exec.agent);
    const target = args.peer_id ? qqId(args.peer_id) : (origin?.peerId ?? '');
    assert(target, '无法确定要记给谁');
    // 非管理员只能记给本会话的对方，避免给任意人写记忆。
    if (origin && !runtime.access.isOwner(origin)) {
      assert(origin.peerId === target, '只能记住当前会话的对方');
    }
    const result = await store.remember(target, {
      text: textArg(args.text, '记忆内容', 400),
      kind: args.kind === 'fact' ? 'fact' : 'event',
      importance: args.kind === 'fact' ? 2 : 1,
      factKey: String(args.fact_key ?? '').slice(0, 40),
      source: 'tool',
    });
    return { saved: Boolean(result), id: result?.entry?.id ?? '', superseded: result?.superseded ?? null };
  });

  tool('qq_qzone_read', '读取 QQ 空间的说说列表：默认自己，传 uin 读别人的。返回每条的内容、时间、图片和评论。', {
    uin: string('目标 QQ 号；留空表示自己'),
    limit: { type: 'integer', description: '读取条数，默认 10，最多 40' },
    reply_num: { type: 'integer', description: '每条带几条评论，默认 5' },
  }, [], async (args, exec) => {
    access.requireManager(exec.agent);
    const uin = args.uin === undefined || String(args.uin).trim() === '' ? '' : qqId(args.uin, '目标 QQ 号');
    const limit = integer(args.limit, 10, 1, 40, 'limit');
    const replyNum = integer(args.reply_num, 5, 0, 20, 'reply_num');
    const result = await runtime.runTool(
      () => runtime.qzone.list({ uin, limit, replyNum, signal: exec.signal }),
      { allowOffline: true },
    );
    // Attach the images so the model can actually look at the posts.
    const urls = result.feeds.flatMap((f) => f.images).slice(0, 6);
    const parts = urls.length ? await runtime.urlImageParts(urls, exec.signal, 6) : [];
    return {
      ok: true, uin: result.uin, nickname: result.nickname, total: result.total,
      feeds: result.feeds.map((f) => ({ tid: f.tid, topicId: f.topicId, created: f.created, content: { untrusted: true, text: String(f.content ?? '') }, images: f.images.length, comments: f.comments.map((c) => ({ uin: c.uin, content: { untrusted: true, text: String(c.content ?? '') } })) })),
      attachedImages: parts.length,
      ...(parts.length ? { content: parts } : {}),
    };
  });
  tool('qq_qzone_leave_message', '在指定 QQ 空间的留言板发表纯文本留言。当前 HTTP 版暂不支持留言板（接口与说说不同），会返回 unsupported。', {
    uin: string('目标 QQ 号'), text: string('完整留言正文'), request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['uin', 'text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    qqId(args.uin, '目标 QQ 号');
    textArg(args.text, '留言', 2000);
    requestId(args.request_id);
    return {
      status: 'unsupported',
      reason: '留言板走的是另一个接口，HTTP 版尚未实现。说说（发表/评论/删除）不受影响。',
    };
  });
  tool('qq_qzone_publish', '发表一条 QQ 空间说说（纯文本）。request_id 防止重复；status=uncertain 必须先人工核对，不要直接重发。', {
    text: string('说说正文'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const text = textArg(args.text, '说说正文', 2000), id = requestId(args.request_id);
    return runtime.ledger.run(id, { action: 'qzone_publish', text }, async () => {
      await runtime.rate.wait('qzone:publish', exec.signal);
      const result = await runtime.qzone.publish(text, { signal: exec.signal });
      // Confirm by reading the list back: a tid in the reply is not proof the
      // post is visible, and reporting 'sent' for a dropped post is worse than
      // reporting uncertainty.
      let confirmed = false;
      try {
        const list = await runtime.qzone.list({ limit: 3, replyNum: 0, signal: exec.signal });
        confirmed = list.feeds.some((f) => (result.tid && f.tid === result.tid) || f.content.includes(text.slice(0, 12)));
      } catch { /* best-effort */ }
      return {
        status: result.code === 0 && confirmed ? 'sent' : result.code === 0 ? 'uncertain' : 'failed',
        code: result.code, tid: result.tid, message: result.message,
        confirmedBy: confirmed ? 'feed_list' : 'none',
      };
    });
  });
  tool('qq_qzone_autopost_status', '查看「主动发动态」的当前设置、今天的时间槽和最近发布记录。', {}, [], async () => {
    const cfg = runtime.config.qzoneProactive ?? {};
    await runtime.qzoneProactive?.init?.();
    return {
      enabled: cfg.enabled === true,
      config: {
        maxPerDay: cfg.maxPerDay ?? 1,
        dailyChance: cfg.dailyChance ?? 100,
        timeTone: cfg.timeTone !== false,
        window: (cfg.windowStart ?? '08:00') + '–' + (cfg.windowEnd ?? '23:00'),
        minGapMinutes: cfg.minGapMinutes ?? 180,
        topic: cfg.topic ?? '',
        useLife: cfg.useLife !== false,
      },
      qzoneEnabled: runtime.config.qzone?.enabled !== false,
      ...(runtime.qzoneProactive ? runtime.qzoneProactive.snapshot(cfg) : {}),
    };
  });

  tool('qq_qzone_post_now', '立即发一条 QQ 空间说说。不给 text 就由你按当前生活状态自己写一条。走与定时发布相同的确认流程；status=uncertain 时必须先去空间核对，不要直接重发。', {
    text: string('说说正文；留空表示由模型自己写'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    assert(runtime.config.qzone?.enabled !== false, 'QQ 空间功能未启用');
    const id = requestId(args.request_id);
    const manual = args.text === undefined ? '' : textArg(args.text, '说说正文', 2000);
    return runtime.ledger.run(id, { action: 'qzone_post_now', manual }, async () => {
      const state = runtime.qzoneProactive;
      assert(state, '动态调度未启用');
      await state.init();
      assert(!state.pending, '还有一条待确认的动态，请先用 qq_qzone_autopost_status 查看并处理');
      const cfg = runtime.config.qzoneProactive ?? {};
      const text = manual || await runtime.composeQzoneForPanel(cfg);
      assert(text, '生成内容为空，请重试或手动提供 text');
      await state.setPending({ slotId: 'manual:' + id, text });
      // 用这次发布的真实返回值。读 history[0] 在「被服务端拒绝」时会拿到
      // 上一条成功记录，把这次失败报成成功。
      const outcome = await runtime.finishQzonePendingForPanel(state.pending);
      const status = outcome?.status ?? 'uncertain';
      return {
        status,
        tid: outcome?.tid ?? '',
        text,
        detail: outcome?.message ?? '',
        note: status === 'sent'
          ? '已确认出现在说说列表里'
          : status === 'failed'
            ? (outcome?.retriable
                ? '服务端拒绝了这次发布，没有发出去；已保留重试机会'
                : '服务端拒绝了这次发布，且已达到重试上限，本次按失败记账')
            : '已提交但未能在列表里确认，请先到空间核对再决定是否重发',
      };
    });
  });
  tool('qq_qzone_comment', '评论一条 QQ 空间说说。uin 是说说主人的 QQ 号（留空=自己）；feed_id 是 tid（留空=最新一条）。request_id 防止重复。', {
    text: string('评论正文'),
    uin: string('说说主人的 QQ 号；留空表示自己'),
    feed_id: string('说说 tid（留空 = 最新一条）'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['text', 'request_id'], async (args, exec) => {
    access.requireManager(exec.agent);
    const text = textArg(args.text, '评论正文', 1000);
    const id = requestId(args.request_id);
    const wantTid = args.feed_id === undefined ? '' : String(args.feed_id).trim();
    const uin = args.uin === undefined || String(args.uin).trim() === '' ? '' : qqId(args.uin, '说说主人 QQ 号');
    return runtime.ledger.run(id, { action: 'qzone_comment', text, wantTid, uin }, async () => {
      await runtime.rate.wait('qzone:comment', exec.signal);
      // The tid must be resolved to the post it belongs to BEFORE writing: the
      // old browser code guessed by DOM position and commented on the wrong feed.
      const list = await runtime.qzone.list({ uin, limit: 20, replyNum: 0, signal: exec.signal });
      const feed = wantTid ? list.feeds.find((f) => f.tid === wantTid) : list.feeds[0];
      if (!feed) {
        throw new Error(wantTid ? `在 ${list.uin} 的空间里找不到 tid=${wantTid}` : `${list.uin} 的空间里没有可评论的说说`);
      }
      const before = feed.comments.length;
      const result = await runtime.qzone.comment(feed, text, { signal: exec.signal });
      // Read back: a code of 0 alone is not proof, because the gateway answers 0
      // for a request it silently dropped as well.
      let confirmed = false;
      try {
        const after = await runtime.qzone.list({ uin: list.uin, limit: 20, replyNum: 20, signal: exec.signal });
        const same = after.feeds.find((f) => f.tid === feed.tid);
        confirmed = Boolean(same && same.comments.some((c) => c.content.includes(text.slice(0, 12))));
      } catch { /* confirmation is best-effort */ }
      return {
        status: result.code === 0 && confirmed ? 'sent' : result.code === 0 ? 'uncertain' : 'failed',
        code: result.code, message: result.message,
        tid: feed.tid, topicId: feed.topicId,
        post: feed.content.slice(0, 60),
        commentsBefore: before, confirmedBy: confirmed ? 'new_comment_on_same_post' : 'none',
      };
    });
  });
  // ---- sticker library ----------------------------------------------------
  // Three tools instead of the upstream projects' many: search, send, collect.
  // Anything else (approving, deleting, importing) belongs in the panel, where a
  // person is already looking at the picture.
  tool('qq_meme_search', '在表情包图库里按关键词或情绪搜索。返回 id、描述和匹配分数，用 qq_meme_send 发送。', {
    query: string('想表达的内容或情绪，例如「开心」「无语」'),
    limit: { type: 'integer', description: '返回条数，默认 5' },
  }, ['query'], async (args, exec) => runtime.runTool(async () => {
    const lib = runtime.memes;
    if (!lib) throw new Error('表情包图库未启用');
    const hits = lib.search(String(args.query ?? ''), { limit: Math.min(20, Math.max(1, Number(args.limit) || 5)) });
    return {
      total: lib.stats().total,
      hits: hits.map(({ entry, score }) => ({
        id: entry.id, score: Number(score.toFixed(3)),
        description: entry.description || '',
        tags: entry.tags ?? [], emotions: entry.emotions ?? [],
      })),
      note: hits.length ? '用 qq_meme_send 发送选中的 id' : '没有匹配的表情，可以换个说法',
    };
  }, { allowOffline: false }));

  tool('qq_meme_send', '发送一张表情包。id 来自 qq_meme_search。', {
    ...target,
    id: string('表情包 id'),
    request_id: string('8–160 位唯一操作标识；重试必须复用'),
  }, ['kind', 'peer_id', 'id', 'request_id'], async (args, exec) => runtime.runTool(async () => {
    const lib = runtime.memes;
    if (!lib) throw new Error('表情包图库未启用');
    const entry = lib.entries.find((e) => e.id === String(args.id));
    if (!entry) throw new Error('图库里没有这个 id');
    // 走和 qq_send_message 相同的访问校验：黑名单里的群/人不该因为换了个工具就绕过去。
    // 这里以前把 kind 和 peer 两个值直接当参数传给了 target —— 但它要的是整个 args
    // 整个 args 对象（它内部读 args.kind、args.peer_id），传字符串进去会抛
    // 「kind 必须为 private 或 group」。而自动配图走 sendImage 不经过这个工具，
    // 所以只有「模型主动挑一张发」这条路径是坏的，很难被发现。
    const { kind, peerId: peer } = access.target(args, exec.agent, { management: true });
    const entryRecord = await runtime.sendImage(
      args.kind, peer, lib.pathOf(entry),
      requestId(args.request_id), exec.signal, [],
    );
    // ActionLedger.run() 返回的是账本记录，真正的 message_id 在 result.result 里。
    // 以前读 result.messageId（永远是 undefined），而且不管 status 一律报 sent ——
    // 账本返回 failed / uncertain / pending 时，模型会告诉对方表情已经发出去了。
    const status = entryRecord?.status ?? 'sent';
    const messageId = entryRecord?.result?.messageId;
    if (status !== 'sent') {
      return {
        status,
        ...(messageId ? { messageId } : {}),
        id: entry.id,
        note: status === 'uncertain'
          ? '不确定是否已送达，不要重发；先确认对方的反应。'
          : '没有发送成功，可以把情况如实说明。',
      };
    }
    await lib.markUsed(entry.id);
    return { status: 'sent', ...(messageId ? { messageId } : {}), id: entry.id };
  }, { allowOffline: false }));

  tool('qq_meme_collect', '把一张图片收进表情包库。source 是本地路径、http(s) 链接或 qq:<消息id>。默认进待审核池。', {
    source: string('图片来源：本地绝对路径 / http(s) URL / qq:<消息id>'),
    approve: { type: 'boolean', description: 'true = 直接入库；默认 false 进待审核池' },
    note: string('备注，通常写它表达的情绪'),
  }, ['source'], async (args, exec) => runtime.runTool(async () => {
    const lib = runtime.memes;
    if (!lib) throw new Error('表情包图库未启用');
    const bytes = await runtime.resolveImageBytes(String(args.source), exec.signal);
    const result = await lib.addBuffer(bytes, {
      source: 'tool',
      note: String(args.note ?? ''),
      requireApproval: args.approve !== true,
    });
    return result.ok
      ? { status: result.pending ? 'pending' : 'stored', id: result.record.id, width: result.record.width, height: result.record.height }
      : { status: 'skipped', reason: result.reason, duplicate: Boolean(result.duplicate) };
  }, { allowOffline: true }));

  // ---- interaction & group management ------------------------------------
  // Ported from astrbot_plugin_qq_tools, minus the parts that do not fit: the
  // browser and video analyser (this plugin just moved OFF a browser), the wake
  // scheduler (it needs host-level timers), and send_group_notice (measured:
  // NapCat answers "不支持的Api").

  tool('qq_poke', '戳一戳某人（双击头像的效果）。私聊戳好友，群聊戳群成员。', {
    ...target,
    user_id: string('被戳的 QQ 号'),
  }, ['kind', 'peer_id', 'user_id'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    // 黑名单也要过一遍：光有 requireManager 挡不住「管理员手动打到已屏蔽的群」。
    const checked = access.target(args, exec.agent, { management: true });
    const peerId = checked.peerId;
    const userId = qqId(args.user_id, '被戳的 QQ 号');
    await runtime.client.poke(args.kind, peerId, userId, exec.signal);
    return { status: 'sent', kind: args.kind, peerId, userId };
  }, { allowOffline: false }));

  tool('qq_get_user_info', '查询任意 QQ 号的公开资料（昵称、性别、年龄、等级等）。', {
    user_id: string('要查询的 QQ 号'),
  }, ['user_id'], async (args, exec) => runtime.runTool(async () => {
    const userId = qqId(args.user_id, 'QQ 号');
    const info = await runtime.client.userInfo(userId, exec.signal);
    return {
      userId, nickname: String(info?.nickname ?? ''),
      sex: info?.sex ?? '', age: info?.age ?? null, level: info?.level ?? null,
      qid: info?.qid ?? '', remark: info?.remark ?? '',
    };
  }, { allowOffline: true }));

  tool('qq_get_avatar', '获取某个 QQ 号的头像大图。返回图片，模型可以直接看到。', {
    user_id: string('QQ 号'),
    size: enumeration(['large', 'medium', 'small']),
  }, ['user_id'], async (args, exec) => runtime.runTool(async () => {
    const userId = qqId(args.user_id, 'QQ 号');
    const size = args.size ?? 'large';
    const url = `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=${size === 'large' ? 640 : size === 'medium' ? 140 : 40}`;
    const parts = await runtime.urlImageParts([url], exec.signal, 1);
    return {
      userId, url, attached: parts.length,
      ...(parts.length ? { content: parts } : { note: '头像下载失败，只返回 URL' }),
    };
  }, { allowOffline: true }));

  tool('qq_get_message', '按 message_id 取一条消息的完整内容，包括归档时被压平的图片和表情。', {
    message_id: string('消息 id'),
    with_image: { type: 'boolean', description: '是否把图片附到视觉上下文，默认 true' },
  }, ['message_id'], async (args, exec) => runtime.runTool(async () => {
    const messageId = String(args.message_id ?? '').trim();
    assert(/^\d{1,30}$/.test(messageId), 'message_id 必须是数字');
    const raw = await runtime.client.messageDetail(messageId, exec.signal);
    const text = segmentsText(raw?.message ?? raw?.raw_message ?? '');
    const images = [];
    for (const seg of Array.isArray(raw?.message) ? raw.message : []) {
      if (seg?.type === 'image') images.push(String(seg.data?.url || seg.data?.file || ''));
    }
    const wantImage = args.with_image !== false;
    const parts = wantImage && images.length
      ? await runtime.urlImageParts(images.filter((u) => /^https?:/i.test(u)), exec.signal, 4)
      : [];
    return {
      messageId, text: text.slice(0, 4000),
      senderId: String(raw?.sender?.user_id ?? ''), nickname: String(raw?.sender?.nickname ?? ''),
      time: Number(raw?.time ?? 0) || null, imageCount: images.length, attachedImages: parts.length,
      ...(parts.length ? { content: parts } : {}),
    };
  }, { allowOffline: true }));

  tool('qq_repeat_message', '把一条消息原样复读/转发到指定会话（含图片与表情）。', {
    ...target,
    message_id: string('要复读的消息 id'),
    request_id: string('8–160 位唯一操作标识；重试复用'),
  }, ['kind', 'peer_id', 'message_id', 'request_id'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    const checked = access.target(args, exec.agent, { management: true });
    const peerId = checked.peerId;
    const messageId = String(args.message_id ?? '').trim();
    // 入站规范化允许负数 id（onebot.mjs），撤回工具也允许；复读这边却只认正数，
    // 于是同一个 message_id 撤回得了、复读不了。统一成有符号数字。
    assert(/^-?\d{1,30}$/.test(messageId), 'message_id 必须是数字（可为负）');
    const id = requestId(args.request_id);
    return runtime.ledger.run(id, { action: 'repeat', kind: args.kind, peerId, messageId }, async () => {
      await runtime.rate.wait(`${args.kind}:${peerId}`, exec.signal);
      const raw = await runtime.client.messageDetail(messageId, exec.signal);
      const segments = Array.isArray(raw?.message) ? raw.message : [];
      assert(segments.length, '这条消息没有可复读的内容');
      // Forward the original segments verbatim: re-encoding them as text loses
      // images and faces, which is the whole point of repeating a message.
      const result = await runtime.client.sendSegments(args.kind, peerId, segments, exec.signal, []);
      return { status: 'sent', messageId: String(result?.message_id ?? ''), segments: segments.length };
    });
  }, { allowOffline: false }));

  tool('qq_get_group_members', '列出群成员（群名片、昵称、角色、等级）。', {
    group_id: string('群号'),
    limit: { type: 'integer', description: '最多返回几人，默认 50' },
  }, ['group_id'], async (args, exec) => runtime.runTool(async () => {
    // 读群成员也要过访问校验：已屏蔽的群不该还能被列成员。
    const checked = access.target({ kind: 'group', peer_id: args.group_id }, exec.agent, { management: true });
    const groupId = checked.peerId;
    const members = await runtime.client.groupMembers(groupId, exec.signal);
    const list = (members ?? []).slice(0, Math.min(200, Math.max(1, Number(args.limit) || 50)));
    return {
      groupId, total: (members ?? []).length, shown: list.length,
      members: list.map((m) => ({
        userId: String(m.user_id ?? ''), card: String(m.card ?? ''), nickname: String(m.nickname ?? ''),
        role: String(m.role ?? 'member'), level: m.level ?? null, joinedAt: m.join_time ?? null,
      })),
    };
  }, { allowOffline: true }));

  tool('qq_set_group_card', '修改群成员的名片。仅管理员私聊可用。', {
    group_id: string('群号'), user_id: string('目标 QQ 号'), card: string('新名片；空字符串表示清除'),
  }, ['group_id', 'user_id'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    const groupId = qqId(args.group_id, '群号');
    const userId = qqId(args.user_id, '目标 QQ 号');
    const card = String(args.card ?? '').slice(0, 60);
    await runtime.client.setGroupCard(groupId, userId, card, exec.signal);
    return { status: 'sent', groupId, userId, card };
  }, { allowOffline: false }));

  tool('qq_group_ban', '禁言群成员。duration 单位秒，0 = 解除禁言。仅管理员私聊可用。', {
    group_id: string('群号'), user_id: string('目标 QQ 号'),
    duration: { type: 'integer', description: '禁言秒数，0 = 解除；最长 30 天' },
  }, ['group_id', 'user_id', 'duration'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    const groupId = qqId(args.group_id, '群号');
    const userId = qqId(args.user_id, '目标 QQ 号');
    const seconds = Math.min(2_592_000, Math.max(0, // 0 在 QQ 接口上是「解除禁言」。以前 Number(x) || 0 会把 null / 空串 / 非法值都变成 0，
      // 等于一次误操作就把人放出来。缺失或非法直接报错。
      (args.duration === undefined || args.duration === null || args.duration === ''
        ? (() => { throw new Error('duration 必填：0 = 解除禁言，其余为禁言秒数'); })()
        : (Number.isFinite(Number(args.duration)) ? Number(args.duration) : (() => { throw new Error('duration 必须是数字'); })()))));
    await runtime.client.groupBan(groupId, userId, seconds, exec.signal);
    return { status: 'sent', groupId, userId, duration: seconds, note: seconds === 0 ? '已解除禁言' : '已禁言' };
  }, { allowOffline: false }));

  tool('qq_set_essence', '把一条消息设为群精华。仅管理员私聊可用。', {
    message_id: string('要设为精华的消息 id'),
  }, ['message_id'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    const messageId = String(args.message_id ?? '').trim();
    assert(/^\d{1,30}$/.test(messageId), 'message_id 必须是数字');
    await runtime.client.setEssence(messageId, exec.signal);
    return { status: 'sent', messageId };
  }, { allowOffline: false }));

  tool('qq_send_like', '给某人名片点赞。times 最多 10。', {
    user_id: string('目标 QQ 号'),
    times: { type: 'integer', description: '点赞次数，默认 10，最多 10' },
  }, ['user_id'], async (args, exec) => runtime.runTool(async () => {
    access.requireManager(exec.agent);
    const userId = qqId(args.user_id, 'QQ 号');
    const times = Math.min(10, Math.max(1, Number(args.times) || 10));
    await runtime.client.sendLike(userId, times, exec.signal);
    return { status: 'sent', userId, times };
  }, { allowOffline: false }));

  // ---- web search ---------------------------------------------------------
  // Ported from astrbot_plugin_anysearch. Three tools, not four: the upstream
  // also exposes list_domains, which the endpoint answers with "tool not found".

  tool('qq_web_search', '实时联网搜索。适合查新闻、文档、事实核验和近期变化。返回带 URL 的结果摘要。', {
    query: string('搜索关键词'),
    max_results: { type: 'integer', description: '返回条数，默认 5，最多 20' },
    freshness: enumeration(['', 'day', 'week', 'month', 'year']),
  }, ['query'], async (args, exec) => runtime.runTool(async () => {
    const client = runtime.search;
    if (!client) throw new Error('联网搜索未启用');
    const text = await client.search(String(args.query ?? ''), {
      maxResults: Number(args.max_results) || 5,
      freshness: String(args.freshness ?? ''),
    });
    return { query: String(args.query), chars: text.length, result: { untrusted: true, text: text.slice(0, 6000) } };
  }, { allowOffline: true }));

  tool('qq_web_extract', '提取一个公网网页的可读正文（Markdown）。只接受公开 http/https，拒绝本机与内网地址。', {
    url: string('要提取的网页地址'),
  }, ['url'], async (args, exec) => runtime.runTool(async () => {
    const client = runtime.search;
    if (!client) throw new Error('联网搜索未启用');
    const text = await client.extract(String(args.url ?? ''));
    return { url: String(args.url), chars: text.length, result: { untrusted: true, text: text.slice(0, 8000) } };
  }, { allowOffline: true }));

  tool('qq_web_batch', '并行执行 1–5 个独立搜索，适合对比资料或快速收集多条线索。', {
    queries: { type: 'array', items: { type: 'string' }, description: '1–5 个搜索关键词' },
  }, ['queries'], async (args, exec) => runtime.runTool(async () => {
    const client = runtime.search;
    if (!client) throw new Error('联网搜索未启用');
    const list = Array.isArray(args.queries) ? args.queries : [];
    const text = await client.batchSearch(list);
    return { count: list.length, chars: text.length, result: text.slice(0, 10_000) };
  }, { allowOffline: true }));

  // ---- virtual life --------------------------------------------------------
  // Two tools: read the schedule, and regenerate the week. Everything else
  // (outfit, meals, proactive switches) belongs in the panel, where a person can
  // see what the model actually produced.

  tool('qq_steam_status', '查看某个 QQ 绑定的 Steam 账号此刻在玩什么、在线状态、最近的游戏时长。不传 qq 时查当前对话对象。', {
    qq: string('要查询的 QQ 号，留空则查当前对话对象'),
    refresh: { type: 'boolean', description: '忽略缓存，强制重新查询' },
  }, [], async (args, exec) => runtime.runTool(async () => {
    const steam = runtime.steam;
    if (!steam?.enabled) throw new Error('Steam 未启用：请先在面板「Steam」里填 API Key 并打开开关');
    // 当前对话对象：私聊是对方 QQ，群聊是发言人（绑定要绑到人，不绑到群）。
    const origin = access.context(exec?.agent);
    const selfQq = origin ? (origin.senderId || (origin.kind === 'private' ? origin.peerId : '')) : '';
    const target = args.qq ? qqId(args.qq, 'QQ 号') : selfQq;
    if (!target) throw new Error('没有指定 QQ 号，也拿不到当前对话对象');
    const status = await runtime.steamStatusFor(target, { force: args.refresh === true });
    if (!status) return { bound: false, note: '这个 QQ 还没有绑定 Steam，或者 Steam 查询失败。绑定只能在面板「Steam」卡片里做，聊天里不能绑。' };
    const { describeSteamStatus, formatPlaytime } = await import('./steam.mjs');
    return {
      bound: true,
      steamId: status.steamId,
      nickname: status.nickname,
      state: status.state,
      inGame: status.inGame || null,
      summary: describeSteamStatus(status),
      recentGames: (status.recentGames ?? []).map((g) => ({
        name: g.name,
        total: formatPlaytime(g.minutes) || null,
        twoWeeks: formatPlaytime(g.minutes2Weeks) || null,
      })),
      gamesUnavailable: status.gamesUnavailable === true
        ? '拿不到游戏时长：Steam 的「游戏详情」需要设为公开'
        : undefined,
    };
  })),

  tool('qq_life_status', '查看当前虚拟生活状态：今天在做什么、穿什么、吃什么，以及这一周的整体安排。', {
    detail: enumeration(['today', 'week']),
  }, [], async (args, exec) => runtime.runTool(async () => {
    const life = runtime.life;
    if (!life) throw new Error('虚拟人生未启用');
    await life.init();
    if (!life.ready) return { ready: false, note: '还没有生成日程，请先在面板里点「生成」' };
    const now = new Date();
    const plan = life.planFor(now);
    const draw = life.drawFor(now);
    const base = {
      ready: true, weekday: plan.weekday, theme: plan.theme, mood: plan.mood,
      longTerm: life.state.longTerm,
      now: life.describe(now),
      outfit: draw.outfit ? { style: draw.outfit.style, pieces: draw.outfit.pieces.map((p) => p.name) } : null,
      // 晚上可能换了另一套，昼夜天气不同时才会出现。
      eveningOutfit: draw.eveningOutfit && draw.outfit && draw.eveningOutfit.id !== draw.outfit.id
        ? { style: draw.eveningOutfit.style, pieces: draw.eveningOutfit.pieces.map((p) => p.name) }
        : null,
      meals: draw.meals.map((m) => ({ slot: m.slot, place: m.place, dishes: m.dishes })),
    };
    if (args.detail === 'week') {
      base.week = Object.entries(life.state.week).map(([index, day]) => ({
        weekday: ['周一','周二','周三','周四','周五','周六','周日'][Number(index)],
        theme: day.theme, mood: day.mood,
        timeline: day.timeline.map((item) => ({
          span: hhmmOf(item.start) + '-' + (item.end >= 1440 ? '24:00' : hhmmOf(item.end)),
          activity: item.activity, location: item.location, state: item.state,
        })),
      }));
    }
    return base;
  }, { allowOffline: true }));

  tool('qq_life_generate', '重新生成虚拟人生：一整周的日程、穿搭池和三餐池。会调用一次模型，耗时较长。', {
    force: { type: 'boolean', description: '已有数据时是否强制重新生成' },
  }, [], async (args, exec) => runtime.runTool(async () => {
    const generator = runtime.lifeGenerator;
    if (!generator) throw new Error('虚拟人生未启用');
    const result = await generator.generate({ force: args.force === true });
    return result;
  }, { allowOffline: true }));

  return definitions;
}
