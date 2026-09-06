"""部件注册表：版式 schema v2 的行级定义，每种显示部件在这里登记一项。

v1 的问题：cards/chips 的解剖结构焊死在 monitor.html 和 layout.py 两处，
高度常量（CARD_H=66 等）是从 CSS 手抄的 —— 用户一改字号或画布，校验器就
开始撒谎，而"加一种部件"要同时改 Python 校验器、HTML 渲染器、管理页编辑器。

v2 的约定：
- 每种部件在这里登记：label/icon/summary（管理页展示用）、defaults（含默认
  几何）、height()（按配置算占高）、validate()（部件自己的结构检查）。
  layout.check 只做遍历和全局检查。
- monitor.html 里有同名 JS 部件工厂（makeCards/makeChips/...），
  两边以 type 字符串为契约；渲染器按配置内联应用几何与样式，CSS 只留兜底值。
- style_schema 同时是两件事的单一来源：/api/widgets/meta 把它吐给管理页，
  编辑器据此自动生成「外观」控件；_style_check 按它校验用户写的 style。
  新增一个样式键 = schema 加一行，校验和编辑器控件同时到位。
"""

import math
import re

from . import refs

COLOR_RX = re.compile(r"^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")


def is_color(v):
    return isinstance(v, str) and bool(COLOR_RX.match(v))


def _int_in(w, key, default, lo, hi):
    v = w.get(key, default)
    return v if isinstance(v, int) and lo <= v <= hi else default


def _line_h(px):
    """等宽字体默认行高的量测口径：1.2 × 字号，取整。"""
    return round(px * 1.2)


# --- style：组件外观覆盖（渲染器 applyStyle 消费） ----------------------------
# 通用键全组件可用；组件特有键追加在各自 style_schema 末尾。
# bg.* 让任意组件长出"卡片底"：底色 + 不透明度 + 圆角 + 内边距 + 描边。

COMMON_STYLE = [
    {"key": "color", "label": "文字颜色", "type": "color"},
    {"key": "label", "label": "名字 / 标签颜色", "type": "color"},
    {"key": "accent", "label": "强调色（条 / 曲线 / 圆环）", "type": "color"},
    {"key": "high", "label": "告警色", "type": "color"},
    {"key": "dim", "label": "次要 / 线条颜色", "type": "color"},
    {"key": "opacity", "label": "不透明度", "type": "range",
     "min": 0.05, "max": 1, "step": 0.05, "default": 1},
    {"key": "bg.color", "label": "底色（留空 = 无背景）", "type": "color"},
    {"key": "bg.alpha", "label": "底色不透明度 %", "type": "range",
     "min": 0, "max": 100, "step": 5, "default": 85},
    {"key": "bg.radius", "label": "圆角 px", "type": "int", "min": 0, "max": 100, "default": 12},
    {"key": "bg.padding", "label": "内边距 px", "type": "int", "min": 0, "max": 100, "default": 0},
    {"key": "bg.border", "label": "描边宽度 px", "type": "int", "min": 0, "max": 12, "default": 0},
    {"key": "bg.border_color", "label": "描边颜色", "type": "color"},
]


