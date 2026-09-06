// 渲染器公共设施：常量、跨模块共享状态、取值格式化族、主题与样式、单一采样器。
// main.js（流程编排）与各部件工厂都从这里 import；本文件不做 build 与定位。
//
// 配置驱动的叠加层。三层数据来源：
//   /hw.json      值，按输出路径取（cpu.usage）
//   /metrics.json 怎么解读：单位、位数、量程、阈值、中文名
//   /overlay.json 显示哪些、摆在哪（schema v2：widgets 部件数组）
// 本目录不含任何指标清单或阈值 —— 那些都是数据。

export const REFRESH_MS = 1000;
export const HISTORY = 22;       // 迷你曲线秒数
export const SPARK_W = 82;       // 与 CSS .spark 的 flex-basis 一致
export const SUB_GAP = 8;        // 与 CSS .metric-sub 的 gap 一致
export const SUB_FONT_PX = 14;   // 与 CSS .metric-sub 的 font-size 一致
export const TEXT_REF_RX = /\{([a-zA-Z0-9_.]+)\}/g;
// 本地伪路径：不来自传感器，渲染时本地生成（时钟这类不需要后端数据的值）
export const PSEUDO_REFS = {
  time: () => { const d = new Date(); return [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':'); },
  date: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; },
};

// 跨模块可变状态只允许收在这一个对象里（HW/byOut/instances/tickSeq/预览
// 三件套/主题表），不许出现两个模块各自持有一份的可疑全局。
export const state = {
  HW: null,
  byOut: new Map(),   // 输出路径 -> 注册表条目
  instances: [],
  tickSeq: 0,         // 每次 render() 自增：一条曲线被多张卡引用时，一帧只补一个采样
  // 预览模式（/?preview=1，只有管理页会用）：布局不从 overlay.json 读，
  // 由父页面 postMessage 推送草稿，改一下推一次 —— OBS 里不带这个参数，不受影响。
  PREVIEW: new URLSearchParams(location.search).has('preview'),
  pendingPreview: null,
  booted: false,
  THEME_TABLE: {},    // 主题名 -> {label, vars}，boot 时填充；拿不到就只有渲染器内置默认
};

// 探针：按正常字号量"次要行放不放得下"的隐藏 span（makeCards 消费，build 时挂到 body）
export const probe = document.createElement('span');
probe.style.cssText =
  `position:absolute;left:-9999px;visibility:hidden;white-space:nowrap;font-size:${SUB_FONT_PX}px`;

// 单一采样器：指标路径 -> { buf, cap, sampled }。一帧每路径只补一个采样
// （sampled !== tickSeq 判据），容量取所有消费者声明的最大 cap；
// 消费方（cards 内嵌曲线 / spark / bars / HWOB.history）各自 tail 末尾 N 个。
const sampler = new Map();
export function sample(path, cap) {
  let s = sampler.get(path);
  if (!s) { s = { buf: [], cap: 0, sampled: 0 }; sampler.set(path, s); }
  if (cap > s.cap) s.cap = cap;
  if (s.sampled !== state.tickSeq) {
    s.sampled = state.tickSeq;
    s.buf.push(state.HW ? dig(state.HW, path) : null);
    while (s.buf.length > s.cap) s.buf.shift();
  }
  return s.buf;
}
export const tail = (buf, n) => (buf.length > n ? buf.slice(buf.length - n) : buf);

// --- canvas 部件的帧间缓动（spark / bars 共用） ------------------------------
// 时长与壳 CSS 的 --anim-ms（monitor.html :root）同源口径：400ms，改必同改。
export const ANIM_MS = 400;

// 种子表：kind:path -> 该路径上一实例最后画到的显示值。仅在新实例初始化时拷贝
// 一份当起点（preview 重建从这里续接，不闪回）；运行中的显示数组按实例私有，
// 同 path 双实例各画各的，不会互踩。
const shownSeeds = new Map();

// 每 tick 调一次 render(target, draw)：以实例当前的显示值为起点向 target 缓动
// （easeOutCubic），rAF 节流 ≥40ms/帧（≤25fps 红线），窗口外完全停表。
// 变长的新槽立即到位（与卡片 DOM 新 <i> 一致），变短截断；null 不插值直接跳
// （保住 spark 断线 / bars 空槽语义，缺失数据不画假值）。
export function makeTween(key) {
  const shown = (shownSeeds.get(key) || []).slice();
  let raf = 0;
  return {
    render(target, draw) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      const from = shown.slice();
      if (from.length === target.length && from.every((v, i) => v === target[i])) {
        draw(shown);                                   // 静止：一帧走人，零 rAF
        return;
      }
      const t0 = performance.now();
      let last = -Infinity;
      const step = now => {
        const p = Math.min(1, (now - t0) / ANIM_MS);
        if (p < 1 && now - last < 40) { raf = requestAnimationFrame(step); return; }
        last = now;
        const e = 1 - (1 - p) ** 3;                    // easeOutCubic
        for (let i = 0; i < target.length; i++) {
          const to = target[i];
          const fr = i < from.length ? from[i] : to;
          shown[i] = (fr == null || to == null) ? to : fr + (to - fr) * e;
        }
        shown.length = target.length;
        shownSeeds.set(key, shown.slice());
        draw(shown);
        // 实例被重建丢弃时，旧循环最多再跑一个窗口且画在已摘除的 canvas 上，无观察副作用
        raf = p < 1 ? requestAnimationFrame(step) : 0;
      };
      step(performance.now());                         // 首帧立即，其余交给 rAF
    },
  };
}

