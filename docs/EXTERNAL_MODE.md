> 本文为 **external 外部 NapCat 模式**的配置参考。Windows 托管安装请看 [新版安装说明](../README.md)。

# dsh-qq-access

把个人 QQ 的消息通道和 QQ 空间留言板接入 DeepSeek Harness。

**这是可安装的首版实现，不是已经在你的账号上启用的服务。** 消息通道使用本机 NapCat / OneBot v11，QQ 空间使用 Playwright 控制独立登录的浏览器。没有修改腾讯或 DeepSeek 官方插件，也不需要重新填写 DeepSeek API Key，聊天模型沿用 Harness 的模型配置。

## 能做什么

| 功能 | 实现范围 |
| --- | --- |
| 接收私聊、群聊 | 默认接收当前登录账号的全部可上报消息，可切换白名单或禁用 |
| 私聊聊天 | 默认自动回复；每个私聊有独立 Agent |
| 群聊聊天 | 默认被 @ 才回复；其他群消息仍在本地归档，可参与下次回复的上下文 |
| 主动发消息 | 在本机 Harness 指定对方 QQ 号或群号发送纯文本 |
| 好友、群列表 | 支持分页查询；受访问配置限制 |
| 聊天历史 | 查询本地归档，或调用 NapCat 的私聊／群聊历史接口，支持 QQ 序号分页 |
| 关键词搜索 | 搜索一个指定会话的本地归档 |
| QQ 空间访问 | 读取首页、说说页、留言板当前加载的可见文字 |
| QQ 空间留言 | 在目标空间的**留言板**发表纯文本留言，并核对返回结果 |

“全部”指这个账号实际有权访问、NapCat 能上报或返回的数据。插件无法读取账号未加入的群、无权限空间、已删除消息，不能保证恢复安装前全部历史。图片、语音、视频和文件目前保存为类型占位文字，不含识图、语音转文字或附件下载。空间功能不含说说评论、发说说、相册导出和隐私权限绕过。

NapCat 是非官方个人号接入方式，QQ 更新、账号限制和登录状态会影响可用性。空间页面的选择器需要在你的账号上验证；首次使用请先在自己或同意测试的好友空间验证一条留言。

## 环境

- Windows 10/11，或可运行 NapCat 与浏览器的 Linux。
- Node.js **22.14+**，建议 Node.js 24 LTS。
- DeepSeek Harness：参考 **0.2.1-rc.4** 的插件接口，需要 `agents.create`、`tools.guard`、scoped `tools.restrict`、canonical tool output 和双参数 Agent setup。旧版应先升级。
- NapCat 登录你准备交给助手使用的 QQ 账号，并开启本机 HTTP 服务与 HTTP 客户端上报。
- Windows 默认使用已安装的 Microsoft Edge；也可安装 Playwright Chromium。

该版本已做本地自动测试和公开宿主包的接口契约检查；未在真实 Harness 桌面进程、真实 QQ 账号或真实空间上验收。详细结果见 [验证说明](VALIDATION.md)。

## Windows 安装步骤

### 1. 解压并生成配置

解压整个源码文件夹，用 PowerShell 进入 `dsh-qq-access`：

```powershell
npm ci
node cli.mjs setup
```

输入要登录 NapCat 的 QQ 号。第二项可填写**另一个** QQ 号作为管理员，留空则仅在电脑上的 Harness 管理。插件会忽略登录账号自身的出站消息，避免自动回复循环，所以不要把登录号同时设成管理员。

默认配置在 `%USERPROFILE%\.dsh-qq-access\config.json`。生成器不会覆盖已有文件。自定义路径可通过 `node cli.mjs setup --config C:/your-path/config.json` 设置；使用自定义路径时，在 Harness 插件行的 `config.configPath` 填入同一绝对路径。默认路径通常不需要任何环境变量。

### 2. 配置 NapCat

