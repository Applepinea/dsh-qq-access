import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { acquireLock } from './store.mjs';
import { OneBotClient } from './onebot.mjs';
import { NAPCAT_RELEASE, inspectInstallation, installNapcat } from './napcat-install.mjs';
import { assert, checkSignal, combinedSignal } from './util.mjs';

const execFileAsync = promisify(execFile);

export async function writeManagedConfig(config) {
  const directory = join(config.napcat.directory, 'work', 'config');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  async function load(name) {
    try { return JSON.parse(await readFile(join(directory, name), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('NapCat 已有配置无法解析，未覆盖。请检查托管目录的 config 文件。'); }
  }
  const name = `onebot11_${config.selfId}.json`;
  const previous = await load(name);
  const network = previous.network ?? {};
  assert(Array.isArray(network.httpServers ?? []) && Array.isArray(network.httpClients ?? []), 'NapCat 网络配置格式错误');
  const apiPort = Number(new URL(config.onebot.apiUrl).port || 80);
  const servers = (network.httpServers ?? []).filter(s => s.name !== 'dsh-qq-api');
  assert(!servers.some(s => s.enable && Number(s.port) === apiPort), 'NapCat 其他 HTTP 配置已占用 QQ API 端口');
  servers.push({ name: 'dsh-qq-api', enable: true, host: '127.0.0.1', port: apiPort, token: config.onebot.token, enableCors: false, enableWebsocket: false, messagePostFormat: 'array', debug: false });
  const clients = (network.httpClients ?? []).filter(s => s.name !== 'dsh-qq-events');
  clients.push({ name: 'dsh-qq-events', enable: true, url: `http://127.0.0.1:${config.events.port}/onebot`, token: config.events.secret, messagePostFormat: 'array', reportSelfMessage: false, debug: false });
  const webui = await load('webui.json');
  await writeFile(join(directory, name), JSON.stringify({ ...previous, network: { ...network, httpServers: servers, httpClients: clients } }, null, 2), { mode: 0o600 });
  await writeFile(join(directory, 'webui.json'), JSON.stringify({
    ...webui, host: '127.0.0.1', port: config.napcat.webuiPort, token: config.napcat.webuiToken,
    disableWebUI: false, autoLoginAccount: config.selfId, enableXForwardedFor: false,
  }, null, 2), { mode: 0o600 });
  return { directory, onebotFile: join(directory, name) };
}

export function loginUrl(config, includeToken = false) {
  return `http://127.0.0.1:${config.napcat.webuiPort}/webui${includeToken ? `?token=${encodeURIComponent(config.napcat.webuiToken)}` : ''}`;
}

export async function openLoginBrowser(config) {
  assert(process.platform === 'win32', '自动打开 NapCat 登录页当前支持 Windows');
  // Arguments are passed directly to the system URL handler, without a shell.
  await execFileAsync('rundll32.exe', ['url.dll,FileProtocolHandler', loginUrl(config, true)], { windowsHide: true, timeout: 10_000 });
}

export async function portAvailable(port) {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = free => { if (done) return; done = true; socket.destroy(); resolve(free); };
    socket.once('connect', () => finish(false));
    socket.once('error', error => finish(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1000, () => finish(false));
  });
}

export async function terminateOwnedChild(child, { platform = process.platform } = {}) {
  if (!child || typeof child.pid !== 'number' || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, 'exit').catch(() => {});
  if (platform === 'win32') {
    // Only this exact owned process tree; never kill QQ by executable name.
    await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10_000 });
  } else child.kill('SIGTERM');
  const timer = new AbortController();
  try { await Promise.race([ended, delay(10_000, undefined, { signal: timer.signal }).then(() => { throw new Error('NapCat 子进程未能在限定时间内退出'); })]); }
  finally { timer.abort(); }
}

