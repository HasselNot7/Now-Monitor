// NP 的 DefaultLayout 原样搬（去掉 Tauri 标题栏分支）：w-72 侧栏 + 主内容
// OverlayScrollbars 滚动区（上下边缘 mask 渐隐），路由变化回滚到顶部。
// 我们的 Sidebar 需要接自动刷新开关 / 退出 / 档位发布回调，从 props 传进来。
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";

import { Sidebar } from "../components/Sidebar";

export default function DefaultLayout({
  auto, onAutoChange, onQuit, onPublished,
}: {
  auto: boolean;
  onAutoChange: (v: boolean) => void;
  onQuit: () => void;
  onPublished?: () => void;
}) {
  const { pathname } = useLocation();
  // U1：/editor 侧栏默认收成图标窄栏（64px），展开为 288px 推挤式 dock——
  // 让位宽度经 --nav-w 单向流给 fixed 定位的编辑器工作台（见 EditorPage），
  // 其余路由恒 288px 逐像素不变。
  const onEditor = pathname === "/editor";
  const [navMode, setNavMode] = useState<"narrow" | "wide">(
    () => (localStorage.getItem("hwobs.navMode.editor") === "wide" ? "wide" : "narrow"));
  const toggleNavMode = useCallback(() => {
    setNavMode(m => {
      const n = m === "narrow" ? "wide" : "narrow";
      localStorage.setItem("hwobs.navMode.editor", n);
      return n;
    });
  }, []);
  const railNarrow = onEditor && navMode === "narrow";
  const scrollRef = useRef<OverlayScrollbarsComponentRef<"div">>(null);

  // 表单类页走 NP 的 800px 居中列；表格这类数据密集页放宽到 1200px。
  // 版式编辑是 fixed 全屏工作台，不吃这层列。
  const wide = pathname === "/custom" || pathname === "/metrics";

  // 跟踪滚动状态
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // 更新滚动状态
  const updateScrollState = useCallback(() => {
    const osInstance = scrollRef.current?.osInstance();

    if (osInstance) {
      const { viewport } = osInstance.elements();
      const { scrollTop, scrollHeight, clientHeight } = viewport;

      // 判断是否可以向上/向下滚动
      setCanScrollUp(scrollTop > 0);
      // 增加 1px 的容错
      setCanScrollDown(scrollTop + clientHeight < scrollHeight - 1);
    }
  }, []);

  // 生成 mask-image 样式
  const maskStyle = useMemo(() => {
    const maskSize = "40px";

    if (!canScrollUp && !canScrollDown) return {};

    const gradient = `linear-gradient(to bottom,
      ${canScrollUp ? `transparent, black ${maskSize}` : "black 0"},
      ${canScrollDown ? `black calc(100% - ${maskSize}), transparent` : "black 100%"}
    )`;

    return {
      maskImage: gradient,
      WebkitMaskImage: gradient, // 兼容 Safari/Chrome
    };
  }, [canScrollUp, canScrollDown]);

  // 路由变化把内容滚回顶部（NP 同款）
  useEffect(() => {
    const osInstance = scrollRef.current?.osInstance();
    if (osInstance) {
      const { viewport } = osInstance.elements();
      viewport.scrollTop = 0;
    }
  }, [pathname]);

  return (
    <>
      <div className="bg-background font-sans text-foreground antialiased min-h-screen"
        style={{ "--nav-w": railNarrow ? "4rem" : "18rem" } as React.CSSProperties}>
        <div data-overlay-container="true">
          <div
            id="app-container"
            className="relative flex min-h-dvh flex-col bg-background bg-radial"
          >
            {/* 防止父级滚动 */}
            <div className="flex h-screen overflow-hidden">
              {/* 侧边栏：/editor 窄栏态 w-16，其余（含 /editor 展开态=推挤 dock）w-72。
                  宽度过渡 + overflow-hidden 做裁切显隐；档位浮层是 fixed 定位不受裁切 */}
              <div className={`overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none md:fixed md:top-0 md:left-0 md:h-screen md:border-r md:border-divider md:bg-background md:z-20 ${
                railNarrow ? "md:w-16" : "md:w-72"
              }`}>
                <Sidebar auto={auto} onAutoChange={onAutoChange} onQuit={onQuit} onPublished={onPublished}
                  nav={onEditor ? { mode: navMode, onToggle: toggleNavMode } : undefined} />
              </div>

              {/* 主体内容容器：跟随侧栏让位（窄栏 64px / 展开或其余路由 288px），同步过渡 */}
              <div className={`transition-[margin] duration-300 ease-in-out motion-reduce:transition-none relative flex-1 h-screen ${railNarrow ? "md:ml-16" : "md:ml-72"}`}>
                {/* 滚动内容 */}
                <OverlayScrollbarsComponent
                  ref={scrollRef}
                  className="h-full w-full"
                  style={maskStyle}
                  options={{
                    scrollbars: {
                      autoHide: "leave",
                      autoHideDelay: 500,
                      theme: "os-theme-dark",
                    },
                    overflow: {
                      x: "hidden",
                      y: "scroll",
                    },
                  }}
                  events={{
                    scroll: updateScrollState,
                    initialized: updateScrollState,
                  }}
                  defer
                >
                  {/* 版式编辑是 fixed 全屏工作台，不吃这层滚动容器 */}
                  <div className="h-full pt-12 pb-4 md:pt-0 md:pb-0">
                    <div className="flex justify-center">
                      <div className={`flex w-full flex-col gap-6 px-10 py-6 ${
                        wide ? "max-w-[1200px]" : "max-w-[800px]"
                      }`}>
                        <Outlet context={{}} />
                      </div>
                    </div>
                  </div>
                </OverlayScrollbarsComponent>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
