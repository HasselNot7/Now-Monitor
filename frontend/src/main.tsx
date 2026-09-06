import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { Provider } from "./Provider";
import { EnvProvider } from "./contexts/EnvContext";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "overlayscrollbars/overlayscrollbars.css";
import "./index.css";

// HashRouter 而不是 NP 的 BrowserRouter：我们把 dist 挂在 FastAPI 的 /admin 下，
// 静态文件服务没有 SPA fallback，#/ 路由不需要服务端配合。
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <EnvProvider>
      <HashRouter>
        <Provider>
          <main className="dark text-foreground w-full h-full">
            <App />
          </main>
        </Provider>
      </HashRouter>
    </EnvProvider>
  </React.StrictMode>,
);
