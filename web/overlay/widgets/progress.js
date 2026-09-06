// --- progress：单指标进度条，按指标量程定标（自由画布） ----------------------
import { el, dig, meta, isHigh, state } from '../core.js';

export function makeProgress(w) {
  const host = el('div', 'free-progress');
  if (w.w) host.style.width = w.w + 'px';
  const track = el('div', 'fp-track');
  track.style.height = (w.height ?? 10) + 'px';
  // style.radius 覆盖圆角（schema 里的键之前没有消费者，CSS 只留 4px 兜底）
  const st = w.style || {};
  if (Number.isFinite(st.radius)) {
    track.style.borderRadius = Math.max(0, Math.min(20, st.radius)) + 'px';
  }
  const fill = el('div', 'fp-fill');
  track.appendChild(fill);
  host.appendChild(track);
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
      fill.style.width = pct + '%';
      host.classList.toggle('high', isHigh(v, mt.warn));
    },
  };
}
