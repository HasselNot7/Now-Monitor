// type 字符串 -> 部件工厂。与 hwobs/widgets.py 的注册表以 type 为契约：
// 那边登记默认几何与校验，这边负责渲染；两边都不允许出现第三份遍历。
// 新增部件 = 在 widgets.py 登记 + 在这里加一个工厂 import，两处即可。

import { makeCards } from './widgets/cards.js';
import { makeChips } from './widgets/chips.js';
import { makeText } from './widgets/text.js';
import { makeStat } from './widgets/stat.js';
import { makeProgress } from './widgets/progress.js';
import { makeHtml } from './widgets/html.js';
import { makeGauge } from './widgets/gauge.js';
import { makeSpark } from './widgets/spark.js';
import { makeBars } from './widgets/bars.js';
import { makePanel } from './widgets/panel.js';
import { makeValue } from './widgets/value.js';
import { makeIcon } from './widgets/icon.js';
import { makeImage } from './widgets/image.js';
import { makeDivider } from './widgets/divider.js';
import { makeBadge } from './widgets/badge.js';
import { makeLight } from './widgets/light.js';
import { makeStackbar } from './widgets/stackbar.js';

export const WIDGET_TYPES = {
  cards: makeCards, chips: makeChips, text: makeText,
  stat: makeStat, progress: makeProgress, html: makeHtml,
  gauge: makeGauge, spark: makeSpark, panel: makePanel, value: makeValue,
  icon: makeIcon, image: makeImage, divider: makeDivider, badge: makeBadge,
  bars: makeBars, light: makeLight, stackbar: makeStackbar,
};
