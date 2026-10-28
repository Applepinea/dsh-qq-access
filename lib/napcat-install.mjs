import { createReadStream, createWriteStream, readFileSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { acquireLock } from './store.mjs';
import { assert, checkSignal, combinedSignal } from './util.mjs';

// 版本号只在 package.json 里维护，避免 UA 与清单版本漂移。
const { name: PKG_NAME, version: PKG_VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
export const USER_AGENT = `${PKG_NAME}/${PKG_VERSION}`;

// Pinned from the maintainer's GitHub release asset metadata, 2026-10-27.
// No upstream source or binaries are redistributed inside this plugin.
export const NAPCAT_RELEASE = Object.freeze({
  version: 'v4.18.41',
  asset: 'NapCat.Shell.Windows.Node.zip',
  url: 'https://github.com/NapNeko/NapCatQQ/releases/download/v4.18.41/NapCat.Shell.Windows.Node.zip',
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
  let url = new URL(spec.url), response;
  try {
    for (let hops = 0; hops <= 5; hops++) {
      checkSignal(timeout);
      assert(url.protocol === 'https:' && downloadHosts.has(url.hostname) && !url.username && !url.password, 'NapCat 下载跳转到了未允许的地址');
      response = await fetcher(url.href, { redirect: 'manual', signal: timeout, headers: { 'User-Agent': USER_AGENT } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        assert(response.headers.get('location'), 'NapCat 下载重定向缺少目标地址');
        url = new URL(response.headers.get('location'), url);
        response = undefined;
        continue;
      }
      break;
    }
    assert(response?.ok && response.body, '无法下载 NapCat 官方运行包；可下载同版本压缩包后使用 napcat-install --archive');
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
  } catch (error) { await rm(path, { force: true }); throw error; }
}

export function safeZipPath(base, name) {
  assert(typeof name === 'string' && !name.includes('\\') && !name.includes('\0') && !isAbsolute(name), 'NapCat ZIP 包含不安全路径');
  const parts = name.replace(/\/$/, '').split('/');
  assert(parts.length > 0 && parts.every(p => p && p !== '.' && p !== '..' && !/[:<>"|?*]/.test(p) && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)), 'NapCat ZIP 包含不安全的 Windows 路径');
  const target = resolve(base, ...parts);
  assert(target.startsWith(resolve(base) + sep), 'NapCat ZIP 不能写出安装目录');
  return target;
}

export async function extractArchive(path, destination, signal) {
  checkSignal(signal);
  await mkdir(destination, { recursive: true, mode: 0o700 });
  const zip = await new Promise((resolve, reject) => yauzl.open(path, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (e, zip) => e ? reject(e) : resolve(zip)));
  await new Promise((resolve, reject) => {
    const seen = new Set(); let bytes = 0, files = 0, finished = false;
    let active = Promise.resolve();
    const finish = error => {
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

export async function installNapcat(config, { archivePath, signal, progress, spec = NAPCAT_RELEASE, fetcher, platform = process.platform, arch = process.arch } = {}) {
  assert(platform === 'win32' && arch === 'x64', 'NapCat 托管运行包当前支持 Windows x64；其他平台可用 napcat.mode=external');
  const releaseLock = await acquireLock(join(config.napcat.directory, 'install-lock'));
  let stage;
  try {
    checkSignal(signal);
    const existing = await inspectInstallation(config, spec);
    if (existing.installed) return existing;
    const downloads = join(config.napcat.directory, 'downloads');
    await mkdir(downloads, { recursive: true, mode: 0o700 });
    let source = archivePath;
    if (source) await verifyArchive(source, spec, signal);
    else {
      source = join(downloads, `${spec.version}-${spec.asset}`);
      let cached = false;
      try { await verifyArchive(source, spec, signal); cached = true; }
      catch (error) { checkSignal(signal); if (error.code !== 'ENOENT') await rm(source, { force: true }); }
      if (!cached) {
        const part = `${source}.${randomUUID()}.part`;
        await downloadArchive(part, spec, { signal, fetcher, progress });
        await rename(part, source);
      }
    }
    const releases = join(config.napcat.directory, 'releases');
    await mkdir(releases, { recursive: true, mode: 0o700 });
    stage = join(releases, `.install-${randomUUID()}`);
    await extractArchive(source, stage, signal);
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
