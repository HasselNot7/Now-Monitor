// --- image：URL 图片原子件（cover/contain/fill；没 URL 时画虚线占位） ---------
import { el, text } from '../core.js';

export function makeImage(w) {
  const host = el('div', 'free-image');
  if (w.url) {
    const img = document.createElement('img');
    img.src = w.url;
    img.alt = '';
    img.draggable = false;
    img.style.objectFit = ['cover', 'contain', 'fill'].includes(w.fit) ? w.fit : 'cover';
    host.appendChild(img);
  } else {
    host.appendChild(el('div', 'img-empty', [text('IMG')]));
  }
  document.body.appendChild(host);
  return { host, update() {} };
}
