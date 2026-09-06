// NP 的 CopyButton 原样搬（图标 copy→check 的 framer 动效 + Button），加 label 参数
// 用来区分失败 toast 与悬停提示。
import React, { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/button";
import { AnimatePresence, motion, easeIn, easeOut } from "framer-motion";
import { addToast } from "@heroui/toast";

import { CheckIcon, CopyIcon } from "./Icons";

const iconVariants = {
  initial: {
    scale: 1.2,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.15,
      ease: easeOut,
    },
  },
  exit: {
    scale: 0.4,
    opacity: 0,
    transition: {
      duration: 0.12,
      ease: easeIn,
    },
  },
};

const iconWrapperStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const CopyButton = (props: { copyContent: string; label?: string; timeout?: number } & Record<string, unknown>) => {
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <Button
      {...(props as object)}
      isIconOnly
      title={pressed ? "已复制" : props.label || "复制"}
      aria-label={props.label || "复制"}
      onPress={async () => {
        if (pressed) return;

        try {
          await navigator.clipboard.writeText(props.copyContent);
        } catch (err: unknown) {
          console.error("复制失败", err);
          addToast({
            title: "复制失败",
            description: "浏览器拒绝了剪贴板权限，请手动选中复制",
            color: "danger",
            timeout: 6000,
          });

          return;
        }

        setPressed(true);

        timerRef.current = window.setTimeout(() => {
          setPressed(false);
        }, props.timeout || 1500);
      }}
    >
      <AnimatePresence mode="wait">
        {pressed ? (
          <motion.span
            key="check"
            animate="animate"
            exit="exit"
            initial="initial"
            style={iconWrapperStyle}
            variants={iconVariants}
          >
            <CheckIcon />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            animate="animate"
            exit="exit"
            initial="initial"
            style={iconWrapperStyle}
            variants={iconVariants}
          >
            <CopyIcon />
          </motion.span>
        )}
      </AnimatePresence>
    </Button>
  );
};

export default CopyButton;