def _style_check(schema, style, errors, warnings):
    """按 schema 校验一份 style dict。schema 里没有的键警告忽略，不报错。
    schema 的 key 用点路径（bg.color），style 里对应的是嵌套对象。"""
    if style is None:
        return
    if not isinstance(style, dict):
        errors.append(f"style 必须是对象（现在是 {style!r}）")
        return
    known_top = {f["key"].split(".")[0] for f in schema}
    for f in schema:
        node = style
        for p in f["key"].split("."):
            if isinstance(node, dict) and p in node:
                node = node[p]
            else:
                node = None
                break
        if node is None:
            continue
        v = node
        typ = f["type"]
        if typ == "color":
            if not is_color(v):
                errors.append(f"style.{f['key']} 需要形如 #rrggbb 的颜色（现在是 {v!r}）")
        elif typ == "range":
            if not isinstance(v, (int, float)) or isinstance(v, bool) \
                    or not f.get("min", 0) <= v <= f.get("max", 1):
                errors.append(f"style.{f['key']} 需要在 {f.get('min')}~{f.get('max')} 之间（现在是 {v!r}）")
        elif typ == "int":
            if not isinstance(v, int) or isinstance(v, bool) \
                    or not f.get("min", 0) <= v <= f.get("max", 999):
                errors.append(f"style.{f['key']} 需要是 {f.get('min')}~{f.get('max')} 的整数（现在是 {v!r}）")
        elif typ == "bool":
            if not isinstance(v, bool):
                errors.append(f"style.{f['key']} 需要是 true / false（现在是 {v!r}）")
    unknown = sorted(set(style) - known_top)
    if unknown:
        warnings.append("style 里不认识的键（会被忽略）：" + ", ".join(unknown))


def _style_field(key, label, typ, **extra):
    return {"key": key, "label": label, "type": typ, **extra}


def _metric(w, errors, kind):
    if not isinstance(w.get("metric"), str) or not w.get("metric"):
        errors.append(f"{kind} 部件必须有 metric")


# --- cards：指标卡片网格 ----------------------------------------------------
# item_height=66 的量测依据：标题 21（17px 字号）+ gap 5 + 进度条行 18
# （15px 字号撑出的行高）+ gap 5 + 次要行 17（14px 字号）。
# bar_h 上限 20：进度条行高由 15px 字号撑到 20px，超过会把卡片撑出 item_height 预算。

CARD_STYLE = COMMON_STYLE + [
    _style_field("brackets", "[ ] 括号装饰", "bool", default=True),
    _style_field("title_size", "标题字号 px", "int", min=8, max=40, default=17),
    _style_field("bar_h", "条粗 px", "int", min=2, max=20, default=13),
    _style_field("spark_w", "迷你曲线宽 px", "int", min=40, max=300, default=82),
    _style_field("spark_h", "迷你曲线高 px", "int", min=10, max=60, default=17),
    _style_field("spark_bg", "迷你曲线深色底盒", "bool", default=True),
]


def cards_height(w):
    items = w.get("items") or []
    cols = max(1, _int_in(w, "cols", 4, 1, 12))
    ih = _int_in(w, "item_height", 66, 24, 400)
    rows = math.ceil(len(items) / cols) if items else 0
    gap = _int_in(w, "gap", 32, 0, 400)
    return rows * ih + max(0, rows - 1) * gap


def cards_validate(w, errors, warnings):
    items = w.get("items")
    if not isinstance(items, list):
        errors.append("cards 的 items 必须是数组")
        return
    cols = w.get("cols", 4)
    if not isinstance(cols, int) or cols < 1:
        errors.append(f"cols 必须 ≥ 1（现在是 {cols!r}）")
    elif items and len(items) % cols:
        warnings.append(f"有 {len(items)} 张卡片但 cols={cols}，"
                        f"最后一行不满 {cols - len(items) % cols} 张")
    ih = w.get("item_height", 66)
    if not isinstance(ih, int) or not 24 <= ih <= 400:
        errors.append(f"item_height 必须是 24~400 的整数（现在是 {ih!r}）")
    keys = [c.get("key") for c in items if isinstance(c, dict)]
    dup = sorted({k for k in keys if keys.count(k) > 1})
    if dup:
        errors.append(f"卡片 key 重复：{', '.join(map(str, dup))}（渲染按 key 索引，重复会互相覆盖）")
    _style_check(CARD_STYLE, w.get("style"), errors, warnings)


# --- chips：底部小指标行 ------------------------------------------------------
# 高度 = 15px 字号行高 18 + margin_top 10（CSS .chips 的 margin-top）。

