# 接口依据

核对日期：2026-10-27（Asia/Taipei）。以下为项目维护方的文档、源码或公开包；网页和分支会随上游更新。

## DeepSeek Harness

- [官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [工具输出与执行契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-tool.md)
- [协议驱动、工具及权限扩展点](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md)
- [Agent 创建、setup、followup 与 whenIdle](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)
- [工具注册、限制与 guard](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)
- [宿主消息工厂](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/message.ts)
- [插件管理、安装来源与 profile](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/plugin-manager/README.md)
- [桌面宿主与外部插件依赖解析](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-08-desktop-bundled-runtime-and-external-plugins.md)

此外检查了 npm 发布的 `@deepseek-ai/dsh-tools@0.2.1-rc.4` 与 `@deepseek-ai/dsh-llm@0.2.1-rc.4`。本插件对输入参数做自行校验，并使用 canonical object output，避免把不受宿主 JSON Schema 子集支持的数值边界字段放进工具 schema。

## NapCat

- [维护方文档](https://napneko.github.io/guide/napcat)
- [网络配置源码](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/config/config.ts)
- [HTTP 上报的 token 与 X-Signature 生成逻辑](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/network/http-client.ts)
- [私聊历史源码](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/action/go-cqhttp/GetFriendMsgHistory.ts)
- [群聊历史源码](https://github.com/NapNeko/NapCatQQ/blob/main/packages/napcat-onebot/action/go-cqhttp/GetGroupMsgHistory.ts)
- [维护方私聊历史接口说明](https://napcat.apifox.cn/226659174e0)

上报签名依据源码确认：HTTP 客户端的 `token` 作为 HMAC-SHA1 密钥，对实际上报 JSON 字节签名。历史接口的 `message_seq` 使用字符串，首次查询为 `"0"`。

## 0.2.0 托管运行包

- [固定官方 Release v4.18.41](https://github.com/NapNeko/NapCatQQ/releases/tag/v4.18.41)
- [该 Release 的资产元数据](https://api.github.com/repos/NapNeko/NapCatQQ/releases/tags/v4.18.41)
- [官方 Windows Node 运行包组装流程](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/.github/workflows/release-publish.yml)
- [Node 运行包入口](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/packages/napcat-develop/index.js)
- [工作目录覆盖规则](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/packages/napcat-common/src/path.ts)
- [账号专用配置命名](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/packages/napcat-core/helper/config-base.ts)
- [OneBot 配置名 onebot11](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/packages/napcat-onebot/config/index.ts)
- [WebUI 配置字段](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/packages/napcat-webui-backend/src/helper/config.ts)
- [上游许可证](https://github.com/NapNeko/NapCatQQ/blob/v4.18.41/LICENSE)
- [流式 ZIP 读取库 yauzl](https://github.com/thejoshwolfe/yauzl)

安装规格固定为 `NapCat.Shell.Windows.Node.zip`，大小 124089498 字节，SHA256 为 `51fbb10e7bcd56b0c2a6de86c37811e7518330e48a137ac689ab1e4d8627d3f0`。此摘要已与实际下载文件匹配。官方引擎以独立进程启动，原始代码及二进制不包含在本插件交付压缩包中，安装时从上游下载。

管理器通过 `NAPCAT_WORKDIR` 把可写配置与日志放在专用目录；生成 `onebot11_<QQ号>.json` 和 `webui.json`。原生启动方式与官方 `napcat.bat` 一致：运行包自己的 `node.exe index.js`，追加 `-q <QQ号>` 供 QQ 登录逻辑使用。

## QQ 空间浏览器

- [Playwright 持久登录状态](https://playwright.dev/docs/auth)
- [Playwright Frame API](https://playwright.dev/docs/api/class-frame)
- [Playwright 输入操作](https://github.com/microsoft/playwright/blob/main/docs/src/input.md)
- [现有留言板嵌套编辑器结构的历史代码参考](https://gist.github.com/Arnoldnuo/be81413ca2b0461fde98)

留言板 DOM 参考属于历史页面结构线索，不能证明 2026 年所有账号的当前页面一致。因此选择器可配置，且没有把本环境未执行的真实空间测试写成成功。插件通过浏览器自身的登录状态工作，不要求向 Harness 粘贴 QQ 密码或浏览器 Cookie。

## 官方 QQ Bot 插件的区别

[腾讯维护的 dsh-qqbot](https://github.com/tencent-connect/dsh-qqbot) 提供 QQ Bot 通道。本项目要处理个人账号会话和空间留言，因而采用不同的接入实现，不把官方机器人接口描述成个人 QQ 全账号读取接口。

本项目仅参考公开接口契约与结构，交付的适配层和业务实现为新写代码。第三方运行依赖依其各自许可证分发。
