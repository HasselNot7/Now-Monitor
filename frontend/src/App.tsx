import { Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/modal";
import { MotionConfig } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "./api";
import { toast } from "./lib/toast";
import { SharedContext, SharedPage } from "./shared";
import type { Shared } from "./shared";
import type { AidaStatus, HW, LayoutCheck, Metric } from "./types";
import { Btn } from "./ui";
import DefaultLayout from "./layouts/DefaultLayout";
import { LivePreview } from "./widgets";
import WizardPage from "./pages/WizardPage";
import StatusPage from "./pages/StatusPage";
import EditorPage from "./pages/EditorPage";
import CustomMetricsPage from "./pages/CustomMetricsPage";
import MetricsTablePage from "./pages/MetricsTablePage";

/** 旧版 localStorage 视图 id → 新 hash 路由（保留用户上次停留的页面）。 */
const VIEW_PATH: Record<string, string> = {
  start: "/start", status: "/status", editor: "/editor",
  custom: "/custom", metrics: "/metrics",
};
const PATH_VIEW: Record<string, string> = Object.fromEntries(
  Object.entries(VIEW_PATH).map(([k, v]) => [v, k]));

export default function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [hw, setHw] = useState<HW | null>(null);
  const [check, setCheck] = useState<LayoutCheck | null>(null);
  const [status, setStatus] = useState<AidaStatus | null>(null);
  const [auto, setAuto] = useState(true);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [quitDone, setQuitDone] = useState(false);
  const autoRef = useRef(auto);
  autoRef.current = auto;

  const reloadMetrics = useCallback(async () => {
    const m = await api.metrics();
    setMetrics(m.metrics);
    return m.metrics;
  }, []);

  const refreshAll = useCallback(async () => {
    const [m, c, s] = await Promise.all([
      api.metrics().catch(() => null),
      api.layoutCheck().catch(() => null),
      api.aidaStatus().catch(() => null),
    ]);
    if (m) setMetrics(m.metrics);
    setCheck(c);
    setStatus(s);
    try { setHw(await api.hw()); } catch { setHw(null); }
  }, []);

  useEffect(() => {
    refreshAll();
    const timer = setInterval(async () => {
      if (!autoRef.current) return;
      try { setHw(await api.hw()); } catch { setHw(null); }
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshAll]);

  // 记住用户停留的页面（旧的 switchView 语义：localStorage + goto）
  useEffect(() => {
    const v = PATH_VIEW[pathname];
    if (v) localStorage.setItem("hwoverlay.view", v);
  }, [pathname]);

  const goto = useCallback((view: string) => {
    navigate(VIEW_PATH[view] ?? "/start");
  }, [navigate]);

  /** 退出：服务停掉后本页面还在浏览器里活着，切到告别页。请求失败多半是
   * 服务正在关闭、连接先断了 —— 也按退出成功处理。 */
  const doQuit = async () => {
    try {
      const rep = await api.shutdownApp();
      if (!rep.quitting) {
        toast.danger("没能退出", { description: rep.reason, timeout: 6000 });
        return;
      }
    } catch { /* 连接断了 = 正在关 */ }
    setQuitDone(true);
  };

  const shared: Shared = { metrics, hw, check, status, reloadMetrics, refreshAll, goto };

  if (quitDone) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md px-6 text-center">
          <h1 className="text-3xl font-bold leading-9 text-white">Now Monitor 已退出</h1>
          <p className="mt-3 text-sm leading-6 text-color-desc">
            OBS 叠加层已停止。要再启动，双击 Now-Monitor.exe；本页面可以关掉了。
          </p>
        </div>
      </div>
    );
  }

  // 路由包装见 shared.ts 的 SharedPage（模块级组件，页面不会因 App 重渲染而重挂载）
  const saved = localStorage.getItem("hwoverlay.view") || "start";

  return (
    <MotionConfig reducedMotion="user">
      <SharedContext.Provider value={shared}>
        <Routes>
          <Route element={
            <DefaultLayout auto={auto} onAutoChange={setAuto}
              onQuit={() => setConfirmQuit(true)} onPublished={refreshAll} />
          }>
            <Route path="/" element={<Navigate replace to={VIEW_PATH[saved] ?? "/start"} />} />
            <Route element={<SharedPage Page={WizardPage} />} path="/start" />
            <Route element={<SharedPage Page={StatusPage} />} path="/status" />
            <Route element={<SharedPage Page={EditorPage} />} path="/editor" />
            <Route element={<SharedPage Page={CustomMetricsPage} />} path="/custom" />
            <Route element={<SharedPage Page={MetricsTablePage} />} path="/metrics" />
            <Route element={<Navigate replace to="/start" />} path="*" />
          </Route>
        </Routes>

        {/* 非编辑器页（开始/状态）右下角常驻实时预览：读已发布版式，保存后自动跟着变 */}
        {(pathname === "/start" || pathname === "/status") && (
          <LivePreview url={`${location.origin}/`}
            canvasW={check?.canvas_w ?? 1920} canvasH={check?.canvas_h ?? 200} />
        )}

        {/* 退出确认：停服务会连累 OBS 叠加层，让用户带着预期点下去 */}
        <Modal isOpen={confirmQuit} size="sm" onOpenChange={setConfirmQuit}>
          <ModalContent>
            {() => (
              <>
                <ModalHeader className="flex flex-col gap-1 text-xl">退出 Now Monitor？</ModalHeader>
                <ModalBody>
                  <p className="text-sm leading-6 text-color-desc">
                    OBS 里的叠加层会变空白。要再启动，双击 Now-Monitor.exe。
                  </p>
                </ModalBody>
                <ModalFooter>
                  <Btn variant="secondary" className="bg-[#27272a]" onPress={() => setConfirmQuit(false)}>取消</Btn>
                  <Btn variant="danger" onPress={() => { setConfirmQuit(false); doQuit(); }}>退出</Btn>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </SharedContext.Provider>
    </MotionConfig>
  );
}
