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
      ".qqa .quicknav{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;background:rgba(127,127,127,.05)}",
      ".qqa .quicknav a{color:var(--dsw-alias-link,var(--dsw-alias-brand-primary));font-size:12px;line-height:18px;text-decoration:none;padding:2px 6px;border-radius:6px;white-space:nowrap}",
      ".qqa .quicknav a:hover{background:rgba(127,127,127,.12);text-decoration:underline}",
    ].join("");

    function ensureCss() {
      if (document.getElementById(CSS_ID)) return;
      const el = document.createElement("style");
      el.id = CSS_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    const splitIds = (value) => String(value ?? "").split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

    const CARD_IDS = {
      "模型": "card-model", "自动回复": "card-reply", "回复范围": "card-access",
      "虚拟人生": "card-life", "主动发动态": "card-qzone", "情感与关系": "card-emotion",
      "长期记忆": "card-memory", "表情包": "card-memes", "回复节奏": "card-rate",
      "Steam": "card-steam", "生图": "card-image", "人格设定": "card-persona",
      "归档": "card-archive", "链接解析": "card-link", "NapCat": "card-napcat",
    };
    function Card(props) {
      // UI 优化：按标题自动分配锚点 id，调用处写法不变（面板测试按源码文本校验）。
      const domId = props.id || CARD_IDS[props.title];
      return h("div", { className: "card", id: domId }, h("div", { className: "cardT" }, props.title), props.children);
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
            sharedAgent: data.config.reply.sharedAgent === true,
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
            commaSplit: data.config.reply?.commaSplit !== false,
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
            // 生图：走 DSH 的 provider 路由。默认豆包生图，但要用户明确打开。
            imgEnabled: data.config.image?.enabled === true,
            imgProvider: data.config.image?.provider ?? 'doubao',
            imgModel: data.config.image?.model ?? 'image-gen',
            imgTimeoutSec: Math.round((data.config.image?.timeoutMs ?? 120000) / 1000),
            imgMaxPerTurn: data.config.image?.maxPerTurn ?? 3,
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
            qzImage: data.config.qzoneProactive?.image?.enabled === true,
            qzImageMax: data.config.qzoneProactive?.image?.maxImages ?? 1,
            qzRight: data.config.qzoneProactive?.right ?? "default",
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
                // 是否按逗号分段。默认开（真人聊天就是一句一发），
                // 关了只按换行切 —— 代码、JSON、长英文句子就不会被切碎。
                commaSplit: Boolean(form.commaSplit),
                debounceMs: (() => {
                  const raw = Number(form.debounceSec);
                  const sec = Number.isFinite(raw) ? raw : 1.2;
                  return Math.round(Math.min(600, Math.max(0, sec)) * 1000);
                })(),
                avoidRepeat: Boolean(form.avoidRepeat),
      sharedAgent: Boolean(form.sharedAgent),
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
              image: {
                enabled: Boolean(form.imgEnabled),
                provider: String(form.imgProvider ?? '').trim() || 'doubao',
                model: String(form.imgModel ?? '').trim() || 'image-gen',
                timeoutMs: Math.round(Math.min(600, Math.max(10, Number(form.imgTimeoutSec) || 120)) * 1000),
                maxPerTurn: Math.round(Math.min(6, Math.max(1, Number(form.imgMaxPerTurn) || 3))),
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
                // 可见范围：配图说说是带照片的，公开面比纯文字大。
                // 「default」= 不传 ugc_right，沿用账号自己的设置，行为和以前一致。
                right: String(form.qzRight || "default"),
                // 动态配图：这里只记录「允不允许」，真正能不能拍还取决于
                // 【生图】开关与 dsh-connect-doubao 是否就绪 —— 面板上有说明。
                image: {
                  enabled: Boolean(form.qzImage),
                  maxImages: Math.round(Math.min(3, Math.max(1, Number(form.qzImageMax) || 1))),
                },
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

        // UI 优化：17 个卡片平铺时改一个开关要滚很久。这里给出分组跳转条，
        // 用原生锚点（面板滚动容器里也能用，不需要 JS 滚动逻辑）。
        h("div", { className: "quicknav" },
          h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-tertiary)" } }, "快速跳转："),
          h("a", { href: "#card-model" }, "模型"),
          h("a", { href: "#card-reply" }, "自动回复"),
          h("a", { href: "#card-access" }, "回复范围"),
          h("a", { href: "#card-life" }, "虚拟人生"),
          h("a", { href: "#card-qzone" }, "主动动态"),
          h("a", { href: "#card-emotion" }, "情感"),
          h("a", { href: "#card-memory" }, "记忆"),
          h("a", { href: "#card-memes" }, "表情包"),
          h("a", { href: "#card-rate" }, "回复节奏"),
          h("a", { href: "#card-image" }, "生图"),
          h("a", { href: "#card-steam" }, "Steam"),
          h("a", { href: "#card-persona" }, "人格"),
          h("a", { href: "#card-archive" }, "归档"),
          h("a", { href: "#card-link" }, "链接解析"),
          h("a", { href: "#card-napcat" }, "NapCat"),
        ),
        // UI 优化：保存按钮原来只在页尾，改完上面的设置要滚到底才能保存。
        // 顶部也放一个，dirty 状态和页尾完全同步。
        h("div", { className: "row", style: { marginTop: "-4px" } },
          h("div", null),
          h("button", { onClick: save, disabled: busy }, busy ? "保存中…" : (dirty ? "保存设置 *" : "保存设置")),
        ),
        // 配置教程抽屉。内容要能独立看懂：首次配置两步、为什么重启两次、
        // 以及最容易被忽略的「NapCat 只在后台跑、没有窗口」。
        showGuide
          ? h(Card, { title: "配置教程" },
              h("div", { style: { lineHeight: 1.9, fontSize: "13px" } },
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
                  h("div", { style: { marginBottom: "6px" } }, "正确顺序：改完 → 滚到页面最底部 → 点「保存设置」→ 看到「已保存」→ 需要重启的再重启 DSH。"),
                  h("div", { className: "hint", style: { margin: "6px 0 0" } }, "按钮上带 * 号（显示成「保存设置 *」）说明还有未保存的修改。这个星号是最可靠的判断依据。"),
                ),
                h("div", {
                  style: {
                    border: "1px solid rgba(214,148,50,0.55)",
                    background: "rgba(214,148,50,0.10)",
                    borderRadius: "8px",
                    padding: "12px 14px",
                    margin: "0 0 20px",
                  },
                },
                  h("div", { style: { fontWeight: 700, fontSize: "14px", marginBottom: "8px" } }, "★ 哪些改动要重启、哪些立刻生效"),
                  h("div", { style: { marginBottom: "6px" } }, "立刻生效（保存按钮会提示「已即时生效」）：回复节奏、批量窗口、生图开关与数量、Steam 开关、虚拟生活、表情包、情感、记忆、访问控制、人格。"),
                  h("div", { style: { marginBottom: "6px" } }, "要重启 DSH：NapCat 相关（模式、端口、自动打开浏览器）、模型服务商与模型名、生图的服务商与模型名。"),
                  h("div", { className: "hint", style: { margin: "6px 0 0" } }, "拿不准就重启一次，不会有副作用。"),
                ),
                // 快速跳转：8 个章节锚点。教程很长，没有这个用户只能一路滚。
                // <a href="#id"> 在面板的滚动容器里也能用，不需要 JS。
                h("div", { style: {
                  display: "flex", flexWrap: "wrap", gap: "8px",
                  padding: "12px 14px", margin: "20px 0 20px",
                  border: "1px solid rgba(127,127,127,0.28)",
                  borderRadius: "8px", background: "rgba(127,127,127,0.06)",
                } },
                  h("div", { style: { width: "100%", fontWeight: 600, fontSize: "12.5px", marginBottom: "2px" } }, "快速跳转"),
                  h("a", { href: "#guide-save", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "1. 保存机制"),
                  h("a", { href: "#guide-login", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "2. 首次登录"),
                  h("a", { href: "#guide-key", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "3. 获取 Key"),
                  h("a", { href: "#guide-ext", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "4. 扩展功能"),
                  h("a", { href: "#guide-reply", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "5. 回复与人格"),
                  h("a", { href: "#guide-panel", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "6. 面板说明"),
                  h("a", { href: "#guide-restore", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "7. 配置恢复"),
                  h("a", { href: "#guide-tips", style: { fontSize: "12.5px", padding: "3px 10px", borderRadius: "999px", border: "1px solid rgba(127,127,127,0.35)", textDecoration: "none", color: "inherit", background: "rgba(127,127,127,0.10)" } }, "8. 使用建议"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "本文介绍 DSH QQ 插件的安装初始化、功能配置及常见问题处理。建议第一次使用时按照章节顺序操作，熟悉插件后再根据自己的需求调整各项设置。"),
                h("div", { id: "guide-save", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "1. 修改配置前，先了解保存机制"),
                h("div", { style: { marginBottom: "8px" } }, "⚠️ 修改配置后，一定要点击页面最下方的「保存设置」。"),
                h("div", { style: { marginBottom: "8px" } }, "面板上的输入框、开关和下拉选项在修改时都只是临时草稿，并不会立即写入 `config.json`。只有点击「保存设置」后，修改才会真正生效并保存到本地。"),
                h("div", { style: { marginBottom: "8px" } }, "每次修改配置后，按照以下步骤操作："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "完成需要的修改。"),
                  h("li", null, "滚动到页面最底部，点击「保存设置」。"),
                  h("li", null, "看到「已保存」提示后，说明配置已经写入。"),
                  h("li", null, "根据配置项的要求决定是否重启 DSH。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "保存按钮显示为「保存设置 *」时，说明还有修改没有保存。看到这个星号，就意味着当前配置尚未提交。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "哪些配置需要重启？"),
                h("div", { style: { marginBottom: "8px" } }, "插件中的配置分为两种生效方式："),
                h("table", { style: { borderCollapse: "collapse", width: "100%", margin: "0 0 10px", fontSize: "12.5px" } },
                  h("tr", null,
                    h("th", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 600 } }, "保存后立即生效"),
                    h("th", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 600 } }, "保存后需要重启 DSH"),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "回复节奏、批量窗口"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "NapCat 相关配置"),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "生图开关、生成数量"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "模型服务商、模型名称"),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "Steam 开关"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "生图服务商、生图模型"),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "虚拟生活"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "表情包"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "情感与关系"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "长期记忆"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "访问控制"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                  h("tr", null,
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, "人格设定"),
                    h("td", { style: { border: "1px solid rgba(127,127,127,0.3)", padding: "6px 8px", textAlign: "left", fontWeight: 400 } }, ""),
                  ),
                ),
                h("div", { style: { marginBottom: "8px" } }, "保存时，面板也会提示配置是否已经即时生效。"),
                h("div", { style: { marginBottom: "8px" } }, "不确定某项配置是否需要重启时，保存后重新启动一次 DSH 即可。"),
                h("div", { id: "guide-login", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "2. 首次启动与 QQ 登录"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "2.1 完成首次登录"),
                h("div", { style: { marginBottom: "8px" } }, "插件安装完成并填写 QQ 号码后，需要使用手机 QQ 扫码登录 NapCat。"),
                h("div", { style: { marginBottom: "8px" } }, "首次启动需要经过两次启动流程，属于正常的初始化过程。"),
                h("div", { style: { marginBottom: "8px" } }, "第一次启动："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "启动 DSH，插件会自动下载 NapCat，文件约 100 MB，面板会显示下载进度。"),
                  h("li", null, "下载完成后，会弹出扫码登录窗口。"),
                  h("li", null, "使用手机 QQ 扫描二维码，完成登录。"),
                  h("li", null, "登录成功后，插件会自动将 QQ 号码写入配置。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "第二次启动："),
                h("div", { style: { marginBottom: "8px" } }, "扫码成功后，重新启动 DSH。这次插件才会正式开始收发 QQ 消息。"),
                h("div", { style: { marginBottom: "8px" } }, "NapCat 默认在后台运行，不会一直显示独立窗口。需要查看运行情况时，可以在面板的【NapCat 状态】卡片中查看；需要重新扫码时，点击「打开 NapCat 登录页」即可。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "2.2 启动 DSH 时总是弹出 NapCat 网页？"),
                h("div", { style: { marginBottom: "8px" } }, "这通常不是登录异常，也不代表每次都需要重新扫码。插件可能会在启动时自动打开 NapCat WebUI，以便检查登录状态。"),
                h("div", { style: { marginBottom: "8px" } }, "如果账号已经正常登录，直接关闭网页即可，不影响消息收发。"),
                h("div", { style: { marginBottom: "8px" } }, "不想让它自动弹出网页，可以选择以下任意一种方式关闭。"),
                h("div", { style: { marginBottom: "8px" } }, "方法一：在面板中修改（推荐）"),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开【NapCat】卡片。"),
                  h("li", null, "关闭「需要登录时自动打开 WebUI 浏览器」。"),
                  h("li", null, "点击「保存设置」。"),
                  h("li", null, "重启 DSH。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "之后需要扫码时，再手动点击「打开 NapCat 登录页」即可。"),
                h("div", { style: { marginBottom: "8px" } }, "方法二：让 Agent 修改配置"),
                h("div", { style: { marginBottom: "8px" } }, "可以将下面的指令发送给有本地文件读写权限的 DSH 或其他 Agent："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 10px", wordBreak: "break-all" } }, "帮我把 C:\\Users\\你的用户名\\.dsh-qq-access\\config.json 里的 napcat.autoOpenLogin 改成 false，其它字段不要动，改完告诉我。"),
                h("div", { style: { marginBottom: "8px" } }, "修改完成后，重启 DSH。"),
                h("div", { style: { marginBottom: "8px" } }, "配置文件中还包含 NapCat Token 等敏感信息，所以一定要明确要求 Agent 不要改动其他字段。"),
                h("div", { style: { marginBottom: "8px" } }, "方法三：手动修改"),
                h("div", { style: { marginBottom: "8px" } }, "配置文件位于："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 10px", wordBreak: "break-all" } }, "%USERPROFILE%\\.dsh-qq-access\\config.json"),
                h("div", { style: { marginBottom: "8px" } }, "找到 napcat 配置段，将 \"autoOpenLogin\": true 改为 \"autoOpenLogin\": false。"),
                h("div", { style: { marginBottom: "8px" } }, "保存文件并重启 DSH 即可。"),
                h("div", { style: { marginBottom: "8px" } }, "修改前建议先备份 config.json，避免误改其他配置。文件中保存着 NapCat Token，修改不当可能导致需要重新扫码登录。"),
                // ── 2.3 更新插件 ─────────────────────────────────────
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "2.3 更新插件时要注意什么"),
                h("div", { style: { marginBottom: "8px" } }, "更新插件必须先关掉 DSH，再换包，最后重新启动。"),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "关掉 DSH。"),
                  h("li", null, "执行 dsh plugin remove / add，或替换 tgz 安装包。"),
                  h("li", null, "重新启动 DSH。"),
                ),
                // 这条是真实事故：一边跑一边换包，旧实例变成僵尸，占着端口，
                // 新实例起不来，表现是「插件面板正常、QQ 也登着，但她一条都不回」。
                h("div", { className: "hint", style: { margin: "6px 0 10px" } },
                  "不要一边运行一边换包。那样会留下一个已经失效、却仍在占着端口的旧实例：",
                  "面板看着一切正常，她也收得到消息，但就是一条都不回。"),
                h("div", { style: { marginBottom: "8px" } }, "怎么判断是不是这种情况？看 debug.log，如果每分钟出现一条："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 10px", wordBreak: "break-all" } },
                  "QQ 自动回复失败 (Error) Error: cannot get required service \"agents\" in inactive context"),
                h("div", { style: { marginBottom: "8px" } }, "那就重启一次 DSH，问题会消失。1.4.1 起插件会自己识别并退出，但那只是兜底。"),

                h("div", { id: "guide-key", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "3. 获取 API Key"),
                h("div", { style: { marginBottom: "8px" } }, "插件支持接入和风天气与 Steam。两项服务都有免费的使用额度，不配置也不会影响基本聊天，只是无法使用对应功能。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "3.1 和风天气"),
                h("div", { style: { marginBottom: "8px" } }, "和风天气用于获取虚拟人物所在地的天气信息。"),
                h("div", { style: { marginBottom: "8px" } }, "获取 Key："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开和风天气开发平台（dev.qweather.com），使用邮箱注册。"),
                  h("li", null, "登录控制台，进入「项目管理」并创建项目。"),
                  h("li", null, "在项目中点击「添加数据」，选择天气预报相关服务。"),
                  h("li", null, "返回项目页面，复制 API Key。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "填写配置："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开插件面板中的【虚拟人生】卡片。"),
                  h("li", null, "将 API Key 填入天气配置栏。"),
                  h("li", null, "填写城市名称和对应的经纬度。"),
                  h("li", null, "点击「保存设置」。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "几个容易出错的地方："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "API Key 长度为 8–128 位，只能包含字母、数字以及 . _ -，不要把其他说明文字一起复制进去。"),
                  h("li", null, "天气查询实际使用的是经纬度，城市名称主要用于提示词。经纬度填错会导致查询地点不正确。"),
                  h("li", null, "和风天气公共域名 api.qweather.com 正在停用。如果需要填写 API Host，请使用控制台提供的地址。"),
                  h("li", null, "免费版有每日调用额度限制。超过额度后，天气功能可能会退化为根据季节推测天气，而不是直接报错。"),
                ),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "3.2 Steam"),
                h("div", { style: { marginBottom: "8px" } }, "Steam 接入后，插件可以获取绑定账号的游戏状态，例如当前正在玩的游戏。"),
                h("div", { style: { marginBottom: "8px" } }, "获取 Key："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开 Steam API Key 申请页面（steamcommunity.com/dev/apikey）。"),
                  h("li", null, "使用 Steam 账号登录。"),
                  h("li", null, "在「Domain Name」中填写 localhost 即可。"),
                  h("li", null, "同意相关条款，点击 Register。"),
                  h("li", null, "页面会显示一串 32 位十六进制 Key，复制备用。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "填写配置："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开面板中的【Steam】卡片。"),
                  h("li", null, "将 Key 粘贴到 API Key 输入框。"),
                  h("li", null, "开启「接入 Steam 状态」。"),
                  h("li", null, "点击「保存设置」。"),
                  h("li", null, "在下方的「绑定表」中填写 QQ 号码和对应的 17 位 SteamID64。"),
                  h("li", null, "点击「绑定」完成关联。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "注意事项："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "Steam 隐私设置中的「游戏详情」必须设为公开，否则插件可能无法获取游戏时长等信息。"),
                  h("li", null, "如果游戏详情设置为私密，API 可能返回空对象而不报错，容易误以为账号没有游戏记录。"),
                  h("li", null, "API Key 绑定在 Steam 账号上，长期有效。需要更换时，先到 Steam 端注销原来的 Key。"),
                  h("li", null, "Key 只保存在本地，面板只会返回是否保存成功的状态，不会回传明文。"),
                  h("li", null, "更换绑定账号时，先在「绑定表」中点击「解绑」，再重新绑定即可。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "如何查找 SteamID64？"),
                h("div", { style: { marginBottom: "8px" } }, "打开 Steam 个人资料页面，查看浏览器地址栏。"),
                h("div", { style: { marginBottom: "8px" } }, "如果地址是 steamcommunity.com/profiles/7656119xxxxxxxxxx，其中的 17 位数字就是 SteamID64。"),
                h("div", { style: { marginBottom: "8px" } }, "如果使用的是自定义地址，例如 /id/xxx，可以在 Steam 客户端的「编辑个人资料」中查找，也可以使用第三方查询工具。不要向不可信的网站提供账号凭据。"),
                h("div", { id: "guide-ext", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "4. 扩展功能"),
                h("div", { style: { marginBottom: "8px" } }, "以下功能可以按需启用，不使用时保持默认设置即可。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "4.1 生图"),
                h("div", { style: { marginBottom: "8px" } }, "生图功能允许她根据聊天内容主动生成图片，并通过 QQ 发送。"),
                h("div", { style: { marginBottom: "8px" } }, "使用前必须安装 dsh-connect-doubao。"),
                h("div", { style: { marginBottom: "8px" } }, "本插件本身不提供生图模型，而是调用 dsh-connect-doubao 注册的「豆包 生图」能力。因此，需要先安装该插件，并完成豆包扫码登录。"),
                h("div", { style: { marginBottom: "8px" } }, "在 DSH 终端中执行："),
                h("div", { style: { fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px", background: "rgba(127,127,127,0.12)", padding: "8px 10px", borderRadius: "6px", margin: "0 0 10px", wordBreak: "break-all" } }, "dsh plugin --profile desktop add dsh-connect-doubao"),
                h("div", { style: { marginBottom: "8px" } }, "安装完成后，打开 dsh-connect-doubao 的面板，扫码登录豆包。"),
                h("div", { style: { marginBottom: "8px" } }, "完成以上步骤后，再回到本插件的【生图】卡片进行配置。"),
                h("div", { style: { marginBottom: "8px" } }, "配置步骤："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "开启「允许她自己发图」。"),
                  h("li", null, "「服务商」保持为 doubao。"),
                  h("li", null, "「生图模型」保持为 image-gen。"),
                  h("li", null, "设置「每次最多发几张」，范围为 1–6。"),
                  h("li", null, "设置「超时（秒）」，默认值为 120。"),
                  h("li", null, "点击「保存设置」。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "服务商和模型使用默认值即可，一般不需要修改。"),
                h("div", { style: { marginBottom: "8px" } }, "参数说明："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "每次最多发几张：限制一次最多发送多少张图片。豆包通常一次返回 1–3 张，超过设置数量的图片只发送前几张。"),
                  h("li", null, "超时（秒）：限制单次生图请求的等待时间。一般生图需要 10–30 秒，默认 120 秒。如果超过设定时间仍未完成，插件会放弃本次生成，避免一直占用当前回复流程。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "其他说明："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "生图会消耗豆包额度，与聊天分开计费。"),
                  h("li", null, "修改生图开关、生成数量和超时时间后，保存即可生效。"),
                  h("li", null, "修改服务商或生图模型后，需要重启 DSH。"),
                  h("li", null, "豆包生成的图片会先下载为字节数据，再通过 QQ 发送。不能直接转发本机上的图片路径，否则 QQ 无法正常发送。"),
                  h("li", null, "不需要主动生图时，关闭「允许她自己发图」即可，其他配置会保留。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "如果出现「没有找到生图路由」或「生图模型没有开始回应」等提示，先检查 dsh-connect-doubao 是否安装，以及豆包是否已经完成登录。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "4.2 表情包"),
                h("div", { style: { marginBottom: "8px" } }, "表情包功能默认开启。"),
                h("div", { style: { marginBottom: "8px" } }, "如果不希望她直接使用未经筛选的新图片，可以开启「需要审核」。新图片会先进入待审核池，通过审核后才会被使用。"),
                h("div", { style: { marginBottom: "8px" } }, "「视觉分类」用于对图片进行分类。如果希望减少模型调用，可以关闭该选项。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "4.3 QQ 空间"),
                h("div", { style: { marginBottom: "8px" } }, "开启后，她可以主动发布 QQ 空间说说，也可以评论其他人的动态。"),
                h("div", { style: { marginBottom: "8px" } }, "如果觉得她发布得太频繁，可以调低「每日发布机会」。"),

                // ── 4.3.0 可见范围 ───────────────────────────────────
                h("div", { style: { fontWeight: 600, fontSize: "13px", margin: "16px 0 8px" } }, "说说可见范围"),
                h("div", { style: { marginBottom: "8px" } }, "「主动发动态」卡片里有一项「说说可见范围」，对定时动态、面板「立即发一条」和 qq_qzone_publish 都生效。"),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "跟随账号默认：不指定，用 QQ 空间自己的设置。默认就是这一项。"),
                  h("li", null, "公开 / 好友可见 / 仅自己可见。"),
                ),
                h("div", { className: "hint", style: { margin: "6px 0 10px" } },
                  "配图说说是带照片的，公开面比纯文字大 —— 不确定就先设成「好友可见」或「仅自己可见」。"),

                // ── 4.3.1 配图 ───────────────────────────────────────
                h("div", { style: { fontWeight: 600, fontSize: "13px", margin: "16px 0 8px" } }, "给说说配图"),
                h("div", { style: { marginBottom: "8px" } }, "打开「发说说时配一张图」后，她会按说说正文自己拍一张，随说说一起发出去。"),
                h("div", { style: { marginBottom: "8px" } }, "这个开关只决定「允不允许配图」。真正出图要靠【生图】，所以有三项前置条件："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "【生图】卡片里的开关是打开的。"),
                  h("li", null, "已安装 dsh-connect-doubao（安装方法见第 4.1 节）。"),
                  h("li", null, "已在那个插件的面板里登录豆包。"),
                ),
                h("div", { className: "hint", style: { margin: "6px 0 10px" } },
                  "任何一项没就绪，说说照样发出去，只是不带图。配图是附加项，不会因为拍不出图就让整条说说发不出去。"),
                h("div", { style: { marginBottom: "8px" } }, "每条最多采用 1–3 张，默认 1 张。一次生图可能返回多张，这里限制的是「最多采用几张」——调大不会多生成，也不会变慢。"),
                h("div", { className: "hint", style: { margin: "6px 0 10px" } },
                  "如果【生图】是关着的，面板会在开关下面直接标红提示 —— 不用去翻日志。"),

                // ── 4.3.2 浏览器 ─────────────────────────────────────
                h("div", { style: { fontWeight: 600, fontSize: "13px", margin: "16px 0 8px" } }, "会不会弹出浏览器窗口？"),
                h("div", { style: { marginBottom: "8px" } }, "不会。发说说、发带图说说、读说说、评论、删除，全部走 QQ 空间的 HTTP 接口，不启动任何浏览器。"),
                h("div", { style: { marginBottom: "8px" } }, "配图也一样：豆包生图走的是 API，浏览器只在那个插件里扫码登录时用一次。"),
                h("div", { className: "hint", style: { margin: "6px 0 10px" } },
                  "唯一会打开浏览器的是 NapCat 登录（见第 2.2 节），和发说说无关，而且那个开关默认就可以关掉。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "4.4 联网与天气"),
                h("div", { style: { marginBottom: "8px" } }, "需要查询最新资讯或天气时，再配置对应的 API Key。"),
                h("div", { style: { marginBottom: "8px" } }, "没有配置 Key 也不影响基本聊天，只是无法使用依赖这些服务的功能。"),
                h("div", { id: "guide-reply", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "5. 回复方式与人格设置"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "5.1 群聊回复"),
                h("div", { style: { marginBottom: "8px" } }, "插件默认会回复私聊消息，群聊消息则只归档、不主动回复。"),
                h("div", { style: { marginBottom: "8px" } }, "如果希望她参与群聊，需要调整群聊回复模式。"),
                h("div", { style: { marginBottom: "8px" } }, "选择「智能判断」后，还需要填写「她的名字」和「感兴趣的话题」。"),
                h("div", { style: { marginBottom: "8px" } }, "智能判断的处理方式如下："),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "在群聊中被直接叫到时，会触发回复。"),
                  h("li", null, "没有被叫到时，会根据消息内容进行评分。"),
                  h("li", null, "评分达到设定的阈值后，才会主动参与讨论。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "如果觉得她在群里太活跃，可以适当调高回复阈值。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "5.2 人格设定"),
                h("div", { style: { marginBottom: "8px" } }, "如果觉得她的语气、性格或聊天习惯不符合预期，可以在人格配置中进行调整。"),
                h("div", { style: { marginBottom: "8px" } }, "人格主要影响说话方式和交流风格，不会替代系统提示词。留空时使用插件默认人设。"),
                h("div", { style: { marginBottom: "8px" } }, "另外，人格设定不会改变插件本身的功能。例如，修改人格不会移除生图、天气查询或 Steam 状态获取能力，这些能力由插件代码实现。"),
                h("div", { id: "guide-panel", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "6. 面板配置说明"),
                h("div", { style: { marginBottom: "8px" } }, "以下按照面板从上到下的顺序介绍各个模块。已经在前面详细介绍过的功能，这里只说明配置用途，避免重复操作步骤。"),
                h("div", { style: { marginBottom: "8px" } }, "模型：默认选择「跟随宿主默认」。需要单独指定模型时，再选择对应的服务商和模型。更换服务商后记得重新选择模型。"),
                h("div", { style: { marginBottom: "8px" } }, "自动回复：控制私聊和群聊的自动回复开关，以及群聊判断所需的名字、感兴趣的话题等配置。"),
                h("div", { style: { marginBottom: "8px", padding: "10px 12px", background: "rgba(127,127,127,0.08)", borderRadius: "8px" } },
                  h("div", { style: { fontWeight: 600, marginBottom: "6px" } }, "共享会话模式（两种模式的区别）"),
                  h("div", { style: { marginBottom: "4px" } }, "无论开关如何，她都会注入最近对话、长期记忆、情感状态和念头。也就是说「她记得你」这件事不依赖这个开关。"),
                  h("div", { style: { marginBottom: "4px" } }, "关闭（默认）：每轮生成时只用注入的上下文，不保留内部推理过程。token 消耗低（约 4,700/轮），适合日常轻聊。"),
                  h("div", { style: { marginBottom: "4px" } }, "开启：同一个对话始终使用同一个 AI 会话，她保留完整的推理链和工具调用历史。主动消息也知道你们聊过什么（比如「上次那个面试怎么样了？」）。token 消耗较高（约 35,000/轮），适合深度陪伴。"),
                  h("div", null, "两种模式可以随时切换，不需要重启。切换后旧会话会自动清理并重建。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "链接解析：控制是否提取消息中链接的标题、封面，以及最多附带多少张图片。"),
                h("div", { style: { marginBottom: "8px" } }, "虚拟人生：设置她自己的作息、穿搭、三餐等日常信息，天气 Key 也在这里填写。"),
                h("div", { style: { marginBottom: "8px" } }, "主动发动态：控制是否主动发布 QQ 空间动态，可以通过「每日发布机会」调整频率。"),
                h("div", { style: { marginBottom: "8px" } }, "情感与关系：管理好感度、亲密度和八维情绪等状态。"),
                h("div", { style: { marginBottom: "8px" } }, "长期记忆：保存和整理重要聊天内容。关闭「用模型提炼」可以减少模型调用，但可能影响记忆准确性。"),
                h("div", { style: { marginBottom: "8px" } }, "表情包：管理表情包的使用、审核和视觉分类。"),
                h("div", { style: { marginBottom: "8px" } }, "回复节奏：调整批量窗口、分段间隔和每分钟回复上限。"),
                h("div", { style: { marginBottom: "8px" } }, "Steam：接入 Steam 游戏状态，并管理 QQ 号码与 SteamID64 的绑定关系。"),
                h("div", { style: { marginBottom: "8px" } }, "生图：管理生图开关、服务商、模型、生成数量和超时时间。"),
                h("div", { style: { marginBottom: "8px" } }, "回复范围：设置哪些私聊和群聊可以触发回复。可以使用白名单，也可以屏蔽指定群聊。"),
                h("div", { style: { marginBottom: "8px" } }, "NapCat：管理 NapCat 相关配置，包括自动打开浏览器、启动宽限期等。一般不需要修改。"),
                h("div", { style: { marginBottom: "8px" } }, "归档：管理聊天记录的保留时间，默认保留 30 天。需要长期保存时，可以开启「永久保存」。"),
                h("div", { style: { marginBottom: "8px" } }, "会话与上下文：控制历史消息数量和会话保留时间。增加历史消息数量有助于保持对话连贯性，但会增加 Token 消耗和请求耗时。"),
                h("div", { style: { marginBottom: "8px" } }, "虚拟生活与主动消息：管理她的日常作息和主动联系行为。消息过于频繁时，可以调低每日上限或调大最小间隔。"),
                h("div", { style: { marginBottom: "8px" } }, "长期记忆与情感：管理记忆整理、关系状态和情绪变化。"),
                h("div", { style: { marginBottom: "8px" } }, "其他配置"),
                h("div", { style: { marginBottom: "8px" } }, "管理员：填写自己的 QQ 号码，用于通过私聊远程管理插件。"),
                h("div", { id: "guide-restore", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "7. 配置恢复"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "7.1 重置配置"),
                h("div", { style: { marginBottom: "8px" } }, "如果配置文件损坏，或者需要重新进行首次配置，可以通过重命名配置文件来重置。"),
                h("div", { style: { marginBottom: "8px" } }, "⚠️ 不要直接删除 config.json。"),
                h("div", { style: { marginBottom: "8px" } }, "文件中保存着 NapCat Token 等重要信息。直接删除可能导致登录状态丢失，需要重新扫码。"),
                h("div", { style: { marginBottom: "8px" } }, "操作步骤："),
                h("ol", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "打开配置文件目录：%USERPROFILE%\\.dsh-qq-access\\"),
                  h("li", null, "找到 config.json。"),
                  h("li", null, "将它重命名为 config.json.bak。"),
                  h("li", null, "重新启动 DSH。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "如果插件支持在配置文件缺失时自动创建默认配置，就会重新进入首次配置流程。"),
                h("div", { style: { fontWeight: 600, fontSize: "13.5px", margin: "18px 0 10px" } }, "7.2 只修改了部分配置，其他设置会丢失吗？"),
                h("div", { style: { marginBottom: "8px" } }, "正常情况下不会。"),
                h("div", { style: { marginBottom: "8px" } }, "面板每次保存只会提交实际修改过的配置项，不会主动覆盖其他未修改的设置。因此，遇到单项功能异常时，优先检查对应配置，不必直接重置整个配置文件。"),
                h("div", { style: { marginBottom: "8px" } }, "如果通过 Agent 或文本编辑器直接修改 config.json，建议先备份文件，并确认只修改了目标字段。"),
                h("div", { id: "guide-tips", style: { fontWeight: 600, fontSize: "15px", margin: "24px 0 10px" } }, "8. 使用建议"),
                h("ul", { style: { margin: "0 0 10px", paddingLeft: "22px" } },
                  h("li", null, "修改配置后，先确认保存成功，再刷新页面或重启 DSH。"),
                  h("li", null, "模型、生图服务商和 NapCat 配置变更后，记得重启。"),
                  h("li", null, "使用扩展功能前，确认所需的前置插件和 API Key 已经配置好。"),
                  h("li", null, "不熟悉的配置项建议先保留默认值，确认功能正常后再逐步调整。"),
                  h("li", null, "定期备份 config.json，不要随意删除或覆盖。"),
                  h("li", null, "不要公开 API Key、NapCat Token 等敏感信息。"),
                ),
                h("div", { style: { marginBottom: "8px" } }, "以上就是插件的主要配置方法。大部分功能都可以直接通过面板完成，不需要手动修改配置文件。"),
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
            h("div", null,
              h("div", { className: "lbl" }, "共享会话模式"),
              h("div", { className: "hint" }, "无论开关如何，她都会注入最近对话、长期记忆、情感状态和念头。开启后额外记住完整推理过程和工具调用历史，主动消息也知道你们聊过什么；关闭则每次全新推理（省 token）。会话回收后下次自动恢复。"),
            ),
            h(Switch, { checked: form.sharedAgent, onChange: (v) => patch("sharedAgent")(v) }),
          ),
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
                // ── 可见范围 ──────────────────────────────────────────
                // 配图说说是带照片的，公开面比纯文字大得多，所以这项要能改。
                // 默认「跟随账号」＝不传 ugc_right，保持和以前完全一样的行为。
                h("div", { className: "row" },
                  h("div", null,
                    h("div", { className: "lbl" }, "说说可见范围"),
                    h("div", { className: "hint" },
                      "对定时动态、面板「立即发一条」和 qq_qzone_publish 都生效。",
                      "「跟随账号」表示不指定，用 QQ 空间自己的默认设置。"),
                  ),
                  h("select", {
                    value: form.qzRight,
                    onChange: (e) => patch("qzRight")(e.target.value),
                  },
                    h("option", { value: "default" }, "跟随账号默认"),
                    h("option", { value: "public" }, "公开"),
                    h("option", { value: "friends" }, "好友可见"),
                    h("option", { value: "private" }, "仅自己可见"),
                  ),
                ),
                // 「仅自己可见」时配图其实没什么意义，提醒一句免得以后忘了。
                form.qzRight === "private"
                  ? h("div", { className: "hint" },
                      "当前是「仅自己可见」：说说只有你自己能看到，配图也一样。")
                  : null,

                // ── 动态配图 ──────────────────────────────────────────
                // 这个开关只决定「允不允许配图」。真正出图要靠【生图】里的豆包，
                // 所以旁边必须写清楚前置条件，否则用户打开后发出去的还是纯文字，
                // 只会以为开关坏了。
                h("div", { className: "row", style: { marginTop: "10px" } },
                  h("div", null,
                    h("div", { className: "lbl" }, "发说说时配一张图"),
                    h("div", { className: "hint" },
                      "她按说说正文自己拍一张，随说说一起发出去。",
                      "需要先开启【生图】，并装好 dsh-connect-doubao 且登录豆包 ——",
                      "任一项没就绪时，说说照发，只是没有图。"),
                  ),
                  h(Switch, { checked: form.qzImage, onChange: (v) => patch("qzImage")(v) }),
                ),
                form.qzImage
                  ? h("div", { className: "row" },
                      h("div", null,
                        h("div", { className: "lbl" }, "每条最多几张"),
                        h("div", { className: "hint" }, "1–3。一次生图可能返回多张，这里限制最多采用几张；调大不会多生成。"),
                      ),
                      h("input", {
                        type: "number", min: 1, max: 3,
                        value: form.qzImageMax,
                        onChange: (e) => patch("qzImageMax")(e.target.value),
                      }),
                    )
                  : null,
                // 生图没开时，配图开关永远出不了图 —— 直接说清楚，别让人去翻日志。
                form.qzImage && !form.imgEnabled
                  ? h("div", { className: "hint", style: { color: "rgba(214,90,60,0.95)" } },
                      "⚠ 【生图】现在是关闭的，所以她拍不出图 —— 先去那张卡片里打开它。")
                  : null,
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
          // 分段规则。放在卡片最前面：这是最容易「看起来坏了」的一项 ——
          // 切太碎像刷屏，切不开又像不分段。
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "按逗号分段"),
              h("div", { className: "hint" },
                "开着时「在呢，刚忙完，怎么了」会拆成三条发出去，像真人打字。",
                "关掉后只按换行分段，适合她经常发代码、JSON、英文长句的场景。"),
            ),
            h(Switch, { checked: form.commaSplit !== false, onChange: (v) => patch("commaSplit")(v) }),
          ),
          h("div", { className: "hint", style: { margin: "0 0 10px" } },
            "代码块和行内代码永远整块保留，不受这一项影响。"),
          // 会话回收：空闲多久之后销毁内存里的 agent。
          // 这个值直接决定「隔一会儿再聊，她还记不记得刚才说到哪」。
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "会话保留时间（分钟）"),
              h("div", { className: "hint" }, form.sharedAgent ? "共享会话模式下回收只是释放内存：下次聊天自动恢复完整历史，连续感不受影响。填 0 表示永不回收。范围 0–1440" : "隔这么久没说话，就把这个对话的上下文从内存里清掉。下次再聊会重新补最近 20 条历史，但「上次说到哪」的连续感会弱一些。填 0 表示永不清理。范围 0–1440")),
            h("input", {
              type: "number", min: 0, max: 1440, value: form.idleMinutes,
              disabled: form.neverEvict === true,
              onChange: (e) => patch("idleMinutes")(e.target.value),
            }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "永不回收"),
              h("div", { className: "hint" }, form.sharedAgent ? "共享会话模式下此项作用减弱：即使回收，历史也通过恢复机制保留。此选项只控制内存占用。" : "打开后所有对话的上下文一直留着，只能靠重启 DSH 释放。聊过的人多时会占内存，但她的连续感最好")),
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
              h("div", { className: "hint" }, form.sharedAgent ? "共享会话模式下此项作用减弱：完整历史由会话自动保持，此选项只影响额外注入的上下文。范围 0–100，默认 20" : "重启或空闲回收后，新会话会把最近这么多条聊天记录重新读一遍。调大她更容易接上「上次说到哪」，代价是每次请求变长。范围 0–100，默认 20")),
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
        h(Card, { title: "生图" },
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "允许她自己发图"),
              h("div", { className: "hint" }, "打开后，想发图时会调用豆包生图，画完直接发出去。需要一个能生图的服务商（默认用已安装的豆包插件）。")),
            h(Switch, { checked: form.imgEnabled, onChange: (v) => patch("imgEnabled")(v) }),
          ),
          !form.imgEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "服务商"),
              h("div", { className: "hint" }, "生图走 Harness 的模型路由。默认 doubao（dsh-connect-doubao 注册的「豆包 生图」）。")),
            h("input", { type: "text", placeholder: "doubao", value: form.imgProvider, onChange: (e) => patch("imgProvider")(e.target.value) }),
          ),
          !form.imgEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "生图模型"),
              h("div", { className: "hint" }, "默认 image-gen。改了要重启 DSH 才生效。")),
            h("input", { type: "text", placeholder: "image-gen", value: form.imgModel, onChange: (e) => patch("imgModel")(e.target.value) }),
          ),
          !form.imgEnabled ? null : h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "超时（秒）"),
              h("div", { className: "hint" }, "生图一般 10–30 秒。等太久没出来就放弃，免得卡住整个回复。范围 10–600")),
            h("input", { type: "number", min: 10, max: 600, value: form.imgTimeoutSec, onChange: (e) => patch("imgTimeoutSec")(e.target.value) }),
          ),
          h("div", { className: "row" },
            h("div", null,
              h("div", { className: "lbl" }, "每次最多发几张"),
              h("div", { className: "hint" }, "范围 1–6。豆包一次通常回 1–3 张，超过这个数的只发前几张。开太多会明显变慢，也更容易触发风控。")),
            h("input", { type: "number", min: 1, max: 6, value: form.imgMaxPerTurn, onChange: (e) => patch("imgMaxPerTurn")(e.target.value) }),
          ),
          !form.imgEnabled ? null : h("div", { className: "hint", style: { marginTop: 8 } },
            "生图会消耗豆包额度，且每次都要十几秒。不要让她每句话都发图。"),
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
