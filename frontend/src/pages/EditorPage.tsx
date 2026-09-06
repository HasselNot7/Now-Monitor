import { toast } from "../lib/toast";
import {
  Activity, AlignCenterHorizontal, AlignCenterVertical, AlignEndVertical, AlignJustify, AlignLeft,
  AlignRight, AlignStartVertical, ArrowDownToLine, ArrowUpToLine, BarChart3, ChevronDown,
  ChevronRight, ChevronUp, CircleDashed, Code, Copy, Equal, Eye, EyeOff, Grid3x3,
  Group as GroupIcon, Hash, Image as ImageIcon, LayoutGrid, Lightbulb, Lock, LockOpen, Magnet, Minus,
  Package, Pencil, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus,
  Rows3, Sigma, Square, Star, Tag, Trash2, Type, Ungroup as UngroupIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, clone, outPaths } from "../api";
import type {
  CardsWidget, ChipsWidget, CustomComponent, FreePos, GaugeWidget, GroupedWidget, HtmlWidget,
  LayoutPreset, LightWidget, NodeBase, OverlayConfig, ProgressWidget, SparkWidget, StackbarWidget,
  StatWidget, TextWidget, ValueWidget, Widget,
} from "../types";
import type { Shared } from "../shared";
import type { WidgetsMeta } from "../types";
import { Btn, FieldLabel, Hint, SubTitle, TSwitch } from "../ui";
import { TF } from "./editors";
import { clearDraft, loadDraft, saveDraft } from "../draftStore";
import {
  CanvasFields, CardsEditor, ChipsEditor, GaugeEditor, HtmlEditor, LightEditor, PromptBar,
  ProgressEditor, PropsEditor, SparkEditor, StackbarEditor, StatEditor, StyleEditor, TemplatePicker,
  TextEditor, ValueEditor,
} from "./editors";

/** 版式编辑：Figma 式自由画布编辑器（流式排版已移除，一切版式都是自由画布）。
 * 三栏工作台：左图层列表 / 中间画布（真实渲染的 monitor.html iframe，几何由
 * monitor 每次 build 后 postMessage 回报，所见即所得）/ 右属性面板。
 * 仿 Figma 的交互：
 *   · Ctrl+滚轮 以指针为中心缩放（缩放后画面钉在指针下，不漂）
 *   · 空格+左键 / 中键 拖动画布；Shift+1 适应、Shift+0 回到 100%
 *   · 点击选中、右键上下文菜单（复制/层级/删除）、Esc 取消选中
 *   · 拖动吸附画布边缘与部件边缘/中线，参考线实时显示；网格步长随画布尺寸
 *     与缩放自适应分档，位置就近吸到网格线
 *   · 顶部装饰命令行也是一个可拖动的图层
 * 拖动过程直改宿主节点 style 跟手，松手才进草稿。
 * 快捷键：Ctrl+S 保存 · Ctrl+Z 撤销 · Ctrl+D 复制 · 方向键微调(Shift=10px) ·
 * Delete 删除 · Esc 取消选中。 */

// 组件元数据（label/icon/defaults）的单一来源是后端注册表（/api/widgets/meta）。
// 这里只留 meta 加载失败时的兜底，正常情况一律读 meta。
const FALLBACK_LABEL: Record<string, string> = {
  cards: "指标卡片", chips: "小指标行", text: "自定义文字", stat: "大数字",
  progress: "进度条", html: "自定义 HTML", gauge: "圆环仪表",
  spark: "迷你曲线", panel: "背景面板", value: "数值组",
  icon: "图标", image: "图片", divider: "分隔线", badge: "徽章", bars: "柱状条",
};

const ICON_MAP: Record<string, LucideIcon> = {
  "layout-grid": LayoutGrid, "rows-3": Rows3, "type": Type, "hash": Hash,
  "equal": Equal, "code": Code, "circle-dashed": CircleDashed,
  "activity": Activity, "square": Square, "sigma": Sigma,
  "star": Star, "image": ImageIcon, "minus": Minus, "tag": Tag,
  "chart-bar": BarChart3,
  "lightbulb": Lightbulb, "align-justify": AlignJustify,
};

const fallbackIcon = (t: string): LucideIcon =>
  ({ cards: LayoutGrid, chips: Rows3, text: Type, stat: Hash, progress: Equal,
     html: Code, gauge: CircleDashed, spark: Activity, panel: Square, value: Sigma,
     icon: Star, image: ImageIcon, divider: Minus, badge: Tag, bars: BarChart3 }[t] ?? LayoutGrid);

/** 预览 iframe 入口：构建产物里留空 = 同源直连 FastAPI；dev 模式（.env.development）
 * 给 /preview —— vite 代理回后端的 /，保持同源，拖动时才能直改 iframe 里的宿主节点。 */
const BACKEND = (import.meta.env.VITE_BACKEND as string | undefined) || "";

interface Rect { x: number; y: number; w: number; h: number; }

/** 流式版式转来自由画布时，没坐标的部件按估算高度在原内边距处竖排一遍 */
function estHeight(w: Widget): number {
  const line = (px: number) => Math.round(px * 1.2);
  switch (w.type) {
    case "cards": {
      const cols = Math.max(1, w.cols ?? 4);
      const rows = Math.ceil((w.items?.length ?? 0) / cols);
      return rows * (w.item_height ?? 66) + Math.max(0, rows - 1) * (w.gap ?? 32);
    }
    case "chips": return line(w.font ?? 15) + (w.margin_top ?? 10);
    case "text": return line(w.size ?? 19) + (w.margin_top ?? 0);
    case "stat": return line(w.size ?? 26);
    case "progress": return w.height ?? 10;
    case "html": return w.h ?? 60;
    case "gauge": return (w.size ?? 120) + (w.label ? 20 : 0);
    case "spark": return w.h ?? 32;
    case "panel": return w.h ?? 100;
    case "value": return Math.round((w.size ?? 19) * 1.2);
  }
  return 40;
}

const stretchable = (t: string) => t === "cards" || t === "chips" || t === "text";
const heightEditable = (t: string) =>
  t === "html" || t === "progress" || t === "spark" || t === "panel"
  || t === "image" || t === "divider";

/** Figma 式八向缩放手柄：四角 + 四边，位置/光标一次性声明。
 * 发放规则见 handleOk：横向（e/w）所有类型都能拉宽；纵向（n/s）只有高度可编辑
 * 的类型有；角手柄给高度可编辑类型与圆环（圆环只有 size 一个自由度，走等比）。 */
const HANDLES: [string, string, React.CSSProperties][] = [
  ["nw", "nwse-resize", { left: -5, top: -5 }],
  ["n", "ns-resize", { left: "50%", top: -5, marginLeft: -5 }],
  ["ne", "nesw-resize", { right: -5, top: -5 }],
  ["e", "ew-resize", { right: -5, top: "50%", marginTop: -5 }],
  ["se", "nwse-resize", { right: -5, bottom: -5 }],
  ["s", "ns-resize", { left: "50%", bottom: -5, marginLeft: -5 }],
  ["sw", "nesw-resize", { left: -5, bottom: -5 }],
  ["w", "ew-resize", { left: -5, top: "50%", marginTop: -5 }],
];
const handleOk = (t: string, h: string) => {
  if (t === "icon") return false;   // 图标只有 size 一个自由度，走属性面板
  if (h === "e" || h === "w") return true;
  if (h === "n" || h === "s") return heightEditable(t);
  return heightEditable(t) || t === "gauge";
};

/** --- 组语义（Phase 4）：标签是路径 -------------------------------------------
 * group 存的是 "g1" 或 "g1/g2"（g1 里的子组 g2），扁平数组因此能表达任意嵌套；
 * 老的单段标签天然是深度 1 的路径，零迁移。下面是组语义的唯一实现。 */
const tagDepth = (tag?: string) => (tag ? tag.split("/").length : 0);

/** path 组的子树（含直属成员与所有后代）。 */
const subtreeOf = (widgets: { group?: string }[], path: string): number[] =>
  widgets.map((w, j) => (w?.group === path || w?.group?.startsWith(path + "/") ? j : -1))
    .filter(j => j >= 0);

/** 在已进入 grpPath 层的前提下，点击 i 应选中的集合：未进入时选最外层组，
 * 进入后逐层深入 —— 下一层子组整组、直属部件单件（Figma 的进入组语义）。
 * 组成员 = 该路径的整棵子树（直属件 + 更深后代），不是精确同标签者。 */
const selTargetsAt = (widgets: { group?: string }[], i: number, grpPath: string): number[] => {
  const tag = widgets[i]?.group;
  if (!tag) return [i];
  const d = grpPath ? grpPath.split("/").length : 0;
  if (d >= tagDepth(tag)) return [i];
  const target = tag.split("/").slice(0, d + 1).join("/");
  return subtreeOf(widgets, target);
};
/** 吸附判定距离（画布像素）：拖动时边缘靠得比这近就吸上去 */
const SNAP_PX = 8;
/** 自适应网格：基准步长 = 画布宽按约 50 格取整到 1/2/4/5 系列；
 * 再按缩放沿该系列换档，屏幕上每格始终落在 16~96 像素的舒适区。 */
const GRID_TARGET_COLS = 50;
const GRID_MIN_CANVAS = 4;   // 画布像素下限（极小画布也别切太碎）
const GRID_MAX_CANVAS = 400; // 画布像素上限（超大画布也别懒到只剩几根线）
const GRID_MIN_SCREEN = 16;  // 屏幕像素下限：比这密就换更大档位
const GRID_MAX_SCREEN = 96;  // 屏幕像素上限：比这疏就换更小档位

function niceStep(x: number): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  // 档位 1/2/4/5：按对数中点就近取整（sqrt 边界），40 这类常用间距能原样保留
  const n = f < 1.42 ? 1 : f < 2.83 ? 2 : f < 4.48 ? 4 : f < 7.08 ? 5 : 10;
  return n * 10 ** exp;
}
const NICE_DIGITS = [1, 2, 4, 5] as const;
const NICE_DIGITS_UP = [...NICE_DIGITS].reverse();

function niceAbove(s: number): number {
  const e0 = Math.floor(Math.log10(s));
  for (let e = e0; e <= e0 + 2; e++)
    for (const d of NICE_DIGITS) {
      const v = d * 10 ** e;
      if (v > s * 1.001) return v;
    }
  return s * 10;
}

function niceBelow(s: number): number {
  const e0 = Math.ceil(Math.log10(s));
  for (let e = e0; e >= e0 - 2; e--)
    for (const d of NICE_DIGITS_UP) {
      const v = d * 10 ** e;
      if (v < s * 0.999) return v;
    }
  return s / 10;
}

/** 画布像素步长：先按宽度取基准档，再按当前缩放换档 */
function gridStepFor(canvasW: number, scale: number): number {
  let s = niceStep(Math.min(GRID_MAX_CANVAS, Math.max(GRID_MIN_CANVAS, canvasW / GRID_TARGET_COLS)));
  for (let g = 0; g < 8; g++) {
    if (s * scale < GRID_MIN_SCREEN && s < canvasW) s = niceAbove(s);
    else if (s * scale > GRID_MAX_SCREEN && s > 1) s = niceBelow(s);
    else break;
  }
  return s;
}

