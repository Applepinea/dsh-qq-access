# DSH QQ Access

<p align="center">
  <strong>让 DeepSeek Harness 接入你的 QQ，拥有真实的聊天、记忆与生活</strong>
</p>

<p align="center">
  一个面向 DeepSeek Harness 的 QQ 接入插件，基于 NapCat / OneBot v11，提供私聊、群聊、QQ 空间、长期记忆、情感关系与虚拟生活等能力。
</p>

<p align="center">
  <a href="https://github.com/Applepinea/dsh-qq-access/releases"><img src="https://img.shields.io/github/v/release/Applepinea/dsh-qq-access?style=flat-square&color=blue" alt="GitHub Release"></a>
  <a href="https://www.npmjs.com/package/dsh-qq-access"><img src="https://img.shields.io/npm/v/dsh-qq-access?style=flat-square&color=cb3837" alt="npm version"></a>
  <a href="https://github.com/Applepinea/dsh-qq-access/actions"><img src="https://img.shields.io/github/actions/workflow/status/Applepinea/dsh-qq-access/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <a href="https://github.com/Applepinea/dsh-qq-access/blob/main/LICENSE"><img src="https://img.shields.io/github/license/Applepinea/dsh-qq-access?style=flat-square" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.14-green?style=flat-square&logo=node.js" alt="Node.js"></a>
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#配置指南">配置指南</a> ·
  <a href="#安全机制">安全机制</a> ·
  <a href="#开发与测试">开发与测试</a> ·
  <a href="#文档">文档</a>
</p>

---

## ✨ 项目简介

