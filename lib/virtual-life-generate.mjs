/**
 * One-shot generation of the virtual life.
 *
 * A single agent turn produces the whole package: a seven-day schedule with real
 * variation between days, a wardrobe pool and a meal pool. That is deliberately
 * one call instead of one per day -- the persona keeps a stable life, and the user
 * pays for generation once per week rather than every morning.
 *
 * The prompt is strict about JSON and about the two invariants that matter for
 * lookup: the timeline must cover 00:00..24:00 with no gaps, and the seven days
 * must actually differ. Everything else is validated and repaired afterwards by
 * normalizeTimeline / normalizeOutfit / normalizeMeal, because a model that gets
 * one boundary wrong should cost a repaired schedule, not a failed week.
 */
import { normalizeTimeline, normalizeOutfit, normalizeMeal, WEEKDAYS } from './virtual-life.mjs';
import { sessionEventList } from './runtime.mjs';
import { describeDay } from './weather.mjs';
import { hostSelection } from './util.mjs';

const SYSTEM_PROMPT = `你是一个结构化生活生成器。只输出一个可被 JSON.parse 直接解析的 JSON 对象，禁止 Markdown 代码块、解释或任何额外文字。

输出结构（字段名必须完全一致）：
{
  "longTerm": "一两句话说明当前人生阶段（学期/工作/假期等）",
  "week": [
    {
      "weekday": 0,
      "theme": "这一天的主题，4-10 字",
      "mood": "这一天的基调心情，2-6 字",
      "timeline": [
        { "start": "00:00", "end": "07:00", "activity": "睡觉", "location": "宿舍", "state": "sleep", "availability": "blocked" }
      ],
      "proactiveWindows": [
        { "at": "12:30", "intent": "想分享午饭吃了什么", "audience": "private" }
      ]
    }
  ],
  "outfits": [
    { "style": "风格", "summary": "一句话概括", "weather": ["rain"], "tempMin": 10, "tempMax": 17, "pieces": [ { "category": "top", "name": "具体单品", "detail": "颜色材质等细节" } ] }
  ],
  "meals": [
    { "slot": "breakfast", "place": "地点", "dishes": ["菜名"], "note": "一句话" }
  ]
}

硬性规则：
1. week 必须正好 7 项，weekday 从 0 到 6，0 表示周一。
2. 每天的 timeline 必须从 00:00 开始、到 24:00 结束，相邻项首尾相接，不得有空档、重叠或倒序。
3. 只有最后一项的 end 可以是 24:00；其他时间一律补零 HH:MM。
4. state 只能是 sleep / busy / focus / transit / available / social。
5. availability 只能是 blocked / low / normal / high。
6. 七天必须有实质差异：活动、地点、节奏至少两项不同，不能只换主题名。
7. 工作日与周末的作息要明显不同（起床时间、安排密度）。
8. outfits 生成 12-20 套，覆盖不同场合与季节感，pieces 至少 3 件且要具体（含颜色/材质/品牌感描述）。
   每套必须有这三个字段，缺任何一个这套就不合格：
   - weather：这套适合的天气，只能从 rain / snow / sun / cloud / wind / any 里选，可多选。
     any 只给打底衫、家居服、内衣这种确实不分天气的用，外套和下装一律写具体天气。
   - tempMin：这套能穿的最低温度，单个整数，单位摄氏度。
   - tempMax：这套能穿的最高温度，单个整数，单位摄氏度。
     tempMin 和 tempMax 要写这套衣服实际能穿的范围，必须是你真的会穿的那个区间。
     例如厚羽绒服 tempMin=0 tempMax=10，薄卫衣 tempMin=12 tempMax=20，短袖 tempMin=22 tempMax=32。
     不要为了保险写成 0 和 40 这种什么都覆盖的范围，那等于没写。
   完整示例：
   { "style": "雨天通勤", "weather": ["rain", "wind"], "tempMin": 10, "tempMax": 17,
     "summary": "下雨降温也能干爽地走完早八",
     "pieces": [{ "category": "outer", "name": "藏青色防水风衣", "detail": "哑光涂层" }] }
   rain 至少 3 套、sun 至少 2 套、cloud 至少 3 套，否则某个天气永远只有一件可选。
9. meals 每个 slot（breakfast / lunch / dinner）各生成 8-12 条，菜名具体，不要重复。
10. proactiveWindows 每天 0-2 条，at 必须落在当天某个 timeline 时段内，intent 写成第一人称想做的事。`;

/**
 * Build the user prompt from the persona and the previous life (if any).
 *
 * The previous week is summarised rather than pasted: reusing it verbatim makes
 * the model repeat itself, while omitting it entirely loses continuity.
 */
