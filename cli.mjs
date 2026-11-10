#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { bootstrapConfig, loadConfig, defaultConfigPath, normalizeConfig } from './lib/config.mjs';
import { OneBotClient } from './lib/onebot.mjs';
import { assert, qqId } from './lib/util.mjs';
import { NAPCAT_RELEASE, installNapcat, inspectInstallation } from './lib/napcat-install.mjs';
import { NapcatManager, loginUrl, openLoginBrowser } from './lib/napcat.mjs';

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const configIndex = argv.indexOf('--config');
const configPath = configIndex >= 0 ? resolve(argv[configIndex + 1] ?? '') : defaultConfigPath();
const prompt = () => createInterface({ input: stdin, output: stdout });

async function setup() {
  try { await access(configPath); throw new Error(`配置已存在：${configPath}。请直接编辑，setup 不会覆盖。`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const rl = prompt();
  try {
    const selfId = qqId((await rl.question('用于登录 NapCat 的 QQ 号：')).trim());
    const owner = (await rl.question('可远程管理插件的另一个 QQ 号（可留空，仅在本机 Harness 管理）：')).trim();
    if (owner) { qqId(owner); assert(owner !== selfId, '管理员必须用另一个 QQ 号私聊；登录账号自己的出站消息不会触发自动回复。'); }
    const config = bootstrapConfig({ selfId, ownerIds: owner ? [owner] : [] });
    const managed = config.napcat.mode === 'managed';
    const token = config.onebot.token;
    const secret = config.events.secret;
    await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
    await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(`\n已生成配置：${configPath}`);
    if (managed) {
      console.log('已启用 NapCat 托管模式，QQ 连接配置会自动生成。');
      console.log(`首次准备下载官方 ${NAPCAT_RELEASE.version} Windows 运行包，约 ${(NAPCAT_RELEASE.bytes / 1024 / 1024).toFixed(1)} MiB。`);
      await installCommand();
      console.log('下一步：按 README 安装到 Harness。插件会自动启动 NapCat 并打开扫码页；QQ 空间复用同一个登录，无需单独扫码。');
    } else {
      console.log(`NapCat HTTP 服务：127.0.0.1:3000，token 填：${token}`);
      console.log(`NapCat HTTP 客户端：http://127.0.0.1:5701/onebot，token 填：${secret}`);
      console.log('当前平台使用 external 模式；按 README 配置外部 NapCat。');
    }
  } finally { rl.close(); }
}

async function doctor() {
  const config = await loadConfig(configPath);
  const client = new OneBotClient(config.onebot);
  const result = { node: process.version, config: 'ok', qqIdentity: null, endpoints: {}, qzoneEnabled: config.qzone.enabled, napcatMode: config.napcat.mode };
  if (config.napcat.mode === 'managed') {
    const installation = await inspectInstallation(config);
    result.napcatInstallation = { installed: installation.installed, version: installation.version };
    result.loginPage = loginUrl(config);
  }
  try { result.qqIdentity = await client.verifyIdentity(config.selfId); }
  catch (error) { result.qqIdentity = { connected: false, error: error.message }; }
  for (const action of ['get_status', 'get_friend_list', 'get_group_list']) {
    try {
      const data = await client.call(action);
      result.endpoints[action] = { ok: true, ...(Array.isArray(data) ? { count: data.length } : {}) };
    } catch (error) { result.endpoints[action] = { ok: false, error: error.message }; }
  }
  if (config.qzone.enabled) {
    // QQ 空间走 NapCat 的 cookie，不需要浏览器；只检查 cookie 能否取到。
    try {
      const data = await client.call('get_cookies', { domain: 'user.qzone.qq.com' });
      result.qzoneCookie = String(data?.cookies ?? '').includes('p_skey') ? 'ok' : 'missing p_skey';
    } catch (error) { result.qzoneCookie = 'error: ' + error.message; }
  }
  result.note = '本命令只读；没有发送消息或发表留言。历史接口是否可用需在 Harness 中针对实际会话检查。';
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result.endpoints).some(r => !r.ok)) process.exitCode = 1;
}



async function enableManaged() {
  assert(process.platform === 'win32' && process.arch === 'x64', '托管模式当前支持 Windows x64');
  const raw = JSON.parse(await readFile(configPath, 'utf8'));
  raw.napcat = { ...raw.napcat, mode: 'managed', webuiToken: raw.napcat?.webuiToken || randomBytes(24).toString('hex') };
  normalizeConfig(raw, configPath);
  // Preserve old credentials, personas, allowlists and all unrelated settings.
  await writeFile(configPath + `.before-managed-${Date.now()}.json`, await readFile(configPath), { flag: 'wx', mode: 0o600 });
  await writeFile(configPath, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
  console.log('已保留原配置并启用 NapCat 托管模式。');
  await installCommand();
}

async function installCommand() {
  const config = await loadConfig(configPath);
  const archiveIndex = argv.indexOf('--archive');
  const archivePath = archiveIndex >= 0 ? resolve(argv[archiveIndex + 1] ?? '') : undefined;
  let percent = -1;
  const installed = await installNapcat(config, { archivePath, progress(received, total) {
    const next = Math.floor(received / total * 10) * 10;
    if (next !== percent) { percent = next; console.log(`NapCat 下载 ${next}%`); }
  } });
  console.log(`NapCat ${installed.version} 已安装并通过 SHA256 校验。`);
}

async function napcatLogin() {
  const config = await loadConfig(configPath);
  assert(config.napcat.mode === 'managed', '请先运行 napcat-enable 启用托管模式');
  const client = new OneBotClient(config.onebot);
  try { await client.verifyIdentity(config.selfId); console.log('QQ 已登录，可直接在 Harness 使用。'); return; }
  catch {}
  // If Harness already owns the manager, opening the existing WebUI must not
  // create a second NapCat process or rewrite its configuration.
  const { portAvailable } = await import('./lib/napcat.mjs');
  if (!await portAvailable(config.napcat.webuiPort)) {
    await openLoginBrowser(config);
    console.log('已打开现有 NapCat 登录页。扫码后 Harness 会自动接通。'); return;
  }
  const manager = new NapcatManager(config);
  const abort = new AbortController();
  const stop = () => abort.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    await manager.start(abort.signal);
    await manager.waitForLogin();
    console.log('QQ 扫码登录成功。此临时登录进程将关闭，随后启动 Harness 可复用登录状态。');
  } finally {
    process.removeListener('SIGINT', stop); process.removeListener('SIGTERM', stop);
    await manager.stop();
  }
}

try {
  if (command === 'setup') await setup();
  else if (command === 'doctor') await doctor();
  else if (command === 'napcat-install') await installCommand();
  else if (command === 'napcat-enable') await enableManaged();
  else if (command === 'napcat-login') await napcatLogin();
  else console.log('用法：node cli.mjs setup|doctor|napcat-install|napcat-enable|napcat-login [--config PATH] [--archive ZIP]');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
