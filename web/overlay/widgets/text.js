// --- text：自定义文本行，{输出路径} 占位符插值 ------------------------------
import { el, compileParts, partsToNodes } from '../core.js';

export function makeText(w) {
  const line = el('div', 'text-line');
  line.style.fontSize = (w.size ?? 19) + 'px';
  line.style.marginTop = (w.margin_top ?? 0) + 'px';
  document.body.appendChild(line);
  // 配置里就算混进了 HTML 也不会被执行（值走文本节点拼装）
  const parts = compileParts(w.text);
  return {
    host: line,
    update() {
      line.replaceChildren(...partsToNodes(parts));
    }
  };
}
