// --- value：数值组原子件（自由画布） -------------------------------------------
// 一组指标 + 分隔符，可每项带注册表名字（show_name = chips 观感）。
// 与 cards 的 value/sub 用同一套组定义；pair/diff 走现成的文本组装。
import { el, text, asRef, dig, meta, pairText, diffText, txt, isHigh, state } from '../core.js';

export function makeValue(w) {
  const host = el('div', 'free-value');
  host.style.fontSize = (w.size ?? 19) + 'px';
  if (w.align) host.style.textAlign = w.align;
  if (w.w) host.style.width = w.w + 'px';
  document.body.appendChild(host);
  const def = w.metrics || {};
  const base = { unit: def.unit, digits: def.digits, divide: def.divide };
  const refsList = (def.metrics || []).map(asRef);
  const sep = def.sep || ' · ';
  return {
    host,
    update() {
      const nodes = [];
      refsList.forEach((o, i) => {
        if (i > 0) nodes.push(text(sep));
        const mt = meta(o);
        const name = o.label ?? (w.show_name ? mt.name : null);
        if (name) {
          const n = el('span', 'vn', [text(name + ' ')]);
          nodes.push(n);
        }
        if (o.pair) {
          nodes.push(el('span', 'vv', [text(pairText(o) ?? '--')]));
          return;
        }
        if (o.diff) {
          nodes.push(el('span', 'vv', [text(diffText(o) ?? '--')]));
          return;
        }
        const v = state.HW ? dig(state.HW, o.metric) : null;
        const cls = 'vv' + (isHigh(v, mt.warn) ? ' vwarn' : '') + (v == null ? ' tmiss' : '');
        nodes.push(el('span', cls, [text(txt(v, mt))]));
      });
      host.replaceChildren(...nodes);
    },
  };
}
