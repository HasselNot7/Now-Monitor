// --- dynicon：动态图标（P1） ---------------------------------------------------
// 按指标数值切图标的原子件：mapping 自上而下首个命中生效，全不命中走 default_icon，
// 缺数据走 miss_icon（没写就用 default_icon 加 .tmiss 压暗）。图标 path 与 icon 件
// 同源（import icon.js 的 ICON_PATHS），名字契约仍是 widgets.py 的 ICON_NAMES。
//
// 阈值比的是显示口径（原始值 ÷ 注册表 divide，不四舍五入）—— 口径与理由见
// widgets.py 的 dynicon 段注释；非有限数一律算缺数据，不做任何强转。
// 离散态不补间（图标切换没有"中间形状"），可选 style.fade 淡入走 --anim-ms 单点。
import { el, dig, meta, state } from '../core.js';
import { ICON_PATHS } from './icon.js';

/** 首个命中的映射行；没有命中返回 null。行结构不合法（op 不认识、缺 value）
 * 一律跳过而不是抛错 —— 校验端已在 layout-check 里报错，这里不能白屏。 */
function firstHit(rows, x) {
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    if (r.op === 'zero') { if (x === 0) return r; }
    else if (r.op === 'nonzero') { if (x !== 0) return r; }
    else if (typeof r.value === 'number' && Number.isFinite(r.value)) {
      if (r.op === '>=' ? x >= r.value : r.op === '<=' ? x <= r.value : false) return r;
    }
  }
  return null;
}

export function makeDynIcon(w) {
  const size = Math.max(12, Math.min(200, w.size ?? 24));
  const host = el('div', 'free-dynicon');
  host.style.width = size + 'px';
  host.style.height = size + 'px';
  const rows = Array.isArray(w.mapping) ? w.mapping : [];
  const fallback = w.default_icon ?? 'pulse';
  const fade = !!(w.style && w.style.fade);
  if (fade) host.classList.add('fade');

  const NS = 'http://www.w3.org/2000/svg';
  let svg = document.createElementNS(NS, 'svg');
  const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
                  'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  // stroke 绝不写 inline（icon.js 那种 svg.style.stroke 在这里会把三态覆盖全压死）：
  // 常态/告警/缺数据靠宿主上的类名走样式表，见 monitor.html 的 .free-dynicon 三条。
  host.appendChild(svg);
  document.body.appendChild(host);

  let cur = null;
  const paint = name => {
    const path = ICON_PATHS[name] || ICON_PATHS.pulse;
    if (name === cur) return;
    cur = name;
    svg.innerHTML = path;
    // 淡入靠重新插入节点重启 CSS animation（改回同一个元素不会重放动画）
    if (fade) { const next = svg.cloneNode(true); host.replaceChild(next, svg); svg = next; }
  };

  return {
    host,
    update() {
      const v = state.HW ? dig(state.HW, w.metric) : null;
      let name, high = false, miss = false;
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        miss = true;
        name = w.miss_icon || fallback;
      } else {
        const hit = firstHit(rows, v / (meta({ metric: w.metric }).divide || 1));
        if (hit) { name = hit.icon; high = !!hit.high; }
        else name = fallback;
      }
      host.classList.toggle('tmiss', miss);
      host.classList.toggle('high', high);
      paint(name);
    },
  };
}
