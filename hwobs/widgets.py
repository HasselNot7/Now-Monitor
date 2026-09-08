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

# N2（D3-A）：orientation="v" 竖条长吃几何 h、粗吃几何 w —— 箱即条、所见即选框，
# 与 divider「横 w 竖 h」的长度惯例对齐；横条的 height 属性（条粗）竖向下不参与。
PROGRESS_PROPS = [
    {"key": "orientation", "label": "方向", "type": "select",
     "options": ["h", "v"], "default": "h"},
]


def progress_height(w):
    if w.get("orientation") == "v":
        return _int_in(w, "h", 40, 1, 2000)
    return _int_in(w, "height", 10, 4, 100)


def progress_validate(w, errors, warnings):
    _metric(w, errors, "progress")
    if w.get("orientation") not in (None, "h", "v"):
        errors.append(f"progress.orientation 只支持 h / v（现在是 {w.get('orientation')!r}）")
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
    _style_field("show_needle", "中心指针线（half 上半环仪表惯例）", "bool", default=False),
]

# N2（D6）：arc="half" = 上半环 180°，直播指针仪表惯例朝上；虚线 9 点钟顺时针扫到 3 点钟。
GAUGE_PROPS = [
    {"key": "arc", "label": "弧形", "type": "select",
     "options": ["full", "half"], "default": "full"},
]


def gauge_height(w):
    size = _int_in(w, "size", 120, 48, 600)
    h = size // 2 if w.get("arc") == "half" else size
    return h + (20 if w.get("label") else 0)


def gauge_validate(w, errors, warnings):
    _metric(w, errors, "gauge")
    if w.get("arc") not in (None, "full", "half"):
        errors.append(f"gauge.arc 只支持 full / half（现在是 {w.get('arc')!r}）")
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
    _style_field("show_peak", "右上角窗口峰值", "bool", default=False),
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


# --- light：状态灯（N3） -------------------------------------------------------
# 单指标三态圆点：常态 --bar-fill、告警 --bar-high（isHigh 判定）、缺数据壳 CSS
# .tmiss 灰点。颜色全在渲染端 CSS，这里零色键；blink 键位渲染端注释预留（D4-A）。

def light_height(w):
    s = _int_in(w, "size", 12, 6, 64)
    return max(s, _line_h(15)) if w.get("label") else s


def light_validate(w, errors, warnings):
    _metric(w, errors, "light")
    _style_check(COMMON_STYLE, w.get("style"), errors, warnings)


# --- dynicon：动态图标（P1） ---------------------------------------------------
# 一行映射 = 一个条件 + 一个图标，自上而下首个命中生效；全不命中走 default_icon，
# 缺数据走 miss_icon（没写就用 default_icon 加 .tmiss 压暗）。图标清单与 icon 件共用
# ICON_NAMES（渲染端 icon.js 的 ICON_PATHS 是同一份 path，dynicon 直接 import）。
#
# 阈值口径（P1 拍板）：比的是**显示口径**的值 —— 原始值 ÷ 注册表 divide，不四舍五入。
# 与 warn/isHigh（按原始值）刻意不同：warn 是注册表里的作者级字段，dynicon 的行是用户
# 在面板上手填的，他的参照物是画布上显示的那个数。内置 31 个指标里只有 cpu.clock_mhz
# 带 divide（kHz→GHz），按原始值判会让「≥ 3」这类阈值永远命中且毫无提示。
# 非有限数（含字符串、null）一律算缺数据，绝不强转 —— 否则 "" == 0 会误命中 zero 行。

MAPPING_OPS = [
    {"id": ">=", "label": "≥ 阈值（含）", "needs_value": True},
    {"id": "<=", "label": "≤ 阈值（含）", "needs_value": True},
    {"id": "zero", "label": "= 0（零）", "needs_value": False},
    {"id": "nonzero", "label": "≠ 0（非零）", "needs_value": False},
]

