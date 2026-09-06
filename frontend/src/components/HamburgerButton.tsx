// NP 的 HamburgerButton 原样搬（移动端侧栏开关的变形汉堡动画）。
import React from "react";

interface HamburgerButtonProps {
  isActive: boolean;
  onClick: () => void;
}

const HamburgerButton: React.FC<HamburgerButtonProps> = ({
  isActive,
  onClick,
}) => {
  return (
    <svg
      className={`${isActive ? "active" : ""}`}
      style={{
        display: "block",
        verticalAlign: "middle",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        transition: "transform .4s",
        MozUserSelect: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
        ...(isActive && { transform: "rotate(45deg)" }),
      }}
      viewBox="0 0 100 100"
      width="48"
      onClick={onClick}
    >
      {/* 顶部线条 */}
      <path
        className="line top"
        d="m 30,33 h 40 c 3.722839,0 7.5,3.126468 7.5,8.578427 0,5.451959 -2.727029,8.421573 -7.5,8.421573 h -20"
        style={{
          fill: "none",
          transition: "stroke-dasharray .4s, stroke-dashoffset .4s",
          stroke: "#fff",
          strokeWidth: 5.5,
          strokeLinecap: "round",
          strokeDasharray: "40 160",
          ...(isActive && { strokeDashoffset: "-64px" }),
        }}
      />

      {/* 中间线条 */}
      <path
        className="line middle"
        d="m 30,50 h 40"
        style={{
          fill: "none",
          transition:
            "stroke-dasharray .4s, stroke-dashoffset .4s, transform .4s",
          stroke: "#fff",
          strokeWidth: 5.5,
          strokeLinecap: "round",
          strokeDasharray: "40 142",
          transformOrigin: "50%",
          ...(isActive && { transform: "rotate(90deg)" }),
        }}
      />

      {/* 底部线条 */}
      <path
        className="line bottom"
        d="m 70,67 h -40 c 0,0 -7.5,-0.802118 -7.5,-8.365747 0,-7.563629 7.5,-8.634253 7.5,-8.634253 h 20"
        style={{
          fill: "none",
          transition:
            "stroke-dasharray .4s, stroke-dashoffset .4s, transform .4s",
          stroke: "#fff",
          strokeWidth: 5.5,
          strokeLinecap: "round",
          strokeDasharray: "40 85",
          transformOrigin: "50%",
          ...(isActive && { strokeDashoffset: "-64px" }),
        }}
      />
    </svg>
  );
};

export default HamburgerButton;
