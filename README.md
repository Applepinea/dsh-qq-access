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
| NapCat | 托管模式仅支持 Windows x64；其他环境使用外部模式 |

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
   同一个 Release 里还有个带版本号的 `dsh-qq-access-1.1.4.tgz`，两个文件内容完全一致，下哪个都行。
2. 用下载后的完整路径安装（PowerShell 里路径带空格要加引号）：

```powershell
dsh plugin --profile desktop add "$env:USERPROFILE\Downloads\dsh-qq-access.tgz"
```

> 注意：`--profile` 必须与实际运行的 Harness 环境一致。桌面端用 `desktop`，网页端用 `web`。

### 首次配置

整个过程分**两个阶段**，中间需要重启一次 DSH。请按顺序做完，不要跳步。

#### 阶段 1：生成配置（约 30 秒）

1. 装好插件，**重启一次 DSH**。左侧栏会出现 **QQ 接入**。
2. 点开它 —— 还没配置文件时，面板显示「首次配置」那一屏。
3. **不用填登录 QQ 号。** 只选填 **管理员 QQ 号**（你自己的号，用于用另一个 QQ 私聊管理插件；留空就只能在本机 Harness 里管）。
4. 点 **生成配置并开始登录**。

> 这一步**只写配置文件**，不会下载任何东西。面板会明确提示你重启。

配置文件落在：

```text
%USERPROFILE%\.dsh-qq-access\config.json
```

Token、事件签名密钥、NapCat WebUI token、三个端口全部由插件随机生成，你不用自己编。

此时配置里是 `"selfId": ""` + `"loginPending": true` —— 意思是「还不知道要登哪个号，等扫码后自动识别」。

#### 阶段 2：拉起 NapCat 并扫码（首次约 3–8 分钟，取决于网速）

1. **完全退出 DSH**：托盘图标右键 → 退出。不要只关窗口。
2. 重新打开 DSH。插件这次会读到配置，开始干活：
   - 检查/下载 NapCat 运行包（首次约 **118 MB**，面板显示百分比进度条）
   - 解压校验
   - 启动 NapCat 并打开扫码页
3. **用手机 QQ 扫码**，在手机上点确认登录。
4. 插件从 NapCat 的配置文件名认出你登录的是哪个号，写回 `config.json`，面板整屏提示：

```text
✅ 已登录 QQ 123456789，配置已写回。
现在请完全退出 DeepSeek Harness，再重新启动 —— QQ 接入才会真正开始工作。
```

5. **再退出并重启一次 DSH。** 这次插件以 `selfId=123456789` 启动，走 NapCat 的快速登录，不会再扫码。

到此完成，面板会变成正常配置界面，`qq_status` 显示已连接。

#### 为什么要重启两次

| 时机 | 为什么必须重启 |
| --- | --- |
| 生成配置后 | `/bootstrap` 只写文件，不启动 NapCat。下载和扫码都发生在下一次 `apply()` 里 |
| 扫码成功后 | 运行中的插件启动时读到的 `selfId` 还是空的；只有重启才会以真实号重新初始化 |

---

### ⚠️ NapCat 的 WebUI 只在后台启动

**这是最容易困惑的一点，先说清楚。**

插件是用 `windowsHide: true` 启动 NapCat 的：

```js
spawnProcess(node.exe, [index.js, '-q', selfId], {
  windowsHide: true,   // ← 没有可见窗口
  stdio: ['ignore', 'pipe', 'pipe'],
});
```

所以：

- **不会弹出任何 NapCat 窗口**。任务管理器里只有一个 `node.exe`。
- **WebUI 只能通过浏览器访问**，地址是你配置里的 `napcat.webuiPort`（默认 `6800`）：

  ```text
  http://127.0.0.1:6800/webui?token=<你的 napcat.webuiToken>
  ```

  面板顶部和「打开扫码页」按钮会自动带上 token，点一下就能进。

- **想让 WebUI 在系统托盘里常驻**，需要你自己改 NapCat 的启动方式 —— 见下面「自己接管 NapCat」。

#### 方案 0（先看这个）：让 WebUI 不再每次启动都弹

**默认行为**：插件在「判断需要登录」时会自动打开浏览器给你扫码。
如果 NapCat 冷启动要几秒，这几秒里插件连不上，就可能误判成「需要登录」，
于是**每次开机都被弹一个 WebUI 窗口** —— 哪怕你账号好好的、根本不用扫码。

