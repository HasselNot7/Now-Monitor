// NP 的 Sidebar 原样搬：品牌区 + 顶部导航 + flex-grow + 底部导航，移动端抽屉。
// 改动：品牌换成 Now Monitor 的 LogoMark；导航来自我们的 siteConfig；
// 「自动刷新」开关行插在底部导航之前；退出程序渲染成 danger 按钮。
import { useState, useCallback, memo } from "react";
import { useLocation, Link } from "react-router-dom";
import { Switch } from "@heroui/switch";

import HamburgerButton from "./HamburgerButton";
import { ProfileSwitcher } from "../widgets";

import { siteConfig } from "../constants/site";
import { NavItem } from "../types/nav";
import { useOpenExternalUrl } from "../hooks/useOpenExternalUrl";

/** 品牌图标：CPU 芯片轮廓 + 中间一条监控心跳线（与 public/favicon.svg 同款）。 */
function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="shrink-0 text-primary"
      stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.6" />
      <path d="M9.5 6.5V3.6M12 6.5V3.6M14.5 6.5V3.6M9.5 17.5v2.9M12 17.5v2.9M14.5 17.5v2.9M6.5 9.5H3.6M6.5 12H3.6M6.5 14.5H3.6M17.5 9.5h2.9M17.5 12h2.9M17.5 14.5h2.9" />
      <path d="M8.7 12h1.3l1.1-2.4 1.7 4.7 1.1-2.3h1.5" strokeWidth={1.7} />
    </svg>
  );
}

const MobileNavbar = memo(
  ({
     isSidebarOpen,
     onToggleSidebar,
     onCloseSidebar,
   }: {
    isSidebarOpen: boolean;
    onToggleSidebar: () => void;
    onCloseSidebar: () => void;
  }) => (
    <div className="fixed top-0 left-0 right-0 h-16 bg-background border-b border-divider flex items-center px-4 z-50 md:hidden">
      {/* 软件图标 */}
      <div className="absolute left-0 right-0 flex justify-center pointer-events-none">
        <Link className="pointer-events-auto flex items-center justify-center gap-2" to="/" onClick={onCloseSidebar}>
          <LogoMark size={22} />
          <span className="text-lg font-bold tracking-tight">Now Monitor</span>
        </Link>
      </div>

      {/* 右侧汉堡按钮 */}
      <div className="flex justify-end w-full">
        <HamburgerButton isActive={isSidebarOpen} onClick={onToggleSidebar} />
      </div>
    </div>
  ),
);

// 导航项组件
const NavContent: React.FC<{
  topNavItems: NavItem[];
  bottomNavItems: NavItem[];
  currentPath: string;
  onItemClick: () => void;
  onQuit: () => void;
  auto: boolean;
  onAutoChange: (v: boolean) => void;
}> = ({ topNavItems, bottomNavItems, currentPath, onItemClick, onQuit, auto, onAutoChange }) => {
  const { openExternalUrl } = useOpenExternalUrl();

  const renderNavItem = (item: NavItem) => {
    const isActive = !item.external && !item.action && currentPath === item.href;

    if (item.action === "quit") {
      return (
        <button
          key={item.key}
          type="button"
          className="group flex w-full min-h-12 cursor-pointer items-center gap-[0.55rem] rounded-xl px-3 py-1.5 text-left text-base font-medium transition-all duration-150 text-default-500 hover:bg-danger/15 hover:text-danger"
          onClick={() => { onItemClick(); onQuit(); }}
        >
          <div className="shrink-0">{item.icon}</div>
          <span className="flex-1 truncate">{item.label}</span>
        </button>
      );
    }

    return (
      <Link
        key={item.key}
        className={`group flex items-center gap-[0.55rem] relative py-1.5 w-full px-3 min-h-12 rounded-xl cursor-pointer transition-all duration-150
          ${
          isActive
            ? "bg-default-100 text-foreground"
            : item.danger
              ? "text-default-500 hover:bg-danger/15 hover:text-danger"
              : "text-default-500 hover:bg-default/40 hover:text-default-foreground"
        }`}
        to={item.href}
        onClick={(e) => {
          if (item.external) {
            e.preventDefault();
            openExternalUrl(item.href.startsWith("/") ? `${location.origin}${item.href}` : item.href);
          }
          onItemClick();
        }}
      >
        <div className="shrink-0">{item.icon}</div>
        <span className="flex-1 truncate text-base font-medium">
          {item.label}
        </span>
        {item.endContent && (
          <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {item.endContent}
          </div>
        )}
      </Link>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部导航项 */}
      <nav className="flex flex-col gap-0.5">
        {topNavItems.map(renderNavItem)}
      </nav>

      {/* 弹性空间 */}
      <div className="flex-grow" />

      {/* 自动刷新开关行（插在底部导航之前） */}
      <div className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl px-3 py-1.5">
        <span className="flex-1 truncate text-base font-medium text-default-500">自动刷新</span>
        <Switch size="sm" isSelected={auto} onValueChange={onAutoChange} aria-label="自动刷新" />
      </div>

      {/* 底部导航项 */}
      <nav className="flex flex-col gap-0.5">
        {bottomNavItems.map(renderNavItem)}
      </nav>
    </div>
  );
};

export const Sidebar: React.FC<{
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  onQuit: () => void;
  onPublished?: () => void;
}> = ({ auto, onAutoChange, onQuit, onPublished }) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // 从 siteConfig 获取导航项
  const navItems: NavItem[] = siteConfig.sidebarNavItems;

  const topNavItems = navItems.filter((item) => item.position !== "bottom");
  const bottomNavItems = navItems.filter((item) => item.position === "bottom");

  // 关闭侧边栏
  const closeSidebar = () => setIsSidebarOpen(false);

  // 使用 useCallback 确保回调函数引用稳定
  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  const nav = (onItemClick: () => void) => (
    <NavContent
      auto={auto}
      bottomNavItems={bottomNavItems}
      currentPath={currentPath}
      onAutoChange={onAutoChange}
      onItemClick={onItemClick}
      onQuit={onQuit}
      topNavItems={topNavItems}
    />
  );

  return (
    <>
      {/* 移动设备顶部导航栏 */}
      <MobileNavbar
        isSidebarOpen={isSidebarOpen}
        onCloseSidebar={closeSidebar}
        onToggleSidebar={toggleSidebar}
      />

      {/* 桌面端侧边栏（移动设备隐藏） */}
      <div className="hidden md:block h-full">
        <div className="h-full w-72 border-r border-divider p-6 flex flex-col">
          {/* 软件图标 */}
          <div className="flex flex-col relative top-4 items-center mb-8">
            <Link to="/" className="flex items-center justify-center gap-2">
              <LogoMark size={24} />
              <span className="text-[19px] font-bold tracking-tight">Now Monitor</span>
            </Link>
          </div>

          <ProfileSwitcher onPublished={onPublished} />

          <div className="mt-2 flex-1 min-h-0 flex flex-col">
            {nav(closeSidebar)}
          </div>
        </div>
      </div>

      {/* 移动设备侧边栏 */}
      <div
        className={`fixed top-16 left-0 right-0 bottom-0 z-40 bg-background transform transition-transform duration-300 ease-in-out md:hidden
          ${isSidebarOpen ? "translate-y-0" : "-translate-y-full"}`}
      >
        <div className="h-full flex flex-col p-6">
          {nav(closeSidebar)}
        </div>
      </div>

      {/* 侧边栏打开时的遮罩层 */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}
    </>
  );
};
