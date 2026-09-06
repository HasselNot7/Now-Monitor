// NP 同名 hook 的 Web 剪裁版：没有 Tauri 分支，直接开新窗口。
import { useCallback } from "react";

export function useOpenExternalUrl() {
  const openExternalUrl = useCallback(async (url: string): Promise<void> => {
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return { openExternalUrl };
}
