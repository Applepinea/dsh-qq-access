// 冒烟测试：不需要 DSH 宿主即可运行，覆盖清单约定与配置校验。
//
// 这里刻意只测「不依赖宿主、不依赖网络」的部分：清单指向的文件真实存在、
// 配置校验的边界。真正需要宿主的部分（导出形状）在没有装宿主时自动跳过。
// 行为验证需要真实 QQ 环境，见 docs/VALIDATION.md。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { allowConversation, bootstrapConfig, loadConfig, normalizeConfig } from '../lib/config.mjs';
import { QQRuntime } from '../lib/runtime.mjs';
import { ThoughtStore, renderThoughtBlock } from '../lib/thoughts.mjs';
import { registerUi } from '../lib/ui.mjs';


const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// 静态断言用：按需读源文件（例如「某处不能有 await」）。
const read = (f) => readFileSync(join(root, f), 'utf8');
/**
 * 建一个只连了内存的 runtime，用来测不需要真 QQ 的逻辑（念头、记忆召回等）。
 * 不启动事件服务、不连 OneBot：只构造对象并 init 存储。
 */
async function freshRuntime(dataDir) {
  const cfg = normalizeConfig({
    selfId: '10001',
    onebot: { token: 'a'.repeat(24) },
    events: { secret: 'b'.repeat(24) },
    dataDir,
    // 默认配置里记忆是关的；这些测试要测召回，显式打开。
    memory: { enabled: true, inject: true },
  });
  cfg.dataDir = dataDir;
  const runtime = new QQRuntime(cfg, {
    // 这些测试只碰存储，不需要真的 agent / 工具。
    ctx: { get: () => undefined, agents: { create: async () => ({ agent: {} }) }, tools: {} },
    createUserMessage: (x) => x,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  });
  await runtime.store.init();
  await runtime.ledger.init();
  await runtime.thoughts?.init?.();
  return runtime;
}

const minimal = () => ({
  selfId: '10001',
  onebot: { token: 'a'.repeat(24) },
  events: { secret: 'b'.repeat(24) },
});

// ───────────────────────────────────────────────────────────
// 1.2.0 的测试。
//
// 注意：这里刻意**不包含** 1.1.4514 分支上的测试。
// 那批测的是另一套实现（入队即触发 / /retry / 进度条速度 / 候选下载地址 等），
// 和 1.2.0 的代码对不上；1.1.4514 已知会让插件完全不可用，已经作废。
// ───────────────────────────────────────────────────────────
// ───────────────────────────────────────────────────────────
// AUDIT 修复的回归测试（H1–H13）。每条都对着一个「用户会碰到」的故障。
// ───────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────
// AUDIT 中优先级（M1–M25）的回归测试。
// ───────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────
// AUDIT 低优先级（L1–L9）。
// ───────────────────────────────────────────────────────────

test('L1 事实覆盖的 supersededBy 指向真正的新条目', async () => {
  const { MemoryStore } = await import('../lib/memory.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-l1-'));
  const m = new MemoryStore({ dataDir: dir, logger: { warn: () => {} } });
  await m.init();
  const a = await m.remember('20001', { text: '我住在上海', kind: 'fact', factKey: '对方.住址' });
  const b = await m.remember('20001', { text: '我住在北京', kind: 'fact', factKey: '对方.住址' });
  const old = m.list('20001').find((x) => x.id === a.entry.id);
  assert.equal(old.supersededBy, b.entry.id, '旧条要指向新条的 id');
  assert.deepEqual(m.facts('20001').map((x) => x.text), ['我住在北京'], '事实里只剩新的');
  await rm(dir, { recursive: true, force: true });
});

test('L2 Content-Length 不是数字时不该误报响应过大', () => {
  const ob = read('lib/onebot.mjs');
  assert.match(ob, /const declaredLength = Number\(response\.headers\.get\('content-length'\)\)/, '要单独取');
  assert.match(ob, /!Number\.isFinite\(declaredLength\) \|\| declaredLength <= 8 \* 1024 \* 1024/, 'NaN 要放行');
});

test('L3 doctor 真的检查事件端口', () => {
  const cli = read('cli.mjs');
  assert.match(cli, /eventsPort/, '要写进结果');
  assert.match(cli, /portAvailable\(config\.events\.port\)/, '要用真实探测');
});

test('L4 webuiPort 缺失时回退到托管的默认 6099', () => {
  const ui = read('lib/ui.mjs');
  const c = read('lib/client.js');
  assert.ok(!/webuiPort \?\? 6800/.test(ui), 'ui 里不能再用 6800');
  assert.ok(!/webuiPort \?\? 6800/.test(c), 'client 里不能再用 6800');
  assert.match(ui, /webuiPort \?\? 6099/, '要回退 6099');
  assert.match(c, /webuiPort \?\? 6099/, '要回退 6099');
});

test('L5 pathOf 不会走出图库目录', async () => {
  const me = read('lib/memes.mjs');
  assert.match(me, /表情包路径越界/, '要有越界检查');
  assert.match(me, /full\.startsWith\(root \+ sep\)/, '要按目录前缀判断');
  const { MemeLibrary } = await import('../lib/memes.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-l5-'));
  const lib = new MemeLibrary({ dataDir: dir, logger: { warn: () => {} } });
  await lib.init();
  assert.throws(() => lib.pathOf({ file: '../../../etc/passwd' }), /越界/, '越界路径要抛异常');
  await rm(dir, { recursive: true, force: true });
});

test('L6 天气同时兼容 v1 和 v7 响应', async () => {
  const { normalizeForecast } = await import('../lib/weather.mjs');
  const v1 = { days: [{ forecastStartTime: '2026-11-13T00:00:00+08:00', temperatureMax: { value: 22.4 }, temperatureMin: { value: 14.6 }, daytime: { condition: { text: '晴' }, precipitation: { probability: 0.1 }, wind: { scale: 3 } }, nighttime: { condition: { text: '多云' } } }] };
  const v7 = { daily: [{ fxDate: '2026-11-13', tempMax: '22', tempMin: '15', textDay: '晴', textNight: '多云', precip: '10' }] };
  const a = normalizeForecast(v1), b = normalizeForecast(v7);
  assert.equal(a.length, 1, 'v1 能解析');
  assert.equal(b.length, 1, 'v7 也要能解析（以前得到空数组）');
  assert.deepEqual(Object.keys(a[0]).sort(), Object.keys(b[0]).sort(), '两套形状要一致');
  assert.equal(b[0].tempMax, 22);
});

test('L7 小红书短链不再拼出 undefined', () => {
  const pr = read('lib/parser.mjs');
  assert.match(pr, /const resolvedNoteId = String\(ctx\.noteId/, '要补 noteId');
  assert.match(pr, /url: noteUrl/, '用解析出的 URL');
  assert.ok(!/url: "https:\/\/www\.xiaohongshu\.com\/explore\/" \+ ctx\.noteId/.test(pr), '不能直接拼 ctx.noteId');
});

test('L8 napcat-enable 写回的是规范化后的配置', () => {
  const cli = read('cli.mjs');
  assert.ok(cli.includes("const normalized = normalizeConfig(raw, configPath)"), '要接住返回值');
  assert.ok(cli.includes("JSON.stringify(persisted, null, 2)"), '要写回规范化结果');
});

test('L9 队列满时要给上报方背压信号', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /return \{ busy: true \};/, 'accept 要回 busy');
  const ev = read('lib/events.mjs');
  assert.match(ev, /result\?\.busy \? 503/, 'events 要转成 503');
});

test('reply.debounceMs 能配且不被 normalizeConfig 丢掉', async () => {
  const { normalizeConfig } = await import('../lib/config.mjs');
  const base = {
    selfId: '10001', ownerIds: ['10002'],
    onebot: { apiUrl: 'http://127.0.0.1:3000', token: 'x'.repeat(24) },
    events: { secret: 'y'.repeat(24) },
  };
  // 默认值
  assert.equal(normalizeConfig(base, 'C:/tmp/config.json').reply.debounceMs, 1200);
  // 显式配置要能透传：normalizeConfig 是逐字段白名单，漏一个字段用户就改不动
  const c = normalizeConfig({ ...base, reply: { debounceMs: 60000 } }, 'C:/tmp/config.json');
  assert.equal(c.reply.debounceMs, 60000, 'deburceMs 必须能透传');
  // 上界保护
  assert.throws(() => normalizeConfig({ ...base, reply: { debounceMs: 999999 } }, 'C:/tmp/config.json'), /防抖/);
});

test('ThoughtStore 兼容旧格式 { thoughts: [...] } 不抛错', async () => {
  // 早期版本把 people[key] 写成 { thoughts: [...] }，后来改成直接存数组。
  // list() 只认数组时会在 reply() 里抛 all.filter is not a function，直接打断整轮回复。
  const { ThoughtStore } = await import('../lib/thoughts.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-th-'));
  const s = new ThoughtStore({ dataDir: dir, logger: { warn: () => {} } });
  await s.init();
  // 伪造旧格式数据
  s.people = { '123': { thoughts: [{ at: Date.now() - 1000, text: '旧格式的一条念头，够长', source: 'x' }] } };
  const list = s.list('123');
  assert.equal(list.length, 1, '旧格式要能读出来');
  assert.match(list[0].text, /旧格式/);
  // 写入后归一成数组
  const added = await s.remember('123', ['新写的一条念头，长度超过八个字符'], { source: 't' });
  await s.flush();
  assert.equal(added, 1);
  assert.ok(Array.isArray(s.people['123']), '保存后应为数组');
  // 脏数据不抛
  s.people = { '1': 'str', '2': null, '3': { foo: 1 } };
  assert.deepEqual(s.list('1'), []);
  assert.deepEqual(s.list('2'), []);
  assert.deepEqual(s.list('3'), []);
  await rm(dir, { recursive: true, force: true });
});

test('配置教程要讲清批量窗口', () => {
  const c = read('lib/client.js');
  assert.match(c, /批量窗口/, '教程里要出现「批量窗口」这个说法');
  // 新教程按章节组织，批量窗口归入「面板配置说明」的回复节奏条目
  assert.ok(c.includes('调整批量窗口、分段间隔和每分钟回复上限'), '要讲清它管什么');
  assert.ok(c.includes('回复节奏'), '要指出在哪个卡片里改');
});

test('README 也讲了批量窗口和 debounceMs', () => {
  const r = read('README.md');
  assert.match(r, /批量窗口/, 'README 要有这一节');
  assert.match(r, /debounceMs/, 'README 要写字段名');
  assert.match(r, /1200/, '要说明默认值');
});

test('避免重复已说过的话：检测器与配置', async () => {
  const { repeatRatio, findRepeatedReply } = await import('../lib/util.mjs');
  const { normalizeConfig } = await import('../lib/config.mjs');

  // 1) 相似度：改写过的复述必须抓得住
  assert.ok(repeatRatio('记得早点睡哦', '记得早点睡哦') >= 0.7, '完全相同');
  assert.ok(repeatRatio('记得早点睡哦～', '记得早点睡哦') >= 0.7, '只差标点');
  assert.ok(repeatRatio('嗯嗯，记得早点睡吧', '记得早点睡哦') >= 0.7, '加语气词');
  assert.ok(repeatRatio('记得早点睡，别熬夜了', '记得早点睡哦') >= 0.7, '扩展一句');
  // 2) 正常换说法不能误判
  assert.ok(repeatRatio('今天天气不错，出去走走吧', '记得早点睡哦') < 0.7, '完全不同');
  assert.ok(repeatRatio('我在吃饭', '我刚吃完饭') < 0.7, '不同的事');
  assert.ok(repeatRatio('嗯', '好的没问题') < 0.7, '太短不算');

  // 3) 只比她说过的话，别人说的不算
  const onlyIn = [{ direction: 'in', text: '记得早点睡哦' }];
  assert.equal(findRepeatedReply('记得早点睡哦', onlyIn).ratio, 0, '别人说的不算重复');
  const withOut = [{ direction: 'out', text: '记得早点睡哦' }];
  assert.ok(findRepeatedReply('记得早点睡哦', withOut).ratio >= 0.7, '自己说的算');

  // 4) 配置项可关、阈值可调
  const base = {
    selfId: '10001', ownerIds: ['10002'],
    onebot: { apiUrl: 'http://127.0.0.1:3000', token: 'x'.repeat(24) },
    events: { secret: 'y'.repeat(24) },
  };
  assert.equal(normalizeConfig(base, 'C:/tmp/c.json').reply.avoidRepeat, true, '默认开启');
  assert.equal(normalizeConfig({ ...base, reply: { avoidRepeat: false } }, 'C:/tmp/c.json').reply.avoidRepeat, false, '可关');
  assert.equal(normalizeConfig(base, 'C:/tmp/c.json').reply.repeatThreshold, 0.7, '默认阈值 0.7');
  assert.equal(normalizeConfig({ ...base, reply: { repeatThreshold: 0.9 } }, 'C:/tmp/c.json').reply.repeatThreshold, 0.9, '阈值可调');

  // 5) runtime 真的调用了检测并复用了返回的新文本
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /#retryOnRepeat/, '要有重问方法');
  assert.match(rt, /findRepeatedReply/, '要调用检测器');
  assert.match(rt, /const outbound = retried \?\? output;/, '重问成功要用新文本');
  assert.match(rt, /splitSegments\(outbound/, '发出去的是新文本');
  // 提示词要有约束
  assert.match(rt, /不要重复你已经说过的话/, '系统提示要写清楚');
});

test('面板能保存复读与批量窗口设置（PATCHABLE 不能漏字段）', () => {
  const ui = read('lib/ui.mjs');
  const body = ui.match(/reply: \[([^\]]+)\]/);
  assert.ok(body, 'PATCHABLE.reply 要存在');
  const allowed = body[1].split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean);
  // 面板提交的字段必须在白名单里，否则点保存会报「不支持的字段」
  for (const f of ['debounceMs', 'avoidRepeat', 'repeatThreshold']) {
    assert.ok(allowed.includes(f), f + ' 必须在 PATCHABLE.reply 白名单里');
  }
  // 面板要有对应控件
  const c = read('lib/client.js');
  assert.match(c, /批量窗口（秒）/, '要有批量窗口输入框');
  assert.match(c, /form\.debounceSec/, '要绑定到 debounceSec');
  assert.match(c, /避免重复说过的话/, '要有复读开关');
  assert.match(c, /form\.avoidRepeat/, '要绑定到 avoidRepeat');
  // 轮询间隔和批量窗口是两个不同的东西，不能混为一谈
  assert.match(c, /轮询间隔（秒）/, '轮询要单独一个控件');
  const iWin = c.indexOf('批量窗口（秒）');
  const iPoll = c.indexOf('轮询间隔（秒）');
  assert.ok(iWin > 0 && iPoll > iWin, '批量窗口要排在轮询间隔之前');
});

