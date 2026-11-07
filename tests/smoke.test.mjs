// 冒烟测试：不需要 DSH 宿主即可运行，覆盖清单约定与配置校验。
//
// 这里刻意只测「不依赖宿主、不依赖网络」的部分：清单指向的文件真实存在、
// 配置校验的边界。真正需要宿主的部分（导出形状）在没有装宿主时自动跳过。
// 行为验证需要真实 QQ 环境，见 docs/VALIDATION.md。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { allowConversation, normalizeConfig } from '../lib/config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fakeConfigPath = join(tmpdir(), 'dsh-qq-access-test', 'config.json');

// index.mjs 在 apply() 里动态导入 @deepseek-ai/dsh-llm；没有宿主时跳过那项检查。
const hasHost = existsSync(join(root, 'node_modules', '@deepseek-ai', 'dsh-llm'));

const minimal = () => ({
  selfId: '10001',
  onebot: { token: 'a'.repeat(24) },
  events: { secret: 'b'.repeat(24) },
});

test('插件导出的形状符合 dsh 约定', { skip: hasHost ? false : '需要宿主 @deepseek-ai/dsh-llm' }, async () => {
  const plugin = await import('../index.mjs');
  assert.equal(plugin.name, 'qq-access');
  assert.ok(Array.isArray(plugin.inject));
  // llm 是必需的：index.mjs 用它取 createUserMessage。
  assert.deepEqual(plugin.inject, ['agents', 'tools', 'systemPrompt', 'llm']);
  assert.equal(typeof plugin.apply, 'function');
});

test('package.json 的 dsh 声明指向真实文件', () => {
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(existsSync(join(root, pkg.dsh.bundle.patch)), '补丁文件缺失');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.ok(existsSync(join(root, pkg.exports['./client'])), '客户端 bundle 缺失');
});

test('cordis 补丁声明了插件条目', () => {
  const yml = readFileSync(join(root, pkg.dsh.bundle.patch), 'utf8');
  assert.match(yml, /insert:/);
  assert.match(yml, /id:\s*qq-access/);
  assert.match(yml, /configPath/);
});

test('客户端 bundle 只 require 已声明为 external 的宿主模块', () => {
  const externals = pkg.dsh?.client?.external ?? [];
  const bundle = readFileSync(join(root, pkg.exports['./client']), 'utf8');
  assert.ok(bundle.includes('__ModuleLoader__.load'), '应使用宿主 ModuleLoader 包装');
  const required = [...bundle.matchAll(/require\("([^".][^"]*)"\)/g)].map((m) => m[1]);
  const missing = [...new Set(required)].filter((id) => !externals.includes(id));
  assert.deepEqual(missing, [], `这些模块没在 dsh.client.external 里声明：${missing.join(', ')}`);
});

test('配置默认可用于外部模式', () => {
  const config = normalizeConfig(minimal(), fakeConfigPath);
  assert.equal(config.napcat.mode, 'external');
  assert.equal(config.reply.private, true);
  // 1.0.0 起群聊默认是 smart（感兴趣 / 与自己有关 / 被 @）。
  assert.equal(config.reply.group, 'smart');
  assert.equal(config.reply.smartThreshold, 3);
  assert.equal(config.access.privateMode, 'all');
  assert.equal(config.retentionDays, 30);
  assert.equal(config.poll.enabled, true);
  assert.equal(config.selfId, '10001');
  // 情感与主动发动态默认关闭，避免升级后突然多出行为。
  assert.equal(config.emotion.enabled, false);
  assert.equal(config.qzoneProactive.enabled, false);
});

test('QQ 空间不再需要浏览器配置', () => {
  const config = normalizeConfig(minimal(), fakeConfigPath);
  assert.deepEqual(Object.keys(config.qzone).sort(), ['cookieTtlMs', 'enabled', 'timeoutMs']);
  assert.equal(config.qzone.cookieTtlMs, 600000);
});

test('缺少 token 或 secret 时拒绝启动', () => {
  assert.throws(() => normalizeConfig({ selfId: '10001' }, fakeConfigPath), /token/);
  const noSecret = minimal();
  delete noSecret.events.secret;
  assert.throws(() => normalizeConfig(noSecret, fakeConfigPath), /secret/);
});

test('管理员不能与登录号相同', () => {
  assert.throws(
    () => normalizeConfig({ ...minimal(), ownerIds: ['10001'] }, fakeConfigPath),
    /另一个 QQ 号/,
  );
});

test('group 模式只接受四档之一', () => {
  for (const mode of ['off', 'mention', 'smart', 'all']) {
    assert.equal(normalizeConfig({ ...minimal(), reply: { group: mode } }, fakeConfigPath).reply.group, mode);
  }
  assert.throws(() => normalizeConfig({ ...minimal(), reply: { group: 'nope' } }, fakeConfigPath), /off \/ mention \/ smart \/ all/);
});

test('归档保留天数允许 0 表示永久', () => {
  assert.equal(normalizeConfig({ ...minimal(), retentionDays: 0 }, fakeConfigPath).retentionDays, 0);
  assert.throws(() => normalizeConfig({ ...minimal(), retentionDays: -1 }, fakeConfigPath), /保留天数/);
});

test('allowlist 只放行名单内的会话', () => {
  const config = normalizeConfig(
    { ...minimal(), access: { privateMode: 'allowlist', privateIds: ['22222'] } },
    fakeConfigPath,
  );
  assert.equal(allowConversation(config, 'private', '22222', '22222'), true);
  assert.equal(allowConversation(config, 'private', '33333', '33333'), false);
  assert.equal(allowConversation(config, 'group', '44444', '22222'), true);
});