CHIPS_STYLE = COMMON_STYLE + [
    _style_field("gap", "间距 px", "int", min=0, max=80, default=18),
]


def chips_height(w):
    font = _int_in(w, "font", 15, 8, 40)
    margin = _int_in(w, "margin_top", 10, 0, 200)
    return _line_h(font) + margin


def chips_validate(w, errors, warnings):
    items = w.get("items")
    if not isinstance(items, list):
        errors.append("chips 的 items 必须是数组")
    fit = w.get("fit", "none")
    if fit not in ("none", "shrink"):
        errors.append(f"fit 只支持 none / shrink（现在是 {fit!r}）")
    _style_check(CHIPS_STYLE, w.get("style"), errors, warnings)


# --- text：自定义文本行 -------------------------------------------------------
# 正文里 {输出路径} 会被替换成格式化后的值；引用由 refs.iter_refs 统一收集。

def text_height(w):
    size = _int_in(w, "size", 19, 8, 60)
    margin = _int_in(w, "margin_top", 0, 0, 200)
    return _line_h(size) + margin


def text_validate(w, errors, warnings):
    if not isinstance(w.get("text"), str) or not w.get("text"):
        errors.append("text 部件必须有非空的 text 字符串")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- stat / progress / html：自由画布部件 ------------------------------------
# 只在 canvas.mode=free 下有意义（x/y 定位）；height() 仅在流式兜底用。

def stat_height(w):
    return _line_h(_int_in(w, "size", 26, 8, 80))


def stat_validate(w, errors, warnings):
    _metric(w, errors, "stat")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


PROGRESS_STYLE = COMMON_STYLE + [
    _style_field("track", "轨道颜色", "color"),
    _style_field("radius", "圆角 px", "int", min=0, max=20, default=4),
]


def progress_height(w):
    return _int_in(w, "height", 10, 4, 100)


def progress_validate(w, errors, warnings):
    _metric(w, errors, "progress")
    _style_check(PROGRESS_STYLE, w.get("style"), errors, warnings)


def html_height(w):
    return _int_in(w, "h", 60, 10, 2000)


def html_validate(w, errors, warnings):
    if not isinstance(w.get("html"), str) or not w.get("html"):
        errors.append("html 部件必须有非空的 html")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- gauge：环形仪表 ----------------------------------------------------------
# 高度 = 圆环直径 +（带标签时）标签行 20；与 monitor.html makeGauge 同口径。

GAUGE_STYLE = COMMON_STYLE + [
    _style_field("track", "轨道颜色", "color"),
    _style_field("show_value", "圆环中央显示数值", "bool", default=True),
]


def gauge_height(w):
    size = _int_in(w, "size", 120, 48, 600)
    return size + (20 if w.get("label") else 0)


def gauge_validate(w, errors, warnings):
    _metric(w, errors, "gauge")
    ring = w.get("ring")
    if ring is not None and (not isinstance(ring, int) or not 2 <= ring <= 40):
        errors.append("gauge.ring（环宽）必须是 2~40 的整数")
    _style_check(GAUGE_STYLE, w.get("style"), errors, warnings)


# --- spark：独立迷你曲线（自由画布） ------------------------------------------
# 画布面积图：默认 fill 填充曲线下方，fill=false 画纯线。颜色走 style.accent/high。

def spark_height(w):
    return _int_in(w, "h", 32, 12, 200)


def spark_validate(w, errors, warnings):
    _metric(w, errors, "spark")
    samples = w.get("samples")
    if samples is not None and (not isinstance(samples, int) or not 10 <= samples <= 300):
        errors.append("spark.samples（采样秒数）必须是 10~300 的整数")
    _style_check(SPARK_STYLE, w.get("style"), errors, warnings)


# --- bars：柱状条原子件（自由画布） --------------------------------------------
# 卡片内嵌迷你曲线的独立形态：canvas 柱状直方图（1px 缝隙，窗口内峰值定标）。
# 与 spark（面积图）是两个部件、两种观感；颜色走 style.accent/high。

