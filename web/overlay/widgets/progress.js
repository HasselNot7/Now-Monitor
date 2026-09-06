// --- progress：单指标进度条，按指标量程定标（自由画布，可横可竖） -----------
// orientation="v"（N2/D3-A）：长吃几何 h、粗吃几何 w —— 箱即条、所见即选框；
// 横条的 height 属性（条粗）竖向下不参与。竖条 fill 贴底向上长。
// 轨道/填充直接复用卡片的 .progress-track/.progress-fill：动画与告警色同源。
import { el, dig, meta, isHigh, state } from '../core.js';

export function makeProgress(w) {
  const vertical = (w.orientation ?? 'h') === 'v';
  const host = el('div', 'free-progress');
  if (w.w) host.style.width = w.w + 'px';
  // 竖条几何 h 的渲染兜底 40 非编辑器初始值（横条箱高由 height 属性决定，defaults 无 h），
  // 用三目不走 ?? 对账口径 —— 同 chips fit 的两层容错思路；40 与编辑器 estH 镜像同值
  if (vertical) host.style.height = (w.h != null ? w.h : 40) + 'px';
  // 圆角内联恒写，默认保住原子件自己的 4px（卡片类默认 2px），style.radius 覆盖
  const track = el('div', 'progress-track');
  const st = w.style || {};
  track.style.borderRadius = Math.max(0, Math.min(20, st.radius ?? 4)) + 'px';
  const fill = el('div', 'progress-fill');
  track.appendChild(fill);
  host.appendChild(track);
  if (vertical) {
    track.style.position = 'relative';
    track.style.width = '100%';
    track.style.height = '100%';
    fill.style.position = 'absolute';
    fill.style.left = '0';
    fill.style.bottom = '0';
    fill.style.width = '100%';
  } else {
    track.style.height = (w.height ?? 10) + 'px';
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
      if (vertical) fill.style.height = pct + '%';
      else fill.style.width = pct + '%';
      host.classList.toggle('high', isHigh(v, mt.warn));
    },
  };
}
