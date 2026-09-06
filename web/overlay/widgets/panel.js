// --- panel：纯背景面板（自由画布） --------------------------------------------
// 没有数据，就是一块可调底色/圆角/描边的矩形：垫在其他部件后面自己拼卡片。
// 层级用编辑器的图层控制把它压到最底。
import { el, withAlpha } from '../core.js';

export function makePanel(w) {
  const host = el('div', 'free-panel');
  const bg = (w.style && w.style.bg) || {};
  host.style.backgroundColor =
    typeof bg.color === 'string' && bg.color ? withAlpha(bg.color, bg.alpha) : 'rgba(27,29,36,0.85)';
  host.style.borderRadius = (Number.isFinite(bg.radius) ? Math.max(0, bg.radius) : 12) + 'px';
  if (Number.isFinite(bg.border) && bg.border > 0) {
    host.style.border = bg.border + 'px solid ' +
      (typeof bg.border_color === 'string' && bg.border_color ? bg.border_color : 'rgba(255,255,255,0.10)');
  }
  document.body.appendChild(host);
  return { host, update() {} };
}
