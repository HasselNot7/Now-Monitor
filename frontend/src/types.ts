/** 与 FastAPI 端点一一对应的类型定义。字段以 hwobs 各模块的返回为准。 */

export type Widget = (CardsWidget | ChipsWidget | TextWidget | StatWidget | ProgressWidget | HtmlWidget | GaugeWidget | SparkWidget | PanelWidget | ValueWidget | IconWidget | ImageWidget | DividerWidget | BadgeWidget | BarsWidget | LightWidget | StackbarWidget) & StyledWidget & GroupedWidget & NodeBase;

/** 统一 Node 模型的公共字段：画布上每个部件都有的变换与状态。
 * 全部可选 —— 旧版式没有这些字段，零迁移。渲染器消费 rotation/visible；
 * locked 纯编辑器语义（不可拖/不可删），渲染器不读。 */
export interface NodeBase {
  /** 旋转（度，顺时针，绕部件中心） */
  rotation?: number;
  /** false = 隐藏：渲染器不画、编辑器不回报几何（图层面板仍列出） */
  visible?: boolean;
  /** true = 锁定：编辑器里不可拖动/删除 */
  locked?: boolean;
}

/** 编辑器成组标签：同 group 的组件在编辑器里作为整体选中/拖动/复制/删除。
 * 标签是路径 —— "g1" 是一层组，"g1/g2" 是 g1 里的子组 g2（支持任意嵌套）；
 * 老的单段标签天然合法，零迁移。渲染器不读它（扁平结构，位置仍是各自的 x/y），
 * 纯属编辑器层的组织手段。 */
export interface GroupedWidget {
  group?: string;
}

/** 原子件：一组数值（可带名字、分隔符）—— 卡片大数字/小字行与 chips 的原子形态。 */
export interface ValueWidget extends FreePos {
  type: "value";
  metrics: GroupDef;
  /** 字号 px */
  size?: number;
  /** 每项前面显示注册表名字（chips 的观感） */
  show_name?: boolean;
}

/** 内置线性图标（名字集在 hwobs/widgets.py 的 ICON_NAMES，渲染端在 monitor.html） */
export interface IconWidget extends FreePos {
  type: "icon";
  name?: string;
  /** 大小 px */
  size?: number;
}

/** URL 图片；几何 w/h 即显示尺寸，fit 管裁切方式 */
export interface ImageWidget extends FreePos {
  type: "image";
  url?: string;
  fit?: "cover" | "contain" | "fill";
}

/** 分隔线：横线长度=几何 w、粗细=thickness；竖线长度=几何 h、粗细（宽）=thickness */
export interface DividerWidget extends FreePos {
  type: "divider";
  thickness?: number;
  vertical?: boolean;
}

/** 药丸徽章：正文 {路径} 插值同 text，底色/描边走 style.bg */
export interface BadgeWidget extends FreePos {
  type: "badge";
  text: string;
  size?: number;
}

/** 状态灯（N3/D4-A）：单指标三态圆点，颜色全走主题变量（fill/high/tmiss 灰） */
export interface LightWidget extends FreePos {
  type: "light";
  metric: string;
  label?: string;
  size?: number;
}

/** 堆叠条（N3/D1-A）：metrics 组按值占比横排分段；长吃几何 w、粗吃 height 属性（同 progress 横条） */
export interface StackbarWidget extends FreePos {
  type: "stackbar";
  metrics: GroupDef;
  height?: number;
}

/** 所有组件都能带的外观覆盖（hwobs/widgets.py 的 style_schema 是它的契约），
 * 渲染器按 CSS 变量级联应用：颜色/不透明度/卡片化背景。 */
export interface StyledWidget {
  style?: {
    color?: string;
    label?: string;
    accent?: string;
    high?: string;
    track?: string;
    dim?: string;
    opacity?: number;
    bg?: {
      color?: string;
      alpha?: number;
      radius?: number;
      padding?: number;
      border?: number;
      border_color?: string;
    };
    /** 组件特有键见各类型 style_schema（cards.brackets、gauge.show_value、spark.fill 等） */
    [key: string]: unknown;
  };
}