def bars_height(w):
    return _int_in(w, "h", 32, 12, 200)


def bars_validate(w, errors, warnings):
    _metric(w, errors, "bars")
    samples = w.get("samples")
    if samples is not None and (not isinstance(samples, int) or not 10 <= samples <= 300):
        errors.append("bars.samples（采样秒数）必须是 10~300 的整数")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


SPARK_STYLE = COMMON_STYLE + [
    _style_field("fill", "填充曲线下面积", "bool", default=True),
]


# --- panel：纯背景面板（自由画布） --------------------------------------------
# 没有数据，只是一块可调底色/圆角/描边的矩形：垫在其他部件后面，用户自己拼卡片。

PANEL_STYLE = [
    _style_field("bg.color", "底色（留空 = 半透明默认底）", "color"),
    _style_field("bg.alpha", "底色不透明度 %", "range", min=0, max=100, step=5, default=85),
    _style_field("bg.radius", "圆角 px", "int", min=0, max=100, default=12),
    _style_field("bg.padding", "内边距 px", "int", min=0, max=100, default=0),
    _style_field("bg.border", "描边宽度 px", "int", min=0, max=12, default=0),
    _style_field("bg.border_color", "描边颜色", "color"),
]


def panel_height(w):
    return _int_in(w, "h", 100, 10, 2000)


def panel_validate(w, errors, warnings):
    _style_check(PANEL_STYLE, w.get("style"), errors, warnings)


# --- value：数值组原子件（自由画布） ------------------------------------------
# 卡片大数字/小字行与 chips 的原子形态：一组指标 + 分隔符 + 可选注册表名字。
# 与 cards 的 value/sub 用同一套组定义（metrics/sep/unit_policy），SlotEditor 直接可编辑。

def value_height(w):
    return _line_h(_int_in(w, "size", 19, 8, 60))


def value_validate(w, errors, warnings):
    metrics = w.get("metrics")
    if not isinstance(metrics, dict) or not isinstance(metrics.get("metrics"), list) \
            or not metrics["metrics"]:
        errors.append("value 部件必须有非空的 metrics 组（{metrics: [...]}）")
    show_name = w.get("show_name")
    if show_name is not None and not isinstance(show_name, bool):
        errors.append(f"value.show_name 需要是 true / false（现在是 {show_name!r}）")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- Phase 2：数据属性 schema（props_schema） ---------------------------------
# 与 style_schema 对偶：style_schema 管「外观」，props_schema 管「内容/行为」。
# 编辑器的属性面板按它自动生成控件（editors.tsx 的 PropsEditor），加一种简单部件
# 不再需要为它手写 Inspector 控件。复杂件（cards/value）继续用手写编辑器。

ICON_NAMES = ["cpu", "temp", "power", "gauge", "pulse", "wifi",
              "disk", "ram", "clock", "alert", "screen", "liquid"]

ICON_PROPS = [
    {"key": "name", "label": "图标", "type": "select", "options": ICON_NAMES, "default": "cpu"},
    {"key": "size", "label": "大小 px", "type": "int", "min": 12, "max": 200, "default": 24},
]

IMAGE_PROPS = [
    {"key": "url", "label": "图片 URL", "type": "text"},
    {"key": "fit", "label": "适应方式", "type": "select",
     "options": ["cover", "contain", "fill"], "default": "cover"},
]

DIVIDER_PROPS = [
    {"key": "vertical", "label": "竖向", "type": "bool", "default": False},
    {"key": "thickness", "label": "线粗 px", "type": "int", "min": 1, "max": 40, "default": 2},
]

BADGE_PROPS = [
    {"key": "text", "label": "文字（支持 {cpu.usage} 插值）", "type": "text"},
]


