# 本地修复与增强记录


上游版本 **0.2.0**，本包在此之上累积了 local.1 – local.7 及后续若干版修复，全部在 DSH **0.2.1-rc.3** 实测通过。当前版本号见 `package.json`。

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


## 十三、0.4.1：让她能看到图片

此前图片在 `segmentsText()` 里被渲染成 `[图片]` 占位，模型只看到这个字符串，**从未接触过像素**。

### 26. 图片转成模型可见的 image content

rc.3 的图片内容格式是 `{ type: 'image', attachment: ref }`，ref 必须来自 attachment store：

```js
const attachments = ctx.get('attachments');
const ref = await attachments.saveImage({ data, mediaType, name });
```

处理链：

1. `normalizeEvent()` 收集 `image` 消息段（`url` / `file`，最多 4 张），随归档一起保存（只存引用，不存 base64）
2. 回复时 `imageParts()` 逐张取字节：
   - 有 `url` → 直接 fetch（15 秒超时、8 MiB 上限）
   - 只有 `file` → 先调 `get_image` 换出可访问地址
   - 本地绝对路径 → 直接读文件
3. `sniffImageType()` 用魔数判定 MIME（PNG/JPEG/GIF/WEBP）——attachment store 会校验声明类型与字节是否一致，猜错会直接拒绝
4. `saveImage()` 落盘得 ref，拼进 `createUserMessage({ content: [text, ...images] })`

失败一律静默降级：图片读不到就只发文本，不影响回复本身（错误写 `debug.log`）。

### 27. 开关

- `reply.vision`（默认 true）：关闭后不处理任何图片
- `reply.maxImages`（默认 4，上限 8）：单条消息最多解析几张

实测：

```
sniff PNG  : image/png
sniff JPEG : image/jpeg
sniff WEBP : image/webp
images     : [{"url":"","file":"C:/.../\_t.png"}]
text       : "[图片] 看这个"
```


## 十四、0.4.2：图片链路诊断

0.4.1 加了图片处理，但模型仍说「只收到占位符」，且 `debug.log` 没有 `QQ 图片读取失败`——
说明 `imageParts()` 在**静默返回空数组**，而不是抛错。

本版在图片流水线的每个断点写 `debug.log`：

| 阶段 | 含义 |
|---|---|
| `image no-sources` | 归档消息里没有 images（捕获层问题） |
| `image disabled` | `reply.vision` 被关闭 |
| `image attachments missing` | `ctx.get('attachments')` 拿不到服务（最可能） |
| `image bytes null` | 下载/读盘失败 |
| `image media unknown` | 魔数不认识 |
| `image error <msg>` | saveImage 抛错 |

下一步按日志定位真实断点，再决定是换服务名、改注入方式，还是改用其他图片通道。


## 十五、0.4.3：图片取字节的顺序错了

0.4.2 的诊断日志一针见血：

```
image attachments function    ← 服务正常
image bytes null              ← 卡在取字节
```

`imageBytes()` 原来的顺序是「先问 NapCat 要地址，再读本地」：

```js
if (!location && source.file) {
  try { const info = await this.client.call('get_image', { file: source.file }, signal); ... }
  catch { return null; }        // ← 本地路径也走这里，NapCat 直接报错，函数就退出了
}
```

当 `file` 是**本地绝对路径**时，NapCat 的 `get_image` 不认，抛错 → `return null` → 永远到不了后面的读盘分支。

修复：**本地路径优先直读**，失败才回落到 NapCat 解析：

```js
if (source.file && isLocalPath(source.file)) {
  try { return await readFileBytes(source.file); } catch { /* fall through */ }
}
```

同时 `url` 解析出来的结果也支持本地路径。


## 十六、0.4.4：QQ 表情看不见

排查发现 QQ 表情在 NapCat 里有三种完全不同的形态，原来的 `segmentsText()` 一律当成 `[图片]` 或 `[表情]`，语义全丢：

| 形态 | 实际结构 | 原来渲染 |
|---|---|---|
| QQ 小黄脸 | `image` + `sub_type: 7` + `summary: "[对]"` | `[图片]` |
| 表情包/贴图 | `image` + `sub_type: 1` + `summary: "[动画表情]"` | `[图片]` |
| 传统系统表情 | `face` + `id: "20"` + `raw.faceIndex` | `[表情]` |

### 28. 保留表情语义

- `image` 段有 `summary` → 直接用它：`[对]`、`[动画表情]`
- `face` 段优先用 `raw.faceText`，没有则按 id 映射到 130 个常用表情名（`20` → `[偷笑]`、`13` → `[呲牙]`）
- 未知 id 保留 `[表情 999]`，不瞎猜