想彻底不再弹，两个办法（都在面板「NapCat」卡片里改，保存后重启 DSH 生效）：

**办法 1：直接关掉自动打开（最省事）**

把 **「需要登录时自动打开 WebUI 浏览器」** 关掉。
以后要扫码就手动点「打开 NapCat 登录页」按钮，其余时候安静如鸡。

```json
{ "napcat": { "autoOpenLogin": false } }
```

**办法 2：留着自动打开，但给足冷启动时间（更聪明）**

保持开关打开，把 **「启动宽限期」**（`loginGraceMs`）调大，默认 **20 秒**。
NapCat 冷启动那几秒连不上是正常的，宽限期内**不会**弹；
只有过了宽限期还连不上、确实需要扫码了，才弹**一次**。

```json
{ "napcat": { "autoOpenLogin": true, "loginGraceMs": 20000 } }
```

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `napcat.autoOpenLogin` | `true` | 需要登录时是否自动打开浏览器。关掉 = 永不弹窗 |
| `napcat.loginGraceMs` | `20000` | 冷启动宽限期（毫秒）。这段时间内连不上不算「需要登录」，不会弹窗 |

> 首次配置（`selfId` 为空）不受宽限期限制 —— 那时确实要立刻扫码。

---
#### 方案 A（推荐）：托管模式 + 面板按钮

什么都不用配。插件负责启动/停止 NapCat，你只通过面板的 **打开扫码页** 按钮进 WebUI。

要看 WebUI 地址和 token：

```powershell
node -e "const c=require(process.env.USERPROFILE+'/.dsh-qq-access/config.json');console.log('http://127.0.0.1:'+c.napcat.webuiPort+'/webui?token='+c.napcat.webuiToken)"
```

#### 方案 B：让 NapCat 独立后台常驻（有托盘 / 开机自启 / 不随 DSH 退出）

这是你要的「后台启动 NapCat」的完整做法。**核心是把模式改成外部** ——
外部模式下插件完全不碰 NapCat 进程，只管连它的 OneBot 接口。

> 为什么必须改成外部：托管模式下插件用 `windowsHide` 拉 NapCat，**一定会隐藏窗口**，
> 而且 DSH 退出时会把 NapCat 一起带走。外部模式下这两件事都由你控制。

##### B1. 把 NapCat 模式改成外部

面板里「NapCat 模式」选 **外部**，或者在 `config.json` 里改：

```json
{ "napcat": { "mode": "external" } }
```

改完重启 DSH。此时插件不再管理 NapCat，只等你把 NapCat 跑起来。

##### B2. 手动启动 NapCat（三种方式，任选）

运行包默认在：

```text
%USERPROFILE%\.dsh-qq-access\data\napcat\releases\v4.18.41\
```

这个目录里有现成的启动脚本 `napcat.bat`，内容就是：

```bat
@echo off
cd /d "%~dp0"
"%~dp0node.exe" "%~dp0index.js" %*
```

**方式 1：直接双击（最简单）**

双击 `napcat.bat`。会弹出一个**黑色命令行窗口**——这个窗口就是 NapCat 本体，
**别关它**，关了 NapCat 就退了。

第一次会提示扫码（或在浏览器里完成），之后它会记住登录态。

**方式 2：完全后台（不留窗口）**

想要「启动了但看不到窗口」：

```powershell
$dir = "$env:USERPROFILE\.dsh-qq-access\data\napcat\releases\v4.18.41"
Start-Process -FilePath "$dir\node.exe" `
  -ArgumentList "$dir\index.js", "-q", "<你的QQ号>" `
  -WorkingDirectory $dir -WindowStyle Hidden
```

`-WindowStyle Hidden` 就是隐藏窗口。想再彻底一点，用 `-RedirectStandardOutput`
把日志写到文件，然后彻底没人看得见它在跑。

**方式 3：开机自启（推荐长期用）**

把方式 2 的那条命令存成 `.ps1`，然后丢进启动目录：

```powershell
$startup = [Environment]::GetFolderPath('Startup')
notepad "$startup\napcat.ps1"   # 把上面的命令粘进去保存
```

