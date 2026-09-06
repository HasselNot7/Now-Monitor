// --- badge：药丸徽章原子件（{路径} 插值同 text；底色/描边走外观 bg） ----------
// 工厂先给默认药丸底，applyStyle 的 bg.* 有写就覆盖 —— 不写外观就是暗色药丸。
import { el, compileParts, partsToNodes } from '../core.js';

export function makeBadge(w) {
  const host = el('div', 'free-badge');
  host.style.fontSize = (w.size ?? 15) + 'px';
  document.body.appendChild(host);
  const parts = compileParts(w.text);
  return {
    host,
    update() {
      host.replaceChildren(...partsToNodes(parts));
    }
  };
}
