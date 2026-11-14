window.__ModuleLoader__.load({
  id: "dsh-qq-access",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    const React = require("react");
    const { createElement: h, useCallback, useEffect, useState } = React;

    const API = "/dsh-qq/api";
    // 项目主页。只放图标按钮，不在界面上明文显示链接。
    const REPO_URL = "https://github.com/Applepinea/dsh-qq-access";
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
      // 纯图标按钮：正方形、无文字。和 ghost 一样的外观，只是宽度收窄。
      ".qqa button.icon{width:30px;padding:0;display:inline-flex;align-items:center;justify-content:center}",
      ".qqa button.icon svg{display:block}",
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


    // 常见城市的大致经纬度（市区级，误差几公里完全够用）。
    // 唯一用途是交叉校验：面板里「城市」和经纬度有没有明显打架。
    // 之前城市名被默认值覆盖过而经纬度没动，界面上看不出任何异常，
    // 只能等查回来的天气不对才发现地点错了。
    const CITY_POINTS = {
      杭州: [30.27, 120.16], 上海: [31.23, 121.47], 北京: [39.90, 116.41],
      广州: [23.13, 113.26], 深圳: [22.54, 114.06], 成都: [30.57, 104.07],
      重庆: [29.56, 106.55], 南京: [32.06, 118.80], 武汉: [30.59, 114.31],
      西安: [34.34, 108.94], 厦门: [24.48, 118.09], 天津: [39.13, 117.20],
      苏州: [31.30, 120.58], 青岛: [36.07, 120.38], 长沙: [28.23, 112.94],
      合肥: [31.82, 117.23], 郑州: [34.75, 113.63], 沈阳: [41.81, 123.43],
      哈尔滨: [45.80, 126.53], 昆明: [25.04, 102.72], 福州: [26.07, 119.30],
      宁波: [29.87, 121.55], 无锡: [31.49, 120.31], 温州: [27.99, 120.70],
      南昌: [28.68, 115.86], 贵阳: [26.65, 106.63], 兰州: [36.06, 103.83],
      济南: [36.65, 117.12], 大连: [38.91, 121.61], 太原: [37.87, 112.55],
      香港: [22.32, 114.17], 台北: [25.03, 121.56], 澳门: [22.19, 113.54],
      华盛顿: [38.90, -77.04], 纽约: [40.71, -74.01], 洛杉矶: [34.05, -118.24],
      旧金山: [37.77, -122.42], 西雅图: [47.61, -122.33],
      伦敦: [51.51, -0.13], 巴黎: [48.86, 2.35], 柏林: [52.52, 13.40],
      东京: [35.68, 139.69], 大阪: [34.69, 135.50], 首尔: [37.57, 126.98],
      新加坡: [1.35, 103.82], 吉隆坡: [3.14, 101.69], 曼谷: [13.76, 100.50],
      悉尼: [-33.87, 151.21], 墨尔本: [-37.81, 144.96],
    };

    function haversineKm(lat1, lon1, lat2, lon2) {
      const rad = Math.PI / 180;
      const dLat = (lat2 - lat1) * rad;
      const dLon = (lon2 - lon1) * rad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    // 返回 { km } = 明显对不上；返回 null = 没法判断（城市不在表里，或经纬度不是数字）。
    function cityDistanceWarning(city, lat, lon) {
      const point = CITY_POINTS[String(city ?? "").trim()];
      if (!point) return null;
      // Number("") 是 0，会被当成合法坐标，所以空串要先挡掉。
      if (String(lat ?? "").trim() === "" || String(lon ?? "").trim() === "") return null;
      const la = Number(lat);
      const lo = Number(lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
      const km = haversineKm(la, lo, point[0], point[1]);
      return km > 200 ? { km: Math.round(km) } : null;
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
      // 「推理等级」的可选档位由宿主按「服务商 + 模型」现算：不同模型支持的档位不一样，
      // 写死一份列表迟早会和服务端对不上，写进去的等级就会被 Host 拒掉。
      const [reasoning, setReasoning] = useState({ provider: "", model: "", efforts: [], defaultEffort: null, supported: true, error: "" });
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
      // 首次配置：没有配置文件时面板只显示这一屏。
      // 只问两个 QQ 号；token / secret / webuiToken / 端口全部由服务端 bootstrapConfig 随机生成，
      // 让新用户手打密钥等于劝退。
      const [boot, setBoot] = useState({ ownerId: "", busy: false, done: false });
      // 「配置教程」抽屉：把 README 里的首次配置流程和 NapCat WebUI 说明搬进来。
      // 很多人是在装完之后才发现「NapCat 只在后台跑、没有窗口」的 ——
      // 让他们不用去翻 GitHub 就能看到。
      const [showGuide, setShowGuide] = useState(false);
  // Steam 绑定表：只在面板里可改（聊天里没有绑定工具）。
  const [steamBindings, setSteamBindings] = useState(null);
  // 绑定表单做成「多行草稿」：绑定成功后那一行变成「✓ 已绑定」，
  // 并自动多出一个空行，方便一次绑好几个账号，不用反复点。
  const [steamDrafts, setSteamDrafts] = useState([{ id: 1, qq: "", steamId: "", done: false }]);
  const [steamBindBusy, setSteamBindBusy] = useState(false);

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
            replyGroup: data.config.reply.group ?? "off",
            smartThreshold: data.config.reply.smartThreshold ?? 3,
            selfNames: (data.config.reply.selfNames ?? []).join(","),
            interests: (data.config.reply.interests ?? []).join(","),
            learnInterests: data.config.reply.learnInterests !== false,
            avoidRepeat: data.config.reply.avoidRepeat !== false,
            repeatThreshold: data.config.reply.repeatThreshold ?? 0.7,
            privateMode: data.config.access.privateMode ?? "all",
            privateIds: (data.config.access.privateIds ?? []).join(","),
            groupIds: (data.config.access.groupIds ?? []).join(","),
            blockedUsers: (data.config.access.blockedUsers ?? []).join(","),
            blockedGroups: (data.config.access.blockedGroups ?? []).join(","),
            groupMode: data.config.access.groupMode ?? "all",
            ownerIds: (data.config.ownerIds ?? []).join(","),
            persona: data.config.persona ?? "",
            retentionDays: data.config.retentionDays ?? 30,
            retentionForever: Number(data.config.retentionDays ?? 30) === 0,
            napcatMode: data.config.napcat.mode ?? "managed",
            autoOpenLogin: data.config.napcat.autoOpenLogin !== false,
            loginGraceSec: Math.round((data.config.napcat.loginGraceMs ?? 20000) / 1000),
            webuiPort: data.config.napcat.webuiPort ?? 6099,
            pollSeconds: Math.round((data.config.poll?.intervalMs ?? 60000) / 1000),
            debounceSec: Math.round((data.config.reply?.debounceMs ?? 1200) / 1000 * 10) / 10,
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
            lifeMaxPerDay: data.config.life?.proactiveMaxPerDay ?? 5,
            lifeSpread: data.config.life?.proactiveSpread ?? 0.5,
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
            steamEnabled: data.config.steam?.enabled === true,
            // 和 wxKey 同样的掩码规则：服务端不回传明文，留空表示不改。
            steamKey: keepSecrets ? (prev.steamKey ?? '') : '',
            steamHasKey: data.config.steam?.hasApiKey === true,
            // 缓存时间用秒显示，配置里是毫秒。0 = 每次都查（调试时用）。
            steamCacheSec: Math.round((data.config.steam?.cacheTtlMs ?? 60000) / 1000),
            steamWithGames: data.config.steam?.withGames !== false,
            steamInject: data.config.steam?.inject !== false,
            steamInjectProactive: data.config.steam?.injectProactive !== false,
            steamPrivateOnly: data.config.steam?.privateOnly !== false,
            wxCity: data.config.weather?.city ?? '华盛顿',
            wxLat: data.config.weather?.latitude ?? 38.90,
            wxLon: data.config.weather?.longitude ?? -77.04,
            // 这三个字段以前漏了初始化，导致面板永远显示「关」，
            // 而且每次保存都把 true 写成 false —— 看起来就是「勾了没保存上」。
            // 默认值必须和 config.mjs 的 normalize 保持一致，否则会互相打架。
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
            modelReasoningEffort: chosen?.reasoningEffort ?? "",
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

      // Steam 绑定表：只有面板能改。聊天里没有绑定工具 ——
      // SteamID 是公开信息，群里任何人都能拿到别人的 ID 绑到自己身上。
      const loadSteamBindings = useCallback(async () => {
        try {
          const res = await fetch(API + "/steam/bindings", { credentials: "same-origin" });
          const data = await res.json();
          if (data.ok) setSteamBindings(data.people || []);
        } catch { /* 保留上一次的快照 */ }
      }, []);

      const steamAction = async (action, extra = {}) => {
        setErr(""); setMsg("");
        const res = await fetch(API + "/steam/action", {
          method: "POST", credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "操作失败");
        return data;
      };

      const setSteamDraft = (id, patch) => {
        setSteamDrafts((list) => (list || []).map((d) => (d.id === id ? { ...d, ...patch } : d)));
      };

      const removeSteamDraft = (id) => {
        setSteamDrafts((list) => {
          const next = (list || []).filter((d) => d.id !== id);
          // 至少留一行空的，否则界面上会出现「无处可填」的空区
          return next.length ? next : [{ id: Date.now(), qq: "", steamId: "", done: false }];
        });
      };

      const steamBindSubmit = async (draftId) => {
        const draft = (steamDrafts || []).find((d) => d.id === draftId);
        if (!draft) return;
        const qq = String(draft.qq || "").trim();
        const steamId = String(draft.steamId || "").trim();
        if (!/^\d{5,12}$/.test(qq)) { setErr("QQ 号格式不对"); return; }
        if (!/^\d{17}$/.test(steamId)) { setErr("SteamID 必须是 17 位数字（SteamID64）"); return; }
        setSteamBindBusy(true); setErr(""); setMsg("");
        try {
          const data = await steamAction("bind", { qq, steamId });
          // 这一行变成「✓ 已绑定」，然后自动补一个空行。
          // 保留已绑定的行而不是清空，是为了让人看得见刚才绑了什么、
          // 也方便发现「绑错了」当场解绑。
          setSteamDrafts((list) => {
            const marked = (list || []).map((d) => (d.id === draftId ? { ...d, done: true } : d));
            const hasEmpty = marked.some((d) => !d.done);
            return hasEmpty ? marked : [...marked, { id: Date.now(), qq: "", steamId: "", done: false }];
          });
          if (data.probed && data.probed.nickname) {
            setMsg("已绑定：" + data.probed.nickname + "（" + (data.probed.inGame ? "正在玩 " + data.probed.inGame : data.probed.state) + "）");
          } else if (data.probed && data.probed.error) {
            setMsg("已绑定，但查询失败：" + data.probed.error);
          } else {
            setMsg(data.duplicate ? "这个绑定已经存在" : "已绑定");
          }
          await loadSteamBindings();
        } catch (error) {
          setErr(String(error.message || error));
          // 失败时撤回「已绑定」标记，让这一行还能改着重试
          setSteamDrafts((list) => (list || []).map((d) => (d.id === draftId ? { ...d, done: false } : d)));
        }
        finally { setSteamBindBusy(false); }
      };

      const steamUnbind = async (qq, steamId) => {
        setErr(""); setMsg("");
        try {
          await steamAction("unbind", { qq, steamId });
          setMsg("已解绑");
          await loadSteamBindings();
        } catch (error) { setErr(String(error.message || error)); }
      };

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


      useEffect(() => { ensureCss(); load(); loadMemes(); loadLife(); loadSteamBindings(); loadTargets(); loadQzone(); loadEmotion(); loadMemory(); }, [load, loadMemes, loadLife, loadTargets, loadQzone, loadEmotion, loadMemory]);

      // 关页面/刷新前的二次确认。面板很长，用户改了上面的设置后
      // 往往滚不到底部，看不到那个「有未保存的修改」。
      useEffect(() => {
        if (!dirty) return undefined;
        const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
      }, [dirty]);

      // 换了服务商或模型就把档位菜单重新问一遍宿主。
      // 请求回来时用户可能已经又切走了，那时的结果要丢掉（alive 标记），
      // 否则面板会拿上一个模型的档位去配当前模型。
      useEffect(() => {
        if (!form || form.modelFollowDefault) return undefined;
        const provider = form.modelProvider;
        const model = form.modelId;
        if (!provider || !model) return undefined;
        let alive = true;
        (async () => {
          try {
            const res = await fetch(
              API + "/model-reasoning?provider=" + encodeURIComponent(provider) + "&model=" + encodeURIComponent(model),
              { credentials: "same-origin" },
            );
            const data = await res.json();
            if (!alive) return;
            setReasoning({
              provider,
              model,
              efforts: Array.isArray(data.efforts) ? data.efforts : [],
              defaultEffort: data.defaultEffort ?? null,
              supported: data.supported !== false,
              error: data.ok === false ? String(data.error ?? "") : "",
            });
          } catch (error) {
            if (alive) setReasoning({ provider, model, efforts: [], defaultEffort: null, supported: true, error: String(error.message || error) });
          }
        })();
        return () => { alive = false; };
      }, [form?.modelFollowDefault, form?.modelProvider, form?.modelId]);

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
                // 这里不能用 `|| 1.2`：Number('0') 是 0，属于 falsy，
                // 填 0 会被悄悄存成 1.2 秒 —— 而 0 是一个有意义的合法值（每条立刻处理）。
                // 只在「解析不出数字」时才回退默认。
                debounceMs: (() => {
                  const raw = Number(form.debounceSec);
                  const sec = Number.isFinite(raw) ? raw : 1.2;
                  return Math.round(Math.min(600, Math.max(0, sec)) * 1000);
                })(),
                avoidRepeat: Boolean(form.avoidRepeat),
                repeatThreshold: Math.min(1, Math.max(0.5, Number(form.repeatThreshold) || 0.7)),
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
                // 以前只提交上面三项：手写在文件里的黑名单不会被擦掉（服务端按键合并），
                // 但用户也没法在面板里添加它们 —— 把群模式改成 allowlist 而 groupIds 为空时，
                // 等于所有群都不收。
                groupIds: splitIds(form.groupIds),
                blockedUsers: splitIds(form.blockedUsers),
                blockedGroups: splitIds(form.blockedGroups),
              },
              ownerIds: splitIds(form.ownerIds),
              life: {
                enabled: Boolean(form.lifeEnabled),
                inject: Boolean(form.lifeInject),
                proactive: Boolean(form.lifeProactive),
                proactivePrivate: Boolean(form.lifeProactivePrivate),
                proactiveGroup: Boolean(form.lifeProactiveGroup),
                proactiveMaxPerDay: Math.round(Math.min(24, Math.max(0, Number(form.lifeMaxPerDay) || 0))),
                proactiveSpread: Math.round(Math.min(2, Math.max(0.05, Number(form.lifeSpread) || 0.5)) * 100) / 100,
                proactiveMinGapMinutes: Math.round(Math.min(720, Math.max(10, Number(form.lifeMinGap) || 90))),
                proactiveJitterMinutes: Math.round(Math.min(240, Math.max(0, Number(form.lifeJitter) || 0))),
                proactiveGraceMinutes: Math.round(Math.min(180, Math.max(5, Number(form.lifeGrace) || 30))),
                proactiveHint: String(form.lifeHint ?? '').trim().slice(0, 500),
              },
              steam: (() => {
                const raw = String(form.steamKey ?? '').trim();
                const base = {
                  enabled: Boolean(form.steamEnabled),

                  // 缓存时间：0 表示每次都查。上限一天。
                  cacheTtlMs: Math.round(Math.min(86400, Math.max(0, Number(form.steamCacheSec) || 0)) * 1000),
                  withGames: Boolean(form.steamWithGames),
                  inject: Boolean(form.steamInject),
                  injectProactive: Boolean(form.steamInjectProactive),
                  privateOnly: Boolean(form.steamPrivateOnly),
                };
                if (!raw) return base;
                // Steam Web API key 是 32 位十六进制。形状不对就不发，保留原值 ——
                // 和 weather 那边同一个理由：粘错一整段文字比没填更难排查。
                if (!/^[0-9A-Fa-f]{32}$/.test(raw)) {
                  throw new Error('Steam API Key 格式不对：应当是 32 位十六进制字符');
                }
                return { ...base, apiKey: raw };
              })(),
              weather: (() => {
                // 和风的 API Key 是 32 位十六进制或类似短串，绝不可能是一段文字。
                // 之前这里直接把输入框内容塞进 apiKey，结果人格设定被当成 key 存进去，
                // 存进去之后面板显示「已保存」，看起来完全正常，实际整个 weather 段是坏的。
                // 所以这里做一次形状校验：不像 key 就不发，让它保留原来的值。
                const raw = String(form.wxKey ?? '').trim();
                const base = {
                  enabled: Boolean(form.wxEnabled),
                  apiHost: String(form.wxHost ?? '').trim(),
                  // 城市只用于提示词。以前这里写 `|| '华盛顿'`：输入框是空的（比如面板
                  // 没初始化这个字段）就会把用户填过的城市悄悄改回默认值。现在空就不发，
                  // 服务端的分段合并会保留原值。
                  ...(String(form.wxCity ?? '').trim() ? { city: String(form.wxCity).trim() } : {}),
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
              // 保存前必须校验「服务商 + 模型」这对组合是否真的存在。
              //
              // 之前这里直接用 form.modelProvider / form.modelId，而那两个值
              // 可能已经过时：宿主目录变了、模型下线了、或者换服务商时没重选模型。
              // 面板上显示的是校验后的值，看起来一切正常，但保存下去的是那个
              // 不存在的组合 —— 运行时就变成「agent 建得出来但模型不响应」，
              // 主动消息静默失败，只在 debug.log 里留下一行空回合。
              // 校验不过就退回「跟随默认」，宁可丢一次选择，也不要写坏配置。
              model: (() => {
                if (form.modelFollowDefault) return null;
                const groups = catalog?.groups ?? [];
                const provider = groups.find((g) => g.id === form.modelProvider);
                if (!provider) return null;
                if (!(provider.models ?? []).some((m) => m.id === form.modelId)) return null;
                // 等级和 provider/model 是同一个选择对象的三件套，一起写或者都不写。
                // 空值 = 服务商默认，干脆省掉这个键，别存一个空串。
                const effort = String(form.modelReasoningEffort ?? '').trim();
                // 只有在「已经拿到这个模型的档位表、表里确实没有这一档」时才丢掉它；
                // 否则会把还在加载中的合法设置一起扔掉，等于保存时悄悄改设置。
                const tableReady = reasoning.provider === provider.id && reasoning.model === form.modelId && reasoningEfforts.length > 0;
                const unsupported = tableReady && !reasoningEfforts.some((r) => r.id === effort);
                return { provider: provider.id, model: form.modelId, ...(effort && !unsupported ? { reasoningEffort: effort } : {}) };
              })(),
              persona: form.persona,
              // Clamp and round here: the backend requires a strict integer in 1..3650 and
              // an emptied field would otherwise fail the entire save.
              // 0 是后端约定的「永久保存」哨兵值；勾选后忽略输入框里的天数。
              retentionDays: form.retentionForever
                ? 0
                : Math.round(Math.min(3650, Math.max(1, Number(form.retentionDays) || 30))),
              napcat: {
                mode: form.napcatMode,
                webuiPort: Number(form.webuiPort),
                autoOpenLogin: form.autoOpenLogin !== false,
                loginGraceMs: Math.max(0, Number(form.loginGraceSec) || 0) * 1000,
              },
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
          if (form.steamKey && String(form.steamKey).trim()) setForm((f) => ({ ...f, steamHasKey: true, steamKey: "" }));
          await load({ keepSecrets: true });
          // 保存成功后服务端已经是新值，标脏就该清掉。
          setDirty(false);
        } catch (error) { setErr(String(error.message || error)); }
        finally { setBusy(false); }
      };

      const runBootstrap = async () => {
        setBoot((prev) => ({ ...prev, busy: true }));
        setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/bootstrap", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ownerIds: splitIds(boot.ownerId) }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "生成配置失败");
          setBoot((prev) => ({ ...prev, busy: false, done: true }));
          setMsg(
            "配置已生成：" + data.configPath + "。"
            + "现在请完全退出 DeepSeek Harness 再重新启动 —— 重启后才会开始下载 NapCat（首次约 118 MB），"
            + "下载完会自动打开扫码页。"
          );
          await load();
        } catch (error) {
          setBoot((prev) => ({ ...prev, busy: false }));
          setErr(String(error.message || error));
        }
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

      // 还没有配置文件：先让用户把账号填了。这一屏是唯一一处不依赖 runtime 的渲染，
      // 也是新人装完插件后看到的第一屏 —— 之前这里根本没机会渲染，因为插件已经抛异常了。
      // 还没有配置文件：只问一个「管理员号（可留空）」，登录 QQ 号扫码后自动认。
      // 这一屏是新人装完插件后看到的第一屏，所以要把「接下来会发生什么」写清楚。
      if (state && state.missingConfig) {
        return h("div", { className: "qqa" },
          h("div", { className: "row" },
            h("div", null,
              h("h2", null, "QQ 接入 · 首次配置"),
              h("p", { className: "sub" }, "不用填登录 QQ 号。点下面的按钮生成配置，插件会自动下载并启动 NapCat，打开扫码页；你扫完码，它会自己认出登录的是哪个号。")),
          ),
          h(Card, { title: "管理员（可留空）" },
            h("div", { className: "row" },
              h("div", null,
                h("div", { className: "lbl" }, "管理员 QQ 号"),
                h("div", { className: "hint" }, "用另一个号私聊它来管理插件；留空就只能在本机 Harness 里管，之后随时能改")),
              h("input", {
                type: "text", value: boot.ownerId, placeholder: "可留空",
                onChange: (e) => setBoot((prev) => ({ ...prev, ownerId: e.target.value })),
              }),
            ),
          ),
          h("div", { className: "row" },
            h("button", { onClick: runBootstrap, disabled: boot.busy }, boot.busy ? "生成中…" : "生成配置并开始登录"),
          ),
          h("div", { className: "hint" }, "生成配置只写文件，不会立刻下载。生成后需要完全退出并重新启动 DSH，重启后才会开始下载 NapCat（首次约 118 MB）并自动打开扫码页。"),
          msg ? h("div", { className: "msg" }, msg) : null,
          err ? h("div", { className: "msg err" }, err) : null,
        );
      }

      // 已生成配置、但还没扫码：selfId 为空。只显示「等待扫码」这一屏，
      // 中间不能显示正常面板 —— 那时什么都不能配，全是无效输入。
      if (state && state.loginPending && !state.needsRestart) {
        const nap = state.napcat ?? {};
        const pct = Number(nap.progressPercent);
        const hasPct = Number.isFinite(pct) && pct > 0;
        // 只有 NapCat 真的跑起来过（有进度文本 / 有状态）才显示进度卡片，
        // 否则这一屏就是在等用户重启，显示「正在准备 NapCat」是误导。
        const running = Boolean(nap.progress) || (nap.state && nap.state !== "idle");
        return h("div", { className: "qqa" },
          // 这一屏混着两种状态，文案必须分开：
          //   running=false → 用户还没重启，NapCat 根本没起来，只需要告诉他去重启；
          //   running=true  → 已经重启、NapCat 在等扫码，顶部再喊「去重启」就是错的。
          running
            ? h("div", {
                className: "msg",
                style: { fontSize: "15px", fontWeight: 600, padding: "12px 14px", lineHeight: 1.7 },
              },
                "📱 正在等你扫码登录。",
                h("br"),
                "用手机 QQ 扫一下——扫码页没自动弹出的话，点下面的「打开扫码页」。",
              )
            : h("div", {
                className: "msg",
                style: { fontSize: "15px", fontWeight: 600, padding: "12px 14px", lineHeight: 1.7 },
              },
                "✅ 配置已生成。",
                h("br"),
                "请完全退出 DeepSeek Harness，再重新启动 —— NapCat 的下载和扫码都在重启之后才开始。",
              ),
          h(Card, { title: running ? "当前状态" : "接下来" },
            running
              ? h("div", { className: "hint" }, "NapCat 已经启动，正在等待扫码。这一步不需要再重启 DSH。")
              : h("ol", { style: { margin: 0, paddingLeft: "20px", lineHeight: 1.9 } },
                  h("li", null, "托盘图标右键 → 退出（不要只关窗口，要完全退出）"),
                  h("li", null, "重新打开 DeepSeek Harness"),
                  h("li", null, "插件会自动下载 NapCat（首次约 118 MB）并打开扫码页"),
                  h("li", null, "用手机 QQ 扫码登录"),
                ),
          ),
          // 这一屏正是最容易撞上「token 报错 / 扫不上 / 一直转圈」的时候，
          // 提示放在操作清单下面：用户照着做完一遍发现问题，紧接着就看到这条。
          h("div", {
            style: {
              marginTop: "12px",
              padding: "12px 14px",
              borderRadius: "8px",
              background: "rgba(127,127,127,0.10)",
              lineHeight: 1.85,
              fontSize: "13px",
            },
          },
            h("div", { style: { fontWeight: 600, marginBottom: "6px" } }, "(๑•̀ㅂ•́)و✧ 遇到问题别慌"),
            h("div", null,
              "如果碰到 NapCat token 报错、扫码登不上去、一直卡在等待、或者莫名其妙连不上 —— 先别急着重装 ✌️"),
            h("div", { style: { marginTop: "6px" } },
              "大多数情况只要 ",
              h("b", null, "乖乖重启一次 DSH"),
              " 就好啦 (´｡• ᵕ •｡`) ♡ 重启会把配置重新读一遍，卡住的状态基本都能解开～"),
            h("div", { className: "hint", style: { marginTop: "8px" } },
              "要是重启两次还是不行，把面板上的报错发给我，我陪你一起看 (๑·̃ ₃ ·̃๑)"),
          ),
          running
            ? h(Card, { title: "NapCat 状态" },
                h("div", { className: "hint" }, String(nap.progress || nap.state)),
                hasPct
                  ? h("div", {
                      style: {
                        marginTop: "8px",
                        height: "8px",
                        borderRadius: "4px",
                        background: "rgba(127,127,127,0.22)",
                        overflow: "hidden",
                      },
                    },
                    h("div", {
                      style: {
                        width: Math.min(100, Math.max(0, pct)) + "%",
                        height: "100%",
                        background: "#4c8dff",
                        transition: "width .3s ease",
                      },
                    }),
                  )
                  : null,
                h("div", { className: "row" },
                  h("button", { onClick: openLogin, disabled: busy }, "打开扫码页"),
                  h("button", { className: "ghost", onClick: () => load() }, "刷新状态"),
                ),
              )
            : null,
          nap.error ? h("div", { className: "msg err" }, String(nap.error)) : null,
          err ? h("div", { className: "msg err" }, err) : null,
        );
      }

      if (state && state.needsRestart) {
        const who = String(state.needsRestart.selfId || "");
        return h("div", { className: "qqa" },
          h("div", {
            className: "msg",
            style: { fontSize: "16px", fontWeight: 600, padding: "14px 16px", lineHeight: 1.7 },
          },
            "✅ 已登录 QQ " + who + "，配置已写回。",
            h("br"),
            "现在请完全退出 DeepSeek Harness，再重新启动 —— QQ 接入才会真正开始工作。",
          ),
          h(Card, { title: "接下来" },
            h("ol", { style: { margin: 0, paddingLeft: "20px", lineHeight: 1.9 } },
              h("li", null, "托盘图标右键 → 退出（不要只关窗口，要完全退出）"),
              h("li", null, "重新打开 DeepSeek Harness"),
              h("li", null, "这一屏会变成正常面板，QQ 接入自动启动"),
            ),
            h("div", { className: "hint", style: { marginTop: "10px" } },
              "如果不重启，插件会一直以为还没登录 —— 因为它启动时读到的 selfId 还是空的。"),
          ),
          err ? h("div", { className: "msg err" }, err) : null,
        );
      }

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
      // 下拉框显示的必须是 form 里真正存着的值。
      // 以前这里是「找不到就退回列表第一项」：面板显示一个合法组合，
      // form 里躺着另一个，保存时写下去的既不是看到的也不是想要的。
      const storedProviderMissing = Boolean(form.modelProvider && !providerNames.includes(form.modelProvider));
      const activeProvider = form.modelProvider || (providerGroups[0]?.id ?? "");
      const modelsForProvider = providerGroups.find((g) => g.id === activeProvider)?.models ?? [];
      const storedModelMissing = Boolean(form.modelId && !modelsForProvider.some((m) => m.id === form.modelId));
      const activeModel = form.modelId || (modelsForProvider[0]?.id ?? "");
      const defaultLabel = catalog.default && catalog.default.provider
        ? catalog.default.provider + " / " + catalog.default.model
          + (catalog.default.reasoningEffort ? " · 推理 " + catalog.default.reasoningEffort : "")
        : "（未设置）";
      const totalModels = providerGroups.reduce((sum, g) => sum + g.models.length, 0);
      // 已存的组合是不是真的存在？不存在时下拉框会显示成「失效项」（见下面的 option），
      // 让人一眼看出配置是坏的，而不是看到一个被悄悄替换掉的合法值。
      const storedModelInvalid = Boolean(!form.modelFollowDefault && (storedProviderMissing || storedModelMissing));
      // 只有当前这组 provider/model 的菜单才算数：请求还在路上时
      // 不能拿上一组的档位凑数，那正是「显示一个、存下去另一个」的老毛病。
      const reasoningEfforts = reasoning.provider === activeProvider && reasoning.model === activeModel
        ? (reasoning.efforts ?? [])
        : [];
      const activeReasoning = form.modelReasoningEffort || "";
      const reasoningMissing = Boolean(activeReasoning && !reasoningEfforts.some((r) => r.id === activeReasoning));
      // 城市名和经纬度明显对不上时给个提示。查天气只用经纬度，
      // 所以真正错的是哪一边要靠人来判断。
      const cityWarning = cityDistanceWarning(form.wxCity, form.wxLat, form.wxLon);
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


      /**
       * 重抽今天的主动消息安排。
       *
       * 只清 fired（已触发记录），不动 sent（真实发送记录）——
       * 清掉 sent 会让配额从零开始，一天能发出的次数就超过上限了。
       */
      const reseedToday = async () => {
        setBusy(true); setErr(""); setMsg("");
        try {
          const res = await fetch(API + "/life/action", {
            method: "POST", credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "reset-today" }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "重抽失败");
          const wins = data.proactive?.windowsToday ?? [];
          setMsg("已重抽：" + (wins.length ? "今天 " + wins.join("、") : "今天没有安排"));
          await load();
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
            // 项目主页：只显示 GitHub 图标，不明文暴露链接。
            h("button", {
              className: "ghost icon",
              title: "在 GitHub 上查看项目",
              "aria-label": "在 GitHub 上查看项目",
              onClick: () => window.open(REPO_URL, "_blank", "noopener,noreferrer"),
            },
              h("svg", {
                width: "16", height: "16", viewBox: "0 0 16 16",
                fill: "currentColor", "aria-hidden": "true",
              },
                h("path", {
                  fillRule: "evenodd",
                  d: "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 16 8c0-4.42-3.58-8-8-8z",
                }),
              ),
            ),
            h("button", { className: "ghost", onClick: () => setShowGuide((v) => !v) }, showGuide ? "收起教程" : "配置教程"),
            h("button", { className: "ghost", onClick: () => load(), disabled: busy }, "刷新"),
          ),
        ),

        // 配置教程抽屉。内容要能独立看懂：首次配置两步、为什么重启两次、
        // 以及最容易被忽略的「NapCat 只在后台跑、没有窗口」。
        showGuide
          ? h(Card, { title: "配置教程" },
              h("div", { style: { lineHeight: 1.9, fontSize: "13px" } },
                // 教程最前面：「改完忘了点保存」是最高频的困惑 ——
                // 面板上改了值、开关也拨了，但没点最下面的按钮，等于什么都没做。
                h("div", {
                  style: {
                    border: "2px solid rgba(214,90,60,0.6)",
                    background: "rgba(214,90,60,0.10)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    margin: "0 0 18px",
                  },
                },
                  h("div", { style: { fontWeight: 700, fontSize: "14px", marginBottom: "8px" } }, "⚠ 改完配置一定要点最下方的「保存设置」"),
                  h("div", { style: { marginBottom: "8px" } }, "面板上的输入框、开关、下拉框都只是本地草稿。不点保存，它们不会写进 config.json，刷新页面就全变回去了。"),
                  h("div", { style: { marginBottom: "6px" } }, "正确顺序：改完 → 滚到页面最底部 → 点「保存设置」→ 看到提示「已保存」→ 需要重启的再重启 DSH。"),
                  h("div", { className: "hint", style: { margin: "6px 0 0" } }, "按钮上带 * 号（显示成「保存设置 *」）说明还有未保存的修改。这个星号是最可靠的判断依据。"),
                ),
                // 「话还没说完就回了」是咨询里最高频的一条，放在教程最前面并加重底色。
                h("div", {
                  style: {
                    border: "1px solid rgba(214,148,50,0.55)",
                    background: "rgba(214,148,50,0.10)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    margin: "0 0 18px",
                  },
                },
                  h("div", { style: { fontWeight: 700, fontSize: "14px", marginBottom: "8px" } }, "★ 她话还没说完就回了？先看「批量窗口」"),
                  h("div", { style: { marginBottom: "8px" } }, "插件不是收到一句就回一句。消息到达后先攒一会儿，等这个窗口过去、没有新消息进来，才把攒下的合并成一轮去问她。这个等待时间就是「批量窗口」。"),
                  h("div", { style: { marginBottom: "8px" } }, "默认是 1.2 秒：连发几句能合并，但两句话之间只要停了超过 1.2 秒，就会被当成「说完了」，于是她先回了一次 —— 这就是「抢话」的由来，不是她没在听。"),
                  h("div", { style: { fontWeight: 600, margin: "10px 0 4px" } }, "怎么调"),
                  h("div", { style: { marginBottom: "6px" } }, "这个值目前只能在配置文件里改，面板上没有输入框。把它交给 DSH 最省事："),
                  h("div", { style: { borderLeft: "3px solid rgba(214,148,50,0.65)", padding: "6px 0 6px 10px", margin: "0 0 8px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px" } }, "帮我把 C:\\Users\\你的用户名\\.dsh-qq-access\\config.json 里的 reply.debounceMs 改成 8000，其它字段不要动，改完告诉我。"),
                  h("div", { style: { marginBottom: "6px" } }, "或者自己改文件：找到 reply 这一段，加上 debounceMs（单位毫秒）："),
                  h("pre", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 8px", overflowX: "auto" } }, "{ \"reply\": { \"debounceMs\": 8000, ... } }"),
                  h("div", { style: { marginBottom: "6px" } }, "改完重启一次 DSH 才生效。"),
                  h("div", { style: { fontWeight: 600, margin: "10px 0 4px" } }, "挑多少合适"),
                  h("ul", { style: { margin: "0 0 8px", paddingLeft: "20px" } },
                    h("li", null, "1200（默认）：基本立刻回，像在抢话。"),
                    h("li", null, "5000–10000：说完一句、停下来想想，她还在等 —— 多数人觉得最自然。"),
                    h("li", null, "60000：等于放弃即时回复，退回「每分钟统一处理一次」的节奏。"),
                  ),
                  h("div", { className: "hint", style: { margin: "6px 0 0" } }, "窗口调大之后回复会变慢，但不会被切成好几截：窗口内的多条消息合并成一轮，靠前的句子仍然通过聊天记录进入上下文，不会丢。上限 600000（10 分钟）。"),
                ),
                h("div", { style: { fontWeight: 600, fontSize: "14px", margin: "16px 0 8px" } }, "① 登录成功之后，每次启动 DSH 还是会弹 NapCat 的网页？"),
                h("div", { style: { marginBottom: "8px" } }, "这不是坏了，也不是每次都要你扫码 —— 只是插件「以为可能要登录」，就顺手把网页打开了一次。账号是好的，你直接把这个网页关掉就行。"),
                h("div", { style: { marginBottom: "8px" } }, "想以后彻底不弹，下面三种办法任选一种："),
                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "办法 1：在面板里点一下（推荐）"),
                h("div", { style: { margin: "0 0 6px" } }, "打开 QQ 接入面板 → 往下滚到「NapCat」卡片 → 找到「需要登录时自动打开 WebUI 浏览器」→ 关掉 → 点保存。"),
                h("div", { className: "hint", style: { margin: "6px 0 12px" } }, "这个开关属于 NapCat 配置，保存后要重启一次 DSH 才生效。以后再想扫码，点「打开 NapCat 登录页」按钮手动打开就行。"),
                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "办法 2：直接让 DSH 帮你改（懒人版）"),
                h("div", { style: { margin: "0 0 6px" } }, "把下面这句话复制给 DSH（或者任何能读写文件的 agent）："),
                h("div", { style: { borderLeft: "3px solid rgba(127,127,127,0.45)", padding: "6px 0 6px 10px", margin: "0 0 8px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px" } }, "帮我把 C:\\Users\\你的用户名\\.dsh-qq-access\\config.json 里的 napcat.autoOpenLogin 改成 false，其它字段不要动，改完告诉我。"),
                h("div", { style: { margin: "0 0 6px" } }, "agent 改完文件之后，你重启一次 DSH 就好了。"),
                h("div", { className: "hint", style: { margin: "6px 0 12px" } }, "「你的用户名」要换成你自己的。文件里还有 token 和密钥，所以要说清「其它字段不要动」。"),
                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "办法 3：手动改文件"),
                h("div", { style: { margin: "0 0 6px" } }, "用记事本打开："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "6px 10px", borderRadius: "6px", margin: "0 0 8px", wordBreak: "break-all" } }, "%USERPROFILE%\\.dsh-qq-access\\config.json"),
                h("div", { style: { margin: "0 0 6px" } }, "找到 napcat 这一段，把 autoOpenLogin 从 true 改成 false："),
                h("pre", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 8px", overflowX: "auto" } }, "{ \"napcat\": { \"autoOpenLogin\": false, ... } }"),
                h("div", { style: { margin: "0 0 6px" } }, "保存，然后重启 DSH。"),
                h("div", { className: "hint", style: { margin: "6px 0 12px" } }, "改之前建议先复制一份 config.json 做备份 —— 这个文件里存着 NapCat 的 token，改坏了就得重新扫码。"),
                h("div", { style: { fontWeight: 600, fontSize: "14px", margin: "16px 0 8px" } }, "② API Key：和风天气 + Steam"),
                h("div", { style: { marginBottom: "10px" } }, "两个 Key 都免费，都不填也不影响聊天，只是对应的功能用不了。"),

                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "和风天气"),
                h("ol", { style: { margin: "0 0 6px", paddingLeft: "20px" } },
                  h("li", null, "打开 dev.qweather.com，用邮箱注册（免费版够用，不需要绑卡）。"),
                  h("li", null, "注册后进「控制台」→「项目管理」→「创建项目」。"),
                  h("li", null, "在项目里点「添加数据」，选「天气预报」这一类。"),
                  h("li", null, "回到项目页，复制那串 API KEY。"),
                  h("li", null, "粘到面板【虚拟人生】卡片下的「天气」一栏，再填城市名和经纬度 → 点最下方「保存设置」。"),
                ),
                h("div", { className: "hint", style: { margin: "0 0 6px" } },
                  "注意事项："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "20px", fontSize: "12.5px" } },
                  h("li", null, "Key 只认 8–128 位的字母、数字和 . _ - 。别把整段说明文字粘进去，否则会被当成无效值丢掉。"),
                  h("li", null, "经纬度必须填对 —— 查天气只用经纬度，城市名只用于提示词。面板会检查城市和经纬度是否明显对不上。"),
                  h("li", null, "和风的公共域名（api.qweather.com）正在停用，如果面板里填了 API Host，要用你自己控制台给的那个。"),
                  h("li", null, "免费额度有每日调用上限，被限流时天气会静默退化成「按季节猜」，不会报错。"),
                ),

                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "Steam"),
                h("ol", { style: { margin: "0 0 6px", paddingLeft: "20px" } },
                  h("li", null, "打开 steamcommunity.com/dev/apikey，用你的 Steam 账号登录。"),
                  h("li", null, "「Domain Name」随便填，通常写 localhost 就行 —— 这一栏 Steam 不校验，填什么都不影响 Key 的权限。"),
                  h("li", null, "同意条款 → 点「Register」，页面会直接显示 32 位十六进制的 Key。"),
                  h("li", null, "粘到面板【Steam】卡片的「API Key」→ 打开「接入 Steam 状态」→ 点最下方「保存设置」。"),
                  h("li", null, "再在下方「绑定表」里填你的 QQ 号和 17 位 SteamID64，点「绑定」。"),
                ),
                h("div", { className: "hint", style: { margin: "0 0 6px" } },
                  "注意事项："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "20px", fontSize: "12.5px" } },
                  h("li", null, "Steam 的「游戏详情」隐私必须设为公开，否则拿不到游戏时长（接口返回空对象，不报错，很容易以为是「没玩过游戏」）。"),
                  h("li", null, "Key 是绑定在你 Steam 账号上的，永久有效、不会过期。想换只能先去 Steam 账号设置里注销旧的再重新申请。"),
                  h("li", null, "Key 只在本地保存，不会发给任何人。面板接口只回传「是否已保存」，不回传明文。"),
                  h("li", null, "如果以前申请过，打开那个页面会直接显示已有的 Key，不会再让你填域名。"),
                  h("li", null, "已经绑定过的 Steam 账号想换，先在「绑定表」里点「解绑」，再重新绑。"),
                ),

                h("div", { style: { fontWeight: 600, margin: "12px 0 4px" } }, "SteamID64 怎么找"),
                h("div", { style: { marginBottom: "6px" } }, "打开你的 Steam 个人资料页，地址栏里那串 17 位数字就是："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "6px 10px", borderRadius: "6px", margin: "0 0 8px", wordBreak: "break-all" } }, "steamcommunity.com/profiles/7656119xxxxxxxxxx"),
                h("div", { className: "hint", style: { margin: "0 0 10px" } },
                  "如果你把资料页设成了自定义地址（/id/xxx），需要先在 Steam 客户端「编辑个人资料」里看到 SteamID。第三方查询站点也可以，但要注意别把 SteamID 贴给不可信的网站。"),
                h("div", { style: { fontWeight: 600, fontSize: "14px", margin: "16px 0 8px" } }, "③ 各模块是干什么的、什么时候要调"),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "模型"),
                  h("div", { className: "hint" }, "平时就「跟随宿主默认」不用管。想让她用另一个更便宜/更聪明的模型时才关掉，单独指定服务商和模型。换服务商时记得重选模型，否则保存会退回默认。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "回复"),
                  h("div", { className: "hint" }, "私聊默认会回。群聊默认只归档不回 —— 想让她在群里说话才需要改。选「智能判断」后，配好「她的名字」和「感兴趣的话题」，被叫到就回，否则打分够阈值才回；嫌吵就调高阈值。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "访问控制"),
                  h("div", { className: "hint" }, "不想被陌生人私聊打扰就设成「白名单」；不想进某些群就设「禁用」或屏蔽该群。管理员 QQ 号填你自己的另一个号，用来私聊远程管理插件。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "人格设定"),
                  h("div", { className: "hint" }, "觉得她说话不像你想要的样子时再改。只影响语气和习惯，不会覆盖系统提示；留空就用默认人设。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "NapCat"),
                  h("div", { className: "hint" }, "一般不用动。见第 ① 条：自动打开浏览器、启动宽限期都在这里。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "会话与上下文"),
                  h("div", { className: "hint" }, "她记不住刚才聊到哪，就调大「每次带多少条历史」。这条越大越连贯，但每次请求也越慢越贵。会话空闲太久会被回收，想让她一直记得就调大「会话保留时间」或设成永不回收。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "虚拟生活与主动消息"),
                  h("div", { className: "hint" }, "想让她有自己的作息、主动找你说话，就开这个。嫌她找你太频繁就调小「每日上限」、调大「最小间隔」；想让她早上也找你，就调「宽限期」。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "长期记忆与情感"),
                  h("div", { className: "hint" }, "想让她记住你之前说过的事、并对你有情绪变化，保持开启即可。嫌慢可以关掉「用模型提炼」，但记得会不准一些。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "表情包"),
                  h("div", { className: "hint" }, "想让她发图就开着。怕乱发表情就打开「需要审核」，新图先进待审核池，你挑过她才会用。关掉「视觉分类」可以省掉每张图的模型调用。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "QQ 空间"),
                  h("div", { className: "hint" }, "想让她自己发说说、评论别人动态时才开。嫌发得勤就调小「每日发布机会」。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "联网与天气"),
                  h("div", { className: "hint" }, "需要她查天气、搜索最新消息才填。两个都不填也不影响聊天。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "归档"),
                  h("div", { className: "hint" }, "默认留 30 天。想永久保留聊天记录就把「永久保存」打开。"),
                ),
                h("div", { style: { marginBottom: "12px" } },
                  h("div", { style: { fontWeight: 600 } }, "主动消息测试"),
                  h("div", { className: "hint" }, "不用等到晚上，点一下就能立刻触发一次，旁边会显示为什么发/为什么没发。"),
                ),
                h("div", { style: { fontWeight: 600, fontSize: "14px", margin: "16px 0 8px" } }, "④ 改坏了怎么办"),
                h("div", { style: { margin: "0 0 6px" } }, "别直接删 config.json —— 那里面有 NapCat 的 token，删了要重新扫码。先把旧文件改个名备份："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "6px 10px", borderRadius: "6px", margin: "0 0 8px", wordBreak: "break-all" } }, "%USERPROFILE%\\.dsh-qq-access\\config.json → config.json.bak"),
                h("div", { style: { margin: "0 0 6px" } }, "再重启 DSH，就会重新走一遍首次配置。"),
                h("div", { className: "hint", style: { margin: "6px 0 12px" } }, "面板里每一处改动都是单独提交的，只改你动过的那几项，不会把别的设置冲掉。"),
              ),
            )
          : null,

        h(Card, { title: "模型" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "跟随宿主默认"),
              h("div", { className: "hint" }, "开启时使用 DSH 全局默认模型（当前：" + defaultLabel + "）；关闭后可任选下面列出的任意模型")),
            h(Switch, {
              checked: form.modelFollowDefault,
              onChange: (v) => {
                // 关掉「跟随默认」时，下拉框必须立刻有合法值。否则 form 里还是空的，
                // 用户看到的是列表第一项，保存下去却是 null（又变回跟随默认）。
                setDirty(true);
                setForm((prev) => {
                  if (v) return { ...prev, modelFollowDefault: true };
                  const provider = providerNames.includes(prev.modelProvider) ? prev.modelProvider : (providerGroups[0]?.id ?? "");
                  const models = providerGroups.find((g) => g.id === provider)?.models ?? [];
                  const model = models.some((m) => m.id === prev.modelId) ? prev.modelId : (models[0]?.id ?? "");
                  return { ...prev, modelFollowDefault: false, modelProvider: provider, modelId: model, modelReasoningEffort: "" };
                });
              },
            }),
          ),
          form.modelFollowDefault ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "服务商"),
              h("div", { className: "hint" }, "共 " + providerGroups.length + " 个可用服务商，合计 " + totalModels + " 个模型")),
            h("select", {
              value: activeProvider,
              onChange: (e) => {
                // 换服务商时必须把模型重置为新服务商的第一个。
                // 否则旧服务商的模型 ID 会留在 form 里 —— 那正是「面板看着正常、
                // 存下去是坏组合」的来源。
                const next = e.target.value;
                const models = providerGroups.find((g) => g.id === next)?.models ?? [];
                setDirty(true);
                setForm((prev) => ({ ...prev, modelProvider: next, modelId: models[0]?.id ?? "", modelReasoningEffort: "" }));
              },
            },
              // 存着的服务商在宿主目录里已经没有了：把它作为一项显示出来，
              // 别让下拉框默默跳到第一个服务商 —— 那看起来像「已选中」。
              storedProviderMissing
                ? h("option", { key: "__missing_provider__", value: form.modelProvider }, form.modelProvider + "（宿主已无此服务商）")
                : null,
              providerGroups.map((g) => h("option", { key: g.id, value: g.id }, g.name + "（" + g.models.length + "）")),
            ),
          ),
          form.modelFollowDefault ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "模型"),
              h("div", { className: "hint" }, "列表来自宿主实时目录，服务商增删模型无需更新插件")),
            h("select", {
              value: activeModel,
              onChange: (e) => {
                // 换模型就换了一套档位，旧等级留着等于往不支持它的模型上写。
                const next = e.target.value;
                setDirty(true);
                setForm((prev) => ({ ...prev, modelId: next, modelReasoningEffort: "" }));
              },
            },
              // 同理：模型 ID 不属于当前服务商时也显示出来，而不是替换成第一个。
              storedModelMissing
                ? h("option", { key: "__missing_model__", value: form.modelId }, form.modelId + "（该服务商下没有这个模型）")
                : null,
              modelsForProvider.map((m) => h("option", { key: m.id, value: m.id }, m.name === m.id ? m.id : m.name + "（" + m.id + "）")),
            ),
          ),
          form.modelFollowDefault ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "推理等级"),
              h("div", { className: "hint" },
                reasoning.error
                  ? "读取宿主模型详情失败：" + reasoning.error
                  : reasoningEfforts.length
                    ? "越高越慢、越费 token；这里只列这个模型真正支持的档位"
                    : reasoning.provider === activeProvider && reasoning.model === activeModel
                      ? "这个模型没有可调档位，会用服务商自己的默认"
                      : "正在读取宿主支持的档位…")),
            h("select", {
              value: activeReasoning,
              onChange: (e) => patch("modelReasoningEffort")(e.target.value),
            },
              // 存着的档位在这个模型上不存在时也要显示出来，
              // 否则下拉框会默默跳到「服务商默认」，看起来像没设过。
              reasoningMissing
                ? h("option", { key: "__missing_effort__", value: activeReasoning }, activeReasoning + "（该模型没有这一档）")
                : null,
              h("option", { value: "" }, reasoning.defaultEffort ? "服务商默认（" + reasoning.defaultEffort + "）" : "服务商默认"),
              reasoningEfforts.map((r) => h("option", { key: r.id, value: r.id }, r.name === r.id ? r.id : r.name + "（" + r.id + "）")),
            ),
          ),
          (catalog.failures ?? []).length
            ? h("div", { className: "hint" }, "部分服务商读取失败：" + catalog.failures.map((f) => f.name + "（" + f.message + "）").join("；"))
            : null,
          providerGroups.length === 0
            ? h("div", { className: "hint" }, "宿主未返回任何可用模型；此时只能跟随默认。")
            : null,
          // 已存的模型在宿主目录里找不到：明确提示，并说明保存会退回默认。
          // 不说的话，用户看到的是「列表里明明有个合法选项」，根本不知道配置是坏的。
          storedModelInvalid
            ? h("div", { className: "hint", style: { color: "#c33" } },
              "已保存的模型 " + form.modelProvider + " / " + form.modelId + " 在宿主当前目录里不存在（这个服务商下没有该模型）。",
              h("br"),
              "带着它保存会让主动消息和回复静默失败。重新选一个再保存；直接保存会退回「跟随默认」。",
            )
            : null,
          h("div", { className: "hint" }, "切换模型后保存即生效：插件会丢弃已缓存的会话，下一条消息用新模型重开。"),
        ),

        h(Card, { title: "自动回复" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "避免重复说过的话"),
              h("div", { className: "hint" }, "她连续几轮说同一句（开场白、口头禅、同一个梗）时，先带着「你刚才已经说过」重问一次；重问后仍重复就照发，不会把回复吞掉")),
            h(Switch, { checked: form.avoidRepeat, onChange: (v) => patch("avoidRepeat")(v) }),
          ),
          form.avoidRepeat
            ? h("div", { className: "row" },
                h("div", null,
                  h("div", { className: "lbl" }, "复读相似度阈值"),
                  h("div", { className: "hint" }, "越高越严格。0.7 能抓住「加语气词、换标点、多一句尾巴」这类改写；0.9 只拦几乎逐字相同的。范围 0.5–1")),
                h("input", { type: "number", min: 0.5, max: 1, step: 0.05, value: form.repeatThreshold, onChange: (e) => patch("repeatThreshold")(e.target.value) }),
              )
            : null,
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "私聊自动回复"), h("div", { className: "hint" }, "关闭后仍会归档消息，只是不再自动生成回复")),
            h(Switch, { checked: form.replyPrivate, onChange: patch("replyPrivate") }),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "群聊回复"), h("div", { className: "hint" }, "默认关闭：群消息只归档不回。打开后「智能」= 被 @ / 被引用 / 被叫名字，或内容她感兴趣时才回")),
            h("select", { value: form.replyGroup, onChange: (e) => patch("replyGroup")(e.target.value) },
              h("option", { value: "off" }, "不回复（只归档）"),
              h("option", { value: "mention" }, "仅被 @ 时回复"),
              h("option", { value: "smart" }, "智能判断"),
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


          !form.lifeEnabled || !form.wxEnabled || !cityWarning ? null : h("div", { className: "hint", style: { color: "#c80" } },
            "城市写的是「" + String(form.wxCity ?? "").trim() + "」，但经纬度离它大约 " + cityWarning.km + " 公里。实际查天气用的是经纬度，确认一下哪边才是对的。"),
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
            h("div", null, h("div", { className: "lbl" }, "每天最多几次"), h("div", { className: "hint" }, "上限，不是固定值。实际次数每天按正态分布在 0 到这个数之间抽，均值是一半 —— 设 5 就平均 2-3 次。一次算一条完整消息，拆成几段发也只算一次")),
            h("input", { type: "number", min: 0, max: 24, value: form.lifeMaxPerDay, onChange: (e) => patch("lifeMaxPerDay")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "次数离散程度"),
              h("div", { className: "hint" }, "标准差 ÷ 均值。0.1 很集中，几乎每天发差不多那么多次；0.5 是标准钟形，中间多两头少；1.0 很散，接近均匀分布，0 次和上限都常见。范围 0.05–2，默认 0.5")),
            h("input", { type: "number", min: 0.05, max: 2, step: 0.05, value: form.lifeSpread, onChange: (e) => patch("lifeSpread")(e.target.value) }),
          ),
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "最小间隔（分钟）"), h("div", { className: "hint" }, "两次主动消息之间至少隔这么久，用来保证时间点不挤在一起")),
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
          // 手动重抽今天的安排：改了上限/离散度之后，窗口还是按旧参数算的，
          // 重抽一下就能立刻看到新结果，不用等到明天。
          // 只清「已触发」记录，不动真实发送记录，所以配额不会被重置。
          !form.lifeEnabled || !form.lifeProactive ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "重新抽取今天的安排"),
              h("div", { className: "hint" }, "按当前的上限、离散度、最小间隔重新算今天的次数和时间点。已发出的次数照常保留")),
            h("button", {
              className: "ghost",
              disabled: busy,
              onClick: reseedToday,
            }, busy ? "处理中…" : "重抽"),
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
              h("div", { className: "hint" }, "她话还没说完就回了？把这个调大。收到消息后等这么久、确认没有新消息才回复，窗口内的几句合并成一轮。默认 1.2 秒；5–10 秒多数人觉得最自然，60 秒等于每分钟统一处理一次。范围 0–600 秒，改完即时生效")),
            h("input", {
              type: "number", min: 0, max: 600, step: 0.1, value: form.debounceSec,
              onChange: (e) => patch("debounceSec")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "轮询间隔（秒）"),
              h("div", { className: "hint" }, "多久向 NapCat 查一次最近消息，补上推送丢失的部分。范围 15–3600 秒")),
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

        h(Card, { title: "Steam" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "接入 Steam 状态"),
              h("div", { className: "hint" }, "打开后她知道你此刻在玩什么、在线还是离线，可以在聊天里自然提起。需要先填 Steam Web API Key。")),
            h(Switch, { checked: form.steamEnabled, onChange: (v) => patch("steamEnabled")(v) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "API Key"),
              h("div", { className: "hint" }, "在 steamcommunity.com/dev/apikey 申请，32 位十六进制。" + (form.steamHasKey ? "当前已保存，留空表示不修改。" : ""))),
            h("input", { type: "password", placeholder: form.steamHasKey ? "已保存（留空不改）" : "粘贴 32 位 Key", value: form.steamKey, onChange: (e) => patch("steamKey")(e.target.value) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "缓存时间（秒）"),
              h("div", { className: "hint" }, "多久才真正问一次 Steam。调大省请求，调小更实时；填 0 表示每次都查。范围 0–86400")),
            h("input", { type: "number", min: 0, max: 86400, value: form.steamCacheSec, onChange: (e) => patch("steamCacheSec")(e.target.value) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "一起拉游戏时长"),
              h("div", { className: "hint" }, "关掉可少一个请求。开启需要 Steam 的「游戏详情」设为公开，否则拿不到时长。")),
            h(Switch, { checked: form.steamWithGames, onChange: (v) => patch("steamWithGames")(v) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "聊天时注入状态"),
              h("div", { className: "hint" }, "打开后她本来就知道你在玩什么，不用你问。关掉后她不知道，但在面板里仍然能看到状态。")),
            h(Switch, { checked: form.steamInject, onChange: (v) => patch("steamInject")(v) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "主动消息也注入"),
              h("div", { className: "hint" }, "打开后她主动找你时会知道你在玩什么，但提示词里明确要求不要每次都提这件事。")),
            h(Switch, { checked: form.steamInjectProactive, onChange: (v) => patch("steamInjectProactive")(v) }),
          ),
          !form.steamEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "只在私聊注入"),
              h("div", { className: "hint" }, "建议保持开启。群里还有别人，把你正在玩什么说出去不太合适。")),
            h(Switch, { checked: form.steamPrivateOnly, onChange: (v) => patch("steamPrivateOnly")(v) }),
          ),
          // 绑定表放在同一张卡片里：它属于 Steam 功能的一部分，
          // 分成两张卡会让人以为要分别开两个开关。
          h("div", { style: { marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(127,127,127,0.2)" } },
            h("div", { style: { fontWeight: 600, marginBottom: "6px" } }, "绑定表（QQ → Steam）"),
            h("div", { className: "hint", style: { marginBottom: "8px" } },
              "把 QQ 号和 Steam 账号关联起来。只有这里能绑，聊天里不能 —— SteamID 是公开信息，允许在群里绑的话，任何人都能把别人的 ID 绑到自己身上。"),
            (steamBindings || []).length === 0
              ? h("div", { className: "hint" }, "还没有任何绑定。")
              : (steamBindings || []).map((row) => h("div", { key: row.qq, className: "row", style: { alignItems: "flex-start" } },
                  h("div", null,
                    h("div", { className: "lbl" }, "QQ " + row.qq),
                    (row.bindings || []).map((b) => h("div", { key: b.steamId, className: "hint" },
                      b.steamId + (b.nickname ? "（" + b.nickname + "）" : "") + "  "
                      + h("button", { className: "ghost", style: { marginLeft: "6px", padding: "1px 8px" },
                          onClick: () => steamUnbind(row.qq, b.steamId) }, "解绑"))),
                  ),
                )),
            h("div", { className: "row", style: { marginTop: "10px" } },
              h("div", null,
                h("div", { className: "lbl" }, "新增绑定"),
                h("div", { className: "hint" }, "填 QQ 号和 17 位 SteamID64。绑完会立刻探一次，把 Steam 昵称带回来。")),
              h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
                ...(steamDrafts || []).map((draft, index) => h("div", { key: draft.id, style: { display: "flex", gap: "6px", alignItems: "center" } },
                  h("input", { type: "text", placeholder: "QQ 号", style: { width: "120px" }, value: draft.qq,
                    onChange: (e) => setSteamDraft(draft.id, { qq: e.target.value }) }),
                  h("input", { type: "text", placeholder: "7656119xxxxxxxxxx", style: { width: "180px" }, value: draft.steamId,
                    onChange: (e) => setSteamDraft(draft.id, { steamId: e.target.value }) }),
                  draft.done
                    ? h("span", { className: "hint", style: { color: "rgba(80,180,110,1)" } }, "✓ 已绑定")
                    : h("button", { className: "ghost", disabled: steamBindBusy, onClick: () => steamBindSubmit(draft.id) },
                        steamBindBusy ? "绑定中…" : "绑定"),
                  (steamDrafts || []).length > 1
                    ? h("button", { className: "ghost", style: { padding: "1px 8px" },
                        onClick: () => removeSteamDraft(draft.id) }, "×")
                    : null,
                )),
              ),
            ),
          ),
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
            h("div", null, h("div", { className: "lbl" }, "群白名单"), h("div", { className: "hint" }, "群号，逗号分隔；仅白名单群模式生效")),
            h("input", { type: "text", value: form.groupIds, onChange: (e) => patch("groupIds")(e.target.value), placeholder: "123456789" }),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "屏蔽的 QQ"), h("div", { className: "hint" }, "这些人的消息一律忽略，优先于其它设置")),
            h("input", { type: "text", value: form.blockedUsers, onChange: (e) => patch("blockedUsers")(e.target.value) }),
          ),
          h("div", { className: "row" },
            h("div", null, h("div", { className: "lbl" }, "屏蔽的群"), h("div", { className: "hint" }, "这些群一条都不收")),
            h("input", { type: "text", value: form.blockedGroups, onChange: (e) => patch("blockedGroups")(e.target.value) }),
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
          // 每次重启 DSH 都被弹一次 NapCat WebUI 的开关。
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "需要登录时自动打开 WebUI 浏览器"),
              h("div", { className: "hint" }, "关掉之后永远不会自动弹窗；要扫码时点下面的按钮手动打开")),
            h(Switch, { checked: form.autoOpenLogin, onChange: (v) => patch("autoOpenLogin")(v) }),
          ),
          form.autoOpenLogin
            ? h("div", { className: "row" },
                h("div", null,
                  h("div", { className: "lbl" }, "启动宽限期（秒）"),
                  h("div", { className: "hint" }, "NapCat 冷启动要几秒，这段时间连不上不算「需要登录」，不会弹窗。建议 20 秒")),
                h("input", { type: "number", min: 0, max: 300, value: form.loginGraceSec, onChange: (e) => patch("loginGraceSec")(e.target.value) }),
              )
            : null,
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
