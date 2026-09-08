# 新增部件契约

加一种显示部件 = 下面五处，一处都不能少。改完跑两条自查（见文末）。

## 一、五处清单

### 1. `hwobs/widgets.py` 登记（单一来源）

`WIDGETS`（`hwobs/widgets.py:485`）里加一项，照 `"divider"`（`hwobs/widgets.py:616`）的样子：

- `label` / `icon` / `summary`：管理页展示；
- `category`（N1 起必填）：菜单归节，取值 `data` / `chart` / `layout` / `classic` / `advanced`；
  节顺序与节名在 `CATEGORIES`（`hwobs/widgets.py:653`）。meta 端点按 `v["category"]` 严格取，
  漏登记会把 `/api/widgets/meta` 整个顶穿（编辑器退化成无分节兜底菜单）；
- `defaults`：编辑器「添加部件」的初始值。**必须与工厂里的 `w.key ?? 兜底` 同键同值**，
  `python scripts/check-defaults.py` 把关（含 props_schema default 与 defaults 的同键对账；
  chips `fit` 的 `|| 'none'` 是刻意的两层容错，脚本已豁免，见脚本 docstring）；
- `height()`：校验器按配置算占高，别从 CSS 手抄；
- `validate()`：部件自己的结构检查，`layout.check` 只做遍历和全局检查；
- `style_schema`：外观控件据此自动生成（通用键见 `COMMON_STYLE`，`hwobs/widgets.py:44`），
  渲染端由 `applyStyle` 消费，工厂不用自己解析通用键；
- 字段型部件（下拉/数字/开关）再加 `props_schema`，编辑器属性面板自动生成
  （参照 `DIVIDER_PROPS`，`hwobs/widgets.py:371`）。

**PropField 类型表（P1 起七种；SSOT = 后端 `props_schema` 的 `type`，编辑器 `PropsEditor`
据此生成控件）**。前四种是标量行（标签左、控件右），后三种是整块控件（自带标签在上）。
**这是新契约**：加部件优先扩这张表，别再手写 Inspector（P2 表格部件就走 `mapping` 这条路）。

| type | 控件 | 值域 | 用到的扩展键 |
|---|---|---|---|
| `text` | 单行输入 | string | `default`（占位） |
| `int` | 数字输入（钳制到区间） | int | `min` `max` `default` |
| `bool` | 开关 | true / false | `default` |
| `select` | 原生下拉（原样显示选项） | `options` 之一 | `options` `default` |
| `metric` | 指标下拉（复用 `MetricSelect`：名字主文本 + 路径弱化成小号灰字） | 注册表输出路径 | — |
| `icon` | 内置图标下拉（名字 + 中文注；不做形状预览 —— 画布 iframe 就是预览，复制 path 进前端等于给图标清单开第三个副本） | `options`（= `ICON_NAMES`） | `options` `default` `allow_empty` |
| `mapping` | 映射行列表：条件下拉 + 阈值 + 图标 + 告警色，加行 / 删行 / ↑↓ 排序 | `{op, value?, icon, high?}[]` | `ops` `icons` |

扩展键语义：`ops` = mapping 的可选算子（`{id, label, needs_value}`；`needs_value=false`
的算子不填阈值，编辑器收起阈值框**并删掉 `value` 键**）；`icons` = mapping 行里可选的图标名。
两个键的值都由后端下发（`MAPPING_OPS` / `ICON_NAMES`），编辑器不写死任何一份清单。
`mapping` 清空 = 删键，与标量控件的「清空 = 删键回默认」同口径；行编辑一律「原地改 +
`onChange()`」，撤销交给 `EditorPage` 的 B2 影子合并（面板编辑 500ms 内并成一步），
控件自己绝不 `pushHistory`。
- 同步 `MENU_ORDER`（`hwobs/widgets.py:650`）——它只管**组内排序**：节间顺序在
  `CATEGORIES`，归节看各件的 `category`，三者别混。
