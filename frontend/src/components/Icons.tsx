// NP 的 Icons.tsx 里我们用到的两个（CopyButton 的 copy→check 互换）。
import * as React from "react";

interface IconSvgProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const CopyIcon: React.FC<IconSvgProps> = ({
  size,
  height,
  width,
  ...props
}) => {
  return (
    <svg
      aria-hidden="true"
      className="absolute text-inherit opacity-100 scale-100 group-data-[copied=true]:opacity-0 group-data-[copied=true]:scale-50 transition-transform-opacity"
      fill="none"
      focusable="false"
      height={size || height || 16}
      role="presentation"
      shapeRendering="geometricPrecision"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={size || width || 16}
      {...props}
    >
      <path d="M16 17.1c0 3.5-1.4 4.9-4.9 4.9H6.9C3.4 22 2 20.6 2 17.1v-4.2C2 9.4 3.4 8 6.9 8h4.2c3.5 0 4.9 1.4 4.9 4.9Z" />
      <path d="M8 8V6.9C8 3.4 9.4 2 12.9 2h4.2C20.6 2 22 3.4 22 6.9v4.2c0 3.5-1.4 4.9-4.9 4.9H16" />
      <path d="M16 12.9C16 9.4 14.6 8 11.1 8" />
    </svg>
  );
};

export const CheckIcon: React.FC<IconSvgProps> = ({
  size,
  height,
  width,
  ...props
}) => {
  return (
    <svg
      fill="currentColor"
      height={size || height || 16}
      viewBox="0 0 16 16"
      width={size || width || 16}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z" />
    </svg>
  );
};
