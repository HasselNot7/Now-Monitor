// --- html：自定义 HTML 片段（自由画布） --------------------------------------
// 不带 <script> 的静态片段：维持老语义，{路径} 占位符每秒整段替换。
// 带脚本的动态片段：占位符只在构建时替换一次，<script> 重新注入使其真正
// 执行，动态数据走脚本里拿到的 HWOB API：
//   HWOB.get('cpu.usage')            当前原始值（没数据时 null）
//   HWOB.text('cpu.temp')            按注册表格式化（单位/小数）
//   HWOB.onTick(fn)                  每秒回调 fn(hw)
//   HWOB.history('cpu.usage', 60)    最近 N 秒采样数组（每秒补一点）
//   HWOB.root                        本部件的 DOM 根（querySelector 用它，别用 document）
// 注意：脚本是会跑的 —— 别导入来路不明的版式文件。

import { el, dig, meta, txt, TEXT_REF_RX, PSEUDO_REFS, state, sample, tail, HISTORY } from '../core.js';

function makeWidgetApi(host) {
  const fns = [];
  // path -> { path, cap, view }：view 身份稳定（脚本拿到的数组引用不变），
  // 每帧从共享采样器取末尾 cap 个同步进来 —— 与旧双轨采样的长度语义一致。
  const series = new Map();
  return {
    root: host,
    onTick(fn) { if (typeof fn === 'function') fns.push(fn); },
    get(path) { return state.HW ? dig(state.HW, path) : null; },
    text(path) { return txt(state.HW ? dig(state.HW, path) : null, meta({ metric: path })); },
    history(path, cap = HISTORY) {
      let s = series.get(path);
      if (!s) { s = { path, cap: Math.max(2, cap | 0), view: [] }; series.set(path, s); }
      return s.view;
    },
    _emit() {
      for (const s of series.values()) {
        const fresh = tail(sample(s.path, s.cap), s.cap);
        s.view.length = 0;
        for (const v of fresh) s.view.push(v);
      }
      for (const fn of fns) {
        try { fn(state.HW); } catch (e) { console.warn('HWOB onTick:', e); }
      }
    },
  };
}

function substituteRefs(src) {
  return src.replace(TEXT_REF_RX, (whole, p) => {
    if (PSEUDO_REFS[p]) return PSEUDO_REFS[p]();
    const v = state.HW ? dig(state.HW, p) : null;
    return v == null ? whole : txt(v, meta({ metric: p }));
  });
}

export function makeHtml(w) {
  const host = el('div', 'free-html');
  if (w.w) host.style.width = w.w + 'px';
  if (w.h) { host.style.height = w.h + 'px'; host.style.overflow = 'hidden'; }
  document.body.appendChild(host);
  const src = w.html || '';
  if (!/<script/i.test(src)) {
    // 静态片段：每秒整段重替换（没有脚本，重建无副作用）
    return {
      host,
      update() { host.innerHTML = substituteRefs(src); },
    };
  }
  // 动态片段：构建期替换一次占位符，注入并执行脚本，之后由 HWOB 驱动
  const api = makeWidgetApi(host);
  host.innerHTML = substituteRefs(src);
  for (const old of [...host.querySelectorAll('script')]) {
    const s = document.createElement('script');
    if (old.src) s.src = old.src;
    else s.textContent = old.textContent;
    window.HWOB = api;   // 脚本同步执行，此刻的 HWOB 就是自己部件的
    old.replaceWith(s);
  }
  return {
    host,
    update() { api._emit(); },
  };
}
