# dsh-qq-access 功能总览

把 DeepSeek Harness 接到个人 QQ：NapCat 托管安装与扫码登录、私聊/群聊 AI 回复（含图片理解）、本地消息归档、QQ 空间读写，带左侧栏管理面板。

## 安装

从 npm 装：

```bash
dsh plugin --profile desktop add dsh-qq-access
```

或下载本页的 `dsh-qq-access.tgz`，用它的完整路径装：

```powershell
dsh plugin --profile desktop add "$env:USERPROFILE\Downloads\dsh-qq-access.tgz"
```

装完重启 DSH，左侧栏出现「QQ 接入」。首次使用先跑一次 `node cli.mjs setup` 生成配置。

## 功能

- **长期记忆**：按「人」记住聊过的事，**同一个人在群里和私聊共用一份记忆**——群里说过养猫，私聊里问起她能想起来，反之亦然。之前情感和历史都按会话存，群聊的 peerId 是群号，所以同一个人在两处是两份互不相干的档案，这是本版修掉的架构缺陷。记忆会淡忘但不删除（半衰期默认 30 天），靠共享稀有词召回，身份/喜好/约定这类事实常驻不参与竞争。同一件事用「对象.方面」的事实键只留最新一条。默认关闭。
- **群聊智能回复**：新增 `smart` 档（现在的默认值）。被 @、被引用、被叫名字一律回；否则按「像在对人说话 / 群体提问 / 命中兴趣词」打分，够阈值才回。阈值和兴趣词都能在面板调，她回过的话题会带衰减地学习。沉默是默认。
- **情感与关系**：8 维情感（喜悦 / 信任 / 恐惧 / 惊讶 / 悲伤 / 厌恶 / 愤怒 / 期待）+ 好感度（-100~100）/ 亲密度（0~100）双核，四阶段演进（初识 → 深化 → 承诺 → 共生）。带 5 分滞后带防止阶段横跳、过渡保护防止进阶后分数倒退、负好感独立区制（冷淡 / 反感 / 敌对，此时亲密度权重归零）。变化幅度由代码钳制（好感 ±5、情感 ±3）。默认关闭。
- **时间感**：每条历史消息带上「绝对时间 + 多久以前 + 与上一条的间隔」，上一轮超过 2 小时时单独提示。之前 `recent_messages` 完全没有时间字段，模型会把一周前的话当成刚刚说的。
- **主动发 QQ 空间动态**：在设定时间窗内由模型自己写说说。时间槽按日期哈希（重启不换时间）、每日发送概率按日期抽签（不会被轮询次数放大）、先落盘再发布（断线重试不会写出第二条）、`uncertain` 不自动重发。
- **能力清单独立成层**：38 个工具各自「什么时候该用」，作为独立提示词层注入，和面板里可编辑的人格分开。并按当前会话实际可调用的工具过滤，群聊里只列那 3 个。
- **真实天气进穿搭**：接和风天气，生成虚拟人生时把未来一周的实际温度和阴晴写进提示词。每套穿搭带 `weather` 标签和 `tempMin`/`tempMax` 温度区间，抽取时按当天天气筛一遍，只在合适的里面选。白天晚上分开抽——白天多云夜里下雨的日子，白天穿正常衣服，晚上换成防水那套。默认关闭，需要在面板填和风的 API Host 和 Key。
- **主动消息**：按日程里的「想说点什么」窗口主动发消息，走现有轮询不新增定时器。配额按「次」算（一条消息拆成几段只占一次），发送时间按日期播种随机（同一天固定、跨天不同、重启不变——在轮询里现抽会退化成永远取最早）。面板可配每日次数、最小间隔、时间随机幅度、补发窗口宽度、内容方向，还有「立即测试」按钮和运行状态（今天发了几次、下次窗口几点）。默认关闭。- **会话连续性可调**：面板上能调「重建后补多少条历史」（`reply.contextMessages`，默认 20）和「会话保留时间」（`reply.idleMs`，0 = 永不回收）。重启或空闲超时后 agent 会重建，能接上多少「上次说到哪」由前者决定。
- **权限在工具层强制**：38 个工具各自按会话身份过滤。陌生人只放行 3 个只读工具（看状态、读自己历史、撤回自己消息），群里管理员身份不继承。涉及会话的工具还有第二道 `target()` 校验，跨会话读写一律拒绝。
- **不可信输入有边界**：聊天记录、昵称、QQ 空间、网页正文、搜索结果、图片里的文字都标为外部数据，其中的指令性语句不能当作要求。工具返回的外部文本统一包成 `{ untrusted: true, text }`。- **其他**：归档可设 `retentionDays: 0` 永久保存；虚拟人生（一周日程 + 穿搭池 + 三餐池）；表情包图库（按情绪搜索、自动收集、模型分类）；联网搜索与网页正文提取；B 站 / YouTube / 推特 / 小红书 / Instagram / 小黑盒链接解析。
- **会话连续性可调**：面板上能调「重建后补多少条历史」（`reply.contextMessages`，默认 20）和「会话保留时间」（`reply.idleMs`，0 = 永不回收）。重启或空闲超时后 agent 会重建，能接上多少「上次说到哪」由前者决定。
- **其他**：归档可设 `retentionDays: 0` 永久保存；虚拟人生（一周日程 + 穿搭池 + 三餐池）；表情包图库（按情绪搜索、自动收集、模型分类）；联网搜索与网页正文提取；B 站 / YouTube / 推特 / 小红书 / Instagram / 小黑盒链接解析。

