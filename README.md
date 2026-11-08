# dsh-qq-access

把个人 QQ 接进 DeepSeek Harness。能收发私聊群聊、看图和发表情、读写 QQ 空间，
还给她加了一点自己的生活：今天在做什么、穿什么、吃了什么，对谁好感多少，记得谁说过什么。

Windows x64 上连 NapCat 都不用自己装。第一次启动会自动下载官方运行包，
之后跟着 Harness 一起起，扫一次码就一直能用。

---

## 功能

| 能干什么 | 说明 |
| --- | --- |
| 接入 | NapCat 自己装自己起，断线会重连；也能连你已经有的实例 |
| 聊天 | 私聊群聊分开配；长回复按逗号换行拆成几条发，间隔随字数变 |
| 群里插话 | 被 @、被引用、被叫名字一定回；其他看内容她感不感兴趣 |
| 看图 | 收到的图她真的能看到；也能发图、发小黄脸、发表情包 |
| 链接 | B 站、YouTube、推特、小红书、Instagram、小黑盒，发之前先读一遍再聊 |
| QQ 空间 | 读说说、发说说、评论、删除；还能按时间窗自己发动态 |
| 表情包 | 有个本地图库，按情绪搜，自动收集，模型自己打标签 |
| 虚拟人生 | 一周的日程 + 一堆穿搭 + 三餐，生成一次用一周 |
| 好感度 | 8 维情绪 + 好感 + 亲密，四个阶段，说话语气跟着变 |
| 联网 | 实时搜索、抓网页正文、一次搜好几路 |
| 记得多久前 | 每条历史都标了「几分钟前 / 昨天 / 上周」，隔太久会提醒她 |
| 长期记忆 | 按人记，同一个人在群里和私聊共用一份；会淡忘但不会删 |

## 安装

**方式一：从 npm 装**（推荐，升级时重跑一次即可）**（由于我忘了 npm 密码账号被冻结了 72 小时 QAQ，npm 我还没更新到最新版，先用方式二）**

```powershell
dsh plugin --profile desktop add dsh-qq-access
```

**方式二：下载 tgz**（连不上 npm 时用）