export function buildPrompt({ persona, previous, now = new Date(), weather = null, city = '' }) {
  const lines = [];
  lines.push('人格设定：');
  lines.push(String(persona ?? '').slice(0, 6000) || '（未设置，按普通大学生写）');
  lines.push('');
  lines.push(`当前日期：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${WEEKDAYS[(now.getDay() + 6) % 7]}）`);

  // 天气预报是这次生成里最实在的一条输入：没有它，模型只能按月份猜，
  // 于是会出现「20 度的大晴天穿羽绒服」或者「下雨天没带伞」。
  if (Array.isArray(weather) && weather.length) {
    lines.push('');
    lines.push(`未来一周${city ? '（' + city + '）' : ''}的天气预报：`);
    for (const day of weather.slice(0, 7)) {
      lines.push(`- ${day.date}：${describeDay(day)}`);
    }
    lines.push('');
    lines.push('穿搭和日程必须按上面的实际天气来写：降温就加衣服，下雨就带伞、穿防水的鞋，');
    lines.push('晴天热就别写厚外套。不要写和当天温度明显不符的搭配。');
  }

  if (previous?.ready) {
    lines.push('');
    lines.push('上一版设定（请保持连续性，但不要照抄）：');
    if (previous.longTerm) lines.push(`- 人生阶段：${previous.longTerm}`);
    const themes = Object.values(previous.week ?? {}).map((d) => d.theme).filter(Boolean);
    if (themes.length) lines.push(`- 上一天的主题：${themes.join('、')}`);
    if (previous.counts?.outfits) lines.push(`- 已有 ${previous.counts.outfits} 套穿搭、${previous.counts.meals} 条餐食，可以换新花样。`);
  }
  lines.push('');
  lines.push('请按系统提示的 JSON 结构生成完整的一周。');
  return lines.join('\n');
}

/** Pull a JSON object out of whatever the model returned. */
export function extractJsonObject(text) {
  const source = String(text ?? '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : source;
  const start = body.indexOf('{');
  if (start < 0) return null;
  // Walk braces with string awareness: the payload contains quoted Chinese text
  // and escaped quotes, so indexOf('}') is not enough.
  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(body.slice(start, end + 1)); }
  catch { return null; }
}

/**
 * Turn a raw model payload into the shape VirtualLife stores.
 *
 * Days are placed by `weekday` when the model supplied one, and by position
 * otherwise, so a model that forgets the field still produces a usable week.
 */
export function normalizeGenerated(payload) {
  const problems = [];
  if (!payload || typeof payload !== 'object') return { ok: false, problems: ['不是对象'] };

  const week = {};
  const rawWeek = Array.isArray(payload.week) ? payload.week : [];
  rawWeek.forEach((day, index) => {
    if (!day || typeof day !== 'object') return;
    const declared = Number(day.weekday);
    const slot = Number.isInteger(declared) && declared >= 0 && declared <= 6 ? declared : index;
    if (slot > 6) return;
    const timeline = normalizeTimeline(day.timeline);
    if (!timeline.length) { problems.push(`第 ${slot + 1} 天时间线为空`); return; }
    const windows = (Array.isArray(day.proactiveWindows) ? day.proactiveWindows : [])
      .map((w, wi) => {
        const at = String(w?.at ?? '').trim();
        if (!/^\d{1,2}:\d{2}$/.test(at)) return null;
        return {
          id: String(w?.id ?? `w-${slot}-${wi}`).trim() || `w-${slot}-${wi}`,
          at,
          intent: String(w?.intent ?? '').trim().slice(0, 120),
          audience: ['private', 'group', 'both'].includes(String(w?.audience)) ? String(w.audience) : 'private',
        };
      })
      .filter(Boolean)
      .slice(0, 3);
    week[String(slot)] = {
      theme: String(day.theme ?? '').trim().slice(0, 40) || `第${slot + 1}天`,
      mood: String(day.mood ?? '').trim().slice(0, 20) || '平静',
      timeline,
      proactiveWindows: windows,
    };
  });

  if (Object.keys(week).length < 7) problems.push(`只有 ${Object.keys(week).length}/7 天有效`);

  const outfits = (Array.isArray(payload.outfits) ? payload.outfits : []).map(normalizeOutfit).filter(Boolean);
  const meals = (Array.isArray(payload.meals) ? payload.meals : []).map(normalizeMeal).filter(Boolean);
  if (!outfits.length) problems.push('没有有效穿搭');
  if (!meals.length) problems.push('没有有效餐食');

  return {
    ok: Object.keys(week).length === 7,
    week,
    longTerm: String(payload.longTerm ?? '').trim().slice(0, 1200),
    outfits,
    meals,
    problems,
  };
}

export class VirtualLifeGenerator {
  constructor(runtime, { logger = console } = {}) {
    this.runtime = runtime;
    this.logger = logger;
    this.running = false;
  }