### 29. 表情不再送进视觉模型

`images` 捕获逻辑原本只判断 `type === 'image'`，导致小黄脸和表情包也被下载、转 attachment、塞进多模态请求——既烧 token 又无意义。

现在 `isSticker()` 会排除 `summary` 非空或 `sub_type` 为 1/7 的 image 段：

```
小黄脸     | text: "[对]"        | images: 0
表情包     | text: "[动画表情]"   | images: 0
真实图片   | text: "[图片]"      | images: 1
图+表情    | text: "[图片][对]"   | images: 1
```

## 十七、附：图片能力真正的开关不在本插件

0.4.1–0.4.3 修好了图片管道（捕获 → 本地读取 → attachment ref），但模型仍看不到图。
真因是 **workbuddy provider 的 `imageModelIds` 为空**：

```js
withImageSelection(models, new Set(state.imageModelIds))  // 空集 → multimodal: false
  → toPiModel(): input = ["text"]                          // pi-ai 只声明文本
    → 发送前静默丢弃 image 块
```

修法：在 profile 的 `cordis.patch.yml` 里

```yaml
imageModelIds:
  - deepseek-v4.1-flash
```

改完实测可识别：红圆、蓝矩形、绿三角、`VISION-OK 7391`、`triangle below` 全部答对。

**教训**：管道通了不等于阀门开了。诊断日志（`image bytes 3759` / `image media image/png`）把问题从「插件坏了」精确定位到「provider 没声明多模态」。


## 十八、0.4.5：发图能力

此前插件只能发文本：`OneBotClient.send()` 只构造 `{type:'text'}` 段，模型手里没有任何发图路径，所以她只能说「我发不了图」。

### 30. 三种图片来源统一成 NapCat 可接受的形式

NapCat 的 `can_send_image` 返回 `yes`，且实测接受 `data:image/png;base64,...` 形式（`base64://` 也通）。

`resolveImageSource()` 统一处理：

| 输入 | 处理 |
|---|---|
| `data:image/...` | 原样透传 |
| `base64://...` | 原样透传 |
| `http(s)://...` | 交给 NapCat 自行拉取 |
| 本地绝对路径 / `file://` | 读盘 → 魔数判型 → 转 data URL（8 MiB 上限） |

### 31. 新工具 `qq_send_image`

参数：`kind` / `peer_id` / `source` / `caption`（可选）/ `mentions`（群聊 @）/ `request_id`。

- 走 `ActionLedger`，同 `request_id` 重试不会重复发图
- 归档文本为 `caption + " [图片]"`，保留会话可读性
- 计入 `sentSinceMark`，避免自动回复再补发一遍整段文本
- 已加入 `pluginToolNames` 白名单

实测：`sendImage` 返回 `{"message_id":1042577566}`，图片正常送达。


## 十九、0.4.6：发表情 + 转发图片

### 32. `qq_send_face` —— 发 QQ 系统表情

NapCat 的 `face` 段直接可用（实测 `{"message_id":159237494}`）。参数 `face` 接受两种写法：

- 数字 id：`"20"`
- 中文名：`"偷笑"` / `"[呲牙]"`（自动去方括号，走 `FACE_NAMES` 反查）

未知名字直接报错，不会瞎猜一个表情发出去。

### 33. `qq_send_image` 支持转发收到的图

`source` 新增 `qq:<messageId>`：从归档里找到那条入站消息的图片并重新发送。

实现时踩到一个坑：**直接把 QQ 的图片 URL 交给 NapCat 会被拒**（`retcode=200`），因为
`multimedia.nt.qq.com.cn` 的下载链接带短期 `rkey`，NapCat 侧拉不到。

所以改成：**自己先下载成字节，再转 data URL** 交给 NapCat。

```
step1 sent message_id= 510998784
history image msgId 510998784 | url? true
   fetch: 200
   bytes: 3759 | type: image/png      ← 新鲜 URL 正常
```

### 34. 已知限制：rkey 时效

QQ 图片 URL 带时效（通常数小时）。过期后再转发会失败：

```
download status: 400
cannot download; rkey likely expired
```

这不是实现缺陷，是 QQ 媒体链路本身的限制——过期图片连 QQ 客户端自己都拉不到。
需要长期保存图片的话，应该在收到时就把字节落盘（当前只存 URL 引用，省空间）。


## 二十、0.4.7：空间三件套（看 / 发 / 评论）

