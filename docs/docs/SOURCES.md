# 接口依据与上游来源

本插件的接口实现参考了以下公开文档与源码。网页和分支会随上游更新，
这里记录的是核对时的依据。

## DeepSeek Harness

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [工具输出与执行契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)
- [协议驱动、工具及权限扩展点](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)
- [Agent 创建、setup、followup 与 whenIdle](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)
- [工具注册、限制与 guard](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)
- [宿主消息工厂](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/message.ts)

插件侧的关键约束：

| 约束 | 影响 |
| --- | --- |
| `Session` 只有 `seq` / `eventAt()`，没有 `events` 数组 | 用模块级 `sessionEventList()` 兼容两种形状 |
| `agents.create()` 需要显式 `agentOptions` | 不传的话会话建了但零事件 |
| `tools.restrict({allow})` 在模型看到工具之前过滤 | 白名单漏一个，那个工具就等于不存在 |
| `output.render()` 决定模型看到什么 | 图片必须原样透传，否则模型看不到 |

## OneBot v11 / NapCat

- [OneBot v11 标准](https://github.com/botuniverse/onebot-11)
- [NapCatQQ](https://github.com/NapNeko/NapCatQQ)

用到的接口：

| 接口 | 用途 |
| --- | --- |
| `send_private_msg` / `send_group_msg` | 发消息，支持消息段数组 |
| `get_msg` | 按 id 取消息原文（引用上下文） |
| `get_friend_list` / `get_group_list` / `get_group_member_info` | 联系人与群资料 |
| `get_cookies` | 取 QQ 空间 cookie（`uin` / `skey` / `p_skey`） |
| `get_group_msg_history` | 轮询补漏 |
| `delete_msg` | 撤回自己发的消息 |

NapCat 运行包固定为官方 `v4.18.41` Windows Node 版本，安装前校验大小与 SHA256。

## QQ 空间

- 接口通过 NapCat 的 cookie 访问 `user.qzone.qq.com`
- `g_tk` 由 `p_skey` 做 DJB 哈希得出：`hash = 5381; hash += (hash<<5) + ch; hash & 0x7fffffff`
- 说说用 `topicId = {hostUin}_{tid}__1` 定位
- 响应可能是 JSONP，也可能是 HTML 包裹的 `frameElement.callback({...})`

早期版本用 Playwright 驱动真实网页，问题包括：评论落到错误的说说、冷启动 30 秒超时、
`skey` 几小时失效、每次操作弹窗。改成纯 HTTP 后这些问题都不存在。

## 集成的上游插件

以下项目是 AstrBot 插件，实现语言不同，这里是按其机制重新实现，不是移植代码。

| 项目 | 集成了什么 | 丢弃了什么 |
| --- | --- | --- |
| [astrbot_plugin_parser](https://github.com/) | 6 个平台的链接解析思路 | 平台特有的鉴权细节 |
| [astrbot_plugin_meme_manager](https://github.com/) | 表情包图库、按情绪检索 | 命令式管理界面 |
| [astrbot_plugin_stealer](https://github.com/) | 自动收集表情 | — |
| [astrbot_plugin_qzone_pr](https://github.com/) | QQ 空间读写 | 浏览器自动化 |
| [astrbot_plugin_qq_tools](https://github.com/) | 戳一戳、点赞、群管理 | — |
| [astrbot_plugin_anysearch](https://github.com/) | MCP 联网搜索 | — |
| [astrbot_plugin_virtual_life](https://github.com/) | 一周日程 + 穿搭 + 三餐 | 每日重新生成、打断评分 |
| [EmotionAI-Pro](https://github.com/asakiyoshi/EmotionAI-Pro) | 8 维情感、好感/亲密度双核、四阶段、滞后带、过渡保护、负好感区制 | 排行榜、缓存统计、备份轮转等命令功能 |

### EmotionAI-Pro 的具体取舍

保留（会改变她说话的方式）：

- 8 维情感模型：joy / trust / fear / surprise / sadness / disgust / anger / anticipation
- 好感度（-100~100）与亲密度（0~100）双核
- 四阶段：初识 → 深化 → 承诺 → 共生
- 5 分滞后带，防止阶段在边界抖动
- 过渡保护：进阶后复合分不低于上一阶段峰值
- 亲密度增益：过渡期 ×4.0 / ×3.6 / ×3.0 / ×1.0
- 负好感独立区制：冷淡 / 反感 / 敌对，此时亲密度权重归零
- 关键词强度分析（模型不可用时的降级路径）

丢弃（只为命令界面存在）：

- `/好感排行`、`/负好感排行`、`/关系阶段`
- `/缓存统计`、`/备份数据`、`/修复互动统计`
- `/调试事件`、`/调试记忆`
- TTL 缓存分片、备份轮转

## 依赖

| 包 | 用途 |
| --- | --- |
| `yauzl` | 解压 NapCat 运行包 |

QQ 空间不需要浏览器，所以没有 Playwright 依赖。