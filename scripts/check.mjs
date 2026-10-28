#!/usr/bin/env node
// 发布前自检：清单字段、文件完整性、语法、客户端 bundle 约定。
// 用法：npm run check
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

let failed = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const bad = (msg) => { failed += 1; console.log(`  FAIL ${msg}`); };
const section = (title) => console.log(`\n${title}`);

function must(condition, message) {
  condition ? ok(message) : bad(message);
}

section('清单字段');
for (const key of ['name', 'version', 'description', 'license', 'type', 'main']) {
  must(typeof pkg[key] === 'string' && pkg[key].length > 0, `package.json 有 ${key}`);
}
must(pkg.name === pkg.name.toLowerCase() && /^[a-z0-9][a-z0-9._-]*$/.test(pkg.name), 'name 全小写且合法');
must(pkg.type === 'module', 'type 为 module（源码用 ESM）');
must(Array.isArray(pkg.keywords) && pkg.keywords.includes('dsh-plugin'), 'keywords 含 dsh-plugin');

section('dsh 插件声明');
const patch = pkg.dsh?.bundle?.patch;
must(Boolean(patch), 'dsh.bundle.patch 已声明');
must(Boolean(pkg.dsh?.client), 'dsh.client 已声明');
if (patch) {
  const patchFile = join(root, patch);
  must(existsSync(patchFile), `补丁文件存在：${patch}`);
  if (existsSync(patchFile)) {
    const yml = readFileSync(patchFile, 'utf8');
    must(/insert:/.test(yml) && new RegExp(`id:\\s*${pkg.name.replace(/^dsh-/, '')}`).test(yml),
      `补丁文件声明了 ${pkg.name} 的 insert 条目`);
  }
}
const externals = pkg.dsh?.client?.external ?? [];
must(Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.inject.length > 0, 'dsh.client.inject 非空');

section('入口与文件');
const entry = join(root, pkg.main ?? '');
must(existsSync(entry), `main 指向的文件存在：${pkg.main}`);
for (const [key, target] of Object.entries(pkg.exports ?? {})) {
  if (typeof target === 'string') must(existsSync(join(root, target)), `exports["${key}"] 指向 ${target}`);
}
for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  const file = join(root, target);
  must(existsSync(file), `bin ${name} 指向 ${target}`);
  if (existsSync(file)) {
    must(readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node'), `bin ${name} 有 node shebang`);
  }
}
for (const item of pkg.files ?? []) {
  must(existsSync(join(root, item)), `files 中的 ${item} 存在`);
}

section('客户端 bundle');
const clientFile = pkg.exports?.['./client'];
if (typeof clientFile === 'string' && existsSync(join(root, clientFile))) {
  const bundle = readFileSync(join(root, clientFile), 'utf8');
  must(bundle.includes('__ModuleLoader__.load'), '使用宿主 ModuleLoader 包装');
  const required = [...bundle.matchAll(/require\("([^".][^"]*)"\)/g)].map((m) => m[1]);
  const missing = [...new Set(required)].filter((id) => !externals.includes(id));
  must(missing.length === 0, `require 的宿主模块都已声明为 external${missing.length ? `（缺 ${missing.join(', ')}）` : ''}`);
} else {
  bad('exports["./client"] 指向的文件不存在');
}

section('语法');
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(mjs|js)$/.test(name)) files.push(full);
  }
})(root);
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    ok(`${file.slice(root.length + 1)} 语法通过`);
  } catch (error) {
    bad(`${file.slice(root.length + 1)} 语法错误：${String(error.stderr ?? error).split('\n')[0]}`);
  }
}

console.log(`\n${failed === 0 ? '全部通过' : `${failed} 项未通过`}（${files.length} 个文件）`);
process.exit(failed === 0 ? 0 : 1);