## 破坏性变更

**移除 Playwright。** QQ 空间早已改成 NapCat cookie + 纯 HTTP，浏览器实现是死代码。`qzone` 段现在只有 `enabled` / `timeoutMs` / `cookieTtlMs` 三个字段，以下字段会被忽略：

`channel`、`headless`、`profileDir`、`editorFrame`、`guestbookFrame`、`submitSelector`、`itemSelector`、`shuoshuoFrame`

`node cli.mjs qzone-login` 命令已移除——空间登录复用 QQ 客户端，不需要单独扫码。

## 参考的项目

以下都是 AstrBot 插件，语言不同，这里是按其机制重新实现，不是移植代码：

- [EmotionAI-Pro](https://github.com/asakiyoshi/EmotionAI-Pro) —— 8 维情感、好感/亲密度双核、四阶段、滞后带、过渡保护、负好感区制
- [dsh-fish-memory](https://github.com/Yuuyuko-uu/dsh-fish-memory) —— 会淡忘的长期记忆、证据门槛召回、事实常驻、事实键去重
- [astrbot_plugin_meme_manager](https://github.com/anka-afk/astrbot_plugin_meme_manager) —— 表情包图库与按情绪检索
- [astrbot_plugin_stealer](https://github.com/nagatoquin33/astrbot_plugin_stealer) —— 表情自动收集
- [astrbot_plugin_qzone_pr](https://github.com/Nya-Nya-Hoshino/astrbot_plugin_qzone_pr) —— QQ 空间读写
- [astrbot_plugin_anysearch](https://github.com/AgIzT/astrbot_plugin_anysearch) —— Anysearch 联网检索
- `astrbot_plugin_parser` / `astrbot_plugin_virtual_life` / `astrbot_plugin_qq_tools` —— 链接解析、虚拟生活、戳一戳与群管理（插件市场同名插件）

EmotionAI-Pro 只保留了会改变说话方式的机制，丢弃排行榜、缓存统计、备份轮转等只为命令界面存在的部分。fish-memory 丢弃了旧档案导入和清洗补键，只保留「记住谁、想起什么」这一层。

## 已知限制

- 群聊判断是启发式的，会漏判也会误判；阈值和兴趣词可调
- 记忆召回靠词面匹配，换一种说法可能想不起来；事实类常驻不受影响
- 情感分析默认多调一次模型，关掉后退回关键词分析
- 只有冒烟测试，没有行为测试；真实行为需要真实 QQ 环境验证
- 大规模群聊（数百人高频）未压测，长时间连续运行未做稳定性测试
- 托管模式仅 Windows x64，其他平台用[外部模式](docs/EXTERNAL_MODE.md)
- 图片说说、空间留言板未实现

## 环境

- Node.js ≥ 22.14，DSH ≥ 0.2.1-rc.3
- NapCat 托管仅 Windows x64；其他平台用外部模式（见 `docs/EXTERNAL_MODE.md`）
- QQ 空间不需要浏览器

---

为什么这样实现、踩过哪些坑，见仓库里的 `CHANGES-LOCAL.md`。
