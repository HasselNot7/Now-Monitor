// NP 的 site.tsx 结构 + 我们的导航项。
import {
  Activity, ExternalLink, FlaskConical, House, LayoutGrid, Power, Table2,
} from "lucide-react";

import type { NavItem } from "../types/nav";

export type SiteConfig = typeof siteConfig;

export const siteConfig = {
  name: "Now Monitor",
  description: "直播画面的硬件监控叠加层",
  sidebarNavItems: [
    {
      key: "start",
      label: "开始使用",
      icon: <House size={24} strokeWidth={1.75} />,
      href: "/start",
    },
    {
      key: "status",
      label: "状态总览",
      icon: <Activity size={24} strokeWidth={1.75} />,
      href: "/status",
    },
    {
      key: "editor",
      label: "版式编辑",
      icon: <LayoutGrid size={24} strokeWidth={1.75} />,
      href: "/editor",
    },
    {
      key: "custom",
      label: "自定义指标",
      icon: <FlaskConical size={24} strokeWidth={1.75} />,
      href: "/custom",
    },
    {
      key: "metrics",
      label: "指标总表",
      icon: <Table2 size={24} strokeWidth={1.75} />,
      href: "/metrics",
    },
    {
      key: "overlay",
      label: "打开叠加层",
      icon: <ExternalLink size={24} strokeWidth={1.75} />,
      href: "/",
      external: true,
      position: "bottom",
    },
    {
      key: "quit",
      label: "退出程序",
      icon: <Power size={24} strokeWidth={1.75} />,
      href: "/quit",
      action: "quit",
      danger: true,
      position: "bottom",
    },
  ] as NavItem[],
};
