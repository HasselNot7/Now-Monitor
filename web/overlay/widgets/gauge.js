// --- gauge：环形仪表（SVG 圆环，按指标量程定标） -----------------------------
import { el, text, dig, meta, txt, isHigh, state } from '../core.js';

export function makeGauge(w) {
  const size = Math.max(48, w.size ?? 120);
  const ring = Math.max(2, w.ring ?? 10);
  const label = typeof w.label === 'string' ? w.label : (w.label ? '' : null);
  const showValue = !(w.style && w.style.show_value === false);
  const host = el('div', 'free-gauge');
  host.style.width = size + 'px';
  host.style.setProperty('--gauge-size', size + 'px');
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  const r = (size - ring) / 2;
  const c = 2 * Math.PI * r;
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
  arc.setAttribute('stroke-dasharray', c);
  arc.setAttribute('stroke-dashoffset', c);
  arc.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.append(track, arc);
  const mid = el('span', 'gauge-mid');
  mid.style.fontSize = Math.max(12, Math.round(size / 5)) + 'px';
  const val = el('span', 'tv', [text('--')]);
  if (showValue) mid.appendChild(val);
  host.append(svg, mid);
  if (label !== null) {
    const lab = el('span', 'gauge-label', [text(label)]);
    host.appendChild(lab);
    host.style.height = (size + 20) + 'px';
  } else {
    host.style.height = size + 'px';
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
      if (showValue) val.textContent = txt(v, mt);
      host.classList.toggle('high', isHigh(v, mt.warn));
    },
  };
}
