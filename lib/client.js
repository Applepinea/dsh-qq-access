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

      const load = useCallback(async () => {
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
          setForm({
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
            memesEnabled: data.config.memes?.enabled !== false,
            memesAutoCollect: data.config.memes?.autoCollect === true,
            memesRequireApproval: data.config.memes?.requireApproval !== false,
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
            qzWindowStart: data.config.qzoneProactive?.windowStart ?? "08:00",
            qzWindowEnd: data.config.qzoneProactive?.windowEnd ?? "23:00",
            qzMinGap: data.config.qzoneProactive?.minGapMinutes ?? 180,
            qzTopic: data.config.qzoneProactive?.topic ?? "",
            qzUseLife: data.config.qzoneProactive?.useLife !== false,
            qzAllowDetails: data.config.qzoneProactive?.allowDetails !== false,
            modelFollowDefault: !chosen,
            modelProvider: chosen?.provider ?? "",
            modelId: chosen?.model ?? "",
          });
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

      useEffect(() => { ensureCss(); load(); loadMemes(); loadLife(); loadTargets(); loadQzone(); loadEmotion(); }, [load, loadMemes, loadLife, loadTargets, loadQzone, loadEmotion]);

      const patch = (key) => (value) => setForm((prev) => ({ ...prev, [key]: value }));

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
                // Only the conversations the user actually ticked become targets.
                proactiveTargets: targets.filter((t) => t.selected).map((t) => ({ kind: t.kind, peerId: t.peerId, enabled: t.enabled !== false })),
              },
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
          await load();
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
            h("button", { className: "ghost", onClick: load, disabled: busy }, "刷新"),
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
          !form.lifeEnabled || !life || !life.snapshot || !life.snapshot.ready ? null : h("div", null,
            h("div", { className: "lbl" }, "本周安排"),
            h("div", { className: "hint" }, Object.values(life.snapshot.week ?? {}).map((d) => d.theme).join(" · ")),
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
            h("div", null, h("div", { className: "lbl" }, "每日上限"), h("div", { className: "hint" }, "一天最多主动发几条")),
            h("input", { type: "number", min: 0, max: 12, value: form.lifeMaxPerDay, onChange: (e) => patch("lifeMaxPerDay")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "最小间隔（分钟）"), h("div", { className: "hint" }, "两条主动消息之间至少隔这么久")),
            h("input", { type: "number", min: 10, max: 720, value: form.lifeMinGap, onChange: (e) => patch("lifeMinGap")(e.target.value) }),
          ),
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
          h("button", { onClick: save, disabled: busy }, busy ? "保存中…" : "保存设置"),
          h("button", { className: "ghost", onClick: load, disabled: busy }, "放弃修改"),
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
