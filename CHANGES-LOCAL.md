# dsh-qq-access 0.4.0 — 本地修复与增强


上游版本 **0.2.0**，本包为累积补丁后的 **0.4.0** 版本（前序内部代号 local.1 – local.7），全部在 DSH **0.2.1-rc.3** 实测通过。

> 演进脉络：local.1 修「能不能跑」→ local.2 修「跑得对不对」→ local.3 补「交互能力」→ local.4–7 修群聊 @ / 群昵称 / 撤回。

## 一、致命缺陷（0.2.0 无法正常使用）

### 1. 自动回复完全不工作

三处叠加，任一都会导致「会话建了、零事件、`whenIdle()` 挂住」：

| 位置 | 问题 | 修复 |
|---|---|---|
| `lib/runtime.mjs` | 未配置 `model` 段时不传 `agentOptions` → agent 无模型 | 回落 `ctx.get('agentDefaultModel').currentSelection()` |
| `lib/runtime.mjs` | 读 `session.events`（数组），rc.3 只有 `seq`/`eventAt()` | 新增 `sessionEventList()` 兼容两种形状 |
| `lib/util.mjs` | `safeLog` 只写宿主 logger，Desktop 版看不到 | 追加写 `~/.dsh-qq-access/debug.log` |

### 2. 异常退出后永久无法启动

`acquireLock()` 只检查锁文件存在，不校验 pid。强杀 DSH 后 `runtime.lock` 残留 → 永久报「数据目录已被使用」。
现在读锁内 pid 并 `process.kill(pid, 0)` 探活：已死则接管重建，存活仍拒绝。

### 3. 重载时 dispose 卡死 → 「inactive context」

旧 dispose 顺序 `runtime.stop() → manager.stop() → background`，任一步挂起（等待 NapCat 登录最长 10 分钟）就让 fiber 判为 inactive，
而事件服务仍在监听 → 能收消息、回复时报 `cannot get required service "agents" in inactive context`。
现在每步独立、8 秒超时、失败写 `debug.log`。

## 二、回复质量

### 4. 一条入站回多条重复

管理员在 `ownerIds` 中时 agent 会拿到插件工具，可能在回合内自行 `qq_send_message` 分条发送，插件收尾又发一遍整段。
新增 `sentSinceMark` 计数：回合内已自行发送则跳过补发。

### 5. 换行与逗号内容合并成一条

`splitSegments()` 按**换行 + 中文逗号 + 英文逗号**拆成独立消息，空段丢弃，单段超 `reply.maxChars` 截断，最多 8 段。
`1,000` 这类数字中的逗号自动保护。

### 6. 多条消息同时涌出

`segmentGapMs(text)`：`间隔 = clamp(1000ms, 10000ms, 1000 + 字数 × 60)`。
2 字 ≈ 1.12s，17 字 ≈ 2.02s，160 字以上封顶 10s。`rate.peerGapMs` 退为下限（1000）。

### 7. 每条消息都立刻回复 → 批量回复

入站只进 `pending` 缓冲，每 60 秒统一处理一次，一轮回复覆盖整批（其余消息经 `recent_messages` 进入模型）。
`qq_status` 新增 `queuedReplies` / `pendingConversations` / `batchWindowMs`。

### 8. 重载丢失待回复消息 → 从归档自愈

`restorePending()` 每轮回复前，从归档找出「最后一条入站晚于最后一条出站」的会话并恢复，窗口 10 分钟，遵守回复策略。
**归档是唯一真相，跨重载自愈。**

## 三、消息补漏

### 9. 60 秒轮询兜底

每个周期调用 `get_recent_contact` + `get_friend_msg_history` / `get_group_msg_history`，把推送漏掉的消息补进归档。

- 与推送不冲突：`store.append()` 按 `senderId+kind+peerId+direction+messageId` 去重
- 超过 5 分钟的历史消息只归档不回复（`silent`），避免宕机后「诈尸」
- NapCat 缺该接口时自动跳过，只轮询已归档会话

### 10. 面板可调轮询 / 批量窗口

`armPollTimer()` 支持配置变更时重建定时器，**无需重载**。

## 四、QQ 空间

### 11. 留言无法发表

当前 Qzone 默认折叠编辑区，必须先点 `#btnWantPost`（「我要留言」），`veditor1_Iframe` 才出现。
原实现直接找 iframe 必然失败。现补展开步骤 + `textarea#maskEditor` 兜底。

### 12. 留言板读不到内容

- 懒加载竞态：`#open(guestbook)` 后等 1.5s，单帧失败重试一次
- `itemCount()` 缓存旧 frame 引用（提交后 iframe 重建即失效）→ 每次重新解析
- 提交后列表需重新加载才刷新 → 增加 `page.reload()` 复核

> 已知限制：能成功发表，但确认逻辑仍可能返回 `status: "uncertain"`（保守的假阴性）。
> `ActionLedger` 按 `request_id` 去重，重试不会重复发送；看到 `uncertain` 请人工核对，**不要换新 id 重发**。