或者用**任务计划程序**：创建任务 → 触发器「登录时」→ 操作「启动程序」→
程序填 `node.exe` 的完整路径，参数填 `index.js -q <你的QQ号>`，起始位置填运行包目录，
勾上「不管用户是否登录都要运行」+「使用最高权限运行」就能完全后台。

##### B3. 在 NapCat 里配好 OneBot 连接

外部模式下插件**不会**帮你写 NapCat 配置，需要你在 NapCat 的 WebUI 里手动加两个连接。

NapCat 启动后会告诉你 WebUI 地址（看那个命令行窗口，或日志里搜 `WebUi User Panel Url`）。
通常长这样：

```text
http://127.0.0.1:6099/webui?token=<NapCat 自己生成的 token>
```

进去之后在 **网络配置** 里加：

**① HTTP 服务器**（插件从这里发消息）

| 字段 | 值 |
| --- | --- |
| 主机 | `127.0.0.1` |
| 端口 | `3000` |
| Token | 你 `config.json` 里的 `onebot.token` |
| 消息格式 | `array` |

**② HTTP 客户端**（NapCat 把收到的消息推给插件）

| 字段 | 值 |
| --- | --- |
| URL | `http://127.0.0.1:5701/onebot` |
| Token | 你 `config.json` 里的 `events.secret` |
| 消息格式 | `array` |

两个 token 都能用这条命令读出来：

```powershell
node -e "const c=require(process.env.USERPROFILE+'/.dsh-qq-access/config.json');console.log('OneBot token :', c.onebot.token);console.log('事件 secret  :', c.events.secret);console.log('WebUI port   :', c.napcat.webuiPort)"
```

##### B4. 验证

重启 DSH，然后看面板：

- 状态显示 **在线** → 成功
- 显示 **未连接** → 点面板的「刷新」；还不行就检查 NapCat 有没有在跑、token 对不对

也可以在 QQ 里私聊她一句，能回就说明通了。

##### B5. 这样做的代价

| 项 | 托管模式 | 外部模式（自己跑） |
| --- | --- | --- |
| 谁启动 NapCat | 插件 | **你** |
| NapCat 崩了 | 插件自动重启（最多 `maxRestarts` 次） | **要你自己重启** |
| DSH 重启时 | NapCat 跟着重启，可能要重新扫码 | NapCat 继续跑，**不用重扫** |
| 有没有窗口 | 没有（`windowsHide`） | 你决定 |
| OneBot 配置 | 插件自动写 | 你手动配 |

**外部模式最大的好处**：DSH 重启不会打断 NapCat，省掉反复扫码。
**最大的坏处**：NapCat 出问题得你自己看。

#### 方案 C：两者都要（托管但不隐藏窗口）

目前不支持。插件为了不在用户桌面上乱弹窗口，固定用了 `windowsHide: true`。
如果你需要这个，可以用方案 B 自己启动，然后在面板里保持「外部」模式。

---

### 进阶：用命令行向导

适合脚本化部署，或面板打不开的时候。**必须先进到插件目录**再执行：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-qq-access"
node cli.mjs setup
```

向导会问登录 QQ 号和管理员号，生成随机 Token 与事件签名密钥。在 Windows x64 上默认使用 NapCat 托管模式。

### 进阶：手写配置

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-qq-access"
Copy-Item examples/config.example.json "$env:USERPROFILE\.dsh-qq-access\config.json"
```

至少要确认这几项：

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

托管模式下，插件会自动把连接配置写进 NapCat，无需重复手动配置。

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
| `reply.group` | 群聊回复模式（默认 `off`） |
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
| `off` | **默认**。只归档，不自动回复 |
| `mention` | 仅响应 @ 和相关主动提及 |
| `smart` | 根据消息内容和兴趣判断是否回复 |
| `all` | 尽可能响应群聊消息 |

`off` 是默认模式（群消息只归档不回）。要用智能回复，在面板里把「群聊回复」改成 `smart`。

它会优先响应被 @、被引用或被叫名字的消息；其他消息则根据对话意图、兴趣词和内容特征进行评分。

默认触发阈值为 3，阈值越高，回复越克制。

### ⏱️ 批量窗口：她为什么"话还没说完就回了"

> **这是咨询里最高频的一条。它不是 bug，是节奏参数没调。**

插件**不是收到一句就回一句**。消息到达后先攒一会儿，等这个窗口过去、没有新消息进来，
才把攒下的合并成一轮去问她。这个等待时间就是**批量窗口**（`reply.debounceMs`）。