- **编辑器 height 镜像**：模板缩略图的 `estH`（`frontend/src/pages/editors.tsx:1164`）
  按 type 复算占高，新件加 case、改高度口径同步改。同族镜像还有两处，改几何/缩放
  口径时一起看：画布缩放落盘（EditorPage 的 resize commit——progress 按方向写
  `w.h` / `height`，N2 实测抓出的旧口径 bug）与属性面板几何字段（竖条显示几何 高）。

### 2. `web/overlay/widgets/xxx.js` 工厂

一个文件一个部件，公共设施从 `../core.js` import：

- **必须 `return { host, update }`**：host 是部件根节点（build 据此打样式/定位/data-wi），
  `update()` 每秒重绘；**没有每秒数据的部件也要 `return { host, update() {} }`**；
- 工厂自己把 host `appendChild` 到 body 末尾（顺序语义，build 不再反抓）；
- 采样一律走 `core.js` 的 `sample()` / `tail()`（`web/overlay/core.js:46` / `:57`）——
  一帧每路径只补一个采样由它保证，不许自建缓冲；
- 文本插值走 `compileParts` / `partsToNodes`，缺数据的值直接是 `--`（tmiss 态），
  别自己写占位逻辑；
- 最小范例：`web/overlay/widgets/divider.js`（11 行）。

### 3. `web/overlay/registry.js` 挂表

一行 import + `WIDGET_TYPES` 一项（`web/overlay/registry.js` 全文 27 行）。

### 4. 新引用键必须同步 `hwobs/refs.py`

`REF_KEYS` / `GROUP_KEYS`（`hwobs/refs.py:12-13`）是版式引用路径的唯一遍历
（`hwobs/refs.py` 文件头有完整说明）。部件引入**新的引用键**（除 metric/bar/spark、
metrics/pair/diff/items/value/sub 之外的键）必须同步进这两个元组，否则 AIDA64 导出
清单裁剪时会把在用传感器**静默清掉**——历史事故 e2e567e，就是三份手写遍历各差一点造成的。

### 5. 进 `docs/gallery.overlay.json`

部件画廊（`docs/gallery.overlay.json`，全部件各一展位）是观感回归的肉眼基线：新部件摆进去，
改任何渲染/样式代码后导入过一遍。用法：编辑器「模板」弹窗支持导入文件
（认 `{name,desc,config}` 封装，也认裸版式 JSON —— `frontend/src/pages/editors.tsx:1211`），
把这份 JSON 导入即可；导入后 `POST /api/layout-check` 应零 error。

## 二、观感契约（四条，全为"结构上不可能漏"而设）

1. **数值条动画/告警色走共享基础类**：进度条复用卡片的
   `.progress-track` / `.progress-fill`（并轨见 `web/monitor.html:103`），告警色 =
   `.free-progress.high .progress-fill`（`web/monitor.html:105`）+ `isHigh()` 判定——
   T1 并轨后动画与告警色是结构免费，不许给部件自写第二份 fill 样式；
2. **canvas 类部件必须过 `core.js` 的 `makeTween`**（`web/overlay/core.js:72`）：
   旧显示值 → 新采样数组缓动，rAF 节流 ≤25fps、窗口外停表、preview 重建由
   `shownSeeds`（`web/overlay/core.js:66`）续接——禁止自行起 rAF 循环；
3. **缺数据用 `.tmiss`**（壳 CSS 已有，如 `web/monitor.html:181`），禁止自造
   第四种状态色（灰 = 缺数据，黄 = 名字，绿 = 正常值，红 = 告警，四种已满）；
4. **动画时长只准从单点读**：CSS 侧 `--anim-ms`（`web/monitor.html:33`）、
   JS 侧 `ANIM_MS`（`web/overlay/core.js:61`），两处同值各带互指注释——
   工厂与 CSS 内写死毫秒数一律不许。

## 三、数据源事实（以代码为准，勿凭直觉）