### 35. 发表说说 `qq_qzone_publish`

**关键发现：说说列表页 `/<uin>/311` 没有发表入口**，编辑器只在个人主页 `/<uin>` 上。原来按 `/311` 写的逻辑是错的。

真实 DOM（实测）：

```
#\$1_substitutor_content      ← "说点儿什么吧" 占位符，点击后激活编辑器
#\$1_content_content           ← 真正的 contenteditable
a.btn-post                     ← 发表按钮
```

提交后跳回列表页确认新说说出现（取正文前 20 字做 needle），拿到证据才返回 `sent`。

### 36. 评论说说 `qq_qzone_comment`

列表页每条 `li.feed` 内都有「我也说一句」占位符：

```
li.feed .textinput_default        ← 点击激活
li.feed [contenteditable][id$="_content_content"]
li.feed a.btn-post                ← 该 feed 自己的发表按钮
```

`feed_id` 留空 = 最新一条。确认方式是该 feed 的文本变化且包含评论内容。

**踩坑**：feed 列表在 frame 出现之后才异步注入，直接 `count()` 会得到 0。加了 20 秒轮询等待。

### 37. `qq_qzone_read` 说说页也修了

同样的懒加载问题：`read()` 原来只等 1.5 秒，说说列表还没渲染完就取文本，结果只拿到主框架。
现在针对 `section === 'shuoshuo'` 额外等待 `li.feed` 出现（最多 15 秒）。

### 实测结果

```
PUBLISH_RESULT {"status":"sent","confirmedBy":"new_shuoshuo_entry"}
COMMENT_RESULT {"status":"sent","confirmedBy":"new_comment_entry"}

feeds: 5                                    ← 原来 4 条
newest feed: dsh-qq-access 发表测试，稍后删除 10:10
             评论(1)
             汝拉山区的穷木匠 : 评论测试，稍后删除 10:11
```

三项（读 / 发 / 评论）全部真实通过，不是 dry-run。


## 二十一、0.4.8：空间操作默认后台运行

`qzone.headless` 默认值从 `false` 改为 `true`——读空间、发说说、评论都不再弹 Edge 窗口。

`qzone-login` 不受影响：`login()` 里硬编码 `#launch(false)`，扫码必须可见。

实测无头模式：

```
config qzone.headless = true
elapsed: 4.2s              ← 比有头更快
read ok: true | chars: 400
TA的说说 | 已严肃预购 | 前天13:03来自iPhone | 评论(2) ...
```

发表/评论同样验证：`COMMENT: {"status":"sent","confirmedBy":"new_comment_entry"}`。

需要看得到窗口时，把 `qzone.headless` 改回 `false` 即可（排查选择器时有用）。

### 38. 顺带修：读别人空间只拿到导航栏

两个叠加问题：

1. **等待不足**：别人的说说列表约 5 秒才渲染完，原来只等 1.5 秒
2. **maxChars 被导航栏吃光**：主框架导航文字就有 500+ 字符，`remaining` 用完后直接 `break`，内容框架根本没读

修复：

- 说说/主页额外等待 `li.feed` 数量**稳定**（连续两次计数不变），上限 25 秒
- 帧遍历顺序改为**先子框架（内容）后主框架（导航）**

效果对比：

```
修复前: frames=2 chars=501  首条: QQ空间 他的主页 他的动态...
修复后: frames=1 chars=900  首条: TA的说说 | 已严肃预购 | 前天13:03...
```

实测三个空间：主人 ✅（含评论点赞）、曹栩 ✅（37 赞 3 评论）、木木彡 ❌（对方设了访问权限，只能读到「设置了权限」提示）。


## 二十二、0.4.9：发表/评论的确认判据是假阳性

0.4.7 声称「发表成功」，实际**什么都没发出去**；评论也挂错了说说。根因是确认逻辑用文本判断。

### 39. 说说发表：跳转太早 + 文本判据

原逻辑：点发表 → 立刻跳列表页 → `body.includes(前20字)`。

两个错：

1. **跳转太早**：`emotion_cgi_publish_v6` 请求还没完成就导航走了，发表被中断
2. **文本判据恒真**：编辑框里的文字还在 DOM 里，`includes` 必然为真

现在：**留在原页**，等编辑器清空（发表已提交），再等 `div.f-item` 计数增加。

```
RESULT {"status":"sent","confirmedBy":"new_shuoshuo_entry","entriesBefore":7,"entriesAfter":8}
```