默认 **1200 毫秒**。连发几句能合并，但两句话之间只要停顿超过 1.2 秒，就会被判定为
"说完了"，于是她先回一次——这就是"抢话"的由来。

#### 怎么调

面板上暂时没有输入框，改配置文件里的 `reply.debounceMs`（单位：毫秒）：

```json
{
  "reply": {
    "debounceMs": 8000
  }
}
```

改完需要**重启一次 DSH** 才生效。

也可以直接让 DSH 代改，最省事：

> 帮我把 `~/.dsh-qq-access/config.json` 里的 `reply.debounceMs` 改成 `8000`，其它字段不要动，改完告诉我。

#### 挑多少合适

| 值 | 效果 |
| --- | --- |
| `1200`（默认） | 基本立刻回，像在抢话 |
| `5000`–`10000` | 说完一句、停下来想想，她还在等——多数人觉得最自然 |
| `60000` | 相当于放弃即时回复，退回"每分钟统一处理一次"的节奏 |

窗口调大之后回复会变慢，但**不会被切成好几截**：窗口内的多条消息合并成一轮，
靠前的句子仍然通过聊天记录进入上下文，不会丢。

取值范围 `0`–`600000`（10 分钟）。设成 `0` 等于每来一条立刻处理。

### 🔁 避免重复说过的话

> 她连续几轮绕回同一句（开场白、「早点睡」、同一个梗）时用这个。

打开后有两层作用：

1. **提示词约束**：系统提示里明确要求比对 `recent_messages` 里 `direction: "out"` 的内容，不要复述上一条。
2. **机械兜底**：回复生成后，用 2 字滑窗算它和最近 12 条自己发言的相似度。命中阈值就带着「你刚才已经说过类似的」重问一次。

重问**只做一次**。第二次仍然重复就照发——把话咽回去比说重复的话更糟，而且很多时候同一句「晚安」本来就是对的。

面板：【自动回复】→「避免重复说过的话」，可关；下面的「复读相似度阈值」默认 `0.7`：

| 阈值 | 效果 |
| --- | --- |
| `0.7`（默认） | 能抓住「加语气词、换标点、多一句尾巴」这类改写 |
| `0.9` | 只拦几乎逐字相同的 |
| `0.5` | 很宽松，正常换说法也可能被拦 |

配置字段：

```json
{
  "reply": {
    "avoidRepeat": true,
    "repeatThreshold": 0.7
  }
}
```
### 🌧️ 主动消息不重复聊过的事

> 她刚在聊天里说过「今天下雨了」，过一会儿主动消息又说一遍——这个问题单独处理。

**为什么单独处理**：正常回复时上下文里带着最近聊天记录，模型能看见自己说过什么；但主动消息是**另起一个会话**，只带人格、记忆、情感和念头，**完全看不到聊天记录**。

所以做了两层：

| 层 | 做法 |
| --- | --- |
| 生成前 | 从归档里取最近 8 条她自己的发言，连同「这些已经说过了」的禁令一起写进提示词 |
| 生成后 | 拿生成的内容和这 8 条比相似度；命中就重写一次，仍然重复就**放弃这次主动消息** |

**宁可不发，也不发一句刚说过的话。**

#### 判重不只是比字面

同一件事换个说法很常见：

```
「今天下雨了，出门记得带伞」
「外面今天下雨了，别忘了带伞哦」
```

字面相似度只有 `0.50`，但说的是同一件事。所以除了 2 字滑窗覆盖率，还会比对**话题词交集**——要求至少有一个 3 字以上的共同片段（`今天下雨`、`带伞`），避免「今天」这种泛词误判。

#### 怎么调

沿用回复设置的同一个阈值，面板【自动回复】→「复读相似度阈值」：

```json
{
  "reply": {
    "avoidRepeat": true,
    "repeatThreshold": 0.7
  }
}
```

关掉 `avoidRepeat` 会同时关掉回复复读检测和主动消息去重。

#### 代价

主动消息可能因为「想说的都和最近重复」而**静默不发**。这是有意的取舍：

- 想确认是不是被拦了，看 `debug.log` 里的 `repeat-suppressed`
- 确实希望她多说，就把阈值调低到 `0.6`
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

适合：

- Windows x64 用户。
- 没有单独部署 NapCat 的用户。
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
