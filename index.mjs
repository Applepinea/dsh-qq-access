import { loadConfig, defaultConfigPath } from './lib/config.mjs';
import { QQRuntime } from './lib/runtime.mjs';
import { makeTools } from './lib/tools.mjs';
import { NapcatManager } from './lib/napcat.mjs';
import { checkSignal, noteLog } from './lib/util.mjs';
import { registerUi } from './lib/ui.mjs';
import { MemeLibrary } from './lib/memes.mjs';
import { MemeClassifier } from './lib/meme-classify.mjs';

export const name = 'qq-access';
export const inject = ['agents', 'tools', 'systemPrompt', 'llm'];

export async function apply(ctx, config = {}) {
  const configPath = config.configPath || defaultConfigPath();
  const logger = ctx.logger ?? console;

  // 运行期状态全部挂在闭包里：面板要先挂上（用户得先看到「填 QQ 号」那一屏），
  // 而 runtime / NapCat 只有在配置存在之后才建得出来。
  let runtime = null;
  let manager = null;
  let background = null;
  let disposeUi = null;
  let disposers = [];
  let started = null;
  // start() 在 runtime 建起来前就失败时（读配置、import llm），没有 runtime 可以挂错误，
  // 先存在这里，等面板读 /state 时由 setRuntime 带出去。
  let lastBootError = null;

  const cleanup = async () => {
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
    await step('runtime', () => runtime?.stop());
    await step('napcat', () => manager?.stop());
    await step('background', () => background, 2000);
  };

  /**
   * 建 runtime 并把 QQ 接入跑起来。
   *
   * 两条路径都走这里：配置文件本来就存在（宿主重载插件），或者用户在面板里
   * 刚点完「生成配置」（`/bootstrap` 写盘后回调）。后者是这次改动的重点 ——
   * 以前必须回宿主里禁用/启用一次插件才会真正启动，用户根本不知道该这么做。
   */
  const start = async () => {
    if (started) return started;
    started = (async () => {
      const resolved = await loadConfig(configPath);
      // Load the host's message factory so admission uses its exact identity format.
      const { createUserMessage } = await import('@deepseek-ai/dsh-llm');
      if (typeof createUserMessage !== 'function') throw new Error('Harness 未提供 createUserMessage，请升级 Harness。');
      runtime = new QQRuntime(resolved, { ctx, createUserMessage, logger });
      // 后台任务失败时会把闭包里的 runtime 置空（为了 /retry 能重来）。
      // 这里先留住实例，start() 的返回值才不会被那次置空影响。
      const created = runtime;
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
      // 面板从这一刻起就能看到真实状态（napcat.state / connected / 各个 store）。
      disposeUi?.setRuntime?.(runtime);

      disposers = [];
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
          })().catch(async (error) => {
            const message = String(error?.message ?? error);
            if (!runtime.shutdown.signal.aborted) {
              runtime.connected = false;
              // 保留原始原因：以前这里换成一句固定文案，
              // 面板上的红字就再也看不到「扫码超时」「登录号和 selfId 不一致」这些关键信息。
              runtime.bootError = message;
              logger.warn?.('[dsh-qq-access] NapCat 启动或登录失败：' + message);
            }
            await manager.stop().catch(() => {});
            // 关键：把启动状态清掉，否则面板点「重试启动」会看到 runtimeCurrent
            // 还在，直接返回「已经在运行，无需重试」—— 按钮等于没有。
            if (!runtime.shutdown.signal.aborted) {
              try { manager = null; } catch {}
              started = null;
              disposeUi?.setRuntime?.(null);
              runtime = null;
            }
          }).catch((error) => { logger.warn?.('NapCat 停止失败，请在本机检查托管进程。' + String(error?.message ?? error)); });
          logger.info?.('NapCat 托管启动中，可调用 qq_status 查看进度；扫码页就绪后会自动打开。');
        } else {
          await runtime.start();
          logger.info?.(`QQ 接入已启动：本机事件端口 ${runtime.server.port}；群聊回复模式 ${resolved.reply.group}。`);
        }
      } catch (error) {
        for (const dispose of disposers.reverse()) dispose();
        disposers = [];
        await runtime.stop().catch(() => {});
        runtime = null;
        disposeUi?.setRuntime?.(null);
        throw error;
      }
      // 成功了就把上一次的失败原因清掉，否则重试成功后红字还挂在面板上。
      lastBootError = null;
      return created;
    })().catch((error) => {
      // 失败后要能重来：清掉 started，否则下次点「重试」会直接返回这个失败的 Promise。
      started = null;
      // runtime 半成品（工具已注册、NapCat 可能已经拉起来一半）必须收干净，
      // 不然重试时会撞上重复注册的工具和重复的 NapCat 进程。
      for (const dispose of disposers.reverse()) { try { dispose?.(); } catch {} }
      disposers = [];
      try { manager?.stop?.(); } catch {}
      manager = null;
      try { runtime?.stop?.(); } catch {}
      runtime = null;
      disposeUi?.setRuntime?.(null);
      throw error;
    });
    return started;
  };

  // 面板先挂上，runtime 之后由 start() 填进来。
  disposeUi = registerUi(ctx, null, configPath, {
    boot: start,
    // /retry 收掉半死状态时需要把面板的 runtime 也清掉。
    setRuntime: (next) => disposeUi?.setRuntime?.(next),
    // runtime 还没建起来就失败时（读配置、动态 import 宿主模块），错误没有对象可挂，
    // 用一个取值函数把它交给 /state，面板照样能显示原因。
    lastError: (current) => (current ? (current.bootError ?? null) : lastBootError),
  });
  ctx.on('dispose', cleanup);

  // 没有配置文件是「首次安装」这个可恢复状态，不是插件坏了。
  // 面板照常挂上，渲染成「填登录 QQ 号 → 生成配置」的引导；
  // 点「生成配置」时 /bootstrap 会调 boot() 当场把接入跑起来。
  try {
    await loadConfig(configPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    logger.warn?.('[dsh-qq-access] 还没有配置文件：' + configPath + '。面板已打开，请在页面顶部填写登录 QQ 号。');
    return;
  }

  // 启动失败也要把面板留着。
  //
  // 之前这里是裸的 `await start()`：只要 NapCat 拉不起来（端口被占、下载失败、
  // external 模式没跑 NapCat），异常就冒到宿主的 apply()，整个 entry 记成 failed，
  // 宿主打一行 warning 就跳过 —— 面板彻底消失，用户连「去哪改配置」都看不到。
  // 现在把原因写进 bootError，面板顶部红字显示，用户可以就地修。
  try {
    await start();
  } catch (error) {
    const message = String(error?.message ?? error);
    noteLog('start failed: ' + String(error?.stack ?? error).slice(0, 2000));
    logger.warn?.('[dsh-qq-access] QQ 接入启动失败：' + message + '。面板仍然可用，可在页面顶部查看原因并修改配置。');
    if (runtime) runtime.bootError = message;
    else lastBootError = message;
  }
}