（首页说说容器是 `div.f-item`，不是列表页的 `li.feed`——这也是 before 恒为 0 的原因。）

### 40. 评论：选择器把工具栏当成了评论

原判据是「该 feed 文本变化且包含评论内容」——编辑器还在，文本必然包含，同样是假阳性。

换成计数后又踩第二坑：`.comments_list ul > li` 把**编辑器工具栏**（本地/相册/音乐/视频/附件…）也算进去了，
导致 `before: 0 → after: 9`、`9 → 18` 这种翻倍数字。

真实评论节点是 `li.comments_item`。修正后：

```
RESULT {"status":"sent","confirmedBy":"new_comment_entry","commentsBefore":2,"commentsAfter":3}
```

### 41. 基线必须在懒加载之后取

评论列表在点击「我也说一句」之后才渲染。原来在点击前取 `before`，恒为 0。
顺序改为：点占位符 → 等编辑器 → 取基线 → 输入 → 提交 → 对比。

### 42. `li.feed` 没有 id，`feed_id` 匹配失效

说说列表项没有 `id` 属性，`#shuoshuoItem(feedId)` 只能退化成文本匹配。目前
`feed_id` 传空（最新一条）是可靠的，传具体 id 需要先确认该空间是否给 feed 加了 id。


## 二十三、0.4.10：空间图片看不见 + 评论位置错误

### 43. 评论定位：`li.feed` 没有 id

每条说说真正的稳定标识是评论按钮的 id：

```html
<a id="comment_btn_<uin>_<feedId>_1" class="c_tx comment_btn">
```

`li.feed` 自身没有 id 属性，所以原来按 id 匹配永远失败，只能退化成"第一条"。
现在 `#shuoshuoItem()` 遍历 feed，比对 `comment_btn` 的 id 是否包含 `feedId`。

### 44. 空间图片：读到了但没送进模型

三个环节都有问题：

1. **`read()` 不返回图片** —— 只返回页面文本。现在额外收集 `li.feed` 内的真实配图 URL。
2. **过滤规则**：头像（`qlogo*.store.qq.com/qzone/`）、表情（`qzonestyle.gtimg.cn/qzone/em/`）、
   懒加载占位（`blank.gif`）全部排除，只留真正的说说配图。
3. **工具 render 把图片压成 JSON 文本** —— 这是最关键的：

```js
// 原来
render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
```

即使 execute 返回了 `content: [{type:'image', attachment}]`，也会被 `JSON.stringify` 成字符串，
模型只看到一串 JSON。现在 render 把 image 块原样透传：

```js
const attachments = value.content.filter(p => p?.type === 'image' && p.attachment);
return attachments.length ? [{ type: 'text', text: JSON.stringify(rest) }, ...attachments] : [text];
```

实测：自己的空间 4 条说说里只有 1 张真配图（856×1522），其余全是头像/表情/占位符——
所以 `imageCount: 1` 是正确结果，不是漏抓。


## 二十四、0.4.11：空间图片超时（不是 workbuddy 的问题）

先确认：`imageModelIds` 配置仍在，workbuddy 图像能力没退化。真正的报错在 `debug.log`：

```
QQ 空间图片读取失败 (TimeoutError): The operation was aborted due to timeout
```

### 45. 图片下载继承了快耗尽的工具信号

`urlImageParts(urls, exec.signal)` 里的下载用的是 `combinedSignal(signal, 15_000)`——
取的是**两者较短**。而 `qq_qzone_read` 是一次很长的调用（浏览器冷启动 + 页面加载 +
等待 feed 稳定最多 25 秒），走到下载这一步时 `exec.signal` 往往只剩几秒。

修复：图片下载改用**独立的 20 秒预算**，不再继承工具调用的剩余时间。下载是收尾动作，
和主流程的时限无关。

```js
const budget = AbortSignal.timeout(20_000);
const bytes = await this.imageBytes({ url, file: '' }, budget);
```

### 46. 失败原因可区分了

原来所有失败都只报一句「读取失败」。现在分三类：

| 日志 | 含义 |
|---|---|
| `QQ 空间图片下载为空` | 下载失败/超时，附 URL 前 80 字符 |
| `QQ 空间图片类型未知` | 魔数不认识（不是 PNG/JPEG/GIF/WEBP） |
| `QQ 空间图片读取失败` | attachment store 拒收或其他异常 |

### 端到端实测

```
urls from read(): 1
attached parts: 1
saved: [{"bytes":63138,"mediaType":"image/webp","name":"qzone-image"}]
```

图片 63KB、webp、成功转 attachment。


