// 叠加层运行时入口：boot/tick/render/build、编辑器预览协议
// （hwobs-preview / hwobs-ready / hwobs-rects）。
// 部件工厂在 registry.js，公共设施（状态/取值/样式/采样器）在 core.js。

import { REFRESH_MS, state, probe, applyCanvas, applyStyle, el, text } from './core.js';
import { WIDGET_TYPES } from './registry.js';

function buildPrompt(p) {
  const line = el('div', 'prompt-line', [
    el('span', 'prompt-user', [text(p.user)]),
    el('span', 'prompt-symbol', [text('>')]),
    el('span', 'prompt-cmd', [text(p.cmd)]),
  ]);
  if (p.size) line.style.fontSize = p.size + 'px';
  if (p.cursor) line.appendChild(el('div', 'cursor'));
  line.dataset.prompt = '1';   // 编辑器拖拽手柄靠它直改这个节点的样式跟手
  document.body.appendChild(line);
}

function build(layout) {
  applyCanvas(layout.canvas);
  const free = layout.canvas && layout.canvas.mode === 'free';
  if (layout.prompt) {
    buildPrompt(layout.prompt);
    if (free) {
      // 自由画布下装饰命令行也是可拖动的部件：写了 x/y 按坐标摆，没写回退内边距
      const pad = layout.canvas.padding || [12, 24];
      const pl = document.body.querySelector('.prompt-line');
      pl.style.left = (Number.isInteger(layout.prompt.x) ? layout.prompt.x : pad[1]) + 'px';
      pl.style.top = (Number.isInteger(layout.prompt.y) ? layout.prompt.y : pad[0]) + 'px';
    }
  }
  state.instances = [];
  (layout.widgets || []).forEach((w, i) => {
    const make = WIDGET_TYPES[w.type];
    if (!make) { console.warn('未知部件类型：' + w.type); return; }
    const inst = make(w);
    state.instances.push(inst);
    // 宿主从工厂返回值拿；工厂自己把根节点 append 到 body 末尾，顺序语义不变。
    // cards/chips/text 没写 w 时从 x 拉到右缘（通栏，和流式的观感衔接）；
    // margin_top 已折算进 y，这里清零避免双重偏移。
    // data-wi = 部件在数组里的下标，编辑器靠它直接改宿主样式做拖拽跟手。
    const host = inst.host;
    applyStyle(host, w);
    // 统一 Node 公共字段：visible=false 整个不画；rotation 绕部件中心旋转。
    // 每次预览推送都全量重建，不会残留上一份的变换。
    if (w.visible === false) host.style.display = 'none';
    if (Number.isFinite(w.rotation) && w.rotation) {
      host.style.transformOrigin = 'center';
      host.style.transform = `rotate(${w.rotation}deg)`;
    }
    if (free) {
      host.dataset.wi = String(i);
      host.style.left = (w.x || 0) + 'px';
      host.style.top = (w.y || 0) + 'px';
      if (w.w) host.style.width = w.w + 'px';
      if (w.h) host.style.height = w.h + 'px';
      if (!w.w && (w.type === 'cards' || w.type === 'chips' || w.type === 'text')) {
        host.style.right = '0px';
      }
      host.style.marginTop = '0px';
    }
  });
  document.body.appendChild(probe);
  if (state.PREVIEW) watchRects();
}

/** 编辑器协议：每次 build 完，把各部件渲染后的真实几何回报给管理页。
 * 编辑器在 iframe 上叠手柄，手柄位置以此为准 —— 不再靠估算。
 * 装饰命令行也一并回报：编辑器拿它当吸附目标，部件好对齐它的首部。 */
function reportRects() {
  const rects = [];
  for (const h of document.body.querySelectorAll('[data-wi]')) {
    // 隐藏件（visible=false）量出来是 0×0，报 null 让编辑器直接不画手柄盒
    rects[+h.dataset.wi] = h.style.display === 'none' ? null : {
      x: h.offsetLeft, y: h.offsetTop, w: h.offsetWidth, h: h.offsetHeight,
    };
  }
  const pl = document.body.querySelector('.prompt-line');
  const prompt = pl
    ? { x: pl.offsetLeft, y: pl.offsetTop, w: pl.offsetWidth, h: pl.offsetHeight }
    : null;
  parent.postMessage({ type: 'hwobs-rects', rects, prompt }, '*');
}