- `cpu.usage` / `ram.pct` / `gpu.*` / `misc.dimm*` 等**绑 AIDA64 传感器**
  （注册表 `sources.aida64` 字段，如 `hwobs/registry/metrics.json:80` 的 ram_pct）；
  真正的 winapi 直供池只有 `ram.used` / `ram.total` 与 `net.up_mbps` / `net.down_mbps` /
  `net.wifi_dbm` / `net.link_mbps`，disk 无指标（`hw.json` 的 `disk` 键是空数组）。
- gallery（`docs/gallery.overlay.json`）因此**断 AIDA64 时整体退化为 tmiss / `--`
  属预期**，不是回归；它面向"AIDA 在跑"的日常观感基线。
- tmiss 演示位引用的 `misc.mobo_temp` 依赖"本机 AIDA 未导出 TMOBO 传感器"；
  **他机可能出值，非契约**——他机上该徽章显示正常值也算对。

## 四、告警色复现（gallery 的 progress 告警位）

告警阈值在注册表（`canvas`/版式**不能**覆写 warn）。gallery 告警位 =
`progress · ram.pct`（`>=90`，平时不亮——股内无稳定越限的指标，T4 决策记录）。
复现截图三步：

1. 临时把 `hwobs/registry/metrics.json` 里 ram_pct 的 `warn` 改成 `{"op": ">=", "value": 40}`
   （现值 ~42%，必亮红）；
2. 刷新叠加层/编辑器页（boot 重新拉 `/metrics.json`），progress 告警色可见，截图；
3. **还原阈值**，再刷新确认不亮。

## 五、决策与记档（N2–N3）

拍板结论落在这里，改相关代码先读这节。

- **D1-A stackbar 配色**：种子 = `--bar-fill` 解析色相（外观 accent 覆盖会跟随），
  第 i 段 hue + i×137.5°（黄金角），S 40% / L 62% 固定柔和度；种子非六位 hex 或
  无彩度时回退 Nord 六色循环。段色延迟到首次 update 再算——build 在工厂之后才
  applyStyle，工厂里早算拿到的是覆盖前的变量值（8 段实测两两最小色相差 24°）。
- **D2-A gauge 指针**：中心指针线（SVG line，文字色，长 0.72r，圆帽），CSS
  transform rotate 过渡（transformOrigin 定圆心），与 dashoffset 同走 `--anim-ms`。
- **D3-A 竖条几何**：`progress` orientation="v" 长吃几何 h、粗吃几何 w（箱即条，
  所见即选框）；横条维持「长=几何 w、粗=height 属性」旧口径。编辑器三处随方向
  分叉：缩放落盘（EditorPage 的 resize commit：竖条 n/s 写 `w.h`，横条写 `height`）、
  属性面板几何字段（竖条显示几何 高）、模板缩略图 estH。
- **D4-A 死旋钮不留**：light 的 `style.blink` 只在工厂注释预留键位，不进
  style_schema；StackbarEditor 不开 allowLabel（段不渲染名字，label 是死旋钮）。
- **D5-A chips 拆解**：`explodeChips`（编辑器侧）把整行换成单个 value 原子件，
  宽必须取 rects 实宽；软着陆横幅批量拆解一次 pushHistory（倒序遍历防下标漂移），
  explodeCards 的 gid 带随机后缀（同毫秒连拆不撞组）。
- **D6 gauge half = 上半环 180°**：9 点钟顺时针扫到 3 点钟，svg 下缘自然裁掉
  下半；轨道吃同一段弧；`--gauge-size` 减半让数值居上半区。
- **stackbar pair/diff**：组内 pair/diff 条目取不到单值，段宽按 0——校验器只
  warning 不拦（N3 review）。
- **记档不修（N2 review）**：① spark 峰值标注读 target；② gauge half 奇数 size
  时校验器 `size//2` 与渲染 `size/2` 差 0.5px。

## 六、自查两条

```
python scripts/check-defaults.py     # 全绿
python -m hwobs                      # 导 gallery → layout-check 零 error → 全部件肉眼过一遍
```