/** 缩放档位（Figma 用离散档，滚轮给连续值，按钮走档位表） */
const ZOOM_STEPS = [0.05, 0.1, 0.15, 0.25, 0.33, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const MIN_ZOOM = 0.05, MAX_ZOOM = 4;
const zoomStep = (from: number, dir: 1 | -1) => {
  if (dir === 1) return ZOOM_STEPS.find(s => s > from + 0.001) ?? MAX_ZOOM;
  return [...ZOOM_STEPS].reverse().find(s => s < from - 0.001) ?? MIN_ZOOM;
};

/** 图层面板里显示的人话名字 */
function layerName(w: Widget, labelOf: (t: string) => string): string {
  switch (w.type) {
    case "cards": return `${labelOf("cards")} · ${(w as CardsWidget).items?.length ?? 0} 张`;
    case "chips": return `${labelOf("chips")} · ${(w as ChipsWidget).items?.length ?? 0} 项`;
    case "text": {
      const body = String((w as TextWidget).text ?? "");
      return `${labelOf("text")} · ${body.slice(0, 16) || "空"}`;
    }
    case "stat": return `${labelOf("stat")} · ${(w as StatWidget).label || (w as StatWidget).metric}`;
    case "progress": return `${labelOf("progress")} · ${(w as ProgressWidget).metric}`;
    case "gauge": return `${labelOf("gauge")} · ${(w as GaugeWidget).metric}`;
    default: return labelOf(w.type);
  }
}

/** 面板收起记忆的 localStorage 键（沿用旧键，值语义不变） */
const PANEL_KEY = "hwobs.freePanel";
/** 属性面板可拖宽度：默认 380，记忆用户上次拖到的位置 */
const PROPS_W_KEY = "hwobs.editorPropsW";
const PROPS_W_MIN = 300, PROPS_W_MAX = 760, PROPS_W_DEF = 380;
/** 草稿统一存这一个键（旧版两个页面各自的 flow/free 键首次读取时并入） */
const DRAFT_KEY = "editor";

/** 草稿转自由画布：mode=free + 给缺坐标的部件排初始位置（margin_top 折算进 y）。
 * 装饰命令行也落成显式 x/y（默认落在内边距处）。流式旧版式载入即走这里换算。 */
function toFree(d: OverlayConfig) {
  d.canvas.mode = "free";
  const pad = d.canvas.padding || [12, 24];
  let y = pad[0];
  if (d.prompt) {
    y += Math.round((d.prompt.size ?? 19) * 1.2) + 10;
    if (d.prompt.x === undefined) d.prompt.x = pad[1];
    if (d.prompt.y === undefined) d.prompt.y = pad[0];
  }
  for (const w of d.widgets) {
    const p = w as FreePos;
    if (p.x === undefined || p.y === undefined) {
      p.x = pad[1];
      p.y = y;
      y += estHeight(w) + 8;
    }
  }
}

/** 旧版两个页面各存一份草稿：并入 "editor"，都有未保存改动时优先自由那份 */
function takeStoredDraft(saved: OverlayConfig): string | null {
  const cur = loadDraft(DRAFT_KEY);
  const free = loadDraft("free");
  const flow = loadDraft("flow");
  clearDraft("free");
  clearDraft("flow");
  if (cur) return cur;
  const s = JSON.stringify(saved);
  if (free && free !== s) return free;
  if (flow && flow !== s) return flow;
  return free ?? flow ?? null;
}

interface DragState {
  target: "widget" | "prompt";
  i: number;
  mode: "move" | "resize" | "rotate";
  sx: number; sy: number;
  ox: number; oy: number; ow: number; oh: number;
  stretch: boolean;
  nx?: number; ny?: number; nw?: number; nh?: number;
  /** 多选拖动：一起动的部件下标 + 各自的起点（primary 的吸附/钳位结果按位移差分给全组） */
  targets?: number[];
  origins?: Record<number, { x: number; y: number }>;
  npos?: Record<number, { x: number; y: number }>;
  /** 缩放手柄方位（nw/n/ne/e/se/s/sw/w）：决定锚边与方向 */
  handle?: string;
  /** 旋转 / Alt 中心缩放绕的几何中心（画布坐标，down 时按未旋转盒定死） */
  cx?: number; cy?: number;
  /** 旋转：down 时的部件角度（度）与指针方位角（弧度）、拖动中的新角度 */
  rot0?: number; ang0?: number; nrot?: number;
  /** 多选整体缩放：包围盒（down 时的原始框 + 拖动中的新框）与各成员原始几何 */
  gbox?: { x: number; y: number; w: number; h: number };
  gnx?: number; gny?: number; gnw?: number; gnh?: number;
  gmembers?: { i: number; x: number; y: number; w: number; h: number }[];
}

interface CtxMenu { x: number; y: number; kind: "widget" | "prompt"; i: number; }

/** Now Playing 式分段药丸容器：无边框，靠表面亮度分层，激活段 bg-default-100 */
function SegGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex h-10 items-center gap-0.5 rounded-xl bg-[#1a1a1d] p-1">{children}</div>;
}

/** 药丸容器里的一个段（图标或短文字） */
function Seg({ on, onPress, title, wide, children }: {
  on?: boolean; onPress: () => void; title: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" title={title} onClick={onPress}
      className={`flex h-8 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-medium transition-colors duration-150 ${
        wide ? "min-w-14 px-3" : "min-w-8"} ${
        on ? "bg-default-100 text-foreground" : "text-default-500 hover:bg-white/[0.06] hover:text-foreground"}`}>
      {children}
    </button>
  );
}

export default function EditorPage({ shared }: { shared: Shared }) {
  const { metrics } = shared;
  const [cfg, setCfg] = useState<OverlayConfig | null>(null);
  const [draft, setDraft] = useState<OverlayConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ text: string; kind: "" | "ok" | "bad" | "warn" }>({ text: "", kind: "" });
  const [check, setCheck] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  const [pvKey, setPvKey] = useState(0);
  const [pvScale, setPvScale] = useState(0.45);
  /** null = 适应（整幅画布都在视口里）；数字 = 用户定下的固定倍率（滚轮/±/快捷键） */
  const [zoom, setZoom] = useState<number | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [gridOn, setGridOn] = useState(true);
  /** 自适应网格的当前步长（画布像素），随画布尺寸与缩放重算 */
  const [gridStep, setGridStep] = useState(50);
  /** 右侧属性面板（沿用旧记忆键）；左侧图层面板常驻可折叠 */
  const [propsOpen, setPropsOpen] = useState(() => localStorage.getItem(PANEL_KEY) !== "0");
  const [propsW, setPropsW] = useState(() => {
    const v = +localStorage.getItem(PROPS_W_KEY)!;
    return Number.isFinite(v) && v >= PROPS_W_MIN && v <= PROPS_W_MAX ? v : PROPS_W_DEF;
  });
  const propsWRef = useRef(propsW);
  propsWRef.current = propsW;
  const propsDragRef = useRef<{ x: number; w: number } | null>(null);
  const [layersOpen, setLayersOpen] = useState(() => localStorage.getItem("hwobs.editorLayers") !== "0");
  /** 图层树里收起的组路径（默认全展开） */
  const [closedGrp, setClosedGrp] = useState<Set<string>>(new Set());
  /** 正在重命名的组（路径 + 输入框内容） */
  const [renaming, setRenaming] = useState<{ path: string; v: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  /** 多选集合（含 selected 本身；单选时 = [selected]）。成组组件整组选中、
   * Shift/Ctrl 加减选、画布框选都落在这里；拖动/复制/删除/对齐按它整体作用。 */
  const [multi, setMulti] = useState<number[]>([]);
  /** 装饰命令行的选中态（与部件选中互斥，它不在 widgets 里） */
  const [selPrompt, setSelPrompt] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  /** 自定义组件（Phase 14）：已存的积木 + 正在命名的保存请求 */
  const [components, setComponents] = useState<CustomComponent[]>([]);
  const [saveComp, setSaveComp] = useState<{ name: string; widgets: Widget[] } | null>(null);
  /** 部件注册表元数据：label/icon/defaults/style_schema 的单一来源（后端）。
   * 拿不到（老后端/网络挂）就退回下面的 FALLBACK 兜底，编辑器照常能用。 */
  const [meta, setMeta] = useState<WidgetsMeta | null>(null);
  /** 右键上下文菜单 / 图层面板「添加部件」菜单 */
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** N1：添加菜单分节折叠态 —— classic（退役件）默认收起 */
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set(["classic"]));
  /** 空格按住 = 抓手模式（Figma 同款临时平移） */
  const [spaceDown, setSpaceDown] = useState(false);
  const [rects, setRects] = useState<(Rect | null)[]>([]);
  /** 顶部装饰命令行的真实几何：可拖可吸，和部件互相当磁铁 */
  const [promptRect, setPromptRect] = useState<Rect | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** 画布矩形容器（100% = 画布像素的那层），Ctrl+滚轮缩放按它换算锚点 */
  const canvasBoxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRefs = useRef(new Map<number, HTMLDivElement>());
  const promptBoxRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  /** 拖动期间收到的几何补报：先存着，松手后补应用 */
  const pendingRectsRef = useRef<{ rects: (Rect | null)[]; prompt: Rect | null } | null>(null);
  /** 缩放锚点：重渲染后把画布 (u,v) 拉回屏幕 (sx,sy)，指针不漂 */
  const zoomAnchorRef = useRef<{ sx: number; sy: number; u: number; v: number } | null>(null);
  const scaleRef = useRef(pvScale);
  const draftRef = useRef<OverlayConfig | null>(null);
  const rectsRef = useRef<(Rect | null)[]>([]);
  const promptRef = useRef<Rect | null>(null);
  const snapRef = useRef(true);
  const gridRef = useRef(false);
  const gridStepRef = useRef(50);
  const spaceRef = useRef(false);
  const vgRef = useRef<HTMLDivElement>(null);
  const hgRef = useRef<HTMLDivElement>(null);
  /** 框选橡皮筋（DOM 直改，不走 React 渲染） */
  const bandRef = useRef<HTMLDivElement>(null);
  const bandStartRef = useRef<{ x: number; y: number } | null>(null);
  /** 拖缩/旋转时的实时数值牌（尺寸或角度），DOM 直改 */
  const dimRef = useRef<HTMLDivElement>(null);
  /** 多选整体包围盒（虚线框 + 缩放手柄的宿主） */
  const multiBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const histRef = useRef<string[]>([]);
  /** 重做栈：与 histRef 对偶 —— undo 弹出的「当前态」进这里，新编辑发生即清空 */
  const redoRef = useRef<string[]>([]);
  const lastPushRef = useRef(0);
  /** 拖拽平移画布（中键或空格+左键）：记录起点与初始 scroll */
  const panRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const multiRef = useRef<number[]>([]);
  /** 已进入的组路径（"" = 顶层）：双击/Enter 逐层进入、Esc 逐层退出（Figma 语义）。
   * 只影响点击选择的层级 —— 纯编辑器态，不入草稿不入历史。state 供面包屑渲染，
   * ref 供事件闭包读最新值。 */
  const [grpEntered, setGrpEntered] = useState("");
  const grpEnteredRef = useRef("");
  const enterGrp = (p: string) => { grpEnteredRef.current = p; setGrpEntered(p); };
  scaleRef.current = pvScale;
  draftRef.current = draft;
  rectsRef.current = rects;
  promptRef.current = promptRect;
  snapRef.current = snapOn;
  gridRef.current = gridOn;
  gridStepRef.current = gridStep;
  spaceRef.current = spaceDown;
  multiRef.current = multi;

  const loadConfig = useCallback(async () => {
    const c = await api.overlay();
    // 上次没保存的草稿还在（切过页面/刷新过浏览器）就接着用
    const stored = takeStoredDraft(c);
    let d = clone(c);
    let restored = false;
    if (stored) {
      try {
        const s = JSON.parse(stored) as OverlayConfig;
        if (JSON.stringify(s) !== JSON.stringify(c)) { d = s; restored = true; }
        else clearDraft(DRAFT_KEY);
      } catch { clearDraft(DRAFT_KEY); }
    }
    // 一切版式都落在自由画布上：流式旧版式在这里自动换算成坐标（保存后才固化）
    const wasFlow = d.canvas.mode !== "free";
    toFree(d);
    setCfg(c);
    setDraft(d);
    setSelected(null);
    setMulti([]);
    setSelPrompt(false);
    setRects([]);
    setPromptRect(null);
    setCtxMenu(null);
    histRef.current = [];
    redoRef.current = [];
    enterGrp("");
    const isDirty = JSON.stringify(d) !== JSON.stringify(c);
    setDirty(isDirty);
    setMsg(restored
      ? { text: "已恢复上次没保存的排版", kind: "warn" }
      : isDirty
        ? { text: wasFlow ? "已把版式切到自由画布（还没保存）" : "有未保存的改动", kind: "warn" }
        : { text: "", kind: "" });
    try { setCheck(await api.layoutCheck()); } catch { /* 校验面板留空 */ }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  useEffect(() => { api.widgetsMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api.components().then(r => setComponents(r.components)).catch(() => {}); }, []);

  /** 结构操作的历史快照（拖动/缩放/旋转/增删/复制/层级/微调），Ctrl+Z 逐层回退 */
  const pushHistory = () => {
    const d = draftRef.current;
    if (!d) return;
    const s = JSON.stringify(d);
    const h = histRef.current;
    if (h[h.length - 1] === s) return;
    h.push(s);
    if (h.length > 60) h.shift();
    redoRef.current = [];   // 有了新编辑，被撤销的分支作废（Figma/PS 同款约定）
    lastPushRef.current = Date.now();
  };

  /** 编辑器子组件都是原地改草稿再调 onChange()：这里换一个新对象身份，
   * 让预览 effect 感知到变化重推草稿。 */
  const onChange = useCallback(() => {
    const d = draftRef.current;
    const c = cfg;
    if (!d || !c) return;
    setDraft({ ...d });
    const isDirty = JSON.stringify(d) !== JSON.stringify(c);
    // 有改动就暂存：切页面、刷新浏览器都还在；回到和已保存一致就清掉
    if (isDirty) saveDraft(DRAFT_KEY, d);
    else clearDraft(DRAFT_KEY);
    setDirty(isDirty);
    setMsg(isDirty ? { text: "校验中…", kind: "" } : { text: "", kind: "" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const rep = await api.layoutCheckDraft(d);
        setCheck(rep);
        if (rep.errors?.length) {
          setMsg({ text: `✗ ${rep.errors.join("；")}`, kind: "bad" });
        } else {
          setMsg(isDirty
            ? { text: rep.warnings?.length ? `可保存（${rep.warnings.length} 条提醒）` : "可保存", kind: "warn" }
            : { text: "没有改动", kind: "" });
        }
      } catch { /* 校验失败不打断编辑 */ }
    }, 350);
  }, [cfg]);

  const undoEdit = useCallback(() => {
    const snap = histRef.current.pop();
    const cur = draftRef.current;
    if (!snap || !cur) {
      toast.default("没有可撤销的操作", { timeout: 2000 });
      return;
    }
    redoRef.current.push(JSON.stringify(cur));
    const d = JSON.parse(snap) as OverlayConfig;
    draftRef.current = d;
    setSelected(null);
    setSelPrompt(false);
    enterGrp("");
    onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  /** 重做：弹出撤销时存下的「当时态」，当前态压回撤销栈 */
  const redoEdit = useCallback(() => {
    const snap = redoRef.current.pop();
    const cur = draftRef.current;
    if (!snap || !cur) {
      toast.default("没有可重做的操作", { timeout: 2000 });
      return;
    }
    histRef.current.push(JSON.stringify(cur));
    const d = JSON.parse(snap) as OverlayConfig;
    draftRef.current = d;
    setSelected(null);
    setSelPrompt(false);
    enterGrp("");
    onChange();
  }, [onChange]);

  // 画布 iframe：/?preview=1，等它 postMessage 回报各部件的真实几何
  const pushPreview = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "hwobs-preview", layout: draft }, "*");
  }, [draft]);
  useEffect(() => { pushPreview(); }, [pushPreview]);

  // monitor 就绪后会回报 hwobs-ready（iframe 的 load 事件被在线字体拖住时
  // onLoad 补推来不及，必须等这个握手再推，草稿才不会丢在 about:blank 里）
  const pushRef = useRef(pushPreview);
  pushRef.current = pushPreview;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { type?: string; rects?: (Rect | null)[]; prompt?: Rect | null };
      if (d?.type === "hwobs-ready") { pushRef.current(); return; }
      if (d?.type === "hwobs-rects" && Array.isArray(d.rects)) {
        // 拖动中途来的补报（别处实时数据变了）先挂起：直接 setRects 会让
        // React 把手柄盒拽回旧位置，盖掉正在跟手的吸附位。松手后补应用。
        if (dragRef.current) { pendingRectsRef.current = { rects: d.rects, prompt: d.prompt ?? null }; return; }
        setRects(d.rects);
        setPromptRect(d.prompt ?? null);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // 缩放：默认"适应"= 整幅画布都在视口里；定倍率后可自由滚动。
  // 属性面板是 dock 布局（不盖画布），所以可用宽度就是容器本身；拖动中不换比例。
  useEffect(() => {
    if (zoom !== null) return;
    const fit = () => {
      const el = wrapRef.current;
      const cwid = draftRef.current?.canvas.w, chid = draftRef.current?.canvas.h;
      if (!el || !cwid || !chid || dragRef.current) return;
      const cw = el.clientWidth - 64;
      const ch = el.clientHeight - 80;   // 顶部留图层标签，底部留呼吸
      if (cw > 0 && ch > 0) {
        setPvScale(Math.max(0.05, Math.min(1, Math.min(cw / cwid, ch / chid))));
      }
    };
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, [draft?.canvas.w, draft?.canvas.h, zoom, propsOpen, layersOpen]);

  useEffect(() => {
    if (zoom !== null) setPvScale(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)));
  }, [zoom]);

  // Ctrl/⌘+滚轮：以指针为中心缩放。缩放后画布会重居中/换尺寸，用锚点把
  // (u,v) 这个画布点重新按回屏幕 (sx,sy) —— Figma 的"钉在指针下"手感。
  const zoomAtPoint = (clientX: number, clientY: number, factor: number) => {
    const box = canvasBoxRef.current;
    const s0 = scaleRef.current;
    const s1 = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, s0 * factor));
    if (!box || s1 === s0) return;
    const rect = box.getBoundingClientRect();
    zoomAnchorRef.current = {
      sx: clientX, sy: clientY,
      u: (clientX - rect.left) / s0, v: (clientY - rect.top) / s0,
    };
    setPvScale(s1);
    setZoom(s1);
  };
  useEffect(() => {
    const a = zoomAnchorRef.current;
    if (!a) return;
    zoomAnchorRef.current = null;
    requestAnimationFrame(() => {
      const el = wrapRef.current, box = canvasBoxRef.current;
      if (!el || !box) return;
      const r = box.getBoundingClientRect();
      el.scrollLeft += r.left + a.u * scaleRef.current - a.sx;
      el.scrollTop += r.top + a.v * scaleRef.current - a.sy;
    });
  }, [pvScale]);

  // 网格步长：画布尺寸定基准档（约 50 列），缩放再换档，屏幕上永远看得清、吸得准
  useEffect(() => {
    const W = draft?.canvas.w, H = draft?.canvas.h;
    if (!W || !H) return;
    setGridStep(gridStepFor(W, pvScale));
  }, [draft?.canvas.w, draft?.canvas.h, pvScale]);

  const save = useCallback(async () => {
    const d = draftRef.current;
    if (!d) return;
    const rep = await api.saveConfig(d);
    if (!rep.saved) {
      setMsg({ text: `✗ 保存失败：${(rep.errors || []).join("；")}`, kind: "bad" });
      toast.danger("保存失败", { description: (rep.errors || []).join("；"), timeout: 6000 });
      return;
    }
    setCfg(clone(d));
    setDirty(false);
    clearDraft(DRAFT_KEY);
    setPvKey(k => k + 1);
    setMsg({ text: "✓ 已保存", kind: "ok" });
    toast.success("已保存", { description: "OBS 里没变化就点「刷新缓存」", timeout: 2000 });
    try {
      setCheck(await api.layoutCheck());
      shared.refreshAll();
    } catch { /* 静默 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const undoSaved = async () => {
    const rep = await api.rollback();
    if (!rep.restored) {
      setMsg({ text: `✗ ${(rep.errors || []).join("；")}`, kind: "bad" });
      return;
    }
    clearDraft(DRAFT_KEY);
    await loadConfig();
    setPvKey(k => k + 1);
    setMsg({ text: "✓ 已还原到上一版", kind: "ok" });
    toast.success("已还原到上一版", { timeout: 2000 });
  };

  /** 丢掉没保存的草稿，回到已保存的版式 */
  const discardDraft = useCallback(async () => {
    clearDraft(DRAFT_KEY);
    await loadConfig();
    toast.default("已放弃未保存的改动", { timeout: 2000 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConfig]);

  /** 用一套模板覆盖草稿（流式模板自动换算成自由坐标），顺带注册默认指标集 */
  const applyPreset = async (p: LayoutPreset) => {
    const d = draftRef.current;
    if (!d) return;
    try {
      const seeded = await api.seedPresetMetrics();
      const nd = clone(p.config);
      toFree(nd);
      pushHistory();
      // onChange 从 draftRef.current 取草稿做保存/校验 —— 换新对象必须先同步 ref，
      // 否则它会把旧草稿又写回去（同帧的 setDraft 还没重渲染）
      draftRef.current = nd;
      setDraft(nd);
      setSelected(null);
      setSelPrompt(false);
      onChange();
      toast.success(`已载入模板：${p.name}`, {
        description: seeded.added ? `已顺带注册 ${seeded.added} 个默认指标` : undefined,
        timeout: 2000,
      });
    } catch (e) {
      toast.danger("加载模板失败", { description: String(e), timeout: 6000 });
    }
  };

  /** 在空位落一个新部件并选中它。默认参数来自注册表元数据（/api/widgets/meta），
   * 与后端一份；只有需要"第一次就有东西看"的内容（示例 HTML、占位指标）在这补。 */
  const addFree = (type: string) => {
    const d = draftRef.current;
    if (!d || !metrics) return;
    pushHistory();
    const first = outPaths(metrics)[0];
    const n = d.widgets.length;
    const base: Record<string, unknown> = {
      type,
      x: 48 + (n % 4) * 32, y: 40 + (n % 4) * 28,
      ...(meta?.widgets[type]?.defaults ?? {}),
    };
    if (type === "stat" || type === "progress" || type === "gauge" || type === "spark" || type === "bars") {
      Object.assign(base, { type, metric: first });
    }
    if (type === "value") Object.assign(base, { type, metrics: { metrics: [first] } });
    if (type === "html") Object.assign(base, {
      type,
      html: '<div style="font-size:22px;font-weight:700">CPU {cpu.usage} · {cpu.temp}</div>',
    });
    if (type === "cards") Object.assign(base, {
      type,
      items: [{ key: `card${Date.now() % 10000}`, label: "卡片", bar: first,
        value: { metrics: [first] }, sub: { sep: " · ", metrics: [] } }],
    });
    if (type === "chips") Object.assign(base, { type, items: [] });
    if (type === "text") Object.assign(base, { type, text: "{cpu.usage}%" });
    if (type === "panel") Object.assign(base, { type });
    d.widgets.push(base as unknown as Widget);
    setDraft({ ...d });
    setSelected(n);
    setMulti([n]);   // 新部件取代之前的多选
    onChange();
  };

  const removeWidget = (i: number) => removeWidgets([i]);

  /** 批量删除（多选/整组）：一次历史，下标从大到小splice防错位。
   * 锁定件被拦截跳过——全锁时提示先解锁。 */
  const removeWidgets = (indices: number[]) => {
    const d = draftRef.current;
    if (!d || !indices.length) return;
    const free = indices.filter(j => !(d.widgets[j] as NodeBase)?.locked);
    if (!free.length) {
      toast.default("选中的部件已锁定，先在图层面板解锁", { timeout: 2000 });
      return;
    }
    pushHistory();
    [...free].sort((a, b) => b - a).forEach(j => d.widgets.splice(j, 1));
    const blocked = indices.length - free.length;
    if (blocked) toast.default(`${blocked} 个锁定部件已跳过删除`, { timeout: 2000 });
    clearSel();
    setDraft({ ...d });
    onChange();
  };

  const duplicateWidget = (i: number) => duplicateWidgets([i]);

  /** 批量复制（多选/整组）：错位落下，选中新副本；组员复制后自动结成新组 */
  const duplicateWidgets = (indices: number[]) => {
    const d = draftRef.current;
    if (!d || !indices.length) return;
    pushHistory();
    const stamp = Date.now().toString(36);
    const newIdx: number[] = [];
    for (const i of [...indices].sort((a, b) => a - b)) {
      const src = d.widgets[i];
      if (!src) continue;
      const copy = JSON.parse(JSON.stringify(src)) as Widget & FreePos;
      copy.x = (copy.x ?? 0) + 24;
      copy.y = (copy.y ?? 0) + 16;
      if (copy.type === "cards") {
        copy.items = copy.items.map((c, k) => ({ ...c, key: `${c.key || "card"}_${stamp}_${k}` }));
      }
      // 组员复制出来结成自己的新组，不和原件混在一组；嵌套组只换第一段路径，
      // 子组结构原样保留（g1/g2 → g1_x/g2）
      if (copy.group) {
        const cut = copy.group.indexOf("/");
        copy.group = cut < 0
          ? `${copy.group}_${stamp}`
          : `${copy.group.slice(0, cut)}_${stamp}${copy.group.slice(cut)}`;
      }
      d.widgets.push(copy);
      newIdx.push(d.widgets.length - 1);
    }
    setDraft({ ...d });
    setSelected(newIdx[newIdx.length - 1]);
    setMulti(newIdx);
    onChange();
  };

  /** 成组：选中集合打同一个组标签。整组被选中的既有小组作为子组嵌进新组
   * （标签变路径 "新组/旧组"），零散部件直接挂新组 —— 组由此支持任意嵌套。
   * 读 multiRef 不读 multi：快捷键 effect 的闭包不会随选择重跑，ref 永远新鲜。 */
  const groupSel = () => {
    const d = draftRef.current;
    const sel = multiRef.current;
    if (!d || sel.length < 2) return;
    pushHistory();
    const gid = `g${Date.now().toString(36)}`;
    const selByTag = new Map<string, number>();
    const allByTag = new Map<string, number>();
    sel.forEach(i => {
      const t = d.widgets[i]?.group;
      if (t) selByTag.set(t, (selByTag.get(t) ?? 0) + 1);
    });
    d.widgets.forEach(w => {
      const t = w?.group;
      if (t) allByTag.set(t, (allByTag.get(t) ?? 0) + 1);
    });
    sel.forEach(i => {
      const w = d.widgets[i] as GroupedWidget;
      const t = w.group;
      w.group = t && allByTag.get(t) === selByTag.get(t) ? `${gid}/${t}` : gid;
    });
    enterGrp("");
    setDraft({ ...d });
    onChange();
  };

  /** 解组：拆掉选中件所在组的最外一层（标签去掉第一段路径），剩下的路径段
   * 保持子组结构 —— 嵌套组逐层拆，一次一层。 */
  const ungroupSel = () => {
    const d = draftRef.current;
    const sel = multiRef.current;
    if (!d || !sel.length) return;
    pushHistory();
    sel.forEach(i => {
      const w = d.widgets[i] as GroupedWidget;
      if (!w.group) return;
      const cut = w.group.indexOf("/");
      if (cut < 0) delete w.group;
      else w.group = w.group.slice(cut + 1);
    });
    enterGrp("");
    setDraft({ ...d });
    onChange();
  };

  /** Phase 13：把指标卡片拆成原子件——标题文字 / 大数字 / 进度条 / 柱状条 / 次要行。
   * 几何按渲染器同一套布局公式从部件矩形内推算（标题 21 + 间 5 + 条行 18 + 间 5 + 底行 17），
   * 拆出的全是普通部件（结成一组、组名自动起），随便改随便删；一次历史可整体撤销。
   * 旧组件由此渐进迁移成积木组合，卡片本身原样保留、不强制拆。
   * N1 batch：软着陆横幅的批量入口传 { batch: true } —— 不推历史/不弹 toast/不 setDraft，
   * 只原地改 draftRef 并返回拆出件数（0 = 没拆成），历史与重绘由调用方统一做。 */
  const explodeCards = (i: number, opts?: { batch?: boolean }): number => {
    const d = draftRef.current;
    const w = d?.widgets[i];
    if (!d || !w || w.type !== "cards") return 0;
    const r = rectsRef.current[i];
    if (!r) {
      if (!opts?.batch) toast.default("卡片几何还没回报，稍等一下再拆", { timeout: 2000 });
      return 0;
    }
    const st = (w.style ?? {}) as Record<string, unknown>;
    const cols = Math.max(1, w.cols ?? 4);
    const gap = w.gap ?? 32;
    const ih = w.item_height ?? 66;
    const cw = Math.floor((r.w - (cols - 1) * gap) / cols);
    const titleSize = (st.title_size as number) ?? 17;
    const titleH = 21, gapY = 5, subH = 17;
    const sparkW = Math.max(40, Math.min(300, (st.spark_w as number) ?? 82));
    const sparkH = Math.max(10, Math.min(60, (st.spark_h as number) ?? 17));
    // gid 带随机后缀：横幅批量同毫秒连拆多张卡时 Date.now() 相同，裸时间戳必撞组
    const gid = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const atoms: Widget[] = [];
    (w.items ?? []).forEach((c, k) => {
      const cx = r.x + (k % cols) * (cw + gap);
      const cy = r.y + Math.floor(k / cols) * (ih + gap);
      const subY = cy + ih - subH;
      // 标题（卡片的名字色 → 文字色）
      if (c.label) atoms.push({
        type: "text", text: c.label, size: titleSize,
        x: cx, y: cy, w: cw, group: gid,
        ...(typeof st.label === "string" ? { style: { color: st.label } } : {}),
      } as unknown as Widget);
      // 大数字（右上对齐，数值组的名字色 = 卡片名字色）
      if (c.value?.metrics?.length) atoms.push({
        type: "value", metrics: c.value, size: titleSize,
        x: cx, y: cy, w: cw, align: "right", group: gid,
        ...(typeof st.label === "string" ? { style: { label: st.label } } : {}),
      } as unknown as Widget);
      // 进度条行（条粗跟随卡片 bar_h，轨道/填充色跟随卡片）
      if (c.bar) atoms.push({
        type: "progress", metric: c.bar, height: Math.min(20, (st.bar_h as number) ?? 13),
        x: cx, y: cy + titleH + gapY, w: cw, group: gid,
        style: {
          ...(typeof st.accent === "string" ? { accent: st.accent } : {}),
          ...(typeof st.track === "string" ? { track: st.track } : {}),
        },
      } as unknown as Widget);
      // 底行：迷你曲线（柱状条形态 = 卡片内嵌观感）
      if (c.spark) atoms.push({
        type: "bars", metric: c.spark, w: sparkW, h: sparkH, samples: 30,
        x: cx, y: subY + Math.max(0, Math.round((subH - sparkH) / 2)), group: gid,
        ...(typeof st.accent === "string" ? { style: { accent: st.accent } } : {}),
      } as unknown as Widget);
      // 底行：次要行（数值组，带名字）
      if (c.sub?.metrics?.length) atoms.push({
        type: "value", metrics: c.sub, size: 14, show_name: true,
        x: cx + (c.spark ? sparkW + 8 : 0), y: subY,
        w: cw - (c.spark ? sparkW + 8 : 0), group: gid,
        ...(typeof st.dim === "string" ? { style: { color: st.dim } } : {}),
      } as unknown as Widget);
    });
    if (!atoms.length) {
      if (!opts?.batch) toast.default("这张卡片没有可拆的内容", { timeout: 2000 });
      return 0;
    }
    if (!opts?.batch) pushHistory();
    d.groups = { ...(d.groups ?? {}), [gid]: `卡片拆件 · ${w.items?.length ?? 0} 张` };
    d.widgets.splice(i, 1, ...atoms);
    if (!opts?.batch) {
      clearSel();
      setDraft({ ...d });
      onChange();
      toast.success(`已拆成 ${atoms.length} 个原子件并成组`, { timeout: 2000 });
    }
    return atoms.length;
  };

  /** N1（D5-A）：chips 的一键拆解 —— 整行小指标换成单个「数值组」原子件
   * （value 与 chips 互为原子形态，见注册表 summary）。宽必须取 rects 实宽写进
   * 原子 w（用户口径），x/y 原位；items 字符串/引用统一映射成 metrics 组，
   * 文字/名字色跟随 chips 外观。batch 语义与 explodeCards 相同。 */
  const explodeChips = (i: number, opts?: { batch?: boolean }): number => {
    const d = draftRef.current;
    const w = d?.widgets[i];
    if (!d || !w || w.type !== "chips") return 0;
    const r = rectsRef.current[i];
    if (!r) {
      if (!opts?.batch) toast.default("小指标行几何还没回报，稍等一下再拆", { timeout: 2000 });
      return 0;
    }
    const items = (w.items ?? []) as (string | { metric: string })[];
    const metrics = items.map(it => (typeof it === "string" ? { metric: it } : it));
    if (!metrics.length) {
      if (!opts?.batch) toast.default("这行小指标没有可拆的内容", { timeout: 2000 });
      return 0;
    }
    const st = (w.style ?? {}) as Record<string, unknown>;
    const atom = {
      type: "value",
      metrics: { metrics },
      size: w.font ?? 15,
      show_name: true,
      x: r.x, y: r.y, w: r.w,
      ...(typeof st.label === "string" || typeof st.color === "string" ? {
        style: {
          ...(typeof st.label === "string" ? { label: st.label } : {}),
          ...(typeof st.color === "string" ? { color: st.color } : {}),
        },
      } : {}),
    } as unknown as Widget;
    if (!opts?.batch) pushHistory();
    d.widgets.splice(i, 1, atom);
    if (!opts?.batch) {
      clearSel();
      setDraft({ ...d });
      onChange();
      toast.success("已拆成 1 个数值组原子件", { timeout: 2000 });
    }
    return 1;
  };

  /** N1 软着陆横幅的一键拆解：cards/chips 全拆成原子件，一次历史整体可撤销。
   * 倒序遍历（拆解是 splice(i, 1, …)，先高后低下标不漂移，rects 也不错位）；
   * 个别件几何还没回报就跳过并提示，其余照拆。 */
  const explodeAllClassic = () => {
    const d = draftRef.current;
    if (!d) return;
    // 先预筛「rects 已实报」的下标再推历史（用户口径）：全部跳过就不动历史栈
    const idxs = d.widgets
      .map((w, i) => ((w.type === "cards" || w.type === "chips") && rectsRef.current[i]) ? i : -1)
      .filter(i => i >= 0).reverse();
    if (!idxs.length) {
      toast.default(d.widgets.some(w => w.type === "cards" || w.type === "chips")
        ? "经典部件的几何还没回报，稍等一下再拆" : "没有可拆解的经典部件", { timeout: 2500 });
      return;
    }
    pushHistory();
    let done = 0, skipped = 0;
    for (const i of idxs) {
      const w = d.widgets[i];
      const n = w?.type === "cards" ? explodeCards(i, { batch: true })
        : w?.type === "chips" ? explodeChips(i, { batch: true }) : 0;
      if (n > 0) done++; else skipped++;
    }
    clearSel();
    setDraft({ ...d });
    onChange();
    if (skipped) toast.default(`已拆解 ${done} 个，${skipped} 个没有可拆的内容`, { timeout: 3000 });
    else toast.success(`已拆解 ${done} 个经典部件`, { timeout: 2500 });
  };

  /** Phase 14：把选中集存成自定义组件——坐标按选中集包围盒左上角归一到 0,0，
   * 组嵌套标签原样保留；名字在弹层里起，服务端存 user_components.json。 */
  const saveSelectionAsComponent = () => {
    const d = draftRef.current;
    const sel = multiRef.current;
    if (!d || !sel.length) return;
    const xs = sel.map(i => (d.widgets[i] as FreePos).x ?? 0);
    const ys = sel.map(i => (d.widgets[i] as FreePos).y ?? 0);
    const x1 = Math.min(...xs), y1 = Math.min(...ys);
    const widgets = sel.map(i => {
      const copy = JSON.parse(JSON.stringify(d.widgets[i])) as Widget & FreePos;
      copy.x = (copy.x ?? 0) - x1;
      copy.y = (copy.y ?? 0) - y1;
      return copy as Widget;
    });
    setSaveComp({ name: "", widgets });
  };

  const commitSaveComponent = async () => {
    if (!saveComp) return;
    const rep = await api.addComponent({ name: saveComp.name, widgets: saveComp.widgets });
    if (!rep.saved) {
      toast.danger("保存失败", { description: (rep.errors || []).join("；"), timeout: 6000 });
      return;
    }
    const list = await api.components().catch(() => null);
    if (list) setComponents(list.components);
    setSaveComp(null);
    toast.success(`已存为组件「${rep.entry?.name}」`, {
      description: "「添加部件 → 我的组件」随时取用", timeout: 2500,
    });
  };

  /** 插入自定义组件：原样复制一份落在画布左上区域，组标签首段重排避免与
   * 现有组撞车（g1/g2 → g1_x/g2），插入后整组选中方便挪位。 */
  const insertComponent = (c: CustomComponent) => {
    const d = draftRef.current;
    if (!d || !c.widgets.length) return;
    pushHistory();
    const stamp = Date.now().toString(36);
    const segMap = new Map<string, string>();
    const copies = c.widgets.map(raw => {
      const copy = JSON.parse(JSON.stringify(raw)) as Widget & FreePos;
      if (copy.group) {
        const root = copy.group.split("/")[0];
        if (!segMap.has(root)) segMap.set(root, `${root}_${stamp}`);
        copy.group = copy.group.includes("/")
          ? `${segMap.get(root)}${copy.group.slice(copy.group.indexOf("/"))}`
          : segMap.get(root)!;
      }
      copy.x = (copy.x ?? 0) + 48;
      copy.y = (copy.y ?? 0) + 40;
      return copy;
    });
    d.widgets.push(...copies);
    const first = d.widgets.length - copies.length;
    setDraft({ ...d });
    setSelected(d.widgets.length - 1);
    setMulti(d.widgets.map((_, k) => k).slice(first));
    onChange();
    toast.success(`已插入组件「${c.name}」`, { timeout: 2000 });
  };

  /** 多选对齐：以渲染后的真实几何为准（rects），把每个部件的 x/y 吸到公共边 */
  const alignSel = (mode: "left" | "cx" | "right" | "top" | "cy" | "bottom") => {
    const d = draftRef.current;
    if (!d || multi.length < 2) return;
    // 锁定件不参与对齐
    const rs = multi.map(i => ({ i, r: rectsRef.current[i] }))
      .filter(x => x.r && !(d.widgets[x.i] as NodeBase)?.locked);
    if (rs.length < 2) return;
    pushHistory();
    const minX = Math.min(...rs.map(x => x.r!.x));
    const maxX = Math.max(...rs.map(x => x.r!.x + x.r!.w));
    const minY = Math.min(...rs.map(x => x.r!.y));
    const maxY = Math.max(...rs.map(x => x.r!.y + x.r!.h));
    for (const { i, r } of rs) {
      const w = d.widgets[i] as FreePos;
      if (mode === "left") w.x = minX;
      if (mode === "right") w.x = maxX - r!.w;
      if (mode === "cx") w.x = Math.round((minX + maxX) / 2 - r!.w / 2);
      if (mode === "top") w.y = minY;
      if (mode === "bottom") w.y = maxY - r!.h;
      if (mode === "cy") w.y = Math.round((minY + maxY) / 2 - r!.h / 2);
    }
    setDraft({ ...d });
    onChange();
  };

  /** 层级：与相邻部件交换（dir=+1 上移一层/盖上来，-1 下移一层） */
  const moveLayer = (i: number, dir: 1 | -1) => {
    const d = draftRef.current;
    if (!d) return;
    const j = i + dir;
    if (j < 0 || j >= d.widgets.length) return;
    pushHistory();
    [d.widgets[i], d.widgets[j]] = [d.widgets[j], d.widgets[i]];
    setSelected(j);
    setDraft({ ...d });
    onChange();
  };

  const toFront = (i: number) => {
    const d = draftRef.current;
    if (!d) return;
    pushHistory();
    const [m] = d.widgets.splice(i, 1);
    d.widgets.push(m);
    setSelected(d.widgets.length - 1);
    setDraft({ ...d });
    onChange();
  };

  const toBack = (i: number) => {
    const d = draftRef.current;
    if (!d) return;
    pushHistory();
    const [m] = d.widgets.splice(i, 1);
    d.widgets.unshift(m);
    setSelected(0);
    setDraft({ ...d });
    onChange();
  };

  const nudge = (i: number, dx: number, dy: number) => {
    const d = draftRef.current;
    const w = d?.widgets[i] as FreePos | undefined;
    if (!d || !w || (w as NodeBase).locked) return;
    // 连按方向键只记一次历史（半秒内的连续微调合成一步撤销）
    if (Date.now() - lastPushRef.current > 500) pushHistory();
    w.x = Math.max(0, Math.min((w.x ?? 0) + dx, d.canvas.w - 24));
    w.y = Math.max(0, Math.min((w.y ?? 0) + dy, d.canvas.h - 8));
    setDraft({ ...d });
    onChange();
  };

  /** 方向键微调装饰命令行（和部件同一套边界口径） */
  const nudgePrompt = (dx: number, dy: number) => {
    const d = draftRef.current;
    const p = d?.prompt;
    if (!d || !p) return;
    if (Date.now() - lastPushRef.current > 500) pushHistory();
    const pad = d.canvas.padding || [12, 24];
    p.x = Math.max(0, Math.min((p.x ?? pad[1]) + dx, d.canvas.w - 24));
    p.y = Math.max(0, Math.min((p.y ?? pad[0]) + dy, d.canvas.h - 8));
    setDraft({ ...d });
    onChange();
  };

  /** 删除装饰命令行（Delete 键也走这里） */
  const removePrompt = () => {
    const d = draftRef.current;
    if (!d || !d.prompt) return;
    pushHistory();
    delete d.prompt;
    setSelPrompt(false);
    setDraft({ ...d });
    onChange();
  };

  // 快捷键：Ctrl+S 保存 · Ctrl+Z 撤销 · Ctrl+D 复制 · Ctrl+G 成组/解组 · Delete 删除 ·
  // 方向键微调 · Shift+1 适应 · Shift+0 100% · 空格 临时抓手
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === "s") { e.preventDefault(); save(); return; }
      if (ctrl && (k === "z" || k === "y") && !typing) {
        e.preventDefault();
        if (k === "y" || e.shiftKey) redoEdit();   // Ctrl+Shift+Z / Ctrl+Y
        else undoEdit();
        return;
      }
      if (ctrl && k === "g" && !typing) {
        e.preventDefault();
        if (e.shiftKey) ungroupSel();
        else groupSel();
        return;
      }
      if (e.key === "Escape" && !typing) {
        // 先退出组编辑态（逐层），退无可退才清选中 —— spec 的 Esc 次序
        if (grpEnteredRef.current) {
          const segs = grpEnteredRef.current.split("/");
          segs.pop();
          enterGrp(segs.join("/"));
          return;
        }
        setSelected(null); setSelPrompt(false); setMulti([]); setCtxMenu(null); setAddOpen(false); return;
      }
      if (e.key === "Enter" && !typing && (selected != null || multiRef.current.length > 0)) {
        const at = selected ?? multiRef.current[multiRef.current.length - 1];
        if (at != null && at >= 0) { e.preventDefault(); enterGroupAt(at); }
        return;
      }
      if (!typing && e.code === "Space" && !ctrl) {
        if (!e.repeat) setSpaceDown(true);
        e.preventDefault();   // 别滚页面、别按聚焦按钮
        return;
      }
      if (e.shiftKey && !ctrl && !typing) {
        if (e.code === "Digit1") { e.preventDefault(); setZoom(null); return; }
        if (e.code === "Digit0") { e.preventDefault(); setZoom(1); return; }
      }
      if (selected == null && !selPrompt) return;
      if (ctrl && k === "d" && !typing) {
        e.preventDefault();
        if (multiRef.current.length > 1) duplicateWidgets(multiRef.current);
        else if (selected != null) duplicateWidget(selected);
        else toast.default("命令行装饰只有一个，不支持复制", { timeout: 2000 });
        return;
      }
      if (e.key === "Delete" && !typing) {
        if (multiRef.current.length > 1) removeWidgets(multiRef.current);
        else if (selected != null) removeWidget(selected);
        else removePrompt();
        return;
      }
      if (!typing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        if (multiRef.current.length > 1) {
          for (const j of multiRef.current) nudge(j, dx, dy);
        } else if (selected != null) nudge(selected, dx, dy);
        else nudgePrompt(dx, dy);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selPrompt, save, undoEdit, redoEdit]);

  // 菜单开着时，点哪儿都先关掉（菜单自己 stopPropagation）
  useEffect(() => {
    if (!ctxMenu && !addOpen) return;
    const close = () => { setCtxMenu(null); setAddOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("wheel", close);
    };
  }, [ctxMenu, addOpen]);

  // Ctrl+滚轮缩放（挂原生监听：passive:false 才允许 preventDefault 压掉浏览器缩放）
  const ready = !!draft && !!metrics;
  useEffect(() => {
    if (!ready) return;
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomAtPoint(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0022));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  /** 选中部件：普通点击按当前所在组层级选（未进组=最外层整组；进入后逐层深入）；
   * shift/ctrl 时加减选单个。 */
  const selectWidget = (i: number, additive = false) => {
    setSelPrompt(false);
    if (additive) {
      setMulti(m => (m.includes(i) ? m.filter(j => j !== i) : [...m, i]));
      return;
    }
    const d = draftRef.current;
    const members = d ? selTargetsAt(d.widgets, i, grpEnteredRef.current) : [i];
    setMulti(members);
    setSelected(i);
  };

  /** 单选一个部件（图层树的叶子行用：树已表达结构，行点击就选行本身） */
  const selectSingle = (i: number) => {
    setSelPrompt(false);
    setMulti([i]);
    setSelected(i);
  };

  /** 双击 / Enter：钻进部件所在的下一层组。已在直属层时不再深入。 */
  const enterGroupAt = (i: number) => {
    const d = draftRef.current;
    const tag = d?.widgets[i]?.group;
    if (!d || !tag) return;
    const d0 = grpEnteredRef.current ? grpEnteredRef.current.split("/").length : 0;
    if (d0 >= tagDepth(tag)) return;
    enterGrp(tag.split("/").slice(0, d0 + 1).join("/"));
    const members = selTargetsAt(d.widgets, i, grpEnteredRef.current);
    setMulti(members);
    setSelected(i);
  };

  /** 提交组重命名：名字写进草稿的 groups 名表（路径 → 名字），清空 = 删回默认 */
  const commitRename = () => {
    const d = draftRef.current;
    if (!d || !renaming) return;
    const name = renaming.v.trim();
    pushHistory();
    if (!d.groups || typeof d.groups !== "object") d.groups = {};
    if (name) d.groups[renaming.path] = name;
    else delete d.groups[renaming.path];
    setRenaming(null);
    setDraft({ ...d });
    onChange();
  };

  /** 隐藏 / 锁定（Phase 9 的通用属性）：批量落在给定下标上。
   * visible=false 渲染器直接不画（Phase 1 已打通）；locked 是编辑器语义——
   * 画布只选不拖、不缩放、框选跳过、删除拦截，解锁走图层面板或属性面板。 */
  const setVisibleOf = (indices: number[], hide: boolean) => {
    const d = draftRef.current;
    if (!d || !indices.length) return;
    pushHistory();
    indices.forEach(i => {
      const w = d.widgets[i] as NodeBase;
      if (hide) w.visible = false;
      else delete w.visible;
    });
    setDraft({ ...d });
    onChange();
  };

  const setLockedOf = (indices: number[], lock: boolean) => {
    const d = draftRef.current;
    if (!d || !indices.length) return;
    pushHistory();
    indices.forEach(i => {
      const w = d.widgets[i] as NodeBase;
      if (lock) w.locked = true;
      else delete w.locked;
    });
    setDraft({ ...d });
    onChange();
  };

  const toggleVisible = (i: number) =>
    setVisibleOf([i], (draftRef.current?.widgets[i] as NodeBase)?.visible !== false);
  const toggleLocked = (i: number) =>
    setLockedOf([i], !(draftRef.current?.widgets[i] as NodeBase)?.locked);

  const clearSel = () => { setSelected(null); setSelPrompt(false); setMulti([]); };

  const openCtx = (e: React.MouseEvent, kind: "widget" | "prompt", i: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (kind === "widget") {
      // 右键已在多选里 = 保持整组菜单；否则收敛为单选
      if (multiRef.current.includes(i)) { setSelected(i); setSelPrompt(false); }
      else selectWidget(i);
    } else { setSelected(null); setMulti([]); setSelPrompt(true); }
    setCtxMenu({ x: e.clientX, y: e.clientY, kind, i });
  };

  const onDown = (e: React.MouseEvent, i: number, mode: "move" | "resize" | "rotate", handle?: string) => {
    e.stopPropagation();
    if (!draft) return;
    if (spaceRef.current) { startPan(e); return; }   // 空格=临时抓手：按下不选不拖部件
    setSelPrompt(false);
    // 选择逻辑：shift/ctrl 加减选（只对拖动 —— 缩放手势的 Shift 是等比，不能抢）；
    // 普通点击 = 组整体；拖已选成员 = 整组动。缩放/旋转只作用于单件。
    let targets: number[];
    if (mode === "move" && (e.shiftKey || e.ctrlKey || e.metaKey)) {
      targets = multiRef.current.includes(i)
        ? multiRef.current.filter(j => j !== i)
        : [...multiRef.current, i];
      setMulti(targets);
      if (!targets.includes(i)) return;   // 把自己移出选择：只选不拖
    } else if (mode === "move" && multiRef.current.includes(i)) {
      targets = multiRef.current;
    } else {
      targets = mode === "move" ? selTargetsAt(draft.widgets, i, grpEnteredRef.current) : [i];
      setMulti(targets);
    }
    setSelected(i);
    // 锁定件：只选不拖不改大小（解锁走图层面板或属性面板的锁开关）
    if ((draft.widgets[i] as NodeBase).locked) return;
    const w = draft.widgets[i] as FreePos;
    const r = rects[i];
    const origins: Record<number, { x: number; y: number }> = {};
    for (const j of targets) {
      const wj = draft.widgets[j] as FreePos;
      origins[j] = { x: wj.x ?? rects[j]?.x ?? 0, y: wj.y ?? rects[j]?.y ?? 0 };
    }
    // 旋转与 Alt 中心缩放绕未旋转盒的几何中心（rects 是未旋转几何，旋转不改中心）
    const ox = w.x ?? r?.x ?? 0, oy = w.y ?? r?.y ?? 0;
    const ow = w.w ?? r?.w ?? 300, oh = r?.h ?? 24;
    let ang0 = 0;
    if (mode === "rotate") {
      const box = canvasBoxRef.current;
      if (box) {
        const br = box.getBoundingClientRect();
        ang0 = Math.atan2((e.clientY - br.top) / (scaleRef.current || 1) - (oy + oh / 2),
                          (e.clientX - br.left) / (scaleRef.current || 1) - (ox + ow / 2));
      }
    }
    const rot0 = (draft.widgets[i] as NodeBase).rotation ?? 0;
    dragRef.current = {
      target: "widget", i, mode, handle,
      targets: mode === "move" ? targets : [i],
      origins,
      npos: {},
      sx: e.clientX, sy: e.clientY,
      ox, oy, ow, oh,
      stretch: mode === "move" && stretchable(draft.widgets[i].type) && w.w === undefined,
      cx: ox + ow / 2, cy: oy + oh / 2,
      rot0, ang0, nrot: rot0,
    };
  };

  /** 装饰命令行：只能整体挪动（宽度由文字内容决定），吸附与部件同等待遇 */
  const onPromptDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    const d = draft;
    if (!d?.prompt || !promptRect) return;
    if (spaceRef.current) { startPan(e); return; }
    setSelected(null);
    setSelPrompt(true);
    const pad = d.canvas.padding || [12, 24];
    dragRef.current = {
      target: "prompt", i: -1, mode: "move",
      sx: e.clientX, sy: e.clientY,
      ox: d.prompt.x ?? pad[1], oy: d.prompt.y ?? pad[0],
      ow: promptRect.w, oh: promptRect.h,
      stretch: false,
    };
  };

  /** 多选包围盒上的手柄：整体缩放。包围盒与各成员的原始几何在 down 时冻结，
   * 拖动只算新包围盒，成员按比例映射（保持相对位置），松手一次进草稿。 */
  const onGroupResizeDown = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    if (!draft || spaceRef.current) return;
    const rs = multi.map(i => ({ i, r: rects[i] })).filter(m => m.r);
    if (rs.length < 2) return;
    const x1 = Math.min(...rs.map(m => m.r!.x));
    const y1 = Math.min(...rs.map(m => m.r!.y));
    const x2 = Math.max(...rs.map(m => m.r!.x + m.r!.w));
    const y2 = Math.max(...rs.map(m => m.r!.y + m.r!.h));
    setSelPrompt(false);
    dragRef.current = {
      target: "widget", i: rs[rs.length - 1].i, mode: "resize", handle,
      targets: multi, npos: {},
      sx: e.clientX, sy: e.clientY,
      ox: x1, oy: y1, ow: x2 - x1, oh: y2 - y1,
      stretch: false,
      gbox: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
      gmembers: rs.map(m => ({ i: m.i, x: m.r!.x, y: m.r!.y, w: m.r!.w, h: m.r!.h })),
    };
  };

  // 平移：中键或空格+左键按住拖画布（定倍率、画布溢出滚动条时最有用）。
  const startPan = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    e.preventDefault();      // 压掉浏览器中键自动滚动
    e.stopPropagation();     // 别触发取消选中
    panRef.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = "grabbing";
  };
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const p = panRef.current, el = wrapRef.current;
      if (!p || !el) return;
      el.scrollLeft = p.sl - (e.clientX - p.x);
      el.scrollTop = p.st - (e.clientY - p.y);
    };
    const up = () => {
      if (!panRef.current) return;
      panRef.current = null;
      if (wrapRef.current) wrapRef.current.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  /** 框选：空白处按下拖出橡皮筋，松手把相交的部件都选上。
   * 橡皮筋走 DOM 直改（client 坐标），松手才换算成画布坐标比对 rects。 */
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const s = bandStartRef.current;
      const band = bandRef.current;
      if (!s || !band) return;
      const x1 = Math.min(s.x, e.clientX), y1 = Math.min(s.y, e.clientY);
      const x2 = Math.max(s.x, e.clientX), y2 = Math.max(s.y, e.clientY);
      band.style.display = "block";
      band.style.left = x1 + "px";
      band.style.top = y1 + "px";
      band.style.width = x2 - x1 + "px";
      band.style.height = y2 - y1 + "px";
    };
    const up = (e: MouseEvent) => {
      const s = bandStartRef.current;
      bandStartRef.current = null;
      const band = bandRef.current;
      if (!s || !band) return;
      band.style.display = "none";
      const x2 = Math.max(s.x, e.clientX), y2 = Math.max(s.y, e.clientY);
      const x1 = Math.min(s.x, e.clientX), y1 = Math.min(s.y, e.clientY);
      if (x2 - x1 < 4 || y2 - y1 < 4) return;   // 几乎没拖动 = 普通点击（mousedown 已清选）
      const box = canvasBoxRef.current;
      const scale = scaleRef.current || 1;
      if (!box) return;
      const br = box.getBoundingClientRect();
      const cx1 = (x1 - br.left) / scale, cy1 = (y1 - br.top) / scale;
      const cx2 = (x2 - br.left) / scale, cy2 = (y2 - br.top) / scale;
      const hits: number[] = [];
      rectsRef.current.forEach((r, i) => {
        // 锁定件不进框选（与画布点击同口径：只读不操作）
        if (r && !(draftRef.current?.widgets[i] as NodeBase)?.locked
          && r.x < cx2 && r.x + r.w > cx1 && r.y < cy2 && r.y + r.h > cy1) hits.push(i);
      });
      setMulti(hits);
      setSelected(hits.length ? hits[hits.length - 1] : null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // 属性面板左缘把手：按住横向拖即可调宽（300~760），松手记进 localStorage。
  // 画布容器是 dock 布局，宽度变化会触发 ResizeObserver 自动重新适应缩放。
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = propsDragRef.current;
      if (!d) return;
      setPropsW(Math.max(PROPS_W_MIN, Math.min(PROPS_W_MAX, d.w - (e.clientX - d.x))));
    };
    const up = () => {
      if (!propsDragRef.current) return;
      propsDragRef.current = null;
      localStorage.setItem(PROPS_W_KEY, String(propsWRef.current));
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  // 拖动：iframe 宿主节点 + 手柄盒都直改 DOM（不重渲染），松手才进草稿。
  // 拖近画布边缘或其他部件的左/右/中（上/下/中）时自动吸附，参考线直改 DOM。
  useEffect(() => {
    const snapAxis = (cands: number[], targets: number[]) => {
      let best: { dd: number; t: number; adj: number } | null = null;
      // 吸附半径按屏幕像素算（约 8 屏幕像素）：缩得很小时画布 8px 只有几屏幕
      // 像素，人手根本压不到；换算成屏幕像素后无论缩放多大都好吸。
      const radius = Math.max(SNAP_PX, Math.round(8 / (scaleRef.current || 1)));
      for (const c of cands) for (const t of targets) {
        const dd = Math.abs(c - t);
        if (dd <= radius && (!best || dd < best.dd)) best = { dd, t, adj: t - c };
      }
      return best;
    };
    /** 手柄缩放的核心数学：输入画布系位移，输出新矩形 {nx,ny,nw,nh}。
     * 旋转件先把手势逆旋转回部件本地系算新宽高（Shift 等比、Alt 以中心为原点），
     * 再绕世界系里不动的锚点（对边/对角，Alt=原中心）折回画布坐标 ——
     * 存储永远是未旋转盒 x/y/w/h + rotation，与渲染器一个口径。 */
    const resizeTo = (d: DragState, dx: number, dy: number, e: {
      shiftKey: boolean; altKey: boolean;
    }, he: boolean, gauge: boolean) => {
      const hnd = d.handle ?? "se";
      const th = ((d.rot0 ?? 0) * Math.PI) / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      const ldx = dx * cos + dy * sin;      // R(-θ)·(dx,dy)：手势换到部件本地系
      const ldy = -dx * sin + dy * cos;
      let lw = d.ow, lh = d.oh;
      if (hnd.includes("e")) lw = d.ow + ldx;
      if (hnd.includes("w")) lw = d.ow - ldx;
      if (hnd.includes("s")) lh = d.oh + ldy;
      if (hnd.includes("n")) lh = d.oh - ldy;
      if (gauge) {   // 圆环只有 size 一个自由度：按主轴等比，角手柄也是
        const s = Math.max(lw / d.ow, lh / d.oh);
        lw = d.ow * s; lh = d.oh * s;
      }
      lw = Math.max(40, lw);
      lh = he || gauge ? Math.max(12, lh) : d.oh;
      if (e.shiftKey && hnd.length === 2 && !gauge) {
        const s = Math.max(lw / d.ow, lh / d.oh);
        lw = d.ow * s;
        lh = he ? Math.max(12, d.oh * s) : d.oh;
      }
      const alt = e.altKey;
      let lx = 0, ly = 0;
      if (alt) { lx = (d.ow - lw) / 2; ly = (d.oh - lh) / 2; }
      else {
        if (hnd.includes("w")) lx = d.ow - lw;
        if (hnd.includes("n")) ly = d.oh - lh;
      }
      const cx = d.cx ?? d.ox + d.ow / 2, cy = d.cy ?? d.oy + d.oh / 2;
      const clx = lx + lw / 2, cly = ly + lh / 2;   // 新矩形的本地中心
      const alx = alt ? d.ow / 2 : hnd.includes("w") ? d.ow : hnd.includes("e") ? 0 : d.ow / 2;
      const aly = alt ? d.oh / 2 : hnd.includes("n") ? d.oh : hnd.includes("s") ? 0 : d.oh / 2;
      const rot = (vx: number, vy: number) => ({ x: vx * cos - vy * sin, y: vx * sin + vy * cos });
      const a = rot(alx - d.ow / 2, aly - d.oh / 2);   // 锚点的世界位置 = 原中心 + R(θ)·(锚点-原中心)
      const cc = rot(clx - alx, cly - aly);            // 新中心 = 锚点 + R(θ)·(新本地中心-锚点)
      return {
        nx: Math.max(0, Math.round(cx + a.x + cc.x - lw / 2)),
        ny: Math.max(0, Math.round(cy + a.y + cc.y - lh / 2)),
        nw: Math.round(lw),
        nh: Math.round(lh),
      };
    };
    const move = (e: MouseEvent) => {
      const d = dragRef.current;
      const cur = draftRef.current;
      if (!d || !cur) return;
      const scale = scaleRef.current;
      const dx = Math.round((e.clientX - d.sx) / scale);
      const dy = Math.round((e.clientY - d.sy) / scale);
      const W = cur.canvas.w, H = cur.canvas.h;
      const t = cur.widgets[d.i]?.type;
      // 旋转：指针绕部件中心的方位角变化 + 原角度；Shift 每 15° 一档。
      // 宿主与手柄盒一起转（transform 直改），数值牌实时报角度，松手才进草稿。
      if (d.mode === "rotate") {
        const box = canvasBoxRef.current;
        if (!box) return;
        const br = box.getBoundingClientRect();
        const px = (e.clientX - br.left) / scale, py = (e.clientY - br.top) / scale;
        let deg = (d.rot0 ?? 0)
          + (Math.atan2(py - (d.cy ?? 0), px - (d.cx ?? 0)) - (d.ang0 ?? 0)) * 180 / Math.PI;
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        deg = Math.round(((deg % 360) + 540) % 360 - 180);   // 归一到 -180~180
        d.nrot = deg;
        const tf = `rotate(${deg}deg)`;
        const host = frameRef.current?.contentDocument?.querySelector(
          `[data-wi="${d.i}"]`) as HTMLElement | null;
        if (host) { host.style.transformOrigin = "center"; host.style.transform = tf; }
        const node = boxRefs.current.get(d.i);
        if (node) { node.style.transformOrigin = "center"; node.style.transform = tf; }
        const badge = dimRef.current;
        if (badge) {
          const r = rectsRef.current[d.i];
          badge.style.display = "block";
          badge.style.left = ((r ? r.x + r.w / 2 : d.cx ?? 0)) * scale + "px";
          badge.style.top = ((r ? r.y : d.oy) - 26) * scale + "px";
          badge.textContent = `${deg}°`;
        }
        return;
      }
      // 缩放：单件（八向手柄，旋转件在本地坐标系里算）或多选（包围盒整体等比/自由缩放）。
      // 与拖动同一套手感：全程直改 DOM，松手才进草稿。
      if (d.mode === "resize") {
        const badge = dimRef.current;
        // ---- 多选：先算新包围盒（同一条手柄数学），吸附后按比例映射成员 ----
        if (d.gbox && d.gmembers) {
          const g = resizeTo(d, dx, dy, e, true, false);
          let snX: number | null = null;
          let snY: number | null = null;
          if (snapRef.current) {
            const xs = [0, W], ys = [0, H];
            const rs = rectsRef.current;
            for (let j = 0; j < cur.widgets.length; j++) {
              if (d.targets?.includes(j)) continue;
              const r = rs[j];
              if (!r) continue;
              xs.push(r.x, r.x + r.w, Math.round(r.x + r.w / 2));
              ys.push(r.y, r.y + r.h, Math.round(r.y + r.h / 2));
            }
            const bx = snapAxis([g.nx + g.nw], xs);
            if (bx) { g.nw = Math.max(40, g.nw + bx.adj); snX = bx.t; }
            const by = snapAxis([g.ny + g.nh], ys);
            if (by) { g.nh = Math.max(20, g.nh + by.adj); snY = by.t; }
          }
          d.gnx = g.nx; d.gny = g.ny; d.gnw = g.nw; d.gnh = g.nh;
          const fx = g.nw / d.gbox.w, fy = g.nh / d.gbox.h;
          for (const m of d.gmembers) {
            const mx = g.nx + (m.x - d.gbox.x) * fx;
            const my = g.ny + (m.y - d.gbox.y) * fy;
            const mw = Math.max(24, m.w * fx);
            const mh = Math.max(8, m.h * fy);
            // 高度只有高度可编辑的类型跟手；内容自撑高的（卡片/文字）只有位置跟
            const mhe = heightEditable(cur.widgets[m.i].type);
            const jhost = frameRef.current?.contentDocument?.querySelector(
              `[data-wi="${m.i}"]`) as HTMLElement | null;
            if (jhost) {
              jhost.style.left = mx + "px";
              jhost.style.top = my + "px";
              jhost.style.right = "";
              jhost.style.width = mw + "px";
              if (mhe) jhost.style.height = mh + "px";
            }
            const jnode = boxRefs.current.get(m.i);
            if (jnode) {
              jnode.style.left = mx * scale + "px";
              jnode.style.top = my * scale + "px";
              jnode.style.width = mw * scale + "px";
              if (mhe) jnode.style.height = mh * scale + "px";
            }
          }
          const mbox = multiBoxRef.current;
          if (mbox) {
            mbox.style.left = g.nx * scale + "px";
            mbox.style.top = g.ny * scale + "px";
            mbox.style.width = g.nw * scale + "px";
            mbox.style.height = g.nh * scale + "px";
          }
          const vg = vgRef.current, hg = hgRef.current;
          if (vg) { if (snX != null) { vg.style.display = "block"; vg.style.left = snX * scale + "px"; } else vg.style.display = "none"; }
          if (hg) { if (snY != null) { hg.style.display = "block"; hg.style.top = snY * scale + "px"; } else hg.style.display = "none"; }
          if (badge) {
            badge.style.display = "block";
            badge.style.left = (g.nx + g.nw / 2) * scale + "px";
            badge.style.top = (g.ny - 22) * scale + "px";
            badge.textContent = `${Math.round(g.nw)} × ${Math.round(g.nh)}`;
          }
          return;
        }
        // ---- 单件：八向手柄，右/下缘与左/上缘都去贴磁铁 ----
        const he = !!t && heightEditable(t);
        const gauge = t === "gauge";
        const g = resizeTo(d, dx, dy, e, he, gauge);
        let nx = g.nx, ny = g.ny, nw = g.nw, nh = g.nh;
        let snX: number | null = null;
        let snY: number | null = null;
        if (snapRef.current) {
          const xs = [0, W], ys = [0, H];
          const rs = rectsRef.current;
          for (let j = 0; j < cur.widgets.length; j++) {
            if (j === d.i) continue;
            const r = rs[j];
            if (!r) continue;
            xs.push(r.x, r.x + r.w, Math.round(r.x + r.w / 2));
            ys.push(r.y, r.y + r.h, Math.round(r.y + r.h / 2));
          }
          const pr = promptRef.current;
          if (pr) {
            xs.push(pr.x, pr.x + pr.w, Math.round(pr.x + pr.w / 2));
            ys.push(pr.y, pr.y + pr.h, Math.round(pr.y + pr.h / 2));
          }
          const hnd = d.handle ?? "se";
          if (hnd.includes("w")) {
            const bx = snapAxis([nx], xs);
            if (bx) { nx += bx.adj; nw = Math.max(40, nw - bx.adj); snX = bx.t; }
          } else {
            const bx = snapAxis([nx + nw], xs);
            if (bx) { nw = Math.max(40, nw + bx.adj); snX = bx.t; }
          }
          if (he) {
            if (hnd.includes("n")) {
              const by = snapAxis([ny], ys);
              if (by) { ny += by.adj; nh = Math.max(12, nh - by.adj); snY = by.t; }
            } else {
              const by = snapAxis([ny + nh], ys);
              if (by) { nh = Math.max(12, nh + by.adj); snY = by.t; }
            }
          }
        }
        d.nx = nx; d.ny = ny; d.nw = nw; d.nh = nh;
        const host = frameRef.current?.contentDocument?.querySelector(
          `[data-wi="${d.i}"]`) as HTMLElement | null;
        if (host) {
          host.style.left = nx + "px";
          host.style.top = ny + "px";
          host.style.right = "";
          host.style.width = nw + "px";
          if (he) {
            host.style.height = nh + "px";
            const track = host.querySelector<HTMLElement>(".fp-track");
            if (track) track.style.height = nh + "px";   // 进度条轨道跟着手走
          }
        }
        const node = boxRefs.current.get(d.i);
        if (node) {
          node.style.left = nx * scale + "px";
          node.style.top = ny * scale + "px";
          node.style.width = nw * scale + "px";
          if (he) node.style.height = nh * scale + "px";
        }
        const vg = vgRef.current, hg = hgRef.current;
        if (vg) { if (snX != null) { vg.style.display = "block"; vg.style.left = snX * scale + "px"; } else vg.style.display = "none"; }
        if (hg) { if (snY != null) { hg.style.display = "block"; hg.style.top = snY * scale + "px"; } else hg.style.display = "none"; }
        if (badge) {
          badge.style.display = "block";
          badge.style.left = (nx + nw / 2) * scale + "px";
          badge.style.top = (ny - 22) * scale + "px";
          badge.textContent = `${Math.round(nw)} × ${Math.round(nh)}`;
        }
        return;
      }
      // 左上角钳位在画布内（缩放/旋转在上面已提前返回，走到这里的都是拖动）
      const fx = Math.max(0, Math.min(d.ox + dx, W - 24));
      const fy = Math.max(0, Math.min(d.oy + dy, H - 8));
      let nx = fx, ny = fy;
      let snX: number | null = null;
      let snY: number | null = null;
      if (snapRef.current) {
        const xs = [0, W], ys = [0, H];
        const rs = rectsRef.current;
        for (let j = 0; j < cur.widgets.length; j++) {
          if (j === d.i) continue;
          const r = rs[j];
          if (!r) continue;
          xs.push(r.x, r.x + r.w, Math.round(r.x + r.w / 2));
          ys.push(r.y, r.y + r.h, Math.round(r.y + r.h / 2));
        }
        // 顶部装饰命令行也是磁铁：部件好对齐它的首部（左缘）和基线
        // （拖它本人的时候它不能当磁铁，不然永远零差值把自己钉死）
        const pr = d.target === "widget" ? promptRef.current : null;
        if (pr) {
          xs.push(pr.x, pr.x + pr.w, Math.round(pr.x + pr.w / 2));
          ys.push(pr.y, pr.y + pr.h, Math.round(pr.y + pr.h / 2));
        }
        const bw = d.stretch ? W - nx : d.ow;
        // 通栏部件右边缘恒等于画布右缘，当吸附候选会永远零差值匹配（参考线常驻噪音）
        const xCands = d.stretch
          ? [nx, Math.round(nx + bw / 2)]
          : [nx, nx + bw, Math.round(nx + bw / 2)];
        const bx = snapAxis(xCands, xs);
        if (bx) { nx = Math.max(0, Math.min(nx + bx.adj, W - 24)); snX = bx.t; }
        const by = snapAxis([ny, ny + d.oh, Math.round(ny + d.oh / 2)], ys);
        if (by) { ny = Math.max(0, Math.min(ny + by.adj, H - 8)); snY = by.t; }
      }
      // 网格兜底：位置就近吸附到网格线（步长是自适应的）。只认「网格」开关；若对象吸附已命中该轴则让位。
      if (gridRef.current) {
        const gs = gridStepRef.current;
        const gx = Math.round(nx / gs) * gs;
        const gy = Math.round(ny / gs) * gs;
        if (snX == null && gx !== nx) { nx = Math.max(0, Math.min(gx, W - 24)); }
        if (snY == null && gy !== ny) { ny = Math.max(0, Math.min(gy, H - 8)); }
      }
      d.nx = nx; d.ny = ny; d.nw = d.ow; d.nh = d.oh;
      // 多选拖动：primary 的有效位移（含钳位/吸附）差分给全组，宿主与手柄盒同步直改
      // （锁定件留在原地不跟组拖）
      if (d.target === "widget" && d.targets && d.targets.length > 1) {
        const ddx = nx - d.ox, ddy = ny - d.oy;
        for (const j of d.targets) {
          if (j === d.i) continue;
          if ((cur.widgets[j] as NodeBase)?.locked) continue;
          const o = d.origins?.[j];
          if (!o) continue;
          const jx = Math.max(0, Math.min(o.x + ddx, W - 24));
          const jy = Math.max(0, Math.min(o.y + ddy, H - 8));
          d.npos = d.npos || {};
          d.npos[j] = { x: jx, y: jy };
          const jhost = frameRef.current?.contentDocument?.querySelector(
            `[data-wi="${j}"]`) as HTMLElement | null;
          if (jhost) { jhost.style.left = jx + "px"; jhost.style.top = jy + "px"; }
          const jnode = boxRefs.current.get(j);
          if (jnode) { jnode.style.left = jx * scale + "px"; jnode.style.top = jy * scale + "px"; }
        }
      }
      const host = frameRef.current?.contentDocument?.querySelector(
        d.target === "prompt" ? "[data-prompt]" : `[data-wi="${d.i}"]`,
      ) as HTMLElement | null;
      if (host) {
        host.style.left = fx + "px";
        host.style.top = fy + "px";
      }
      const node = d.target === "prompt" ? promptBoxRef.current : boxRefs.current.get(d.i);
      if (node) {
        node.style.left = fx * scale + "px";
        node.style.top = fy * scale + "px";
        node.style.width = (d.stretch ? W - nx : d.ow) * scale + "px";
      }
      const vg = vgRef.current, hg = hgRef.current;
      if (vg) {
        if (snX != null) { vg.style.display = "block"; vg.style.left = snX * scale + "px"; }
        else vg.style.display = "none";
      }
      if (hg) {
        if (snY != null) { hg.style.display = "block"; hg.style.top = snY * scale + "px"; }
        else hg.style.display = "none";
      }
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      if (vgRef.current) vgRef.current.style.display = "none";
      if (hgRef.current) hgRef.current.style.display = "none";
      if (dimRef.current) dimRef.current.style.display = "none";
      const cur = draftRef.current;
      const flush = () => {
        const p = pendingRectsRef.current;
        if (p) {
          pendingRectsRef.current = null;
          setRects(p.rects);
          setPromptRect(p.prompt);
        }
      };
      if (!d || !cur) { flush(); return; }
      // 旋转：一次拖转一条历史；转回 0° 就把键清掉，JSON 保持干净
      if (d.mode === "rotate") {
        const w = cur.widgets[d.i];
        if (d.nrot === undefined || !w) { flush(); return; }
        pendingRectsRef.current = null;
        pushHistory();
        if (d.nrot) (w as NodeBase).rotation = d.nrot;
        else delete (w as NodeBase).rotation;
        setDraft({ ...cur });
        onChange();
        return;
      }
      // 多选整体缩放：一次历史，成员几何按比例落位。通栏件（没写 w）就此定死为实宽。
      if (d.mode === "resize" && d.gbox && d.gmembers) {
        if (d.gnw === undefined) { flush(); return; }
        const fx = d.gnw / d.gbox.w, fy = (d.gnh ?? d.gbox.h) / d.gbox.h;
        if (Math.abs(fx - 1) < 0.001 && Math.abs(fy - 1) < 0.001) { pendingRectsRef.current = null; return; }
        pendingRectsRef.current = null;
        pushHistory();
        for (const m of d.gmembers) {
          const w = cur.widgets[m.i] as FreePos & { h?: number; height?: number; size?: number };
          if (!w) continue;
          w.x = Math.round(d.gnx! + (m.x - d.gbox.x) * fx);
          w.y = Math.round(d.gny! + (m.y - d.gbox.y) * fy);
          w.w = Math.max(24, Math.round(m.w * fx));
          const t = cur.widgets[m.i].type;
          if (t === "html" || t === "panel" || t === "spark") {
            if (w.h !== undefined) w.h = Math.max(12, Math.round(w.h * fy));
          } else if (t === "progress") {
            w.height = Math.max(4, Math.round((w.height ?? 10) * fy));
          } else if (t === "gauge") {
            w.size = Math.max(48, Math.round((w.size ?? 120) * ((fx + fy) / 2)));
          }
        }
        setDraft({ ...cur });
        onChange();
        return;
      }
      // 没提交就走：重建不会发生，把拖动期间攒下的补报应用掉
      if (d.nx === undefined || d.ny === undefined || d.nw === undefined || d.nh === undefined) {
        flush();
        return;
      }
      // 提交了就走：重建后必有新鲜补报，攒的旧数据直接作废
      pendingRectsRef.current = null;
      pushHistory();
      // 多选整体提交：一次历史，全组落位（主件用吸附/钳位后的 nx/ny）
      if (d.target === "widget" && d.mode === "move" && d.targets && d.targets.length > 1) {
        for (const j of d.targets) {
          const p = j === d.i ? { x: d.nx, y: d.ny } : (d.npos?.[j] ?? d.origins?.[j]);
          const wj = cur.widgets[j] as FreePos | undefined;
          if (!wj || !p || (cur.widgets[j] as NodeBase)?.locked) continue;
          wj.x = p.x;
          wj.y = p.y;
        }
        setDraft({ ...cur });
        onChange();
        return;
      }
      if (d.target === "prompt") {
        if (cur.prompt) { cur.prompt.x = d.nx; cur.prompt.y = d.ny; }
      } else {
        const w = cur.widgets[d.i] as FreePos | undefined;
        if (!w) return;
        if (d.mode === "move") {
          w.x = d.nx;
          w.y = d.ny;
        } else {
          // 缩放也会动原点（W/N 手柄、Alt 中心、旋转件的锚点折回），x/y 必须一起提交
          w.x = d.nx;
          w.y = d.ny;
          w.w = d.nw;
          const t0 = cur.widgets[d.i].type;
          if (t0 === "html" || t0 === "spark" || t0 === "panel" || t0 === "divider"
            || t0 === "image") (w as HtmlWidget).h = d.nh;
          if (t0 === "progress") {
            // N2/D3-A：竖条长吃几何 h（n/s 改 w.h，w.w 仍是粗）；横条维持旧口径（n/s 改条粗 height 属性）
            if ((cur.widgets[d.i] as ProgressWidget).orientation === "v") w.h = d.nh;
            else (w as ProgressWidget).height = d.nh;
          }
          if (t0 === "gauge") {
            (w as GaugeWidget).size = Math.max(48, Math.round(d.nw));
            w.w = Math.round(d.nw);
          }
        }
      }
      setDraft({ ...cur });
      onChange();
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  const msgColor = msg.kind === "ok" ? "text-primary"
    : msg.kind === "bad" ? "text-danger"
      : msg.kind === "warn" ? "text-warning" : "text-color-desc";

  if (!draft || !metrics) {
    return (
      <main className="fixed inset-y-0 right-0 left-72 z-10 flex items-center justify-center bg-background">
        <span className="text-sm text-default-500">载入中…</span>
      </main>
    );
  }

  const scalePct = Math.round(pvScale * 100);
  const sel = selected != null && draft.widgets[selected] ? draft.widgets[selected] : null;
  const widgetLabel = (t: string) => meta?.widgets[t]?.label ?? FALLBACK_LABEL[t] ?? t;
  const widgetIcon = (t: string): LucideIcon =>
    ICON_MAP[meta?.widgets[t]?.icon ?? ""] ?? fallbackIcon(t);
  // Figma 图层序：顶层在上 —— 数组越靠后（越盖在上面）越先列
  const frontToBack = draft.widgets.map((_, i) => i).reverse();
  // N1 软着陆：成品件（cards/chips）计数 —— 横幅的显示条件，拆完自然归零
  const classicCount = draft.widgets.filter(w => w.type === "cards" || w.type === "chips").length;

  // 图层树（Phase 4）：组按路径聚合成可展开节点。rep = 该组最上层成员的下标，
  // 同级按它排 —— 面板顺序与画布层序一致；子组嵌在父组的 kids 里。
  type LayerNode = { rep: number; i?: number; path?: string; kids?: LayerNode[] };
  const layerTree: LayerNode[] = (() => {
    const items: LayerNode[] = [];
    const groups = new Map<string, LayerNode>();
    for (const i of frontToBack) {
      const tag = draft.widgets[i]?.group;
      if (!tag) { items.push({ rep: i, i }); continue; }
      const segs = tag.split("/");
      let parent: LayerNode | undefined;
      for (let d = 1; d <= segs.length; d++) {
        const p = segs.slice(0, d).join("/");
        let g = groups.get(p);
        if (!g) {
          g = { rep: i, path: p, kids: [] };
          groups.set(p, g);
          if (d === 1) items.push(g);
          else parent?.kids?.push(g);
        }
        parent = g;
      }
      parent?.kids?.push({ rep: i, i });
    }
    return items;
  })();

  const renderLayerNode = (node: LayerNode, depth: number): React.ReactNode => {
    if (node.i !== undefined) {
      const i = node.i;
      const w = draft.widgets[i];
      const Icon = widgetIcon(w.type);
      const on = selected === i;
      return (
        <div key={i}
          className={`group flex h-11 cursor-default items-center gap-3 rounded-xl pr-1.5 text-[15px] transition-colors duration-150 ${
            on ? "bg-[#2a2a2e] text-foreground" : "text-default-500 hover:bg-white/[0.04] hover:text-foreground"}`}
          style={{ paddingLeft: 12 + depth * 16 }}
          onMouseDown={e => {
            if (spaceRef.current) return;
            if (e.shiftKey || e.ctrlKey || e.metaKey) selectWidget(i, true);
            else selectSingle(i);
          }}
          onContextMenu={e => openCtx(e, "widget", i)}>
          <Icon size={17} strokeWidth={1.8} className={`shrink-0 ${w.visible === false ? "opacity-30" : "opacity-70"}`} />
          <span className={`min-w-0 flex-1 truncate ${w.visible === false ? "opacity-40" : ""}`}>{layerName(w, widgetLabel)}</span>
          <span className={`shrink-0 items-center gap-0.5 ${w.visible === false || (w as NodeBase).locked ? "flex" : "hidden group-hover:flex"}`}>
            <button type="button" title={w.visible === false ? "显示" : "隐藏（画布与叠加层都不画）"}
              className={`grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08] ${w.visible === false ? "text-warning" : "text-default-500"}`}
              onMouseDown={e => e.stopPropagation()} onClick={() => toggleVisible(i)}>
              {w.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button type="button" title={(w as NodeBase).locked ? "解锁" : "锁定（画布只读）"}
              className={`grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08] ${(w as NodeBase).locked ? "text-warning" : "text-default-500"}`}
              onMouseDown={e => e.stopPropagation()} onClick={() => toggleLocked(i)}>
              {(w as NodeBase).locked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
            <button type="button" title="上移一层" className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()} onClick={() => moveLayer(i, 1)}><ChevronUp size={13} /></button>
            <button type="button" title="下移一层" className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()} onClick={() => moveLayer(i, -1)}><ChevronDown size={13} /></button>
            <button type="button" title="删除（Delete）" className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-danger/20 hover:text-danger"
              onMouseDown={e => e.stopPropagation()} onClick={() => removeWidget(i)}><Trash2 size={13} /></button>
          </span>
        </div>
      );
    }
    const p = node.path!;
    const open = !closedGrp.has(p);
    const members = subtreeOf(draft.widgets, p);
    const active = members.length > 0 && members.every(j => multi.includes(j));
    const anyVisible = members.some(j => (draft.widgets[j] as NodeBase).visible !== false);
    const allLocked = members.length > 0 && members.every(j => (draft.widgets[j] as NodeBase).locked);
    return (
      <div key={p}>
        <div
          className={`group flex h-11 cursor-default items-center gap-1.5 rounded-xl pr-1.5 text-[15px] transition-colors duration-150 ${
            active ? "bg-[#2a2a2e] text-foreground" : "text-default-500 hover:bg-white/[0.04] hover:text-foreground"}`}
          style={{ paddingLeft: 6 + depth * 16 }}
          title="点击选中整组 · 箭头展开/收起"
          onMouseDown={e => {
            if (spaceRef.current) return;
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
              setMulti(m => m.length > 0 && members.every(j => m.includes(j))
                ? m.filter(j => !members.includes(j))
                : [...new Set([...m, ...members])]);
              return;
            }
            setMulti(members);
            setSelected(members[members.length - 1]);
            setSelPrompt(false);
          }}
          onContextMenu={e => openCtx(e, "widget", members[members.length - 1])}>
          <button type="button" title={open ? "收起" : "展开"}
            className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setClosedGrp(s => {
              const n = new Set(s);
              if (n.has(p)) n.delete(p); else n.add(p);
              return n;
            })}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <GroupIcon size={16} strokeWidth={1.8} className="shrink-0 opacity-70" />
          {renaming?.path === p ? (
            <input autoFocus value={renaming.v}
              onChange={e => setRenaming({ path: p, v: e.target.value })}
              onKeyDown={e => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={commitRename}
              className="min-w-0 flex-1 rounded-md bg-black/30 px-1.5 py-0.5 text-[13px] text-foreground outline-none"
              placeholder="组名字（留空恢复默认）" />
          ) : (
            <span className="min-w-0 flex-1 truncate">
              {draft.groups?.[p] ?? "小组"} · {members.length} 项
            </span>
          )}
          <span className="hidden shrink-0 items-center group-hover:flex">
            <button type="button" title={anyVisible ? "整组隐藏" : "整组显示"}
              className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()} onClick={() => setVisibleOf(members, anyVisible)}>
              {anyVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button type="button" title={allLocked ? "整组解锁" : "整组锁定"}
              className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()} onClick={() => setLockedOf(members, !allLocked)}>
              {allLocked ? <Lock size={13} /> : <LockOpen size={13} />}
            </button>
            <button type="button" title="重命名"
              className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => setRenaming({ path: p, v: draft.groups?.[p] ?? "" })}>
              <Pencil size={13} />
            </button>
            <button type="button" title="解组外层（Ctrl+Shift+G）"
              className="grid size-6 cursor-pointer place-items-center rounded-lg hover:bg-white/[0.08]"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setMulti(members); setSelected(members[members.length - 1]); ungroupSel(); }}>
              <UngroupIcon size={13} />
            </button>
          </span>
        </div>
        {open && node.kids?.map(k => renderLayerNode(k, depth + 1))}
      </div>
    );
  };
  const ADD_TYPES: [string, string][] = meta?.order?.length
    ? meta.order.map(t => [t, widgetLabel(t)])
    : [["stat", "大数字"], ["value", "数值组"], ["progress", "进度条"], ["gauge", "圆环仪表"],
       ["spark", "迷你曲线"], ["html", "自定义 HTML"], ["icon", "图标"], ["image", "图片"],
       ["divider", "分隔线"], ["badge", "徽章"], ["cards", "指标卡片"], ["chips", "小指标行"],
       ["text", "文本"], ["panel", "背景面板"]];
  // N1 菜单分节：节序/节名 = 后端 CATEGORIES（SSOT），归节看各件的 category，
  // 组内序 = meta.order。meta 没拉到（老后端/断网）退化成单节平铺，不丢件。
  const addSections: { id: string; label: string; types: string[] }[] = meta?.categories?.length
    ? meta.categories
        .map(c => ({
          id: c.id,
          label: c.label,
          types: (meta.order ?? []).filter(t => (meta.widgets[t]?.category ?? "advanced") === c.id),
        }))
        .filter(s => s.types.length)
    : [{ id: "all", label: "全部部件", types: ADD_TYPES.map(([t]) => t) }];

  return (
    <main className="fixed inset-y-0 right-0 left-72 z-10 flex flex-col bg-background">
      {/* 顶栏：NP 式 —— 无边框，控件装进暗色药丸分组，靠表面亮度分层 */}
      <header className="flex h-16 shrink-0 items-center gap-3 px-6">
        <h1 className="mr-1 text-lg font-bold text-white">版式编辑</h1>
        <SegGroup>
          <Seg onPress={() => setTplOpen(true)} title="模板库：载入模板，或把当前草稿存为你的模板" wide>模板</Seg>
        </SegGroup>
        <SegGroup>
          <Seg title="缩小" onPress={() => setZoom(Math.max(MIN_ZOOM, zoomStep(pvScale, -1)))}>−</Seg>
          <Seg title="点击恢复自动适应" onPress={() => setZoom(null)} wide>{scalePct}%</Seg>
          <Seg title="放大" onPress={() => setZoom(Math.min(MAX_ZOOM, zoomStep(pvScale, 1)))}>＋</Seg>
          <Seg on={zoom === null} title="整幅画布缩放进视口（Shift+1）；100% 按 Shift+0" onPress={() => setZoom(null)}>适应</Seg>
        </SegGroup>
        <span className="flex-1" />
        <SegGroup>
          <Seg on={snapOn} title="拖近画布边缘或其他部件的边缘/中线时自动对齐（Figma 式智能参考线）"
            onPress={() => setSnapOn(s => !s)}><Magnet size={15} />吸附</Seg>
          <Seg on={gridOn} title={`自适应网格：按画布宽度分档（当前 ${gridStep}px，屏幕约 ${Math.round(gridStep * pvScale)}px），拖动就近对齐到网格线`}
            onPress={() => setGridOn(g => !g)}><Grid3x3 size={15} />网格</Seg>
        </SegGroup>
        <SegGroup>
          <Seg on={layersOpen} title={layersOpen ? "收起图层面板" : "展开图层面板"}
            onPress={() => setLayersOpen(o => { localStorage.setItem("hwobs.editorLayers", o ? "0" : "1"); return !o; })}>
            {layersOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </Seg>
          <Seg on={propsOpen} title={propsOpen ? "收起属性面板" : "展开属性面板"}
            onPress={() => setPropsOpen(o => { localStorage.setItem(PANEL_KEY, o ? "0" : "1"); return !o; })}>
            {propsOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </Seg>
        </SegGroup>
      </header>

      {/* N1 软着陆：版式里还有成品件（cards/chips）时提示一键拆解为原子件；拆完自然消失 */}
      {classicCount > 0 && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-warning/[0.08] px-6 text-sm text-warning">
          <span className="min-w-0 flex-1 truncate">
            检测到 {classicCount} 个经典部件，可一键拆解为原子件
          </span>
          <button type="button" onClick={explodeAllClassic}
            className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-warning/15 px-3 text-sm font-medium text-warning transition-colors hover:bg-warning/25">
            <UngroupIcon size={14} /> 一键拆解
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* 图层面板（Figma 左栏）：顶层在上；悬停出层级/删除按钮；右键有菜单 */}
        {layersOpen && (
        <aside className="flex w-60 shrink-0 flex-col px-3 py-2">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <span className="text-xs font-bold text-primary">图层</span>
            <span className="font-jetbrains text-xs text-default-500">{draft.widgets.length}</span>
          </div>
          {grpEntered && (
            <div className="flex items-center gap-1 px-2 pb-1 text-xs text-warning">
              <span className="min-w-0 flex-1 truncate">
                已进入：{draft.groups?.[grpEntered] ?? `第 ${grpEntered.split("/").length} 层小组`} · 点击选下层
              </span>
              <button type="button" title="退出一层（Esc）"
                className="grid size-5 shrink-0 cursor-pointer place-items-center rounded hover:bg-white/[0.08]"
                onClick={() => {
                  const segs = grpEnteredRef.current.split("/");
                  segs.pop();
                  enterGrp(segs.join("/"));
                }}>
                ×
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {draft.widgets.length === 0 && !draft.prompt && (
              <Hint className="px-2 py-1 text-xs">还没有部件 —— 用下面的「添加部件」。</Hint>
            )}
            {layerTree.map(node => renderLayerNode(node, 0))}
            {draft.prompt && (
              <div
                className={`group flex h-11 cursor-default items-center gap-3 rounded-xl px-3 text-[15px] transition-colors duration-150 ${
                  selPrompt ? "bg-[#2a2a2e] text-foreground" : "text-default-500 hover:bg-white/[0.04] hover:text-foreground"}`}
                onMouseDown={() => { if (!spaceRef.current) { setSelected(null); setSelPrompt(true); } }}
                onContextMenu={e => openCtx(e, "prompt", -1)}>
                <Code size={17} strokeWidth={1.8} className="shrink-0 opacity-70" />
                <span className="min-w-0 flex-1 truncate">命令行装饰 · {draft.prompt.user || "user@host"}</span>
                <button type="button" title="删除（Delete）" className="grid size-7 cursor-pointer place-items-center rounded-lg opacity-0 hover:bg-danger/20 hover:text-danger group-hover:opacity-100"
                  onMouseDown={e => e.stopPropagation()} onClick={removePrompt}><Trash2 size={14} /></button>
              </div>
            )}
          </div>
          {/* 添加部件：NP「更多」式的大药丸，菜单浮在其上方 */}
          <div className="relative p-1">
            {addOpen && (
              <div className="absolute bottom-13 left-0 z-50 max-h-[min(72vh,560px)] w-full overflow-y-auto rounded-2xl bg-[#26262a] p-1.5 shadow-2xl"
                onMouseDown={e => e.stopPropagation()}>
                {addSections.map(sec => {
                  const collapsed = collapsedCats.has(sec.id);
                  return (
                    <div key={sec.id}>
                      <button type="button"
                        className="flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-default-500 transition-colors hover:bg-white/[0.04]"
                        onClick={() => setCollapsedCats(prev => {
                          const next = new Set(prev);
                          if (next.has(sec.id)) next.delete(sec.id); else next.add(sec.id);
                          return next;
                        })}>
                        <ChevronDown size={12} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : ""}`} />
                        {sec.label}
                        <span className="ml-auto font-normal">{sec.types.length}</span>
                      </button>
                      {sec.id === "classic" && !collapsed && (
                        <div className="pb-1 pl-4 text-[11px] font-normal text-warning">建议用原子件拼装</div>
                      )}
                      {!collapsed && sec.types.map(t => {
                        const Icon = widgetIcon(t);
                        return (
                          <button key={t} type="button"
                            className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] text-foreground transition-colors hover:bg-white/[0.08]"
                            onClick={() => { setAddOpen(false); addFree(t); }}>
                            <Icon size={16} strokeWidth={1.8} className="text-default-500" /> {widgetLabel(t)}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
                {components.length > 0 && (
                  <>
                    <div className="mx-2 my-1 border-t border-white/[0.06]" />
                    <div className="px-3 pb-1 text-xs font-bold text-default-500">我的组件</div>
                    {components.map(c => (
                      <div key={c.id}
                        className="group flex h-10 w-full items-center gap-1 rounded-xl px-2 transition-colors hover:bg-white/[0.08]">
                        <button type="button"
                          className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-3 text-left text-[15px] text-foreground"
                          onClick={() => { setAddOpen(false); insertComponent(c); }}>
                          <Package size={15} strokeWidth={1.8} className="shrink-0 text-default-500" />
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                        </button>
                        <button type="button" title="删除这个组件"
                          className="hidden size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-default-500 hover:bg-danger/20 hover:text-danger group-hover:grid"
                          onClick={() => api.removeComponent(c.id).then(rep => {
                            if (rep.removed) setComponents(cs => cs.filter(x => x.id !== c.id));
                          })}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            <button type="button" onClick={() => setAddOpen(o => !o)}
              className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#1a1a1d] text-[15px] font-medium text-foreground transition-colors hover:bg-[#222226]">
              <Plus size={16} /> 添加部件
            </button>
          </div>
        </aside>
        )}

        {/* 画布工作区 */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-[#0e0f12]">
          <div ref={wrapRef}
            className={`absolute inset-0 select-none overflow-auto p-6 ${spaceDown ? "cursor-grab" : ""}`}
            style={{ cursor: spaceDown ? undefined : "default" }}
            onMouseDown={e => {
              if (e.button === 1 || (e.button === 0 && spaceRef.current)) startPan(e);
              else if (e.button === 0) {
                clearSel();
                enterGrp("");   // 点空白：退出组编辑态回到顶层
                bandStartRef.current = { x: e.clientX, y: e.clientY };   // 框选起点（松手判定）
              }
            }}>
            <div className="flex min-h-full min-w-full items-center justify-center">
              <div className="relative" ref={canvasBoxRef}
                style={{ width: Math.ceil(draft.canvas.w * pvScale), height: Math.ceil(draft.canvas.h * pvScale) }}>
                {/* Figma 的 frame 标签：画布名 + 尺寸，永远浮在画布左上角 */}
                <span className="pointer-events-none absolute -top-[22px] left-0 whitespace-nowrap text-xs font-medium text-primary/90">
                  画布 {draft.canvas.w}×{draft.canvas.h}
                </span>
                <iframe
                  key={pvKey}
                  ref={frameRef}
                  title="叠加层画布" scrolling="no"
                  src={`${BACKEND}/?preview=1&t=${pvKey}`}
                  onLoad={pushPreview}
                  className="pointer-events-none absolute left-0 top-0 border-0"
                  style={{
                    width: draft.canvas.w, height: draft.canvas.h,
                    transform: `scale(${pvScale})`, transformOrigin: "0 0",
                  }}
                />
                {/* 网格叠在预览之上、手柄盒之下。z-index 必须显式给：放大后 Chrome 会把
                    缩放过的 iframe 提成独立合成层，z:auto 的兄弟不讲 DOM 绘制顺序，
                    网格会整层掉到 iframe 底下 —— 只在画布透明处"幸存"，看着像消失了一半。 */}
                {gridOn && (
                  <div className="pointer-events-none absolute inset-0 z-[1] opacity-50"
                    style={{
                      backgroundImage:
                        "linear-gradient(#3a3f4a 1px, transparent 1px), linear-gradient(90deg, #3a3f4a 1px, transparent 1px)",
                      backgroundSize: `${gridStep * pvScale}px ${gridStep * pvScale}px`,
                    }} />
                )}
                {/* 对齐参考线：拖动吸附时显示，直改 DOM 不走 React */}
                <div ref={vgRef} className="pointer-events-none absolute inset-y-0 z-40 hidden w-px bg-primary" />
                <div ref={hgRef} className="pointer-events-none absolute inset-x-0 z-40 hidden h-px bg-primary" />
                {/* 拖缩/旋转时的实时数值牌（尺寸或角度）：直改 DOM，不走 React */}
                <div ref={dimRef} className="pointer-events-none absolute z-40 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-medium leading-4 text-white" />
                {/* 框选橡皮筋：client 坐标 fixed 定位，走 DOM 直改 */}
                <div ref={bandRef} className="pointer-events-none fixed z-50 hidden border border-primary bg-primary/10" />
                {draft.widgets.map((w, i) => {
                  const r = rects[i];
                  if (!r) return null;
                  const isSel = multi.includes(i);
                  const stretch = stretchable(w.type) && (w as FreePos).w === undefined;
                  const rot = (w as NodeBase).rotation;
                  return (
                    <div key={i}
                      ref={node => {
                        if (node) boxRefs.current.set(i, node);
                        else boxRefs.current.delete(i);
                      }}
                      className={`absolute border transition-colors ${
                        spaceDown ? "cursor-grab" : "cursor-move"} ${
                        isSel
                          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(56,132,255,0.5)]"
                          : "border-white/25 hover:border-white/60"}`}
                      style={{
                        left: r.x * pvScale, top: r.y * pvScale,
                        width: r.w * pvScale, height: r.h * pvScale,
                        zIndex: isSel ? 30 : i + 1,
                        transform: rot ? `rotate(${rot}deg)` : undefined,
                        transformOrigin: "center",
                      }}
                      onMouseDown={e => onDown(e, i, "move")}
                      onDoubleClick={() => enterGroupAt(i)}
                      onContextMenu={e => openCtx(e, "widget", i)}>
                      {isSel && (
                        <span
                          className="pointer-events-none absolute left-0 top-0 -translate-y-full truncate bg-primary px-1.5 py-0.5 text-[11px] leading-4 text-white"
                          style={rot ? { transform: `translateY(-100%) rotate(${-rot}deg)`, transformOrigin: "0 100%" } : undefined}>
                          {widgetLabel(w.type)}{stretch && " · 通栏"}
                        </span>
                      )}
                      {/* Figma 式八向缩放手柄 + 顶部旋转手柄（只给单选且未锁定；旋转件的手柄随手柄盒一起转） */}
                      {isSel && !spaceDown && multi.length <= 1 && !(w as NodeBase).locked && HANDLES.filter(([h]) => handleOk(w.type, h)).map(([h, csr, pos]) => (
                        <span key={h} title="拖拽调整大小（Shift 等比 · Alt 从中心）"
                          className="absolute z-10 size-2.5 rounded-sm border border-primary bg-white shadow-sm"
                          style={{ ...pos, cursor: csr }}
                          onMouseDown={e => onDown(e, i, "resize", h)} />
                      ))}
                      {isSel && !spaceDown && multi.length <= 1 && !(w as NodeBase).locked && (
                        <span title="拖动旋转（Shift = 15° 一档）"
                          className="absolute z-10 size-3 -translate-x-1/2 rounded-full border border-primary bg-white shadow-sm"
                          style={{ left: "50%", top: -26, cursor: "grab" }}
                          onMouseDown={e => onDown(e, i, "rotate")} />
                      )}
                    </div>
                  );
                })}
                {/* 多选整体包围盒：虚线框 + 手柄，整体缩放并保持成员相对位置。
                    角手柄永远有；上下边手柄只在组里真有高度可变的部件时才有意义。 */}
                {multi.length > 1 && (() => {
                  const rs = multi.map(j => rects[j]).filter(Boolean) as Rect[];
                  if (rs.length < 2) return null;
                  const x1 = Math.min(...rs.map(r => r.x));
                  const y1 = Math.min(...rs.map(r => r.y));
                  const x2 = Math.max(...rs.map(r => r.x + r.w));
                  const y2 = Math.max(...rs.map(r => r.y + r.h));
                  const ns = multi.some(j => {
                    const wt = draft.widgets[j].type;
                    return heightEditable(wt) || wt === "gauge";
                  });
                  return (
                    <div ref={multiBoxRef}
                      className="pointer-events-none absolute border border-dashed border-primary"
                      style={{ left: x1 * pvScale, top: y1 * pvScale, width: (x2 - x1) * pvScale, height: (y2 - y1) * pvScale, zIndex: 29 }}>
                      {HANDLES.filter(([h]) => h.length === 2 || h === "e" || h === "w" || ns).map(([h, csr, pos]) => (
                        <span key={h} title="整体缩放（Shift 等比 · Alt 从中心）"
                          className="pointer-events-auto absolute z-10 size-2.5 rounded-sm border border-primary bg-white shadow-sm"
                          style={{ ...pos, cursor: csr }}
                          onMouseDown={e => onGroupResizeDown(e, h)} />
                      ))}
                    </div>
                  );
                })()}
                {/* 装饰命令行：和部件同款手柄盒，可拖可选中（只有整体挪动，没有改大小） */}
                {draft.prompt && promptRect && (
                  <div ref={promptBoxRef}
                    className={`absolute border transition-colors ${
                      spaceDown ? "cursor-grab" : "cursor-move"} ${
                      selPrompt
                        ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(56,132,255,0.5)]"
                        : "border-white/25 hover:border-white/60"}`}
                    style={{
                      left: promptRect.x * pvScale, top: promptRect.y * pvScale,
                      width: promptRect.w * pvScale, height: promptRect.h * pvScale,
                      zIndex: selPrompt ? 30 : 0,
                    }}
                    onMouseDown={e => onPromptDown(e)}
                    onContextMenu={e => openCtx(e, "prompt", -1)}>
                    {selPrompt && (
                      <span className="pointer-events-none absolute left-0 top-0 -translate-y-full truncate bg-primary px-1.5 py-0.5 text-[11px] leading-4 text-white">
                        命令行装饰
                      </span>
                    )}
                  </div>
                )}
                {draft.widgets.length > 0 && !rects.some(Boolean) && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-sm text-default-500">正在连接画布…</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右键上下文菜单：NP popover 语言 —— 大圆角、无边框、行高 44px */}
          {ctxMenu && (
            <div className="fixed z-[999] w-56 rounded-2xl bg-[#26262a] p-1.5 shadow-2xl"
              style={{ left: Math.min(ctxMenu.x, window.innerWidth - 230), top: Math.min(ctxMenu.y, window.innerHeight - 300) }}
              onMouseDown={e => e.stopPropagation()}>
              {ctxMenu.kind === "widget" ? (
                multi.length > 1 && multi.includes(ctxMenu.i) ? ([
                  ["复制全部", <Copy size={15} />, "Ctrl+D", () => duplicateWidgets(multi)],
                  ["存为组件", <Package size={15} />, "", () => saveSelectionAsComponent()],
                  ["删除全部", <Trash2 size={15} />, "Delete", () => removeWidgets(multi)],
                ] as [string, React.ReactNode, string, () => void][]).map(([label, icon, hint, fn]) => (
                  <button key={label} type="button"
                    className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors hover:bg-white/[0.08] ${
                      label.startsWith("删除") ? "text-danger" : "text-foreground"}`}
                    onClick={() => { setCtxMenu(null); fn(); }}>
                    {icon}<span className="flex-1">{label}</span>
                    {hint && <span className="text-xs text-default-500">{hint}</span>}
                  </button>
                ))
              : ([
                ["复制", <Copy size={15} />, "Ctrl+D", () => duplicateWidget(ctxMenu.i)],
                ...(draft.widgets[ctxMenu.i]?.type === "cards"
                  ? [["拆成原子件", <UngroupIcon size={15} />, "", () => explodeCards(ctxMenu.i)] as [string, React.ReactNode, string, () => void]]
                  : []),
                ["上移一层", <ChevronUp size={15} />, "", () => moveLayer(ctxMenu.i, 1)],
                ["下移一层", <ChevronDown size={15} />, "", () => moveLayer(ctxMenu.i, -1)],
                ["置于顶层", <ArrowUpToLine size={15} />, "", () => toFront(ctxMenu.i)],
                ["置于底层", <ArrowDownToLine size={15} />, "", () => toBack(ctxMenu.i)],
                ["删除", <Trash2 size={15} />, "Delete", () => removeWidget(ctxMenu.i)],
              ] as [string, React.ReactNode, string, () => void][]).map(([label, icon, hint, fn]) => (
                <button key={label} type="button"
                  className={`flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] transition-colors hover:bg-white/[0.08] ${
                    label === "删除" ? "text-danger" : "text-foreground"}`}
                  onClick={() => { setCtxMenu(null); fn(); }}>
                  {icon}<span className="flex-1">{label}</span>
                  {hint && <span className="text-xs text-default-500">{hint}</span>}
                </button>
              ))) : ([
                ["回到默认位置", <ArrowUpToLine size={15} />, "", () => {
                  const d = draftRef.current;
                  if (!d?.prompt) return;
                  pushHistory();
                  const pad = d.canvas.padding || [12, 24];
                  d.prompt.x = pad[1]; d.prompt.y = pad[0];
                  setDraft({ ...d }); onChange();
                }],
                ["删除命令行装饰", <Trash2 size={15} />, "Delete", removePrompt],
              ] as [string, React.ReactNode, string, () => void][]).map(([label, icon, hint, fn]) => (
                <button key={label} type="button"
                  className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] text-foreground transition-colors hover:bg-white/[0.08]"
                  onClick={() => { setCtxMenu(null); fn(); }}>
                  {icon}<span className="flex-1">{label}</span>
                  {hint && <span className="text-xs text-default-500">{hint}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 属性面板（右栏）：选中部件 → 参数；没选中 → 画布设置。NP 语言：无边框无底色，
            小节靠间距与极淡分隔线分层，输入框吃满列宽 */}
        {/* 属性面板左缘：拖这条把手调宽（悬停亮蓝提示可拖） */}
        {propsOpen && (
          <div
            className="w-1.5 shrink-0 cursor-col-resize select-none transition-colors hover:bg-primary/50"
            title="按住拖动调整面板宽度"
            onMouseDown={e => {
              e.preventDefault();
              e.stopPropagation();
              propsDragRef.current = { x: e.clientX, w: propsW };
              document.body.style.cursor = "col-resize";
            }}
          />
        )}
        {propsOpen && (
        <aside className="shrink-0 overflow-y-auto px-5 py-4" style={{ width: propsW }}>
          {!metrics.length && (
            <div className="mb-3 rounded-xl bg-warning/10 px-3 py-2 text-sm text-warning">
              还没有注册任何指标 —— 去「自定义指标」注册。
            </div>
          )}
          {multi.length > 1 ? (() => {
            const hasGroup = multi.some(i => draft.widgets[i]?.group);
            return (
              <div className="flex flex-col gap-4">
                <SubTitle>已选 {multi.length} 个组件</SubTitle>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="合成一组：之后点任何一个都会整组选中、整组拖动（Ctrl+G）"
                    onPress={groupSel}><GroupIcon size={14} />成组</Btn>
                  {hasGroup && (
                    <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                      title="解除分组，各自独立（Ctrl+Shift+G）"
                      onPress={ungroupSel}><UngroupIcon size={14} />解组</Btn>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>对齐</FieldLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {([["left", AlignLeft, "左对齐"], ["cx", AlignCenterHorizontal, "水平居中"],
                       ["right", AlignRight, "右对齐"], ["top", AlignStartVertical, "顶对齐"],
                       ["cy", AlignCenterVertical, "垂直居中"], ["bottom", AlignEndVertical, "底对齐"]
                    ] as [string, LucideIcon, string][]).map(([mode, Icon, label]) => (
                      <Btn key={mode} isIconOnly size="sm" variant="secondary"
                        className="h-8 min-w-0 rounded-lg bg-[#1a1a1d] hover:bg-[#222226]"
                        title={label} onPress={() => alignSel(mode as "left")}>
                        <Icon size={14} />
                      </Btn>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="Ctrl+D：整组复制并错位落下" onPress={() => duplicateWidgets(multi)}>复制</Btn>
                  <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="把选中集存成自定义组件（「添加部件」菜单随时取用）"
                    onPress={saveSelectionAsComponent}>存为组件</Btn>
                  <Btn size="sm" variant="danger"
                    className="h-8 rounded-lg bg-danger/15 px-3 text-sm text-danger hover:bg-danger/25"
                    title="Delete" onPress={() => removeWidgets(multi)}>删除</Btn>
                </div>
                <Hint className="text-sm">
                  拖动任意选中件整组平移；Shift+点击加减选；空白处拖出框选；方向键整组微调。
                </Hint>
              </div>
            );
          })() : sel && selected != null ? (() => {
            const w = draft.widgets[selected]!;
            const pos = w as FreePos;
            const numInput = (label: string, key: string, val?: number, norm?: (v: number) => number) => (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>{label}</FieldLabel>
                <TF type="number" className="w-full tabular-nums"
                  value={String(val ?? 0)}
                  onChange={v => {
                    (pos as unknown as Record<string, number>)[key] = norm ? norm(+v || 0) : (+v || 0);
                    setDraft({ ...draft });
                    onChange();
                  }} />
              </div>
            );
            const showW = pos.w !== undefined
              || ["html", "progress", "stat", "spark", "panel", "image", "divider"].includes(w.type);
            return (
              <div className="flex flex-col gap-4">
                <SubTitle>{widgetLabel(w.type)}</SubTitle>
                <div className={`grid gap-3 ${showW ? (w.type === "html" ? "grid-cols-2" : "grid-cols-3") : "grid-cols-2"}`}>
                  {numInput("X", "x", pos.x)}
                  {numInput("Y", "y", pos.y)}
                  {showW && numInput("宽", "w", pos.w)}
                  {["html", "spark", "panel", "image", "divider"].includes(w.type)
                    || (w.type === "progress" && (w as ProgressWidget).orientation === "v")
                    ? numInput("高", "h", pos.h) : null}
                  {/* 横向 progress 的「高」= 条粗（height 属性）；竖条长走上面几何 高、粗走几何 宽 */}
                  {w.type === "progress" && (w as ProgressWidget).orientation !== "v"
                    && numInput("高", "height", (w as ProgressWidget).height)}
                  {numInput("旋转 °", "rotation", (w as NodeBase).rotation ?? 0,
                    v => ((Math.round(v) % 360) + 360) % 360)}
                </div>
                {promptRect && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-default-500">对齐命令行：</span>
                    <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                      title="把这个部件的左缘贴到命令行第一个字符的位置"
                      onPress={() => {
                        pushHistory();
                        pos.x = promptRect.x;
                        setDraft({ ...draft });
                        onChange();
                      }}>左缘</Btn>
                    <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                      title="把这个部件的顶边贴到命令行的顶边"
                      onPress={() => {
                        pushHistory();
                        pos.y = promptRect.y;
                        setDraft({ ...draft });
                        onChange();
                      }}>顶边</Btn>
                    <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                      title="把部件底部挪到命令行下方一点，从顶部开始排"
                      onPress={() => {
                        pushHistory();
                        pos.y = promptRect.y + promptRect.h + 8;
                        setDraft({ ...draft });
                        onChange();
                      }}>移到下方</Btn>
                  </div>
                )}
                {stretchable(w.type) && pos.w !== undefined && (
                  <Btn size="sm" className="w-fit rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="清掉固定宽度，从 X 拉到画布右缘"
                    onPress={() => {
                      delete pos.w;
                      setDraft({ ...draft });
                      onChange();
                    }}>拉通到右缘</Btn>
                )}
                {/* 操作行：复制/删除在左，层级四枚图标按钮收在右（不再六个药丸换行乱飘） */}
                <div className="flex items-center gap-2">
                  <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="Ctrl+D：复制这个部件并错位落下"
                    onPress={() => duplicateWidget(selected)}>复制</Btn>
                  <Btn size="sm" className="h-8 rounded-lg bg-danger/15 px-3 text-sm text-danger hover:bg-danger/25"
                    title="Delete" onPress={() => removeWidget(selected)}>删除</Btn>
                  <span className="flex-1" />
                  <Btn isIconOnly size="sm" className="size-8 rounded-lg bg-[#1a1a1d] text-default-500 hover:bg-[#222226] hover:text-foreground"
                    title="与上一个部件交换层级" onPress={() => moveLayer(selected, 1)}><ChevronUp size={14} /></Btn>
                  <Btn isIconOnly size="sm" className="size-8 rounded-lg bg-[#1a1a1d] text-default-500 hover:bg-[#222226] hover:text-foreground"
                    title="与下一个部件交换层级" onPress={() => moveLayer(selected, -1)}><ChevronDown size={14} /></Btn>
                  <Btn isIconOnly size="sm" className="size-8 rounded-lg bg-[#1a1a1d] text-default-500 hover:bg-[#222226] hover:text-foreground"
                    title="盖到所有部件最上面" onPress={() => toFront(selected)}><ArrowUpToLine size={14} /></Btn>
                  <Btn isIconOnly size="sm" className="size-8 rounded-lg bg-[#1a1a1d] text-default-500 hover:bg-[#222226] hover:text-foreground"
                    title="压到所有部件最底下" onPress={() => toBack(selected)}><ArrowDownToLine size={14} /></Btn>
                </div>
                {/* 通用属性：可见 / 锁定（与图层面板开关同一份数据，双向同步） */}
                <div className="flex items-center gap-8 border-t border-white/[0.04] pt-4">
                  <span className="flex items-center gap-2 text-xs text-color-desc">可见
                    <TSwitch size="sm" aria-label="可见" isSelected={(w as NodeBase).visible !== false}
                      onChange={b => {
                        if (b) delete (w as NodeBase).visible;
                        else (w as NodeBase).visible = false;
                        setDraft({ ...draft });
                        onChange();
                      }} />
                  </span>
                  <span className="flex items-center gap-2 text-xs text-color-desc">锁定
                    <TSwitch size="sm" aria-label="锁定" isSelected={!!(w as NodeBase).locked}
                      onChange={b => {
                        if (b) (w as NodeBase).locked = true;
                        else delete (w as NodeBase).locked;
                        setDraft({ ...draft });
                        onChange();
                      }} />
                  </span>
                </div>
                <div className="border-t border-white/[0.04] pt-4">
                  {w.type === "stat" && <StatEditor w={w as StatWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "progress" && <ProgressEditor w={w as ProgressWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "gauge" && <GaugeEditor w={w as GaugeWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "spark" && <SparkEditor w={w as SparkWidget} metrics={metrics} onChange={onChange} />}
                  {w.type === "bars" && <SparkEditor w={w as unknown as SparkWidget} metrics={metrics} onChange={onChange} />}
                  {w.type === "html" && <HtmlEditor w={w as HtmlWidget} onChange={onChange} />}
                  {w.type === "cards" && <CardsEditor w={w as CardsWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "chips" && <ChipsEditor w={w as ChipsWidget} metrics={metrics} onChange={onChange} />}
                  {w.type === "text" && <TextEditor w={w as TextWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "value" && <ValueEditor w={w as ValueWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "light" && <LightEditor w={w as LightWidget} metrics={metrics} onChange={onChange} compact />}
                  {w.type === "stackbar" && <StackbarEditor w={w as StackbarWidget} metrics={metrics} onChange={onChange} />}
                </div>
                {/* 属性：按后端 props_schema 自动生成（icon/image/divider/badge 这类
                    简单件的内容字段）；复杂件继续走上面的手写编辑器 */}
                {(() => {
                  const ps = meta?.widgets[w.type]?.props_schema;
                  return ps && ps.length ? (
                    <div className="border-t border-white/[0.04] pt-4">
                      <PropsEditor w={w} schema={ps} onChange={onChange} />
                    </div>
                  ) : null;
                })()}
                {/* 外观：按后端 style_schema 自动生成的通用控件，所有组件都有 */}
                {(() => {
                  const schema = meta?.widgets[w.type]?.style_schema;
                  return schema && schema.length ? (
                    <div className="border-t border-white/[0.04] pt-4">
                      <StyleEditor w={w} schema={schema} onChange={onChange} />
                    </div>
                  ) : null;
                })()}
              </div>
            );
          })() : selPrompt && draft.prompt ? (() => {
            const p = draft.prompt;
            const pad = draft.canvas.padding || [12, 24];
            const pnum = (label: string, key: "x" | "y", val: number) => (
              <div className="flex flex-col gap-1.5">
                <FieldLabel>{label}</FieldLabel>
                <TF type="number" className="w-full tabular-nums"
                  value={String(val)}
                  onChange={v => {
                    p[key] = Math.max(0, +v || 0);
                    setDraft({ ...draft });
                    onChange();
                  }} />
              </div>
            );
            return (
              <div className="flex flex-col gap-4">
                <SubTitle>命令行装饰</SubTitle>
                <div className="grid grid-cols-2 gap-3">
                  {pnum("X", "x", p.x ?? pad[1])}
                  {pnum("Y", "y", p.y ?? pad[0])}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" className="h-8 rounded-lg bg-[#1a1a1d] px-3 text-sm hover:bg-[#222226]"
                    title="回到画布内边距处"
                    onPress={() => {
                      pushHistory();
                      p.x = pad[1]; p.y = pad[0];
                      setDraft({ ...draft });
                      onChange();
                    }}>回到默认位置</Btn>
                  <Btn size="sm" className="h-8 rounded-lg bg-danger/15 px-3 text-sm text-danger hover:bg-danger/25"
                    title="Delete" onPress={removePrompt}>删除</Btn>
                </div>
                <div className="border-t border-white/[0.04] pt-4">
                  <PromptBar draft={draft} onChange={onChange} compact />
                </div>
              </div>
            );
          })() : (
            <div className="flex flex-col gap-4">
              <SubTitle>画布设置</SubTitle>
              <CanvasFields draft={draft} onChange={onChange} meta={meta} />
              <div className="border-t border-white/[0.04] pt-4">
                <PromptBar draft={draft} onChange={onChange} compact />
              </div>
              <div className="border-t border-white/[0.04] pt-4">
                <SubTitle>校验</SubTitle>
                <div className="pt-1.5">
                  {check && !check.errors.length && !check.warnings.length && (
                    <Hint className="text-sm"><span className="text-success">✓ 版式无错误、无提醒</span></Hint>
                  )}
                  {check?.errors.map((e, i) => (
                    <div key={i} className="text-sm leading-6 text-danger">✗ {e}</div>
                  ))}
                  {check?.warnings.map((w, i) => (
                    <div key={i} className="text-sm leading-6 text-warning">▲ {w}</div>
                  ))}
                </div>
              </div>
              <div className="border-t border-white/[0.04] pt-4">
                <SubTitle>快捷键</SubTitle>
                <Hint className="text-sm">
                  Ctrl/⌘+滚轮 指针处缩放 · 空格或中键拖动画布<br />
                  Shift+1 适应 · Shift+0 100%<br />
                  拖动自动吸附对齐 · 网格自适应分档<br />
                  八向手柄缩放（Shift 等比 / Alt 从中心）· 顶部圆点旋转（Shift 15°）<br />
                  右键部件有菜单 · 方向键微调（Shift = 10px）<br />
                  Ctrl+Z 撤销 · Ctrl+Shift+Z 重做 · Ctrl+D 复制 · Ctrl+G 成组（Shift=解组）<br />
                  Delete 删除 · Esc 取消选中 · Ctrl+S 保存
                </Hint>
              </div>
            </div>
          )}
        </aside>
        )}
      </div>

      {/* 吸底保存条：NP 式大药丸按钮 */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-4 pt-2">
        <Btn size="lg" className="rounded-xl px-8" isDisabled={!dirty} onPress={save}>保存</Btn>
        <Btn size="lg" variant="secondary" className="rounded-xl bg-[#1a1a1d] hover:bg-[#222226]" onPress={undoEdit}
          title="Ctrl+Z：回退上一步拖动/增删">撤销</Btn>
        <Btn size="lg" variant="secondary" className="rounded-xl bg-[#1a1a1d] hover:bg-[#222226]" onPress={redoEdit}
          title="Ctrl+Shift+Z / Ctrl+Y：重做被撤销的一步">重做</Btn>
        <Btn size="lg" variant="secondary" className="rounded-xl bg-[#1a1a1d] hover:bg-[#222226]" onPress={undoSaved}>还原上一版</Btn>
        <Btn size="lg" variant="secondary" className="rounded-xl bg-[#1a1a1d] hover:bg-[#222226]" isDisabled={!dirty} onPress={discardDraft}
          title="丢掉没保存的改动，回到已保存的版式">放弃改动</Btn>
        {dirty && <span className="whitespace-nowrap text-sm text-warning">● 有未保存的改动</span>}
        <span className={`ml-auto whitespace-nowrap text-sm ${msgColor}`}>{msg.text}</span>
      </div>

      <TemplatePicker isOpen={tplOpen} onOpenChange={setTplOpen} onPick={applyPreset} current={draft} />

      {/* 存为自定义组件：命名弹层 */}
      {saveComp && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60"
          onMouseDown={() => setSaveComp(null)}>
          <div className="w-96 rounded-2xl bg-[#26262a] p-5 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
            <SubTitle>存为自定义组件</SubTitle>
            <Hint className="mb-3 mt-1 text-sm">
              保存选中的 {saveComp.widgets.length} 个部件（相对位置与分组原样保留），
              之后在「添加部件 → 我的组件」一键取用。
            </Hint>
            <TF value={saveComp.name} placeholder="组件名字（必填）"
              onChange={v => setSaveComp({ ...saveComp, name: v })} />
            <div className="mt-4 flex justify-end gap-2">
              <Btn size="sm" variant="secondary" className="rounded-lg bg-[#1a1a1d] px-4 hover:bg-[#222226]"
                onPress={() => setSaveComp(null)}>取消</Btn>
              <Btn size="sm" className="rounded-lg px-4" isDisabled={!saveComp.name.trim()}
                onPress={commitSaveComponent}>保存</Btn>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