export class NapcatManager {
  constructor(config, {
    client = new OneBotClient(config.onebot), installer = installNapcat, inspect = inspectInstallation,
    spawnProcess = spawn, killProcess = terminateOwnedChild, openBrowser = openLoginBrowser,
    checkPort = portAvailable, platform = process.platform, arch = process.arch,
    pollMs = 1000, logger = console,
  } = {}) {
    Object.assign(this, { config, client, installer, inspect, spawnProcess, killProcess, openBrowser, checkPort, platform, arch, pollMs, logger });
    this.controller = new AbortController();
    this.state = 'idle'; this.restarts = 0; this.attached = false;
  }
  publicStatus() {
    return {
      mode: this.config.napcat.mode, state: this.state, version: NAPCAT_RELEASE.version,
      ownedProcess: Boolean(this.child && this.child.exitCode === null && this.child.signalCode === null),
      restarts: this.restarts, loginPage: loginUrl(this.config),
      ...(this.lastError ? { error: this.lastError } : {}),
    };
  }
  start(signal) {
    if (this.startResult) return this.startResult;
    this.startTask = this.initialize(signal);
    this.startResult = this.startTask.catch(async error => {
      this.lastError = error.message; this.state = 'failed'; await this.stop(); throw error;
    });
    return this.startResult;
  }
  async initialize(signal) {
    assert(this.platform === 'win32' && this.arch === 'x64', 'NapCat 托管模式当前支持 Windows x64；其他平台请用 external 模式');
    this.signal = signal ? AbortSignal.any([signal, this.controller.signal]) : this.controller.signal;
    checkSignal(this.signal);
    // A pre-existing, correctly authenticated QQ bridge may be reused, but is
    // never reconfigured or terminated by this manager.
    try {
      await this.client.verifyIdentity(this.config.selfId, combinedSignal(this.signal, 1500));
      this.attached = true; this.state = 'online'; return;
    } catch { checkSignal(this.signal); }
    this.releaseLock = await acquireLock(join(this.config.napcat.directory, 'process-owner'));
    checkSignal(this.signal);
    const apiPort = Number(new URL(this.config.onebot.apiUrl).port || 80);
    assert(await this.checkPort(apiPort), 'QQ API 端口已被其他服务占用，无法启动托管 NapCat');
    assert(await this.checkPort(this.config.napcat.webuiPort), 'NapCat 登录端口已被其他服务占用');
    this.state = 'installing';
    this.installation = this.config.napcat.autoInstall
      ? await this.installer(this.config, { signal: this.signal, platform: this.platform, arch: this.arch })
      : await this.inspect(this.config);
    assert(this.installation.installed, 'NapCat 尚未安装，请运行 node cli.mjs napcat-install');
    checkSignal(this.signal);
    await writeManagedConfig(this.config);
    const logDirectory = join(this.config.napcat.directory, 'logs');
    await mkdir(logDirectory, { recursive: true, mode: 0o700 });
    this.logPath = join(logDirectory, 'console.log');
    try { if ((await stat(this.logPath)).size > 10 * 1024 * 1024) await rename(this.logPath, join(logDirectory, 'console.previous.log')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await this.spawnEngine();
  }
  async spawnEngine() {
    checkSignal(this.signal);
    this.state = 'starting'; this.exitInfo = undefined; this.childError = undefined;
    const env = { ...process.env, NAPCAT_WORKDIR: join(this.config.napcat.directory, 'work') };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = this.spawnProcess(join(this.installation.directory, 'node.exe'), [join(this.installation.directory, 'index.js'), '-q', this.config.selfId], {
      cwd: this.installation.directory, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    this.log = createWriteStream(this.logPath, { flags: 'a', mode: 0o600 });
    this.log.on('error', () => { this.lastError = 'NapCat 控制台日志写入失败'; });
    child.stdout?.pipe(this.log, { end: false }); child.stderr?.pipe(this.log, { end: false });
    child.once('error', error => { this.childError = error; this.exitInfo = { error: error.code ?? 'spawn_failed' }; });
    child.once('exit', (code, signal) => { this.exitInfo = { code, signal }; this.log?.end(); });
    // Check the spawn result without blocking the Harness startup on login.
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve); child.once('error', reject);
    });
    this.state = 'waiting_login';
    this.openedLogin = false;
  }
  async maybeOpenLogin() {
    if (this.openedLogin || this.attached || !this.config.napcat.autoOpenLogin) return;
    if (await this.checkPort(this.config.napcat.webuiPort)) return;
    this.openedLogin = true;
    try { await this.openBrowser(this.config); }
    catch { this.logger.warn?.('无法自动打开 NapCat 登录页；可在终端运行 node cli.mjs napcat-login。'); }
  }
  async restartIfExited() {
    if (!this.exitInfo || this.attached) return;
    assert(this.restarts < this.config.napcat.maxRestarts, 'NapCat 连续退出已达到重启上限。请查看本机 NapCat 日志，然后重载插件。');
    this.restarts++;
    await delay(Math.min(1000 * this.restarts, 5000), undefined, { signal: this.signal });
    await this.spawnEngine();
  }
  async waitForLogin() {
    const deadline = Date.now() + this.config.napcat.loginTimeoutMs;
    while (Date.now() < deadline) {
      checkSignal(this.signal);
      await this.restartIfExited();
      try {
        await this.client.verifyIdentity(this.config.selfId, combinedSignal(this.signal, Math.max(100, Math.min(2000, this.pollMs))));
        this.state = 'online'; return;
      } catch { checkSignal(this.signal); }
      if (!this.attached) this.state = 'waiting_login';
      await this.maybeOpenLogin();
      await delay(this.pollMs, undefined, { signal: this.signal });
    }
    throw new Error('等待 QQ 扫码登录超时；请重载插件后登录，或运行 napcat-login。');
  }
  async monitor(onConnection) {
    while (!this.signal.aborted) {
      await delay(Math.max(1000, this.pollMs), undefined, { signal: this.signal });
      if (this.exitInfo) {
        onConnection(false); await this.restartIfExited(); await this.waitForLogin(); onConnection(true); continue;
      }
      try { await this.client.verifyIdentity(this.config.selfId, combinedSignal(this.signal, 2000)); onConnection(true); }
      catch { checkSignal(this.signal); onConnection(false); this.state = 'waiting_login'; await this.waitForLogin(); onConnection(true); }
    }
  }
  async stop() {
    if (this.stopPromise) return this.stopPromise;
    this.controller.abort();
    this.stopPromise = (async () => {
      await this.startTask?.catch(() => {});
      if (!this.attached) await this.killProcess(this.child, { platform: this.platform });
      if (this.log && !this.log.writableEnded) await new Promise(resolve => this.log.end(resolve));
      await this.releaseLock?.();
      this.state = 'stopped';
    })();
    return this.stopPromise;
  }
}
