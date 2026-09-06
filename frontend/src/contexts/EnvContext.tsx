import React, { createContext, useContext } from "react";

// NP 的 EnvContext 本带 Tauri 桌面端检测；我们是纯 Web（FastAPI 静态页），
// 固定 Web 环境，保留 useEnv 接口让搬过来的布局代码一字不改。
interface EnvContextType {
  isDesktop: boolean;
  isWeb: boolean;
}

const EnvContext = createContext<EnvContextType>({
  isDesktop: false,
  isWeb: true,
});

export const EnvProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <EnvContext.Provider value={{ isDesktop: false, isWeb: true }}>
    {children}
  </EnvContext.Provider>
);

export const useEnv = () => useContext(EnvContext);
