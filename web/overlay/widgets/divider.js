// --- divider：分隔线原子件（横线高=thickness、竖线宽=thickness，长度走几何） ---
import { el } from '../core.js';

export function makeDivider(w) {
  const host = el('div', 'free-divider');
  const th = Math.max(1, Math.min(40, w.thickness ?? 2));
  if (w.vertical) host.style.width = th + 'px';
  else host.style.height = th + 'px';
  document.body.appendChild(host);
  return { host, update() {} };
}