export const dig = (obj, path) => path.split('.').reduce((n, k) => (n == null ? null : n[k]), obj);
export const asRef = r => (typeof r === 'string' ? { metric: r } : r);

export function meta(r) {
  const m = state.byOut.get(r.metric) || {};
  return {
    unit: r.unit !== undefined ? r.unit : m.unit,
    digits: r.digits !== undefined ? r.digits : (m.digits || 0),
    divide: r.divide !== undefined ? r.divide : (m.divide || 1),
    warn: m.warn || null,
    range: m.range || null,
    name: r.name || m.name || r.metric,
  };
}

// 单位前加空格，% 除外：40 °C / 54.3 W / 38%
export function txt(v, mt) {
  if (v == null) return '--';
  const s = (v / mt.divide).toFixed(mt.digits);
  return mt.unit == null ? s : (mt.unit === '%' ? s + '%' : s + ' ' + mt.unit);
}

export function plain(v, mt) {
  return v == null ? '--' : (v / mt.divide).toFixed(mt.digits);
}

export function one(o, showUnit, showLabel) {
  const mt = meta(o);
  const v = state.HW ? dig(state.HW, o.metric) : null;
  const body = showUnit ? txt(v, mt) : plain(v, mt);
  // F3：后缀原样拼在数值后（空格是用户内容的一部分，不自动补）；缺省不占位
  return (showLabel && o.label ? o.label + ' ' : '') + body + (o.suffix || '');
}

export function pairText(o) {
  const vals = o.pair.map(p => (state.HW ? dig(state.HW, p) : null));
  if (vals.every(v => v == null)) return null;
  const d = o.divide || 1;
  const a = vals[0] == null ? '--' : (vals[0] / d).toFixed(o.digits || 0);
  const b = vals[1] == null ? '--' : (vals[1] / d).toFixed(o.digits2 !== undefined ? o.digits2 : (o.digits || 0));
  return `${o.label ? o.label + ' ' : ''}${a}/${b}${o.unit || ''}${o.suffix || ''}`;
}

export function diffText(o) {
  const [a, b] = o.diff.map(p => (state.HW ? dig(state.HW, p) : null));
  if (a == null || b == null) return null;
  return txt(a - b, meta({ unit: o.unit, digits: o.digits, divide: o.divide }));
}

// 组级 unit/digits/divide 作为条目默认值，条目自己写了才覆盖
export function group(def, showLabel) {
  if (!def) return null;
  const base = { unit: def.unit, digits: def.digits, divide: def.divide };
  const last = (def.metrics || []).length - 1;
  const parts = (def.metrics || []).map((raw, i) => {
    const o = { ...base, ...asRef(raw) };
    if (o.pair) return pairText(o);
    if (o.diff) return diffText(o);
    // 条目自己的 unit_on 优先；没写再退回组级策略（last 只给最后一个带单位）
    const withUnit = o.unit_on !== undefined ? !!o.unit_on
      : (def.unit_policy !== 'last' || i === last);
    return one(o, withUnit, showLabel);
  });
  const kept = parts.filter(s => s && s !== '--');
  return kept.length ? kept.join(def.sep || ' · ') : null;
}

export function isHigh(v, warn) {
  if (v == null || !warn) return false;
  return warn.op === '<=' ? v <= warn.value : v >= warn.value;
}

export function el(tag, cls, children) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  for (const k of children || []) node.appendChild(k);
  return node;
}
export const text = s => document.createTextNode(s);

// innerHTML 拼接前的转义：指标名/单位来自用户注册表，混进 < & 这类字符时不能破坏结构。
// text 部件走文本节点不需要它；html 部件本来就是用户全权的 HTML。
export const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 几何内联应用：CSS 里的值只是无配置时的兜底，校验器算的是同一份配置数

// 主题与样式：全部走 CSS 变量级联。主题（canvas.theme）把变量设在 body 上，
// 组件级 style 把同名变量设在部件宿主上 —— 内联优先级天然高于 body，
// 「全局主题 + 单组件覆盖」不需要任何优先级魔法。变量名映射见 THEME_VARS；
// 主题清单单一来源在 hwobs/themes.py，boot 时随 /api/widgets/meta 拿到。
export const THEME_VARS = {
  bg: '--bg-color', text: '--text-color', label: '--label-color',
  chip: '--chip-label', dim: '--dim-color', subtext: '--subtext-color',
  bar_bg: '--bar-bg', bar_fill: '--bar-fill', high: '--bar-high',
  prompt_user: '--prompt-user', prompt_symbol: '--prompt-symbol',
};

