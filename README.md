# dsh-qq-access · NapCat 托管 + 管理面板

为 DeepSeek Harness 接入个人 QQ 私聊、群聊和 QQ 空间留言板。**Windows x64 已加入 NapCat 的安装、配置与进程管理**：首次下载官方运行包，之后随 Harness 启动，连接配置自动写好，扫码页就绪后自动打开。

此包包含源码与可安装的 `.tgz`。NapCat 官方运行包在目标电脑下载，保留原始文件与许可证，以插件管理的独立子进程运行。你不需要另外安装、手工启动或填写 NapCat 网络配置。

## 功能

| 功能 | 行为 |
| --- | --- |
| 安装 | 固定官方 `v4.18.41` Windows Node 运行包，校验大小与 SHA256 后解压 |
| 配置 | 自动生成 API token、事件签名、本机 API 和上报连接 |
| 登录 | 自动打开本机 NapCat WebUI，用户本人扫码；等待期间 Harness 正常打开 |
| 维护 | 可查看启动／待扫码／在线状态，崩溃后最多重启 2 次，退出时停止自有进程树 |
| QQ 聊天 | 接收可上报的全部入站消息，默认私聊自动回复、群聊被 @ 时回复 |
| 历史 | 本地归档、搜索，或调用 QQ 历史接口分页查询 |
| 图片 | 私聊/群聊里的图片转成模型可见的 image content（PNG / JPEG / GIF / WEBP，单条最多 4 张，可关） |
| 空间 | 独立浏览器登录，读取可见文字，在留言板发表纯文本留言 |
| 面板 | 左侧栏「QQ 接入」：自动回复开关、批量窗口与轮询、回复范围白名单、NapCat 托管、人格编辑、在线状态 |

访问范围限登录账号的权限和 QQ 接口可提供的数据，不保证补全安装前全部历史。图片会转成模型可见的内容（`reply.vision` 可关）；语音等其它媒体仍是类型占位文字。空间不含说说评论、发说说、相册导出和权限绕过。

## Windows x64 新安装

准备 Node.js **22.14+**（建议 24 LTS）、提供当前 Agent／工具接口的 Harness（参考 `0.2.1-rc.4`），以及 QQ 空间使用的 Edge 浏览器。

1. 解压后进入 `dsh-qq-access`，用 PowerShell 执行：

```powershell
npm ci
node cli.mjs setup
```

输入接入的 QQ 号。管理员 QQ 号可留空，留空时只在电脑上的 Harness 管理。若填写，应使用另一个 QQ 号，登录号自身的出站消息不会触发自动回复。

Windows x64 的 `setup` 自动启用托管模式、生成密钥并下载运行包。压缩包约 **118.3 MiB**，首次需要联网，之后复用本机安装。下载失败可运行 `node cli.mjs napcat-install` 重试。默认配置在 `%USERPROFILE%\.dsh-qq-access\config.json`，不会覆盖已有文件。