test('主动消息不重复最近说过的事', async () => {
  const { findRepeatedReply, repeatRatio } = await import('../lib/util.mjs');
  const rt = read('lib/runtime.mjs');

  // 1) 主动消息要把「最近她说过的话」喂给模型
  assert.match(rt, /saidRecently/, '要取最近发言');
  assert.match(rt, /你最近在这个对话里已经说过的话/, '要写进 prompt');
  assert.match(rt, /如果今天下雨你提过，就别再提下雨/, '要有具体禁令');

  // 2) 生成后还要机械校验，不能只靠提示词
  assert.match(rt, /repeat-suppressed/, '重复时要能放弃这次发送');
  assert.match(rt, /messageText/, '要能替换成重写后的文本');
  assert.match(rt, /splitSegments\(messageText/, '发出去的是校验过的文本');

  // 3) 真实场景：刚说完下雨，主动消息不该再说下雨
  const said = [
    { direction: 'out', text: '今天下雨了，出门记得带伞' },
    { direction: 'out', text: '晚饭吃了面条' },
  ];
  const dup = findRepeatedReply('外面今天下雨了，别忘了带伞哦', said);
  assert.ok(dup.ratio >= 0.7, '重复下雨应被抓住，实际 ' + dup.ratio.toFixed(2));
  const fresh = findRepeatedReply('刚看完一本书，讲航海的', said);
  assert.equal(fresh.text, '', '说新话题不该被拦，实际 ' + fresh.ratio.toFixed(2));

  // 4) 换个说法的复述也要抓住
  assert.ok(repeatRatio('今天下雨了', '今天下雨了，出门记得带伞') >= 0.7, '短句被包含');
});

test('主动消息去重不会无限重试，且受开关控制', () => {
  const rt = read('lib/runtime.mjs');
  // 被拦下后必须把窗口标成已处理：dueWindows 只看 fired 列表，
  // 不标的话同一个窗口在之后每一轮轮询都会重新到期，每次白烧一次模型。
  const sup = rt.indexOf("reason: 'repeat-suppressed'");
  assert.ok(sup > 0, '要有 repeat-suppressed 分支');
  const before = rt.slice(Math.max(0, sup - 400), sup);
  assert.match(before, /await life\.markFired\(now, window\.id/, '拦下前要先 markFired');
  // 关掉 avoidRepeat 时不该再读历史、也不该再检测
  assert.match(rt, /const avoidRepeat = this\.config\.reply\?\.avoidRepeat !== false/, '要读开关');
  assert.match(rt, /if \(avoidRepeat\) \{/, '读历史要受开关控制');
  assert.match(rt, /avoidRepeat && saidAsOut\.length/, '生成后检测要受开关控制');
});

test('主动消息发出去的是校验后的文本', () => {
  const rt = read('lib/runtime.mjs');
  // 若分段/情感/返回值仍用原始 text，重写后的新内容不会被发出去
  assert.match(rt, /splitSegments\(messageText/, '分段用 messageText');
  assert.match(rt, /replyText: messageText/, '情感记账用 messageText');
  assert.match(rt, /text: messageText, segments/, '返回值用 messageText');
});

test('话题词表没有重复条目', async () => {
  // STOP 是 Set，重复项不会报错但说明手写列表有疏漏
  const ut = read('lib/util.mjs');
  const start = ut.indexOf('const STOP = new Set([');
  assert.ok(start > 0, 'STOP 要存在');
  const block = ut.slice(start, ut.indexOf(']);', start));
  const words = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const dups = words.filter((w, i) => words.indexOf(w) !== i);
  assert.deepEqual(dups, [], 'STOP 不应有重复：' + dups.join(','));
});

test('Steam 状态查询与绑定', async () => {
  const { normalizePlayer, normalizeOwnedGames, formatPlaytime, describeSteamStatus } = await import('../lib/steam.mjs');
  const { SteamBindingStore } = await import('../lib/steam-binding.mjs');

  // 1) 在线状态解析
  const online = normalizePlayer({ steamid: '76561198000000000', personaname: 'T', personastate: 1, gameextrainfo: 'ELDEN RING', gameid: '1245620' });
  assert.equal(online.inGame, 'ELDEN RING');
  assert.equal(online.state, '在线');
  const offline = normalizePlayer({ steamid: '76561198000000000', personastate: 0, lastlogoff: Math.floor(Date.now()/1000) - 7200 });
  assert.equal(offline.inGame, '', '离线时不该有游戏名');
  assert.equal(normalizePlayer(null), null, '空输入返回 null');

  // 2) 时长解析：默认只要近两周真的玩过的
  const owned = normalizeOwnedGames({ response: { games: [
    { appid: 1, name: 'A', playtime_forever: 100, playtime_2weeks: 0 },
    { appid: 2, name: 'B', playtime_forever: 50, playtime_2weeks: 30 },
    { appid: 3, name: '', playtime_forever: 999 },
  ] } });
  // 无名游戏过滤掉；A 的近两周是 0，不该冒充「最近在玩」
  assert.equal(owned.length, 1, '只要近两周玩过的');
  assert.equal(owned[0].name, 'B', '保留近两周玩过的那个');
  // 显式要全量时才包含总时长兜底
  const all = normalizeOwnedGames({ response: { games: [
    { appid: 1, name: 'A', playtime_forever: 100, playtime_2weeks: 0 },
    { appid: 2, name: 'B', playtime_forever: 50, playtime_2weeks: 30 },
  ] } }, { recentOnly: false });
  assert.equal(all.length, 2, 'recentOnly: false 时保留全部');
  assert.equal(all[0].name, 'B', '仍按近两周优先排序');
  // 隐私没开时 Steam 返回 { response: {} } —— 不是错误，是空
  assert.deepEqual(normalizeOwnedGames({ response: {} }), []);

  // 3) 时长格式化
  assert.equal(formatPlaytime(0), '');
  assert.equal(formatPlaytime(45), '45 分钟');
  assert.equal(formatPlaytime(60), '1 小时');
  assert.equal(formatPlaytime(185), '3 小时 5 分钟');

  // 4) 状态描述
  assert.match(describeSteamStatus({ inGame: 'X', sinceMinutes: 42 }), /正在 Steam 上玩《X》/);
  assert.equal(describeSteamStatus(null), '');

  // 5) 绑定表
  const dir = await mkdtemp(join(tmpdir(), 'qqa-steam-'));
  const st = new SteamBindingStore({ dataDir: dir, logger: { warn: () => {} } });
  await st.init();
  const b1 = await st.bind('1234567890', '76561198000000000', { nickname: 'me' });
  assert.equal(b1.ok, true);
  assert.equal(st.primary('1234567890').steamId, '76561198000000000');
  // 非法 ID 要明确拒绝，而不是存进去之后查不到
  const bad = await st.bind('1234567890', 'abc');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /17 位/);
  // 重复绑定幂等
  const dup = await st.bind('1234567890', '76561198000000000');
  assert.equal(dup.duplicate, true);
  // 反查
  assert.equal(st.whoIs('76561198000000000'), '1234567890');
  // 上限
  await st.bind('1234567890', '76561198000000001');
  await st.bind('1234567890', '76561198000000002');
  assert.equal((await st.bind('1234567890', '76561198000000003')).ok, false);
  // 持久化
  await st.flush();
  const st2 = new SteamBindingStore({ dataDir: dir, logger: { warn: () => {} } });
  await st2.init();
  assert.equal(st2.list('1234567890').length, 3, '重载后绑定还在');
  // 解绑
  await st2.unbind('1234567890');
  assert.equal(st2.list('1234567890').length, 0);
  await rm(dir, { recursive: true, force: true });
});

test('Steam 接入是「注入上下文 + 主动消息」，不是只做工具', () => {
  const rt = read('lib/runtime.mjs');
  const tools = read('lib/tools.mjs');
  const cfg = read('lib/config.mjs');
  const ui = read('lib/ui.mjs');
  // 注入：回复时把状态放进 input
  // 必须断言「真的出现在 input 对象里」，而不是「文件里出现过这个词」——
  // 后者把注入那行注释掉之后测试仍然是绿的，等于没有判别力。
  assert.match(rt, /\.\.\.\(steamState \? \{ their_steam: steamState \} : \{\}\)/, '要用展开语法注入 input');
  assert.match(rt, /const steamState = await this\.steamPromptBlock\(\{ message, signal \}\)/, '要真的去取状态');
  // 主动消息：也要注入，但提示词要求别每次都提
  assert.match(rt, /steamProactiveBlock/, '主动消息要有独立入口');
  assert.match(rt, /不要一上来就问他游戏的事/, '主动消息要明确要求别每次都提');
  // 群聊默认不注入
  assert.match(rt, /cfg\.privateOnly !== false && message\?\.kind !== 'private'/, '群聊要能挡住');
  // 只读工具保留；绑定/解绑必须只在面板里 —— SteamID 是公开信息，
  // 如果允许在群里绑，任何人都能把别人的 ID 绑到自己身上。
  assert.match(tools, /qq_steam_status/, '只读查询工具要保留');
  assert.ok(!tools.includes("tool('qq_steam_bind'"), '聊天里不能有绑定工具');
  assert.ok(!tools.includes("tool('qq_steam_unbind'"), '聊天里不能有解绑工具');
  const uiSrc = read('lib/ui.mjs');
  assert.match(uiSrc, /\/steam\/bindings/, '面板要有绑定列表接口');
  assert.match(uiSrc, /\/steam\/action/, '面板要有绑定操作接口');
  // 缓存时间可调
  assert.match(cfg, /cacheTtlMs: integer\(raw\.steam\?\.cacheTtlMs/, '缓存时间要可配');
  assert.match(ui, /steam: \['enabled'/, 'PATCHABLE 要有 steam 段');
  // 失败不能让她说不出话
  assert.match(rt, /Steam 状态查询失败/, '要 catch 住');
});

test('没有「默认 SteamID」回退，只有面板绑定表', async () => {
  const { normalizeConfig } = await import('../lib/config.mjs');
  const rt = read('lib/runtime.mjs');
  const cl = read('lib/client.js');
  const cfg = read('lib/config.mjs');

  // 配置里不该再有 steamId 这个字段 —— 留着它意味着「没绑定的人查到号主」，
  // 然后她会在聊天里把号主的状态说成是对方的。
  const base = { selfId: '10001', ownerIds: ['10002'],
    onebot: { apiUrl: 'http://127.0.0.1:3000', token: 'x'.repeat(24) },
    events: { secret: 'y'.repeat(24) } };
  const c = normalizeConfig({ ...base, steam: { enabled: true, apiKey: 'a'.repeat(32), steamId: '76561198000000000' } }, 'C:/t.json');
  assert.equal('steamId' in c.steam, false, 'normalizeConfig 不该再输出 steamId');
  assert.ok(!cfg.includes('steam: { enabled: false, apiKey: \'\', steamId'), 'bootstrap 里不该有 steamId');

  // 查询只认绑定表
  assert.match(rt, /const steamId = bound\?\.steamId \|\| ''/, '不能回退到配置里的默认 ID');
  assert.ok(!rt.includes('config.steam?.steamId'), 'runtime 不该读 config.steam.steamId');

  // 面板上没有输入框
  assert.ok(!cl.includes('默认 SteamID'), '面板不该再有这个输入框');
  assert.ok(!cl.includes('form.steamId'), '表单不该再有这个字段');
});

test('Steam 开关能保存且绑定表独立成卡', () => {
  const ui = read('lib/ui.mjs');
  const cl = read('lib/client.js');

  // 1) /state 必须把 steam 段回传给面板。
  // 漏了这行，面板读 data.config.steam?.enabled 永远是 undefined，
  // 于是「勾选开启 → 保存 → 刷新」又变回关闭。
  assert.match(ui, /steam: maskSecret\(raw\.steam\)/, 'publicState 要回传 steam 段');
  assert.match(cl, /steamEnabled: data\.config\.steam\?\.enabled === true/, '面板要从 config 读开关');

  // 2) 绑定表要和 Steam 设置在同一张卡片里 —— 它属于同一个功能，
  // 分成两张卡会让人以为要分别开两个开关。
  assert.ok(!cl.includes('h(Card, { title: "Steam 绑定" }'), '不该有独立的绑定卡片');
  const iSteam = cl.indexOf('h(Card, { title: "Steam" }');
  assert.ok(iSteam > 0, '要有 Steam 卡片');
  // 绑定区必须落在 Steam 卡片内部（下一张卡之前）
  const nextCardIdx = cl.indexOf('h(Card, { title:', iSteam + 10);
  const steamSection = cl.slice(iSteam, nextCardIdx > 0 ? nextCardIdx : undefined);
  assert.match(steamSection, /绑定表（QQ → Steam）/, '绑定表要在 Steam 卡片里');
  assert.match(steamSection, /steamBindSubmit/, '绑定按钮要在 Steam 卡片里');
  // 绑定区不能受 steamEnabled 控制 —— 关掉开关时也要能看到已有绑定
  const bindAt = steamSection.indexOf('绑定表（QQ → Steam）');
  const beforeBind = steamSection.slice(0, bindAt);
  const lastCond = beforeBind.lastIndexOf('!form.steamEnabled');
  // 绑定区之前最后一个开关条件应该已经闭合，绑定区本身不该再被包在条件里
  assert.ok(!steamSection.slice(bindAt).includes('!form.steamEnabled ? null'), '绑定区不该被开关隐藏');
});

test('绑定表单是多行草稿：成功后按钮变状态并自动加一行', () => {
  const cl = read('lib/client.js');

  // 草稿数组取代了单个 qq/steamId 输入
  assert.match(cl, /const \[steamDrafts, setSteamDrafts\] = useState\(\[\{ id: 1, qq: "", steamId: "", done: false \}\]\)/, '要有草稿数组');
  assert.ok(!cl.includes('steamBindQq'), '旧的单行输入要移除');
  assert.ok(!cl.includes('steamBindId'), '旧的单行输入要移除');

  // 成功后：这一行标记 done，界面上渲染成「✓ 已绑定」而不是按钮
  assert.match(cl, /done: true/, '成功后要标记 done');
  assert.match(cl, /✓ 已绑定/, '要显示已绑定状态');
  assert.ok(cl.includes('✓ 已绑定'), 'done 时要显示已绑定文字');

  // 自动补一行：没有空行时才加
  assert.match(cl, /const hasEmpty = marked\.some\(\(d\) => !d\.done\)/, '要先检查有没有空行');
  assert.ok(cl.includes('return hasEmpty ? marked : [...marked, { id: Date.now(), qq: "", steamId: "", done: false }];'), '没有空行时自动补一行');

  // 失败要撤回 done，否则那一行就改不了也重试不了
  assert.match(cl, /catch \(error\) \{[\s\S]{0,200}done: false/, '失败要撤回 done');

  // 多行时可以删掉某一行
  assert.match(cl, /removeSteamDraft/, '要能删掉某一行');
});

test('1.2.1 审查：复读判定不再被单个三字词触发，短句全等仍能抓到', async () => {
  const { findRepeatedReply } = await import('../lib/util.mjs');
  const hit = (a, b) => findRepeatedReply(a, [{ direction: 'out', text: b }]).text !== '';

  // N1：单个日常三字词不能构成复读
  assert.equal(hit('我去吃饭了', '你吃饭了吗'), false, '「吃饭了」不该判重');
  assert.equal(hit('早点睡', '今天辛苦了，记得早点睡哦，明天还有会'), false, '短句被长句顺口提到不算复读');
  assert.equal(hit('今天下雨了，出门记得带伞', '下雨了我就不出门了，你自己决定'), false, '只共有一个「下雨了」不算');

  // 真正的同义改写仍要抓住（两个以上实质话题重合）
  assert.equal(hit('今天下雨了，出门记得带伞', '外面今天下雨了，别忘了带伞哦'), true, '同义改写要判重');

  // N2：短句完全相同必须能判出来
  assert.equal(hit('晚安', '晚安'), true, '两字完全重复要判');
  assert.equal(hit('嗯嗯', '嗯嗯'), true, '两字完全重复要判');
  assert.equal(hit('好的', '好的'), true, '两字完全重复要判');
  assert.equal(hit('在的', '在的呀'), true, '短句包含要判');

  // 正常换说法不误伤
  assert.equal(hit('我在吃饭', '我刚吃完饭'), false);
  assert.equal(hit('今天天气不错，出去走走吧', '记得早点睡哦'), false);
  assert.equal(hit('嗯', '好的没问题'), false, '单字不算');
});

test('1.2.1 审查：重问为空时沿用原文，不吞回复', () => {
  const rt = read('lib/runtime.mjs');
  // `retried ?? output` 对空串不生效 —— 必须返回 null 才能回退到原文
  assert.match(rt, /if \(!next\) return null;/, '重问为空要返回 null 而不是空串');
  assert.match(rt, /const outbound = retried \?\? output;/, '调用处仍用 ?? 回退');
});

test('1.2.1 审查：qq_meme_send 用正确的 access.target 签名', () => {
  const t = read('lib/tools.mjs');
  // 用拼接构造被禁字符串，否则断言自己就会命中自己
  const banned = 'access.target(' + 'args.kind, peer)';
  assert.ok(!t.includes(banned), '不能把字符串当参数对象传');
  assert.match(t, /access\.target\(args, exec\.agent, \{ management: true \}\)/, '要用正确的签名');
});

test('1.2.1 审查：ownerHarnessTools 开启时不崩', () => {
  const rt = read('lib/runtime.mjs');
  // allowedTools 为 null 表示「不限制」，不是「没有工具」
  assert.ok(!rt.includes("this.memes && allowedTools.includes('qq_meme_search')"), '不能对 null 调 includes');
  assert.match(rt, /!Array\.isArray\(allowedTools\) \|\| allowedTools\.includes\('qq_meme_search'\)/, 'null/非数组要当成不受限');
});

test('1.2.1 审查：自动收集表情收的是贴纸不是照片', () => {
  const ob = read('lib/onebot.mjs');
  const rt = read('lib/runtime.mjs');
  // 贴纸要在独立字段里，同时不能进 images（那个是给视觉模型的）
  assert.match(ob, /stickers: stickerSegments/, 'normalizeEvent 要输出 stickers');
  assert.match(ob, /filter\(x => x\?\.type === 'image' && isSticker\(x\)\)/, 'stickers 只装贴纸');
  assert.match(ob, /filter\(x => x\?\.type === 'image' && !isSticker\(x\)\)/, 'images 仍然排除贴纸');
  // 收集只读 stickers
  assert.match(rt, /\(message\.sticksers \?\? \[\]\)|message\.stickers/, 'collectImages 要读 stickers');
  assert.ok(!rt.includes('for (const image of message.images.slice(0, 4))'), '不能再用 images 收集');
});

test('1.2.1 审查：热闹的群里也能撤回自己刚发的消息', () => {
  const st = read('lib/store.mjs');
  const rt = read('lib/runtime.mjs');
  assert.match(st, /direction = ''/, 'query 要支持 direction 参数');
  assert.match(st, /if \(direction && m\.direction !== direction\) continue;/, '方向过滤要在计入 limit 之前');
  assert.match(rt, /limit: 20, direction: 'out'/, 'findLatestOwnMessage 要按方向查');
  // 主动消息去重同样受这个漏洞影响
  assert.match(rt, /kind: target\.kind, peerId: target\.peerId, limit: 20, direction: 'out'/, '主动消息去重要按方向查');
});

test('Steam 审查 S1：失败也进缓存，不拖慢每条私聊', async () => {
  const { SteamClient } = await import('../lib/steam.mjs');
  const c = new SteamClient({ apiKey: 'a'.repeat(32), timeoutMs: 8000, errorCacheTtlMs: 60000 });
  // 第一次会真发请求（这里必然失败：key 无效）
  let first = 0;
  try { const t = Date.now(); await c.status('76561198000000000'); } catch { first = Date.now(); }
  // 第二次必须秒失败 —— 命中失败缓存
  const t2 = Date.now();
  try { await c.status('76561198000000000'); } catch { /* expected */ }
  assert.ok(Date.now() - t2 < 1000, '第二次不能又等满超时');
  assert.equal(c.cache.size, 1, '失败要写进缓存');
});

test('Steam 审查 S2：最近在玩只算近两周', async () => {
  const { normalizeOwnedGames, describeSteamStatus } = await import('../lib/steam.mjs');
  // 两周都没玩：不能拿总时长冒充「最近」
  const old = normalizeOwnedGames({ response: { games: [
    { appid: 1, name: '老游戏', playtime_forever: 6000, playtime_2weeks: 0 },
  ] } });
  assert.equal(old.length, 0, '两周没玩的不能进「最近在玩」');
  const d1 = describeSteamStatus({ stateCode: 1, state: '在线', recentGames: old });
  assert.ok(!d1.includes('最近在玩'), '不能出现「最近在玩」');
  assert.ok(d1.includes('最近两周没有玩游戏的记录'), '要说明没记录');

  // 有近两周记录：时长用近两周的，不是总时长
  const recent = normalizeOwnedGames({ response: { games: [
    { appid: 1, name: '老游戏', playtime_forever: 6000, playtime_2weeks: 0 },
    { appid: 2, name: '新游戏', playtime_forever: 100, playtime_2weeks: 185 },
  ] } });
  const d2 = describeSteamStatus({ stateCode: 1, state: '在线', recentGames: recent });
  assert.ok(d2.includes('近两周 3 小时 5 分钟'), '用近两周时长');
  assert.ok(!d2.includes('100 小时'), '不能拿总时长冒充');
});

test('Steam 审查 S3：重复绑定时能把昵称补写进去', async () => {
  const { SteamBindingStore } = await import('../lib/steam-binding.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-s3-'));
  const st = new SteamBindingStore({ dataDir: dir, logger: { warn: () => {} } });
  await st.init();
  // 首次绑定：面板还没探测到昵称
  await st.bind('1234567890', '76561198000000000', { nickname: '' });
  assert.equal(st.primary('1234567890').nickname, '');
  // 探测到之后再补写
  const r = await st.bind('1234567890', '76561198000000000', { nickname: 'TestUser' });
  assert.equal(r.duplicate, true);
  assert.equal(r.updated, true, '要标记成已更新');
  assert.equal(st.primary('1234567890').nickname, 'TestUser', '昵称要写进去');
  // 传空昵称不能把已有的清掉
  await st.bind('1234567890', '76561198000000000', { nickname: '' });
  assert.equal(st.primary('1234567890').nickname, 'TestUser', '空昵称不清空');
  await rm(dir, { recursive: true, force: true });
});

test('Steam 审查 S4：错误信息不带 API Key', async () => {
  const { redactSteamUrl } = await import('../lib/steam.mjs');
  const raw = 'https://api.steampowered.com/x?key=abcdef123456&steamids=1';
  const safe = redactSteamUrl(raw);
  assert.ok(!safe.includes('abcdef123456'), 'Key 要被抹掉');
  assert.ok(safe.includes('key=***'), '保留字段名便于排查');
  // 代码里不能出现把 url 拼进错误的写法
  const src = read('lib/steam.mjs');
  assert.ok(!src.includes('url.href'), '不要打印完整 URL');
});

test('图片不强制回复，但决定了要回就必须真看得见', async () => {
  const { scoreGroupMessage } = await import('../lib/group-gate.mjs');
  const base = { selfId: '3576557899', selfNames: ['大肥鱼'], interests: ['游戏'], threshold: 3 };

  // 关键设计：发图**不是**回复的理由。
  // 群里刷图很常见，逼她每张都接会显得话痨。要不要回仍由原来的闸门决定。
  const pureImage = scoreGroupMessage({ text: '[图片]', images: [{ url: 'x' }] }, base);
  assert.equal(pureImage.reply, false, '纯图片不该强制回复');
  assert.equal(pureImage.score, 0, '图片不加分');

  // 被 @ 时当然要回（原有逻辑不变）
  assert.equal(scoreGroupMessage({ text: '[图片]', images: [{ url: 'x' }], mentioned: true }, base).reply, true, '被@要回');

  // 但只要决定回，图片和贴纸都必须送进视觉上下文 ——
  // 否则她会回「表情包我这儿看不了」，听起来像能力缺陷。
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /const sources = \[\.\.\.\(message\.images \?\? \[\]\), \.\.\.\(message\.stickers \?\? \[\]\)\]/, '图片和贴纸都要进 sources');
  assert.match(rt, /const hasPictures = \(message\.images\?\.length \?\? 0\) \+ \(message\.stickers\?\.length \?\? 0\) > 0/, '有图或有贴纸就去读');
  assert.match(rt, /if \(hasPictures\) content\.push/, '决定回复后就附上画面');

  // 进闸门之前不能因为 text 是占位符就丢掉
  assert.match(rt, /const hasPicture = \(message\.images\?\.length \?\? 0\) \+ \(message\.stickers\?\.length \?\? 0\) > 0/, 'accept 要识别图片或贴纸');
  assert.match(rt, /message\.text\.trim\(\) \|\| hasPicture/, '带画面就放行到闸门');
});




test('生图：豆包返回的本地路径不能被丢', async () => {
  const { extractImageUrls } = await import('../lib/imagegen.mjs');

  // 2026-11-15 21:26 的真实回复（来自会话 seq=15）。
  // 以前 extractImageUrls 只收 http(s)，这三个 C:/ 路径被整条丢掉，
  // 于是判成 no_image，而图其实已经写在磁盘上。
  const real = '已为你生成 3 张 3:4 的夜晚大学校园阳台视角图片。\n\n'
    + '![豆包生图 1](C:/Users/csa/.dsh/doubao-images/doubao-2026-11-15T13-26-01-1.png)\n\n'
    + '![豆包生图 2](C:/Users/csa/.dsh/doubao-images/doubao-2026-11-15T13-26-04-2.png)\n\n'
    + '![豆包生图 3](C:/Users/csa/.dsh/doubao-images/doubao-2026-11-15T13-26-07-3.png)';
  const got = extractImageUrls(real);
  assert.equal(got.length, 3, '三张本地图都要认出来');
  assert.ok(got[0].includes('doubao-2026-11-15T13-26-01-1.png'), '路径要完整');

  // 带空格的路径：DSH 自己的 system prompt 要求用尖括号包起来
  assert.deepEqual(extractImageUrls('![x](<C:/Users/csa/a b.png>)'), ['C:/Users/csa/a b.png']);

  // http 照样收，且不能被裸链接正则重复抽成 s://
  assert.deepEqual(extractImageUrls('![x](https://a.com/x.png)'), ['https://a.com/x.png']);

  // 混合也要对
  const mixed = extractImageUrls('图 ![a](C:/1.png) 和 ![b](https://a.com/2.png)');
  assert.deepEqual(mixed, ['C:/1.png', 'https://a.com/2.png']);

  // 非图片扩展名不收
  assert.deepEqual(extractImageUrls('![a](C:/doc.txt)'), []);
  // 重复只算一次
  assert.equal(extractImageUrls('![a](C:/1.png) ![b](C:/1.png)').length, 1);
});


test('生图：从回复里抽图片链接', async () => {
  const { extractImageUrls, buildImagePrompt, resolveImageRoute } = await import('../lib/imagegen.mjs');

  // 豆包生图的返回形式：说明文字 + markdown 图片
  const md = '生成图片：\n\n![生成的图片](https://p3-flow-imagex-sign.byteimg.com/xxx.jpeg)';
  assert.deepEqual(extractImageUrls(md), ['https://p3-flow-imagex-sign.byteimg.com/xxx.jpeg']);

  // HTML img 也要认
  assert.deepEqual(
    extractImageUrls('<img src="https://a.com/x.png">'),
    ['https://a.com/x.png'],
  );
  // 裸链接：只在明确是图片扩展名时才收
  assert.deepEqual(extractImageUrls('看这个 https://a.com/pic.webp 和 https://a.com/page'), ['https://a.com/pic.webp']);
  // 重复图只算一次
  assert.equal(extractImageUrls('![](https://a.com/1.png) ![](https://a.com/1.png)').length, 1);
  // 没有图就是空数组，不能返回 null
  assert.deepEqual(extractImageUrls('只有文字'), []);
  assert.deepEqual(extractImageUrls(null), []);
  // file:// 也收（豆包在别的形态下会给 file URL），但要看扩展名
  assert.deepEqual(extractImageUrls('![](file:///C:/x.png)'), ['file:///C:/x.png']);

  // 提示词：不能把用户没说的东西塞进去
  const p = buildImagePrompt({ prompt: '一只橘猫', style: '水墨', aspectRatio: '16:9' });
  assert.ok(p.includes('一只橘猫'), '主体要在');
  assert.ok(p.includes('水墨'), '风格要在');
  assert.ok(p.includes('16:9'), '比例要在');
  assert.ok(!buildImagePrompt({ prompt: '   ' }), '空描述返回空串');
  assert.ok(!buildImagePrompt({ prompt: '猫', aspectRatio: 'wide' }).includes('wide'), '不合法比例不要带上');

  // 路由默认值
  assert.deepEqual(resolveImageRoute({}), { provider: 'doubao', model: 'image-gen' });
  assert.deepEqual(resolveImageRoute({ provider: 'x', model: 'y' }), { provider: 'x', model: 'y' });
});

test('生图：提示词真的告诉了她什么时候发图', async () => {
  const { buildCapabilityGuide, CAPABILITY_RULES } = await import('../lib/capabilities.mjs');

  // 开着生图工具时，指南里必须有这一条
  const guide = buildCapabilityGuide({ allowed: ['qq_generate_image', 'qq_send_image'], kind: 'private' });
  assert.ok(guide.includes('qq_generate_image'), '指南要列出生图工具');
  assert.ok(guide.includes('你想让他看见'), '要说清楚什么时候用');
  assert.ok(guide.includes('照片里有什么'), '要教怎么写描述');

  // 不允许生图时，不能把它写进指南（否则模型会去调一个没有的工具）
  const without = buildCapabilityGuide({ allowed: ['qq_status'], kind: 'private' });
  assert.ok(!without.includes('qq_generate_image'), '没开就不该出现');

  // 四条生图专用规则都要在
  const joined = CAPABILITY_RULES.join(String.fromCharCode(10));
  assert.ok(joined.includes('不用先征求同意'), '要说可以主动拍');
  assert.ok(joined.includes('不是回答方式'), '要说别把发图当回答');
  assert.ok(joined.includes('照片里不要有文字'), '要提醒别写字');
  assert.ok(joined.includes('安静等它完成'), '要说不用报进度');

  // 发图超时：图片不能用文本那个 15 秒上限
  const onebot = read('lib/onebot.mjs');
  assert.match(onebot, /Math\.max\(60_000/, '图片发送要至少 60 秒超时');
  assert.match(onebot, /async call\(action, params = \{\}, signal, timeoutMs\)/, 'call 要支持单次超时覆盖');
  assert.match(onebot, /timeoutMs \?\? this\.config\.timeoutMs/, '默认仍用配置值');
});

test('生图：她心里是「拍照」不是「画图」', async () => {
  const { buildCapabilityGuide, CAPABILITY_RULES } = await import('../lib/capabilities.mjs');
  const rt = read('lib/runtime.mjs');
  const tl = read('lib/tools.mjs');
  const guide = buildCapabilityGuide({ allowed: ['qq_generate_image'], kind: 'private' });
  const rules = CAPABILITY_RULES.join(String.fromCharCode(10));

  // 她有完整的生活（日程/穿搭/三餐），想给他看自己的午饭时应该是「拍一张」，
  // 而不是「画一张」。工具实现是生图，但她的自我认知必须是拍照。
  assert.ok(guide.includes('照片'), '指南要说照片');
  assert.ok(!guide.includes('画张图，'), '指南不该再说画图');

  assert.ok(rules.includes('想给他看照片时就拍'), '规则要用拍照');
  assert.ok(rules.includes('照片里不要有文字'), '规则要说照片');
  assert.ok(!rules.includes('图里不要有文字'), '不应残留画图措辞');

  // 工具描述也得是拍照
  assert.match(tl, /拍一张照片发给他/, '工具描述要说拍照');

  // 人格层：拍照视角 + 跟随开关
  assert.ok(rt.includes('你可以拍照发给他'), '人格层要有拍照自我认知');
  // B3：人格层不只跟随开关，还要看这个会话有没有生图工具。
  // 非管理员会话被 restrict 掉工具，但人格若仍说「你可以拍照」，
  // 她就会应下来却发不出去。
  assert.match(rt, /this\.config\.image\?\.enabled === true && \(!Array\.isArray\(allowedTools\) \|\| allowedTools\.includes\('qq_generate_image'\)\)/, '人格层要同时跟随开关与工具可用性');
  assert.ok(rt.includes('guideTools'), '指南也要跟随开关');
});


test('生图：模块接线完整', () => {
  const tools = read('lib/tools.mjs');
  const rt = read('lib/runtime.mjs');
  const cfg = read('lib/config.mjs');
  const ui = read('lib/ui.mjs');
  const cl = read('lib/client.js');
  const cap = read('lib/capabilities.mjs');
  const access = read('lib/access.mjs');

  // 工具真的注册了，且会发图
  assert.match(tools, /tool\('qq_generate_image'/, '要注册生图工具');
  assert.match(tools, /runtime\.generateImageFor\(/, '要调 runtime');
  assert.match(tools, /runtime\.sendImage\(/, '生完要发出去');

  // runtime 真的走生图模块，并把图转成 data URL
  assert.match(rt, /import \{ generateImage \} from '\.\/imagegen\.mjs'/, '要引入 imagegen');
  assert.match(rt, /async generateImageFor\(/, '要有 generateImageFor');
  assert.ok(rt.includes('data:') && rt.includes(';base64,'), '要转成 data URL');

  // 配置段：存在且默认关闭
  assert.match(cfg, /image: \{ enabled: false/, 'bootstrap 默认关');
  assert.match(cfg, /image: \{/, 'normalizeConfig 要输出 image 段');

  // 三份清单一致
  assert.match(access, /'qq_generate_image'/, '白名单要有');
  assert.match(cap, /tools: \['qq_generate_image'\]/, '能力指南要有');
  assert.match(ui, /image: \['enabled'/, 'PATCHABLE 要有 image 段');
  assert.match(ui, /runtime\.config\.image = normalized\.image/, '要热更新');
  assert.match(ui, /image: raw\.image/, 'publicState 要回传');

  // 面板
  assert.match(cl, /h\(Card, \{ title: "生图" \}/, '要有生图卡片');
  assert.match(cl, /imgEnabled, onChange/, '要有开关');
});

test('批量窗口内先发图再补文字，图片不能丢', async () => {
  const { collectBatchImages, batchTrigger } = await import('../lib/util.mjs');

  // 真实场景（2026-11-14 归档 #238-241）：
  //   238 in  [图片]
  //   239 in  这个看着挺适合你的
  //   240 out 图片没加载出来诶
  // 触发消息是那条纯文字，以前只取最后一条 → 图片被整个丢掉。
  const batch = [
    { text: '[图片]', images: [{ url: 'https://a/1.png', file: '1.png' }] },
    { text: '这个看着挺适合你的', images: [] },
  ];
  const got = collectBatchImages(batch, 4);
  assert.equal(got.length, 1, '整批里只剩图片的那条也要带上');
  assert.equal(got[0].url, 'https://a/1.png');

  // 连续两张图 + 一句文字：两张都要带上
  const two = collectBatchImages([
    { images: [{ url: 'https://a/1.png', file: '1.png' }] },
    { images: [{ url: 'https://a/2.png', file: '2.png' }] },
    { text: '你觉得哪件比较好', images: [] },
  ], 4);
  assert.equal(two.length, 2, '两张图都要带上');

  // 同一张图重复出现只算一次
  const dup = collectBatchImages([
    { images: [{ url: 'https://a/1.png', file: '1.png' }] },
    { images: [{ url: 'https://a/1.png', file: '1.png' }] },
  ], 4);
  assert.equal(dup.length, 1, '按 url/file 去重');

  // 只有 file 没有 url 的也要保留（NapCat 本地文件形态）
  const fileOnly = collectBatchImages([{ images: [{ url: '', file: 'x.png' }] }], 4);
  assert.equal(fileOnly.length, 1, 'file 形态要保留');
  // 两者都没有的丢掉
  assert.equal(collectBatchImages([{ images: [{ url: '', file: '' }] }], 4).length, 0, '空来源要丢掉');

  // 超上限时保留最新的
  const many = collectBatchImages([
    { images: [{ url: 'https://a/1.png' }, { url: 'https://a/2.png' }] },
    { images: [{ url: 'https://a/3.png' }] },
  ], 2);
  assert.deepEqual(many.map(x => x.url), ['https://a/2.png', 'https://a/3.png'], '保留最新的两张');
  assert.equal(collectBatchImages(batch, 0).length, 0, '上限 0 表示不要图');

  // 真正的修复点：触发消息要带上整批图片（正文仍用最后一条）
  const trigger = batchTrigger(batch, 4);
  assert.equal(trigger.text, '这个看着挺适合你的', '正文仍然用最后一条');
  assert.equal(trigger.images.length, 1, '触发消息必须带上前面那条的图片');
  assert.equal(batchTrigger([], 4), null, '空批次返回 null');
  // 没有图片时原样返回最后一条，不能凭空造出 images 字段
  const plain = { text: '只有文字', images: [] };
  assert.equal(batchTrigger([plain], 4), plain, '没图时原样返回');
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /this\.slots\.run\(\(\) => this\.reply\(trigger\)\)/, '要回复带图的触发消息');
});

test('短链只在自己域名之间跟，且拒绝本机地址', async () => {
  const { blockedHost, hostAllowed, hopAllowed, SHORT_LINK_RELAY_HOSTS } = await import('../lib/parser.mjs');
  const BILI = ['b23.tv', 'bilibili.com'];

  // 本机 / 内网 / IP 字面量一律拒绝
  for (const bad of ['localhost', 'a.localhost', '127.0.0.1', '10.1.2.3', '169.254.169.254', '[::1]', '::1', '']) {
    assert.equal(blockedHost(bad), true, '要拒绝 ' + JSON.stringify(bad));
  }
  // 平台域名不是 IP，放行
  for (const good of ['b23.tv', 'www.bilibili.com', 'xhslink.com']) {
    assert.equal(blockedHost(good), false, '要放行 ' + good);
  }

  // 允许子域，但不能被后缀拼接骗过（evilbilibili.com 不是 bilibili.com）
  assert.equal(hostAllowed('www.bilibili.com', BILI), true);
  assert.equal(hostAllowed('b23.tv', BILI), true);
  assert.equal(hostAllowed('evilbilibili.com', BILI), false);
  assert.equal(hostAllowed('bilibili.com.evil.com', BILI), false);
  assert.equal(hostAllowed('example.com', BILI), false);

  // 中转白名单：已知短链服务可以当中间跳，但必须是显式名单
  assert.ok(SHORT_LINK_RELAY_HOSTS.includes('t.cn'), 't.cn 要在中转名单');
  assert.ok(SHORT_LINK_RELAY_HOSTS.includes('url.cn'), 'url.cn 要在中转名单');
  assert.equal(hopAllowed('t.cn', { allowHosts: BILI, relayHosts: SHORT_LINK_RELAY_HOSTS }), true, '白名单中转可过');
  // 不传 relayHosts 时，中转域名不算允许 —— 必须显式打开
  assert.equal(hopAllowed('t.cn', { allowHosts: BILI }), false, '默认不认中转');
  // 名单外的第三方域名一律拒绝
  assert.equal(hopAllowed('evil.example.com', { allowHosts: BILI, relayHosts: SHORT_LINK_RELAY_HOSTS }), false);
  // 后缀拼接同样挡得住
  assert.equal(hopAllowed('evilt.cn', { allowHosts: BILI, relayHosts: SHORT_LINK_RELAY_HOSTS }), false);

  // 普通网页抓取必须继续不跟随跳转：这是挡 SSRF 的底线
  const src = read('lib/parser.mjs');
  const fetchTextBody = src.slice(src.indexOf('async function fetchText'), src.indexOf('async function resolveShortLink'));
  assert.ok(fetchTextBody.includes("redirect: 'error'"), '普通请求不能跟随跳转');
  // 短链专用路径：手动处理，且最多 3 跳、只走 https
  assert.match(src, /const SHORT_LINK_MAX_HOPS = 3/, '最多 3 跳');
  assert.match(src, /url\.protocol !== 'https:'/, '只允许 https');
  assert.match(src, /redirect: 'manual'/, '短链手动跟随');
  // 中转域名不能当终点：没落到平台就失败
  assert.match(src, /短链停在中转域名上，没有落到平台/, '终点必须是平台域名');
  // 两个平台的允许域名单
  assert.match(src, /allowHosts: \['b23\.tv', 'bilibili\.com'\]/, 'b23 只跟 B 站域名');
  assert.match(src, /allowHosts: \['xhslink\.com', 'xiaohongshu\.com'\]/, '小红书只跟自家域名');
});


test('Steam S5：正在玩的时候不能说「最近两周没有玩」', async () => {
  const { describeSteamStatus } = await import('../lib/steam.mjs');
  // 1) 正在玩，但游戏详情没公开 —— 时长拿不到，不代表没在玩。
  //    以前这里会同时输出「正在玩《X》」和「最近两周没有玩游戏的记录」，自相矛盾。
  const playingPrivate = describeSteamStatus({
    stateCode: 1, state: '在线', inGame: 'ELDEN RING', gamesUnavailable: true, recentGames: [],
  });
  assert.ok(playingPrivate.includes('正在 Steam 上玩《ELDEN RING》'), '要说正在玩');
  assert.ok(!playingPrivate.includes('最近两周没有玩游戏的记录'), '正在玩时不能说没记录');
  assert.ok(playingPrivate.includes('游戏详情没有公开'), '拿不到要说明是隐私问题');

  // 2) 在线但详情没公开、也没在玩：同样不能断言「没玩」
  const onlinePrivate = describeSteamStatus({
    stateCode: 1, state: '在线', gamesUnavailable: true, recentGames: [],
  });
  assert.ok(!onlinePrivate.includes('最近两周没有玩游戏的记录'), '拿不到时不能编结论');
  assert.ok(onlinePrivate.includes('游戏详情没有公开'), '要提示隐私');

  // 3) 确实在线、详情公开、两周没开过：这句才成立
  const onlineNoGames = describeSteamStatus({ stateCode: 1, state: '在线', recentGames: [] });
  assert.ok(onlineNoGames.includes('最近两周没有玩游戏的记录'), '公开且没玩才这么说');

  // 4) 离线时不必补这句
  const offline = describeSteamStatus({ stateCode: 0, state: '离线', recentGames: [] });
  assert.ok(!offline.includes('最近两周没有玩游戏的记录'), '离线时不补没记录');
});

test('主动消息因重复放弃时不占额度', async () => {
  const { VirtualLife } = await import('../lib/virtual-life.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-mf-'));
  const life = new VirtualLife({ dataDir: dir, logger: { warn: () => {} } });
  await life.init();
  const today = new Date();
  await life.markFired(today, 'w-1', 'private:1', { countAsSent: false });
  await life.flush();
  const key = Object.keys(life.state.fired)[0];
  assert.ok((life.state.fired[key] ?? []).includes('w-1'), 'fired 要记，避免重复触发');
  assert.equal((life.state.sent?.[key] ?? []).length, 0, 'sent 不能记，不能占额度');
  // 真发出去才记
  await life.markFired(today, 'w-2', 'private:1');
  await life.flush();
  assert.equal((life.state.sent?.[key] ?? []).length, 1, '真发了才记一条');
  await rm(dir, { recursive: true, force: true });
});

test('批量窗口填 0 不会被改成 1.2 秒', () => {
  const cl = read('lib/client.js');
  // Number(0) || 1.2 会把 0 变成 1.2
  assert.ok(!cl.includes('Number(form.debounceSec) || 1.2'), '不能用 || 兜底');
  assert.match(cl, /Number\.isFinite\(raw\) \? raw : 1\.2/, '只在该回退时才回退');
});

test('账本：failed 后换正文可以重做，uncertain 不抛错', async () => {
  const { ActionLedger } = await import('../lib/store.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-led2-'));
  const led = new ActionLedger(dir);
  await led.init();
  let calls = 0;

  // failed 后模型改写措辞是正常的，必须允许重做
  try {
    await led.run('a', { text: '我下楼买点东西' }, async () => {
      const e = new Error('网络'); e.name = 'OneBotRejectedError'; throw e;
    });
  } catch { /* failed */ }
  const r1 = await led.run('a', { text: '我去楼下买点东西' }, async () => { calls++; return { status: 'sent', messageId: 'm1' }; });
  assert.equal(r1.status, 'sent', 'failed 后换正文要能发出去');
  assert.equal(calls, 1);

  // sent 之后换正文仍然要拒绝：同一个编号不能把另一段话发给同一个人
  await assert.rejects(
    () => led.run('a', { text: '完全不同的内容' }, async () => ({ status: 'sent' })),
    /同一 request_id/,
  );

  // uncertain 换正文：短路且不抛（抛了会让恢复逻辑每轮撞一次）
  try {
    await led.run('b', { text: 'A' }, async () => {
      const e = new Error('中断'); e.name = 'AbortError'; throw e;
    });
  } catch { /* uncertain */ }
  const before = calls;
  const r2 = await led.run('b', { text: 'B 完全不同' }, async () => { calls++; return { status: 'sent' }; });
  assert.equal(r2.status, 'uncertain');
  assert.equal(r2.duplicate, true);
  assert.equal(calls, before, 'uncertain 不能重发');
  await rm(dir, { recursive: true, force: true });
});

test('回合超时写持久放弃记录，restorePending 会跳过', async () => {
  const { ReplySettledStore } = await import('../lib/reply-settled.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-rs-'));
  const st = new ReplySettledStore({ dataDir: dir, logger: { warn: () => {} } });
  await st.init();
  assert.equal(st.has('private', '1', '123'), false);
  await st.mark('private', '1', '123', 'timeout');
  assert.equal(st.has('private', '1', '123'), true);
  assert.equal(st.has('private', '1', '999'), false, '不同消息不受影响');
  assert.equal(st.has('group', '1', '123'), false, '不同会话不受影响');
  // 持久化：重启后仍然跳过
  await st.flush();
  const st2 = new ReplySettledStore({ dataDir: dir, logger: { warn: () => {} } });
  await st2.init();
  assert.equal(st2.has('private', '1', '123'), true);
  // 空 id 不能误判
  assert.equal(st2.has('private', '1', ''), false);
  await rm(dir, { recursive: true, force: true });
});

test('限流等待不占全局锁', async () => {
  const { RateLimiter } = await import('../lib/util.mjs');
  const rl = new RateLimiter({ globalGapMs: 0, peerGapMs: 400, maxPerMinute: 100 });
  // 两个不同会话：都不该被对方的 peerGap 拖住
  const t0 = Date.now();
  await Promise.all([rl.wait('A'), rl.wait('B')]);
  const both = Date.now() - t0;
  assert.ok(both < 200, '锁不能被 delay 占住，实际 ' + both + 'ms');
  // 同一会话仍然要等够间隔
  const rl2 = new RateLimiter({ globalGapMs: 0, peerGapMs: 300, maxPerMinute: 100 });
  const t1 = Date.now();
  await rl2.wait('A');
  await rl2.wait('A');
  assert.ok(Date.now() - t1 >= 250, '同会话间隔要保留');
});

test('不同会话可以并行回复（并发配置真的生效）', () => {
  const rt = read('lib/runtime.mjs');
  // 旧写法在 for 里 await 信号量，永远只有一个任务
  assert.ok(!rt.includes('try { await this.slots.run(() => this.reply(last)); }'), '不能在循环里 await');
  assert.match(rt, /await Promise\.all\(jobs\)/, '要并发等所有任务');
  assert.match(rt, /this\.slots\.run\(\(\) => this\.reply\(trigger\)\)/, '仍然经过信号量（trigger 是合并了整批图片的触发消息）');
});

test('短链按平台域名受控跟随', async () => {
  const { blockedHost, hostAllowed } = await import('../lib/parser.mjs');
  const src = read('lib/parser.mjs');
  // 本机和 IP 一律拒绝
  for (const h of ['localhost', '127.0.0.1', '192.168.1.1', '::1', '169.254.169.254']) {
    assert.equal(blockedHost(h), true, h + ' 应该被拦');
  }
  assert.equal(blockedHost('b23.tv'), false);
  // 域名后缀匹配不能被相似域名骗过
  assert.equal(hostAllowed('www.bilibili.com', ['bilibili.com']), true);
  assert.equal(hostAllowed('evil-bilibili.com', ['bilibili.com']), false);
  assert.equal(hostAllowed('bilibili.com.evil.com', ['bilibili.com']), false);
  // 短链走受控跟随，普通请求仍然不跟
  assert.match(src, /redirect: 'manual'/, '短链要手动跟跳转');
  assert.match(src, /redirect: 'error'/, '普通请求仍然不跟');
  assert.match(src, /SHORT_LINK_MAX_HOPS = 3/);
  assert.match(src, /allowHosts: \['b23\.tv', 'bilibili\.com'\]/);
  assert.match(src, /allowHosts: \['xhslink\.com', 'xiaohongshu\.com'\]/);
});

test('立即发说说被拒时用真实返回值，不读 history[0]', () => {
  const rt = read('lib/runtime.mjs');
  const ui = read('lib/ui.mjs');
  const tl = read('lib/tools.mjs');
  // 三个分支都要返回结果
  assert.match(rt, /return \{ status: 'failed'/, 'failed 分支要返回');
  assert.match(rt, /return \{ status: 'uncertain'/, 'uncertain 分支要返回');
  assert.match(rt, /return \{ status, tid: result\.tid/, 'sent 分支要返回');
  // 调用方不能再从历史里猜
  assert.ok(!ui.includes("const latest = after.history[0] ?? null;"), '面板不能读 history[0]');
  assert.ok(!tl.includes('state.snapshot(cfg).history[0]'), '工具不能读 history[0]');
  assert.match(ui, /outcome\?\.status/, '面板要用返回值');
  assert.match(tl, /outcome\?\.status/, '工具要用返回值');
});

test('定时主动消息和快照用同一组参数', () => {
  const rt = read('lib/runtime.mjs');
  // 两处 dueWindows 都要传 defaultAudience 和 minGapMinutes
  const calls = rt.split('dueWindows(').length - 1;
  assert.ok(calls >= 2, '至少两处调用');
  const withAudience = rt.split('defaultAudience: this.#defaultProactiveAudience').length - 1;
  assert.ok(withAudience >= 2, '两处都要传 defaultAudience，实际 ' + withAudience);
  const withGap = rt.split('minGapMinutes: Number(cfg.proactiveMinGapMinutes').length - 1;
  assert.ok(withGap >= 1, '推送路径要传 minGapMinutes');
});

test('M1 热更新时补建「启动时关、现在开」的存储', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /async applyHotConfig\(next\)/, '要有补建入口');
  assert.match(rt, /next\.emotion\?\.enabled === true && !this\.emotion/, '情感从关到开要新建');
  assert.match(rt, /next\.memory\?\.enabled === true && !this\.memory/, '记忆同理');
  assert.match(rt, /next\.thoughts\?\.enabled !== false && !this\.thoughts/, '念头同理');
  const ui = read('lib/ui.mjs');
  assert.match(ui, /runtime\.applyHotConfig\?\.\(normalized\)/, '保存时要调用它');
});

test('M2 会话列表的 lastAt 是毫秒且字段真的存在', async () => {
  const st = read('lib/store.mjs');
  assert.match(st, /lastAt: Number\(message\.time\) \* 1000/, 'message.time 是秒，要换成毫秒');
  const ui = read('lib/ui.mjs');
  // 旧索引没有 lastAt：要能从 time 回退，别让面板整列空白
  assert.match(ui, /lastAt: c\.lastAt \?\?/, '要有回退');
});

test('M3 图片下载有真实字节上限，且不跟随跳转', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /const MAX_BYTES = 8 \* 1024 \* 1024/, '要有上限常量');
  assert.match(rt, /if \(total > MAX_BYTES\)/, '边读边数，超了就掐');
  assert.match(rt, /redirect: 'error'/, '不跟随跳转');
  assert.ok(!/return Buffer\.from\(await response\.arrayBuffer\(\)\)/.test(rt), '不能再一次性读完');
});

test('M4 发往目标的工具都要过访问控制', () => {
  const tl = read('lib/tools.mjs');
  for (const name of ['qq_meme_send', 'qq_poke', 'qq_repeat_message', 'qq_get_group_members']) {
    const i = tl.indexOf(`tool('${name}'`);
    assert.ok(i > 0, name + ' 还在');
    const seg = tl.slice(i, i + 1400);
    assert.match(seg, /access\.target\(/, name + ' 要过 access.target（黑名单）');
  }
});

test('M5 未连接时工具仍可用（内层 allowOffline 不再被外层盖掉）', () => {
  const tl = read('lib/tools.mjs');
  assert.match(tl, /const OFFLINE_TOOLS = new Set\(\[/, '要有离线可用清单');
  assert.match(tl, /allowOffline: name === 'qq_status' \|\| OFFLINE_TOOLS\.has\(name\)/, '外层要查清单');
  // 这条清单里的东西不该依赖 QQ 连接
  const set = tl.slice(tl.indexOf('const OFFLINE_TOOLS'), tl.indexOf(']);', tl.indexOf('const OFFLINE_TOOLS')));
  for (const must of ['qq_web_search', 'qq_life_status', 'qq_web_extract']) {
    assert.ok(set.includes(must), '缺少离线工具：' + must);
  }
  assert.ok(!set.includes("'qq_poke'"), 'poke 需要连接，不能算离线');
  assert.ok(!set.includes("'qq_repeat_message'"), 'repeat 需要连接，不能算离线');
});

test('M6 删除说说用说说自己的创建时间', () => {
  const qh = read('lib/qzone-http.mjs');
  assert.match(qh, /feedsTime: Number\(feed\.created/, '要用 created_time');
  assert.ok(!/feedsTime: Math\.floor\(Date\.now\(\) \/ 1000\)/.test(qh), '不能再用「现在」');
  assert.match(qh, /created: Number\(raw\.created_time/, '列表解析里确实有 created');
});

test('M7 @全体 也算在叫她', () => {
  const ob = read('lib/onebot.mjs');
  assert.match(ob, /qq === selfId \|\| qq === 'all'/, "@全体 (qq='all') 要算 mentioned");
});

test('M8 恢复未回复队列时带上引用和图片', () => {
  const rt = read('lib/runtime.mjs');
  const seg = rt.slice(rt.indexOf('async restorePending'), rt.indexOf('async flushPending'));
  assert.match(seg, /lastIn\.replyId/, '要带 replyId');
  assert.match(seg, /lastIn\.quoted/, '要带 quoted');
  assert.match(seg, /lastIn\.images/, '要带 images');
});

test('M9 分段超限不丢内容', async () => {
  const { splitSegments } = await import('../lib/runtime.mjs');
  const long = Array.from({ length: 12 }, (_, i) => '第' + (i + 1) + '句').join('\n');
  const segs = splitSegments(long, 2000, 8);
  assert.equal(segs.length, 8, '还是 8 段');
  assert.ok(segs.join('').includes('第12句'), '第 9 段以后要并进最后一条，不能丢');
});

test('M10 从 .bak 恢复后要写回主文件', () => {
  const cm = read('lib/config.mjs');
  const seg = cm.slice(cm.indexOf('if (recovered)'), cm.indexOf('if (recovered)') + 1200);
  assert.match(seg, /renameFile\(tmp, path\)/, '要把备份写回 config.json');
  assert.ok(!/^\s*return normalizeConfig\(recovered, path\);$/m.test(seg.split('renameFile(tmp, path)')[0]), '写回要在 return 之前');
});

test('M11 总队列上限真的接上了', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /const maxTotal = Math\.max\(1, Number\(this\.config\.reply\?\.maxQueuedTotal/, '要读 maxQueuedTotal');
  assert.match(rt, /if \(this\.totalQueued >= maxTotal\)/, '要有闸门');
  assert.match(rt, /this\.totalQueued = \[\.\.\.this\.pending\.values\(\)\]/, '要维护计数');
});

test('M12 归档和记忆配额用本地日期，不用 UTC', async () => {
  const store = read('lib/store.mjs');
  const memory = read('lib/memory.mjs');
  assert.match(store, /const date = isoDate\(new Date\(\)\)/, '归档用本地日期');
  assert.match(memory, /isoDate\(/, '记忆配额用本地日期');
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(store), 'store 里不能再用 UTC');
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(memory), 'memory 里不能再用 UTC');
  // 东八区凌晨时本地日期必须还是「今天」
  const { isoDate } = await import('../lib/util.mjs');
  const local = new Date(2026, 10, 13, 3, 30);
  assert.equal(isoDate(local), '2026-11-13');
});

test('M13 面板能维护群白名单和黑名单', () => {
  const c = read('lib/client.js');
  for (const field of ['groupIds', 'blockedUsers', 'blockedGroups']) {
    assert.ok(c.includes(`value: form.${field}`), '缺少输入框：' + field);
    assert.ok(c.includes(`${field}: splitIds(form.${field})`), '缺少提交：' + field);
  }
});

test('M14 关键词情感不含单字', async () => {
  const es = read('lib/emotion-store.mjs');
  const block = es.slice(es.indexOf('KEYWORD_GROUPS = {'), es.indexOf('};', es.indexOf('KEYWORD_GROUPS = {')));
  const words = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const single = words.filter((w) => w.length === 1);
  assert.deepEqual(single, [], '还有单字词：' + single.join(','));
  // 「爱好」不该被当成爱

  const { analyzeKeywords } = await import('../lib/emotion-store.mjs');
  assert.equal(analyzeKeywords('我的爱好是爬山').category, 'neutral');
});

test('M15 主动消息的默认受众跟开关走', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /#defaultProactiveAudience\(cfg\)/, '要有默认受众计算');
  assert.match(rt, /defaultAudience: this\.#defaultProactiveAudience\(cfg\)/, '要传给 dueWindows');
  const vl = read('lib/virtual-life.mjs');
  assert.match(vl, /defaultAudience = 'private'/, 'planedWindows 要接参数');
  assert.match(vl, /audience: src\?\.audience \|\| defaultAudience/, '不能写死 private');
});

test('M16 已发送计数按会话分开', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /this\.sentByConversation = new Map\(\)/, '要按会话存');
  assert.match(rt, /#sentCount\(kind, peerId\)/, '要有读取');
  assert.match(rt, /#markSent\(kind, peerId\)/, '要有自增');
  assert.equal(rt.includes('this.' + 'sentSinceMark'), false, '全局计数要没了');
});

test('M17 私聊戳一戳只发一个 user_id', () => {
  const ob = read('lib/onebot.mjs');
  const seg = ob.slice(ob.indexOf('poke(kind, peerId, userId, signal)'), ob.indexOf('poke(kind, peerId, userId, signal)') + 700);
  assert.match(seg, /group_poke.*group_id/, '群戳带 group_id');
  assert.match(seg, /friend_poke.*user_id: String\(peerId\)/, '私聊只发一个 user_id 且是会话对象');
});

test('M18 端口探测不再把超时当成占用', async () => {
  const nk = read('lib/napcat.mjs');
  assert.match(nk, /const first = await attempt\(1000\)/, '第一次探测');
  assert.match(nk, /const second = await attempt\(2000\)/, '超时要重试一次');
  assert.match(nk, /return second !== 'busy'/, '仍不确定就当空闲，别凭空拒绝');
  const { portAvailable } = await import('../lib/napcat.mjs');
  assert.equal(typeof portAvailable, 'function');
});

test('M19 g_tk 必须由 p_skey 算', () => {
  const qh = read('lib/qzone-http.mjs');
  assert.match(qh, /const pSkey = jar\.get\('p_skey'\) \?\? ''/, '不能退到 skey');
  assert.ok(!/jar\.get\('p_skey'\) \?\? jar\.get\('skey'\)/.test(qh), '旧的兜底要没了');
});

test('M20 链接解析不跟随跳转', () => {
  const pr = read('lib/parser.mjs');
  assert.match(pr, /redirect: 'error'/, '短链可能跳到内网，不能跟');
  assert.ok(!/redirect: 'follow'/.test(pr), '旧的跟随要没了');
});

test('M21 去重有归档兜底', () => {
  const st = read('lib/store.mjs');
  assert.match(st, /async #archiveHas\(message\)/, '要有回查');
  assert.match(st, /if \(await this\.#archiveHas\(message\)\)/, 'append 里要调用');
});

test('M22 归档存的是发出去的正文，不是 CQ 原文', () => {
  const rt = read('lib/runtime.mjs');
  const seg = rt.slice(rt.indexOf('async send(kind, peerId, text'), rt.indexOf('async send(kind, peerId, text') + 2600);
  assert.match(seg, /text: body,/, '归档要用 body');
  assert.match(seg, /const body = inline\.length \? stripCqAt\(text\) : text;/, 'body 是剥离 CQ 之后的');
});

test('M24 禁言参数不再把非法值当成 0（解除禁言）', () => {
  const tl = read('lib/tools.mjs');
  assert.ok(!/Number\(args\.duration\) \|\| 0/.test(tl), '不能再用 || 0');
  assert.match(tl, /duration 必填/, '缺参要报错');
  // 表情索引改原子写
  const me = read('lib/memes.mjs');
  assert.match(me, /const tmp = `\$\{this\.indexPath\}/, '索引要写临时文件');
  assert.match(me, /await rename\(tmp, this\.indexPath\)/, '再改名');
});

test('M25 正负同现时也记一点变化', async () => {
  const { analyzeKeywords } = await import('../lib/emotion-store.mjs');
  const r = analyzeKeywords('我喜欢你但你好烦');
  assert.equal(r.category, 'mixed');
  assert.ok(Object.keys(r.deltas).length > 0, 'mixed 不能是空 deltas（以前会白记一轮）');
});

test('H1 推送到达即触发回包，不再只靠 60 秒轮询', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /#scheduleFlush\(\)\s*\{/, '要有短防抖调度');
  assert.match(rt, /this\.#scheduleFlush\(\);/, 'accept() 入队后要调用它');
  assert.match(rt, /clearTimeout\(this\.flushTimer\)/, '连发几句只触发一次');
  assert.match(rt, /debounceMs \?\? 1200/, '默认 1.2 秒');
});

test('H1 whenIdle 必须有上限，卡住不能停掉所有回复', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /#awaitAgentIdle\(record, idleMs\)/, '要包一层超时');
  assert.match(rt, /record\.agent\.cancel\(\{ kind: 'user' \}\)/, '超时要先 cancel');
  // 超时后必须把这轮记成已处理，否则 restorePending 会反复重跑
  // 窗口给大一点：这段里有解释为什么不能写进聊天归档的注释。
  const seg = rt.slice(rt.indexOf('if (!idleOk)'), rt.indexOf('if (!idleOk)') + 1400);
  assert.match(seg, /record\.lastMessageId = message\.messageId/, '超时要标记已处理');
  assert.match(seg, /return;/, '超时要跳出本轮');
  // 光有内存标记不够：restorePending 只比较归档时间，必须写持久记录
  assert.match(seg, /replySettled\?\.mark\(/, '超时要写持久放弃记录');
  assert.match(rt, /replySettled\?\.has\(conversation\.kind/, 'restorePending 要跳过已放弃的');
});

test('H3 账本：failed 和超时 pending 允许重做，sent/uncertain 短路', async () => {
  const { ActionLedger } = await import('../lib/store.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'qqa-led-'));
  const ledger = new ActionLedger(dir);
  await ledger.init();
  let ran = 0;
  // 第一次：确定被拒绝 → failed
  const rejection = Object.assign(new Error('被拒'), { name: 'OneBotRejectedError' });
  await assert.rejects(ledger.run('r1', { a: 1 }, async () => { ran++; throw rejection; }));
  // 同一个 request_id 再来：failed 必须允许真的重做
  const ok = await ledger.run('r1', { a: 1 }, async () => { ran++; return { status: 'sent', messageId: '999' }; });
  assert.equal(ran, 2, 'failed 之后必须真的重执行（以前直接短路，用户永远收不到）');
  assert.equal(ok.status, 'sent');
  assert.equal(ok.result.messageId, '999');
  // 第三次：已经 sent，必须短路（去重）
  const dup = await ledger.run('r1', { a: 1 }, async () => { ran++; return { status: 'sent' }; });
  assert.equal(ran, 2, 'sent 之后不能再执行');
  assert.equal(dup.duplicate, true);
  // uncertain 也要短路：可能已经送到，宁可漏发不重发
  await assert.rejects(ledger.run('r2', { b: 2 }, async () => { ran++; throw new Error('超时'); }));
  const dup2 = await ledger.run('r2', { b: 2 }, async () => { ran++; return { status: 'sent' }; });
  assert.equal(ran, 3, 'uncertain 不能再执行');
  assert.equal(dup2.status, 'uncertain');
  await rm(dir, { recursive: true, force: true });
});

test('H4 情感按发言人记，不按群号', () => {
  const rt = read('lib/runtime.mjs');
  const hits = (rt.match(/peerId: this\.memoryPersonId\(message\) \|\| message\.peerId/g) ?? []).length;
  assert.ok(hits >= 2, '提示词侧和记账侧都要按人（实际 ' + hits + ' 处）');
  assert.ok(!/recordEmotion\(\{\s*\n\s*peerId: message\.peerId, kind: message\.kind, sessionId: record\.key/.test(rt), '不能再按会话/群号记账');
});

test('H5 启动时加载记忆、情感、念头和虚拟人生', () => {
  const rt = read('lib/runtime.mjs');
  const seg = rt.slice(rt.indexOf('async initialize('), rt.indexOf('this.identity ='));
  assert.match(seg, /await this\.memory\?\.init\?\.\(\)/, '记忆');
  assert.match(seg, /await this\.emotion\?\.init\?\.\(\)/, '情感');
  assert.match(seg, /await this\.thoughts\?\.init\?\.\(\)/, '念头');
  assert.match(seg, /await this\.life\.init\?\.\(\)/, '虚拟人生（之前默认配置下永远不注入）');
});

test('H6 默认兴趣词没有单字，学习词过滤虚词，且会衰减', () => {
  const gate = read('lib/group-gate.mjs');
  const block = gate.slice(gate.indexOf('DEFAULT_INTERESTS = ['), gate.indexOf('];', gate.indexOf('DEFAULT_INTERESTS = [')));
  const words = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(words.filter((w) => w.length === 1), [], '不能有单字词（命中一个就是 +3 = 必回）');
  assert.match(gate, /const STOPWORDS = new Set\(/, '学习要过滤虚词');
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /this\.interestLearner\?\.decayAll\?\.\(\)/, '衰减要真的被调用');
});

test('H7 事实键：记住≠住址，我在≠永久事实', () => {
  const rt = read('lib/runtime.mjs');
  const rules = rt.slice(rt.indexOf('const rules = ['), rt.indexOf('for (const [pattern, key] of rules)') + 30);
  assert.ok(!/\/住\|在哪\//.test(rules), '住址不能用裸「住」（会命中「记住」）');
  assert.match(rules, /\(我\|家\)\?住\(在\|址\)/, '住址要带动词');
  // 喜好规则必须排在住址规则之前
  const likeAt = rules.indexOf('对方.喜好'), addrAt = rules.indexOf('对方.住址');
  assert.ok(likeAt > 0 && likeAt < addrAt, '喜好要先于住址判定');
  const factual = rt.match(/const factual = \/.*?\/;/)?.[0] ?? '';
  assert.ok(!/\|我在\|/.test(factual), '「我在」不能单独成为事实');
});

test('H8 事件端口被占用时是可控错误，不是未捕获异常', () => {
  const ev = read('lib/events.mjs');
  assert.match(ev, /server\.once\('error', onError\)/, '必须监听 error');
  assert.match(ev, /EADDRINUSE/, '要给出端口占用的明确提示');
});

test('H9 面板鉴权看 socket 远端地址，不看 Host 头', () => {
  const ui = read('lib/ui.mjs');
  assert.match(ui, /req\.socket\?\.remoteAddress/, '要按 TCP 对端判断');
  assert.match(ui, /hostIsLoopback\(req\)/, 'Host 作为附加条件（挡 DNS rebinding）');
  assert.match(ui, /if \(isLoopback\(req\) && hostIsLoopback\(req\)\) return true;/, '两个都要满足');
});

test('H10 自动配表情真的有读取点', () => {
  // 这个开关在配置、面板、热更新白名单里都有，却没有消费方 ——
  // 用户打开后什么都不发生，面板还说「已即时生效」。
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /cfg\.autoSend !== true/, '要读 memes.autoSend');
  assert.match(rt, /autoSendChance/, '要读概率');
  assert.match(rt, /#trySendAutoMeme\(message, output, signal\)/, '要有实现');
  assert.match(rt, /await this\.#trySendAutoMeme/, '回复发完后要调用');
});

test('H11 qq_meme_send 读账本内层 messageId，失败不谎报成功', () => {
  const tl = read('lib/tools.mjs');
  assert.match(tl, /entryRecord\?\.result\?\.messageId/, '要读 result.result.messageId');
  assert.match(tl, /const status = entryRecord\?\.status/, '要看账本状态');
  assert.match(tl, /if \(status !== 'sent'\)/, '非 sent 不能报已发送');
  assert.ok(!/return \{ status: 'sent', messageId: result\.messageId/.test(tl), '旧的错误写法要没了');
});

test('H12 恢复未回复队列不覆盖刚入队的新消息', () => {
  const rt = read('lib/runtime.mjs');
  const seg = rt.slice(rt.indexOf('async restorePending'), rt.indexOf('async flushPending'));
  // await store.query 之后、set 之前必须再查一次 pending
  const q = seg.indexOf('await this.store.query(');
  const s2 = seg.indexOf('this.pending.set(key, [{');
  const between = seg.slice(q, s2);
  assert.ok(q > 0 && s2 > q, '顺序要对');
  assert.match(between, /if \(this\.pending\.has\(key\)\) continue;/, 'await 之后要复查 pending');
});

test('H13 空间状态写盘失败要能被调用方知道', () => {
  const qp = read('lib/qzone-proactive.mjs');
  assert.match(qp, /return next;/, '#save 要返回真实结果');
  assert.match(qp, /this\.writeChain = next\.catch/, '链上仍吞掉，保证后续写入能继续');
  assert.match(qp, /this\.state\.dirty = true;/, 'markFired 失败要打标记');
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /#safeMarkFired\(state, now, slotId, entry\)/, '调用方要包一层，不能把已发出的说说误报成失败');
});

test('主动消息的提示词要注入情感、记忆和念头', () => {
  const rt = read('lib/runtime.mjs');
  const i = rt.indexOf('async #proactiveTurn(');
  assert.ok(i > 0, '要有 #proactiveTurn');
  // 以前签名是 (prompt, agentOptions)，拿不到 target —— 提示词里只有人格一段，
  // 她不知道对方是谁、不记得约定、不知道关系状态。
  const sig = rt.slice(i, rt.indexOf('{', i));
  assert.match(sig, /target/, '#proactiveTurn 要接收 target');
  const seg = rt.slice(i, i + 2600);
  assert.match(seg, /this\.emotionPromptBlock\(/, '要注入情感块');
  assert.match(seg, /this\.memoryPromptBlock\(/, '要注入记忆块');
  assert.match(seg, /this\.thoughtPromptBlock\(/, '要注入念头块');
  assert.match(seg, /emotionBlock,/, 'emotionBlock 要进提示词');
  assert.match(seg, /memoryBlock,/, 'memoryBlock 要进提示词');
  assert.match(seg, /thoughtBlock,/, 'thoughtBlock 要进提示词');
  assert.match(seg, /senderId: personId/, '记忆要用发言人 id');
});

test('#composeProactive 要把 target 透传，并把 raw 事件带回来', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /async #composeProactive\(prompt, target = null, queryText = ''\)/, '签名要带 target');
  assert.match(rt, /#proactiveTurn\(prompt, agentOptions, target, queryText\)/, '调用时要传下去');
  // raw 要带回来，主动消息才记得下这一轮的念头
  assert.match(rt, /if \(events > 0\) return \{ text, raw \};/, '成功时要返回 raw');
  assert.match(rt, /const \{ text, raw \} = await this\.#composeProactive\(prompt, target, String\(window\.intent/, '主动消息要解构 raw');
});

test('主动消息发出后要记情感和念头', () => {
  const rt = read('lib/runtime.mjs');
  const i = rt.indexOf('async tickProactive(');
  const seg = rt.slice(i, i + 12000);
  assert.match(seg, /this\.recordEmotion\(/, '主动消息后要 recordEmotion');
  assert.match(seg, /this\.recordThoughts\(/, '主动消息后要 recordThoughts');
  assert.match(seg, /source: '主动消息'/, '要标明来源');
});

test('reasoning 要从 assistant 消息的 content 里捞出来', async () => {
  // reasoning 不是独立事件，而是 content 里 { type: 'reasoning', text } 的块。
  // settledReply() 只取 text 块，所以这部分一直是丢的。
  const dir = await mkdtemp(join(tmpdir(), 'qqa-th-'));
  const runtime = await freshRuntime(dir);
  const events = [
    { type: 'assistant/message', data: { message: { content: [
      { type: 'reasoning', text: '他明天没课，我可以问问他想做什么' },
      { type: 'text', text: '明天有什么打算吗' },
    ] } } },
    { type: 'assistant/message', data: { message: { content: [
      { type: 'reasoning', text: '   ' },
      { type: 'reasoning', text: '说好了要监督他学习' },
    ] } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ];
  const got = runtime['#reasoningFromEvents'] ? [] : null;
  // 私有方法只能擦边调：走 recordThoughts 再读回来
  const added = await runtime.recordThoughts({ personId: '20001', events, source: '回复' });
  assert.equal(added, 2, '两条有效 reasoning 都要存下（空白那条要过滤）');
  const saved = runtime.thoughts.list('20001', { limit: 5 });
  assert.equal(saved.length, 2);
  assert.ok(saved.some((t) => t.text.includes('明天没课')));
  assert.ok(saved.some((t) => t.text.includes('监督他学习')));
  assert.equal(runtime.thoughts.list('20001', { limit: 5 })[0].source, '回复');
  await rm(dir, { recursive: true, force: true });
});

test('念头能注入回提示词，并明确要求不要复述', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qqa-th2-'));
  const runtime = await freshRuntime(dir);
  await runtime.thoughts.init();
  await runtime.thoughts.remember('20001', ['他明天一整天没课，也许想找点事做']);
  const block = runtime.thoughtPromptBlock({ personId: '20001' });
  assert.ok(block.includes('明天一整天没课'), '要带出念头内容');
  assert.match(block, /不要复述/, '必须要求不要复述，否则人设会崩');
  assert.match(block, /内心活动/, '要说清这是内心活动');
  // 没有念头的人返回空串，不能凭空编
  assert.equal(runtime.thoughtPromptBlock({ personId: '29999' }), '');
  await rm(dir, { recursive: true, force: true });
});

test('主动消息的记忆召回要用真实查询词，否则事件类记忆全被过滤', async () => {
  // 主动消息原来传 text: ''，而 recall() 用查询词算相关度 ——
  // 空串的分数够不到 minScore，于是只有「事实」类能注入，「事件」类一条都进不来。
  const dir = await mkdtemp(join(tmpdir(), 'qqa-q-'));
  const runtime = await freshRuntime(dir);
  await runtime.memory.init();
  await runtime.memory.remember('20001', { text: '我明天一整天没课，想找点事做', kind: 'event', importance: 2 });
  await runtime.memory.remember('20001', { text: '在做一个叫 awesome-dsh-plugin 的项目', kind: 'fact', importance: 3 });
  const personId = '20001', kind = 'private';
  const withQuery = runtime.memoryPromptBlock({ message: { senderId: personId, peerId: personId, kind, text: '他明天没课，问问他打算做什么', nickname: '' } });
  const noQuery = runtime.memoryPromptBlock({ message: { senderId: personId, peerId: personId, kind, text: '', nickname: '' } });
  assert.ok(withQuery.includes('awesome-dsh-plugin'), '事实类总要注入');
  assert.ok(withQuery.includes('明天一整天没课'), '有查询词时事件类要能召回');
  assert.ok(!noQuery.includes('明天一整天没课'), '空查询词时事件类召回不到（这就是原来的问题）');
  await rm(dir, { recursive: true, force: true });
});

test('#proactiveTurn 的查询词要由调用方传进来', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /async #proactiveTurn\(prompt, agentOptions, target = null, queryText = ''\)/, '签名要带 queryText');
  assert.match(rt, /async #composeProactive\(prompt, target = null, queryText = ''\)/, '#composeProactive 也要带');
  assert.match(rt, /#proactiveTurn\(prompt, agentOptions, target, queryText\)/, '要透传下去');
  assert.match(rt, /#composeProactive\(prompt, target, String\(window\.intent/, '主动消息要传 window.intent');
  // 记忆块必须用 queryText，不能再用空串
  assert.match(rt, /text: queryText/, '记忆召回要用 queryText');
});

test('念头要落盘，重启后还能读回来', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qqa-th3-'));
  const a = new ThoughtStore({ dataDir: dir, logger: { warn: () => {} } });
  await a.init();
  assert.equal(await a.remember('20001', ['记着要问他周末去哪']), 1);
  await a.flush();
  // 新实例 = 模拟重启
  const b = new ThoughtStore({ dataDir: dir, logger: { warn: () => {} } });
  await b.init();
  const list = b.list('20001', { limit: 5 });
  assert.equal(list.length, 1);
  assert.equal(list[0].text, '记着要问他周末去哪');
  await rm(dir, { recursive: true, force: true });
});

test('念头：太短的过滤、重复的去重', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'qqa-th4-'));
  const store = new ThoughtStore({ dataDir: dir, logger: { warn: () => {} } });
  await store.init();
  const added = await store.remember('20001', [
    '好的',
    '他明天一整天没课，也许想找点事做',
    '他明天一整天没课，也许想找点事做',
  ]);
  assert.equal(added, 1, '短的过滤、重复的去重');
  await rm(dir, { recursive: true, force: true });
});

test('首次配置允许不填 QQ 号（待登录）', () => {
  const base = { onebot: { token: 'a'.repeat(24) }, events: { secret: 'b'.repeat(24) } };
  // 待登录：selfId 空 + loginPending 标记
  const pending = normalizeConfig({ ...base, selfId: '', loginPending: true });
  assert.equal(pending.selfId, '');
  assert.equal(pending.loginPending, true);
  // 正常配置不受影响
  const normal = normalizeConfig({ ...base, selfId: '10001' });
  assert.equal(normal.selfId, '10001');
  assert.equal(normal.loginPending, false);
  // 没有标记的空 selfId 仍要拒绝 —— 否则手改配置写错也会被放过
  assert.throws(() => normalizeConfig({ ...base, selfId: '' }), /5–12 位数字/);
  // 格式错的照旧拒绝
  assert.throws(() => normalizeConfig({ ...base, selfId: 'abc' }), /5–12 位数字/);
});

test('待登录时不写 onebot11 配置、不传 -q', () => {
  const nap = read('lib/napcat.mjs');
  // NapCat 按真实 uin 找 onebot11_<uin>.json，写错名字等于让它永远起不来。
  assert.match(nap, /if \(!String\(config\.selfId \?\? ''\)\.trim\(\)\) \{/, 'selfId 空时要走单独分支');
  assert.match(nap, /return \{ directory, onebotFile: null \};/, '待登录时不返回 onebot 文件');
  // spawn 时不能传空的 -q
  assert.match(nap, /if \(selfId\) args\.push\('-q', selfId\);/, '有号才传 -q');
});

test('待登录时从 NapCat 日志认出真实账号', () => {
  const nap = read('lib/napcat.mjs');
  assert.match(nap, /async detectLoggedAccount\(\)/, '要有识别方法');
  // 返回值从「字符串」改成了 { loggedIn, uin, via } —— 要能区分
  // 「还没登录」和「登录了但认不出号」（后者要立刻报错而不是等超时）。
  assert.match(nap, /return \{ loggedIn: true, uin: candidates\[0\]\.uin, via: 'config-file' \};/, '配置文件名这条要返回对象');
  assert.match(nap, /return \{ loggedIn: true, uin: found, via: 'log-uin' \};/, '日志 uin 这条');
  assert.match(nap, /return \{ loggedIn: true, uin: null, via: 'log-success-only' \};/, '只有成功字样这条');
  // 只看本次启动之后写的内容，不能把上次运行的行算进来
  assert.match(nap, /this\.logOffset = \(await stat\(this\.logPath\)\)\.size/, '要记日志起点');
  assert.match(nap, /const pending = !String\(this\.config\.selfId \?\? ''\)\.trim\(\);/, 'waitForLogin 要识别待登录');
  assert.match(nap, /return String\(found\.uin\);/, '认出账号要返回出去');
});

test('认出账号后写回配置并要求重启', () => {
  const idx = read('index.mjs');
  // 运行中的 runtime 还拿着 selfId ''，不重启就收发不了消息
  assert.match(idx, /if \(resolved\.loginPending\)/, '要处理待登录');
  assert.match(idx, /raw\.selfId = selfId;/, '要把真实号写回配置');
  assert.match(idx, /raw\.loginPending = false;/, '要清掉标记');
  assert.match(idx, /runtime\.needsRestart = \{ selfId, at: Date\.now\(\) \};/, '要标记需要重启');
  assert.match(idx, /请重启 DSH/, '要明确要求重启');
  // 写回后不能继续 runtime.start()
  const i = idx.indexOf('if (resolved.loginPending)');
  const seg = idx.slice(i, i + 2000);
  assert.match(seg, /return;/, '写完要 return，不要接着启动 runtime');
});

test('spawn 与 spawn 事件监听之间不能有 await（否则永久卡死）', () => {
  // Node 的 'spawn' 事件在下一 tick 触发。一旦在 this.spawnProcess(...) 和
  // 那个 child.once('spawn', resolve) 之间插入 await（比如取日志大小），
  // 事件会在监听器挂上之前就发出去 —— Promise 永远不 resolve，
  // 插件启动直接卡死，而且没有任何报错。
  const nap = read('lib/napcat.mjs');
  const i = nap.indexOf('async spawnEngine()');
  const j = nap.indexOf('async detectLoggedAccount()', i);
  const seg = nap.slice(i, j);
  const spawnAt = seg.indexOf('this.spawnProcess(');
  // 监听器在那个 await new Promise 里面，所以只检查到它之前。
  const waitAt = seg.indexOf('await new Promise((resolve, reject)');
  assert.ok(spawnAt > 0 && waitAt > spawnAt, 'spawn 要在等待之前');
  const between = seg.slice(spawnAt, waitAt);
  assert.ok(!/\bawait\b/.test(between), 'spawn 和监听之间不能有 await');
  // 校验一下监听确实存在
  assert.ok(seg.includes("child.once('spawn', resolve)"), '要监听 spawn 事件');
});

test('README 要写清配置流程和 NapCat WebUI 后台运行的事', () => {
  const r = read('README.md');
  // 两步流程
  assert.match(r, /阶段 1：生成配置/, '要有阶段 1');
  assert.match(r, /阶段 2：拉起 NapCat 并扫码/, '要有阶段 2');
  // 重启两次的原因
  assert.match(r, /为什么要重启两次/, '要解释为什么要重启两次');
  // WebUI 后台运行这件事必须单独成节
  assert.match(r, /NapCat 的 WebUI 只在后台启动/, '要有专门的章节说明');
  assert.match(r, /windowsHide/, '要说清技术原因');
  assert.match(r, /不会弹出任何 NapCat 窗口/, '要明确说没有窗口');
  // 三种方案
  assert.match(r, /方案 A（推荐）：托管模式/, '要给出托管方案');
  assert.match(r, /方案 B：让 NapCat 独立后台常驻/, '要给出外部模式方案');
  assert.match(r, /127\.0\.0\.1:5701\/onebot/, '外部模式要写清 OneBot 回调地址');
});

test('WebUI 不能每次启动 DSH 都弹一次', async () => {
  // 以前 maybeOpenLogin 只要 verifyIdentity 失败就弹浏览器。
  // 但 NapCat 冷启动要几秒，这几秒里必然连不上 —— 于是每次开机都被弹一个窗口，
  // 哪怕账号完全是好的、根本不需要扫码。
  const { NapcatManager } = await import('../lib/napcat.mjs');
  const mk = (extra = {}, selfId = '10001') => {
    const cfg = normalizeConfig({
      selfId, loginPending: selfId === '',
      onebot: { token: 'a'.repeat(24) }, events: { secret: 'b'.repeat(24) },
      napcat: { mode: 'managed', webuiPort: 6800, webuiToken: 'w'.repeat(32), ...extra },
    });
    cfg.onebot.apiUrl = 'http://127.0.0.1:18699';
    return cfg;
  };
  // checkPort = portAvailable：true=端口空闲，false=WebUI 在跑
  const trial = async (extra, elapsedMs, portFree, selfId = '10001') => {
    let opened = 0;
    const m = new NapcatManager(mk(extra, selfId), {
      client: { verifyIdentity: async () => { throw new Error('x'); } },
      logger: { warn: () => {}, info: () => {} }, pollMs: 100, platform: 'win32', arch: 'x64',
      checkPort: async () => portFree, openBrowser: async () => { opened++; },
    });
    m.startedAt = Date.now() - elapsedMs;
    await m.maybeOpenLogin();
    return opened;
  };
  // 宽限期内不弹
  assert.equal(await trial({}, 2000, false), 0, '刚启动 2 秒不该弹');
  assert.equal(await trial({}, 10000, false), 0, '启动 10 秒不该弹');
  // 过宽限期、确实需要扫码 → 弹一次
  assert.equal(await trial({}, 25000, false), 1, '过了宽限期该弹');
  // 关掉就永不弹
  assert.equal(await trial({ autoOpenLogin: false }, 60000, false), 0, '关掉就永不弹');
  // 首次登录立刻弹
  assert.equal(await trial({}, 0, false, ''), 1, '首次登录要立刻弹');
});

test('autoOpenLogin / loginGraceMs 要能通过面板保存', () => {
  const ui = read('lib/ui.mjs');
  assert.match(ui, /napcat: \[[^\]]*autoOpenLogin[^\]]*\]/, 'autoOpenLogin 在保存白名单');
  assert.match(ui, /napcat: \[[^\]]*loginGraceMs[^\]]*\]/, 'loginGraceMs 在保存白名单');
  const c = read('lib/client.js');
  assert.ok(c.includes('autoOpenLogin: form.autoOpenLogin !== false'), '面板要提交 autoOpenLogin');
  assert.ok(c.includes('loginGraceMs: Math.max(0, Number(form.loginGraceSec) || 0) * 1000'), '面板要提交 loginGraceMs');
  assert.ok(c.includes('需要登录时自动打开 WebUI 浏览器'), '面板要有这个开关');
  assert.ok(c.includes('启动宽限期（秒）'), '面板要有宽限期输入');
});

test('安抚提示要出现在「待重启/等待扫码」那一屏（不是首次配置屏）', () => {
  // 用户原话：「我的意思是加在进行到这一步的时候」—— 指的是点完生成配置、
  // 面板显示「正在等你扫码」的那一屏，不是点按钮之前那一屏。
  const c = read('lib/client.js');
  const all = [];
  let at = -1;
  while ((at = c.indexOf('遇到问题别慌', at + 1)) >= 0) all.push(at);
  assert.equal(all.length, 1, '只能出现一次（曾经误加到首次配置屏）');
  // 用「loginPending 屏」和「needsRestart 屏」各自的唯一文案定位区间
  const screenStart = c.indexOf('state.loginPending && !state.needsRestart');
  const screenEnd = c.indexOf('现在请完全退出 DeepSeek Harness，再重新启动 —— QQ 接入才会真正开始工作');
  assert.ok(screenStart > 0 && screenEnd > screenStart, '要能找到那一屏的边界');
  assert.ok(all[0] > screenStart && all[0] < screenEnd, '提示必须在「待重启/等待扫码」那一屏里');
});

test('待重启屏要按 running 分开文案，不能一直喊「去重启」', () => {
  // 截图里 NapCat 已经跑起来了（state=waiting_login、倒计时 595 秒），
  // 顶部却还写着「请完全退出…再重新启动」，是错的。
  const c = read('lib/client.js');
  const i = c.indexOf('state.loginPending && !state.needsRestart');
  const seg = c.slice(i, i + 4200);
  assert.match(seg, /const running = Boolean\(nap\.progress\)/, '要有 running 判断');
  assert.ok(seg.includes('正在等你扫码登录'), '跑起来时要说「等你扫码」');
  assert.ok(seg.includes('这一步不需要再重启 DSH'), '跑起来时要明确说不用再重启');
  assert.ok(seg.includes('请完全退出 DeepSeek Harness，再重新启动 —— NapCat 的下载和扫码都在重启之后才开始'), '没跑起来时才说要重启');
  // 不能有两个「接下来」卡片
  assert.equal((c.split('title: "接下来"').length - 1), 1, '只能有一个「接下来」卡片');
});

test('首次配置屏要有「遇到问题先重启」的安抚提示', () => {
  // 首次配置最容易撞上 token 报错 / 登不上去，而绝大多数情况重启一次就好。
  // 提示要写得让人敢下手，别写成吓人的警告。
  const c = read('lib/client.js');
  assert.ok(c.includes('遇到问题别慌'), '要有安抚性标题');
  assert.ok(c.includes('NapCat token 报错'), '要点名 token 错误');
  assert.ok(c.includes('扫码登不上去'), '要点名登录失败');
  assert.ok(c.includes('乖乖重启一次 DSH'), '要给出一句话解法');
  assert.ok(c.includes('先别急着重装'), '要明确说不用重装');
  // 颜文字：至少有一个，且不能破坏语法
  assert.ok(/[\(\)][\u00b4\u0300\u0e3f\u2022\u1d55]/.test(c) || c.includes('(´｡• ᵕ •｡`)'), '要有可爱颜文字');
});

test('教程要讲清「启动时总是弹出 NapCat 网页」', () => {
  const c = read('lib/client.js');
  assert.ok(c.includes('启动 DSH 时总是弹出 NapCat 网页'), '要有对应的小节标题');
  assert.ok(c.includes('这通常不是登录异常'), '要先安抚，别让人以为是故障');
  assert.ok(c.includes('方法一：在面板中修改'), '要讲面板开关');
  assert.ok(c.includes('方法二：让 Agent 修改配置'), '要讲让 agent 改');
  assert.ok(c.includes('方法三：手动修改'), '要讲手动改文件');
  assert.ok(c.includes('其它字段不要动'), '给 agent 的指令要防止误改 token');
});

test('教程要讲清生图依赖 dsh-connect-doubao', () => {
  const c = read('lib/client.js');
  // 本插件不含生图模型，全靠 dsh-connect-doubao 注册的豆包生图。
  // 不写清楚的话，用户开了开关却画不出图，只会看到「没有找到生图路由」。
  assert.ok(c.includes('使用前必须安装 dsh-connect-doubao'), '要写明前置插件');
  assert.ok(c.includes('dsh plugin --profile desktop add dsh-connect-doubao'), '要给出安装命令');
  assert.ok(c.includes('扫码登录豆包'), '要提醒登录豆包');
  assert.ok(c.includes('没有找到生图路由'), '要说明没装时会报什么');
  // 生图的几个可调项也必须在教程里出现，否则用户找不到
  assert.ok(c.includes('每次最多发几张'), '要讲数量上限');
  assert.ok(c.includes('image-gen'), '要讲默认模型名');
});


test('教程要讲天气 API Key 和各模块', () => {
  const c = read('lib/client.js');
  assert.ok(c.includes('和风天气'), '要讲天气 Key');
  assert.ok(c.includes('steamcommunity.com/dev/apikey'), '要讲 Steam Key 申请地址');
  assert.ok(c.includes('游戏详情」必须设为公开'), '要提醒游戏详情要公开');
  assert.ok(c.includes('如何查找 SteamID64'), '要教怎么找 SteamID');
  assert.ok(c.includes('一定要点击页面最下方的'), '要有保存按钮提醒');
  assert.ok(c.includes('dev.qweather.com'), '要给出注册地址');
  assert.ok(c.includes('面板配置说明'), '要有模块总览');
  // Key 的真实校验规则，写进教程省得用户粘错
  assert.ok(c.includes('8–128 位'), '要写清 Key 格式');
  // 模块总览必须覆盖面板上真实存在的卡片
  for (const mod of ['模型', '自动回复', '链接解析', '虚拟人生', '主动发动态', '情感与关系', '长期记忆', '表情包', '回复节奏', 'Steam', '生图', '回复范围', 'NapCat', '归档', '会话与上下文', '虚拟生活与主动消息', '长期记忆与情感']) {
    assert.ok(c.includes(mod), '缺少模块：' + mod);
  }
});

test('面板顶部要有 GitHub 图标按钮（不明文显示链接）', () => {
  const c = read('lib/client.js');
  assert.ok(c.includes('const REPO_URL = "https://github.com/Applepinea/dsh-qq-access"'), '要有仓库地址常量');
  // 只放图标，不在界面上写链接文字
  assert.ok(c.includes('"aria-label": "在 GitHub 上查看项目"'), '要有无障碍标签（图标按钮没有文字）');
  assert.ok(c.includes('className: "ghost icon"'), '用图标按钮样式');
  assert.ok(c.includes('.qqa button.icon{width:30px'), '要有正方形图标按钮 CSS');
  // 必须是真正的 GitHub mark，不能放个占位符
  const m = c.match(/d: "(M8 0C3\.58[^"]+)"/);
  assert.ok(m && m[1].length > 400, 'Octocat 路径要完整');
  assert.ok(c.includes('viewBox: "0 0 16 16"'), 'viewBox 要对');
  assert.ok(c.includes('fill: "currentColor"'), '颜色跟随按钮文字色');
  // 新窗口打开，且带 noopener
  assert.ok(c.includes('window.open(REPO_URL, "_blank", "noopener,noreferrer")'), '安全的打开方式');
  // 界面上不该出现明文 URL 文本节点
  assert.ok(!/>\s*https:\/\/github\.com\/Applepinea\s*</.test(c), '不能把链接明文显示在界面上');
});

test('教程顶部的快速跳转：锚点与链接必须一一对应', () => {
  const c = read('lib/client.js');
  const ids = [...c.matchAll(/id: "(guide-[a-z]+)"/g)].map(m => m[1]);
  const hrefs = [...c.matchAll(/href: "#(guide-[a-z]+)"/g)].map(m => m[1]);

  assert.equal(ids.length, 8, '8 个章节都要有锚点');
  assert.equal(hrefs.length, 8, '8 个跳转链接');
  assert.deepEqual(hrefs, ids, '顺序要一致');
  // 任何一个 href 指向不存在的 id，点下去就毫无反应 —— 教程长，这种失效最难发现
  assert.equal(hrefs.filter(h => !ids.includes(h)).length, 0, '不能有失效链接');
  assert.equal(ids.filter(x => !hrefs.includes(x)).length, 0, '不能有孤立的锚点');

  // 跳转栏必须在「配置教程」标题之后、第一章之前
  const iTitle = c.indexOf('"配置教程"');
  const iJump = c.indexOf('"快速跳转"');
  const iFirst = c.indexOf('"1. 修改配置前，先了解保存机制"');
  assert.ok(iTitle > 0 && iJump > iTitle, '跳转栏要在标题之后');
  assert.ok(iJump < iFirst, '跳转栏要在第一章之前');
});


test('说说配图：上传→拼 richval→发布带图，且权限可控', async () => {
  const qz = read('lib/qzone-http.mjs');

  // 上传走 base64 表单，不是 multipart —— 这是接口的真实形态，
  // 如果以后有人「顺手」改成 FormData，这里会立刻红。
  assert.match(qz, /const UPLOAD_URL = 'https:\/\/up\.qzone\.qq\.com\/cgi-bin\/upload\/cgi_upload_image'/, '上传地址');
  assert.match(qz, /base64: '1'/, '要声明 base64 模式');
  assert.match(qz, /picfile: Buffer\.from\(bytes\)\.toString\('base64'\)/, '图片按 base64 提交');

  // 上传回的是 HTML 包着 callback({...})，不能用 JSONP 解包。
  assert.match(qz, /async requestText\(/, '要有返回原始文本的通道');
  assert.match(qz, /callback\\\(/, '要按 callback( 提取');
  assert.match(qz, /ret\b.*!== 0|Number\(data\?\.ret/, '要检查 ret');

  // richval 的拼法：逗号开头，多图重复同一段。
  assert.match(qz, /buildRichval\(images\)/, '要有 richval 构造');
  assert.match(qz, /\$\{i\.albumId\},\$\{i\.lloc\},\$\{i\.sloc\}/, 'richval 字段顺序');

  // publish 要能吃 images 和 right
  assert.match(qz, /async publish\(content, \{ signal, images = \[\], right \} = \{\}\)/, 'publish 签名');
  assert.match(qz, /form\.ugc_right = n/, '权限写进 ugc_right');
  assert.match(qz, /\[1, 4, 64, 128\]/, '只允许四个合法权限值');

  // 带图响应里的 id 叫 t1_tid，不是 tid —— 只取 tid 会永远拿到空串。
  assert.match(qz, /data\?\.tid \?\? data\?\.t1_tid/, '要兼容 t1_tid');

  // 纯文字仍然不带 richtype
  assert.match(qz, /form\.who = 1/, '纯文字走 who=1');
});

test('说说配图：配置、开关与失败降级', () => {
  const cfg = read('lib/config.mjs');
  const ui = read('lib/ui.mjs');
  const rt = read('lib/runtime.mjs');
  const cl = read('lib/client.js');

  // 配置项存在且默认关闭
  assert.match(cfg, /image: \{ enabled: false, maxImages: 1 \}/, 'qzoneProactive.image 默认值');
  assert.match(cfg, /maxImages: integer\(raw\.qzoneProactive\?\.image\?\.maxImages, 1, 1, 3/, '张数范围 1–3');

  // 白名单漏了 image 的话，面板保存会被静默丢弃。
  assert.match(ui, /qzoneProactive: \[[^\]]*'image'[^\]]*\]/, 'ui 白名单要含 image');

  // 运行时：生图没开就跳过，不刷日志噪音
  assert.match(rt, /#qzonePostImages/, '要有配图方法');
  assert.match(rt, /this\.config\.image\?\.enabled !== true/, '生图没开要跳过');
  // 关键：配图失败不能让说说发不出去
  assert.match(rt, /return \[\];/, '失败返回空数组');
  assert.match(rt, /const images = await this\.#qzonePostImages\(pending\.text, signal\)/, '发布前取图');
  assert.match(rt, /this\.qzone\.publish\(pending\.text, \{ signal, images, right: this\.qzoneRight\(\) \}\)/, '把图和可见范围一起传给 publish');

  // 面板：开关 + 前置条件说明 + 生图关闭时警告
  assert.ok(cl.includes('发说说时配一张图'), '开关文案');
  assert.ok(cl.includes('dsh-connect-doubao'), '要写明前置依赖');
  assert.ok(cl.includes('说说照发，只是没有图'), '要说明降级行为');
  assert.match(cl, /form\.qzImage && !form\.imgEnabled/, '生图没开要给警告');
});


test('发 QQ 空间全程不启动浏览器', () => {
  const qz = read('lib/qzone-http.mjs');
  const rt = read('lib/runtime.mjs');
  const nc = read('lib/napcat.mjs');

  // 这条路径必须纯粹是 HTTP。曾经用 Playwright 驱动真实网页，
  // 结果是：桌面弹窗、冷启动 30 秒超时、skey 几小时过期、评论落到错误的说说上。
  // 任何人重新引入浏览器之前，这里会先红。
  for (const banned of ['playwright', 'puppeteer', 'chromium', 'child_process', 'execFile', 'spawn(']) {
    assert.ok(!qz.includes(banned), 'qzone-http.mjs 不应出现 ' + banned);
  }
  assert.match(qz, /await fetch\(/, '发说说必须走 fetch');

  // 发布路径不能触碰任何「打开浏览器」的入口。
  const publishBody = rt.slice(rt.indexOf('async #finishQzonePending'), rt.indexOf('async #composeQzonePost'));
  assert.ok(!/openBrowser|openLoginBrowser/.test(publishBody), '发布路径不得开浏览器');

  // 全库唯一会开浏览器的是 NapCat 登录，且必须受 autoOpenLogin 门控。
  assert.match(nc, /if \(this\.openedLogin \|\| this\.attached \|\| !this\.config\.napcat\.autoOpenLogin\) return;/, 'NapCat 开浏览器要受开关门控');

  // 教程里要明确回答这个疑问，否则用户只能靠观察猜。
  const cl = read('lib/client.js');
  assert.ok(cl.includes('会不会弹出浏览器窗口'), '教程要有这一节');
  assert.ok(cl.includes('不启动任何浏览器'), '要明确说明不启动浏览器');
});


test('B21: 动态发布有在途锁，且空间接口超时不会被信号顶掉', () => {
  const rt = read('lib/runtime.mjs');
  const qz = read('lib/qzone-http.mjs');

  // 轮询 60s、生图 120s，没有锁时同一轮会被两个 tick 各发一次。
  assert.match(rt, /this\.qzoneBusy = false;/, '要初始化在途标志');
  assert.match(rt, /async tickQzoneProactive\(signal\) \{[\s\S]{0,400}if \(this\.qzoneBusy \|\| this\.closed\) return;/, '入口要有守卫');
  assert.match(rt, /#tickQzoneProactiveInner/, '真实逻辑要在内层');
  assert.match(rt, /finally \{[\s\S]{0,120}this\.qzoneBusy = false;/, '异常也要解锁');

  // 用 signal ?? timeout 的写法，在调用方永远传 shutdown.signal 时等于没有超时。
  assert.ok(!qz.includes('signal: signal ?? AbortSignal.timeout'), '不能再用 ?? 写法');
  assert.ok(qz.includes('combinedSignal(signal, Number(this.config.qzone?.timeoutMs'), '超时要与取消取交集');
});

test('B15: 并发热更新不能依赖「替换前后比较」', () => {
  const rt = read('lib/runtime.mjs');
  const ui = read('lib/ui.mjs');

  // ui 先替换 config.reply，再调 applyHotConfig，所以拿 next 和 this.config 比恒为假。
  assert.ok(!/nextConcurrency !== this\.config\.reply\.concurrency/.test(rt), '不能保留恒假的比较');
  assert.match(rt, /this\.slots\?\.limit !== wantConcurrency/, '要直接比对 Semaphore 自己的上限');

  // 同一类错误在 B19 上又踩了一次：imageWasEnabled 必须在覆盖 config 之前取。
  const iFlag = ui.indexOf('const imageWasEnabled');
  const iAssign = ui.indexOf('runtime.config.image = normalized.image;');
  assert.ok(iFlag > 0 && iAssign > 0 && iFlag < iAssign, 'imageWasEnabled 要在替换之前读');
});

test('B19: 开关生图要能热重建工具集', () => {
  const idx = read('index.mjs');
  const ui = read('lib/ui.mjs');
  assert.match(idx, /const registerTools = \(\) => \{/, '要有重建函数');
  assert.match(idx, /runtime\.reregisterTools = registerTools/, '要挂到 runtime 上');
  assert.match(idx, /registerTools\(\);/, '启动时要注册一次');
  assert.match(ui, /runtime\.reregisterTools\?\.\(\)/, '开关变化要触发重建');
});

test('B12: 拍照规则只发给真的能拍的会话', async () => {
  const { buildCapabilityGuide, PHOTO_RULES } = await import('../lib/capabilities.mjs');
  const rule = PHOTO_RULES[0];
  const withTool = buildCapabilityGuide({ allowed: ['qq_generate_image'], kind: 'private' });
  const without = buildCapabilityGuide({ allowed: ['qq_status', 'qq_read_history'], kind: 'private' });
  assert.ok(withTool.includes(rule), '能拍时要有拍照规则');
  assert.ok(!without.includes(rule), '不能拍时必须收起拍照规则');
});

test('B20: 同一条消息里的贴纸不能被当成照片', async () => {
  const { batchTrigger } = await import('../lib/util.mjs');
  const batch = [{ text: '', images: [{ url: '/a.png' }], stickers: [{ url: '/s.png' }] }, { text: '看看' }];
  const t = batchTrigger(batch, 4);
  assert.deepEqual((t.images ?? []).map((x) => x.url), ['/a.png'], '图只能进 images');
  assert.deepEqual((t.stickers ?? []).map((x) => x.url), ['/s.png'], '贴纸只能进 stickers');
});

test('B16: cleanImageText 不能把本机路径漏进正文', async () => {
  const { cleanImageText } = await import('../lib/runtime.mjs');
  const out = cleanImageText('画好了 C:/Users/someone/.dsh/doubao-images/a.png 看吧');
  assert.ok(!out.includes('C:/'), 'Windows 路径要被剥掉');
  const out2 = cleanImageText('看 file:///C:/x/y.png 这张');
  assert.ok(!out2.includes('file://'), 'file:// 要被剥掉');
});

test('B10: access.mjs 文件头不能重复', () => {
  const a = read('lib/access.mjs');
  const count = (a.match(/Every tool this plugin registers\./g) || []).length;
  assert.equal(count, 1, '文件头只应出现一次');
});


test('B23: 手动发布也要走在途锁', () => {
  const rt = read('lib/runtime.mjs');
  // 锁只包住定时轮询时，配图期间点「立即发一条」会和正在跑的那次并行发布。
  const from = rt.indexOf('async postQzoneNow');
  const body = rt.slice(from, from + 1600);
  assert.match(body, /if \(this\.qzoneBusy\) \{/, '忙时要直接返回');
  assert.match(body, /status: 'busy'/, '要给出明确的忙状态');
  assert.match(body, /this\.qzoneBusy = true;/, '要占用锁');
  assert.match(body, /finally \{[\s\S]{0,120}this\.qzoneBusy = false;/, '异常也要解锁');
});

test('B11: 生图工具的墙钟预算要大于它自己的超时', () => {
  const tl = read('lib/tools.mjs');
  assert.match(tl, /const budgetFor = \(toolName\) => \{/, '要有按工具算预算');
  assert.match(tl, /imageTimeoutMs \+ 30_000/, '生图预算 = 超时 + 余量');
  // 固定 120s 会把生图自己的 120s 超时吃干净，发送那一步就没时间了。
  assert.ok(!tl.includes("name.startsWith('qq_qzone') ? 150_000 : 120_000"), '不能再固定 120s');
});

test('B14: 只有 attachmentId 的附件也要能读出来', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /async attachmentBytes\(attachment, signal\)/, '要有按 id 解析');
  assert.match(rt, /attachment\.attachmentId/, '要认宿主给的 attachmentId');
  assert.match(rt, /attachments\.imageHostPath/, '优先用 imageHostPath 拿路径');
  assert.match(rt, /attachments\.readImage/, '再回退到 readImage');
  assert.match(rt, /await this\.attachmentBytes\(part\?\.attachment, ioSignal\)/, 'case A 要真的用它');
});

test('B13: 生图开关变化要重建聊天会话', () => {
  const ui = read('lib/ui.mjs');
  const body = ui.slice(ui.indexOf('if ((normalized.image?.enabled === true) !== imageWasEnabled)'));
  assert.match(body.slice(0, 1200), /runtime\.dropSessions\?\.\(\)/, '要丢掉旧会话，否则 restrict 和人格还是旧的');
});

test('B17: accept 的注释不能再和闸门相反', () => {
  const rt = read('lib/runtime.mjs');
  assert.ok(!rt.includes('而那恰恰是最需要回应的情形'), '要删掉「纯图最该回」的说法');
  assert.ok(rt.includes('图不参与闸门打分'), '要写明图不参与打分');
});

test('B12 残留: ownerHarnessTools 放开工具时也要看生图开关', async () => {
  const { buildCapabilityGuide, PHOTO_RULES } = await import('../lib/capabilities.mjs');
  const rule = PHOTO_RULES[0];
  // allowed=null 表示「不限制工具」，只看 permitted 会恒为真。
  const off = buildCapabilityGuide({ allowed: null, kind: 'private', photo: false });
  const on = buildCapabilityGuide({ allowed: null, kind: 'private', photo: true });
  assert.ok(!off.includes(rule), '生图关时不能出现拍照规则');
  assert.ok(on.includes(rule), '生图开时要有拍照规则');
});

test('B16 残留: POSIX 绝对路径也要剥，但不能误伤普通斜杠', async () => {
  const { cleanImageText } = await import('../lib/runtime.mjs');
  assert.ok(!cleanImageText('存在 /home/user/pic.jpg 里').includes('/home/'), 'POSIX 路径要剥掉');
  assert.ok(cleanImageText('比例是 1/2 而已').includes('1/2'), '普通斜杠不能误伤');
  assert.ok(cleanImageText('今天是 11/16 号').includes('11/16'), '日期不能误伤');
});


test('说说可见范围：配置、解析、两处发布入口都接线', async () => {
  const { resolveRight, QZONE_RIGHTS } = await import('../lib/qzone-http.mjs');
  const cfg = read('lib/config.mjs');
  const ui = read('lib/ui.mjs');
  const rt = read('lib/runtime.mjs');
  const tl = read('lib/tools.mjs');
  const cl = read('lib/client.js');

  // 编码是抓包核对过的，改了就等于把说说发到错误的可见范围。
  assert.deepEqual(QZONE_RIGHTS, { public: 1, friends: 4, private: 64, close: 128 }, 'ugc_right 编码');

  // default 必须返回 undefined（= 不传字段），不能返回某个数字。
  assert.equal(resolveRight('default'), undefined, 'default 表示不传');
  assert.equal(resolveRight(''), undefined, '空值表示不传');
  assert.equal(resolveRight('public'), 1);
  assert.equal(resolveRight('friends'), 4);
  assert.equal(resolveRight('private'), 64);
  // 手工写数字也认
  assert.equal(resolveRight('128'), 128);
  // 非法值必须抛，静默退回默认会让人以为设置生效了
  assert.throws(() => resolveRight('nope'), '非法值要抛');

  // 配置：默认 default，且不提供 close（服务端要求指定人，发不出去）
  assert.match(cfg, /right: 'default' \}/, '默认 right=default');
  assert.match(cfg, /\['default', 'public', 'friends', 'private'\]/, '不提供 close');
  assert.ok(!/allowed = \[[^\]]*'close'/.test(cfg), 'close 不能进白名单');

  // 白名单漏了 right 的话，面板保存会被静默丢弃
  assert.match(ui, /qzoneProactive: \[[^\]]*'right'[^\]]*\]/, 'ui 白名单要含 right');

  // 两个发布入口必须用同一个值，否则「设成仅自己可见」后模型自己发的仍是公开
  assert.match(rt, /qzoneRight\(\) \{/, 'runtime 要暴露 qzoneRight');
  assert.match(rt, /this\.qzone\.publish\(pending\.text, \{ signal, images, right: this\.qzoneRight\(\) \}\)/, '动态发布要带 right');
  assert.match(tl, /runtime\.qzone\.publish\(text, \{ signal: exec\.signal, right: runtime\.qzoneRight\(\) \}\)/, '工具发布也要带 right');

  // 面板：下拉 + 选项 + 仅自己可见时的提醒
  assert.ok(cl.includes('说说可见范围'), '面板要有这一项');
  for (const v of ['default', 'public', 'friends', 'private']) {
    assert.ok(cl.includes('value: "' + v + '"'), '缺少选项 ' + v);
  }
  assert.ok(!cl.includes('value: "close"'), '不该提供仅密友可见');
});


test('B24: 手动发布必须先占锁再落盘，忙时一个字都不写', () => {
  const rt = read('lib/runtime.mjs');
  const ui = read('lib/ui.mjs');
  const tl = read('lib/tools.mjs');

  const from = rt.indexOf('async postQzoneNow');
  const body = rt.slice(from, from + 1800);

  // 顺序是重点：qzoneBusy 必须在 setPending 之前置位，
  // 否则「检查没 pending → 落盘 → 发现锁被占」会把一条没人管的 pending 留在库里。
  const iLock = body.indexOf('this.qzoneBusy = true;');
  const iPending = body.indexOf('await state.setPending(');
  const iBusyReturn = body.indexOf("status: 'busy'");
  assert.ok(iLock > 0 && iPending > 0 && iBusyReturn > 0, '三段都要在');
  assert.ok(iBusyReturn < iLock, '忙分支要在占锁之前返回');
  assert.ok(iLock < iPending, '必须先占锁再落盘');

  // 锁内要复查 pending：拿锁前可能已经积压了一条
  assert.match(body, /if \(state\.pending\) \{/, '锁内要复查 pending');

  // 调用方不能再自己 setPending
  // 'clear' 在文件里出现得比 'post' 早，不能用它当结尾标记。
  const iUiPost = ui.indexOf("if (action === 'post')");
  const uiPost = ui.slice(iUiPost, iUiPost + 3000);
  assert.ok(!uiPost.includes('state.setPending('), '面板不能再自己落盘');
  assert.match(uiPost, /runtime\.postQzoneNow\(\{/, '面板要调用原子入口');
  assert.match(uiPost, /if \(outcome\?\.status === 'busy'\)[\s\S]{0,300}json\(res, 409/, 'busy 要回 409');

  const tlPost = tl.slice(tl.indexOf("tool('qq_qzone_post_now'"), tl.indexOf("tool('qq_qzone_comment'"));
  assert.ok(!tlPost.includes('state.setPending('), '工具不能再自己落盘');
  assert.match(tlPost, /runtime\.postQzoneNow\(\{/, '工具要调用原子入口');
  // busy 不能并进 uncertain 的措辞
  assert.match(tlPost, /status === 'busy'/, 'busy 要单独分支');
  assert.ok(tlPost.includes('没有发出去'), 'busy 要明说没发出去');
});

test('B24: 账本里 busy 必须可重试，否则重试永远拿回同一个 busy', () => {
  const st = read('lib/store.mjs');
  assert.match(st, /entry\.status === 'busy'/, 'busy 要进可重试名单');
  // 反例：不在可重试名单时，会走到 duplicate 短路，模型重试永远无效。
  const guard = st.slice(st.indexOf('const retriable ='), st.indexOf('const retriable =') + 400);
  assert.ok(guard.includes("'busy'"), 'retriable 判断里要有 busy');
});


test('生图只收模型自己的输出，不能把用户 prompt 当成结果', () => {
  const ig = read('lib/imagegen.mjs');

  // 会话里一定有我们 followup 出去的那句 prompt。不过滤角色时：
  // prompt 里带图片链接 → 被当成生图结果发出去；空回合 → 误报「回了话但没有图」。
  assert.match(ig, /function collectReply\(agent, \{ baselineSeq = 0 \} = \{\}\)/, 'collectReply 要接 baselineSeq');
  assert.match(ig, /if \(event\?\.type && event\.type !== 'assistant\/message'\) continue;/, '要过滤事件类型');
  assert.match(ig, /if \(role && role !== 'assistant'\) continue;/, '要过滤消息角色');
  assert.match(ig, /for \(let i = start; i < end; i\+\+\)/, '只扫 baseline 之后的事件');

  // waitIdle 用 seq > 0 判断时，用户那条 prompt 就已经让 seq 变成 1 了。
  assert.match(ig, /if \(seq > baseline\) break;/, 'waitIdle 要以 baseline 为基准');
  assert.match(ig, /if \(seqAfterStart <= baseline\)/, '没超过 baseline 算没开始');
  assert.match(ig, /const baselineSeq = Number\.isInteger\(handle\.agent\?\.session\?\.seq\)/, '要在 followup 之前取 baseline');
  assert.match(ig, /const produced = reply\.rawTypes\.length > 0;/, '空回合判断要基于过滤后的产出');
});

test('负数 message_id 在全部工具里都放行', () => {
  const tl = read('lib/tools.mjs');
  // 32 位溢出会产生负数 id；只要有一处还是旧正则，那条路径就永远报错。
  // 只看「message_id 必须…」这类断言，别把 before_seq 那种分页序号算进来。
  const idAsserts = tl.split('\n').filter((l) => l.includes('message_id 必须'));
  assert.ok(idAsserts.length >= 3, 'message_id 断言至少 3 处');
  for (const line of idAsserts) {
    assert.ok(line.includes('-?'), '这条还没放行负数：' + line.trim());
  }
});

test('改名片与禁言要过群黑名单', () => {
  const tl = read('lib/tools.mjs');
  for (const name of ['qq_set_group_card', 'qq_group_ban']) {
    const start = tl.indexOf("tool('" + name + "'");
    assert.ok(start > 0, name + ' 未找到');
    const body = tl.slice(start, start + 1200);
    assert.match(body, /access\.target\(\{ kind: 'group', peer_id: args\.group_id \}/, name + ' 要走 access.target');
    assert.ok(!/const groupId = qqId\(args\.group_id/.test(body), name + ' 不能只用 qqId');
  }
});

test('面板能存能读 thoughts 与 qzone，且有热更新', () => {
  const ui = read('lib/ui.mjs');
  assert.match(ui, /thoughts: \['enabled', 'inject', 'limit', 'maxAgeHours'\]/, 'thoughts 白名单');
  assert.match(ui, /qzone: \['enabled', 'timeoutMs', 'cookieTtlMs'\]/, 'qzone 白名单');
  assert.match(ui, /thoughts: raw\.thoughts \?\? \{\}/, '/state 要回传 thoughts');
  assert.match(ui, /qzone: raw\.qzone \?\? \{\}/, '/state 要回传 qzone');
  assert.match(ui, /runtime\.config\.thoughts = normalized\.thoughts/, 'thoughts 热更新');
  assert.match(ui, /runtime\.config\.qzone = normalized\.qzone/, 'qzone 热更新');
});

test('小红书短链复用已取回的正文，不再二次请求', () => {
  const p = read('lib/parser.mjs');
  assert.match(p, /if \(!page\) page = await helpers\.fetchText\(target/, '短链已取过正文时要复用');
  // fetchText 是 redirect:error，落地页再有一次跳转就会失败
  assert.ok(p.includes("redirect: 'error'"), 'fetchText 仍然禁止跳转（这个前提没变）');
});

test('Steam 绑定兼容单个对象的历史格式', () => {
  const st = read('lib/steam-binding.mjs');
  assert.match(st, /\(raw\.steamId \? \[raw\] : \[\]\)/, '单个绑定对象要能读出来');
});


test('分段：代码块与行内代码不能被逗号切碎', async () => {
  const { splitSegments } = await import('../lib/runtime.mjs');
  const BT = String.fromCharCode(96);
  const FENCE = BT.repeat(3);

  // 以前按「换行 / 中文逗号 / 英文逗号」一刀切，
  // def foo(a, b, c): 会散成三条消息，代码没法看。
  const fenced = '看这个：\n' + FENCE + 'python\ndef foo(a, b, c):\n    return a, b\n' + FENCE + '\n懂了吧';
  const segs = splitSegments(fenced);
  const code = segs.find((x) => x.includes(FENCE));
  assert.ok(code, '代码块要完整出现在某一段里');
  assert.ok(code.includes('def foo(a, b, c):'), '函数签名不能被切开');
  assert.ok(code.includes('return a, b'), '函数体内的逗号也不能切');

  // 行内代码同理
  const inline = '调用 ' + BT + 'f(a, b)' + BT + ' 就行，试试';
  const segs2 = splitSegments(inline);
  assert.ok(segs2.some((x) => x.includes(BT + 'f(a, b)' + BT)), '行内代码要整块保留');

  // 普通聊天仍然照切
  assert.deepEqual(splitSegments('在呢，刚忙完，怎么了'), ['在呢', '刚忙完', '怎么了']);
  // 数字里的逗号要保留（老逻辑不能回退）
  assert.deepEqual(splitSegments('一共 1,000 元，够吗'), ['一共 1,000 元', '够吗']);
});

test('分段：commaSplit 关闭后只按换行切', async () => {
  const { splitSegments } = await import('../lib/runtime.mjs');
  const text = '在呢，刚忙完，怎么了\n第二行也，有逗号';
  assert.deepEqual(splitSegments(text, 2000, 8, { commaSplit: false }), ['在呢，刚忙完，怎么了', '第二行也，有逗号']);
  // 默认（不传）保持旧行为
  assert.equal(splitSegments('a，b').length, 2);
});

test('commaSplit 配置贯通：默认开、可关、可存', () => {
  const cfg = read('lib/config.mjs');
  const ui = read('lib/ui.mjs');
  const rt = read('lib/runtime.mjs');
  const cl = read('lib/client.js');

  assert.match(cfg, /commaSplit: true/, '默认值要开');
  assert.match(cfg, /commaSplit: raw\.reply\?\.commaSplit !== false/, '归一化：缺省为开');
  assert.match(ui, /'timeoutMs', 'commaSplit'\]/, '面板保存白名单要含它');
  const n = (rt.match(/commaSplit: this\.config\.reply\?\.commaSplit !== false/g) || []).length;
  assert.equal(n, 2, '两个分段调用点都要传配置');
  assert.ok(cl.includes('按逗号分段'), '面板要有开关');
});

test('正文里的图片地址要发成真图，不能发成链接', async () => {
  const { parseRichText, segmentsToText } = await import('../lib/onebot.mjs');

  // Markdown 图片
  const md = parseRichText('看这个 ![自拍](https://x.com/a.png) 好看吗');
  assert.deepEqual(md.map((p) => p.type), ['text', 'image', 'text'], 'markdown 要变成 image 段');
  assert.equal(md[1].data.file, 'https://x.com/a.png');

  // 裸图片地址
  const bare = parseRichText('给你 https://x.com/b.jpg 这个');
  assert.ok(bare.some((p) => p.type === 'image' && p.data.file === 'https://x.com/b.jpg'), '裸图片地址要变 image 段');

  // 非图片链接保持文字（不能把所有 http 都当图）
  const page = parseRichText('参考 https://example.com/article 这篇');
  assert.equal(page.length, 1, '普通链接要原样保留');
  assert.equal(page[0].type, 'text');

  // 归档文字用占位符，不要存原始地址
  assert.equal(segmentsToText(md), '看这个 [图片] 好看吗');
});

test('正文里的 [偷笑] 要发成真表情，但 [0] 不能', async () => {
  const { parseRichText, segmentsToText } = await import('../lib/onebot.mjs');

  const face = parseRichText('好耶[偷笑]真的');
  assert.deepEqual(face.map((p) => p.type), ['text', 'face', 'text'], '[偷笑] 要变成 face 段');
  assert.equal(face[1].data.id, '20', '偷笑 = 20');

  // 纯数字方括号更像数组下标，不能当表情
  const arr = parseRichText('数组 a[0] 越界了');
  assert.equal(arr.length, 1, '[0] 要保持文字');
  assert.ok(arr[0].data.text.includes('[0]'));

  // 不认识的名字也保持文字
  const unknown = parseRichText('这个[不存在的表情]算了');
  assert.equal(unknown.length, 1);

  assert.equal(segmentsToText(face), '好耶[偷笑]真的');
});

test('发送链路：有图/表情时走 sendSegments，归档存可见文字', () => {
  const rt = read('lib/runtime.mjs');
  assert.match(rt, /const parts = parseRichText\(body\);/, '发送前要解析');
  assert.match(rt, /const hasRich = parts\.some/, '要判断是否含富内容');
  assert.match(rt, /this\.client\.sendSegments\(kind, peerId, parts, signal, targets\)/, '富内容走分段发送');
  assert.match(rt, /part\.data\.file = await this\.resolveImageSource\(part\.data\.file, signal\)/, '图片要先转 data URL');
  assert.match(rt, /text: hasRich \? \(segmentsToText\(parts\) \|\| body\) : body,/, '归档存可见文字');

  const ob = read('lib/onebot.mjs');
  assert.match(ob, /sendSegments\(kind, peerId, segments, signal, mentions = \[\]\)/, '要有 sendSegments');
  assert.match(ob, /const timeoutMs = hasImage \? Math\.max\(60_000, this\.config\.timeoutMs\) : undefined;/, '带图要用图片超时');
});

test('上下文失效必须上报，不能被吞成一条普通失败', () => {
  const rt = read('lib/runtime.mjs');

  // 实机教训：DSH 重载后 ctx 失效，主动消息的定时器还挂在旧实例上，
  // 每一轮都在 tickProactive 的 catch 里被吞掉、返回 {ok:false}，
  // 外层 #noteInactiveContext（本来负责 stop 掉后台）永远收不到 ——
  // 于是每分钟刷一条，两小时刷了 144 条。
  assert.match(rt, /if \(\/inactive context\/i\.test\(String\(error\?\.message \?\? error\)\)\) \{/, '要识别上下文失效');
  assert.match(rt, /this\.#noteInactiveContext\(error\);\s*\n\s*throw error;/, '识别后要上报并抛出');

  // 已经 stop 的实例不能再挂定时器，否则只会空转报错。
  assert.match(rt, /if \(this\.closed \|\| this\.shutdown\.signal\.aborted\) return;/, 'armPollTimer 要检查是否已关闭');

  // 原有的「只在第一次记」的保护还在
  assert.match(rt, /if \(this\.#inactiveSeen\) return true;/, '重复上报要短路');
  assert.match(rt, /Promise\.resolve\(\)\.then\(\(\) => this\.stop\(\)\)/, '首次要停掉后台');
});

test('面板要有「配置教程」入口', () => {
  const c = read('lib/client.js');
  assert.ok(c.includes('showGuide'), '要有展开状态');
  assert.ok(c.includes('"配置教程"'), '按钮文案');
  // 首次配置流程已从教程里移除
  assert.ok(!c.includes('① 首次配置'), '教程里不该再有首次配置流程');
  // 「改坏了怎么办」要提醒备份而不是直接删（文件里有 token）
  assert.ok(c.includes('不要直接删除 config.json') || c.includes('别直接删 config.json'), '不能教用户直接删配置');
  assert.ok(c.includes('config.json.bak'), '要教改名备份');
});

test('bootstrapConfig 模板不能漏掉任何一个配置段', async () => {
  // 改 reply.group 时误删过 thoughts 那一行：normalizeConfig 有默认值兜底所以不报错，
  // 但生成的 config.json 里就没有这一段，新用户完全看不到这个功能。
  const { bootstrapConfig } = await import('../lib/config.mjs');
  const t = bootstrapConfig({ selfId: '' });
  for (const key of ['onebot', 'events', 'napcat', 'access', 'reply', 'rate', 'qzone',
    'emotion', 'life', 'memes', 'thoughts', 'search', 'qzoneProactive', 'persona']) {
    assert.ok(t[key] !== undefined, '模板缺少配置段：' + key);
  }
  assert.equal(t.thoughts.enabled, true, 'thoughts 默认开启');
  assert.equal(t.thoughts.inject, true, 'thoughts 默认注入');
  assert.equal(t.thoughts.limit, 3, 'thoughts 默认 3 条');
  assert.equal(t.reply.group, 'off', '群聊默认关');
});

test('群聊回复默认关闭', async () => {
  // 群里消息又多又杂，默认「smart」会让新用户一装好就在一堆群里被认成话痨，
  // 而且是拿她的身份在公开群里说话 —— 风险比私聊大得多。默认 off，要开自己开。
  const { bootstrapConfig } = await import('../lib/config.mjs');
  const base = { selfId: '10001', onebot: { token: 'a'.repeat(24) }, events: { secret: 'b'.repeat(24) } };
  assert.equal(normalizeConfig(base).reply.group, 'off', '默认必须是 off');
  assert.equal(bootstrapConfig({ selfId: '' }).reply.group, 'off', '首次配置模板也要 off');
  // 私聊不受影响
  assert.equal(normalizeConfig(base).reply.private, true, '私聊回复仍然默认开');
  // 显式指定的值都要保留
  for (const g of ['off', 'mention', 'smart', 'all']) {
    assert.equal(normalizeConfig({ ...base, reply: { group: g } }).reply.group, g);
  }
});

test('群聊回复默认关闭时，群消息只归档不回复', async () => {
  const { allowConversation } = await import('../lib/config.mjs');
  const { scoreGroupMessage } = await import('../lib/group-gate.mjs');
  // off 档不去碰 group-gate，直接看 config 默认值 + runtime 的判定分支
  const rt = read('lib/runtime.mjs');
  const i = rt.indexOf('#shouldReplyTo(');
  const seg = rt.slice(i, i + 1200);
  assert.match(seg, /if \(reply\.group === 'off'\) return false;/, 'off 要直接返回 false');
  assert.match(seg, /if \(message\.kind === 'private'\) return reply\.private;/, '私聊走 private 开关');
});

test('面板和示例配置也必须是 off', () => {
  const c = read('lib/client.js');
  assert.match(c, /replyGroup: data\.config\.reply\.group \?\? "off"/, '面板回退值要 off');
  assert.ok(!c.includes('智能判断（推荐）'), '既然默认关，就不能再标「推荐」');
  const ex = JSON.parse(read('examples/config.example.json'));
  assert.equal(ex.reply.group, 'off', '示例配置要 off');
});

test('生成配置后的文案不能暗示「马上就会下载」', () => {
  // 事实：/bootstrap 只写 config.json，不调用 boot()，也不启动 NapCat。
  // 下载和扫码都发生在**重启之后**的 apply() → start() 里。
  // 以前文案写「正在启动 NapCat，扫码页马上会自动打开」，是假的。
  const c = read('lib/client.js');
  assert.ok(!c.includes('正在启动 NapCat，扫码页马上会自动打开'), '不能再说「马上会自动打开」');
  assert.ok(!c.includes('生成后会自动下载 NapCat'), '不能再说「生成后会自动下载」');
  // 必须明确写出「要重启」
  assert.match(c, /配置已生成[^]{0,200}重新启动/, '生成成功后要提示重启');
  assert.match(c, /生成配置只写文件，不会立刻下载/, '要说清「生成」和「下载」是两步');
  assert.match(c, /请完全退出 DeepSeek Harness，再重新启动 —— NapCat 的下载和扫码都在重启之后才开始/, '待重启那一屏要说清');
});

test('/bootstrap 确实只写配置（所以文案必须要求重启）', () => {
  const ui = read('lib/ui.mjs');
  const i = ui.indexOf('PREFIX}/bootstrap');
  const seg = ui.slice(i, i + 2600);
  assert.match(seg, /atomicWriteJson\(configPath/, '要写配置');
  // 如果哪天改成真启动，这条测试会提醒我们同步改文案
  const boots = /options\.boot\(/.test(seg);
  const c = read('lib/client.js');
  if (boots) {
    assert.ok(!c.includes('请完全退出 DeepSeek Harness，再重新启动 —— NapCat 的下载和扫码都在重启之后才开始'),
      '/bootstrap 已经会真启动时，就不再需要「必须重启」的文案了');
  } else {
    assert.ok(c.includes('请完全退出 DeepSeek Harness，再重新启动'), '既然不自动启动，就必须要求重启');
  }
});

test('认号不能只靠日志：v4.18.41 不打印 napcat_<uin>.json 那一行', async () => {
  // 实测报告：v4.18.41 登录成功只打「Worker进程已登录成功」/「已通知主进程登录成功」，
  // 日志里根本没有 napcat_<uin>.json。只匹配那行的话永远返回 null ——
  // 表现就是「扫码成功了，面板一直卡在等待扫码」，直到 10 分钟超时。
  const { NapcatManager } = await import('../lib/napcat.mjs');
  const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
  const dir = join(tmpdir(), 'qqa-acct2-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(join(dir, 'work', 'config'), { recursive: true });
  mkdirSync(join(dir, 'logs'), { recursive: true });
  const logPath = join(dir, 'logs', 'console.log');
  // 完全按报告里的真实日志写：没有 uin 行
  writeFileSync(logPath, [
    '15:12:10 [info] 没有 -q 指令指定快速登录，将使用二维码登录方式',
    '15:18:28 [info] [Core] [Login] 二维码已被扫描，等待确认...',
    '15:18:32 [info] [NapCat] [Fork] Worker进程已登录成功，切换到正常重试策略',
    '15:18:32 [info] [NapCat] 已通知主进程登录成功',
  ].join(String.fromCharCode(10)));
  // NapCat 登录后写的配置文件名就是真实 uin
  writeFileSync(join(dir, 'work', 'config', 'napcat_1234567890.json'), '{}');

  const cfg = normalizeConfig({ selfId: '', loginPending: true, onebot: { token: 'a'.repeat(24) }, events: { secret: 'b'.repeat(24) } });
  cfg.dataDir = dir;
  cfg.onebot.apiUrl = 'http://127.0.0.1:18688';
  cfg.napcat = { ...cfg.napcat, directory: dir, webuiPort: 16994 };
  const m = new NapcatManager(cfg, {
    client: { call: async () => ({}), verifyIdentity: async () => ({ userId: '1' }) },
    logger: { warn: () => {}, info: () => {} }, pollMs: 100, platform: 'win32', arch: 'x64',
    checkPort: async () => true, inspect: async () => ({ installed: true }),
    installer: async () => ({ installed: true }), spawnProcess: () => ({ pid: 1 }),
    killProcess: async () => {}, openBrowser: async () => {},
  });
  m.logPath = logPath; m.logOffset = 0;
  const got = await m.detectLoggedAccount();
  assert.equal(got?.uin, '1234567890', '要从 work/config 的文件名认出号');
  assert.equal(got?.via, 'config-file', '优先走配置文件名这条路');
  const { rmSync } = await import('node:fs');
  rmSync(dir, { recursive: true, force: true });
});

test('认号的三条路：配置文件名 > 日志 uin > 只有登录成功', () => {
  const nap = read('lib/napcat.mjs');
  assert.match(nap, /napcat_\(\\d\{5,12\}\)\\\.json\$\/\.exec\(name\)/, '要按文件名匹配');
  assert.match(nap, /via: 'config-file'/, '要有 config-file 这条');
  assert.match(nap, /via: 'log-uin'/, '要有 log-uin 这条');
  assert.match(nap, /via: 'log-success-only'/, '要有只有登录成功这条');
  assert.match(nap, /已登录成功\|登录成功\|已通知主进程登录成功/, '要认 v4.18.41 的成功文案');
  // 认不出号要立刻抛错，不能等超时
  assert.match(nap, /NapCat 已经登录成功，但没能自动认出是哪个 QQ 号/, '要有明确报错');
});

test('首次下载 NapCat 要显示百分比进度', () => {
  const nap = read('lib/napcat.mjs');
  // downloadArchive 本来就有 progress(received, total) 回调，
  // 但 1.1.4 的 napcat.mjs 没把它接给 installer —— 面板上只有一句「installing」，
  // 用户不知道是在下、下到哪了、还是卡死了。
  assert.match(nap, /const onProgress = \(received, total\) =>/, '要把进度回调接出来');
  assert.match(nap, /progress: onProgress/, '要传给 installer');
  assert.match(nap, /this\.progressPercent = pct/, '要存百分比');
  assert.match(nap, /正在下载 NapCat \$\{pct\}%/, '文案要带百分比');
  // 节流：下载时每收到一个 chunk 都回调，不节流数字会抖得没法看
  assert.match(nap, /if \(now - lastTick < 200 && received < total\) return;/, '要节流');
  // publicStatus 要把百分比带出去
  assert.match(nap, /progressPercent: this\.progressPercent/, '要暴露给面板');
});

test('面板要画进度条', () => {
  const c = read('lib/client.js');
  assert.ok(c.includes('nap.progressPercent'), '面板要读 progressPercent');
  assert.ok(c.includes('Math.min(100, Math.max(0, pct)) + "%"'), '要按百分比设置宽度');
  // client.js 必须是合法 JS（这一屏是我手写的 JSX 风格，括号容易错）
  assert.doesNotThrow(() => new Function(c), 'client.js 语法必须通过');
});

test('面板：首次配置不问 QQ 号，登录后醒目提示重启', () => {
  const c = read('lib/client.js');
  // 首次配置那一屏不该再有「登录用 QQ 号」输入框
  const bootStart = c.indexOf('state.missingConfig');
  const bootSeg = c.slice(bootStart, bootStart + 3000);
  assert.ok(!bootSeg.includes('登录用 QQ 号'), '首次配置不该再问登录 QQ 号');
  assert.ok(bootSeg.includes('不用填登录 QQ 号'), '要说明不用填');
  // 等待扫码那一屏
  assert.ok(c.includes('state.loginPending && !state.needsRestart'), '要有等待扫码那一屏');
  assert.ok(c.includes('等待扫码'), '要有等待扫码文案');
  // 重启提示要醒目
  assert.ok(c.includes('state.needsRestart'), '要有重启提示那一屏');
  assert.ok(c.includes('现在请完全退出 DeepSeek Harness，再重新启动'), '要把重启说清楚');
});

test('renderThoughtBlock 空列表返回空串', () => {
  assert.equal(renderThoughtBlock({ thoughts: [] }), '');
});
