# 参与开发

## 环境

- Node.js 22.14+（建议 24 LTS）
- Windows x64（托管 NapCat 需要；只跑外部模式则不限平台）

```bash
npm install
```

## 本地检查

提交前先跑这两条：

```bash
npm run check     # 清单字段、文件完整性、语法、客户端 bundle 约定、工具清单一致性
npm test          # 冒烟测试，不需要 DSH 宿主
```

下面三步是手工兜底，覆盖冒烟测试测不到的部分：

```bash
# 1. 语法
for f in index.mjs cli.mjs lib/*.mjs lib/*.js; do node --check "$f"; done

# 2. 真实加载（能抓到「引用了不存在的符号」这类 --check 查不出的问题）
node -e "import('./index.mjs')"

# 3. 只读自检（需要本机有 NapCat）
node cli.mjs doctor
```

仓库目前还没配 CI，上面两条请在提交前手动跑一遍。

## 提交前请确认

- [ ] `lib/tools.mjs` 新增工具后，同步 `lib/access.mjs` 的 `pluginToolNames`
- [ ] 新增配置段后，同步 `lib/ui.mjs` 的 `PATCHABLE`
- [ ] 改了默认值后，同步 `examples/config.example.json` 和 `README.md`
- [ ] 没有把真实 QQ 号、token、cookie 写进代码或文档

前两条是这个项目实际踩过的坑：工具不在白名单里，模型就看不到它；
配置段不在 `PATCHABLE` 里，面板保存时会被静默丢弃。

## 代码约定

- 注释写「为什么」，不写「是什么」
- 涉及取舍的地方，把被放弃的方案也写出来
- 失败要降级而不是抛穿：情感分析失败退回关键词、链接解析失败退回纯链接

## 安全问题

发现安全问题请不要开公开 issue，直接联系维护者。

重点关注的区域：

- `onebot.apiUrl` 的地址校验
- 工具权限（`AccessControl.guard` / `target` / `requireManager`）
- 写操作的幂等账本
- 外部 URL 的 SSRF 防护（`lib/anysearch.mjs` 的 `isPublicHttpUrl`）