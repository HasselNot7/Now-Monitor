// --- stackbar：堆叠条（一组指标按值占比横排分段） ------------------------------
// 段宽 = 值/值和（负值按 0 计），缺数段按 0（其余重分），全缺/全零整条 .tmiss。
// DOM + CSS transition（宽度走 --anim-ms），段数少不需要 canvas。
// 配色派生（N3/D1-A）：种子取 --bar-fill 的色相（theme/accent 换色种子跟着换），
// 第 i 段 hue + i×137.5°（黄金角，任意段数两两可辨），S 40% / L 62% 固定柔和度；
// 种子不是六位 hex 或无彩度时回退 Nord 六色循环。
import { el, asRef, cssVar, dig, state } from '../core.js';

const NORD_SIX = ['#88c0d0', '#a3be8c', '#ebcb8b', '#d08770', '#b48ead', '#81a1c1'];

function hexHue(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return null;
  const d = mx - mn;
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return h * 60;
}

export function makeStackbar(w) {
  const W = Math.max(40, w.w ?? 260);
  const H = Math.max(4, w.height ?? 12);
  const host = el('div', 'free-stackbar');
  host.style.width = W + 'px';
  host.style.height = H + 'px';
  const st = w.style || {};
  if (Number.isFinite(st.radius)) {
    host.style.borderRadius = Math.max(0, Math.min(20, st.radius)) + 'px';
  }
  document.body.appendChild(host);
  const items = ((w.metrics || {}).metrics || []).map(asRef);
  const segs = items.map(() => {
    const seg = el('span', 'stack-seg');
    host.appendChild(seg);
    return seg;
  });
  // 段色延迟到首次 update：build 在工厂之后才 applyStyle/accent，那时 --bar-fill 才是最终值
  let colored = false;
  return {
    host,
    update() {
      if (!colored && segs.length) {
        colored = true;
        const seed = hexHue(cssVar(host, '--bar-fill', '#a3be8c'));
        segs.forEach((seg, i) => {
          seg.style.background = seed == null ? NORD_SIX[i % NORD_SIX.length]
            : `hsl(${((seed + i * 137.5) % 360).toFixed(1)} 40% 62%)`;
        });
      }
      let sum = 0;
      const vals = items.map(o => {
        const v = state.HW ? dig(state.HW, o.metric) : null;
        const n = v == null ? 0 : Math.max(0, v);
        sum += n;
        return n;
      });
      const dead = sum <= 0;
      host.classList.toggle('tmiss', dead);
      segs.forEach((seg, i) => {
        seg.style.width = dead ? '0%' : (vals[i] / sum * 100) + '%';
      });
    },
  };
}
