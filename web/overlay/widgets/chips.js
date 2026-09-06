// --- chips：底部小指标行 --------------------------------------------------
import { el, asRef, dig, meta, txt, isHigh, esc, state } from '../core.js';

export function makeChips(w) {
  const specs = (w.items || []).map(asRef);
  const host = el('div', 'chips');
  host.style.fontSize = (w.font ?? 15) + 'px';
  host.style.marginTop = (w.margin_top ?? 10) + 'px';
  if (w.style && Number.isFinite(w.style.gap)) host.style.gap = w.style.gap + 'px';
  host.dataset.fit = w.fit || 'none';
  document.body.appendChild(host);

  return {
    host,
    update() {
      const html = [];
      for (const s of specs) {
        const mt = meta(s);
        const v = state.HW ? dig(state.HW, s.metric) : null;
        if (v == null) continue;
        html.push(`<div class="chip${isHigh(v, mt.warn) ? ' warn' : ''}">` +
                  `<b>${esc(mt.name)}</b><span>${esc(txt(v, mt))}</span></div>`);
      }
      host.innerHTML = html.join('');
      if (host.dataset.fit === 'shrink') {
        // 传感器数量变了会挤爆这一行，缩一号也比裁掉好
        host.classList.toggle('dense', host.scrollWidth > host.clientWidth);
      }
    }
  };
}