**DSH QQ Access** 是一个为 [DeepSeek Harness](https://github.com/deepseek-ai/DeepSeek-Harness) 设计的 QQ 接入插件。

它通过 NapCat 提供的 OneBot v11 接口，将 QQ 的消息、群聊、QQ 空间等能力接入 Harness，让 AI 不再局限于单纯的对话窗口。

它不仅可以收发消息、查看图片、搜索表情包，还拥有独立的情感状态、长期记忆和虚拟生活系统。

在 Windows x64 环境下，插件还可以自动下载并管理 NapCat，无需单独配置一套 NapCat 运行环境。

**核心设计理念：让 AI 不只是能够回复消息，还能拥有持续的上下文、关系和生活状态。**

## 🚀 功能特性

### 💬 QQ 消息与群聊

| 功能 | 说明 |
| --- | --- |
| 私聊与群聊 | 支持独立配置私聊、群聊访问权限 |
| 智能群聊回复 | 支持 `off`、`mention`、`smart`、`all` 四种模式 |
| 智能触发 | 被 @、被引用、被叫名字时优先响应 |
| 兴趣识别 | 根据话题兴趣和对话内容判断是否参与群聊 |
| 消息分段 | 长消息自动拆分，发送间隔根据文本长度调整 |
| 消息归档 | 按日期保存消息，支持关键词搜索和历史读取 |
| 图片理解 | 接收图片并将其交给模型理解 |
| 表情互动 | 支持 QQ 小黄脸、图片和表情包收发 |

### 🧠 长期记忆与情感系统

| 功能 | 说明 |
| --- | --- |
| 长期记忆 | 按用户建立独立记忆，同一用户在群聊和私聊中共享 |
| 记忆衰减 | 根据时间降低普通事件的记忆权重 |
| 事实记忆 | 重要事实可以长期保留，更新时标记旧事实 |
| 情感系统 | 喜悦、信任、恐惧、惊讶、悲伤、厌恶、愤怒、期待八维情感 |
| 好感度 | 独立记录对不同用户的好感变化 |
| 亲密度 | 根据互动逐步发展关系 |
| 关系阶段 | 支持初识、深化、承诺、共生等阶段演进 |
| 时间感知 | 为历史消息附加相对时间和对话间隔 |
| 念头留存 | 模型「想过但没说出口」的内容单独落盘，会话被回收或插件重启后会重新注入 |

### 🌱 虚拟生活系统

让 AI 拥有持续变化的生活状态，而不是每次聊天都从零开始。

- **日程安排**：生成并维护一周的生活计划。
- **穿搭系统**：根据天气和时间安排不同穿搭。
- **饮食记录**：生成每日三餐安排。
- **主动动态**：按照设定的时间窗口和概率发布 QQ 空间动态。
- **生活状态**：将生活信息融入日常对话。

### 🌐 QQ 空间与联网能力

- 读取 QQ 空间说说、图片和评论。
- 发布说说、评论和删除动态。
- 使用已有 QQ 登录状态获取空间 Cookie。
- 支持 Bilibili、YouTube、X、Instagram、小红书、小黑盒等平台的链接内容读取。
- 支持实时搜索、网页正文抓取和多路搜索。

### 🎨 表情包管理

- 本地表情包图库。
- 根据情绪和关键词检索表情包。
- 自动收集对话中的表情包。
- 使用视觉模型为表情包自动分类。
- 支持自动发送配置。

### 🖥️ NapCat 自动管理

Windows x64 用户可以使用插件内置的 NapCat 托管功能：

1. 自动下载官方 NapCat 运行包。
2. 校验下载文件 SHA256。
3. 自动解压和生成运行配置。
4. 自动启动 NapCat。
5. 自动打开扫码登录页面。
6. 监控连接状态并处理断线重连。

如果你已经部署了 NapCat，也可以切换到外部模式，直接连接已有实例。

---

## 📦 快速开始

### 环境要求

| 项目 | 要求 |
| --- | --- |
| DeepSeek Harness | `>= 0.2.1-rc.3` |
| Node.js | `>= 22.14.0` |
| 操作系统 | Windows / Linux / macOS |
| **QQ 客户端** | **不需要预先安装** |
| NapCat | 托管模式仅支持 Windows x64；其他环境使用外部模式 |

> **上游已于 2026-11-12 停止维护**（`NapNeko/NapCatQQ` 清空了全部 Releases，README 只剩一句 "Ending"）。
> 插件默认从社区镜像下载同一份产物，SHA256 校验值不变；若镜像也失效，面板会在一分钟后给出手动下载指引。
>
> **不需要先装 QQ。** 托管模式下载的是 NapCat 的 **Shell 版**运行包（约 118 MB），
> 里面自带 `node.exe`、`wrapper.node`（QQNT 运行时）和一份用于描述 QQ 版本的 `package.json`，
> 插件启动的是该目录下的 `node.exe`，不会去读你系统里装没装 QQ，也不会与之冲突。
> 装了 QQ 也可以，两者版本互不影响（例如本机 QQ 是 9.9.36，NapCat Shell 用的是 9.9.31）。
>
> 登录仍然需要**手机 QQ 扫码**——NapCat 是协议实现而非客户端，扫码这一步绕不过去。
>
> 托管模式**仅支持 Windows x64**。macOS / Linux / ARM 请在 `napcat.mode` 里选 `external`，
> 自行部署 NapCat 后把 OneBot 地址填进来；`external` 模式不需要 QQ 客户端。

### 方式一：从 npm 安装（推荐）

```powershell
dsh plugin --profile desktop add dsh-qq-access
```

升级时重跑同一条命令即可。网页端把 `desktop` 换成 `web`。

> **提示 `dsh` 不是命令？** 桌面版没有把 `dsh` 加进 PATH，用完整路径调用即可：
>
> ```powershell
> & "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add dsh-qq-access
> ```

安装完成后重启 Harness，左侧栏即可看到 **QQ 接入**。

### 方式二：在面板里安装（不想用命令行时）

1. 打开 Harness，左侧栏进入 **插件** 页面，点 **添加插件**（Add plugin）。
2. 输入 `dsh-qq-access`，或先下载 tgz、把**完整路径**粘进去（相对路径会被宿主拒绝）。
3. 重启 Harness，左侧栏出现 **QQ 接入**。

装完不用先去终端写配置文件——直接点开面板，它会自己引导（见下面的「首次配置」）。

### 方式三：下载 tgz 安装

连不上 npm 时用这种方式。

1. 前往 [GitHub Releases](https://github.com/Applepinea/dsh-qq-access/releases/latest)，下载 `dsh-qq-access.tgz`。
   同一个 Release 里还有个带版本号的 `dsh-qq-access-1.1.4514.tgz`，两个文件内容完全一致，下哪个都行。
2. 用下载后的完整路径安装（PowerShell 里路径带空格要加引号）：

```powershell
dsh plugin --profile desktop add "$env:USERPROFILE\Downloads\dsh-qq-access.tgz"
```

> 注意：`--profile` 必须与实际运行的 Harness 环境一致。桌面端用 `desktop`，网页端用 `web`。

### 首次配置

**推荐：直接在面板里完成。**

装好插件、重启 Harness 后点开左侧栏的 **QQ 接入**。这时还没有配置文件，面板会显示「首次配置」那一屏：

1. 填 **登录用 QQ 号**（要拿来当机器人的那个号）。
2. 选填 **管理员 QQ 号**（你自己的号，用于远程管理；留空表示只在本机 Harness 里管理）。
3. 点 **生成配置**。Token、事件签名密钥、NapCat WebUI token、三个端口全部由插件随机生成，你不用自己编。
4. 生成配置后会自动开始准备 NapCat（首次下载约 118 MB，需要几分钟），装好后自动打开扫码页，用第 1 步填的号扫码即可。面板顶部会显示下载/启动进度，不用手动重载插件。

配置文件默认落在：

```text
%USERPROFILE%\.dsh-qq-access\config.json
```

> 点「生成配置」的瞬间 QQ 接入就会启动。首次要下载 NapCat，面板顶部会依次显示 安装中 → 启动中 → 等待扫码 → 在线，全程不用离开面板。

**进阶：用命令行向导。**

适合脚本化部署，或面板打不开的时候。**必须先进到插件目录**再执行，`cli.mjs` 是插件自带的脚本：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-qq-access"
node cli.mjs setup
```

向导会问同样的两个 QQ 号，生成随机 Token 与事件签名密钥。在 Windows x64 上默认使用 NapCat 托管模式。

**进阶：手写配置。**

```powershell
Copy-Item examples/config.example.json "$env:USERPROFILE\.dsh-qq-access\config.json"
```

同样要在插件目录下执行。至少需要确认：

```json
{
  "selfId": "你的QQ号",
  "onebot": {
    "apiUrl": "http://127.0.0.1:3000",
    "token": "替换为随机生成的安全Token"
  },
  "events": {
    "port": 5701,
    "secret": "替换为随机生成的签名密钥"
  }
}
```

`onebot.token` 和 `events.secret` 均应使用不少于 16 位的随机字符串。

托管模式下，插件会自动将相关连接配置写入 NapCat，无需重复手动配置。


---

## ⚙️ 配置指南

大部分配置都可以直接在 Harness 左侧栏的 **QQ 接入** 面板中修改。

主要配置项如下：

| 配置项 | 作用 |
| --- | --- |
| `selfId` | 登录 QQ 账号 |
| `ownerIds` | 管理员 QQ 账号 |
| `access.privateMode` | 私聊访问策略 |
| `access.groupMode` | 群聊访问策略 |
| `reply.private` | 是否自动回复私聊 |
| `reply.group` | 群聊回复模式 |
| `reply.smartThreshold` | 智能群聊触发阈值 |
| `reply.selfNames` | AI 在群聊中的名称 |
| `reply.interests` | 感兴趣的话题 |
| `memory` | 长期记忆设置 |
| `emotion` | 情感与关系设置 |
| `life` | 虚拟生活设置 |
| `qzoneProactive` | QQ 空间主动动态设置 |
| `model` | 指定使用的模型；可以在同一个对象里写 `reasoningEffort` 指定推理等级，留空表示用服务商默认 |

### 群聊回复模式

| 模式 | 行为 |
| --- | --- |
| `off` | 不自动回复 |
| `mention` | 仅响应 @ 和相关主动提及 |
| `smart` | 根据消息内容和兴趣判断是否回复 |
| `all` | 尽可能响应群聊消息 |

`smart` 是默认模式。

它会优先响应被 @、被引用或被叫名字的消息；其他消息则根据对话意图、兴趣词和内容特征进行评分。

默认触发阈值为 3，阈值越高，回复越克制。

### 人格与能力分离

插件将系统提示拆分为两个独立部分：

| Section | 内容 | 是否可编辑 |
| --- | --- | --- |
| `qq-access-persona` | 人格设定、说话风格和输出格式 | 是 |
| `qq-access-capabilities` | 插件工具及其使用说明 | 否 |

人格可以通过面板自由调整，而能力说明由插件维护。

此外，能力清单会根据当前会话实际可用的工具动态过滤，避免模型调用不存在的工具。

---

## 🔌 NapCat 连接模式

插件支持两种连接方式：

### Managed Mode（托管模式）

由插件负责 NapCat 的安装、启动、登录页面和运行状态管理。

首次启动时会自动下载 NapCat Shell 运行包（约 118 MB，带 SHA256 校验），
解压到数据目录并拉起其中的 `node.exe`。整个过程在面板上有进度条：
安装中（带百分比）→ 启动中 → 等待扫码 → 已连接。

**不需要预先安装 QQ 客户端**，也不会读取或干扰系统里的 QQ。

适合：

- Windows x64 用户。
- 没有单独部署 NapCat 的用户。
- 没装 QQ 客户端、或不想让插件碰到自己 QQ 的用户。
- 希望尽可能减少手动配置的用户。

### External Mode（外部模式）

连接已经运行的 NapCat 或其他 OneBot v11 实现。

适合：

- 已经部署 NapCat 的用户。
- 使用 Docker 或远程机器运行 NapCat 的用户。
- 希望自行管理 NapCat 进程的用户。

外部模式需要自行配置 OneBot HTTP 服务和 HTTP 上报。

详细配置请参考：

[外部模式配置说明](docs/EXTERNAL_MODE.md)

---

## 🔐 安全机制

QQ 接入意味着插件能够代表你的 QQ 账号执行操作，因此安全性是项目的重要设计目标。

目前实现了以下机制：

- **本机接口限制**：OneBot API 地址强制使用本机回环地址。
- **独立身份验证**：HTTP API Token 与事件签名密钥分离。
- **会话隔离**：普通用户只能读取自己的会话历史。
- **权限控制**：跨会话管理能力仅开放给管理员。
- **管理员身份校验**：管理员权限只根据可信的私聊账号身份判断，群聊中不会直接继承管理员权限。
- **幂等保护**：消息发送、空间发布和评论使用请求账本，避免重复执行。
- **不确定状态保护**：无法确认是否成功的操作不会被当作成功，也不会自动重复发送。

> ⚠️ 请妥善保管配置文件、NapCat 登录状态、Cookie、Token 和日志。不要将这些信息上传到公开仓库或发送给他人。

---

## 🛠️ 常用命令

下面的命令都要**先进到插件目录**再执行（`cli.mjs` 是插件自带的脚本，不在 PATH 里）：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-qq-access"
```

网页端把 `desktop` 换成 `web`。

| 命令 | 说明 |
| --- | --- |
| `node cli.mjs setup` | 生成初始配置 |
| `node cli.mjs doctor` | 检查配置与连接状态 |
| `node cli.mjs napcat-install` | 下载并安装 NapCat |
| `node cli.mjs napcat-enable` | 启用 NapCat 托管模式 |
| `node cli.mjs napcat-login` | 重新打开扫码登录页面 |

### 故障排查

如果插件无法正常连接 QQ，先在插件目录下运行：

```powershell
node cli.mjs doctor
```

该命令会检查配置、NapCat 安装情况、QQ 连接和 QQ 空间 Cookie，不会发送消息或发布动态。

日志默认位于：

```text
%USERPROFILE%\.dsh-qq-access\data\napcat\logs\console.log
```

不同版本和运行状态下，日志位置可能有所不同。

#### 常见报错

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `webserver: duplicate exact route "/dsh-qq/api/state"` | 同一 profile 里装了两份 `dsh-qq-access`（重复安装，或上次热卸载没干净） | 打开 `%USERPROFILE%\.dsh\profiles\desktop\package.json`，确认 `dsh.profile.bundles` 里 `dsh-qq-access` 只出现一次；删掉重复项后完全退出 Harness（含托盘）再启动 |
| `QQ API 端口已被其他服务占用` | 3000 / 6099 端口被别的程序占了 | 改 `onebot.apiUrl` 或 `napcat.webuiPort`，或先关掉占用的程序 |
| `等待 QQ 扫码登录超时` | 没在时限内扫码 | 面板上点「打开登录页」重扫，或 `node cli.mjs napcat-login` |
| `NapCat 下载服务器返回的文件大小不符` | 下载被代理/镜像改写了 | 换个网络重试，或用 `node cli.mjs napcat-install --archive <路径>` 手动指定官方压缩包 |
| 下载一直不开始（超过一分钟） | 连不上 GitHub / 代理有问题 | 面板会自动展开手动下载卡片：复制下载地址 → 下载 → 按卡片给出的文件名放进 `napcat\downloads\` → 点「重试启动」 |
| `NapCat 登录账号与配置 selfId 不一致` | 扫码用的号和面板里填的登录号不是同一个 | 确认后改配置；面板顶部有「重试启动」，不用重启 Harness |
| 启动失败后改好了配置 | 之前只能重启 Harness | 面板顶部红字下方点「重试启动」即可 |

如果需要提交日志用于排查，请先删除二维码、登录密钥、Cookie、Token 等敏感内容。

---

## 🧪 开发与测试

克隆项目：

```bash
git clone https://github.com/Applepinea/dsh-qq-access.git
cd dsh-qq-access
```

安装依赖：

```bash
npm ci
```

运行检查：

```bash
npm run check
```

运行测试：

```bash
npm test
```

检查项目打包内容：

```bash
npm pack --dry-run
```

### CI

项目配置了 GitHub Actions，自动执行 Node.js 22 / 24 测试矩阵。

[查看 CI 运行状态](https://github.com/Applepinea/dsh-qq-access/actions)

### 测试范围

目前包含：

- JavaScript / ESM 语法检查。
- 插件文件完整性检查。
- 客户端 Bundle 依赖声明检查。
- 工具清单与能力说明一致性检查。
- 冒烟测试。

部分功能依赖真实 QQ、NapCat 和 Harness 环境，不能仅通过自动化测试完全覆盖。

详细测试记录：

[验证说明](docs/VALIDATION.md)

---

## 📚 文档

| 文档 | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 版本更新记录 |
| [docs/EXTERNAL_MODE.md](docs/EXTERNAL_MODE.md) | 外部 NapCat 连接方式 |
| [docs/VALIDATION.md](docs/VALIDATION.md) | 测试范围与验证记录 |
| [docs/SOURCES.md](docs/SOURCES.md) | 接口来源与参考项目 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |

---

## 🗺️ Roadmap

项目仍在持续完善中，未来可能探索：

- [ ] 更完善的群聊行为策略。
- [ ] 更灵活的主动互动与生活事件系统。
- [ ] 更精细的长期记忆管理。
- [ ] 更多消息类型和 QQ 交互能力。
- [ ] 更完善的自动化测试与运行状态监控。

具体开发进度以仓库 Issues 和 Releases 为准。

---

## 🤝 参与贡献

欢迎提交 Issue、Pull Request 和功能建议。

如果你发现 Bug、希望增加功能，或者有更好的实现思路，欢迎参与项目开发。

提交代码前，请先阅读：

[CONTRIBUTING.md](CONTRIBUTING.md)

---

## 📄 License

本项目采用 [MIT License](LICENSE) 开源。

---

<p align="center">
  <strong>DSH QQ Access</strong>
  <br>
  Give your AI a place to live, remember and connect.
  <br><br>
  <a href="https://github.com/Applepinea/dsh-qq-access">GitHub Repository</a>
  ·
  <a href="https://github.com/Applepinea/dsh-qq-access/issues">Issues</a>
  ·
  <a href="https://github.com/Applepinea/dsh-qq-access/releases">Releases</a>
</p>
