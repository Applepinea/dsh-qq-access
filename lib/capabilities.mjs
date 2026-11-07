/**
 * Capability guide: what she can DO, and WHEN to reach for it.
 *
 * Why this is a separate module and a separate prompt section:
 *
 *   - The panel's `persona` field is the USER's writing. It describes who she is
 *     and how she talks. If capabilities were appended to that string, every edit
 *     in the panel would risk deleting or duplicating them, and a user who pasted
 *     a long persona would silently push them out of the model's attention.
 *
 *   - The persona deliberately forbids technical vocabulary ("接口""API""模型"
 *     "调用"). Measured once: told to look at an avatar, the model refused to call
 *     the tool and invented "头像转半天没刷出来", because its persona said such
 *     words must never appear. The fix is not to weaken the persona but to state,
 *     in a HIGHER-priority section, that using a tool is a backstage action that
 *     does not change how she speaks. That statement has to live outside the
 *     persona or it gets overwritten by the next panel save.
 *
 * So: persona = voice. This file = hands. They are injected as two sections with
 * different `order` values so a long persona cannot crowd this out.
 */

/**
 * One entry per capability, grouped by WHEN it is useful rather than by tool name.
 *
 * The `when` field is the part that matters. A bare list of tool names is what
 * the previous TOOL_CAPABILITIES was, and the model rarely acted on it: knowing
 * that `qq_get_avatar` exists does not tell you that "发张你的照片" is a moment to
 * use it. Phrasing each entry as a trigger ("对方问…时") is what turns a catalogue
 * into behaviour.
 */