  /**
   * Generate and store a new week.
   *
   * One retry: a model that emits malformed JSON on the first attempt often gets
   * it right on the second with the failure named. More retries than that just
   * spends tokens on the same mistake.
   */
  async generate({ force = false } = {}) {
    if (this.running) return { ok: false, reason: '已有生成任务在进行' };
    const life = this.runtime.life;
    if (!life) return { ok: false, reason: '虚拟人生未启用' };
    await life.init();
    if (life.ready && !force) return { ok: true, skipped: true, snapshot: life.snapshot() };

    this.running = true;
    const started = Date.now();
    try {
      const persona = this.runtime.config.persona ?? '';
      const weatherCfg = this.runtime.config.weather ?? {};
      // 天气拿不到就返回 null，这里不 try/catch 也不会炸 —— forecast() 自己吞掉了失败。
      const forecast = weatherCfg.enabled
        ? await this.runtime.weather?.forecast?.({ days: 7 })
        : null;
      if (weatherCfg.enabled && !forecast) {
        this.logger?.warn?.('天气没拿到，这次生成会退化成按季节猜');
      }
      const prompt = buildPrompt({
        persona,
        previous: life.snapshot(),
        weather: forecast,
        city: weatherCfg.city ?? '',
      });
      let lastProblems = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        const text = await this.#ask(prompt, attempt > 1 ? lastProblems : null);
        const payload = extractJsonObject(text);
        if (!payload) { lastProblems = ['返回内容不是合法 JSON']; continue; }
        const result = normalizeGenerated(payload);
        if (result.ok) {
          const snapshot = await life.setWeek({
            week: result.week,
            longTerm: result.longTerm,
            outfits: result.outfits,
            meals: result.meals,
            personaHash: null,
            // 存下预报，drawFor 按当天天气挑穿搭要用。
            forecast,
          });
          return {
            ok: true,
            attempt,
            elapsedMs: Date.now() - started,
            counts: snapshot.counts,
            warnings: result.problems,
          };
        }
        lastProblems = result.problems;
      }
      this.logger?.warn?.('虚拟人生生成结果不合格：' + lastProblems.join('；'));
      return { ok: false, reason: '生成结果不合格：' + lastProblems.join('；'), problems: lastProblems, elapsedMs: Date.now() - started };
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 300);
      // A generation failure is invisible in the panel beyond a red line, and the
      // panel is easy to miss. Record it where it can be found afterwards.
      try {
        const { appendFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const { homedir } = await import('node:os');
        appendFileSync(join(homedir(), '.dsh-qq-access', 'debug.log'),
          new Date().toISOString() + ' life generate FAILED: ' + String(error?.stack ?? error).slice(0, 2000) + '\n');
      } catch { /* diagnostics must never break generation */ }
      this.logger?.warn?.('虚拟人生生成失败：' + reason);
      return { ok: false, reason, elapsedMs: Date.now() - started };
    } finally {
      this.running = false;
    }
  }

  /** One throwaway agent turn; the reply is raw text. */
  async #ask(prompt, problems) {
    const runtime = this.runtime;
    const defaultSelection = runtime.ctx.get?.('agentDefaultModel')?.currentSelection?.();
    const route = Object.keys(runtime.config.route ?? {}).length ? runtime.config.route : undefined;
    const agentOptions = route ?? hostSelection(defaultSelection);
    const id = `qq-life-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = await runtime.ctx.agents.create({
      sessionId: id,
      meta: { cwd: runtime.config.dataDir },
      ...(agentOptions ? { agentOptions } : {}),
      setup: async (agentCtx) => {
        // No tools: this turn must answer, not act.
        if (typeof agentCtx.tools?.restrict === 'function') agentCtx.tools.restrict({ allow: [] });
        agentCtx.systemPrompt.section({ name: 'virtual-life-generator', order: 500, text: SYSTEM_PROMPT });
      },
    });
    try {
      const content = [{ type: 'text', text: problems?.length
        ? prompt + '\n\n上一次生成有以下问题，请修正后重新输出完整 JSON：\n- ' + problems.join('\n- ')
        : prompt }];
      const before = Number.isInteger(handle.agent.session?.seq) ? handle.agent.session.seq : 0;
      handle.agent.followup(runtime.createUserMessage({ content, source: { kind: 'user' } }));
      await handle.agent.whenIdle();
      const events = sessionEventList(handle.agent.session).slice(before);
      const texts = [];
      for (const event of events) {
        if (event.type !== 'assistant/message') continue;
        for (const part of event.data?.message?.content ?? []) {
          if (part?.type === 'text' && part.text) texts.push(part.text);
        }
      }
      return texts.join('\n');
    } finally {
      try { await handle?.dispose?.(); } catch { /* the turn is over */ }
    }
  }
}