### 13. 版本闸门

`engines.dsh` 由 `>=0.2.1-rc.4` 放宽为 `>=0.2.1-rc.3`。已用插件自带契约测试在 rc.3 验证：
8 个工具 schema、`createUserMessage`、`agents.create`/`followup`/`whenIdle`、`tools.guard` 全部满足。
**不再需要 profile 级 `compatibility.json` 豁免。**

## 五、Web 管理面板（新增）

`lib/client.js`（客户端）+ `lib/ui.mjs`（宿主路由）。左侧栏「QQ 接入」入口，另在「设置」下注册同一面板作为兜底。

1. **自动回复**：私聊总开关、群聊 off / mention / all
2. **回复节奏**：批量窗口 15–3600 秒、轮询补漏开关（即时生效）
3. **回复范围**：私聊 all / allowlist / disabled + 白名单；群消息三档；管理员 QQ
4. **NapCat**：托管模式、WebUI 端口、一键打开登录页
5. **人格设定**：persona 直接编辑
6. **状态**：在线徽标、昵称、账号、NapCat 版本与状态、归档保留天数

面板容器支持鼠标滚轮（`overflow-y:auto` + `min-height:0` + `overscroll-behavior:contain`）。

| 路由 | 方法 | 作用 |
|---|---|---|
| `/dsh-qq/api/state` | GET | 连接状态 + NapCat 状态 + 当前配置 |
| `/dsh-qq/api/config` | POST | 白名单合并 → `normalizeConfig` 校验 → 写盘 → 热更新 |
| `/dsh-qq/api/napcat/open` | POST | 打开 NapCat 登录页 |

热更新范围：`reply` / `access` / `persona` / `ownerIds` / `retentionDays` / `poll` /
`napcat.autoOpenLogin` / `autoInstall` / `maxRestarts`。`napcat.mode`、`napcat.webuiPort` 需重载（界面会提示）。

## 六、交互能力（local.3 新增）

### 14. 群聊 @ 成员

`qq_send_message` 新增 `mentions` 参数（QQ 号字符串数组，`["all"]` 表示 @全体，最多 10 个）。
发送时拼成 OneBot 消息段 `[{type:'at',data:{qq}},{type:'text',data:{text}}]`；非群聊传 `mentions` 直接报错。

### 15. 读取引用内容

`normalizeEvent()` 提取 `reply` 段的 `data.id` 为 `replyId`；`accept()` 归档前调用 `get_msg` 还原被引用消息：

```
[引用 昵称：原消息文本]
本人的回复内容
```

结构化信息同时存入归档字段 `quoted: { messageId, senderId, nickname, text }`。
`get_msg` 不可用或超时（8 秒）时静默降级为原有 `[引用消息]` 占位，不影响入库。

### 16. 撤回消息

新增工具 `qq_recall_message`，参数 `kind` / `peer_id` / `message_id` / `request_id`，底层调用 OneBot `delete_msg`。
走 `ActionLedger`，同一 `request_id` 重试不会重复撤回。仅管理员私聊与本机 Harness 可用（已加入 `pluginToolNames`）。

### 17. 读取自己昵称

`verifyIdentity()` 的返回值此前被丢弃，现在存为 `runtime.identity`：`qq_status` 返回 `nickname`，面板标题显示「昵称（QQ号）」。

## 七、重要：node_modules 会被重置

local.1 曾以 tgz 形式装进 profile，锁文件指向该 tgz。此后任何 `pnpm install`
（安装其它插件、重载）都会把 `node_modules/dsh-qq-access` 重新解包回 local.1，
**直接改 node_modules 的补丁会全部丢失**。升级必须打包新 tgz 并让 profile 依赖指向新包：

```powershell
dsh plugin --profile desktop add <新 tgz 完整路径>
```

## 八、已知限制

- `qq_qzone_leave_message` 成功确认偏保守（见 §12）
- QQ 空间登录态为冻结的持久 cookie，`skey` 服务端通常数小时到一天失效，需重跑 `qzone-login`
- 轮询只能看到「最近会话 + 最近 N 条」；长时间离线且会话已滑出列表的消息无法补回
- 面板文案为中文硬编码，未接入 Client locale 服务
- 未包含上游 `tests/`（tgz 的 `files` 字段本就不含）

## 九、local.4：群聊 @、撤回与群昵称的真实原因

### 18. 群聊里 @ 不出来的真因

现场证据（归档原文）：

```
00:22:32 out g713169862 :: [CQ:at
00:22:35 out g713169862 :: qq=2413392188] 最后一次了啊…
```

链条是：群聊里 `trusted=false` → 工具被限制为 `qq_status`/`qq_read_history` → **模型没有发送工具** →
它把 `[CQ:at,qq=...]` 当普通文本写出来 → local.2 的「按逗号拆段」又把 CQ 码从中间切断 →
既没 @ 成功，还变成两条半截消息。

