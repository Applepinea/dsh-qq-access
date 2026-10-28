import { allowConversation } from './config.mjs';
import { assert, qqId } from './util.mjs';

export const pluginToolNames = [
  'qq_status', 'qq_list_contacts', 'qq_list_conversations', 'qq_read_history',
  'qq_search_messages', 'qq_send_message', 'qq_recall_message', 'qq_group_member_info', 'qq_send_image', 'qq_send_face', 'qq_qzone_read', 'qq_qzone_leave_message', 'qq_qzone_publish', 'qq_qzone_comment',
];

// The map is populated from transport identity, never from model arguments.
export class AccessControl {
  #agents = new WeakMap();
  constructor(config) { this.config = config; }
  bind(agent, record) { this.#agents.set(agent, Object.freeze({ ...record })); }
  context(agent) { return agent ? this.#agents.get(agent) : undefined; }
  isOwner(context) { return context?.kind === 'private' && this.config.ownerIds.includes(context.peerId); }
  guard(exec) {
    const origin = this.context(exec.agent);
    if (!origin) return undefined; // Local Harness sessions remain operator-controlled.
    // Reading own history and recalling own messages are safe for any QQ origin:
    // the recall tool re-checks direction/sender/age and access.target() pins the conversation.
    if (['qq_status', 'qq_read_history', 'qq_recall_message'].includes(exec.name)) return undefined;
    if (this.isOwner(origin) && pluginToolNames.includes(exec.name)) return undefined;
    if (this.isOwner(origin) && this.config.ownerHarnessTools) return undefined;
    return 'QQ 会话只允许读取本会话历史。跨会话操作请在本机 Harness 或配置的管理员私聊中执行。';
  }
  target(args, agent, { management = false } = {}) {
    const origin = this.context(agent);
    assert(args.kind === 'private' || args.kind === 'group', 'kind 必须为 private 或 group');
    const peerId = qqId(args.peer_id);
    if (origin && !this.isOwner(origin)) assert(!management && origin.kind === args.kind && origin.peerId === peerId, '禁止读取或操作其他会话');
    assert(allowConversation(this.config, args.kind, peerId, args.kind === 'private' ? peerId : ''), '该会话被访问配置禁用');
    return { kind: args.kind, peerId };
  }
  requireManager(agent) {
    const origin = this.context(agent);
    assert(!origin || this.isOwner(origin), '此工具仅限本机 Harness 和管理员私聊使用');
  }
}