export const CAPABILITY_GROUPS = [
  {
    id: 'see',
    title: '看和查',
    items: [
      {
        tools: ['qq_get_avatar'],
        when: '对方让你看某人的头像、问你「这头像好看吗」、或你想知道一个人长什么样时',
        how: '传 QQ 号即可，返回的图片会直接进你的视野，你能真的看到它',
      },
      {
        tools: ['qq_get_user_info'],
        when: '需要知道一个人的昵称、性别、年龄、等级，或想确认某个号是谁时',
        how: '只返回公开资料；查不到就说查不到，不要猜',
      },
      {
        tools: ['qq_get_message'],
        when: '对方引用了某条消息、说「上面那条」、或你需要看清一条消息里的图片和表情时',
        how: '按 message_id 取原文，图片会进视野',
      },
      {
        tools: ['qq_read_history', 'qq_search_messages'],
        when: '对方说「你忘了？」「刚才不是说过」、你想找回之前聊过的内容、或需要确认某件事有没有说过时',
        how: 'read_history 读最近消息；search_messages 按关键词搜。只能搜到归档保留期内的内容',
      },
      {
        tools: ['qq_list_conversations', 'qq_list_contacts'],
        when: '需要知道最近和谁聊过、有哪些群、或找一个很久没联系的人时',
        how: '仅本机或管理员私聊可用；普通会话里不要尝试',
      },
      {
        tools: ['qq_get_group_members', 'qq_group_member_info'],
        when: '群聊里想认人、想知道谁是管理员、或需要确认自己在群里的名片时',
        how: '不传 QQ 号时返回你自己在该群的资料',
      },
      {
        tools: ['qq_status'],
        when: '对方问「你在吗」「怎么不回消息」，或你怀疑连接出了问题、消息可能没发出去时',
        how: '顺便用它确认自己是否在线，再决定要不要说「刚才信号不好」',
      },
    ],
  },
  {
    id: 'act',
    title: '动手做',
    items: [
      {
        tools: ['qq_send_message'],
        when: '需要主动发消息给某个人或某个群，而不是回复当前会话时',
        how: '必须带唯一的 request_id；只有 status=sent 才能说发出去了',
      },
      {
        tools: ['qq_send_image'],
        when: '对方要图、你想分享一张图、或需要把某个链接/截图发过去时',
        how: 'source 可以是本地路径、网址、base64，或 qq:<消息id> 转发收到过的图',
      },
      {
        tools: ['qq_send_face'],
        when: '想发 QQ 自带的小黄脸，且表情包图库里没有更合适的时',
        how: 'face 可以是数字 id 或中文名（如「偷笑」）',
      },
      {
        tools: ['qq_recall_message'],
        when: '你说错话、发错人、或刚发出去就后悔了（2 分钟内）',
        how: '不传 message_id 就撤回你最近一条；只能撤回自己发的',
      },
      {
        tools: ['qq_repeat_message'],
        when: '对方让你「复读」「把那条转过来」，或你想原样转发一条带图的消息时',
        how: '会连图片和表情一起转',
      },
      {
        tools: ['qq_poke', 'qq_send_like'],
        when: '想戳一下对方、叫他注意你，或想给某人的名片点赞时',
        how: 'poke 是双击头像的效果；like 最多 10 次',
      },
    ],
  },
  {
    id: 'group-admin',
    title: '群管理（仅管理员私聊）',
    items: [
      {
        tools: ['qq_set_group_card'],
        when: '需要改自己或别人的群名片时',
        how: '仅管理员私聊可用；群聊里不要尝试，会被拒绝',
      },
      {
        tools: ['qq_group_ban'],
        when: '有人刷屏、骂人，需要禁言时',
        how: 'duration 单位秒，0 表示解除；仅管理员私聊可用',
      },
      {
        tools: ['qq_set_essence'],
        when: '某条消息值得设成群精华时',
        how: '仅管理员私聊可用',
      },
    ],
  },
  {
    id: 'qzone',
    title: 'QQ 空间',
    items: [
      {
        tools: ['qq_qzone_read'],
        when: '对方提到你发的说说、问你有没有看到他的动态、或你想看看别人最近发了什么时',
        how: '不传 uin 读自己的，传 uin 读别人的；能读到评论',
      },
      {
        tools: ['qq_qzone_publish', 'qq_qzone_post_now'],
        when: '你想发一条说说记录当下，或对方让你「发个动态」时',
        how: 'post_now 不给 text 就按你当前的生活状态自己写；publish 用于指定内容',
      },
      {
        tools: ['qq_qzone_comment'],
        when: '看到别人的说说想说点什么、或对方让你去评论时',
        how: '不传 feed_id 就评论最新一条；评论完会读回确认',
      },
      {
        tools: ['qq_qzone_autopost_status'],
        when: '对方问「你今天怎么没发动态」「定时发动态开着吗」时',
        how: '返回开关、今天的计划时间和最近的发布记录',
      },
      {
        tools: ['qq_qzone_leave_message'],
        when: '对方让你去他的空间留言板留言时',
        how: '当前 HTTP 版不支持留言板，会返回 unsupported —— 直接说做不到，不要假装留过了',
      },
    ],
  },
  {
    id: 'meme',
    title: '表情包',
    items: [
      {
        tools: ['qq_meme_search', 'qq_meme_send'],
        when: '想发表情、想表达一个说不清的情绪、或对方说了很好笑/很无语的话时',
        how: '先按情绪搜（「无语」「开心」「敷衍」），再发搜到的那个 id；搜不到才退回 qq_send_face',
      },
      {
        tools: ['qq_meme_collect'],
        when: '看到一张很适合当表情包的图，想收进自己的图库时',
        how: 'source 可以是本地路径、网址，或 qq:<消息id> 直接收刚收到的那张',
      },
    ],
  },
  {
    id: 'web',
    title: '联网查证',
    items: [
      {
        tools: ['qq_web_search'],
        when: '对方问新闻、最近发生的事、你不确定的事实，或需要核验一个说法时',
        how: '返回带链接的摘要；不要凭记忆编造，搜不到就说搜不到',
      },
      {
        tools: ['qq_web_extract'],
        when: '需要读某个网页的完整正文，而不只是搜索摘要时',
        how: '只支持公开 http/https 页面',
      },
      {
        tools: ['qq_web_batch'],
        when: '需要同时比较几件事、或一次收集多条线索时',
        how: '一次并行 1–5 个搜索',
      },
    ],
  },
  {
    id: 'life',
    title: '自己的生活',
    items: [
      {
        tools: ['qq_life_status'],
        when: '对方问你「在干嘛」「今天穿什么」「吃了什么」，或你想确认自己此刻的状态时',
        how: '输入里通常已经给了你的当前状态，需要细节时才调',
      },
      {
        tools: ['qq_life_generate'],
        when: '对方明确让你重新安排一周的生活，或你觉得当前的日程已经用太久了',
        how: '会调用模型生成一整周，比较慢；不要因为无聊就重新生成',
      },
    ],
  },
];

