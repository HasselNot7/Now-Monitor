// 共享 UI 层 —— 组件内部现在用的是 Now Playing 的 HeroUI v2（跟 NP 完全同一套组件），
// 导出名与旧版一致，编辑器等调用点不用动。
import { Alert } from "@heroui/alert";
import { Button } from "@heroui/button";
import { Divider } from "@heroui/divider";
import { Switch } from "@heroui/switch";
import { Info } from "lucide-react";

type BtnVariant = "solid" | "flat" | "bordered" | "light" | "faded" | "ghost" | "shadow"
  // 旧调用点还在用的 v3 名字，映射到 v2 最近似档
  | "secondary" | "danger";
type BtnColor = React.ComponentProps<typeof Button>["color"];

type BtnProps = Omit<React.ComponentProps<typeof Button>, "variant" | "color"> & {
  title?: string;
  variant?: BtnVariant;
  color?: BtnColor;
};

/** Btn：我们代码里的三个 v3 variant 名映射到 v2（secondary→flat、ghost→light、
 * danger→flat danger）；默认 = NP 的主按钮（solid primary）。v2 的 Button 是原生
 * button 元素，title 属性原生生效。 */
export function Btn({ title, variant, color, ...props }: BtnProps) {
  const map: { variant?: "solid" | "flat" | "bordered" | "light" | "faded" | "ghost" | "shadow"; color?: BtnColor } =
    variant === "secondary" ? { variant: "flat", color: "default" }
      : variant === "ghost" ? { variant: "light", color: "default" }
        : variant === "danger" ? { variant: "flat", color: "danger" }
          : variant ? { variant, color }
            : { variant: "solid", color: "primary" };
  const btn = <Button {...props} color={color ?? map.color} variant={map.variant} />;
  return title
    ? <span title={title} className="inline-flex">{btn}</span>
    : btn;
}

type SwitchProps = Omit<React.ComponentProps<typeof Switch>, "onChange" | "onValueChange">;

/** 无可见标签的开关统一走这个封装；v2 Switch 用 onValueChange，我们调用点写的是
 * onChange —— 这里接一下。默认档（md）就是 NP 设置行的观感（v2 默认组件，无覆盖）。 */
export function TSwitch({ title, onChange, ...props }:
  SwitchProps & { title?: string; onChange?: (v: boolean) => void }) {
  const sw = <Switch {...props} {...(onChange ? { onValueChange: onChange } : {})} />;
  return title ? <span title={title} className="inline-flex">{sw}</span> : sw;
}

/** Now Playing 版式的公共零件：页面标题、分区标题、字段小标签、灰色说明。
 * class 配方照抄 NP 设置页源码（v2 色阶回来了：区题 default-800、字段标签 primary-900）。 */

export const Page = ({ title, children }: {
  title: string;
  children: React.ReactNode;
}) => (
  <>
    <h1 className="text-3xl text-white font-bold leading-9">{title}</h1>
    {children}
  </>
);

/** 区块标题（音乐服务 / 系统设置 那一级），right 放在标题行末尾（如状态 Chip）。 */
export const Section = ({ title, right, children, divider = true }: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  divider?: boolean;
}) => (
  <>
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-end justify-between gap-2">
        <h2 className="text-xl text-default-800 font-bold leading-9">{title}</h2>
        {right}
      </div>
      {children}
    </div>
    {divider && <Divider />}
  </>
);

/** 小节标题（音频设备 / 启动选项 那一级）。 */
export const SubTitle = ({ children, right }: {
  children: React.ReactNode;
  right?: React.ReactNode;
}) => (
  <div className="flex items-center gap-1.5">
    <h3 className="flex items-center gap-1.5 text-base text-default-800 font-bold leading-6">{children}</h3>
    {right}
  </div>
);

/** 字段小标签：NP 源码原样 —— text-primary-900 text-xs font-bold（dark 主题的 900 号
 * 是最浅一档，近白带一丝蓝）。 */
export const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="cursor-default select-none text-xs font-bold text-primary-900">{children}</span>
);

/** 灰色说明文字（NP 的 .text-color-desc）。 */
export const Hint = ({ children, className = "" }: {
  children: React.ReactNode;
  className?: string;
}) => <p className={`text-sm leading-6 text-color-desc ${className}`}>{children}</p>;

/** 设置行：NP 全站通用的高 64px 行 —— 左边标题 + 灰描述，右边控件。NP 不画行分隔线，
 * 靠 h-16 的呼吸感分行。 */
export const SettingsRow = ({ title, desc, right, divider = false }: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  right: React.ReactNode;
  divider?: boolean;
}) => (
  <div className={`flex h-16 w-full items-center justify-between gap-2 ${
    divider ? "border-b border-divider" : ""}`}>
    <div className="flex min-w-0 flex-col gap-[2px]">
      <span className="text-base text-foreground">{title}</span>
      {desc && <span className="text-sm text-color-desc">{desc}</span>}
    </div>
    <div className="flex shrink-0 items-center gap-2">{right}</div>
  </div>
);

/** NP 卡片底：v2 dark 的 content1（#18181b）—— 比背景亮一档、无描边、大圆角。 */
export const CARD_CLS = "rounded-2xl bg-content1";

/** NP 的 Alert flat 信息横幅（组件集成卡手机页那种）：深灰圆角条 + 图标 + 描述 + 右侧动作。
 * 现在直接用 v2 的 Alert 组件本体，跟 NP 一个组件。 */
export const Banner = ({ children, end }: {
  children: React.ReactNode;
  end?: React.ReactNode;
}) => (
  <Alert
    classNames={{ base: "bg-[#1e1e22]!" }}
    description={children as string}
    endContent={end}
    variant="flat"
  />
);

/** NP 的紧凑操作行（h-10）：左标题右按钮，如「桌面播放器 | 打开」。 */
export const ActionRow = ({ title, right }: {
  title: React.ReactNode;
  right: React.ReactNode;
}) => (
  <div className="flex h-10 w-full items-center justify-between gap-2">
    <span className="text-base text-foreground">{title}</span>
    {right}
  </div>
);
