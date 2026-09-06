// v2 的 toast 是 addToast({...}) 单函数；我们代码里全是 toast.success/danger(标题, 选项)
// 的调用形状 —— 这层薄适配让所有调用点原样保留。
import { addToast } from "@heroui/toast";

type Opts = { description?: string; timeout?: number };

export const toast = {
  success: (title: string, o?: Opts) => addToast({ title, ...o, color: "success" }),
  danger: (title: string, o?: Opts) => addToast({ title, ...o, color: "danger" }),
  warning: (title: string, o?: Opts) => addToast({ title, ...o, color: "warning" }),
  default: (title: string, o?: Opts) => addToast({ title, ...o }),
};

// 直接转出 addToast，需要完整能力（如 color 自定义）的地方用它。
export { addToast };