# >= 与 <= 都含等号，所以 x == 阈值同时满足两个方向 —— 归属由行的上下顺序决定
# （谁在上谁生效），这就是 label 里写「（含）」、且不提供 > / < 的原因。
DYNICON_STYLE = COMMON_STYLE + [
    _style_field("fade", "切换淡入（时长走 --anim-ms）", "bool", default=False),
]

# mapping 是「行为」不是「观感」，所以进 props_schema：_style_check 只认
# color/range/int/bool 四种值类型（放 style_schema 会被当未知键警告掉），
# 而 PropsEditor 按 props_schema 生成控件。mapping 字段刻意不写 default、
# defaults 里也刻意不放 mapping —— 空数组写进 overlay.json 没有意义，
# 渲染端对缺键的容错见 dynicon.js。
DYNICON_PROPS = [
    {"key": "metric", "label": "指标", "type": "metric"},
    {"key": "mapping", "label": "映射（自上而下，首个命中生效）", "type": "mapping",
     "ops": MAPPING_OPS, "icons": ICON_NAMES},
    {"key": "default_icon", "label": "兜底图标（全不命中）", "type": "icon",
     "options": ICON_NAMES, "default": "pulse"},
    {"key": "miss_icon", "label": "缺数据图标（留空 = 兜底压暗）", "type": "icon",
     "options": ICON_NAMES, "allow_empty": True},
    {"key": "size", "label": "大小 px", "type": "int", "min": 12, "max": 200, "default": 24},
]


def dynicon_height(w):
    return _int_in(w, "size", 24, 12, 200)


def _mapping_rows(rows, errors, warnings, at=""):
    """映射行列表的结构校验 —— P1 dynicon 首发，P2 table 的状态图标列复用（同一套
    4 算子语义，见 MAPPING_OPS 与 dynicon.js 的 firstHit）。`at` 只是消息前缀
    （dynicon 传空串，文案与 P1 逐字相同；table 传「第 N 行的状态列：」）。
    渲染端对坏行自己跳过（不抛错、不白屏），这里负责把配置问题说清楚。"""
    ops = {o["id"]: o for o in MAPPING_OPS}
    if not isinstance(rows, list):
        errors.append(f"{at}mapping 必须是数组（现在是 {rows!r}）")
        return
    for n, row in enumerate(rows, 1):
        if not isinstance(row, dict):
            errors.append(f"{at}第 {n} 行映射必须是对象（现在是 {row!r}）")
            continue
        op = row.get("op")
        if op not in ops:
            errors.append(f"{at}第 {n} 行映射的 op {op!r} 不认识（可选：{' / '.join(ops)}）")
        elif ops[op]["needs_value"]:
            v = row.get("value")
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                errors.append(f"{at}第 {n} 行映射（{op}）需要数值阈值（现在是 {v!r}）")
        icon = row.get("icon")
        if not isinstance(icon, str) or not icon:
            errors.append(f"{at}第 {n} 行映射缺 icon（命中了也没图画）")
        elif icon not in ICON_NAMES:
            warnings.append(f"{at}第 {n} 行映射的图标 {icon!r} 不在内置图标集，会回退 pulse")
        hi = row.get("high")
        if hi is not None and not isinstance(hi, bool):
            errors.append(f"{at}第 {n} 行映射 high 需要是 true / false（现在是 {hi!r}）")


def dynicon_validate(w, errors, warnings):
    _metric(w, errors, "dynicon")
    rows = w.get("mapping")
    if rows is None:
        warnings.append("没配映射行，图标恒等于兜底（不会随数值变）")
    else:
        if not rows:
            warnings.append("没配映射行，图标恒等于兜底（不会随数值变）")
        _mapping_rows(rows, errors, warnings)
    for key in ("default_icon", "miss_icon"):
        v = w.get(key)
        if v is None:
            continue
        if not isinstance(v, str) or not v:
            errors.append(f"{key} 需要是图标名（现在是 {v!r}）")
        elif v not in ICON_NAMES:
            warnings.append(f"{key} {v!r} 不在内置图标集，会回退 pulse")
    _style_check(DYNICON_STYLE, w.get("style"), errors, warnings)


