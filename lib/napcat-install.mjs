import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { acquireLock } from './store.mjs';
import { assert, checkSignal, combinedSignal } from './util.mjs';

// Pinned from the maintainer's GitHub release asset metadata, 2026-10-27.
// No upstream source or binaries are redistributed inside this plugin.
// Pinned from the maintainer's GitHub release asset metadata, 2026-10-27.
// No upstream source or binaries are redistributed inside this plugin.
//
// 2026-11-12：上游 NapNeko/NapCatQQ 清空了全部 Releases（README 只剩一句
// "Ending"），原下载地址已经 404。这里改成一组按顺序尝试的地址，
// 首选社区镜像。sha256 和 bytes 不变 —— 镜像上那份与原始产物逐字节相同
// （已实测下载 124,089,498 字节并核对 SHA256）。
const OFFICIAL_URL = 'https://github.com/NapNeko/NapCatQQ/releases/download/v4.18.41/NapCat.Shell.Windows.Node.zip';
const MIRROR_URLS = Object.freeze([
  'https://github.com/Applepinea/NapCatQQ/releases/download/v4.18.41/v4.18.41-NapCat.Shell.Windows.Node.zip',
]);
export const NAPCAT_RELEASE = Object.freeze({
  version: 'v4.18.41',
  asset: 'NapCat.Shell.Windows.Node.zip',
  // url 是首选地址（面板的手动下载提示显示它）；urls 是完整候选列表。
  url: MIRROR_URLS[0] ?? OFFICIAL_URL,
  urls: Object.freeze([...MIRROR_URLS, OFFICIAL_URL]),
  sha256: '51fbb10e7bcd56b0c2a6de86c37811e7518330e48a137ac689ab1e4d8627d3f0',
  bytes: 124089498,
});
const requiredFiles = ['node.exe', 'index.js', 'wrapper.node', 'QQNT.dll', 'package.json', 'config.json', 'napcat/napcat.mjs'];
const downloadHosts = new Set(['github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com']);

export async function hashFile(path, signal) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path, { signal })) hash.update(bytes);
  return hash.digest('hex');
}

export async function verifyArchive(path, spec = NAPCAT_RELEASE, signal) {
  checkSignal(signal);
  assert((await stat(path)).size === spec.bytes, 'NapCat 下载大小不符，文件可能不完整');
  assert(await hashFile(path, signal) === spec.sha256, 'NapCat SHA256 校验失败，未安装或运行该文件');
}

export async function downloadArchive(path, spec = NAPCAT_RELEASE, { signal, fetcher = fetch, progress = () => {} } = {}) {
  const timeout = combinedSignal(signal, 900_000);
  // 按顺序试每个候选地址。上游 2026-11-12 清空了 Releases，官方地址已经 404，
  // 只试一个的话新用户就永远装不上。这里逐个试，全部失败才报错，
  // 并把最后一个真实原因带出去（是不是 404、是不是连不上，用户要能分清）。
  const candidates = Array.isArray(spec.urls) && spec.urls.length ? spec.urls : [spec.url];
  let lastError = null;
  for (const origin of candidates) {
    try {
      await downloadFrom(origin, path, spec, { timeout, fetcher, progress });
      return;
    } catch (error) {
      checkSignal(signal);
      lastError = error;
      await rm(path, { force: true });
    }
  }
  const detail = String(lastError?.message ?? lastError ?? '未知原因');
  throw new Error(
    `无法下载 NapCat 运行包（试过 ${candidates.length} 个地址）：${detail}。` +
    ' 可在面板上按提示手动下载，或用 napcat-install --archive 指定压缩包。',
  );
}

/**
 * 从单个地址下载并校验。抽出来是为了让 downloadArchive 能逐个试候选地址，
 * 同时保持「失败就删掉半截文件」这个不变量。
 */
