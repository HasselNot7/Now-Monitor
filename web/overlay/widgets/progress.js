// --- progress：单指标进度条，按指标量程定标（自由画布） ----------------------
import { el, dig, meta, isHigh, state } from '../core.js';

export function makeProgress(w) {
  const host = el('div', 'free-progress');
  if (w.w) host.style.width = w.w + 'px';
  // 轨道/填充直接复用卡片的 .progress-track/.progress-fill：动画与告警色同源。
  // 圆角内联恒写，默认保住原子件自己的 4px（卡片类默认 2px），style.radius 覆盖
  const track = el('div', 'progress-track');
  track.style.height = (w.height ?? 10) + 'px';
  const st = w.style || {};
  track.style.borderRadius = Math.max(0, Math.min(20, st.radius ?? 4)) + 'px';
  const fill = el('div', 'progress-fill');
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