/* build 那一刻几何还没定型：网络字体到位后字宽字高会变、实时数据让
   文字变长变短、chips 换行改行数 —— 宿主节点尺寸一变，编辑器的手柄盒
   就跟内容错位。用 ResizeObserver 盯住所有宿主，尺寸一变就补报一次；
   rAF 合帧，一帧内多次变化只报一条。只挪位置不改尺寸不会触发（拖动
   中宿主只改 left/top，正好不打扰编辑器的手柄）。 */
let rectRO = null, rectRAF = 0;
function reportRectsSoon() {
  if (rectRAF) return;
  rectRAF = requestAnimationFrame(() => { rectRAF = 0; reportRects(); });
}
function watchRects() {
  if (!rectRO) rectRO = new ResizeObserver(reportRectsSoon);
  rectRO.disconnect();
  document.body.querySelectorAll('[data-wi], .prompt-line').forEach(h => rectRO.observe(h));
  reportRectsSoon();
}
if (state.PREVIEW) document.fonts.ready.then(reportRectsSoon);

function render() {
  state.tickSeq++;                 // 帧号推进：spark 的 sampled!==tickSeq 判据全靠它
  document.body.classList.toggle('offline', !state.HW);
  document.body.classList.toggle('degraded', !!(state.HW && state.HW.degraded));
  // P2b：一个部件抛错不许带走整张叠加层。update() 里的配置性崩溃（拿 undefined 去
  // dig() 就是 path.split 抛）每秒都会复现，所以崩过就**停用该件**（下一次 build 重建
  // 它：预览推草稿会重建，OBS 侧重新载入场景即可），日志只打一次不刷屏。
  // 刻意不给坏件加 .err 视觉态：观感契约的四个状态色（灰=缺数据 黄=名字 绿=正常
  // 红=告警）已满，不为此发明第五态 —— 坏件停在最后一次画面上，配置问题由 layout-check 报。
  for (const inst of state.instances) {
    if (inst.broken) continue;
    try { inst.update(); }
    catch (e) {
      inst.broken = true;
      console.error('部件 update 抛错，已停用该件（其余件继续更新）：', e);
    }
  }
}

function clearDom() {
  // body 里静态的只有壳页面的 <script> 标签，其余都是 build 出来的节点
  for (const n of Array.from(document.body.children)) {
    if (n.tagName === 'SCRIPT') continue;
    n.remove();
  }
  state.instances = [];
}

function acceptPreview(layout) {
  state.pendingPreview = layout;
  if (!state.booted) return;
  clearDom();
  build(layout);
  render();
}

if (state.PREVIEW) {
  // 只认父页面（管理页编辑器）：比同源校验宽一点，开发态 vite(5173) 内嵌
  // 8765 的预览也能工作；推的只是版式草稿，没有敏感数据。
  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const d = e.data;
    if (d && d.type === 'hwobs-preview' && d.layout) acceptPreview(d.layout);
  });
}

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(url + ' -> ' + r.status);
  return r.json();
}

async function tick() {
  try { state.HW = await getJSON('/hw.json?_=' + Date.now()); } catch (e) { state.HW = null; }
  render();
}

async function boot() {
  // 主题清单随 meta 一起拿（单一来源在 hwobs/themes.py）；拿不到就只剩渲染器
  // 内置的 Nord 默认，canvas.theme 指向其他主题时静默回退。
  const [metrics] = await Promise.all([
    getJSON('/metrics.json'),
    getJSON('/api/widgets/meta').then(m => { state.THEME_TABLE = (m && m.themes) || {}; }).catch(() => {}),
  ]);
  for (const m of metrics.metrics) if (m.out) state.byOut.set(m.out, m);
  if (state.PREVIEW) {
    // 管理页可能在 metrics 加载完成前就推了第一版草稿，这里补建
    if (state.pendingPreview) build(state.pendingPreview);
  } else {
    build(await getJSON('/overlay.json'));
  }
  await tick();
  setInterval(tick, REFRESH_MS);
  state.booted = true;
  if (state.PREVIEW) {
    // 握手：告诉管理页"我准备好收草稿了"。iframe 的 load 事件会被
    // @import 的在线字体拖住好几秒，编辑器不能赌 onLoad 的时机。
    parent.postMessage({ type: 'hwobs-ready' }, '*');
  }
}

boot();