2. 从 [Releases](https://github.com/Applepinea/dsh-qq-access/releases) 下载最新的 `dsh-qq-access.tgz`，在 Harness 桌面版插件管理中选中它（填完整路径）。或在 CLI / Web profile 执行：

```powershell
dsh plugin --profile web add C:/Plugins/dsh-qq-access.tgz
dsh web
```

如果桌面版本没有本地包入口，请升级或使用 Web profile；profile 必须与实际启动环境一致。

插件自动启动 NapCat，扫码页就绪后打开浏览器。用步骤 1 的 QQ 号扫码后自动接通。无需手填 NapCat 的 API 地址、token 或上报设置。未弹出扫码页时可执行：

```powershell
node cli.mjs napcat-login
```

如果 Harness 已运行 NapCat，此命令只打开现有登录页；否则启动临时登录进程，扫码成功后关闭，再由 Harness 启动正式实例。默认等待 10 分钟，超时后重载插件重新尝试。

3. QQ 空间仍需独立登录：

```powershell
node cli.mjs qzone-login
```

在独立 Edge 窗口中登录同一个 QQ 号，回终端按回车。空间登录状态与 NapCat 分开；关闭登录窗口后再调用空间工具。空间页面结构、权限和验证码需要在目标机器验证，结果不明确时返回 `uncertain`，应先查看真实页面，不要直接重发。

## 从 0.1.0 升级

解压新源码、执行 `npm ci`，然后运行：

```powershell
node cli.mjs napcat-enable
```

此命令备份原配置，保留 QQ 号、访问范围、人设和消息密钥，再启用托管并准备运行包。随后在 Harness 安装新 `.tgz` 替换旧包并重载。

旧配置不会被静默切换：没有 `napcat` 段时仍为 `external` 模式。若旧的手动 NapCat 已运行且账号、密钥一致，插件复用它，不修改或停止这个外部进程；要完全切换为托管，先退出旧实例再重载插件。Linux、macOS、Windows ARM 当前使用 [外部模式](docs/EXTERNAL_MODE.md)。

## 离线准备

从 [官方固定版本 Release](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.41) 下载 `NapCat.Shell.Windows.Node.zip`，在已启用托管的配置下执行：

```powershell
node cli.mjs napcat-install --archive C:/Downloads/NapCat.Shell.Windows.Node.zip
```

文件必须与固定版本及 SHA256 对应，不能用 Framework、普通 Shell 或 OneKey 包代替。本版不自动升级未来版本。

## 使用与设置

在 Harness 中可以说“查看 QQ 接入状态”“列出我的群”“读取好友 234567890 最近 30 条消息”“给 QQ 234567890 发：今晚八点见”或“在 QQ 234567890 的空间留言板留言：周末快乐”。

发送和留言使用唯一 `request_id`，重试相同操作必须复用标识。只有 `status: sent` 表示成功，`pending` 或 `uncertain` 需要先核对实际结果。

| 配置项 | 默认与用途 |
| --- | --- |
| `napcat.mode` | 新 Windows x64 配置为 `managed`；外部接入为 `external` |
| `napcat.autoInstall` | `true`，缺少运行包时自动安装 |
| `napcat.autoOpenLogin` | `true`，自动打开本机登录页 |
| `napcat.webuiPort` | `6099`，不得与 API、事件接收端口重复 |
| `napcat.maxRestarts` | `2`，每次加载插件期间的重启预算 |
| `reply.private` | `true`，私聊自动回复 |
| `reply.group` | `mention`，可改为 `off` 仅归档或 `all` 每条回复 |
| `access.privateMode` / `access.groupMode` | `all`，可改 `allowlist` 或 `disabled` |
| `access.privateIds` / `access.groupIds` | 对应白名单，QQ 号／群号使用字符串 |
| `ownerIds` | 管理员私聊账号列表，默认空 |
| `ownerHarnessTools` | `false`，进一步开放管理员的宿主其他工具权限 |
| `persona` | 自定义称呼、性格、语气、回复习惯 |
| `retentionDays` | `30`，本插件消息归档保留天数 |

修改后重载插件。普通联系人只允许本会话聊天和历史查询，不能操作文件、终端、其他私聊或空间。管理员权限只认传输层确认的私聊账号，在群内按普通群成员处理。

聊天内容在用于回复或主动查询时会进入 Harness 配置的模型服务。归档保留期不会删除 Harness 自己保存的会话、模型服务记录、QQ 或空间登录状态。

## 排查与验证

`node cli.mjs doctor` 只读检查安装与连接，不发送消息。尚未启动 Harness 或尚未扫码时，API 离线不代表安装失败。`qq_status.napcat.state` 可查看启动、待扫码、在线状态；状态工具不返回 API 或 WebUI 密钥。

API、上报接收和登录页只绑定本机。端口冲突时退出冲突程序或修改配置后重载。控制台日志位于配置对应的 `data/napcat/logs/console.log`，可能含二维码或登录页密钥，仅用于本机排查。异常退出留下锁文件时，先确认对应进程已退出，再删除提示的锁文件。

本版已在 Linux 做本地测试，并实际下载、校验、解压固定的官方运行包；**未在 Windows 运行 QQ 原生组件、未登录真实 QQ，也未完成真实 QQ 空间验收**。详见 [验证说明](docs/VALIDATION.md)。

```powershell
npm run check   # 清单字段、文件完整性、语法、客户端 bundle 自检
npm test        # 冒烟测试：导出形状、补丁条目、配置校验，不需要宿主
npm run pack:tgz
```

`check` 会校验 `dsh.bundle.patch` 指向的补丁、`exports` 与 `files` 里的每个路径是否真实存在，以及客户端 bundle 里 `require()` 的宿主模块是否都写进了 `dsh.client.external`。宿主接口契约测试（`tools.guard`、`agents.create` 等）需要真实 DSH 包，不在本仓库内。

本项目自写代码按 MIT 发布；NapCat 与官方运行包各组成部分遵循上游许可，本插件的 MIT 许可不代替它们的许可。接口和运行包依据见 [来源说明](docs/SOURCES.md)。
