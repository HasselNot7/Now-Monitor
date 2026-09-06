"""内置配色主题：全局唯一的一份，渲染器与 /api/widgets/meta 都从这里拿。

vars 的键不带 `--` 前缀，monitor.html 里有 KEYMAP 负责映射到 CSS 变量；
用户在 canvas.theme 里写自定义色板时也用这套键。没列出的键回退到
monitor.html :root 里的内置值（Nord Console），所以 partial 覆盖是合法的。
"""

THEMES = {
    "nord-console": {
        "label": "Nord 控制台（默认）",
        "vars": {
            "bg": "#1b1d24",
            "text": "#eceff4",
            "label": "#ebcb8b",
            "chip": "#8fbcbb",
            "dim": "#cdd6e4",
            "subtext": "#4c566a",
            "bar_bg": "#2e3440",
            "bar_fill": "#a3be8c",
            "high": "#bf616a",
            "prompt_user": "#d08770",
            "prompt_symbol": "#81a1c1",
        },
    },
    "pure-white": {
        "label": "纯白（浅色叠加）",
        "vars": {
            "bg": "#f3f4f6",
            "text": "#1f2933",
            "label": "#b45309",
            "chip": "#0f766e",
            "dim": "#64748b",
            "subtext": "#d8dee7",
            "bar_bg": "#dde3ec",
            "bar_fill": "#16a34a",
            "high": "#dc2626",
            "prompt_user": "#c2410c",
            "prompt_symbol": "#2563eb",
        },
    },
    "mono": {
        "label": "黑白",
        "vars": {
            "bg": "#0b0b0d",
            "text": "#fafafa",
            "label": "#a1a1aa",
            "chip": "#d4d4d8",
            "dim": "#a1a1aa",
            "subtext": "#3f3f46",
            "bar_bg": "#27272a",
            "bar_fill": "#e4e4e7",
            "high": "#ef4444",
            "prompt_user": "#71717a",
            "prompt_symbol": "#52525b",
        },
    },
    "matcha": {
        "label": "抹茶",
        "vars": {
            "bg": "#141a14",
            "text": "#e6efe2",
            "label": "#c9d97e",
            "chip": "#9ccfa3",
            "dim": "#a8b89f",
            "subtext": "#2c362b",
            "bar_bg": "#263127",
            "bar_fill": "#8fbc6e",
            "high": "#d96c5f",
            "prompt_user": "#cf8a5b",
            "prompt_symbol": "#86b3a0",
        },
    },
}
