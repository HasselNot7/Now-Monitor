// --- cards：指标卡片网格 ------------------------------------------------
import { el, text, dig, meta, group, isHigh, state, probe, sample, tail, HISTORY, SPARK_W, SUB_GAP } from '../core.js';

export function makeCards(w) {
  const st = w.style || {};
  const brackets = st.brackets !== false;      // [ ] 装饰可关
  const sparkW = Math.max(40, Math.min(300, st.spark_w ?? SPARK_W));
  const sparkH = Math.max(10, Math.min(60, st.spark_h ?? 17));
  const states = {};
  const grid = el('div', 'monitor-grid');
  grid.style.gridTemplateColumns = `repeat(${w.cols ?? 4}, minmax(0, 1fr))`;
  grid.style.gap = (w.gap ?? 32) + 'px';
  for (const c of w.items || []) {
    const card = el('div', 'metric-card');
    card.dataset.key = c.key;
    const value = el('span', 'metric-value', [text('--')]);
    const header = el('div', 'metric-header',
      [el('span', 'metric-label', [text(c.label)]), value]);
    if (Number.isFinite(st.title_size)) header.style.fontSize = st.title_size + 'px';
    const bar = el('div', 'progress-fill');
    const subText = el('span', null, [text('--')]);
    // 迷你曲线底盒只在配了 spark 指标时才画（空深色盒子没有意义）；
    // style.spark_bg=false 去掉深底，让曲线直接浮在画布上
    const spark = c.spark ? el('div', 'spark') : null;
    if (spark) {
      spark.style.flex = `0 0 ${sparkW}px`;
      spark.style.height = sparkH + 'px';
      if (st.spark_bg === false) spark.style.background = 'transparent';
    }
    card.appendChild(header);
    // 进度条行：默认带 [ ] 括号（老观感），style.brackets=false 时只留轨道
    const barRow = el('div', 'progress-bar-container');
    if (brackets) barRow.appendChild(el('span', null, [text('[')]));
    barRow.appendChild(el('div', 'progress-track', [bar]));
    if (brackets) barRow.appendChild(el('span', null, [text(']')]));
    card.appendChild(barRow);
    card.appendChild(el('div', 'metric-sub', [...(spark ? [spark] : []), subText]));
    grid.appendChild(card);
    states[c.key] = { el: card, value, bar, subText, spark, sparkW,
                      barMetric: c.bar, barFull: c.bar_full,
                      valueDef: c.value, subDef: c.sub, sparkMetric: c.spark };
  }
  document.body.appendChild(grid);

  return {
    host: grid,
    update() {
      for (const key of Object.keys(states)) {
        const c = states[key];
        c.value.textContent = group(c.valueDef, false) || '--';
        c.subText.textContent = group(c.subDef, true) || '--';

        const m = state.byOut.get(c.barMetric) || {};
        const v = state.HW ? dig(state.HW, c.barMetric) : null;
        const max = c.barFull !== undefined ? c.barFull : (m.range ? m.range[1] : 100);
        const min = m.range ? m.range[0] : 0;
        const pct = v == null ? 0 : Math.max(0, Math.min(100, (v - min) / (max - min) * 100));
        c.bar.style.width = pct + '%';
        c.bar.style.backgroundColor = isHigh(v, m.warn) ? 'var(--bar-high)' : 'var(--bar-fill)';

        // 次要行宽度随数值变（显存 10.0GB、核心 2000MHz），放不下就降一号。
        // 用隐藏探针恒按正常字号量：直接量元素会在 14px/12.5px 两种状态间来回跳。
        probe.textContent = c.subText.textContent;
        const room = c.subText.parentElement.clientWidth
          - (c.sparkMetric ? c.sparkW + SUB_GAP : 0);
        c.el.classList.toggle('tight', probe.scrollWidth > room);

        if (c.sparkMetric) {
          // 同一指标被多张卡引用时 sample() 保证一帧只补一个采样
          drawSpark(c.spark, tail(sample(c.sparkMetric, HISTORY), HISTORY),
                    (state.byOut.get(c.sparkMetric) || {}).warn);
        }
      }
    }
  };
}

function drawSpark(host, hist, warn) {
  if (host.children.length !== hist.length) {
    host.replaceChildren(...hist.map(() => document.createElement('i')));
  }
  const seen = hist.filter(v => v != null);
  // 按窗口内峰值定标，否则 20% 的负载只有 2px 高，看不出形状
  const peak = Math.max(20, ...seen);
  hist.forEach((v, i) => {
    const cell = host.children[i];
    cell.style.height = v == null ? '0%' : Math.max(2, v / peak * 100) + '%';
    cell.style.backgroundColor = isHigh(v, warn) ? 'var(--bar-high)' : 'var(--bar-fill)';
  });
}
