// --- bars：柱状条原子件（自由画布） -------------------------------------------
// 卡片内嵌迷你曲线的独立形态：canvas 直方图（1px 缝隙，窗口内峰值定标）。
// 颜色跟随主题/style（--bar-fill / --bar-high），每秒从画布上的计算样式现读。
import { el, state, sample, tail, cssVar, isHigh, makeTween } from '../core.js';

export function makeBars(w) {
  const W = Math.max(40, w.w ?? 120);
  const H = Math.max(12, w.h ?? 32);
  const samples = Math.max(10, Math.min(300, w.samples ?? 30));
  const host = el('div', 'free-bars');
  host.style.width = W + 'px';
  host.style.height = H + 'px';
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  cv.width = W * dpr;
  cv.height = H * dpr;
  cv.style.width = '100%';
  cv.style.height = '100%';
  host.appendChild(cv);
  document.body.appendChild(host);
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  const tween = makeTween('bars:' + w.metric);
  return {
    host,
    update() {
      tween.render(tail(sample(w.metric, samples), samples), hist =>
        drawSparkBars(cv, W, H, hist, (state.byOut.get(w.metric) || {}).warn));
    },
  };
}

function drawSparkBars(cv, W, H, hist, warn) {
  const ctx = cv.getContext('2d');
  const cFill = cssVar(cv, '--bar-fill', '#a3be8c');
  const cHigh = cssVar(cv, '--bar-high', '#bf616a');
  ctx.clearRect(0, 0, W, H);
  const n = hist.length;
  if (!n) return;
  // 按窗口内峰值定标，否则 20% 的负载只有 2px 高，看不出形状
  const peak = Math.max(20, ...hist.filter(v => v != null));
  const slot = W / n;
  hist.forEach((v, i) => {
    if (v == null) return;
    const h = Math.max(2, v / peak * (H - 1));
    ctx.fillStyle = isHigh(v, warn) ? cHigh : cFill;
    ctx.fillRect(i * slot, H - h, Math.max(1, slot - 1), h);
  });
}
