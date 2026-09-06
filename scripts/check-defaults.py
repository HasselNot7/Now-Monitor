#!/usr/bin/env python3
"""默认值对账（只读）：同键必须同值，漂了就退出码 1。

对账三条：
1) web/overlay/widgets/xxx.js 的 `w.key ?? 兜底` 必须登记在 widgets.py 同部件的
   defaults 里且值相等 —— 兜底与编辑器初始值是同一含义的两份写法，不许各漂各的。
2) props_schema 里带 default 的键，若 defaults 也有同名键，两处值必须相等
   （divider thickness 的教训：defaults 漏键，全靠渲染端兜底和面板默认顶着，
   值没漂、结构漂了，正好是这个盲区）。
3) 校验器/高度口径的 _int_in(w, key, default, …) 第三参不做静态对账：它是另一层
   语义（旧字段缺失时的容错口径），AST 取参成本高且易误报，本期靠人工对口径。

豁免：chips 的 `w.fit || 'none'` 这类 `||` 兜底不在对账范围 —— 它与 defaults 的
fit='shrink' 是刻意的两层容错（旧版式无 fit 走 'none'，新部件初始 'shrink'，
校验器同口径），不是漂移；`??` 才是本脚本的对账口径。

只读，不改任何文件。加新部件/改默认值后跑一下，跑法见 README 开发引导：

    python scripts/check-defaults.py
"""

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY = ROOT / "hwobs" / "widgets.py"
WIDGETS_DIR = ROOT / "web" / "overlay" / "widgets"

# 工厂里的兜底写法：w.key ?? 123 / w.key ?? "xxx"（st.radius 这类 style 键不匹配 \bw\.）
JS_FALLBACK = re.compile(r"\bw\.(\w+)\s*\?\?\s*(\d+(?:\.\d+)?|'[^']*'|\"[^\"]*\")")


def parse_props(elts):
    """从 prop 字典列表提取 {key: default}（只认 key/default 两个字段，options 等忽略）。"""
    props = {}
    for item in elts:
        if not isinstance(item, ast.Dict):
            continue
        key, default, has_default = None, None, False
        for pk, pv in zip(item.keys, item.values):
            if isinstance(pk, ast.Constant):
                if pk.value == "key":
                    key = ast.literal_eval(pv)
                elif pk.value == "default":
                    has_default, default = True, ast.literal_eval(pv)
        if key is not None and has_default:
            props[key] = default
    return props


def props_tables(tree):
    """顶层 *_PROPS 常量表：{常量名: {key: default}}（注册表里按名引用）。"""
    out = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign) or not isinstance(node.value, ast.List):
            continue
        for t in node.targets:
            if isinstance(t, ast.Name) and t.id.endswith("_PROPS"):
                out[t.id] = parse_props(node.value.elts)
    return out


def registry_decl():
    """ast 解析 WIDGETS 字面量：{部件: {"defaults": {...}, "props_default": {键: 值}}}。"""
    tree = ast.parse(REGISTRY.read_text(encoding="utf-8"))
    tables = props_tables(tree)
    out = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not any(getattr(t, "id", None) == "WIDGETS" for t in node.targets):
            continue
        for k, v in zip(node.value.keys, node.value.values):
            if not isinstance(v, ast.Dict):
                continue
            entry = {}
            for dk, dv in zip(v.keys, v.values):
                if not isinstance(dk, ast.Constant):
                    continue
                if dk.value == "defaults":
                    entry["defaults"] = ast.literal_eval(dv)
                elif dk.value == "props_schema":
                    # props_schema 可能是内联 list，也可能引用顶层 *_PROPS 常量表
                    if isinstance(dv, ast.List):
                        entry["props_default"] = parse_props(dv.elts)
                    else:
                        entry["props_default"] = dict(tables.get(getattr(dv, "id", None), {}))
            if "defaults" in entry:
                out[ast.literal_eval(k)] = entry
    return out


def parse_js_literal(raw):
    if raw[:1] in ("'", '"'):
        return raw[1:-1]
    return float(raw) if "." in raw else int(raw)


def js_fallbacks():
    """扫各工厂：{部件: {键: 兜底值集合}}；同键出现多个不同兜底本身就是差异。"""
    out = {}
    for path in sorted(WIDGETS_DIR.glob("*.js")):
        found = {}
        for m in JS_FALLBACK.finditer(path.read_text(encoding="utf-8")):
            found.setdefault(m.group(1), set()).add(parse_js_literal(m.group(2)))
        out[path.stem] = found
    return out


def same(a, b):
    """数值跨 int/float 比较，字符串精确比较；其余类型不算一致。"""
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) \
            and not isinstance(a, bool) and not isinstance(b, bool):
        return float(a) == float(b)
    return type(a) is type(b) and a == b


def main():
    problems = []
    decl = registry_decl()
    fallbacks = js_fallbacks()
    js_checked = prop_checked = 0

    # 规则 1：JS 兜底 ↔ defaults
    for widget, keys in fallbacks.items():
        if widget not in decl:
            problems.append(f"{widget}.js：注册表 WIDGETS 里没有这个部件")
            continue
        for key, values in keys.items():
            if len(values) > 1:
                problems.append(
                    f"{widget}.js：w.{key} 兜底值在同文件里不唯一（{sorted(values)}）")
                continue
            value = next(iter(values))
            js_checked += 1
            if key not in decl[widget]["defaults"]:
                problems.append(
                    f"{widget}.js：w.{key} ?? {value!r} —— defaults 里没有这个键")
            elif not same(decl[widget]["defaults"][key], value):
                problems.append(
                    f"{widget}.js：w.{key} ?? {value!r} ≠ defaults "
                    f"{key}={decl[widget]['defaults'][key]!r}")

    # 规则 2：props_schema 的 default ↔ defaults（同键才比对）
    for widget, entry in decl.items():
        d = entry["defaults"]
        for key, pv in entry.get("props_default", {}).items():
            if key not in d:
                continue
            prop_checked += 1
            if not same(d[key], pv):
                problems.append(
                    f"{widget}：props_schema {key}.default={pv!r} ≠ "
                    f"defaults {key}={d[key]!r}")

    if problems:
        print(f"默认值对账：{len(problems)} 处不一致"
              f"（JS 兜底键 {js_checked} 个、props 同键 {prop_checked} 个）\n")
        for p in problems:
            print("  ✗ " + p)
        return 1
    print(f"默认值对账全绿：{len(fallbacks)} 个部件文件，JS 兜底键 {js_checked} 个、"
          f"props 同键 {prop_checked} 个，与 widgets.py defaults 一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())
