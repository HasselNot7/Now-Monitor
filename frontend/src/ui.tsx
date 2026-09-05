import { Button, Separator, Switch } from "@heroui/react";
import { Info } from "lucide-react";

/** v3 的 Button 不再转发原生 title（RAC filterDOMProps 白名单没有它）——编辑器里
 * 那三十来处中文悬停提示全靠它。包一层：有 title 就套个 inline-flex 的 span 承接，
 * 没有就原样透出，调用点无感。 */
export function Btn({ title, ...props }: React.ComponentProps<typeof Button> & { title?: string }) {
  const btn = <Button {...props} />;
  return title
    ? <span title={title} className="inline-flex">{btn}</span>
    : btn;
}

/** v3 Switch 的根只是 SwitchField（状态容器），隐藏 input 由 Switch.Content 渲染 ——
 * 裸 Control/Thumb 组合不可交互。无可见标签的开关统一走这个封装。
 * 默认 lg 档 + index.css 里的几何覆盖 = Now Playing（HeroUI v2 默认档）的观感：
 * 56×28 轨道、正圆 thumb。 */
export function TSwitch({ size = "lg", title, ...props }:
  React.ComponentProps<typeof Switch> & { title?: string }) {
  const sw = (
    <Switch {...props}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
  return title ? <span title={title} className="inline-flex">{sw}</span> : sw;
}

/** Now Playing 版式的公共零件：页面标题、分区标题、字段小标签、灰色说明。
 * 尺寸照抄它的设置页：页题 30px 粗白、区题 20px、小节题 16px、字段标签 12px 淡蓝加粗。
 * v3 删掉了 default-500/800 数字色阶：前景用 text-foreground、弱化说明用 text-muted。 */

export const Page = ({ title, children }: {
  title: string;
  children: React.ReactNode;
}) => (
  <>
    <h1 className="text-3xl font-bold leading-9 text-white">{title}</h1>
    {children}
  </>
);

/** 区块标题（音乐服务 / 系统设置 那一级），right 放在标题行末尾（如状态 Chip）。
 * 结构照抄 NP 设置页：<flex flex-col gap-4> 区题 + 内容 </> + Divider —— 区题与
 * 内容之间恒定 16px，调用方不要再自己塞 mt。 */
export const Section = ({ title, right, children, divider = true }: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  divider?: boolean;
}) => (
  <>
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-end justify-between gap-2">
        <h2 className="text-xl font-bold leading-9 text-foreground">{title}</h2>
        {right}
      </div>
      {children}
    </div>
    {divider && <Separator />}
  </>
);

/** 小节标题（音频设备 / 启动选项 那一级）。 */
export const SubTitle = ({ children, right }: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className="flex items-center gap-1.5">
    <h3 className="flex items-center gap-1.5 text-base font-bold leading-6 text-foreground">{children}</h3>
    {right}
  </div>
);

/** 字段小标签：NP 源码是 text-primary-900 text-xs font-bold —— dark 主题下 900 号
 * 是最浅一档（近白带一丝蓝），不是实蓝。这里用 foreground 对齐。 */
export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="cursor-default text-xs font-bold text-foreground">{children}</span>
);

/** 灰色说明文字。 */
export const Hint = ({ children, className = "" }: {
  children: React.ReactNode;
  className?: string;
}) => <p className={`text-sm leading-6 text-color-desc ${className}`}>{children}</p>;

/** 设置行：Now Playing 全站通用的高 64px 行 —— 左边标题 + 灰描述，右边控件。
 * NP 把这套 class 配方复制了 40+ 次没抽组件，我们抽出来。divider 控制行底分隔线。 */
export const SettingsRow = ({ title, desc, right, divider = true }: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  right: React.ReactNode;
  divider?: boolean;
}) => (
  <div className={`flex min-h-16 items-center justify-between gap-6 ${
    divider ? "border-b border-white/[0.04]" : ""}`}>
    <div className="flex min-w-0 flex-col gap-[2px]">
      <span className="text-sm font-medium text-foreground">{title}</span>
      {desc && <span className="text-xs text-color-desc">{desc}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{right}</div>
  </div>
);

/** NP 卡片底：HeroUI dark 的 content1（#18181b）—— 比背景亮一档、无描边、大圆角，
 * 与 NP 组件集成卡 / 使用帮助手风琴同一块底。 */
export const CARD_CLS = "rounded-2xl bg-[#18181b]";

/** NP 的 Alert faded 信息横幅（播放器/虚拟摄像头页顶那种）：深灰圆角条 +
 * 左侧圆底 info 图标 + 描述 + 右侧动作（多为「查看教程」flat 按钮）。 */
export const Banner = ({ children, end }: {
  children: React.ReactNode;
  end?: React.ReactNode;
}) => (
  <div className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-[#1e1e22] px-4 py-3">
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/10">
      <Info size={15} strokeWidth={1.75} className="text-foreground" />
    </span>
    <span className="min-w-0 flex-1 text-sm leading-6 text-foreground">{children}</span>
    {end}
  </div>
);

/** NP 的紧凑操作行（h-10）：左标题右按钮，如「桌面播放器 | 打开」。
 * 与 SettingsRow 的区别：没有描述行、高度矮一截，一行一个动作。 */
export const ActionRow = ({ title, right }: {
  title: React.ReactNode;
  right: React.ReactNode;
}) => (
  <div className="flex h-10 w-full items-center justify-between gap-2">
    <span className="text-base text-foreground">{title}</span>
    {right}
  </div>
);
