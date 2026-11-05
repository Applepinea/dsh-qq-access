import { loadConfig, defaultConfigPath } from './lib/config.mjs';
import { QQRuntime } from './lib/runtime.mjs';
import { makeTools } from './lib/tools.mjs';
import { NapcatManager } from './lib/napcat.mjs';
import { checkSignal } from './lib/util.mjs';
import { registerUi } from './lib/ui.mjs';

export const name = 'qq-access';
export const inject = ['agents', 'tools', 'systemPrompt'];

export async function apply(ctx, config = {}) {
  const resolved = await loadConfig(config.configPath || defaultConfigPath());
  // Load the host's message factory so admission uses its exact identity format.
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
  if (typeof createUserMessage !== 'function') throw new Error('Harness 未提供 createUserMessage，请升级 Harness。');
  const logger = ctx.logger ?? console;
  const runtime = new QQRuntime(resolved, { ctx, createUserMessage, logger });
  let manager, background;
  const disposeUi = registerUi(ctx, runtime, resolved.configPath);
  // Disposal must finish even when one stage hangs: a stuck dispose leaves the
  // fiber inactive while the event server keeps running, which shows up later as
  // "cannot get required service ... in inactive context" on every reply.
  // 本地补丁：dispose 逻辑同时作为 apply 的返回值交给 Cordis。实测行被移除时
  // 'dispose' 事件没有触发，导致 /dsh-qq/api/* 路由与 5701 事件服务器泄漏，
  // 同一进程里再次挂载必然撞 duplicate exact route。返回 disposer 是 Cordis 的
  // 正规清理路径，配上幂等守卫，两条路径都安全。
  let disposed = false;
  const disposeAll = async () => {
    if (disposed) return;
    disposed = true;
    try {
      const { appendFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { homedir } = await import('node:os');
      appendFileSync(join(homedir(), '.dsh-qq-access', 'debug.log'), new Date().toISOString() + ' dispose begin\n');
    } catch {}
    const step = async (label, run, timeoutMs = 8000) => {
      try {
        await Promise.race([
          Promise.resolve().then(run),
          new Promise((resolve) => setTimeout(resolve, timeoutMs).unref?.()),
        ]);
      } catch (error) {
        try {
          const { appendFileSync } = await import('node:fs');
          const { join } = await import('node:path');
          const { homedir } = await import('node:os');
          appendFileSync(join(homedir(), '.dsh-qq-access', 'debug.log'), new Date().toISOString() + ' dispose ' + label + ' failed: ' + String(error?.stack ?? error).slice(0, 2000) + '\n');
        } catch {}
      }
    };
    await step('ui', () => disposeUi?.());
    await step('runtime', () => runtime.stop());
    await step('napcat', () => manager?.stop());
    await step('background', () => background, 2000);
  };
  ctx.on('dispose', disposeAll);
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
        await manager.waitForLogin();
        checkSignal(runtime.shutdown.signal);
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
    // 本地补丁：apply 失败时也走同一套完整清理（UI 路由 + 事件服务器 + runtime）。
    await disposeAll();
    throw error;
  }
  return disposeAll;
}
