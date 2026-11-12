# 外部模式（连接已有 NapCat）

插件默认托管 NapCat：自己下载、自己启动、自己维护扫码页。
如果你的机器上已经有一个正在运行的 NapCat / OneBot v11 实现，可以改成外部模式，
插件只做客户端，不再管理进程。

## 什么时候用外部模式

| 场景 | 建议 |
| --- | --- |
| 单机、只有一个 QQ 号 | 用默认的托管模式 |
| 已经有 NapCat 在跑，且不想让插件再起一个 | 外部模式 |
| NapCat 跑在另一台机器 / 容器里 | 外部模式，但见下面的安全限制 |
| 用别的 OneBot v11 实现（非 NapCat） | 外部模式；QQ 空间功能会不可用 |

## 配置

```json
{
  "napcat": { "mode": "external" },
  "onebot": {
    "apiUrl": "http://127.0.0.1:3000",
    "token": "至少 16 位的 token"
  },
  "events": {
    "port": 5701,
    "secret": "至少 16 位的事件签名密钥"
  }
}
```

改完重载插件。

### 字段说明

| 字段 | 说明 |
| --- | --- |
| `napcat.mode` | `managed`（默认）或 `external` |
| `onebot.apiUrl` | OneBot HTTP API 地址，**必须是本机回环地址** |
| `onebot.token` | API token，至少 16 位 |
| `events.port` | 插件监听的上报端口，默认 5701 |
| `events.secret` | 事件签名密钥，至少 16 位 |

## 为什么 API 只能绑本机

`onebot.apiUrl` 强制校验为 `127.0.0.1` / `localhost` / `::1`，并且不允许内嵌凭据、
query 或 fragment。

原因：OneBot 的 HTTP API 没有细粒度权限，拿到 token 就等于能以你的 QQ 身份
发消息、加好友、退群。把这样一个接口暴露在网络上，风险远大于便利。

如果 NapCat 在别的机器上，正确做法是在本机做端口转发（SSH tunnel），
让插件仍然连 `127.0.0.1`。

## 在 NapCat 侧要配的两件事

1. **HTTP 服务端**：地址填 `127.0.0.1:3000`，token 与配置里的 `onebot.token` 一致。
2. **HTTP 上报**：地址填 `http://127.0.0.1:5701`，签名密钥与 `events.secret` 一致。

上报必须包含消息事件，否则插件收不到任何消息。

## 外部模式下会失去什么

| 能力 | 影响 |
| --- | --- |
| 自动启动 / 重启 | 需要自己保证 NapCat 常驻 |
| 扫码页自动打开 | 需要自己处理登录 |
| 读取 NapCat 安装信息 | `doctor` 的 NapCat 段会显示为不可用 |
| QQ 空间 | 仍然可用——它只依赖 `get_cookies` 接口 |

QQ 空间走的是 NapCat 的 `get_cookies`，不依赖托管模式。只要 NapCat 能返回
`user.qzone.qq.com` 的 cookie，空间功能就能用。

## 排查

`node cli.mjs doctor` 会检查：

- API 是否可达，以及几个基础接口是否返回正常
- 事件端口是否被占用
- QQ 空间 cookie 是否包含 `p_skey`

```powershell
node cli.mjs doctor
```

输出里的 `endpoints` 每项都会标明 `ok` 或具体错误。

### 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `QQ 正在启动、等待扫码或已断开` | 插件没连上 API | 确认 NapCat 在跑、token 一致 |
| 收不到消息但能发 | 上报没配或签名密钥不一致 | 检查 NapCat 的 HTTP 上报配置 |
| `QQ 空间返回了非 JSON 内容` | cookie 过期 | 在 QQ 客户端重新登录，插件会自动重新取 cookie |
| 端口 5701 被占用 | 有另一个实例在跑 | 关掉旧实例，或改 `events.port` |

## 安全清单

- [ ] `onebot.apiUrl` 指向回环地址
- [ ] `onebot.token` 不少于 16 位，且不是默认值
- [ ] `events.secret` 不少于 16 位
- [ ] NapCat 的 HTTP 服务没有监听 `0.0.0.0`
- [ ] 配置文件权限仅本人可读（Linux 上 `chmod 600`）