async function downloadFrom(origin, path, spec, { timeout, fetcher, progress }) {
  let url = new URL(origin), response;
  for (let hops = 0; hops <= 5; hops++) {
    checkSignal(timeout);
    assert(url.protocol === 'https:' && downloadHosts.has(url.hostname) && !url.username && !url.password, 'NapCat 下载跳转到了未允许的地址');
    response = await fetcher(url.href, { redirect: 'manual', signal: timeout, headers: { 'User-Agent': 'dsh-qq-access/0.2.0' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      assert(response.headers.get('location'), 'NapCat 下载重定向缺少目标地址');
      url = new URL(response.headers.get('location'), url);
      response = undefined;
      continue;
    }
    break;
  }
  if (!(response?.ok && response.body)) {
    const status = response?.status ?? 'no-response';
    await response?.body?.cancel().catch(() => {});
    throw new Error('该地址返回 HTTP ' + status);
  }
  const declared = response.headers.get('content-length');
  if (declared) assert(Number(declared) === spec.bytes, 'NapCat 下载服务器返回的文件大小不符');
  let received = 0;
  const counter = new Transform({ transform(chunk, _encoding, callback) {
    received += chunk.length;
    if (received > spec.bytes) return callback(new Error('NapCat 下载超过预期大小'));
    progress(received, spec.bytes); callback(null, chunk);
  } });
  await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(path, { flags: 'wx', mode: 0o600 }), { signal: timeout });
  await verifyArchive(path, spec, timeout);
}

export function safeZipPath(base, name) {
  assert(typeof name === 'string' && !name.includes('\\') && !name.includes('\0') && !isAbsolute(name), 'NapCat ZIP 包含不安全路径');
  const parts = name.replace(/\/$/, '').split('/');
  assert(parts.length > 0 && parts.every(p => p && p !== '.' && p !== '..' && !/[:<>"|?*]/.test(p) && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)), 'NapCat ZIP 包含不安全的 Windows 路径');
  const target = resolve(base, ...parts);
  assert(target.startsWith(resolve(base) + sep), 'NapCat ZIP 不能写出安装目录');
  return target;
}

export async function extractArchive(path, destination, signal, onProgress = () => {}) {
  checkSignal(signal);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const zip = await new Promise((resolve, reject) => yauzl.open(path, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (e, zip) => e ? reject(e) : resolve(zip)));
  await new Promise((resolve, reject) => {
    const seen = new Set(); let bytes = 0, files = 0, finished = false;
    // entryCount 是 ZIP 目录里就有的，不需要先扫一遍，直接拿来当分母。
    const total = Number.isFinite(zip.entryCount) ? zip.entryCount : 0;
    let lastTick = 0;
    let active = Promise.resolve();
    const finish = error => {
      // 节流 200ms，解压快的时候最后几条根本发不出来；收尾补一次，进度条才会到 100%。
      if (!error && files > 0) { try { onProgress(files, total || files); } catch {} }
      if (finished) return;
      finished = true; signal?.removeEventListener('abort', abort); zip.close();
      // Drain the current output stream before the installer removes staging
      // files and releases its lock, including cancellation during extraction.
      active.catch(() => {}).then(() => { error ? reject(error) : resolve(); });
    };
    const abort = () => finish(signal.reason ?? new Error('NapCat 解压已取消'));
    signal?.addEventListener('abort', abort, { once: true });
    zip.on('error', finish); zip.on('end', () => finish());
    zip.on('entry', entry => {
      active = (async () => {
        checkSignal(signal);
        assert(++files <= 100_000 && (bytes += entry.uncompressedSize) <= 1024 * 1024 * 1024, 'NapCat 解压数量或大小超过限制');
        // 解压 250 MB、几千个文件，没有反馈就是干等。按文件数报，节流 200ms。
        const now = Date.now();
        if (now - lastTick >= 200) { lastTick = now; onProgress(files, total); }
        const type = (entry.externalFileAttributes >>> 16) & 0o170000;
        assert(type !== 0o120000, 'NapCat ZIP 不允许符号链接');
        const output = safeZipPath(destination, entry.fileName);
        const key = output.toLocaleLowerCase();
        assert(!seen.has(key), 'NapCat ZIP 包含重复路径'); seen.add(key);
        if (entry.fileName.endsWith('/')) { await mkdir(output, { recursive: true, mode: 0o700 }); return; }
        await mkdir(dirname(output), { recursive: true, mode: 0o700 });
        const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (e, stream) => e ? reject(e) : resolve(stream)));
        await pipeline(stream, createWriteStream(output, { flags: 'wx', mode: 0o600 }), { signal });
      })();
      active.then(() => { if (!finished) zip.readEntry(); }, finish);
    });
    if (signal?.aborted) abort(); else zip.readEntry();
  });
}

export function installationDirectory(config, spec = NAPCAT_RELEASE) { return join(config.napcat.directory, 'releases', spec.version); }

export async function inspectInstallation(config, spec = NAPCAT_RELEASE) {
  const directory = installationDirectory(config, spec);
  try {
    const marker = JSON.parse(await readFile(join(directory, '.dsh-qq-install.json'), 'utf8'));
    assert(marker.sha256 === spec.sha256 && marker.version === spec.version, 'NapCat 安装信息不匹配');
    for (const file of requiredFiles) assert((await stat(join(directory, file))).isFile(), 'NapCat 安装缺少运行文件');
    return { installed: true, directory, version: spec.version };
  } catch (error) {
    if (error.code === 'ENOENT') return { installed: false, directory, version: spec.version };
    throw error;
  }
}

export async function installNapcat(config, {
  archivePath, signal, progress, onStage = () => {}, onExtract = () => {},
  spec = NAPCAT_RELEASE, fetcher, platform = process.platform, arch = process.arch,
} = {}) {
  assert(platform === 'win32' && arch === 'x64', 'NapCat 托管运行包当前支持 Windows x64；其他平台可用 napcat.mode=external');
  const releaseLock = await acquireLock(join(config.napcat.directory, 'install-lock'));
  let stage;
  try {
    checkSignal(signal);
    onStage('正在检查 NapCat 是否已安装');
    const existing = await inspectInstallation(config, spec);
    if (existing.installed) return existing;
    const downloads = join(config.napcat.directory, 'downloads');
    await mkdir(downloads, { recursive: true, mode: 0o700 });
    let source = archivePath;
    if (source) {
      onStage('正在校验本地运行包');
      await verifyArchive(source, spec, signal);
    } else {
      source = join(downloads, `${spec.version}-${spec.asset}`);
      let cached = false;
      // 这一步最容易看着像卡住：以前下载过但中断，留下的包要完整读一遍算 SHA256。
      // 118 MB 在机械盘上要好几秒，期间一个字的反馈都没有。
      onStage('正在校验上次下载的运行包');
      try { await verifyArchive(source, spec, signal); cached = true; }
      catch (error) { checkSignal(signal); if (error.code !== 'ENOENT') await rm(source, { force: true }); }
      if (!cached) {
        const part = `${source}.${randomUUID()}.part`;
        onStage('正在下载 NapCat 运行包');
        await downloadArchive(part, spec, { signal, fetcher, progress });
        await rename(part, source);
      }
    }
    const releases = join(config.napcat.directory, 'releases');
    await mkdir(releases, { recursive: true, mode: 0o700 });
    stage = join(releases, `.install-${randomUUID()}`);
    onStage('正在解压运行包');
    await extractArchive(source, stage, signal, onExtract);
    onStage('正在校验解压结果');
    for (const file of requiredFiles) assert((await stat(join(stage, file))).isFile(), `NapCat 运行包缺少 ${file}`);
    checkSignal(signal);
    await writeFile(join(stage, '.dsh-qq-install.json'), JSON.stringify({ version: spec.version, sha256: spec.sha256, source: spec.url, installedAt: new Date().toISOString() }), { mode: 0o600 });
    await rename(stage, existing.directory);
    stage = undefined;
    return { installed: true, directory: existing.directory, version: spec.version };
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true });
    await releaseLock();
  }
}
