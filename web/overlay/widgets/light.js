// --- light：状态灯（单指标三态圆点，可带名字） ---------------------------------
// 常态 --bar-fill、告警 --bar-high（isHigh 判定）、缺数据 .tmiss 灰点——
// 三态色全在壳 CSS 里走主题变量，工厂只切类名，不自造色键。
// style.blink 预留（D4-A，键位占位）：呼吸/闪烁要 keyframes 与 reduced-motion
// 的取舍，本期不做，避免出现无效开关所以也不进 style_schema。
import { el, text, dig, meta, isHigh, state } from '../core.js';

export function makeLight(w) {
  const size = Math.max(6, Math.min(64, w.size ?? 12));
  const host = el('div', 'free-light');
  const dot = el('span', 'light-dot');
  dot.style.width = size + 'px';
  dot.style.height = size + 'px';
  host.appendChild(dot);
  if (typeof w.label === 'string' && w.label) {
    host.appendChild(el('span', 'light-label', [text(w.label)]));
  }
  document.body.appendChild(host);
  return {
    host,
    update() {
      const v = state.HW ? dig(state.HW, w.metric) : null;
      const mt = meta({ metric: w.metric });
      host.classList.toggle('tmiss', v == null);
      host.classList.toggle('high', isHigh(v, mt.warn));
    },
  };
}