# --- table：表格（P2） ---------------------------------------------------------
# 行 = items[] 一格数据，列 = 从固定 kind 枚举里选的有序子集（cols）。数据形状刻意
# 与 cards 同族：行数组叫 items、单元格容器用 value / bar / metric / mapping —— 这四个
# 键名都已在 refs 的白名单里（GROUP_KEYS / REF_KEYS），所以引用遍历零改动。
# 反过来说，把行数组改名成 rows、把单元格容器叫 cells 就会**静默丢引用**（AIDA64 裁剪
# 清单把在用的传感器清掉，OBS 里变成 -- 且零报错，e2e567e 型事故）——见
# docs/new-widget.md「v3 立项触发条件」。
#
# 列语义（五种，全部复用既有渲染件，不新造观感）：
#   label  行名（item.label）                → .metric-label（--label-color）
#   value  数值组（GroupDef，支持 F3 的 \n/前后空格契约）→ core.js group() + .metric-value
#   bar    定标条（item.bar 指标，量程取注册表 range）→ .progress-track/.progress-fill，
#          告警色走注册表 warn（与 progress 同源，契约 1）
#   light  三态圆点（item.metric）            → .free-light/.light-dot（状态灯同一份 CSS）
#   icon   条件图标（item.metric + item.mapping，4 算子同 dynicon）→ .free-dynicon 的
#          类名级联；与 dynicon 不同的是「全不命中 = 该格留空」——表格里空格合法
#          （dynicon 只有一个格子，必须有兜底图），要"总有图"就在 mapping 末尾加一条
#          nonzero / zero 兜底行。
#
# 表头文案在渲染端 KIND_LABELS（装饰性文案，与这里同值；不参与校验）。

TABLE_KINDS = [
    {"id": "label", "label": "名字"},
    {"id": "value", "label": "数值"},
    {"id": "bar", "label": "条"},
    {"id": "light", "label": "状态灯"},
    {"id": "icon", "label": "状态图标"},
]

# 表头行高：与 table.js 的 HEAD_H 同值（两处各带互指注释，同 ANIM_MS 的纪律）
TABLE_HEAD_H = 20

TABLE_STYLE = COMMON_STYLE + [
    _style_field("zebra", "斑马纹（隔行加深底）", "bool", default=False),
]

# cols 的 default 写**字面量**（不是常量名）：check-defaults 用 ast.literal_eval 读
# props_schema 的 default 与 defaults 对账，Name 节点会让它直接抛错；两处字面量必须
# 同值，脚本规则 2 把关。校验器不再抄第三份 —— 缺 cols 时现读 WIDGETS 的 defaults。
TABLE_PROPS = [
    {"key": "cols", "label": "列（点选追加到列尾 · ✕ 移除 · ↑↓ 调序）", "type": "multiselect",
     "choices": TABLE_KINDS, "default": ["label", "value", "bar"]},
    {"key": "head", "label": "表头行", "type": "bool", "default": True},
    {"key": "row_h", "label": "行高 px", "type": "int", "min": 16, "max": 80, "default": 26},
]


def table_height(w):
    rows = w.get("items")
    n = len(rows) if isinstance(rows, list) else 0
    return n * _int_in(w, "row_h", 26, 16, 80) + (TABLE_HEAD_H if w.get("head", True) else 0)