export function applyTheme(theme) {
  let vars = null;
  if (theme && typeof theme === 'object') vars = theme;
  else if (typeof theme === 'string' && state.THEME_TABLE[theme]) vars = state.THEME_TABLE[theme].vars;
  if (!vars) return;
  for (const [k, v] of Object.entries(vars)) {
    const name = THEME_VARS[k];
    if (name && typeof v === 'string' && v) document.body.style.setProperty(name, v);
  }
}

// #rrggbb + 独立透明度（0~100）→ rgba；其余颜色写法原样透出
export function withAlpha(color, alphaPct) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(color || '');
  const a = Math.max(0, Math.min(100, alphaPct == null ? 100 : alphaPct)) / 100;
  if (!m || a >= 1) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}

// 组件级 style（hwobs/widgets.py 的 style_schema 是它的契约）：颜色键重定义
// CSS 变量，bg.* 让任意组件长出卡片底。各工厂自己的特有键（brackets 等）自取。
export function applyStyle(host, w) {
  const st = w && w.style;
  if (!st || typeof st !== 'object') return;
  const set = (name, v) => host.style.setProperty(name, v);
  if (typeof st.color === 'string' && st.color) set('--text-color', st.color);
  // "名字/标签色"一个键同时管卡片标题与 chips 名字（两处原本是两个变量）
  if (typeof st.label === 'string' && st.label) { set('--label-color', st.label); set('--chip-label', st.label); }
  if (typeof st.accent === 'string' && st.accent) set('--bar-fill', st.accent);
  if (typeof st.high === 'string' && st.high) set('--bar-high', st.high);
  if (typeof st.track === 'string' && st.track) set('--bar-bg', st.track);
  // 条粗：卡片进度条轨道高度（.progress-track 消费）；进度条原子件的粗细走几何 height
  if (Number.isFinite(st.bar_h)) set('--bar-h', Math.max(2, Math.min(60, st.bar_h)) + 'px');
  if (typeof st.dim === 'string' && st.dim) set('--dim-color', st.dim);
  if (typeof st.opacity === 'number' && Number.isFinite(st.opacity)) {
    host.style.opacity = Math.max(0.05, Math.min(1, st.opacity));
  }
  const bg = st.bg;
  if (bg && typeof bg === 'object' && typeof bg.color === 'string' && bg.color) {
    host.style.backgroundColor = withAlpha(bg.color, bg.alpha);
    if (Number.isFinite(bg.radius)) host.style.borderRadius = Math.max(0, bg.radius) + 'px';
    if (Number.isFinite(bg.padding) && bg.padding > 0) host.style.padding = bg.padding + 'px';
    if (Number.isFinite(bg.border) && bg.border > 0) {
      host.style.border = bg.border + 'px solid ' +
        (typeof bg.border_color === 'string' && bg.border_color ? bg.border_color : 'rgba(255,255,255,0.12)');
    }
  }
}

export function applyCanvas(canvas) {
  if (!canvas) return;
  applyTheme(canvas.theme);
  const free = canvas.mode === 'free';
  document.body.classList.toggle('free', free);
  document.body.classList.toggle('transparent', !!canvas.transparent);
  document.body.style.width = canvas.w + 'px';
  document.body.style.height = canvas.h + 'px';
  // 自由画布下部件用 x/y 定位，body 内边距没有意义
  document.body.style.padding =
    free ? '0' : (canvas.padding ? `${canvas.padding[0]}px ${canvas.padding[1]}px` : '');
}

// 按 {路径} 切开：字面量与值交替。text 与 badge 共用这套编译/渲染。
export function compileParts(src) {
  const parts = [];
  let last = 0;
  const s = String(src || '');
  for (const m of s.matchAll(TEXT_REF_RX)) {
    if (m.index > last) parts.push({ lit: s.slice(last, m.index) });
    parts.push({ ref: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ lit: s.slice(last) });
  return parts;
}

export function partsToNodes(parts) {
  return parts.map(p => {
    if (p.lit !== undefined) return text(p.lit);
    if (PSEUDO_REFS[p.ref]) {
      const pseudo = el('span', 'tv');
      pseudo.textContent = PSEUDO_REFS[p.ref]();
      return pseudo;
    }
    const v = state.HW ? dig(state.HW, p.ref) : null;
    const mt = meta({ metric: p.ref });
    const span = el('span', v == null ? 'tmiss' : 'tv');
    span.textContent = txt(v, mt);
    return span;
  });
}

// 现读宿主上的计算样式变量：主题切色不用重建部件
export function cssVar(host, name, fallback) {
  const v = getComputedStyle(host).getPropertyValue(name).trim();
  return v || fallback;
}
