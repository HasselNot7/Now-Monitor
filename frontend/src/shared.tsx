// 页面共享数据（指标 / 硬件快照 / 校验 / AIDA 状态）的 React 上下文。
// App 持有数据并放在 Provider 里，路由包装组件取出来按旧签名传给各页面。
import { createContext, useContext } from "react";
import type { AidaStatus, HW, LayoutCheck, Metric } from "./types";

export interface Shared {
  metrics: Metric[] | null;
  hw: HW | null;
  check: LayoutCheck | null;
  status: AidaStatus | null;
  reloadMetrics: () => Promise<Metric[]>;
  refreshAll: () => Promise<void>;
  /** 向导等页面的"去 XX"按钮切视图用（id：start/status/editor/custom/metrics） */
  goto: (view: string) => void;
}

export const SharedContext = createContext<Shared | null>(null);

export function useShared(): Shared {
  const s = useContext(SharedContext);
  if (!s) throw new Error("useShared 必须在 SharedContext.Provider 里用");
  return s;
}

/** 路由包装：从上下文取出共享数据，按旧签名传给页面组件。
 * 必须是模块级组件（组件身份稳定），否则每次 App 重渲染都会整页重挂载。 */
export function SharedPage({ Page }: { Page: React.ComponentType<{ shared: Shared }> }) {
  const shared = useShared();
  return <Page shared={shared} />;
}