# --- icon：内置线性图标原子件 ---------------------------------------------------
# 渲染器 monitor.html 的 ICON_PATHS 是图标清单的渲染端；这里只列名字供下拉与校验。

def icon_height(w):
    return _int_in(w, "size", 24, 12, 200)


def icon_validate(w, errors, warnings):
    name = w.get("name")
    if name is not None and name not in ICON_NAMES:
        warnings.append(f"icon.name {name!r} 不在内置图标集，会回退 pulse"
                        f"（可选：{', '.join(ICON_NAMES)}）")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- image：URL 图片原子件 ------------------------------------------------------

def image_height(w):
    return _int_in(w, "h", 150, 10, 2000)


def image_validate(w, errors, warnings):
    url = w.get("url")
    if url is not None and not isinstance(url, str):
        errors.append("image.url 需要是字符串（http(s) / data: / 开头的路径）")
    elif isinstance(url, str) and url and not url.startswith(("http://", "https://", "data:", "/")):
        warnings.append("image.url 不是 http(s) / data: / 开头，OBS 里可能加载不出来")
    fit = w.get("fit", "cover")
    if fit not in ("cover", "contain", "fill"):
        errors.append(f"image.fit 只支持 cover / contain / fill（现在是 {fit!r}）")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- divider：分隔线原子件（横/竖，粗细与颜色可调） -----------------------------
# 横线长度走几何 w、粗细走 thickness；竖线长度走几何 h、粗细（宽）走 thickness。

def divider_height(w):
    if w.get("vertical"):
        return _int_in(w, "h", 40, 1, 2000)
    return _int_in(w, "thickness", 2, 1, 40)


def divider_validate(w, errors, warnings):
    th = w.get("thickness")
    if th is not None and (not isinstance(th, int) or isinstance(th, bool) or not 1 <= th <= 40):
        errors.append(f"divider.thickness 需要是 1~40 的整数（现在是 {th!r}）")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- badge：药丸徽章原子件（{路径} 插值同 text，底色走外观 bg） -----------------

def badge_height(w):
    return _line_h(_int_in(w, "size", 15, 8, 60)) + 8


def badge_validate(w, errors, warnings):
    if not isinstance(w.get("text"), str) or not w.get("text"):
        errors.append("badge 部件必须有非空的 text")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


