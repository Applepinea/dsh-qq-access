import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import { acquireLock } from './store.mjs';
import { OneBotClient } from './onebot.mjs';
import { NAPCAT_RELEASE, inspectInstallation, installNapcat } from './napcat-install.mjs';
import { assert, checkSignal, combinedSignal, noteLog } from './util.mjs';

const execFileAsync = promisify(execFile);

export async function writeManagedConfig(config) {
  const directory = join(config.napcat.directory, 'work', 'config');
  await mkdir(directory, { recursive: true, mode: 0o700 });

  // 原子写：先写 .tmp 再 rename。
  // writeFile 会先截断再写内容，进程在中间被杀就留下一个「长度不变、内容全是 NUL」的坏文件；
  // 下次启动 load() 解析失败，NapCat 从此起不来，只能人工删文件。
  const writeAtomic = async (path, data) => {
    const tmp = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, data, { mode: 0o600 }); await rename(tmp, path); }
    catch (error) { try { await rm(tmp, { force: true }); } catch {} throw error; }
  };

  async function load(name) {
    const path = join(directory, name);
    let text;
    try { text = await readFile(path, 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
    try { return JSON.parse(text); }
    catch {
      // 全 NUL / 半截 JSON 都是「上次写盘被打断」的残留，不是用户手写的配置。
      // 备份一份再当空配置重建，别把插件卡死。
      const backup = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`;
      try { await rename(path, backup); } catch {}
      return {};
    }
  }

  const webui = await load('webui.json');
  const webuiPayload = {
    ...webui, host: '127.0.0.1', port: config.napcat.webuiPort, token: config.napcat.webuiToken,
    disableWebUI: false,
    // 首次登录还不知道账号：留空让用户扫码自己选号。
    autoLoginAccount: String(config.selfId ?? '').trim(),
    enableXForwardedFor: false,
  };

  // 首次登录时还不知道要写哪个号：NapCat 按真实 uin 找 onebot11_<uin>.json，
  // 这里写错名字等于让它永远起不来。所以只把 WebUI 配置写好（扫码要用），
  // onebot 那份等从日志里认出真实号、写回 config.json、重启 DSH 之后才写。
  if (!String(config.selfId ?? '').trim()) {
    await writeAtomic(join(directory, 'webui.json'), JSON.stringify(webuiPayload, null, 2));
    return { directory, onebotFile: null };
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
  await writeAtomic(join(directory, name), JSON.stringify({ ...previous, network: { ...network, httpServers: servers, httpClients: clients } }, null, 2));
  await writeAtomic(join(directory, 'webui.json'), JSON.stringify(webuiPayload, null, 2));
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
  // 返回 true = 端口空闲。
  //
  // 以前连接超时（1 秒）直接 finish(false)，也就是「占用」。
  // 对端黑洞、本机临时无响应时，空闲端口也会被报成占用，托管模式直接不启动；
  // 非 ECONNREFUSED 的错误同样当成占用。现在：
  //   - 连接成功     → 占用（false）
  //   - ECONNREFUSED → 空闲（true）
  //   - 超时         → 再试一次，仍超时才算「占用」
  //   - 其他错误     → 重试一次，仍失败就当作空闲（宁可试着起，也不要凭空拒绝）
  const attempt = (timeoutMs) => new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let done = false;
    const finish = (value) => { if (done) return; done = true; socket.destroy(); resolve(value); };
    socket.once('connect', () => finish('busy'));
    socket.once('error', (error) => finish(error.code === 'ECONNREFUSED' ? 'free' : 'unknown'));
    socket.setTimeout(timeoutMs, () => finish('timeout'));
  });
  const first = await attempt(1000);
  if (first === 'busy') return false;
  if (first === 'free') return true;
  // 超时或未知错误：给一次机会再确认。
  const second = await attempt(2000);
  return second !== 'busy';
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
      // 首次登录期间面板要能看见「在等扫码 / 已认出账号」。
      ...(this.progressText ? { progress: this.progressText } : {}),
      // 下载进度百分比（0–100）。只在安装阶段有意义，装完清零。
      ...(Number.isFinite(this.progressPercent) && this.progressPercent > 0
        ? { progressPercent: this.progressPercent } : {}),
      ...(this.detectedAccount ? { detectedAccount: this.detectedAccount } : {}),
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
    // 首次要下 118 MB，以前这一步面板上只有一句「installing」，
    // 用户完全不知道是在下、下到哪了、还是卡死了。
    // 这里把 downloadArchive 的 (received, total) 接出来，节流后写进 progressText，
    // 面板每 3 秒轮询一次就能看到百分比。
    let lastTick = 0;
    const onProgress = (received, total) => {
      const now = Date.now();
      // 节流：下载时每收到一个 chunk 都会回调（几万次），不节流面板数字会抖得没法看。
      if (now - lastTick < 200 && received < total) return;
      lastTick = now;
      const pct = total > 0 ? Math.min(100, Math.floor((received / total) * 100)) : 0;
      const mb = (n) => (n / 1024 / 1024).toFixed(1);
      this.progressPercent = pct;
      this.progressText = total > 0
        ? `正在下载 NapCat ${pct}%（${mb(received)} / ${mb(total)} MB）`
        : `正在下载 NapCat（已下载 ${mb(received)} MB）`;
    };
    this.progressPercent = 0;
    this.progressText = '正在检查 NapCat 是否已安装…';
    this.installation = this.config.napcat.autoInstall
      ? await this.installer(this.config, { signal: this.signal, platform: this.platform, arch: this.arch, progress: onProgress })
      : await this.inspect(this.config);
    this.progressPercent = 0;
    this.progressText = 'NapCat 已就绪，准备启动';
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
    // 记下启动时刻：maybeOpenLogin 靠它判断是否已经过了「冷启动宽限期」。
    this.startedAt = Date.now();
    const env = { ...process.env, NAPCAT_WORKDIR: join(this.config.napcat.directory, 'work') };
    delete env.ELECTRON_RUN_AS_NODE;
    // 首次登录还不知道要登哪个号：这时不能传 -q（空参数会让 NapCat 起不来），
    // 让它正常弹扫码页，用户扫完我们再从日志里读实际账号。
    // 记下日志起点：后面要靠「本次启动之后」写进去的行判断实际登录的是哪个号。
    // **必须放在 spawn 之前** —— 中间不能有 await：
    // Node 的 'spawn' 事件是下一 tick 触发的，一旦在 spawn 和
    // child.once('spawn') 之间插入 await，事件就会在监听器挂上之前丢失，
    // 那个 Promise 永远不 resolve，插件启动直接卡死在这里。
    this.logOffset = 0;
    try { this.logOffset = (await stat(this.logPath)).size; } catch { /* 首次启动还没有日志 */ }
    // 不要在这里清 progressText：安装阶段刚写的「NapCat 已就绪，准备启动」
    // 还要留给面板显示，清掉就变成一片空白了。
    this.progressPercent = 0;
    this.detectedAccount = null;

    const selfId = String(this.config.selfId ?? '').trim();
    const args = [join(this.installation.directory, 'index.js')];
    if (selfId) args.push('-q', selfId);
    const child = this.spawnProcess(join(this.installation.directory, 'node.exe'), args, {
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
  /**
   * 需要扫码时才打开 WebUI 浏览器。
   *
   * **不要一启动就弹。** 以前只要 `verifyIdentity` 失败就会打开，结果是：
   * 每次重启 DSH，NapCat 自己要几秒才起来，这几秒里连不上 → 浏览器被弹一次。
   * 账号明明是好的、根本不需要扫码，用户却每次开机都被塞一个 WebUI 窗口。
   *
   * 现在的规则：
   *   1. `autoOpenLogin` 关掉就永不弹（想彻底清静就改这个）；
   *   2. 每个进程生命周期最多弹一次；
   *   3. **必须等够一个宽限期**（NapCat 冷启动通常 3–15 秒），
   *      宽限期内连不上属于正常现象，不弹；
   *   4. 宽限期过后还没连上，才认为真的需要扫码登录。
   *
   * 首次登录（selfId 为空）不受宽限期限制 —— 那时确实要立刻扫码。
   */
  async maybeOpenLogin() {
    if (this.openedLogin || this.attached || !this.config.napcat.autoOpenLogin) return;

    // 已登录的老账号：先给 NapCat 一点时间起来，别把「正在启动」误判成「需要扫码」。
    const selfIdKnown = Boolean(String(this.config.selfId ?? '').trim());
    if (selfIdKnown) {
      const graceMs = Math.max(0, Number(this.config.napcat.loginGraceMs ?? 20000));
      const elapsed = Date.now() - (this.startedAt ?? 0);
      if (elapsed < graceMs) return;
    }

    if (await this.checkPort(this.config.napcat.webuiPort)) return;
    this.openedLogin = true;
    try {
      await this.openBrowser(this.config);
      noteLog('已打开 NapCat 登录页（自动）。');
    } catch {
      this.logger.warn?.('无法自动打开 NapCat 登录页；可在终端运行 node cli.mjs napcat-login。');
    }
  }
  async restartIfExited() {
    if (!this.exitInfo || this.attached) return;
    assert(this.restarts < this.config.napcat.maxRestarts, 'NapCat 连续退出已达到重启上限。请查看本机 NapCat 日志，然后重载插件。');
    this.restarts++;
    await delay(Math.min(1000 * this.restarts, 5000), undefined, { signal: this.signal });
    await this.spawnEngine();
  }
  /**
   * 认「这次实际登录的是哪个 QQ 号」。
   *
   * **不能只靠日志。** NapCat 各版本打印的内容不一样：
   *   - 某些版本会打 `[Core] [Config] 配置文件 ...\work\config\napcat_<uin>.json 加载`
   *   - v4.18.41 只打 `[NapCat] [Fork] Worker进程已登录成功` + `已通知主进程登录成功`
   * 只匹配 `napcat_<uin>.json` 的话，在 4.18.41 上永远返回 null ——
   * 表现就是「扫码明明成功了，面板一直卡在等待扫码」，直到超时。
   *
   * 所以按可靠性排序，三条路依次尝试：
   *   1. **读 work/config/ 下的 napcat_<uin>.json 文件名**。
   *      NapCat 登录成功后才写这个文件，文件名就是真实 uin，
   *      完全不依赖日志文案，是这三条里最可靠的。
   *   2. 日志里的 `napcat_<uin>.json`。老版本走这条。
   *   3. 日志里出现「已登录成功」但拿不到 uin —— 返回 { loggedIn: true, uin: null }，
   *      让调用方立刻提示用户手动填号，而不是傻等到超时。
   *
   * 返回 null 表示「还没登录」。
   */
  async detectLoggedAccount() {
    const configDir = join(this.config.napcat.directory, 'work', 'config');

    // ① 配置文件名：最可靠，不依赖任何日志文案。
    //    NapCat 只有在真正登录之后才会写 napcat_<uin>.json。
    //    多个号时取最后修改的那个（本次登录会重写它）。
    try {
      const names = await readdir(configDir);
      const candidates = [];
      for (const name of names) {
        const m = /^napcat_(\d{5,12})\.json$/.exec(name);
        if (!m) continue;
        try { candidates.push({ uin: m[1], at: (await stat(join(configDir, name))).mtimeMs }); }
        catch { /* 文件刚被删掉，忽略 */ }
      }
      if (candidates.length) {
        candidates.sort((x, y) => y.at - x.at);
        return { loggedIn: true, uin: candidates[0].uin, via: 'config-file' };
      }
    } catch { /* 目录还不存在：说明 NapCat 没登录过，继续看日志 */ }

    // ② 日志里的 uin 行（老版本）。
    const text = await this.#recentLogText();
    if (text) {
      let found = null;
      for (const match of text.matchAll(/napcat_(\d{5,12})\.json/g)) found = match[1];
      if (found) return { loggedIn: true, uin: found, via: 'log-uin' };

      // ③ 日志说登录成功了，但拿不到 uin。
      //    立刻告诉调用方「别等了，去让用户手动填」，不要拖到超时。
      const success = /已登录成功|登录成功|已通知主进程登录成功/.test(text);
      if (success) return { loggedIn: true, uin: null, via: 'log-success-only' };
    }

    return null;
  }

  /** 读日志尾部（本次启动之后写的那一段），拿不到就返回空串。 */
  async #recentLogText() {
    if (!this.logPath) return '';
    let size;
    try { size = (await stat(this.logPath)).size; } catch { return ''; }
    const from = Math.max(this.logOffset ?? 0, 0);
    if (size <= from) return '';
    // 只读尾部一段：日志可能很大，要找的行就在最近几 KB 里。
    const start = Math.max(from, size - 256 * 1024);
    try { return (await readFile(this.logPath)).subarray(start).toString('utf8'); }
    catch { return ''; }
  }

  async waitForLogin() {
    const deadline = Date.now() + this.config.napcat.loginTimeoutMs;
    // 首次登录（selfId 为空）时没有号可以校验，改成从 NapCat 日志里认。
    const pending = !String(this.config.selfId ?? '').trim();
    let lastReason = '';
    let lastAccountCheck = 0;
    while (Date.now() < deadline) {
      checkSignal(this.signal);
      await this.restartIfExited();

      if (pending) {
        // 每 1 秒认一次号。三条路依次尝试（见 detectLoggedAccount 的注释）。
        if (Date.now() - lastAccountCheck > 1000) {
          lastAccountCheck = Date.now();
          const found = await this.detectLoggedAccount().catch(() => null);
          if (found?.loggedIn && found.uin) {
            this.state = 'online';
            this.detectedAccount = String(found.uin);
            this.progressText = '已登录 QQ ' + found.uin;
            noteLog('NapCat 首次登录成功：QQ ' + found.uin + '（来源：' + found.via + '）');
            return String(found.uin);
          }
          if (found?.loggedIn && !found.uin) {
            // NapCat 说登录成功了，但认不出号。立刻报错让用户手动填，
            // 不要傻等到 loginTimeoutMs（默认 10 分钟）—— 那正是之前
            // 「面板永久卡在等待扫码」的表现。
            const hint = 'NapCat 已经登录成功，但没能自动认出是哪个 QQ 号。'
              + '请重载插件后在面板里手动填写登录 QQ 号；'
              + '也可以在 NapCat 的 work/config 目录里查看 napcat_<QQ号>.json 的文件名。';
            this.lastError = hint;
            this.state = 'failed';
            this.progressText = hint;
            noteLog('NapCat 首次登录成功但认不出账号（' + found.via + '）：' + hint);
            throw new Error(hint);
          }
        }
        if (!this.attached) {
          this.state = 'waiting_login';
          const waited = Math.round((deadline - Date.now()) / 1000);
          this.progressText = '等待扫码登录（还剩约 ' + waited + ' 秒）';
        }
        await this.maybeOpenLogin();
        await delay(this.pollMs, undefined, { signal: this.signal });
        continue;
      }

      try {
        await this.client.verifyIdentity(this.config.selfId, combinedSignal(this.signal, Math.max(100, Math.min(2000, this.pollMs))));
        this.state = 'online';
        return this.config.selfId;
      } catch (error) {
        checkSignal(this.signal);
        const message = String(error?.message ?? error);
        if (message !== lastReason) {
          lastReason = message;
          noteLog('NapCat 等待登录：' + message.slice(0, 200));
        }
      }
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
