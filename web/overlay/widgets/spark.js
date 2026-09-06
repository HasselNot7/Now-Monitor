// --- spark：独立迷你曲线（canvas 面积图，窗口内峰值定标） ----------------------
// 颜色跟随主题/style（--bar-fill / --bar-high），每秒从画布上的计算样式现读，
// 主题切色不用重建部件。fill=false 时只描线不填充。
import { el, state, sample, tail, cssVar, isHigh } from '../core.js';

export function makeSpark(w) {
  const W = Math.max(40, w.w ?? 120);
  const H = Math.max(12, w.h ?? 32);
  const samples = Math.max(10, Math.min(300, w.samples ?? 30));
  const fill = !(w.style && w.style.fill === false);
  const host = el('div', 'free-spark');
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
  return {
    host,
    update() {
      drawSparkArea(cv, W, H, tail(sample(w.metric, samples), samples),
                    (state.byOut.get(w.metric) || {}).warn, fill);
    },
  };
}

function drawSparkArea(cv, W, H, hist, warn, fill) {
  const ctx = cv.getContext('2d');
  const cFill = cssVar(cv, '--bar-fill', '#a3be8c');
  const cHigh = cssVar(cv, '--bar-high', '#bf616a');
  ctx.clearRect(0, 0, W, H);
  const n = hist.length;
  if (n < 2) return;
  const seen = hist.filter(v => v != null);
  // 按窗口内峰值定标，否则 20% 的负载只有 2px 高，看不出形状
  const peak = Math.max(20, ...seen);
  const px = i => (i * W) / (n - 1);
  const py = v => H - 1 - (Math.max(0, Math.min(peak, v)) / peak) * (H - 2);
  const colorOf = v => (isHigh(v, warn) ? cHigh : cFill);
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const x0 = px(run[0].i), x1 = px(run[run.length - 1].i);
    if (fill) {
      ctx.beginPath();
      ctx.moveTo(x0, H);
      for (const p of run) ctx.lineTo(px(p.i), py(p.v));
      ctx.lineTo(x1, H);
      ctx.closePath();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = colorOf(run[run.length - 1].v);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    for (let k = 0; k < run.length; k++) {
      k === 0 ? ctx.moveTo(px(run[k].i), py(run[k].v)) : ctx.lineTo(px(run[k].i), py(run[k].v));
    }
    ctx.strokeStyle = colorOf(run[run.length - 1].v);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    run = [];
  };
  hist.forEach((v, i) => { v == null ? flush() : run.push({ i, v }); });
  flush();
}
