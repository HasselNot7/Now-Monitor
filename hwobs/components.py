"""自定义组件库：用户把画布上的一组部件存成可复用的积木（Phase 14）。

- 存储：overlays/user_components.json（可写数据目录，与用户模板同一套规矩，
  升级换包不丢）。
- 条目：{id, name, widgets}——widgets 是相对坐标（选中集包围盒左上角归一到
  0,0）的部件数组，自带 group 嵌套标签与样式；插入时原样复制一份再重排组标签，
  不做 Instance/Variant（spec 三十一 第一阶段：Save Group as Component 即可）。
- 校验从简：插入的东西要过版式校验，在编辑器 onChange 的 layout-check 里天然
  会跑；这里只把好"名字 + 非空数组"的门。
"""

import json
import time

from . import paths

FILE = paths.overlay_path("user_components")


def _read():
    if not FILE.is_file():
        return []
    data = json.loads(FILE.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("components"), list):
        return []
    return [c for c in data["components"] if isinstance(c, dict)]


def _write(components):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps({"components": components}, ensure_ascii=False, indent=2) + "\n",
                   encoding="utf-8")
    tmp.replace(FILE)


def list_all():
    """任何一边文件坏了都不炸端点，返回能读到的部分。"""
    try:
        return _read()
    except Exception:      # noqa: BLE001
        return []


def add(spec):
    """存一份自定义组件。返回 (条目, 错误)；错误时条目为 None。"""
    spec = spec if isinstance(spec, dict) else {}
    name = str(spec.get("name") or "").strip()[:40]
    widgets = spec.get("widgets")
    if not name:
        return None, "组件要有名字"
    if not isinstance(widgets, list) or not widgets:
        return None, "组件至少要有一个部件"
    entry = {"id": f"c-{time.time_ns()}", "name": name, "widgets": widgets}
    try:
        items = _read()
    except Exception:      # noqa: BLE001 用户文件坏了不能连累保存，重置为空再写
        items = []
    items.append(entry)
    _write(items)
    return entry, None


def remove(component_id):
    """返回是否删掉了。"""
    try:
        items = _read()
    except Exception:      # noqa: BLE001
        return False
    kept = [c for c in items if c.get("id") != component_id]
    if len(kept) == len(items):
        return False
    _write(kept)
    return True
