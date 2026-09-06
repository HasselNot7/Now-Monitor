// --- stat：单指标大数字（自由画布） ----------------------------------------
import { el, text, dig, meta, txt, state } from '../core.js';

export function makeStat(w) {
  const host = el('div', 'free-stat');
  host.style.fontSize = (w.size ?? 26) + 'px';
  if (w.align) host.style.textAlign = w.align;
  document.body.appendChild(host);
  return {
    host,
    update() {
      const v = state.HW ? dig(state.HW, w.metric) : null;
      const mt = meta({ metric: w.metric });
      host.replaceChildren(
        ...(w.label ? [text(w.label + ' ')] : []),
        el('span', v == null ? 'tmiss' : 'tv', [text(txt(v, mt))]),
      );
    },
  };
}