def table_validate(w, errors, warnings):
    items = w.get("items")
    if items is None or not isinstance(items, list):
        errors.append(f"table 的 items 必须是数组（行 = 一格数据，现在是 {items!r}）")
        items = []
    elif not items:
        errors.append("table 至少要有一行（items 是空数组就没有可画的）")
    keys = [r.get("key") for r in items if isinstance(r, dict)]
    dup = sorted({k for k in keys if keys.count(k) > 1})
    if dup:
        errors.append(f"行 key 重复：{', '.join(map(str, dup))}（渲染按 key 索引单元格，重复会互相覆盖）")

    rh = w.get("row_h", 26)
    if not isinstance(rh, int) or isinstance(rh, bool) or not 16 <= rh <= 80:
        errors.append(f"row_h 必须是 16~80 的整数（现在是 {rh!r}）")
    hd = w.get("head", True)
    if not isinstance(hd, bool):
        errors.append(f"head 需要是 true / false（现在是 {hd!r}）")
    kinds = [k["id"] for k in TABLE_KINDS]
    cols = w.get("cols")
    if cols is None:
        # 缺省列从注册表 defaults 现读，不抄第二份字面量
        cols = list(WIDGETS["table"]["defaults"]["cols"])
    elif not isinstance(cols, list):
        errors.append(f"cols 必须是数组（现在是 {cols!r}）")
        cols = []
    elif not cols:
        errors.append("cols 不能是空数组：一列都没有就没有可画的")
    else:
        bad = [c for c in cols if c not in kinds]
        if bad:
            warnings.append("cols 里不认识的列会被忽略：" + ", ".join(map(str, bad))
                            + f"（可选：{' / '.join(kinds)}）")
        cols = [c for c in cols if c in kinds]

    for n, row in enumerate(items, 1):
        if not isinstance(row, dict):
            errors.append(f"第 {n} 行必须是对象（现在是 {row!r}）")
            continue
        if not isinstance(row.get("key"), str) or not row.get("key"):
            errors.append(f"第 {n} 行缺 key（渲染按 key 索引单元格，没有就互相覆盖）")
        miss = []
        if "label" in cols and not isinstance(row.get("label"), str):
            miss.append("label（名字列）")
        if "value" in cols and not isinstance(row.get("value"), dict):
            miss.append("value（数值列）")
        if "bar" in cols and not isinstance(row.get("bar"), str):
            miss.append("bar（条列）")
        if "light" in cols and not isinstance(row.get("metric"), str):
            miss.append("metric（状态灯列）")
        if "icon" in cols:
            if not isinstance(row.get("metric"), str):
                miss.append("metric（状态图标列）")
            elif not row.get("mapping"):
                miss.append("mapping（状态图标列的映射行）")
            else:
                _mapping_rows(row["mapping"], errors, warnings, at=f"第 {n} 行的状态列：")
        if miss:
            warnings.append(f"第 {n} 行缺 {', '.join(miss)}，那一格会留空")
    _style_check(TABLE_STYLE, w.get("style"), errors, warnings)


# --- stackbar：堆叠条（N3） ----------------------------------------------------
# 长吃几何 w、粗吃 height 属性（与 progress 横条同口径）；metrics 组复用 GroupDef
# （refs.GROUP_KEYS 已含 "metrics"，引用遍历零新增）。段配色渲染端派生（D1-A）。

STACKBAR_STYLE = COMMON_STYLE + [
    _style_field("track", "轨道颜色", "color"),
    _style_field("radius", "圆角 px", "int", min=0, max=20, default=4),
]


def stackbar_height(w):
    return _int_in(w, "height", 12, 4, 100)


def stackbar_validate(w, errors, warnings):
    metrics = w.get("metrics")
    if not isinstance(metrics, dict) or not isinstance(metrics.get("metrics"), list) \
            or not metrics["metrics"]:
        errors.append("stackbar 部件必须有非空的 metrics 组（{metrics: [...]}）")
    else:
        # pair/diff 是组合值（无单值 metric），渲染端 dig 取不到 → 段宽按 0，只警告不拦
        odd = [i for i, m in enumerate(metrics["metrics"], 1)
               if isinstance(m, dict) and (m.get("pair") or m.get("diff"))]
        if odd:
            warnings.append(f"stackbar 第 {', '.join(map(str, odd))} 项是 pair/diff 组合值，"
                            "取不到单值，段宽会按 0 处理（建议换单指标）")
    _style_check(STACKBAR_STYLE, w.get("style"), errors, warnings)


