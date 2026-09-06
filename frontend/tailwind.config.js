import { heroui } from "@heroui/theme"

/** @type {import('tailwindcss').Config} */
// Now Playing 同款主题底座：dark 默认、背景 #121212、HeroUI v2 色板整套搬过来。
// 字体也跟 NP 完全一致（sans 裸写 sans-serif）：同一段声明在同一个浏览器里
// 必然解析到同一个字体，中文落到 Chrome 的中文无衬线默认（微软雅黑标准体）。
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#121212',
      },
      fontFamily: {
        jetbrains: ['"JetBrains Mono"', 'sans-serif'],
        poppins: ['"Poppins"', 'sans-serif'],
        sans: ['sans-serif'],
      },
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      defaultTheme: "dark",
      defaultExtendTheme: "dark",
    })
  ],
}
