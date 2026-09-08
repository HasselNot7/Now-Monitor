// --- table：表格（P2） -------------------------------------------------------
// 行 = items[]（一格一行），列 = cols 选的 kind 有序子集。列宽在**一个 grid 容器**里
// 由同一份 grid-template-columns 决定 —— 这正是"多个 value/progress 件拼表"做不到的
// 那件事（跨部件不共享列宽），也是本件存在的理由。
//
// 数据形状与 cards 同族：行数组叫 items、单元格用 value / bar / metric / mapping，
// 四个键名都已在 refs 白名单里（引用遍历零改动，见 docs/new-widget.md 的 v3 触发条件）。
// 观感全部复用既有件：条 = .progress-track/.progress-fill（契约 1，告警色走 .high 类）、
// 灯 = .free-light/.light-dot、状态图标 = .free-dynicon 的三态类名级联 —— 本文件不写
// 一个颜色字面量。列的缺省/表头文案与 widgets.py 的 defaults.cols、TABLE_KINDS.label
// 同值（人工对口径：check-defaults 的 ?? 正则不覆盖数组与对象字面量）。
import { el, text, dig, meta, group, isHigh, state } from '../core.js';
import { ICON_PATHS } from './icon.js';
import { firstHit } from './dynicon.js';

const HEAD_H = 20;                                    // 与 widgets.py 的 TABLE_HEAD_H 同值
const DEFAULT_COLS = ["label", "value", "bar"];       // 与 widgets.py defaults.cols 同值
const KIND_LABELS = { label: "名字", value: "数值", bar: "条", light: "状态灯", icon: "状态图标" };
// 列宽：只有条与名字吃剩余空间（1fr / max-content 混排），数值贴内容、灯与图标定宽
const COL_TPL = {
  label: "minmax(64px, max-content)", value: "max-content",
  bar: "minmax(72px, 1fr)", light: "14px", icon: "18px",
};
const DOT = 10;                       // 状态灯直径（比独立灯小一号，随行高不随行变）

export function makeTable(w) {
  const cols = Array.isArray(w.cols) && w.cols.length ? w.cols : DEFAULT_COLS;
  const rowH = Math.max(16, Math.min(80, w.row_h ?? 26));
  const host = el('div', 'free-table');
  if (w.style && w.style.zebra) host.classList.add('zebra');
  const tpl = cols.map(c => COL_TPL[c] || "max-content").join(' ');
  const rows = [];

  if (w.head !== false) {
    const h = el('div', 'table-row table-head');
    h.style.gridTemplateColumns = tpl;
    h.style.height = HEAD_H + 'px';
    for (const c of cols) h.appendChild(el('span', 'table-cell th', [text(KIND_LABELS[c] || c)]));
    host.appendChild(h);
  }

  for (const [i, row] of (Array.isArray(w.items) ? w.items : []).entries()) {
    if (!row || typeof row !== 'object') continue;
    const line = el('div', 'table-row' + (i % 2 ? ' odd' : ''));
    line.style.gridTemplateColumns = tpl;
    line.style.height = rowH + 'px';
    const cells = {};
    for (const c of cols) {
      if (c === 'label') cells.label = el('span', 'table-cell tc-label metric-label', [text(row.label || '')]);
      else if (c === 'value') cells.value = el('span', 'table-cell tc-value metric-value', [text('--')]);
      else if (c === 'bar') {
        const fill = el('div', 'progress-fill');
        cells.bar = el('div', 'table-cell tc-bar free-progress', [el('div', 'progress-track', [fill])]);
        cells.barFill = fill;
      } else if (c === 'light') {
        const dot = el('span', 'light-dot');
        dot.style.width = DOT + 'px';
        dot.style.height = DOT + 'px';
        cells.light = el('span', 'table-cell tc-light free-light', [dot]);
      } else if (c === 'icon') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: 18, height: 18, fill: 'none',
          'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
        cells.icon = el('span', 'table-cell tc-icon free-dynicon', [svg]);
        cells.iconSvg = svg;
        cells.iconCur = null;
      } else cells[c] = el('span', 'table-cell');
      line.appendChild(cells[c]);
    }
    host.appendChild(line);
    rows.push({ row, cells });
  }
  document.body.appendChild(host);

  return {
    host,
    update() {
      // 每格都要先确认"这一列的数据源在不在"：main.js 的 render 循环没有 per-instance
      // 兜底，任何一格拿 undefined 去 dig() 抛错，整张叠加层就停更（不是这一格坏，是全坏）。
      // 校验器对缺源只给 warning（"那一格会留空"），所以这里必须真的留空而不是崩。
      for (const { row, cells } of rows) {
        const has = k => typeof row[k] === "string" && !!row[k];
        if (cells.value) {
          const t = row.value && typeof row.value === "object" ? group(row.value, false) : null;
          cells.value.textContent = t || '--';
          cells.value.classList.toggle('tmiss', !t);      // 整格无值才压暗，与 dynicon 同规矩
        }
        if (cells.bar) {
          const ok = has("bar");
          const mt = ok ? meta({ metric: row.bar }) : {};
          const v = ok && state.HW ? dig(state.HW, row.bar) : null;
          const lo = (mt.range && mt.range[0]) || 0, hi = (mt.range && mt.range[1]) || 100;
          cells.barFill.style.width = (v == null ? 0 : Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100))) + '%';
          cells.bar.classList.toggle('high', isHigh(v, mt.warn));   // 条的告警色 = 注册表 warn
        }
        if (cells.light) {
          const ok = has("metric");
          const v = ok && state.HW ? dig(state.HW, row.metric) : null;
          cells.light.classList.toggle('tmiss', !ok || v == null);
          cells.light.classList.toggle('high', !!ok && isHigh(v, meta({ metric: row.metric }).warn));
        }
        if (cells.icon) {
          const ok = has("metric");
          const v = ok && state.HW ? dig(state.HW, row.metric) : null;
          let name = null, high = false, miss = false;
          if (typeof v !== 'number' || !Number.isFinite(v)) miss = true;
          else {
            const hit = firstHit(Array.isArray(row.mapping) ? row.mapping : [],
                                 v / (meta({ metric: row.metric }).divide || 1));
            if (hit) { name = hit.icon; high = !!hit.high; }   // 全不命中 = 该格留空（表格里合法）
          }
          cells.icon.classList.toggle('tmiss', miss);
          cells.icon.classList.toggle('high', high);
          if (name !== cells.iconCur) {
            cells.iconCur = name;
            // 认不出的图标名回退 pulse —— 与 dynicon 同规矩（校验器的 warning 也这么写）
            cells.iconSvg.innerHTML = name ? (ICON_PATHS[name] || ICON_PATHS.pulse) : '';
          }
        }
      }
    },
  };
}
