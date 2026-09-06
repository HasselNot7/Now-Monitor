// --- gauge：环形仪表（SVG 圆环，按指标量程定标） -----------------------------
// arc="half"（N2/D6）= 上半环 180°：直播指针仪表惯例朝上，虚线从 9 点钟顺时针
// 扫到 3 点钟，svg 下缘正好裁掉下半环。style.show_needle 开中心指针线 ——
// 基准朝上按 pct 旋转，走 CSS transform 过渡（与 dashoffset 同为单点时长）。
import { el, text, dig, meta, txt, isHigh, state } from '../core.js';

export function makeGauge(w) {
  const size = Math.max(48, w.size ?? 120);
  const ring = Math.max(2, w.ring ?? 10);
  const half = (w.arc ?? 'full') === 'half';
  const label = typeof w.label === 'string' ? w.label : (w.label ? '' : null);
  const st = w.style || {};
  const showValue = !(st.show_value === false);
  const showNeedle = !!st.show_needle;
  const host = el('div', 'free-gauge');
  host.style.width = size + 'px';
  // --gauge-size 减半让 .gauge-mid 只罩上半区，数值居中在半环里
  host.style.setProperty('--gauge-size', (half ? size / 2 : size) + 'px');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', half ? size / 2 : size);
  const r = (size - ring) / 2;
  const c = half ? Math.PI * r : 2 * Math.PI * r;
  const rot = half ? 180 : -90;
  const mk = stroke => {
    const cir = document.createElementNS(NS, 'circle');
    cir.setAttribute('cx', size / 2);
    cir.setAttribute('cy', size / 2);
    cir.setAttribute('r', r);
    cir.setAttribute('fill', 'none');
    cir.setAttribute('stroke', stroke);
    cir.setAttribute('stroke-width', ring);
    return cir;
  };
  const track = mk('var(--bar-bg)');
  const arc = mk('var(--bar-fill)');
  arc.setAttribute('class', 'gauge-arc');
  // track 吃同一段弧：full 下整圆视觉不变（2πr 全长 offset 0），half 下轨道不再露出下半环
  for (const [cir, off] of [[track, 0], [arc, c]]) {
    cir.setAttribute('stroke-dasharray', c);
    cir.setAttribute('stroke-dashoffset', off);
    cir.setAttribute('transform', `rotate(${rot} ${size / 2} ${size / 2})`);
  }
  svg.append(track, arc);
  let needle = null;
  if (showNeedle) {
    needle = document.createElementNS(NS, 'line');
    needle.setAttribute('x1', size / 2);
    needle.setAttribute('y1', size / 2);
    needle.setAttribute('x2', size / 2);
    needle.setAttribute('y2', size / 2 - r * 0.72);
    needle.setAttribute('stroke', 'var(--text-color)');
    needle.setAttribute('stroke-width', Math.max(2, Math.round(ring * 0.35)));
    needle.setAttribute('stroke-linecap', 'round');
    needle.style.transformOrigin = `${size / 2}px ${size / 2}px`;
    needle.style.transition = 'transform var(--anim-ms) ease';
    svg.appendChild(needle);
  }
  const mid = el('span', 'gauge-mid');
  mid.style.fontSize = Math.max(12, Math.round(size / 5)) + 'px';
  const val = el('span', 'tv', [text('--')]);
  if (showValue) mid.appendChild(val);
  host.append(svg, mid);
  host.style.height = ((half ? size / 2 : size) + (label !== null ? 20 : 0)) + 'px';
  if (label !== null) {
    const lab = el('span', 'gauge-label', [text(label)]);
    host.appendChild(lab);
  }
  document.body.appendChild(host);
  return {
    host,
    update() {
      const v = state.HW ? dig(state.HW, w.metric) : null;
      const mt = meta({ metric: w.metric });
      let pct = 0;
      if (v != null) {
        const lo = (mt.range && mt.range[0]) || 0;
        const hi = (mt.range && mt.range[1]) || 100;
        pct = Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
      }
      arc.setAttribute('stroke-dashoffset', c * (1 - pct / 100));
      if (needle) needle.style.transform = `rotate(${(half ? -90 : 0) + pct * (half ? 1.8 : 3.6)}deg)`;
      if (showValue) val.textContent = txt(v, mt);
      host.classList.toggle('high', isHigh(v, mt.warn));
    },
  };
}