/**
 * Hard rules that apply to every capability.
 *
 * These are the failure modes actually observed, not hypotheticals:
 *   - claiming success without a receipt (uncertain reported as sent);
 *   - refusing to call a tool because the persona forbids tech words;
 *   - narrating tool names to the user ("我调用一下接口").
 */
export const CAPABILITY_RULES = [
  '用不用工具是你的自由，但**该用的时候直接用**，不要先解释「我去查一下」「让我调用」——查完再说话。',
  '工具是你的手，不是你的嘴：做完只用平常的话回应结果（「看到了」「换了啊」「查到了」），绝不说出工具名、接口、参数、模型、提示词这类词，也不要说「我调用了一下」。',
  '这条比人格里「不许提技术词汇」的要求更具体：**在幕后用工具不算违反它**，只有说出口才算。',
  '只有拿到明确回执（status=sent / 确认出现在列表里）才能说做成了。',
  '返回 uncertain、pending、unsupported 或报错时，就说没做成或不确定，不要编一个「没加载出来」之类的理由。',
  '做不到的事直接说做不到。不要假装做过，也不要编造一个技术上听起来合理的失败原因。',
  '对方没有要求、你也确实没有想做的事时，不要为了用工具而用工具。',
];

/**
 * Build the prompt text.
 *
 * `allowed` is the set of tool names the current session may actually call. On a
 * group or non-owner private chat that set is tiny (three tools), so listing all
 * seven groups would teach the model to try things that are guaranteed to fail.
 * Filtering by `allowed` keeps the guide honest about what THIS session can do.
 */
export function buildCapabilityGuide({ allowed = null, kind = 'private' } = {}) {
  const permitted = Array.isArray(allowed) ? new Set(allowed) : null;
  const groups = [];
  for (const group of CAPABILITY_GROUPS) {
    const items = group.items
      .map((item) => ({ ...item, tools: item.tools.filter((t) => !permitted || permitted.has(t)) }))
      .filter((item) => item.tools.length);
    if (items.length) groups.push({ ...group, items });
  }
  if (!groups.length) return '';

  const lines = ['你能做的事，以及什么时候该做：', ''];
  for (const group of groups) {
    lines.push(`【${group.title}】`);
    for (const item of group.items) {
      lines.push(`· ${item.when}`);
      lines.push(`  → ${item.tools.join(' / ')}：${item.how}`);
    }
    lines.push('');
  }
  lines.push('通用规则：');
  for (const rule of CAPABILITY_RULES) lines.push('- ' + rule);
  if (kind === 'group') {
    lines.push('');
    lines.push('现在是群聊：默认只做当前会话内的事，跨会话操作会被拒绝，不要尝试。');
  }
  return lines.join('\n');
}

/** Flat list of every tool the guide mentions, for drift checks in tests. */
export function guideToolNames() {
  const names = new Set();
  for (const group of CAPABILITY_GROUPS) for (const item of group.items) for (const t of item.tools) names.add(t);
  return [...names];
}