export interface SparkWidget extends FreePos {
  type: "spark";
  metric: string;
  w?: number;
  h?: number;
  /** 采样秒数（10~300） */
  samples?: number;
}

/** 柱状条：卡片内嵌迷你曲线的独立形态（canvas 直方图，字段与 spark 同构） */
export interface BarsWidget extends FreePos {
  type: "bars";
  metric: string;
  w?: number;
  h?: number;
  samples?: number;
}

export interface PanelWidget extends FreePos {
  type: "panel";
  w?: number;
  h?: number;
}

export interface MetricRef {
  metric: string;
  label?: string;
  /** F3：数值后面的自定义文本（渲染器原样拼接、不自动补空格）；可含真换行符 */
  suffix?: string;
  unit?: string;
  /** 大数字槽位专用：这个值带不带单位（不写则沿用组级 unit_policy） */
  unit_on?: boolean;
  digits?: number;
  divide?: number;
  digits2?: number;
  pair?: string[];
  diff?: string[];
}

export interface GroupDef {
  metrics: (string | MetricRef)[];
  sep?: string;
  unit_policy?: "last" | "all";
  unit?: string;
  digits?: number;
  divide?: number;
}

export interface CardItem {
  key: string;
  label: string;
  bar?: string;
  bar_full?: number;
  value?: GroupDef;
  sub?: GroupDef;
  spark?: string;
}

export interface CardsWidget {
  type: "cards";
  cols?: number;
  gap?: number;
  item_height?: number;
  items: CardItem[];
}

export interface ChipsWidget {
  type: "chips";
  font?: number;
  margin_top?: number;
  fit?: "none" | "shrink";
  items: string[];
}

export interface TextWidget {
  type: "text";
  text: string;
  size?: number;
  margin_top?: number;
}