WIDGETS = {
    "cards": {
        "label": "指标卡片", "icon": "layout-grid",
        "summary": "指标卡片网格：标题 + 进度条 + 次要行 + 迷你曲线",
        "defaults": {"cols": 4, "gap": 32, "item_height": 66},
        "style_schema": CARD_STYLE,
        "height": cards_height,
        "validate": cards_validate,
    },
    "chips": {
        "label": "小指标行", "icon": "rows-3",
        "summary": "底部小指标行：一行紧凑的 名称+值",
        "defaults": {"font": 15, "margin_top": 10, "fit": "shrink"},
        "style_schema": CHIPS_STYLE,
        "height": chips_height,
        "validate": chips_validate,
    },
    "text": {
        "label": "自定义文字", "icon": "type",
        "summary": "自定义文本行，正文用 {cpu.usage} 这类占位符插入指标值",
        "defaults": {"size": 19, "margin_top": 0},
        "style_schema": COMMON_STYLE,
        "height": text_height,
        "validate": text_validate,
    },
    "stat": {
        "label": "大数字", "icon": "hash",
        "summary": "自由画布：单指标大数字，可带名字",
        "defaults": {"size": 26},
        "style_schema": COMMON_STYLE,
        "height": stat_height,
        "validate": stat_validate,
    },
    "progress": {
        "label": "进度条", "icon": "equal",
        "summary": "自由画布：单指标进度条（按指标量程定标）",
        "defaults": {"w": 260, "height": 10},
        "style_schema": PROGRESS_STYLE,
        "height": progress_height,
        "validate": progress_validate,
    },
    "gauge": {
        "label": "圆环仪表", "icon": "circle-dashed",
        "summary": "环形仪表：单指标圆环，按指标量程定标，可带标签",
        "defaults": {"size": 120, "ring": 10},
        "style_schema": GAUGE_STYLE,
        "height": gauge_height,
        "validate": gauge_validate,
    },
    "html": {
        "label": "自定义 HTML", "icon": "code",
        "summary": "自由画布：自定义 HTML 片段，带 <script> 的动态片段走 HWOB API",
        "defaults": {"w": 300, "h": 60},
        "style_schema": COMMON_STYLE,
        "height": html_height,
        "validate": html_validate,
    },
    "spark": {
        "label": "迷你曲线", "icon": "activity",
        "summary": "自由画布：单指标迷你曲线（面积图，按窗口内峰值定标）",
        "defaults": {"w": 120, "h": 32, "samples": 30},
        "style_schema": SPARK_STYLE,
        "height": spark_height,
        "validate": spark_validate,
    },
    "bars": {
        "label": "柱状条", "icon": "chart-bar",
        "summary": "自由画布：单指标柱状直方图（卡片内嵌曲线的独立形态）",
        "defaults": {"w": 120, "h": 32, "samples": 30},
        "style_schema": COMMON_STYLE,
        "height": bars_height,
        "validate": bars_validate,
    },
    "value": {
        "label": "数值组", "icon": "sigma",
        "summary": "自由画布：一组数值（可带名字/分隔符）—— 卡片数字行与 chips 的原子形态",
        "defaults": {"size": 19},
        "style_schema": COMMON_STYLE,
        "height": value_height,
        "validate": value_validate,
    },
    "panel": {
        "label": "背景面板", "icon": "square",
        "summary": "自由画布：纯底色矩形，垫在其他部件后面，自己拼卡片",
        "defaults": {"w": 200, "h": 100},
        "style_schema": PANEL_STYLE,
        "height": panel_height,
        "validate": panel_validate,
    },
    "icon": {
        "label": "图标", "icon": "star",
        "summary": "内置线性图标（cpu/温度/电量/网速…），颜色随外观文字色",
        "defaults": {"name": "cpu", "size": 24},
        "style_schema": COMMON_STYLE,
        "props_schema": ICON_PROPS,
        "height": icon_height,
        "validate": icon_validate,
    },
    "image": {
        "label": "图片", "icon": "image",
        "summary": "URL 图片，cover / contain / fill 适应，圆角描边走外观",
        "defaults": {"w": 200, "h": 150},
        "style_schema": COMMON_STYLE,
        "props_schema": IMAGE_PROPS,
        "height": image_height,
        "validate": image_validate,
    },
    "divider": {
        "label": "分隔线", "icon": "minus",
        "summary": "横 / 竖分隔线，粗细与颜色可调（线条颜色走外观「次要」）",
        "defaults": {"w": 200},
        "style_schema": COMMON_STYLE,
        "props_schema": DIVIDER_PROPS,
        "height": divider_height,
        "validate": divider_validate,
    },
    "badge": {
        "label": "徽章", "icon": "tag",
        "summary": "药丸底文字，支持 {路径} 插值（底色/描边走外观底色）",
        "defaults": {"size": 15, "text": "{time}"},
        "style_schema": COMMON_STYLE,
        "props_schema": BADGE_PROPS,
        "height": badge_height,
        "validate": badge_validate,
    },
}


# 「添加部件」菜单的展示顺序（meta.order 用）；登记顺序本身不承载语义。
# 原子件排在前、成品件（cards/chips）与垫底的 panel 收尾。
MENU_ORDER = ["stat", "value", "progress", "gauge", "spark", "bars", "html", "icon",
              "image", "divider", "badge", "cards", "chips", "text", "panel"]


def get(wtype):
    return WIDGETS.get(wtype)


def refs_of(widget):
    """单个部件引用的输出路径。"""
    return refs.iter_refs(widget)
