// NP 的 nav.ts 原样搬，加了一个 action 字段：退出程序这类"不是跳转"的侧栏项用。
import type React from "react";

export interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  href: string;
  position?: "top" | "bottom";
  external?: boolean;
  endContent?: React.ReactNode;
  /** 非 "quit" 时忽略；有 action 的项渲染成按钮而不是链接 */
  action?: "quit";
  /** danger 项整行红色 */
  danger?: boolean;
}