WIDGETS = {
    "cards": {
        "label": "指标卡片", "icon": "layout-grid",
        "summary": "指标卡片网格：标题 + 进度条 + 次要行 + 迷你曲线",
        "category": "classic",
        "defaults": {"cols": 4, "gap": 32, "item_height": 66},
        "style_schema": CARD_STYLE,
        "height": cards_height,
        "validate": cards_validate,
    },
    "chips": {
        "label": "小指标行", "icon": "rows-3",
        "summary": "底部小指标行：一行紧凑的 名称+值",
        "category": "classic",
        "defaults": {"font": 15, "margin_top": 10, "fit": "shrink"},
        "style_schema": CHIPS_STYLE,
        "height": chips_height,
        "validate": chips_validate,
    },
    "text": {
        "label": "自定义文字", "icon": "type",
        "summary": "自定义文本行，正文用 {cpu.usage} 这类占位符插入指标值",
        "category": "data",
        "defaults": {"size": 19, "margin_top": 0},
        "style_schema": COMMON_STYLE,
        "height": text_height,
        "validate": text_validate,
    },
    "stat": {
        "label": "大数字", "icon": "hash",
        "summary": "自由画布：单指标大数字，可带名字",
        "category": "data",
        "defaults": {"size": 26},
        "style_schema": COMMON_STYLE,
        "height": stat_height,
        "validate": stat_validate,
    },
    "progress": {
        "label": "进度条", "icon": "equal",
        "summary": "自由画布：单指标进度条（按指标量程定标，可横可竖）",
        "category": "chart",
        "defaults": {"w": 260, "height": 10, "orientation": "h"},
        "style_schema": PROGRESS_STYLE,
        "props_schema": PROGRESS_PROPS,
        "height": progress_height,
        "validate": progress_validate,
    },
    "gauge": {
        "label": "圆环仪表", "icon": "circle-dashed",
        "summary": "环形仪表：单指标圆环，按指标量程定标，可带标签",
        "category": "chart",
        "defaults": {"size": 120, "ring": 10, "arc": "full"},
        "style_schema": GAUGE_STYLE,
        "props_schema": GAUGE_PROPS,
        "height": gauge_height,
        "validate": gauge_validate,
    },
    "html": {
        "label": "自定义 HTML", "icon": "code",
        "summary": "自由画布：自定义 HTML 片段，带 <script> 的动态片段走 HWOB API",
        "category": "advanced",
        "defaults": {"w": 300, "h": 60},
        "style_schema": COMMON_STYLE,
        "height": html_height,
        "validate": html_validate,
    },
    "spark": {
        "label": "迷你曲线", "icon": "activity",
        "summary": "自由画布：单指标迷你曲线（面积图，按窗口内峰值定标）",
        "category": "chart",
        "defaults": {"w": 120, "h": 32, "samples": 30},
        "style_schema": SPARK_STYLE,
        "height": spark_height,
        "validate": spark_validate,
    },
    "bars": {
        "label": "柱状条", "icon": "chart-bar",
        "summary": "自由画布：单指标柱状直方图（卡片内嵌曲线的独立形态）",
        "category": "chart",
        "defaults": {"w": 120, "h": 32, "samples": 30},
        "style_schema": COMMON_STYLE,
        "height": bars_height,
        "validate": bars_validate,
    },
    "stackbar": {
        "label": "堆叠条", "icon": "align-justify",
        "summary": "自由画布：一组指标按值占比横排分段（缺数段按 0，全缺整条置灰）",
        "category": "chart",
        "defaults": {"w": 260, "height": 12},
        "style_schema": STACKBAR_STYLE,
        "height": stackbar_height,
        "validate": stackbar_validate,
    },
    "value": {
        "label": "数值组", "icon": "sigma",
        "summary": "自由画布：一组数值（可带名字/分隔符）—— 卡片数字行与 chips 的原子形态",
        "category": "data",
        "defaults": {"size": 19},
        "style_schema": COMMON_STYLE,
        "height": value_height,
        "validate": value_validate,
    },
    "panel": {
        "label": "背景面板", "icon": "square",
        "summary": "自由画布：纯底色矩形，垫在其他部件后面，自己拼卡片",
        "category": "layout",
        "defaults": {"w": 200, "h": 100},
        "style_schema": PANEL_STYLE,
        "height": panel_height,
        "validate": panel_validate,
    },
    "icon": {
        "label": "图标", "icon": "star",
        "summary": "内置线性图标（cpu/温度/电量/网速…），颜色随外观文字色",
        "category": "layout",
        "defaults": {"name": "cpu", "size": 24},
        "style_schema": COMMON_STYLE,
        "props_schema": ICON_PROPS,
        "height": icon_height,
        "validate": icon_validate,
    },
    "image": {
        "label": "图片", "icon": "image",
        "summary": "URL 图片，cover / contain / fill 适应，圆角描边走外观",
        "category": "layout",
        "defaults": {"w": 200, "h": 150},
        "style_schema": COMMON_STYLE,
        "props_schema": IMAGE_PROPS,
        "height": image_height,
        "validate": image_validate,
    },
    "divider": {
        "label": "分隔线", "icon": "minus",
        "summary": "横 / 竖分隔线，粗细与颜色可调（线条颜色走外观「次要」）",
        "category": "layout",
        "defaults": {"w": 200, "thickness": 2},
        "style_schema": COMMON_STYLE,
        "props_schema": DIVIDER_PROPS,
        "height": divider_height,
        "validate": divider_validate,
    },
    "badge": {
        "label": "徽章", "icon": "tag",
        "summary": "药丸底文字，支持 {路径} 插值（底色/描边走外观底色）",
        "category": "data",
        "defaults": {"size": 15, "text": "{time}"},
        "style_schema": COMMON_STYLE,
        "props_schema": BADGE_PROPS,
        "height": badge_height,
        "validate": badge_validate,
    },
    "light": {
        "label": "状态灯", "icon": "lightbulb",
        "summary": "状态灯：单指标正常/告警/缺数据三色圆点，可带名字",
        "category": "data",
        "defaults": {"size": 12},
        "style_schema": COMMON_STYLE,
        "height": light_height,
        "validate": light_validate,
    },
    "dynicon": {
        "label": "动态图标", "icon": "toggle-right",
        "summary": "动态图标：按数值切图标（映射行自上而下首个命中生效），可配兜底与缺数据图标",
        "category": "data",
        "defaults": {"size": 24, "default_icon": "pulse"},
        "style_schema": DYNICON_STYLE,
        "props_schema": DYNICON_PROPS,
        "height": dynicon_height,
        "validate": dynicon_validate,
    },
    "table": {
        "label": "表格", "icon": "table",
        "summary": "表格：行=指标（名字/数值/条/状态灯/条件图标五种列任选并排序），列跨行对齐",
        "category": "data",
        "defaults": {"cols": ["label", "value", "bar"], "head": True, "row_h": 26},
        "style_schema": TABLE_STYLE,
        "props_schema": TABLE_PROPS,
        "height": table_height,
        "validate": table_validate,
    },
}


# 「添加部件」菜单：节顺序与节名在 CATEGORIES（SSOT），归节看各登记的 category；
# MENU_ORDER 只决定同一节内谁先谁后（组内排序），登记顺序本身不承载语义。
MENU_ORDER = ["stat", "value", "progress", "gauge", "spark", "bars", "stackbar", "html", "icon",
              "image", "divider", "badge", "light", "dynicon", "table", "cards", "chips", "text",
              "panel"]

CATEGORIES = [
    ("data", "数据"), ("chart", "图表"), ("layout", "布局"),
    ("classic", "经典（旧）"), ("advanced", "高级"),
]


def get(wtype):
    return WIDGETS.get(wtype)


def refs_of(widget):
    """单个部件引用的输出路径。"""
    return refs.iter_refs(widget)