## 二十五、0.5.0：分段间隔可以自己调

### 47. 原来间隔是写死的

拆段发送的间隔原本由公式硬编码：

```js
interval = clamp(1000ms, 10000ms, 1000 + 字数 × 60)
```

想让她「快一点」或「更慢更像真人」都改不了，只能改代码重装。现在三个参数进了配置，左侧栏「回复节奏」卡片可以直接调：

| 配置项 | 含义 | 默认 | 范围 |
|---|---|---|---|
| `rate.segmentMinMs` | 相邻两条之间至少等多久 | 1000ms | 0–30000 |
| `rate.segmentMaxMs` | 再长也不超过这个上限 | 10000ms | 0–60000 |
| `rate.segmentPerCharMs` | 每条消息按字数追加的毫秒数 | 60ms | 0–500 |

面板用「秒」输入，保存时换算成毫秒；卡片底部会实时显示「好的」和一句长句分别要等几秒，避免调成看不出区别的数字。

### 48. 一个隐蔽的坑：调小到 1 秒会被 3 秒覆盖

`RateLimiter.wait()` 原本这样算同会话间隔：

```js
const peerGap = Math.max(this.peerGapMs, minPeerGapMs);  // peerGapMs 默认 3000
```

于是面板上填 1 秒，实际仍然是 3 秒——**设置看起来生效了，其实被静默吞掉**。这是最容易让人以为「面板是假的」的那类 bug。

改法不是把 `peerGapMs` 调小（那会让所有单条回复也变得急促），而是给 `send()` 增加显式的 `paceMs` 参数：

```js
// 只有多段回复的后续段传节奏，单条消息仍走默认的 peerGapMs
await this.send(..., index === 0 ? 0 : segmentGapMs(text, this.config.rate));
```

`wait()` 里 `paceMs > 0` 时直接用它替代 `peerGapMs`，但 `globalGapMs`（默认 1 秒）和每分钟配额仍然是硬下限，所以调成 0.3 秒也会被兜到 1 秒。

### 49. 实测

真实 `RateLimiter` + 真实 `splitSegments`，文本「好的，那就这么定了，晚点我再找你，记得吃饭」拆成 4 段：

```
#0 "好的"          pace=0ms      actual=0ms
#1 "那就这么定了"   pace=1360ms   actual=1361ms
#2 "晚点我再找你"   pace=1360ms   actual=1365ms
#3 "记得吃饭"       pace=1240ms   actual=1246ms
```

换不同档位（同一套代码）：

| 设置 | 实际间隔 |
|---|---|
| 最小 1 秒（低于默认 3 秒） | 1066 / 1074ms，不再被抬到 3 秒 |
| 最小 2 秒 | 2002 / 2008ms |
| 最小 0.3 秒 | 1015 / 1014ms，被全局 1 秒兜底 |
| 最小 6 秒 | 6016 / 6013ms |

### 50. 改动文件

| 文件 | 改动 |
|---|---|
| `lib/config.mjs` | 新增 `rate.segmentMinMs` / `segmentMaxMs` / `segmentPerCharMs` |
| `lib/runtime.mjs` | `segmentGapMs(text, settings)` 读配置；`send()` 增加 `paceMs` |
| `lib/util.mjs` | `RateLimiter.wait()` 第三参数改为显式节奏，优先于 `peerGapMs` |
| `lib/ui.mjs` | `rate` 加入 PATCHABLE 与状态返回，保存后热更新 |
| `lib/client.js` | 「回复节奏」卡片新增三个输入框 + 实时效果预览 |

改完保存即时生效，不需要重载插件（`runtime.config.rate` 在每次发送时读取）。


### 51. 0.5.0：改「全局间隔 / 同会话间隔」也要即时生效

`RateLimiter` 在构造时把 `globalGapMs` / `peerGapMs` / `maxPerMinute` 拷成实例字段，热更新只替换 `runtime.config.rate` 不会影响已经建好的限流器——改这两项会「显示保存成功但行为不变」。现在保存时同步刷新实例字段。

另外 `CHANGES-LOCAL.md` 曾被 pnpm 按「同版本号」缓存，出现过 `lib/` 已是新版、说明文档仍是旧版的情况。**判断是否真的装上，请以 `lib/` 内的代码或面板上的新控件为准，不要只看版本号。**

## 安装

```powershell
dsh plugin --profile desktop add <本 tgz 完整路径>
```

装完重启 DSH，左侧栏出现「QQ 接入」。首次使用仍需 `node cli.mjs setup` 生成配置。