三处修复：

1. **插件侧自动 @**：群聊回复的第一条自动带上 `{type:'at'}` 指向发送者（`reply.mentionSender`，默认 true）
2. **CQ 码透传**：`send()` 检测文本里的 `[CQ:at,qq=X]` → 提取为真实 at 段并从正文剥离；`all` 同样支持
3. **拆段保护**：`splitSegments()` 先把 `[CQ:...]` 整段占位保护，再按逗号/换行切，最后还原

### 19. 读不到自己的群昵称

群名片是**每个群独立**的，`get_login_info` 只给全局昵称。现在：

- 群聊回合的模型输入新增 `you: { qq, nickname, group_card }`，群名片通过 `get_group_member_info` 实时获取
- 新增工具 `qq_group_member_info`（`group_id` 必填、`user_id` 留空表示自己），返回 `card`/`nickname`/`role`

### 20. 撤回的适用范围（设计如此，非缺陷）

QQ 只能撤回**自己发的**消息，且仅限一定时限。插件里：

- 本机 Harness 会话、管理员**私聊**：可用 `qq_recall_message`
- **群聊**：仍按普通群成员处理（上游安全模型：管理员权限只认私聊身份），所以群里问「撤回」会得到「没有这个功能」

这是刻意保留的边界，不是 bug。需要在群里撤回时，改从与机器人的私聊或 Harness 里发起。


## 十、local.5：让她知道自己有什么能力

local.4 修好了机制，但群里她仍会说「我手上没有 @ 和撤回的接口」——因为**没人告诉过她**这些能力由接入层代劳。

### 21. 群聊能力说明注入

群聊回合的系统提示新增 `GROUP_CAPABILITIES`：

1. 第一条回复自动 @ 提问者（无需她操作）
2. @ 其他人：正文里写 `[CQ:at,qq=QQ号]`，`all` 表示全体；接入层转成真实 @ 并从正文移除
3. 群里确实没有发送/撤回/成员查询工具（安全限制），**不要声称能撤回**
4. 群名片通过 `you.group_card` 自动提供，直接当自己的名字用

这解决的是「能力存在但模型不知道」的最后一米：模型不会主动使用未声明的能力，只会说「我没有」。


## 十一、local.6：群内可撤回自己的消息

local.5 把「群内不能撤回」写进了提示词，但这条限制过严——QQ 允许成员撤回**自己发的**消息。

### 22. 撤回按「归属」而不是按「场景」限制

原先的判定是「群聊 = 没有撤回工具」。现在改为**按消息归属授权**：

- 群聊会话的工具白名单加入 `qq_recall_message`
- 工具执行前用 `runtime.findOwnMessage(kind, peerId, messageId)` 在归档里核对：
  - 必须是 `direction === 'out'`
  - 必须是 `senderId === selfId`
  - 必须在本会话内
- 额外校验 2 分钟窗口（超过则明确报出已发出多少秒）

因此：群里任何人都能让她撤回**她自己刚发的**消息，但无法让她撤回别人的消息；`access.target()` 仍会拦住跨会话请求。

### 23. 提示词同步

群聊能力说明第 3 条改为：

> 群聊中没有发送和成员查询工具；但你可以用 qq_recall_message 撤回【你自己刚发的】消息（2 分钟内），不能撤回别人的消息。


## 十二、local.7：群内撤回为什么还是不生效

local.6 改了工具内部规则，但**调用根本到不了工具**。两处真因：

### 24. `access.guard()` 在工具执行前就拒绝了

```js
if (['qq_status', 'qq_read_history'].includes(exec.name)) return undefined;
if (this.isOwner(origin) && ...) return undefined;
return 'QQ 会话只允许读取本会话历史…';   // ← qq_recall_message 落到这里
```

`restrict()` 只是在工具清单里暴露，`guard()` 才是总闸。现在把 `qq_recall_message` 加入放行名单——
安全性由工具自身保证（归属/会话/时限三重校验），门卫不必再逐把钥匙核对。

### 25. 她拿不到自己的 message_id

自动回复走内部 `send()`，返回的 `messageId` 从未告知模型。让她「撤回刚才那条」时，她没有 id 可用。

`message_id` 因此改为**可选**：

- 省略 → `findLatestOwnMessage(kind, peerId, 120)` 取本会话最近一条自己发的消息
- 显式传入 → 仍做归属与时限校验

提示词同步说明「不需要自己去查 id」。

实测（真实归档）：

```
qq_status          => ALLOWED
qq_read_history    => ALLOWED
qq_recall_message  => ALLOWED
qq_send_message    => 拒绝（跨会话/发送仍受限）
latest own within 120s => 1194229523 (age=63s)
```


## 安装

```powershell
dsh plugin --profile desktop add <本 tgz 完整路径>
```

装完重启 DSH，左侧栏出现「QQ 接入」。首次使用仍需 `node cli.mjs setup` 生成配置。