1. 打开 [Releases](https://github.com/Applepinea/dsh-qq-access/releases/latest)，下载 `dsh-qq-access.tgz`。
   同一个 Release 里还有个带版本号的 `dsh-qq-access-1.0.1.tgz`，两个文件内容完全一致，下哪个都行。

2. 用下载后的完整路径安装（PowerShell 里路径带空格要加引号）：

```powershell
dsh plugin --profile desktop add "$env:USERPROFILE\Downloads\dsh-qq-access.tgz"
```

装完重启 DSH，左侧栏出现「QQ 接入」。

`--profile` 要和实际启动的环境一致：桌面端用 `desktop`，网页端用 `web`。

### 首次配置

配置默认在 `%USERPROFILE%\.dsh-qq-access\config.json`，两种生成方式任选一种。

**跑向导**：在插件目录下执行（不确定装到哪了就用下面那种）：

```powershell
node cli.mjs setup
```

**手写配置**：把 `examples/config.example.json` 复制到
`%USERPROFILE%\.dsh-qq-access\config.json`，至少改这三项：

- `selfId`：登录的 QQ 号
- `onebot.token`：16 位以上随机字符串
- `events.secret`：16 位以上随机字符串

托管模式下这两个值会自动写进 NapCat 的 OneBot 配置，不用另外填一遍。
改完重启，剩下的项都能在面板里调，不用再碰文件。

### 还有几个命令

以下命令都在插件目录下执行。

| 命令 | 用途 |
| --- | --- |
| `node cli.mjs setup` | 生成配置文件 |
| `node cli.mjs doctor` | 只读检查：连接、NapCat、QQ 空间 cookie |
| `node cli.mjs napcat-install` | 预下载 NapCat 运行包 |
| `node cli.mjs napcat-enable` | 切换为托管模式 |
| `node cli.mjs napcat-login` | 重新打开扫码页 |

## 配置

配置文件在 `~/.dsh-qq-access/config.json`。下面这些大部分能在面板里直接改，改完就生效，不用重启。

| 键 | 说明 |
| --- | --- |
| `selfId` | 登录的 QQ 号 |
| `ownerIds` | 管理员 QQ 号，只有这些人能用跨会话工具 |
| `access.privateMode` / `groupMode` | `all` / `allowlist` / `disabled` |
| `reply.private` | 私聊是否自动回复 |
| `reply.group` | `off` / `mention` / `smart` / `all` |
| `reply.smartThreshold` | smart 模式的阈值（1–10，越高越安静） |
| `reply.selfNames` | 她在群里的别名，被叫到就回 |
| `reply.interests` | 感兴趣的话题词 |
| `memory` | 长期记忆：`enabled`、`halfLifeDays`（半衰期）、`recallLimit`、`factLimit`、`minScore`、`dailyQuota`、`useModel`、`inject` |
| `retentionDays` | 归档保留天数；`0` 表示永久保存 |
| `emotion` | 情感与关系：开关、隐私级别、分析模型 |
| `qzoneProactive` | 主动发动态：每天条数、发送概率、时间窗、时段语气 |
| `model` | 指定 provider / model；留空跟随 Harness 默认 |

### 人格和能力是分开的两层

系统提示分成两个独立 section，面板只能改前一层：

| 层 | 内容 | 来源 |
| --- | --- | --- |
| `qq-access-persona` | 她是谁、怎么说话、输出格式 | 面板「人格设定」，可编辑 |
| `qq-access-capabilities` | 38 个工具各自「什么时候该用」 | 插件内置 `lib/capabilities.mjs` |

这么分是因为：能力清单要是塞进人格里，你在面板改一次人格就把它冲掉了，
人格一长还容易把它挤出模型的注意力。另外能力层会看这个会话实际能调哪些工具，
群聊里只有 3 个可用，就只列那 3 个。

## 群里什么时候回

`smart` 模式（默认）分两类：

**无条件回复**：被 @、引用了她的消息、正文出现她的名字或 QQ 号。

**打分**（够阈值才回）：

| 信号 | 分值 |
| --- | --- |
| 像在对人说话（「你在干嘛」） | 3 |
| 向群里提问（「有没有人知道」） | 3 |
| 单独的 `？` 结尾 | 2 |
| 命中一个兴趣词 | 3（每多一个 +1） |
| 命中学习到的话题 | 2 + 命中次数 |
| 内容超过 30 字 | 1 |

默认阈值 3。这些规则只会让「该回」的理由变多，不会变少；没信号就不吭声。

## 好感度怎么涨怎么掉

8 维情感（喜悦 / 信任 / 恐惧 / 惊讶 / 悲伤 / 厌恶 / 愤怒 / 期待）
加好感度（-100~100）与亲密度（0~100）双核，四个阶段：

| 阶段 | 进入门槛 | 特征 |
| --- | --- | --- |
| 初识期 | — | 好感驱动 |
| 深化期 | 复合分 ≥ 55 | 互动平衡 |
| 承诺期 | 复合分 ≥ 80 | 亲密主导 |
| 共生期 | 复合分 ≥ 95 | 完全融合 |

好感掉到负数会换一套算法：冷淡期 / 反感期 / 敌对期，这时候亲密度不算数了。
阶段之间有 5 分滞后带，刚升上去不会因为掉一两分就退回来。

每轮能变多少是代码写死的（好感 ±5、情感 ±3），模型自己说了不算，不然一晚上就能刷满。

## 她知道自己上次聊天是多久前

每条历史消息都带：

```json
{ "time": "2026-11-06 20:30", "ago": "昨天晚上", "since_previous": "20 小时" }
```

上一轮超过 2 小时，还会单独提示一句「这是很久以前的事了」。
之前没这些字段的时候，她会把一周前说的话当成刚刚说的。

## 谁能干什么

- API、事件接收和登录页都只绑 `127.0.0.1`，外面连不进来。
- 普通 QQ 好友只能读自己这个会话的历史，跨会话、动文件、跑命令都不行。
- 管理员身份只看传输层认出来的私聊账号，群里一律当普通成员。
- 发消息、发说说、评论都有幂等账本，同一个 `request_id` 重试不会发两遍。
- 返回 `uncertain` 就是「不确定发没发出去」，不会当成成功，也不会自己重发。

## 出问题了先看这里

`node cli.mjs doctor` 只看不发，跑它不会给谁发消息。还没扫码的时候 API 连不上是正常的。

日志在 `data/napcat/logs/console.log`。里面有二维码和登录密钥，别往外发。

## 开发

```bash
npm install
npm run check         # 清单字段、文件完整性、语法、客户端 bundle 约定、工具清单一致性
npm test              # 冒烟测试，不需要 DSH 宿主
node cli.mjs doctor   # 只读自检，需要本机有 NapCat
```

`check` 里有一项是比对工具清单和白名单。这个坑我踩过五次，加了工具忘了同步，
结果工具注册了模型却永远看不到它。

仓库目前还没配 CI，上面几条请在提交前手动跑一遍。

## 更多文档

| 文档 | 写了什么 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么 |
| [CHANGES-LOCAL.md](CHANGES-LOCAL.md) | 开发记录，为什么这么写、踩过哪些坑 |
| [docs/EXTERNAL_MODE.md](docs/EXTERNAL_MODE.md) | 已经有 NapCat 了怎么接 |
| [docs/VALIDATION.md](docs/VALIDATION.md) | 哪些测过、哪些没测 |
| [docs/SOURCES.md](docs/SOURCES.md) | 接口从哪查的、参考了哪些项目 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 想改代码的话看这个 |

## 许可

MIT，见 [LICENSE](LICENSE)。