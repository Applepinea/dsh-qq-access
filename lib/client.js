window.__ModuleLoader__.load({
  id: "dsh-qq-access",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require("react");
    const { createElement: h, useCallback, useEffect, useState } = React;

    const API = "/dsh-qq/api";
    const CSS_ID = "dsh-qq-access/panel.css";
    const CSS = [
      ".qqa{max-width:780px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary);height:100%;max-height:min(100%, calc(100vh - 88px));min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-gutter:stable;scrollbar-width:thin;padding-right:8px;box-sizing:border-box}",
      ".qqa::-webkit-scrollbar{width:10px}",
      ".qqa::-webkit-scrollbar-thumb{background:rgba(127,127,127,.35);border-radius:999px;border:3px solid transparent;background-clip:content-box}",
      ".qqa::-webkit-scrollbar-thumb:hover{background:rgba(127,127,127,.55);background-clip:content-box}",
      ".qqa::-webkit-scrollbar-track{background:transparent}",
      ".qqa h2{margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".qqa .sub{color:var(--dsw-alias-label-tertiary);font-size:12.5px;line-height:19px;margin:0}",
      ".qqa .card{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px}",
      ".qqa .cardT{font-size:13px;font-weight:600;line-height:20px;display:flex;align-items:center;gap:8px}",
      ".qqa .row{display:flex;justify-content:space-between;align-items:center;gap:10px 16px;flex-wrap:wrap}",
      ".qqa .row>div:first-child{flex:1;min-width:180px}",
      ".qqa .lbl{font-size:13px;line-height:19px}",
      ".qqa .hint{color:var(--dsw-alias-label-tertiary);font-size:11.5px;line-height:17px;margin-top:3px}",
      ".qqa input[type=text],.qqa input[type=number],.qqa select,.qqa textarea{background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-size:12.5px;padding:5px 8px;outline:none;font-family:inherit}",
      ".qqa input[type=text],.qqa input[type=number],.qqa select{height:28px;min-width:170px}",
      ".qqa textarea{width:100%;min-height:110px;line-height:18px;resize:vertical}",
      ".qqa button{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff);border:none;border-radius:6px;font-size:12.5px;height:30px;padding:0 12px;cursor:pointer}",
      ".qqa button.ghost{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}",
      ".qqa button:disabled{opacity:.5;cursor:default}",
      ".qqa .badge{font-size:11px;line-height:16px;padding:1px 8px;border-radius:999px;background:rgba(127,127,127,.15);color:var(--dsw-alias-label-secondary)}",
      ".qqa .ok{background:rgba(46,160,67,.16);color:var(--dsw-alias-label-primary)}",
      ".qqa .bad{background:rgba(220,53,69,.16);color:var(--dsw-alias-label-primary)}",
      ".qqa .msg{font-size:12px;line-height:18px;white-space:pre-line}",
      ".qqa .msg.err{color:var(--dsw-alias-state-error-primary)}",
      ".qqa .sw{display:inline-flex;align-items:center;gap:6px;font-size:12.5px}",
    ].join("");

    function ensureCss() {
      if (document.getElementById(CSS_ID)) return;
      const el = document.createElement("style");
      el.id = CSS_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    const splitIds = (value) => String(value ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

    function Card(props) {
      return h("div", { className: "card" }, h("div", { className: "cardT" }, props.title), props.children);
    }

    function Switch(props) {
      return h("label", { className: "sw" },
        h("input", { type: "checkbox", checked: Boolean(props.checked), onChange: (e) => props.onChange(e.target.checked), disabled: props.disabled }),
        h("span", null, props.checked ? "已开启" : "已关闭"));
    }

    function QqPanel() {
      const [state, setState] = useState(null);
      const [form, setForm] = useState(null);
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState("");
      const [err, setErr] = useState("");
      // Model picker state. `catalog` is what the Host can route right now;
      // choosing "follow default" leaves config.model unset.
      const [catalog, setCatalog] = useState({ groups: [], default: null, failures: [] });
      // Sticker library snapshot: stats + the two lists the panel renders.
      const [memes, setMemes] = useState(null);
      // Virtual life snapshot: the generated week plus wardrobe and meal pools.
      const [life, setLife] = useState(null);
      // Per-conversation proactive switches, loaded from the archive.
      const [targets, setTargets] = useState([]);
      // 主动发动态：调度快照 + 上次发布结果。
      const [qzone, setQzone] = useState(null);
      // 情感与关系：档案列表 + 统计。
      const [emotion, setEmotion] = useState(null);
      // 长期记忆：按人汇总的记忆档案。
      const [memory, setMemory] = useState(null);
      // 本周安排默认折叠：一周 7 天的详细日程很长，默认展开会把下面所有设置挤下去。
      const [weekOpen, setWeekOpen] = useState(false);
      // 主动消息测试结果，只在点过按钮后显示。
      const [proactiveTest, setProactiveTest] = useState(null);
      // 有没有未保存的改动。只在用户改了表单之后置真，
      // 加载和保存成功时清零 —— 否则刷新完就显示「有未保存修改」，等于误导。
      const [dirty, setDirty] = useState(false);

      const load = useCallback(async ({ keepSecrets = false } = {}) => {
        setErr("");
        try {
          const res = await fetch(API + "/state", { credentials: "same-origin" });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "读取失败");
          setState(data);
          // The catalog is advisory: a failure here must not break the whole panel.
          try {
            const cat = await (await fetch(API + "/models", { credentials: "same-origin" })).json();
            if (cat.ok) setCatalog({ groups: cat.groups ?? [], default: cat.default ?? null, failures: cat.failures ?? [] });
          } catch (e) { /* keep the previous catalog */ }
          const chosen = data.config.model ?? null;
          setForm((prev) => ({
            replyPrivate: data.config.reply.private !== false,
            replyGroup: data.config.reply.group ?? "smart",
            smartThreshold: data.config.reply.smartThreshold ?? 3,
            selfNames: (data.config.reply.selfNames ?? []).join(","),
            interests: (data.config.reply.interests ?? []).join(","),
            learnInterests: data.config.reply.learnInterests !== false,
            privateMode: data.config.access.privateMode ?? "all",
            privateIds: (data.config.access.privateIds ?? []).join(","),
            groupMode: data.config.access.groupMode ?? "all",
            ownerIds: (data.config.ownerIds ?? []).join(","),
            persona: data.config.persona ?? "",
            retentionDays: data.config.retentionDays ?? 30,
            retentionForever: Number(data.config.retentionDays ?? 30) === 0,
            napcatMode: data.config.napcat.mode ?? "managed",
            webuiPort: data.config.napcat.webuiPort ?? 6800,
            pollSeconds: Math.round((data.config.poll?.intervalMs ?? 60000) / 1000),
            pollEnabled: data.config.poll?.enabled !== false,
            segmentMinSec: (data.config.rate?.segmentMinMs ?? 1000) / 1000,
            segmentMaxSec: (data.config.rate?.segmentMaxMs ?? 10000) / 1000,
            segmentPerCharMs: data.config.rate?.segmentPerCharMs ?? 60,
            linkParse: data.config.reply?.linkParse !== false,
            linkMaxImages: data.config.reply?.linkMaxImages ?? 9,
            lifeEnabled: data.config.life?.enabled !== false,
            lifeInject: data.config.life?.inject !== false,
            lifeProactive: data.config.life?.proactive === true,
            lifeProactivePrivate: data.config.life?.proactivePrivate !== false,
            lifeProactiveGroup: data.config.life?.proactiveGroup === true,
            lifeMaxPerDay: data.config.life?.proactiveMaxPerDay ?? 3,
            lifeMinGap: data.config.life?.proactiveMinGapMinutes ?? 90,
            lifeJitter: data.config.life?.proactiveJitterMinutes ?? 45,
            lifeGrace: data.config.life?.proactiveGraceMinutes ?? 30,
            // 会话空闲多久回收，界面用分钟。0 = 永不回收。
            idleMinutes: Math.round((data.config.reply?.idleMs ?? 1800000) / 60000),
            // 开关状态由 idleMs === 0 推导，不单独存 —— 只存一个真值来源，避免两处打架。
            neverEvict: Number(data.config.reply?.idleMs ?? 1800000) === 0,
            contextMessages: data.config.reply?.contextMessages ?? 20,
            maxLiveSessions: data.config.reply?.maxLiveSessions ?? 64,
            lifeHint: data.config.life?.proactiveHint ?? '',
            wxEnabled: data.config.weather?.enabled === true,
            wxHost: data.config.weather?.apiHost ?? '',
            // 服务端不回传明文 key。keepSecrets 时保留用户正在输入的草稿，
            // 否则每次刷新都会把刚粘贴进去的 key 清掉，看起来像没保存成功。
            wxKey: keepSecrets ? (prev.wxKey ?? '') : '',
            wxHasKey: data.config.weather?.hasApiKey === true,
            wxLat: data.config.weather?.latitude ?? 38.90,
            wxLon: data.config.weather?.longitude ?? -77.04,
            memesVision: data.config.memes?.visionClassify !== false,
            memesAutoSend: data.config.memes?.autoSend === true,
            memesAutoSendChance: data.config.memes?.autoSendChance ?? 0.15,
            qzEnabled: data.config.qzoneProactive?.enabled === true,
            qzMaxPerDay: data.config.qzoneProactive?.maxPerDay ?? 1,
            qzDailyChance: data.config.qzoneProactive?.dailyChance ?? 100,
            qzTimeTone: data.config.qzoneProactive?.timeTone !== false,
            emEnabled: data.config.emotion?.enabled === true,
            emPerSession: data.config.emotion?.perSession === true,
            emUseModel: data.config.emotion?.useModel !== false,
            emProvider: data.config.emotion?.provider ?? "",
            emModel: data.config.emotion?.model ?? "",
            emInject: data.config.emotion?.inject !== false,
            emPrivacy: data.config.emotion?.privacyLevel ?? 1,
            emThreshold: data.config.emotion?.significanceThreshold ?? 5,
            memEnabled: data.config.memory?.enabled === true,
            memInject: data.config.memory?.inject !== false,
            memUseModel: data.config.memory?.useModel === true,
            memHalfLife: data.config.memory?.halfLifeDays ?? 30,
            memRecall: data.config.memory?.recallLimit ?? 4,
            memFacts: data.config.memory?.factLimit ?? 6,
            memMinScore: data.config.memory?.minScore ?? 0.12,
            memQuota: data.config.memory?.dailyQuota ?? 12,
            qzWindowStart: data.config.qzoneProactive?.windowStart ?? "08:00",
            qzWindowEnd: data.config.qzoneProactive?.windowEnd ?? "23:00",
            qzMinGap: data.config.qzoneProactive?.minGapMinutes ?? 180,
            qzTopic: data.config.qzoneProactive?.topic ?? "",
            qzUseLife: data.config.qzoneProactive?.useLife !== false,
            qzAllowDetails: data.config.qzoneProactive?.allowDetails !== false,
            modelFollowDefault: !chosen,
            modelProvider: chosen?.provider ?? "",
            modelId: chosen?.model ?? "",
          }));
          // 表单刚和服务端对齐，此刻没有未保存的东西。
          setDirty(false);
        } catch (error) { setErr(String(error.message || error)); }
      }, []);

      const loadMemes = useCallback(async () => {
        try {
          const res = await fetch(API + "/memes", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setMemes(data);
        } catch { /* the panel keeps the previous snapshot */ }
      }, []);

      const loadLife = useCallback(async () => {
        try {
          const res = await fetch(API + "/life", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setLife(data);
        } catch { /* keep the previous snapshot */ }
      }, []);

      const loadQzone = useCallback(async () => {
        try {
          const res = await fetch(API + "/qzone/proactive", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setQzone(data);
        } catch { /* keep the previous snapshot */ }
      }, []);

      const loadMemory = useCallback(async () => {
        try {
          const res = await fetch(API + "/memory", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setMemory(data);
        } catch { /* keep the previous snapshot */ }
      }, []);

      const loadEmotion = useCallback(async () => {
        try {
          const res = await fetch(API + "/emotion", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setEmotion(data);
        } catch { /* keep the previous snapshot */ }
      }, []);

      const loadTargets = useCallback(async () => {
        try {
          const res = await fetch(API + "/life/targets", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setTargets(data.conversations ?? []);
        } catch { /* keep the previous list */ }
      }, []);
      const saveTargets = async () => {
        setBusy(true); setErr(""); setMsg("");
        try {
          // 只把勾上的发过去。服务端拿到的就是完整的目标列表，
          // 取消勾选等于从列表里移除，不需要额外的删除语义。
          const picked = targets
            .filter((t) => t.selected === true)
            .map((t) => ({ kind: t.kind, peerId: t.peerId, enabled: t.enabled !== false }));
          const res = await fetch(API + "/life/targets", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ targets: picked }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "保存失败");
          setMsg("已保存 " + data.saved + " 个会话");
          await loadTargets();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };


      useEffect(() => { ensureCss(); load(); loadMemes(); loadLife(); loadTargets(); loadQzone(); loadEmotion(); loadMemory(); }, [load, loadMemes, loadLife, loadTargets, loadQzone, loadEmotion, loadMemory]);

      // 关页面/刷新前的二次确认。面板很长，用户改了上面的设置后
      // 往往滚不到底部，看不到那个「有未保存的修改」。
      useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
      }, [dirty]);

      // 只影响界面、不进入保存请求的字段。改它们不该提示「有未保存的修改」。
      //
      // 目前只有一个：memeFolder 是「导入文件夹」按钮的临时参数，
      // 传完就丢，不写进 config.json。
      //
      // 其余看起来像「界面开关」的（modelFollowDefault、retentionForever、
      // emUseModel 这些）都别加进来 —— 它们虽然只控制显示哪个输入框，
      // 但会改变实际提交的值，改了必须保存。
      const TRANSIENT_FIELDS = new Set(['memeFolder', 'neverEvict']);

      // 所有表单修改都走这里，所以只在这一处置脏标记。
      const patch = (key) => (value) => {
        if (!TRANSIENT_FIELDS.has(key)) setDirty(true);
        setForm((prev) => ({ ...prev, [key]: value }));
      };

      const save = async () => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const body = {
            patch: {
              reply: {
                private: form.replyPrivate,
                group: form.replyGroup,
                smartThreshold: Math.round(Math.min(10, Math.max(1, Number(form.smartThreshold) || 3))),
                selfNames: String(form.selfNames || "").split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10),
                interests: String(form.interests || "").split(/[,，\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 100),
                learnInterests: Boolean(form.learnInterests),
                linkParse: Boolean(form.linkParse),
                linkMaxImages: Math.round(Math.min(20, Math.max(0, Number(form.linkMaxImages) || 0))),
                // 0 是「永不回收」的哨兵值，必须原样发出去。
                idleMs: (() => {
                  const raw = Number(form.idleMinutes);
                  if (!Number.isFinite(raw) || raw <= 0) return 0;
                  return Math.round(Math.min(1440, Math.max(1, raw)) * 60000);
                })(),
                contextMessages: Math.round(Math.min(100, Math.max(0, Number(form.contextMessages) || 0))),
                maxLiveSessions: Math.round(Math.min(1000, Math.max(1, Number(form.maxLiveSessions) || 64))),
              },
              access: {
                privateMode: form.privateMode,
                privateIds: splitIds(form.privateIds),
                groupMode: form.groupMode,
              },
              ownerIds: splitIds(form.ownerIds),
              life: {
                enabled: Boolean(form.lifeEnabled),
                inject: Boolean(form.lifeInject),
                proactive: Boolean(form.lifeProactive),
                proactivePrivate: Boolean(form.lifeProactivePrivate),
                proactiveGroup: Boolean(form.lifeProactiveGroup),
                proactiveMaxPerDay: Math.round(Math.min(12, Math.max(0, Number(form.lifeMaxPerDay) || 0))),
                proactiveMinGapMinutes: Math.round(Math.min(720, Math.max(10, Number(form.lifeMinGap) || 90))),
                proactiveJitterMinutes: Math.round(Math.min(240, Math.max(0, Number(form.lifeJitter) || 0))),
                proactiveGraceMinutes: Math.round(Math.min(180, Math.max(5, Number(form.lifeGrace) || 30))),
                proactiveHint: String(form.lifeHint ?? '').trim().slice(0, 500),
              },
              weather: (() => {
                // 和风的 API Key 是 32 位十六进制或类似短串，绝不可能是一段文字。
                // 之前这里直接把输入框内容塞进 apiKey，结果人格设定被当成 key 存进去，
                // 存进去之后面板显示「已保存」，看起来完全正常，实际整个 weather 段是坏的。
                // 所以这里做一次形状校验：不像 key 就不发，让它保留原来的值。
                const raw = String(form.wxKey ?? '').trim();
                const base = {
                  enabled: Boolean(form.wxEnabled),
                  apiHost: String(form.wxHost ?? '').trim(),
                  city: String(form.wxCity ?? '').trim() || '华盛顿',
                  latitude: Number.isFinite(Number(form.wxLat)) ? Number(form.wxLat) : 38.90,
                  longitude: Number.isFinite(Number(form.wxLon)) ? Number(form.wxLon) : -77.04,
                };
                if (!raw) return base;
                if (!/^[A-Za-z0-9._-]{8,128}$/.test(raw)) {
                  throw new Error('API Key 格式不对：应当是一串字母数字（不含空格和换行），长度 8–128');
                }
                return { ...base, apiKey: raw };
              })(),
              qzoneProactive: {
                enabled: Boolean(form.qzEnabled),
                maxPerDay: Math.round(Math.min(6, Math.max(0, Number(form.qzMaxPerDay) || 0))),
                // 空输入回退到 100（默认），而不是 0：0 是「永不发」这个明确选择，
                // 不该被一个没填的输入框意外选中。
                dailyChance: Number.isFinite(Number(form.qzDailyChance)) && String(form.qzDailyChance).trim() !== ''
                  ? Math.round(Math.min(100, Math.max(0, Number(form.qzDailyChance))))
                  : 100,
                timeTone: Boolean(form.qzTimeTone),
                windowStart: String(form.qzWindowStart || "08:00"),
                windowEnd: String(form.qzWindowEnd || "23:00"),
                minGapMinutes: Math.round(Math.min(1440, Math.max(30, Number(form.qzMinGap) || 180))),
                topic: String(form.qzTopic || "").slice(0, 500),
                useLife: Boolean(form.qzUseLife),
                allowDetails: Boolean(form.qzAllowDetails),
              },
              emotion: {
                enabled: Boolean(form.emEnabled),
                perSession: Boolean(form.emPerSession),
                useModel: Boolean(form.emUseModel),
                provider: String(form.emProvider || "").trim(),
                model: String(form.emModel || "").trim(),
                inject: Boolean(form.emInject),
                privacyLevel: Math.round(Math.min(2, Math.max(0, Number(form.emPrivacy) || 0))),
                significanceThreshold: Math.round(Math.min(30, Math.max(1, Number(form.emThreshold) || 5))),
              },
              memory: {
                enabled: Boolean(form.memEnabled),
                inject: Boolean(form.memInject),
                useModel: Boolean(form.memUseModel),
                halfLifeDays: Math.round(Math.min(3650, Math.max(1, Number(form.memHalfLife) || 30))),
                recallLimit: Math.round(Math.min(20, Math.max(0, Number(form.memRecall) || 0))),
                factLimit: Math.round(Math.min(20, Math.max(0, Number(form.memFacts) || 0))),
                minScore: Math.min(1, Math.max(0, Number(form.memMinScore) || 0)),
                dailyQuota: Math.round(Math.min(100, Math.max(0, Number(form.memQuota) || 0))),
              },
              memes: {
                enabled: Boolean(form.memesEnabled),
                autoCollect: Boolean(form.memesAutoCollect),
                requireApproval: Boolean(form.memesRequireApproval),
                visionClassify: Boolean(form.memesVision),
                autoSend: Boolean(form.memesAutoSend),
                autoSendChance: Math.min(1, Math.max(0, Number(form.memesAutoSendChance) || 0)),
              },
              // null clears the field, which makes the plugin follow the Host default.
              model: form.modelFollowDefault || !form.modelProvider || !form.modelId
                ? null
                : { provider: form.modelProvider, model: form.modelId },
              persona: form.persona,
              // Clamp and round here: the backend requires a strict integer in 1..3650 and
              // an emptied field would otherwise fail the entire save.
              // 0 是后端约定的「永久保存」哨兵值；勾选后忽略输入框里的天数。
              retentionDays: form.retentionForever
                ? 0
                : Math.round(Math.min(3650, Math.max(1, Number(form.retentionDays) || 30))),
              napcat: { mode: form.napcatMode, webuiPort: Number(form.webuiPort) },
              poll: {
                enabled: Boolean(form.pollEnabled),
                intervalMs: Math.round(Math.min(3600, Math.max(15, Number(form.pollSeconds) || 60)) * 1000),
              },
              rate: {
                segmentMinMs: Math.round(Math.min(30, Math.max(0, Number(form.segmentMinSec) || 0)) * 1000),
                segmentMaxMs: Math.round(Math.min(60, Math.max(0, Number(form.segmentMaxSec) || 0)) * 1000),
                segmentPerCharMs: Math.round(Math.min(500, Math.max(0, Number(form.segmentPerCharMs) || 0))),
              },
            },
          };
          const res = await fetch(API + "/config", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "保存失败");
          setMsg(data.hot ? "已保存并即时生效" : "已保存；NapCat 相关改动需重载插件后生效");
          // 保存后不能直接 load()：那会把整个 form 重置，用户刚填的 API Key 立刻被清空。
          // 服务端本来也不会回传明文 key，所以重载只会让输入框变空，看起来像没保存成功。
          // 这里只把「已保存」标记更新一下，输入框内容保留到用户自己改。
          if (form.wxKey && String(form.wxKey).trim()) setForm((f) => ({ ...f, wxHasKey: true, wxKey: "" }));
          await load({ keepSecrets: true });
          // 保存成功后服务端已经是新值，标脏就该清掉。
          setDirty(false);
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const openLogin = async () => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/napcat/open", { method: "POST", credentials: "same-origin" });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "无法打开登录页");
          setMsg((data.opened ? "已打开登录页：" : "请手动打开：") + data.url);
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      if (!form) return h("div", { className: "qqa" }, h("h2", null, "QQ 接入"), err ? h("div", { className: "msg err" }, err) : h("p", { className: "sub" }, "读取中…"));

      // Live preview of the resulting delay so the numbers stay meaningful.
      const seconds = (value) => { const num = Number(value); return Number.isFinite(num) ? num : 0; };
      const gapFor = (text) => {
        const min = Math.min(seconds(form.segmentMinSec), seconds(form.segmentMaxSec)) * 1000;
        const max = Math.max(seconds(form.segmentMinSec), seconds(form.segmentMaxSec)) * 1000;
        const perChar = Math.max(0, seconds(form.segmentPerCharMs));
        return (Math.min(max, Math.max(min, min + [...String(text)].length * perChar)) / 1000).toFixed(1);
      };

      // Everything the picker needs, derived once per render.
      const providerGroups = catalog.groups ?? [];
      const providerNames = providerGroups.map((g) => g.id);
      const activeProvider = providerNames.includes(form.modelProvider)
        ? form.modelProvider
        : (providerGroups[0]?.id ?? "");
      const modelsForProvider = providerGroups.find((g) => g.id === activeProvider)?.models ?? [];
      const activeModel = modelsForProvider.some((m) => m.id === form.modelId)
        ? form.modelId
        : (modelsForProvider[0]?.id ?? "");
      const defaultLabel = catalog.default && catalog.default.provider
        ? catalog.default.provider + " / " + catalog.default.model
        : "（未设置）";
      const totalModels = providerGroups.reduce((sum, g) => sum + g.models.length, 0);

      const memeStats = memes && memes.enabled ? memes.stats : null;
      const lifeAction = async (action, extra = {}) => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/life/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || data.reason || "操作失败");
          setMsg(action === "generate"
            ? "生成完成：" + data.counts.days + " 天 · " + data.counts.outfits + " 套穿搭 · " + data.counts.meals + " 条餐食"
            : "已完成");
          await loadLife();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };
      /**
       * 立刻触发一次主动消息。
       *
       * 平时它只在日程窗口到点后才发，而窗口基本都在晚上 —— 想验证一次要等半天。
       * 这个按钮走的是同一个 tickProactive，只是塞了一个「现在到期」的假窗口，
       * 所以配额、最小间隔、目标筛选照样生效，测出来的结果就是线上的真实行为。
       */
      const testProactive = async () => {
        setBusy(true); setErr(""); setMsg(""); setProactiveTest(null);
        try {
          const res = await fetch(API + "/life/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "test-proactive" }),
          });
          const data = await res.json();
          if (!data.ok) {
            // 没发出去也有原因可看（没到窗口 / 额度用完 / 间隔不够），
            // 所以这里不抛错，把 reason 显示出来更有用。
            setProactiveTest({ ok: false, reason: data.reason, detail: data.detail, error: data.error });
          } else {
            setProactiveTest({ ok: true, segments: data.segments, text: data.text, after: data.after });
            await loadLife();
          }
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };


      const qzoneAction = async (action, extra = {}) => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/qzone/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "操作失败");
          if (action === "post") {
            // status 决定用哪种语气报结果：uncertain 绝不能显示成「已发布」。
            setMsg(data.status === "sent"
              ? "已发布并确认出现在空间：" + data.text
              : data.status === "uncertain"
                ? "已提交但没能在列表里确认，请到空间核对后再决定是否重发：" + data.text
                : "发布未成功：" + data.text);
          } else {
            setMsg("已清空动态记录");
          }
          await loadQzone();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const memoryAction = async (action, extra = {}) => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/memory/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "操作失败");
          setMsg(action === "forget" ? "已忘掉这条" : "已记住");
          await loadMemory();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const emotionAction = async (action, extra = {}) => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/emotion/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "操作失败");
          setMsg(action === "reset" ? "已重置该档案" : "已更新：好感 " + data.favor + " / 亲密 " + data.intimacy + " / " + data.stage);
          await loadEmotion();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const memeAction = async (action, extra = {}) => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/memes/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action, ...extra }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || data.reason || "操作失败");
          const summary = action === "import"
            ? "导入完成：扫描 " + data.scanned + " 张，新增 " + data.added + " 张"
            : action === "classify"
              ? "分类完成：" + data.classified + " 张" + (data.remaining ? "，还剩 " + data.remaining + " 张" : "")
              : "已完成";
          setMsg(summary);
          await loadMemes();
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const napcat = state && state.napcat;
      const online = Boolean(state && state.connected);

      return h("div", { className: "qqa" },
        h("div", { className: "row" },
          h("div", null,
            h("h2", null, "QQ 接入"),
            h("p", { className: "sub" },
              (state.nickname ? state.nickname + "（" + (state.selfId || "-") + "）" : "账号 " + (state.selfId || "-"))
              + " · NapCat " + (napcat ? (napcat.version || "") + " · " + (napcat.state || "-") : "-")),
          ),
          h("div", { className: "row" },
            h("span", { className: "badge " + (online ? "ok" : "bad") }, online ? "在线" : "未连接"),
            h("button", { className: "ghost", onClick: () => load(), disabled: busy }, "刷新"),
          ),
        ),

        h(Card, { title: "模型" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "跟随宿主默认"),
              h("div", { className: "hint" }, "开启时使用 DSH 全局默认模型（当前：" + defaultLabel + "）；关闭后可任选下面列出的任意模型")),
            h(Switch, {
              checked: form.modelFollowDefault,
              onChange: (v) => patch("modelFollowDefault")(v),
            }),
          ),
          form.modelFollowDefault ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "服务商"),
              h("div", { className: "hint" }, "共 " + providerGroups.length + " 个可用服务商，合计 " + totalModels + " 个模型")),
            h("select", {
              value: activeProvider,
              onChange: (e) => patch("modelProvider")(e.target.value),
            }, providerGroups.map((g) => h("option", { key: g.id, value: g.id }, g.name + "（" + g.models.length + "）"))),
          ),
          form.modelFollowDefault ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "模型"),
              h("div", { className: "hint" }, "列表来自宿主实时目录，服务商增删模型无需更新插件")),
            h("select", {
              value: activeModel,
              onChange: (e) => patch("modelId")(e.target.value),
            }, modelsForProvider.map((m) => h("option", { key: m.id, value: m.id }, m.name === m.id ? m.id : m.name + "（" + m.id + "）"))),
          ),
          (catalog.failures ?? []).length
            ? h("div", { className: "hint" }, "部分服务商读取失败：" + catalog.failures.map((f) => f.name + "（" + f.message + "）").join("；"))
            : null,
          providerGroups.length === 0
            ? h("div", { className: "hint" }, "宿主未返回任何可用模型；此时只能跟随默认。")
            : null,
          h("div", { className: "hint" }, "切换模型后保存即生效：插件会丢弃已缓存的会话，下一条消息用新模型重开。"),
        ),

        h(Card, { title: "自动回复" },
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "私聊自动回复"), h("div", { className: "hint" }, "关闭后仍会归档消息，只是不再自动生成回复")),
            h(Switch, { checked: form.replyPrivate, onChange: patch("replyPrivate") }),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "群聊回复"), h("div", { className: "hint" }, "智能 = 被 @ / 被引用 / 被叫名字，或内容她感兴趣时才回")),
            h("select", { value: form.replyGroup, onChange: (e) => patch("replyGroup")(e.target.value) },
              h("option", { value: "off" }, "不回复（只归档）"),
              h("option", { value: "mention" }, "仅被 @ 时回复"),
              h("option", { value: "smart" }, "智能判断（推荐）"),
              h("option", { value: "all" }, "每条都回复"),
            ),
          ),
          form.replyGroup === "smart"
            ? h("div", null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "回复阈值"), h("div", { className: "hint" }, "分数达到才回；调高更安静，调低更爱说话（1–10）")),
                  h("input", { type: "number", min: 1, max: 10, value: form.smartThreshold, onChange: (e) => patch("smartThreshold")(e.target.value) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "她的名字"), h("div", { className: "hint" }, "被叫到这些名字就回，逗号分隔；QQ 号总是算在内")),
                  h("input", { type: "text", placeholder: "小鱼, 小助手", value: form.selfNames, onChange: (e) => patch("selfNames")(e.target.value) }),
                ),
                h("div", { className: "hint" }, "感兴趣的话题词（逗号或换行分隔；留空用内置默认表）"),
                h("textarea", {
                  value: form.interests,
                  onChange: (e) => patch("interests")(e.target.value),
                  placeholder: "游戏, 动漫, 电影, 编程, 考试, 吃饭, 猫, 天气",
                }),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "从对话里学习兴趣"), h("div", { className: "hint" }, "她回过的群消息里出现的话题会加权，随时间衰减")),
                  h(Switch, { checked: form.learnInterests, onChange: (v) => patch("learnInterests")(v) }),
                ),
                state && state.groupGate
                  ? h("div", { className: "hint" },
                      "已判定 " + state.groupGate.counts.considered + " 条 · 回复 " + state.groupGate.counts.replied +
                      " · 跳过 " + state.groupGate.counts.skipped +
                      " · 学到 " + state.groupGate.learnedTopics + " 个话题" +
                      (state.groupGate.last
                        ? "｜最近一条：" + (state.groupGate.last.reply ? "回复" : "跳过") +
                          "（score=" + state.groupGate.last.score + "，" + state.groupGate.last.detail + "）"
                        : ""))
                  : null,
              )
            : null,
        ),

        h(Card, { title: "链接解析" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "解析聊天里的链接"),
              h("div", { className: "hint" }, "识别 B站 / 小黑盒 / X / 小红书 / YouTube / Instagram，把标题、封面和图集发出来；视频只发链接，不下载文件")),
            h(Switch, { checked: form.linkParse, onChange: (v) => patch("linkParse")(v) }),
          ),
          form.linkParse ? h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "最多图片数"),
              h("div", { className: "hint" }, "图集最多发几张，0 = 只发文字和链接")),
            h("input", {
              type: "number", min: 0, max: 20, value: form.linkMaxImages,
              onChange: (e) => patch("linkMaxImages")(e.target.value),
            }),
          ) : null,
          h("div", { className: "hint" }, "解析结果会同时作为上下文交给模型，她知道链接里是什么。读取失败时只发原链接。"),
        ),

        h(Card, { title: "虚拟人生" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "启用虚拟人生"),
              h("div", { className: "hint" }, "给她一份连续的日程、穿搭和三餐；生成一次按周循环，不每天调用模型")),
            h(Switch, { checked: form.lifeEnabled, onChange: (v) => patch("lifeEnabled")(v) }),
          ),
          !form.lifeEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "把当前状态注入对话"),
              h("div", { className: "hint" }, "聊天时她知道「现在在干嘛、穿什么、吃什么」，不额外调用模型")),
            h(Switch, { checked: form.lifeInject, onChange: (v) => patch("lifeInject")(v) }),
          ),
          !form.lifeEnabled ? null : h("div", { className: "hint" },
            life && life.snapshot && life.snapshot.ready
              ? "已生成：" + life.snapshot.counts.days + " 天日程 · " + life.snapshot.counts.outfits + " 套穿搭 · " + life.snapshot.counts.meals + " 条餐食"
              : "还没有生成日程"),
          !form.lifeEnabled ? null : h("div", { className: "row" },
            h("button", { className: "ghost", onClick: () => lifeAction("generate", { force: true }), disabled: busy }, busy ? "生成中…" : "生成 / 重新生成"),
            h("button", { className: "ghost", onClick: loadLife, disabled: busy }, "刷新"),
            h("button", { className: "ghost", onClick: () => lifeAction("clear"), disabled: busy }, "清空"),
          ),
          // 本周安排：默认整块折叠，标题下面什么都不显示。
          // 主题摘要是 7 个短语连成一行，也很长，所以一起收进去。
          !form.lifeEnabled || !life || !life.snapshot || !life.snapshot.ready ? null : h("div", null,
            h("div", { className: "row" },
              h("div", { className: "lbl" }, "本周安排"),
              h("button", { className: "ghost", onClick: () => setWeekOpen((v) => !v) }, weekOpen ? "收起" : "展开"),
            ),
            !weekOpen ? null : h("div", { style: { marginTop: "8px" } },
              h("div", { className: "hint", style: { marginBottom: "10px" } },
                Object.values(life.snapshot.week ?? {}).map((d) => d.theme).join(" · ")),
              ["0","1","2","3","4","5","6"].map((idx) => {
                const day = life.snapshot.week?.[idx];
                if (!day) return null;
                const name = ["周一","周二","周三","周四","周五","周六","周日"][Number(idx)];
                return h("div", { key: idx, style: { marginBottom: "12px" } },
                  h("div", { className: "lbl" }, name + " · " + (day.theme || "") + " · " + (day.mood || "")),
                  h("div", { className: "hint" }, (day.timeline ?? []).map((item) => {
                    const start = String(Math.floor(item.start / 60)).padStart(2, "0") + ":" + String(item.start % 60).padStart(2, "0");
                    const endRaw = item.end >= 1440 ? "24:00" : String(Math.floor(item.end / 60)).padStart(2, "0") + ":" + String(item.end % 60).padStart(2, "0");
                    return start + "-" + endRaw + " " + item.activity + (item.location ? "（" + item.location + "）" : "");
                  }).join("　")),
                  (day.proactiveWindows ?? []).length
                    ? h("div", { className: "hint" }, "想说话：" + day.proactiveWindows.map((w) => w.at + " " + (w.intent || "")).join("；"))
                    : null,
                );
              }),
            ),
          ),
          !form.lifeEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "按真实天气生成"),
              h("div", { className: "hint" }, "接和风天气，把未来一周的实际温度和阴晴写进生成提示词。不开就只能按月份猜，容易出现大晴天穿羽绒服")),
            h(Switch, { checked: form.wxEnabled, onChange: (v) => patch("wxEnabled")(v) }),
          ),
          !form.lifeEnabled || !form.wxEnabled ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "API Host"), h("div", { className: "hint" }, "控制台-设置里那个 xxx.qweatherapi.com，公共域名正在停用")),
            h("input", { type: "text", placeholder: "abcxyz.qweatherapi.com", value: form.wxHost, onChange: (e) => patch("wxHost")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.wxEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "API Key"),
              h("div", { className: "hint" }, form.wxHasKey ? "已保存。留空保存表示不改；要换就填新的" : "控制台-项目管理里创建，用 X-QW-Api-Key 认证，不用 JWT")),
            h("input", { type: "password", placeholder: form.wxHasKey ? "已保存（留空不改）" : "粘贴你的 API Key", value: form.wxKey, onChange: (e) => patch("wxKey")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.wxEnabled ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "城市"), h("div", { className: "hint" }, "只用于提示词里点名，实际查询用下面的经纬度")),
            h("input", { type: "text", value: form.wxCity, onChange: (e) => patch("wxCity")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.wxEnabled ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "纬度 / 经度"), h("div", { className: "hint" }, "默认是华盛顿白宫，一个公开地标，不代表任何真实住址。和风 v1 接口按坐标查，最多两位小数；换成你自己的位置")),
            h("div", { style: { display: "flex", gap: "8px" } },
              h("input", { type: "number", step: "0.01", value: form.wxLat, onChange: (e) => patch("wxLat")(e.target.value) }),
              h("input", { type: "number", step: "0.01", value: form.wxLon, onChange: (e) => patch("wxLon")(e.target.value) }),
            ),
          ),
          !form.lifeEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "主动消息"),
              h("div", { className: "hint" }, "按日程里的「想说点什么」窗口主动发消息，走现有的轮询，不新增定时器")),
            h(Switch, { checked: form.lifeProactive, onChange: (v) => patch("lifeProactive")(v) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "允许私聊主动")),
            h(Switch, { checked: form.lifeProactivePrivate, onChange: (v) => patch("lifeProactivePrivate")(v) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "允许群聊主动"), h("div", { className: "hint" }, "默认关闭：群聊里没人叫你就不该说话")),
            h(Switch, { checked: form.lifeProactiveGroup, onChange: (v) => patch("lifeProactiveGroup")(v) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "每天最多几次"), h("div", { className: "hint" }, "一次算一条完整的主动消息。如果被拆成几段发，仍然只算一次")),
            h("input", { type: "number", min: 0, max: 12, value: form.lifeMaxPerDay, onChange: (e) => patch("lifeMaxPerDay")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "最小间隔（分钟）"), h("div", { className: "hint" }, "两次主动消息之间至少隔这么久")),
            h("input", { type: "number", min: 10, max: 720, value: form.lifeMinGap, onChange: (e) => patch("lifeMinGap")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "时间随机幅度（分钟）"), h("div", { className: "hint" }, "日程里写的「大概这个点」前后浮动多少。0 = 精确按日程；同一天固定，不会因为轮询而越来越早")),
            h("input", { type: "number", min: 0, max: 240, value: form.lifeJitter, onChange: (e) => patch("lifeJitter")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "到点后多久内补发（分钟）"), h("div", { className: "hint" }, "随机化之后窗口是一个区间。过了这个宽度还没轮询到，这条就跳过，不补发")),
            h("input", { type: "number", min: 5, max: 180, value: form.lifeGrace, onChange: (e) => patch("lifeGrace")(e.target.value) }),
          ),
          // 立即测试：日程窗口基本都在晚上，想验证一次要等半天。
          // 这个按钮走同一个 tickProactive，只是把窗口当成「现在到期」，
          // 配额和最小间隔照样生效，所以测出来就是线上的真实行为。
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", null,
            h("div", { className: "row" },
              h("div", null,
                h("div", { className: "lbl" }, "立即测试"),
                h("div", { className: "hint" }, "马上发一条，不用等日程窗口。会占用当天的次数和最小间隔")),
              h("button", { className: "ghost", onClick: testProactive, disabled: busy }, busy ? "发送中…" : "发一条试试"),
            ),
            !proactiveTest ? null : h("div", { className: "hint", style: { marginTop: "6px" } },
              proactiveTest.ok
                ? "已发出 " + (proactiveTest.segments?.length ?? 1) + " 条：" + (proactiveTest.segments ?? [proactiveTest.text]).join(" / ")
                : "没发出去（" + (proactiveTest.reason || proactiveTest.error) + "）" + (proactiveTest.detail ? "：" + proactiveTest.detail : ""),
            ),
          ),
          // 内容方向：长期约束她主动说话的主题和方式。
          // 和日程里的 intent 是两层 —— intent 决定今天为什么想说话，
          // 这里决定她平时怎么说话。留空就完全按日程走。
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", null,
            h("div", { className: "lbl" }, "内容方向"),
            h("div", { className: "hint" }, "她主动说话时长期遵循的偏好，比如「多聊生活小事，别总问我在干嘛」。留空就只按日程里的念头写"),
            h("textarea", {
              value: form.lifeHint,
              maxLength: 500,
              placeholder: "例：多分享自己遇到的小事，不要每次都用问句结尾",
              onChange: (e) => patch("lifeHint")(e.target.value),
              style: { minHeight: "60px" },
            }),
          ),
          // 运行状态：今天发了几次、还剩几次、下次窗口几点。
          // 这几个数字是「她为什么不主动说话」的第一现场，
          // 之前只能翻 debug.log，现在直接显示在面板上。
          !form.lifeEnabled || !form.lifeProactive ? null : (() => {
            const st = state?.proactive;
            if (!st) return null;
            if (!st.enabled) return h("div", { className: "hint" }, "主动消息未启用");
            const last = st.lastSentAt ? new Date(st.lastSentAt).toLocaleString("zh-CN") : "还没发过";
            const wins = (st.windowsToday ?? []).length ? st.windowsToday.join("、") : "今天没有安排";
            return h("div", { className: "hint", style: { marginTop: "8px", lineHeight: "20px" } },
              "今天已发 " + st.sentToday + " / " + st.maxPerDay + " 次，还剩 " + st.remaining + " 次",
              h("br"),
              "今天的窗口：" + wins + "（到点后 " + st.graceMinutes + " 分钟内有效）",
              h("br"),
              "上次发送：" + last,
              h("br"),
              "目标：" + ((st.targets ?? []).length ? st.targets.join("、") : "没有勾选任何会话"),
            );
          })(),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", null,
            h("div", { className: "lbl" }, "主动消息会话"),
            h("div", { className: "hint" }, "只有勾选的会话才会收到主动消息；不勾就是完全不会打扰。列表来自本地归档。"),
            !targets.length
              ? h("div", { className: "hint" }, "还没有可选的会话——先和她聊几句，再回来刷新。")
              : h("div", null, targets.slice(0, 30).map((t, idx) => h("div", { key: t.kind + ":" + t.peerId, className: "row" },
                  h("div", null,
                    h("div", { className: "lbl" }, (t.kind === "group" ? "群 " : "私聊 ") + t.peerId),
                    h("div", { className: "hint" }, t.lastAt ? "最近活跃 " + new Date(t.lastAt).toLocaleString() : "无活跃记录")),
                  h("div", { className: "row" },
                    h(Switch, {
                      checked: t.selected === true,
                      onChange: (v) => setTargets((prev) => prev.map((x, i) => i === idx ? { ...x, selected: v, enabled: v } : x)),
                    }),
                  ),
                ))),
            h("button", { className: "ghost", onClick: loadTargets, disabled: busy }, "刷新会话列表"),
            h("button", { className: "ghost", onClick: saveTargets, disabled: busy }, "保存勾选"),
          ),
        ),

        h(Card, { title: "主动发动态" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "自动发 QQ 空间说说"),
              h("div", { className: "hint" }, "在下面的时间窗内，由模型自己写一条日常说说发出去。需要 QQ 空间功能可用。")),
            h(Switch, { checked: form.qzEnabled, onChange: (v) => patch("qzEnabled")(v) }),
          ),
          form.qzEnabled
            ? h("div", null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "每天最多几条"), h("div", { className: "hint" }, "0 = 关闭；1–6")),
                  h("input", { type: "number", min: 0, max: 6, value: form.qzMaxPerDay, onChange: (e) => patch("qzMaxPerDay")(e.target.value) }),
                ),
                h("div", { className: "row" },
                  h("div", null,
                    h("div", { className: "lbl" }, "每日发送概率"),
                    h("div", { className: "hint" }, "每天先抽一次签，抽中才按下面的时间窗发。100% = 每天都发，0% = 永不发。")),
                  h("div", { style: { display: "flex", gap: "8px", alignItems: "center" } },
                    h("input", {
                      type: "range", min: 0, max: 100, step: 5,
                      value: form.qzDailyChance,
                      onChange: (e) => patch("qzDailyChance")(e.target.value),
                      style: { width: "150px" },
                    }),
                    h("span", { style: { minWidth: "42px", textAlign: "right" } }, String(form.qzDailyChance ?? 100) + "%"),
                  ),
                ),
                h("div", { className: "row" },
                  h("div", { className: "hint" }, "快捷："),
                  h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
                    [100, 70, 50, 30, 10].map((v) =>
                      h("button", {
                        key: "chance-" + v,
                        className: "ghost",
                        onClick: () => patch("qzDailyChance")(v),
                        style: { height: "24px", padding: "0 8px", fontSize: "11.5px" },
                      }, v + "%")),
                  ),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "时间窗"), h("div", { className: "hint" }, "只在开始到结束之间发，避免凌晨发动态")),
                  h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
                    h("input", { type: "text", placeholder: "08:00", value: form.qzWindowStart, onChange: (e) => patch("qzWindowStart")(e.target.value) }),
                    h("span", { className: "hint" }, "→"),
                    h("input", { type: "text", placeholder: "23:00", value: form.qzWindowEnd, onChange: (e) => patch("qzWindowEnd")(e.target.value) }),
                  ),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "最小间隔（分钟）"), h("div", { className: "hint" }, "两条动态之间至少隔这么久")),
                  h("input", { type: "number", min: 30, max: 1440, value: form.qzMinGap, onChange: (e) => patch("qzMinGap")(e.target.value) }),
                ),
                h("div", { className: "row" },
                  h("div", null,
                    h("div", { className: "lbl" }, "按时间调整内容"),
                    h("div", { className: "hint" }, "语气跟随发布时段：清晨、中午、傍晚、深夜各写各的，避免半夜发「早安」。")),
                  h(Switch, { checked: form.qzTimeTone, onChange: (v) => patch("qzTimeTone")(v) }),
                ),
                form.qzTimeTone && qzone && qzone.snapshot && qzone.snapshot.tone
                  ? h("div", { className: "hint" },
                      "当前时段：" + qzone.snapshot.tone.label + "（" + qzone.snapshot.tone.window + "）— " + qzone.snapshot.tone.mood)
                  : null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "用当前生活状态当素材"), h("div", { className: "hint" }, "把今天在做什么、穿搭、三餐作为写动态的参考")),
                  h(Switch, { checked: form.qzUseLife, onChange: (v) => patch("qzUseLife")(v) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "允许提到具体地点"), h("div", { className: "hint" }, "关闭后只说「在外面」这类模糊说法")),
                  h(Switch, { checked: form.qzAllowDetails, onChange: (v) => patch("qzAllowDetails")(v) }),
                ),
                h("div", { className: "hint" }, "内容方向（可留空）"),
                h("textarea", {
                  value: form.qzTopic,
                  onChange: (e) => patch("qzTopic")(e.target.value),
                  placeholder: "比如：最近在学做饭，偶尔吐槽加班，喜欢拍天空",
                }),
              )
            : null,
          qzone && qzone.snapshot
            ? h("div", null,
                h("div", { className: "hint" },
                  qzone.snapshot.daily
                    ? "今日抽签：" + qzone.snapshot.daily.chance + "% 概率，掷出 " + qzone.snapshot.daily.value + " → " +
                      (qzone.snapshot.daily.pass ? "今天发" : "今天跳过（不补发）")
                    : null),
                h("div", { className: "hint" },
                  "今天 " + qzone.snapshot.today + " 的计划：" +
                  (qzone.snapshot.slots.length
                    ? qzone.snapshot.slots.map((s) => s.at + (s.tone ? "「" + s.tone.label + "」" : "") + (s.fired ? "（已发）" : "")).join(" · ")
                    : "无（时间窗太窄或每天条数为 0）")),
                qzone.snapshot.pending
                  ? h("div", { className: "hint" }, "有一条待确认的动态（第 " + qzone.snapshot.pending.attempts + " 次尝试）：" + qzone.snapshot.pending.text)
                  : null,
                qzone.snapshot.history.length
                  ? h("div", null,
                      h("div", { className: "hint" }, "最近发布："),
                      qzone.snapshot.history.slice(0, 5).map((item) =>
                        h("div", { className: "hint", key: item.at + item.slotId },
                          "· [" + item.status + "] " + item.text)),
                    )
                  : h("div", { className: "hint" }, "还没有发布记录。"),
              )
            : null,
          h("div", { className: "row" },
            h("button", { className: "ghost", onClick: () => qzoneAction("post"), disabled: busy }, busy ? "发送中…" : "立即发一条"),
            h("button", { className: "ghost", onClick: loadQzone, disabled: busy }, "刷新"),
            h("button", { className: "ghost", onClick: () => qzoneAction("clear"), disabled: busy }, "清空记录"),
          ),
          h("div", { className: "hint" }, "「立即发一条」用的是同一套生成与确认流程，不会占用今天还没到点的计划槽位。"),
        ),

        h(Card, { title: "情感与关系" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "启用情感系统"),
              h("div", { className: "hint" }, "记录每个人对你的好感与亲密度，分四阶段演进；她的语气会随之变化。")),
            h(Switch, { checked: form.emEnabled, onChange: (v) => patch("emEnabled")(v) }),
          ),
          form.emEnabled
            ? h("div", null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "注入到对话里"), h("div", { className: "hint" }, "关闭后仍然记录，但聊天时她不会考虑当前关系")),
                  h(Switch, { checked: form.emInject, onChange: (v) => patch("emInject")(v) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "用模型判断变化"), h("div", { className: "hint" }, "关闭则用关键词启发式，省一次模型调用但更粗糙")),
                  h(Switch, { checked: form.emUseModel, onChange: (v) => patch("emUseModel")(v) }),
                ),
                form.emUseModel
                  ? h("div", { className: "row" },
                      h("div", null, h("div", { className: "lbl" }, "分析模型"), h("div", { className: "hint" }, "留空沿用主模型")),
                      h("div", { style: { display: "flex", gap: "6px" } },
                        h("input", { type: "text", placeholder: "provider", value: form.emProvider, onChange: (e) => patch("emProvider")(e.target.value) }),
                        h("input", { type: "text", placeholder: "model", value: form.emModel, onChange: (e) => patch("emModel")(e.target.value) }),
                      ),
                    )
                  : null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "隐私级别"), h("div", { className: "hint" }, "0=完全不注入 1=只给阶段 2=连数值一起")),
                  h("select", { value: form.emPrivacy, onChange: (e) => patch("emPrivacy")(e.target.value) },
                    h("option", { value: 0 }, "0 · 保密"),
                    h("option", { value: 1 }, "1 · 基础"),
                    h("option", { value: 2 }, "2 · 详细"),
                  ),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "按会话隔离"), h("div", { className: "hint" }, "关闭时同一个人在不同群里共用一份关系")),
                  h(Switch, { checked: form.emPerSession, onChange: (v) => patch("emPerSession")(v) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "重要记忆阈值"), h("div", { className: "hint" }, "单轮变化合计达到这个值才记进长期记忆")),
                  h("input", { type: "number", min: 1, max: 30, value: form.emThreshold, onChange: (e) => patch("emThreshold")(e.target.value) }),
                ),
              )
            : null,
          emotion && emotion.enabled
            ? h("div", null,
                h("div", { className: "hint" },
                  "共 " + emotion.stats.users + " 份档案 · 累计 " + emotion.stats.totalTurns + " 轮对话" +
                  (emotion.stats.positiveTurns || emotion.stats.negativeTurns
                    ? "（正面 " + emotion.stats.positiveTurns + " / 负面 " + emotion.stats.negativeTurns + "）"
                    : "")),
                emotion.profiles.length
                  ? h("div", null, emotion.profiles.slice(0, 8).map((p) =>
                      h("div", { className: "row", key: p.userKey },
                        h("div", null,
                          h("div", { className: "lbl" }, p.userKey + " · " + p.stage),
                          h("div", { className: "hint" }, "好感 " + p.favor + " / 亲密 " + p.intimacy + " · " + p.totalTurns + " 轮 · " + p.attitude)),
                        h("button", {
                          className: "ghost",
                          onClick: () => emotionAction("reset", { peerId: p.userKey }),
                          disabled: busy,
                          style: { height: "24px", padding: "0 8px", fontSize: "11.5px" },
                        }, "重置"),
                      )))
                  : h("div", { className: "hint" }, "还没有档案。聊天几轮后会自动出现。"),
              )
            : null,
          h("div", { className: "row" },
            h("button", { className: "ghost", onClick: loadEmotion, disabled: busy }, "刷新"),
          ),
        ),

        h(Card, { title: "长期记忆" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "启用长期记忆"),
              h("div", { className: "hint" }, "按人记住她聊过的事。同一个人在群里和私聊共用一份记忆——群里说过的事，私聊里也记得。")),
            h(Switch, { checked: form.memEnabled, onChange: (v) => patch("memEnabled")(v) }),
          ),
          form.memEnabled
            ? h("div", null,
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "注入到对话里"), h("div", { className: "hint" }, "关闭后仍然记录，但聊天时她想不起来")),
                  h(Switch, { checked: form.memInject, onChange: (v) => patch("memInject")(v) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "用模型挑选记忆"), h("div", { className: "hint" }, "关闭则用启发式，省一次模型调用但更粗糙")),
                  h(Switch, { checked: form.memUseModel, onChange: (v) => patch("memUseModel")(v) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "记忆半衰期（天）"), h("div", { className: "hint" }, "越久越难想起来，但不会被删除")),
                  h("input", { type: "number", min: 1, max: 3650, value: form.memHalfLife, onChange: (e) => patch("memHalfLife")(e.target.value) }),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "召回条数 / 常驻事实"), h("div", { className: "hint" }, "每轮最多想起几条相关的事；事实不占这个额度")),
                  h("div", { style: { display: "flex", gap: "6px", alignItems: "center" } },
                    h("input", { type: "number", min: 0, max: 20, value: form.memRecall, onChange: (e) => patch("memRecall")(e.target.value) }),
                    h("span", { className: "hint" }, "/"),
                    h("input", { type: "number", min: 0, max: 20, value: form.memFacts, onChange: (e) => patch("memFacts")(e.target.value) }),
                  ),
                ),
                h("div", { className: "row" },
                  h("div", null, h("div", { className: "lbl" }, "每日记忆配额"), h("div", { className: "hint" }, "每人每天最多记几条，防止塞满上下文")),
                  h("input", { type: "number", min: 0, max: 100, value: form.memQuota, onChange: (e) => patch("memQuota")(e.target.value) }),
                ),
              )
            : null,
          memory && memory.enabled
            ? h("div", null,
                h("div", { className: "hint" }, "共记住 " + memory.totalPeople + " 个人"),
                memory.people.length
                  ? h("div", null, memory.people.slice(0, 6).map((p) =>
                      h("div", { key: p.personId, style: { marginTop: "6px" } },
                        h("div", { className: "lbl" }, p.personId + " · " + p.facts + " 条事实 / " + p.events + " 条事件"),
                        p.memories.slice(0, 4).map((m) =>
                          h("div", { className: "hint", key: m.id, style: { display: "flex", justifyContent: "space-between", gap: "8px" } },
                            h("span", null, "· " + m.time + "  " + m.text),
                            h("button", {
                              className: "ghost",
                              onClick: () => memoryAction("forget", { personId: p.personId, memoryId: m.id }),
                              disabled: busy,
                              style: { height: "20px", padding: "0 6px", fontSize: "11px" },
                            }, "忘掉"),
                          )),
                      )))
                  : h("div", { className: "hint" }, "还没有记忆。聊几轮后会自动出现。"),
              )
            : null,
          h("div", { className: "row" },
            h("button", { className: "ghost", onClick: loadMemory, disabled: busy }, "刷新"),
          ),
        ),

        h(Card, { title: "表情包" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "启用表情包图库"),
              h("div", { className: "hint" }, "开启后她可以用 qq_meme_search / qq_meme_send 找图发图；关闭只是隐藏工具，图库文件不动")),
            h(Switch, { checked: form.memesEnabled, onChange: (v) => patch("memesEnabled")(v) }),
          ),
          !form.memesEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "自动收集群里的图"),
              h("div", { className: "hint" }, "收到图片时按概率收进图库")),
            h(Switch, { checked: form.memesAutoCollect, onChange: (v) => patch("memesAutoCollect")(v) }),
          ),
          !form.memesEnabled || !form.memesAutoCollect ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "收集后需人工审核"),
              h("div", { className: "hint" }, "先进待审核池，你在下面点「入库」才真正可用")),
            h(Switch, { checked: form.memesRequireApproval, onChange: (v) => patch("memesRequireApproval")(v) }),
          ),
          !form.memesEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "用视觉模型自动分类"),
              h("div", { className: "hint" }, "每批图片调一次模型，生成描述/标签/情绪用于检索；关闭则按文件名和手动标签")),
            h(Switch, { checked: form.memesVision, onChange: (v) => patch("memesVision")(v) }),
          ),
          !form.memesEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "回复后自动配表情的概率"),
              h("div", { className: "hint" }, "0 = 从不，0.15 = 约七分之一")),
            h("input", {
              type: "number", min: 0, max: 1, step: 0.05, value: form.memesAutoSendChance,
              onChange: (e) => patch("memesAutoSendChance")(e.target.value),
            }),
          ),
          !form.memesEnabled ? null : h("div", { className: "hint" },
            memeStats
              ? "图库 " + memeStats.total + " 张 · 已分类 " + memeStats.classified + " · 待审核 " + memeStats.pending
              : "图库读取中…"),
          !form.memesEnabled ? null : h("div", { className: "row" },
            h("button", { className: "ghost", onClick: () => memeAction("classify"), disabled: busy }, "立即分类"),
            h("button", { className: "ghost", onClick: loadMemes, disabled: busy }, "刷新图库"),
          ),
          !form.memesEnabled ? null : h("div", { className: "row" },
            h("input", {
              type: "text", value: form.memeFolder ?? "", placeholder: "本地表情包文件夹，例如 D:\\stickers",
              onChange: (e) => patch("memeFolder")(e.target.value),
            }),
            h("button", { className: "ghost", onClick: () => memeAction("import", { folder: form.memeFolder ?? "" }), disabled: busy }, "导入文件夹"),
          ),
          !form.memesEnabled || !memeStats ? null : h("div", { className: "hint" },
            "手动放图：把图片放进 " + (memeStats.root || "数据目录/memes") + " 的 images 文件夹后点「刷新图库」；或用上面的「导入文件夹」（子目录名会自动成为标签）。"),
          !form.memesEnabled || !memes || !(memes.pending ?? []).length ? null : h("div", null,
            h("div", { className: "lbl" }, "待审核（" + memes.pending.length + "）"),
            h("div", { className: "hint" }, "这些图还没进图库。点「入库」通过，「丢弃」删除。"),
            h("div", { className: "row" }, memes.pending.slice(0, 6).map((item) =>
              h("div", { key: item.id, className: "row" },
                h("span", { className: "hint" }, item.width + "×" + item.height + " " + (item.description || item.id)),
                h("button", { className: "ghost", onClick: () => memeAction("approve", { id: item.id }), disabled: busy }, "入库"),
                h("button", { className: "ghost", onClick: () => memeAction("reject", { id: item.id }), disabled: busy }, "丢弃"),
              ),
            )),
          ),
          !form.memesEnabled || !memes || !(memes.entries ?? []).length ? null : h("div", null,
            h("div", { className: "lbl" }, "最近入库（" + memes.entries.length + "）"),
            h("div", { className: "hint" }, memes.entries.slice(0, 8).map((item) =>
              (item.description || item.note || item.id) + ((item.emotions ?? []).length ? "［" + item.emotions.join("/") + "］" : "")
            ).join(" · ")),
          ),
        ),

        h(Card, { title: "回复节奏" },
          // 会话回收：空闲多久之后销毁内存里的 agent。
          // 这个值直接决定「隔一会儿再聊，她还记不记得刚才说到哪」。
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "会话保留时间（分钟）"),
              h("div", { className: "hint" }, "隔这么久没说话，就把这个对话的上下文从内存里清掉。下次再聊会重新补最近 20 条历史，但「上次说到哪」的连续感会弱一些。填 0 表示永不清理。范围 0–1440")),
            h("input", {
              type: "number", min: 0, max: 1440, value: form.idleMinutes,
              disabled: form.neverEvict === true,
              onChange: (e) => patch("idleMinutes")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "永不回收"),
              h("div", { className: "hint" }, "打开后所有对话的上下文一直留着，只能靠重启 DSH 释放。聊过的人多时会占内存，但她的连续感最好")),
            h(Switch, {
              checked: form.neverEvict === true,
              onChange: (v) => { patch("neverEvict")(v); if (v) patch("idleMinutes")(0); else if (Number(form.idleMinutes) <= 0) patch("idleMinutes")(30); },
            }),
          ),
          // 每次新建会话时补多少条历史。
          // 重启 DSH、或空闲超过「会话保留时间」之后，agent 会重建 ——
          // 重建后她能看到多少「之前聊过什么」，完全由这个数决定。
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "重建后补多少条历史"),
              h("div", { className: "hint" }, "重启或空闲回收后，新会话会把最近这么多条聊天记录重新读一遍。调大她更容易接上「上次说到哪」，代价是每次请求变长。范围 0–100，默认 20")),
            h("input", {
              type: "number", min: 0, max: 100, value: form.contextMessages,
              onChange: (e) => patch("contextMessages")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "批量窗口（秒）"),
              h("div", { className: "hint" }, "窗口内收到的消息合并成一次回复；范围 15–3600 秒，改完即时生效")),
            h("input", {
              type: "number", min: 15, max: 3600, value: form.pollSeconds,
              onChange: (e) => patch("pollSeconds")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "轮询补漏"),
              h("div", { className: "hint" }, "每个周期向 NapCat 查一次最近消息，防止推送丢失（5 分钟前的只归档不回复）")),
            h(Switch, { checked: form.pollEnabled, onChange: patch("pollEnabled") }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "分段最小间隔（秒）"),
              h("div", { className: "hint" }, "拆成多条发送时，相邻两条之间至少等这么久")),
            h("input", {
              type: "number", min: 0, max: 30, step: 0.1, value: form.segmentMinSec,
              onChange: (e) => patch("segmentMinSec")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "分段最大间隔（秒）"),
              h("div", { className: "hint" }, "再长也不会超过这个上限，避免长句卡太久")),
            h("input", {
              type: "number", min: 0, max: 60, step: 0.1, value: form.segmentMaxSec,
              onChange: (e) => patch("segmentMaxSec")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "每字追加（毫秒）"),
              h("div", { className: "hint" }, "越长的句子等得越久，更像真人打字；0 = 固定用最小间隔")),
            h("input", {
              type: "number", min: 0, max: 500, step: 10, value: form.segmentPerCharMs,
              onChange: (e) => patch("segmentPerCharMs")(e.target.value),
            }),
          ),
          h("div", { className: "hint" },
            "当前效果：「好的」等 " + gapFor("好的") + " 秒，「今天过得怎么样呀，要不要一起打游戏」等 "
            + gapFor("今天过得怎么样呀，要不要一起打游戏") + " 秒。改完保存即时生效。"),
        ),

        h(Card, { title: "回复范围" },
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "私聊范围")),
            h("select", { value: form.privateMode, onChange: (e) => patch("privateMode")(e.target.value) },
              h("option", { value: "all" }, "所有人"),
              h("option", { value: "allowlist" }, "仅白名单"),
              h("option", { value: "disabled" }, "全部忽略"),
            ),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "私聊白名单"), h("div", { className: "hint" }, "QQ 号，逗号分隔；仅白名单模式生效")),
            h("input", { type: "text", value: form.privateIds, onChange: (e) => patch("privateIds")(e.target.value), placeholder: "123456789" }),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "群消息")),
            h("select", { value: form.groupMode, onChange: (e) => patch("groupMode")(e.target.value) },
              h("option", { value: "all" }, "全部接收"),
              h("option", { value: "allowlist" }, "仅白名单群"),
              h("option", { value: "disabled" }, "全部忽略"),
            ),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "管理员 QQ"), h("div", { className: "hint" }, "可用插件工具操作 QQ；群内仍按普通成员处理")),
            h("input", { type: "text", value: form.ownerIds, onChange: (e) => patch("ownerIds")(e.target.value) }),
          ),
        ),

        h(Card, { title: "NapCat" },
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "托管模式"), h("div", { className: "hint" }, "managed = 插件负责起停；external = 连接已有实例")),
            h("select", { value: form.napcatMode, onChange: (e) => patch("napcatMode")(e.target.value) },
              h("option", { value: "managed" }, "托管（managed）"),
              h("option", { value: "external" }, "外部（external）"),
            ),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "WebUI 端口"), h("div", { className: "hint" }, "避开 Windows 排除端口段（6038–6137 等）")),
            h("input", { type: "number", value: form.webuiPort, onChange: (e) => patch("webuiPort")(e.target.value) }),
          ),
          h("div", { className: "row" },
            h("button", { className: "ghost", onClick: openLogin, disabled: busy }, "打开 NapCat 登录页"),
            state && state.loginPage ? h("span", { className: "hint" }, state.loginPage) : null,
          ),
        ),

        h(Card, { title: "人格设定" },
          h("div", { className: "hint" }, "只影响自动回复时的语气与习惯；不会覆盖系统提示。"),
          h("textarea", { value: form.persona, onChange: (e) => patch("persona")(e.target.value), placeholder: "你是一名友好自然的 AI QQ 助手…" }),
        ),

        h(Card, { title: "归档" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "永久保存"),
              h("div", { className: "hint" }, "打开后不再按天删除，所有归档一直留着；关掉则按下面的天数自动清理。")),
            h(Switch, { checked: form.retentionForever, onChange: (v) => patch("retentionForever")(v) }),
          ),
          form.retentionForever
            ? h("div", { className: "hint" }, "当前策略：永久保存。归档只会随你手动删除或卸载插件而消失。")
            : h("div", { className: "row" },
                h("div", null,
                  h("div", { className: "lbl" }, "本地归档保留天数"),
                  h("div", { className: "hint" }, "收到和发出的每条消息按天存成一个文件，超期自动删除。默认 30 天，范围 1–3650。")),
                h("input", {
                  type: "number", min: 1, max: 3650, value: form.retentionDays,
                  onChange: (e) => patch("retentionDays")(e.target.value),
                }),
              ),
          h("div", { className: "hint" }, "这个值影响三件事：qq_read_history 能读到多久以前、qq_search_messages 能搜到多久以前、以及主动消息会话列表里还能看到哪些聊天。永久保存会让这三处都不设时间下限。"),
        ),

        h("div", { className: "row" },
          h("button", { onClick: save, disabled: busy }, busy ? "保存中…" : (dirty ? "保存设置 *" : "保存设置")),
          h("button", { className: "ghost", onClick: () => { setDirty(false); load(); }, disabled: busy }, "放弃修改"),
          // 未保存提示放在按钮右边，和按钮在同一行，改完立刻能看见。
          // 只靠按钮加个 * 不够显眼，滚到底部的人容易漏掉。
          dirty ? h("div", { style: { color: "var(--dsw-alias-warning, #d97706)", fontSize: "12.5px", marginLeft: "10px" } },
            "有未保存的修改") : null,
        ),
        msg ? h("div", { className: "msg" }, msg) : null,
        err ? h("div", { className: "msg err" }, err) : null,
      );
    }

    function QqIcon() {
      return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M21 11.5a8.4 8.4 0 0 1-8.5 8.5 8.7 8.7 0 0 1-3.8-.9L3 21l1.9-5.7A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z" }));
    }

    const PANEL_ID = "qq-access";
    const inject = ["slots"];

    function apply(ctx) {
      try { fetch(API + "/ping?stage=apply&slot=" + encodeURIComponent("boot")); } catch (e) {}
      try { if (typeof window !== "undefined") window.__qqAccessClient = { applied: true, at: Date.now() }; } catch (e) {}
      ctx.effect(
        () => ctx.slots.inject("sidebar.panellist", () => ctx.slots.register(
          { name: "sidebar.panellist", id: PANEL_ID, order: 7, label: () => "QQ 接入" },
          QqIcon,
        ), "qq-access: sidebar entry"),
        "qq-access: sidebar entry",
      );
      ctx.effect(
        () => ctx.slots.inject("settings.section", () => ctx.slots.register(
          { name: "settings.section", id: "qq-access", order: 6, label: () => "QQ 接入" },
          QqPanel,
        ), "qq-access: settings fallback"),
        "qq-access: settings fallback",
      );
      ctx.effect(
        () => ctx.slots.inject("main", () => ctx.slots.register(
          { name: "main", key: PANEL_ID, inject: () => ({}) },
          QqPanel,
        ), "qq-access: main panel"),
        "qq-access: main panel",
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.QqPanel = QqPanel;
    return module.exports;
  },
});
