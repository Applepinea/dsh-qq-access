// 冒烟测试：不需要 DSH 宿主即可运行，覆盖导出形状、清单约定与配置校验。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as plugin from '../index.mjs';
import { allowConversation, normalizeConfig } from '../lib/config.mjs';
import { USER_AGENT } from '../lib/napcat-install.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fakeConfigPath = join(tmpdir(), 'dsh-qq-access-test', 'config.json');

const minimal = () => ({
  selfId: '10001',
  onebot: { token: 'a'.repeat(24) },
  events: { secret: 'b'.repeat(24) },
});

test('插件导出的形状符合 dsh 约定', () => {
  assert.equal(plugin.name, 'qq-access');
  assert.ok(Array.isArray(plugin.inject));
  assert.deepEqual(plugin.inject, ['agents', 'tools', 'systemPrompt']);
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

test('下载 UA 跟随清单版本，不写死', () => {
  assert.equal(USER_AGENT, `${pkg.name}/${pkg.version}`);
});

test('配置默认可用于外部模式', () => {
  const config = normalizeConfig(minimal(), fakeConfigPath);
  assert.equal(config.napcat.mode, 'external');
  assert.equal(config.reply.private, true);
  assert.equal(config.reply.group, 'mention');
  assert.equal(config.access.privateMode, 'all');
  assert.equal(config.retentionDays, 30);
  assert.equal(config.poll.enabled, true);
  assert.equal(config.selfId, '10001');
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

test('allowlist 只放行名单内的会话', () => {
  const config = normalizeConfig(
    { ...minimal(), access: { privateMode: 'allowlist', privateIds: ['22222'] } },
    fakeConfigPath,
  );
  assert.equal(allowConversation(config, 'private', '22222', '22222'), true);
  assert.equal(allowConversation(config, 'private', '33333', '33333'), false);
  assert.equal(allowConversation(config, 'group', '44444', '22222'), true);
});
