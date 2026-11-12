#!/usr/bin/env node
// 一条命令发版：自检 → 升版本 → 打包 → 产出 dist/dsh-qq-access.tgz
//
//   npm run release              升 patch（0.5.0 → 0.5.1）
//   npm run release minor        升 minor（0.5.0 → 0.6.0）
//   npm run release major        升 major（0.5.0 → 1.0.0）
//   npm run release -- --dry-run 只看会做什么，不改文件
//
// 版本号只在这个脚本里改，README 与文档都不写版本，不用手工同步。
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const skipTests = argv.includes('--skip-tests');
const level = argv.find((a) => ['patch', 'minor', 'major'].includes(a)) ?? 'patch';

const pkgPath = join(root, 'package.json');
const lockPath = join(root, 'package-lock.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const [major, minor, patch] = pkg.version.split('.').map(Number);
const next =
  level === 'major' ? `${major + 1}.0.0`
  : level === 'minor' ? `${major}.${minor + 1}.0`
  : `${major}.${minor}.${patch + 1}`;

const step = (msg) => console.log(`\n▸ ${msg}`);
const ok = (msg) => console.log(`  ✔ ${msg}`);

console.log(`dsh-qq-access 发版：${pkg.version} → ${next}${dryRun ? '（dry-run，不会写文件）' : ''}`);

step('自检');
execSync(`"${process.execPath}" scripts/check.mjs`, { cwd: root, stdio: 'inherit' });
ok('清单、文件、语法、客户端 bundle 全部通过');

if (!skipTests) {
  step('测试');
  execSync(`"${process.execPath}" --test`, { cwd: root, stdio: 'inherit' });
  ok('冒烟测试通过');
}

if (dryRun) {
  console.log('\n干跑结束，没有改动任何文件。去掉 --dry-run 即正式执行。');
  process.exit(0);
}

step('升版本');
pkg.version = next;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
if (existsSync(lockPath)) {
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages?.['']) lock.packages[''].version = next;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}
ok(`package.json${existsSync(lockPath) ? ' 与 package-lock.json' : ''} 已更新为 ${next}`);

step('打包');
const packed = execSync('npm pack', { cwd: root, encoding: 'utf8' }).trim().split('\n').pop().trim();
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });
const target = join(dist, 'dsh-qq-access.tgz');
if (existsSync(target)) rmSync(target);
copyFileSync(join(root, packed), target);
rmSync(join(root, packed));
const kb = (readFileSync(target).length / 1024).toFixed(1);
ok(`dist/dsh-qq-access.tgz（${kb} kB）`);

console.log(`
完成。接下来三步：

  1. 把改动过的文件上传到 GitHub（含 package.json / package-lock.json）
  2. 建 Release，tag 填 v${next}，资产上传 dist/dsh-qq-access.tgz
  3. npm publish

装到本地验证：

  dsh plugin --profile web add "C:/.../dist/dsh-qq-access.tgz"
`);
