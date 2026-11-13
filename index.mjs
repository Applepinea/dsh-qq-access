import { loadConfig, defaultConfigPath } from './lib/config.mjs';
import { QQRuntime } from './lib/runtime.mjs';
import { makeTools } from './lib/tools.mjs';
import { NapcatManager } from './lib/napcat.mjs';
import { checkSignal, noteLog } from './lib/util.mjs';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { registerUi } from './lib/ui.mjs';
import { MemeLibrary } from './lib/memes.mjs';
import { MemeClassifier } from './lib/meme-classify.mjs';

export const name = 'qq-access';
export const inject = ['agents', 'tools', 'systemPrompt', 'llm'];

export async function apply(ctx, config = {}) {
  const configPath = config.configPath || defaultConfigPath();
  const logger = ctx.logger ?? console;

  let resolved;
  try {
    resolved = await loadConfig(configPath);
  } catch (error) {
    // 「还没配置」是可恢复的首次安装状态，不是插件坏了。
    //
    // 以前这里直接抛：宿主把整个 bundle 记为 skipped，面板根本不出现，
    // 新用户装完插件只看到一行 stderr，完全不知道该做什么。现在改成只挂面板：
    // 页面顶部会渲染「填写登录 QQ 号 → 生成配置」的引导，生成后重载插件即可。
    if (error?.code !== 'ENOENT') throw error;
    logger.warn?.('[dsh-qq-access] 还没有配置文件：' + configPath + '。面板已打开，请在页面顶部生成配置，然后重载插件。');
    const disposeUi = registerUi(ctx, null, configPath);
    ctx.on('dispose', async () => { try { await disposeUi?.(); } catch (disposeError) { noteLog('dispose ui (bootstrap) failed: ' + String(disposeError?.stack ?? disposeError).slice(0, 2000)); } });
    return;
  }

  // Load the host's message factory so admission uses its exact identity format.
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
  if (typeof createUserMessage !== 'function') throw new Error('Harness 未提供 createUserMessage，请升级 Harness。');
  const runtime = new QQRuntime(resolved, { ctx, createUserMessage, logger });
  // The sticker library lives beside the archive, so a plugin reinstall keeps it.
  if (resolved.memes?.enabled !== false) {
    runtime.memes = new MemeLibrary({
      dataDir: resolved.dataDir,
      maxEntries: resolved.memes?.maxEntries ?? 5000,
      logger,
    });
    runtime.memes.init().catch(error => logger.warn?.('表情包图库初始化失败：' + error.message));
    if (resolved.memes?.visionClassify !== false) {
      runtime.classifier = new MemeClassifier(runtime, { logger });
      // Classification is background work: it must never delay the Host's ready
      // handshake, and stickers simply stay unclassified if it cannot run.
      runtime.memes.init()
        .then(() => runtime.classifier.runOnce({ max: 6 }))
        .catch(error => logger.warn?.('表情包自动分类失败：' + error.message));
    }
  }
  let manager, background;
  const disposeUi = registerUi(ctx, runtime, resolved.configPath ?? configPath);
  // Disposal must finish even when one stage hangs: a stuck dispose leaves the
  // fiber inactive while the event server keeps running, which shows up later as
  // "cannot get required service ... in inactive context" on every reply.
  ctx.on('dispose', async () => {
    const step = async (label, run, timeoutMs = 8000) => {
      try {
        await Promise.race([
          Promise.resolve().then(run),
          new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
        ]);
      } catch (error) {
        noteLog('dispose ' + label + ' failed: ' + String(error?.stack ?? error).slice(0, 2000));
      }
    };
    await step('ui', () => disposeUi?.());
    await step('runtime', () => runtime.stop());
    await step('napcat', () => manager?.stop());
    await step('background', () => background, 2000);
  });
  const disposers = [];
  try {
    for (const definition of makeTools(runtime)) disposers.push(ctx.tools.register(definition));
    disposers.push(ctx.tools.guard(exec => runtime.access.guard(exec)));
    if (resolved.napcat.mode === 'managed') {
      manager = new NapcatManager(resolved, { client: runtime.client, logger });
      runtime.napcat = manager;
      // Installation and human QR login must not block the desktop Host's ready
      // handshake. qq_status remains available throughout this background task.
      background = (async () => {
        await manager.start(runtime.shutdown.signal);
        const account = await manager.waitForLogin();
        checkSignal(runtime.shutdown.signal);

        // 首次配置：用户没有填号，刚扫完码。把它写回 config.json，
        // 然后停下来等用户重启 DSH —— 运行中的 runtime 还拿着 selfId '' ，
        // 就算继续跑也收发不了消息。
        if (resolved.loginPending) {
          const selfId = String(account ?? '').trim();
          if (!/^[1-9]\d{4,11}$/.test(selfId)) throw new Error('扫码登录成功，但没能从 NapCat 日志里认出 QQ 号；请重载插件后手动填写。');
          const file = resolved.configPath;
          const raw = JSON.parse(await readFile(file, 'utf8'));
          raw.selfId = selfId;
          raw.loginPending = false;
          const tmp = file + '.tmp';
          await mkdir(dirname(file), { recursive: true, mode: 0o700 });
          await writeFile(tmp, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
          await rename(tmp, file);
          runtime.needsRestart = { selfId, at: Date.now() };
          logger.info?.('[dsh-qq-access] 首次登录成功：QQ ' + selfId + '。配置已写回，请重启 DSH 让它生效。');
          noteLog('首次登录成功，已把 selfId=' + selfId + ' 写回配置；等待用户重启 DSH。');
          return;
        }

        await runtime.start();
        logger.info?.('QQ 托管接入已就绪。');
        await manager.monitor(connected => { runtime.connected = connected; });
      })().catch(async () => {
        if (!runtime.shutdown.signal.aborted) {
          runtime.connected = false;
          runtime.bootError = 'NapCat 启动或登录失败。请检查本机 NapCat 日志，完成扫码后重载插件。';
          logger.warn?.(runtime.bootError);
        }
        await manager.stop();
      }).catch(() => { logger.warn?.('NapCat 停止失败，请在本机检查托管进程。'); });
      logger.info?.('NapCat 托管启动中，可调用 qq_status 查看进度；扫码页就绪后会自动打开。');
    } else {
      await runtime.start();
      logger.info?.(`QQ 接入已启动：本机事件端口 ${runtime.server.port}；群聊回复模式 ${resolved.reply.group}。`);
    }
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    await runtime.stop();
    throw error;
  }
}