/** 自由画布部件的定位字段：mode=free 时生效 */
export interface FreePos {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export interface StatWidget extends FreePos {
  type: "stat";
  metric: string;
  label?: string;
  size?: number;
}

export interface ProgressWidget extends FreePos {
  type: "progress";
  metric: string;
  w?: number;
  height?: number;
  /** N2（D3-A）：竖向进度条 —— 长吃几何 h、粗吃几何 w */
  orientation?: "h" | "v";
}

export interface HtmlWidget extends FreePos {
  type: "html";
  html: string;
}

export interface GaugeWidget extends FreePos {
  type: "gauge";
  metric: string;
  label?: string | true;
  size?: number;
  ring?: number;
  /** N2（D6）：half = 上半环 180°，指针惯例朝上 */
  arc?: "full" | "half";
}


export interface Canvas {
  w: number;
  h: number;
  /** 内置主题名（hwobs/themes.py）或自定义色板对象（键名同主题 vars） */
  theme?: string | Record<string, string>;
  padding?: [number, number];
  /** flow=自上而下堆叠（默认）；free=部件按 x/y 绝对定位 */
  mode?: "flow" | "free";
  /** true=叠加层背景透明，OBS 里直接叠在画面上 */
  transparent?: boolean;
}

export interface OverlayConfig {
  version: number;
  name?: string;
  canvas: Canvas;
  /** 组显示名（路径 → 名字）：纯编辑器层组织信息，渲染器不读 */
  groups?: Record<string, string>;
  prompt?: {
    user?: string; cmd?: string; cursor?: boolean; size?: number;
    /** 自由画布专用：可拖到任意位置，不写回退画布内边距 */
    x?: number;
    y?: number;
  };
  widgets: Widget[];
}

/** 模板库里的一条：一个不同尺寸的常用版式。 */
export interface LayoutPreset {
  id: string;
  name: string;
  desc: string;
  config: OverlayConfig;
  /** builtin=随包内置（不可删）；user=自己存的，写在使用者机器上 */
  source?: "builtin" | "user";
}

/** 自定义组件：选中集存成的积木。widgets 为相对坐标（包围盒左上角=0,0），
 * 自带组嵌套标签；插入时原样复制（无 Instance/Variant）。 */
export interface CustomComponent {
  id: string;
  name: string;
  widgets: Widget[];
}

/** 多版式档位的一条：一个已发布版式的命名快照。active=当前生效；modified=生效档已被后续保存改动。 */
export interface Profile {
  name: string;
  active: boolean;
  modified: boolean;
}

export interface Metric {
  id: string;
  out: string | null;
  name: string;
  kind?: string;
  unit?: string | null;
  digits?: number;
  divide?: number;
  custom?: boolean;
  /** 从内置指标集（metrics.json）一键注册进来的 */
  preset?: boolean;
  rate_untrusted?: boolean;
  na_zero?: boolean;
  sources?: { aida64?: string[]; winapi?: string };
  agg?: string;
  regex?: string;
}

export interface LayoutCheck {
  ok: boolean;
  errors: string[];
  warnings: string[];
  est_height: number;
  canvas_w: number | null;
  canvas_h: number | null;
  widgets: number;
  referenced: string[];
  needed_ids: string[];
  budget?: {
    count: number;
    usable: number;
    worst_bytes: number;
    typical_bytes: number;
    fits: boolean;
    truncated_at: number | null;
  };
}

export interface AidaStatus {
  running: boolean;
  install: string | null;
  ini: string | null;
  exported_ids: string[];
  shm_bytes: number;
  shm_limit: number;
  shm_pct: number;
  shm_readable: boolean;
  usable_bytes: number;
  /** 读取过程出错时的原因（接口永远 200，错误写在这里） */
  error?: string | null;
  windows_net_sampler?: {
    sampling: boolean;
    error: string | null;
    up_mbps: number | null;
    down_mbps: number | null;
  };
}

export interface BudgetBrief {
  count: number;
  usable: number;
  worst_bytes: number;
  typical_bytes: number;
  fits: boolean;
  truncated_at?: number | null;
}

export interface AidaPlan {
  current_count: number;
  needed_count: number;
  /** 版式需要、但 AIDA64 还没导出的传感器（用户自己去补，本软件不写 ini） */
  missing: string[];
  missing_reasons: Record<string, string[]>;
  /** 清单里本软件用不到的传感器——仅列出告知，绝不动它们 */
  unused: string[];
  /** 补全清单：现有 ∪ 缺口，供用户复制粘贴进 ini 的整行值 */
  merged_key: string;
  merged_items: string;
  budget_now: BudgetBrief;
  budget_merged: BudgetBrief;
  fits: boolean;
  unchanged: boolean;
}

export interface UnknownSensor {
  id: string;
  label: string;
  value: string;
}

export interface HW {
  ok: boolean;
  degraded?: string | null;
  exported: number;
  missing: string[];
  sources: Record<string, string | null>;
  [key: string]: unknown;
}

/** 部件注册表元数据（/api/widgets/meta）：编辑器的组件菜单、默认值和
 * 「外观」控件全部由此驱动，不再各抄一份。style_schema 同时是后端校验器
 * 的数据源 —— 加一个样式键只改后端一处。 */
export interface StyleField {
  key: string;
  label: string;
  type: "color" | "range" | "int" | "bool";
  min?: number;
  max?: number;
  step?: number;
  default?: number | boolean;
}

/** 数据/内容属性字段（props_schema）：与 StyleField 对偶 —— StyleField 管外观，
 * PropField 管内容与行为（icon 选哪个图、image 的 URL…）。编辑器的属性面板按它
 * 自动生成控件（editors.tsx 的 PropsEditor），加简单部件不再手写 Inspector。 */
export interface PropField {
  key: string;
  label: string;
  type: "text" | "int" | "bool" | "select";
  min?: number;
  max?: number;
  options?: string[];
  default?: string | number | boolean;
}

export interface WidgetMeta {
  label: string;
  icon: string;
  summary: string;
  defaults: Record<string, unknown>;
  style_schema: StyleField[];
  props_schema?: PropField[];
  /** 「添加部件」菜单分节归属（N1）：SSOT 在 widgets.py 的 category */
  category: string;
}

/** 菜单小节（N1）：顺序与节名 = 后端 CATEGORIES 的 SSOT */
export interface MetaCategory {
  id: string;
  label: string;
}

export interface WidgetsMeta {
  order: string[];
  categories?: MetaCategory[];
  widgets: Record<string, WidgetMeta>;
  themes: Record<string, { label: string; vars: Record<string, string> }>;
}