按照 [NapCat 官方文档](https://napneko.github.io/guide/napcat) 安装、启动并登录步骤 1 的 QQ 号。在 NapCat WebUI 的网络配置中新增两项：

| NapCat 项目 | 填写值 |
| --- | --- |
| HTTP 服务端：启用 | 是 |
| HTTP 服务端：Host | `127.0.0.1` |
| HTTP 服务端：Port | `3000` |
| HTTP 服务端：Token | `setup` 输出的 API token，即 `config.onebot.token` |
| HTTP 客户端：启用 | 是 |
| HTTP 客户端：URL | `http://127.0.0.1:5701/onebot` |
| HTTP 客户端：Token | `setup` 输出的事件签名值，即 `config.events.secret` |
| 消息格式 | `array` |
| 上报自身消息 | 关闭 |

**注意：NapCat HTTP 客户端界面的字段名也是 `token`。** 它用这个值生成 `X-Signature: sha1=...`。本插件把它命名为 `events.secret` 以区分 API token；不要在 NapCat JSON 里额外添加一个 `secret` 字段。

[NapCat 网络配置示例](../examples/napcat-network.example.json) 只展示需要新增的网络项；保留你的其他网络设置，不要覆盖整个现有配置。

检查连接：

```powershell
node cli.mjs doctor
```

预期 `qqIdentity.userId` 等于登录号，`get_status`、`get_friend_list`、`get_group_list` 为 `ok: true`。`doctor` 不发送消息、不发表留言。此时 Harness 未启动，NapCat 上报连接失败属于正常情况。

### 3. 登录 QQ 空间

```powershell
node cli.mjs qzone-login
```

在弹出的浏览器中扫码登录相同 QQ 号，回到终端按回车。程序核对登录账号后会关闭窗口，保存独立登录状态。不要直接关闭浏览器后才按回车。

Windows 使用 Edge；若没有 Edge，编辑配置将 `qzone.channel` 设为 `""`，然后：

```powershell
npx playwright install chromium
node cli.mjs qzone-login
```

登录态失效时重新运行登录命令。该目录独立于日常浏览器，不会读取你的默认 Edge/Chrome 用户目录。同一空间浏览器目录同一时刻只能被一个进程使用；关闭登录窗口后再调用空间工具。

### 4. 安装到 Harness

Release 页提供 `dsh-qq-access.tgz`，也可以从源码运行 `npm pack` 自行生成。

**Harness 桌面版**：打开插件管理页面，使用本地包／安装来源功能，选择或填入 `.tgz` 的完整路径，例如 `C:/Plugins/dsh-qq-access.tgz`。不同桌面版本的入口文字可能不同。若当前版本没有本地包入口，应先升级，或使用下面独立的 Web profile。不要手动覆盖桌面版核心包。

**Harness CLI / Web profile**：在已可运行 `dsh` 的终端中：

```powershell
dsh plugin --profile web add C:/Plugins/dsh-qq-access.tgz
dsh web
```

`web` 是此示例的 profile，需与实际启动的 profile 一致。桌面 profile 由桌面应用管理，部分版本会拒绝通过外部 CLI 安装到 `desktop`。核心 DSH 包由宿主提供，本插件不会把这些包放入 runtime dependencies，也不需要在源码目录安装整套 Harness。

启动插件后，访问 `http://127.0.0.1:5701/healthz` 应得到 `{"status":"ok"}`。在 Harness 中询问“查看 QQ 接入状态”，应调用 `qq_status`。随后用另一个 QQ 号发私聊、或在群里 @ 登录号，检查回复。

### 5. 在 Harness 中使用

可以直接用中文提出请求，例如：

- “列出我所有群，分多页读完。”
- “读取群 123456789 最近 30 条消息，先用本地归档。”
- “从 QQ 查询好友 234567890 最近 50 条消息，告诉我历史是否可能不完整。”
- “搜索群 123456789 里提到‘作业’的归档记录。”
- “给 QQ 234567890 发：今天晚上八点见。”
- “读取 QQ 234567890 的空间留言板。”
- “在 QQ 234567890 的空间留言板留言：周末快乐！”

发送和留言工具要求 `request_id`。模型应为新操作生成一个唯一值（如 UUID），重复调用同一操作时复用，不能换一个新值盲目重试。只有回执 `status: sent` 才能说成功；`pending` 或 `uncertain` 应先查看 QQ／空间实际结果。

## 修改行为

编辑 `config.json` 后重载插件或重启运行它的 Harness profile。

| 配置项 | 默认值 | 用途 |
| --- | --- | --- |
| `access.privateMode` / `access.groupMode` | `all` | `all` 全部、`allowlist` 白名单、`disabled` 禁用 |
| `access.privateIds` / `access.groupIds` | `[]` | 白名单中的 QQ 号／群号，均使用字符串 |
| `access.blockedUsers` / `access.blockedGroups` | `[]` | 排除指定发送者或群 |
| `reply.private` | `true` | 私聊自动回复 |
| `reply.group` | `mention` | `off` 仅归档、`mention` 被 @ 回复、`all` 每条都回复 |
| `reply.contextMessages` | `20` | 每次最多补充的近期消息条数 |
| `reply.maxChars` | `2000` | 自动回复最长字符数 |
| `retentionDays` | `30` | 本插件消息归档保留天数 |
| `ownerIds` | `[]` | 可在管理员私聊中调用 QQ 管理工具的账号 |
| `ownerHarnessTools` | `false` | 是否进一步向管理员私聊开放宿主其他工具 |
| `persona` | 中文简洁 AI 助手 | 聊天设定，可写性格、称呼、语气、回复习惯 |
| `model.provider` / `model.model` | 留空 | 留空继承宿主模型路由，或指定已在 Harness 配好的路由 |
| `qzone.enabled` | `true` | 是否启用空间工具 |
| `qzone.channel` | Windows 为 `msedge` | 留空使用 Playwright Chromium |
| `qzone.headless` | `false` | 显示空间操作浏览器，便于观察权限／验证码问题 |

`reply.group: "all"` 会对每条可接收群消息调用模型，可能很快消耗额度。默认全账号读取不等于把全部历史同时塞入模型上下文：普通未触发的群消息先留在本地。

普通 QQ 联系人只能触发本会话聊天和查询本会话历史，不能操作文件、终端、其他私聊或 QQ 空间。管理员权限只认传输层识别的**私聊 QQ 号**，群里同一个人也按普通群成员处理。本机 Harness 操作者可以调用全部 QQ 插件工具。`ownerHarnessTools` 默认关闭；开启意味着管理员私聊也能操作 Harness 原本拥有的其他能力。

收集的聊天内容在被用于回复或你主动查询时，会进入 Harness 配置的模型服务。`retentionDays` 只清理本插件的 `data/messages/`，不清理 Harness 自己保存的会话、模型服务记录、空间登录状态或发送回执。旧配置已写入的数据不会因新增屏蔽项自动删除。

## 空间页面适配

本版默认使用 QQ 空间留言板的 `tgb` 框架、`veditor1_Iframe` 编辑框和 `#btnPostMsg` 按钮；这些是现有页面结构的适配基线，**没有承诺所有账号、所有 QQ 空间皮肤都相同**。如果页面改版，可在本机开发者工具中检查后修改 `qzone.guestbookFrame`、`editorFrame`、`submitSelector`、`itemSelector`。

页面不符合结构时，插件会停止留言并给出错误。点击发表后没有明确添加接口成功响应、也没有检测到新增留言时，只返回 `uncertain`。遇到验证码、访问申请或禁止留言，请在浏览器中自行处理；插件不尝试绕过。

## 排查

| 现象 | 检查项 |
| --- | --- |
| `doctor` 连不上 | NapCat 是否已登录，HTTP 服务端是否启用，端口是否为 3000 |
| HTTP 401 | HTTP 服务端 token 与 `onebot.token` 是否一致 |
| 上报返回 401 | HTTP 客户端 token 与 `events.secret` 是否一致，消息格式是否为 array |
| 群里不回复 | 默认需要 @；检查群或发送者是否被禁用、模型是否可用 |
| 刚安装看不到旧记录 | 本地归档从运行后开始；读取旧记录用 `source=qq`，其完整性受 QQ 限制 |
| `tools.guard` / `tools.restrict` 不兼容 | 更新 Harness；本版接口参考 0.2.1-rc.4 |
| `ERR_MODULE_NOT_FOUND` 指向 DSH 包 | 确认安装到了正在运行的 profile；使用 `.tgz` 安装，核心 DSH 依赖应由宿主提供 |
| 空间登录错误 | 使用相同登录号重跑 `qzone-login`，关闭旧窗口 |
| 空间找不到编辑框 | 先用浏览器打开对应留言板，核对权限与页面选择器 |
| `runtime.lock` 已存在 | 先确认没有另一个运行实例；若上次崩溃，确认进程已关闭后再手动删除提示的锁文件 |
| 队列满 | 本条仍归档，自动回复被跳过；`qq_status.skippedReplies` 可查看次数 |
| 回执 `pending/uncertain` | 先手动核对 QQ／空间，不要直接换 request_id 重发 |

## 开发和测试

```powershell
npm ci
npm run check
npm test
npm run test:browser
```

浏览器测试使用本地构造的空间页面和网络响应，不登录任何真实账号。没有 Chromium 时明确跳过；安装浏览器后再运行，或设置 `QQ_TEST_BROWSER_PATH` 指向测试浏览器可执行文件。

`npm run test:contracts` 是可选的宿主契约检查，需另装 `@deepseek-ai/dsh-tools@0.2.1-rc.4`、`@deepseek-ai/dsh-llm@0.2.1-rc.4` 及其运行依赖到测试环境。它验证公开包的 JSON Schema 和消息格式，不等同于真实 Harness 安装验收。

源文件均为 `.mjs`，无需 TypeScript 编译。包内无账号凭据、聊天记录或浏览器登录状态。发送回执保留最近 10000 个操作标识；此窗口外复用旧标识不保证去重。进程重启后不会自动补发崩溃前未完成的自动回复，但已持久化的入站消息不会重复归档。

接口依据见 [来源说明](SOURCES.md)。许可证为 MIT。
