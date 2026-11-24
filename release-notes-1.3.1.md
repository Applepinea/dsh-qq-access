# dsh-qq-access 1.3.1

修一个会让图片「看不见」的问题。

## 修复：批量窗口内先发图再补文字，图片会丢

### 现象

发一张图，再补一句文字，她回你「图片没加载出来诶」。

### 原因

批量回复每批只把**最后一条**消息当触发消息：

```js
const last = messages.at(-1);
... this.reply(last)
```

而 `reply()` 只从**这条**消息里取图：

```js
if (message.images?.length) content.push(...await this.imageParts(message, signal));
```

「先发图、再补一句文字」是最常见的发图方式，触发消息通常是后面那句纯文字，于是图片被整个丢掉。模型只能看到 `recent_messages` 里的「[图片]」两个字，自然以为图没加载出来。

这不是模型不支持图片——`deepseek-flash` 在 DSH 的模型目录里声明的是 `inputModalities: ['text', 'image']`，它有视觉能力，只是没拿到图。

### 修复

| 位置 | 改动 |
| --- | --- |
| `lib/util.mjs` | 新增 `collectBatchImages()`：按 `url`/`file` 去重，超上限保留最新的几张 |
| `lib/util.mjs` | 新增 `batchTrigger()`：正文用最后一条，图片用整批合并 |
| `lib/runtime.mjs` `flushPending` | 改用 `batchTrigger` |
| `lib/runtime.mjs` `restorePending` | 重启恢复时从最近几条入站消息合并图片 |

## 验证

- 119 项冒烟测试全过
- 新增测试直接复现归档里的真实场景：

```
238 in  [图片]
239 in  这个看着挺适合你的
240 out 图片没加载出来诶
```

- 反向验证：把 `batchTrigger` 退回「只返回最后一条」→ 测试立即变红 → 恢复后转绿

## 升级

```bash
npm i -g dsh-qq-access@1.3.1
```

或者在面板里换成 `dsh-qq-access-1.3.1.tgz`。

改的是插件代码，升级后需要**重启 DSH**。

配置向后兼容，不需要改 `config.json`。

## 怎么确认修好了

重启后发一张图，再补一句话，然后看：

```
%USERPROFILE%\.dsh-qq-access\debug.log
```

出现这几行说明图片真的进了模型：

```
image attachments function
image bytes <字节数>
image media image/jpeg
```
