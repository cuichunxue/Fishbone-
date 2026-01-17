/**
 * 石川ダイアグラム（特性要因図）v6.0
 * 正しい魚骨形状 - 中骨は大骨の上下に交互配置
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.data = null;
    this.viewBox = { x: 0, y: 0, width: 1400, height: 800 };
    this.zoomLevel = 1;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.dragging = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  render(data) {
    this.data = data;
    const n = data.categories.length;

    // キャンバスサイズ
    const width = Math.max(1400, 1100 + n * 100);
    const height = 800;

    this.viewBox = { x: 0, y: 0, width, height };
    this.initSVG(width, height);

    const spineY = height / 2;
    const spineStart = 80;
    const spineEnd = width - 130;
    const spineLen = spineEnd - spineStart;

    // 背骨
    this.drawLine(spineStart, spineY, spineEnd, spineY, 5, '#1a252f');
    this.drawArrow(spineEnd, spineY, 0, 16, '#1a252f');

    // 効果ボックス
    this.drawEffectBox(spineEnd + 15, spineY, height, data.effect);

    // カテゴリーを上下に分ける
    const topCats = [];
    const botCats = [];
    data.categories.forEach((cat, i) => {
      if (i % 2 === 0) topCats.push(cat);
      else botCats.push(cat);
    });

    // 上側カテゴリー
    const topSpacing = spineLen / (topCats.length + 1);
    topCats.forEach((cat, i) => {
      const x = spineStart + topSpacing * (i + 1);
      this.drawCategory(cat, x, spineY, true, topSpacing, height);
    });

    // 下側カテゴリー
    const botSpacing = spineLen / (botCats.length + 1);
    botCats.forEach((cat, i) => {
      const x = spineStart + botSpacing * (i + 1);
      this.drawCategory(cat, x, spineY, false, botSpacing, height);
    });

    this.setupEvents();
  }

  drawCategory(cat, spineX, spineY, isTop, spacing, height) {
    const angle = 55 * Math.PI / 180;
    const dir = isTop ? -1 : 1;

    // 利用可能な垂直スペース
    const vertSpace = (height / 2) - 80;

    // 大骨の長さ
    const boneLen = Math.min(vertSpace / Math.sin(angle) * 0.75, spacing * 0.55, 220);

    // 大骨の終点
    const endX = spineX - boneLen * Math.cos(angle);
    const endY = spineY + dir * boneLen * Math.sin(angle);

    // 大骨を描画
    this.drawLine(spineX, spineY, endX, endY, 3, '#2c3e50');
    this.drawArrow(spineX, spineY, Math.atan2(spineY - endY, spineX - endX) * 180 / Math.PI, 11, '#2c3e50');

    // カテゴリーボックス
    const g = this.group();
    const tw = this.textWidth(cat.name, 13);
    const bw = tw + 18, bh = 26;
    g.appendChild(this.rect(endX - bw / 2, endY - bh / 2, bw, bh, '#2980b9', 5));
    g.appendChild(this.text(endX, endY, cat.name, 13, 'bold', '#fff'));
    this.makeDraggable(g);
    this.mainGroup.appendChild(g);

    // 中骨を描画
    this.drawCauses(cat.causes, spineX, spineY, endX, endY, isTop, boneLen);
  }

  drawCauses(causes, spineX, spineY, endX, endY, isTop, majorLen) {
    const n = causes.length;
    if (n === 0) return;

    // 大骨のベクトル
    const dx = endX - spineX;
    const dy = endY - spineY;
    const len = Math.sqrt(dx * dx + dy * dy);

    // 中骨の長さ（大骨の長さに比例、でも短めに）
    const causeLen = Math.min(majorLen * 0.35, 75);

    causes.forEach((cause, i) => {
      // 大骨上の位置（先端側を避ける）
      const t = 0.15 + 0.7 * (i / Math.max(n - 1, 1));
      const attachX = spineX + dx * t;
      const attachY = spineY + dy * t;

      // 中骨の方向：大骨の上下に交互配置
      // 上側カテゴリーの場合、奇数番は大骨の上側、偶数番は下側
      const side = (i % 2 === 0) ? 1 : -1;

      // 大骨に垂直な方向を計算
      const perpX = -dy / len;
      const perpY = dx / len;

      // 中骨の先端
      const causeEndX = attachX + perpX * causeLen * side;
      const causeEndY = attachY + perpY * causeLen * side;

      // 中骨を描画
      this.drawLine(attachX, attachY, causeEndX, causeEndY, 2, '#5d6d7e');
      this.drawArrow(attachX, attachY, Math.atan2(attachY - causeEndY, attachX - causeEndX) * 180 / Math.PI, 7, '#5d6d7e');

      // ラベル
      const labelG = this.group();
      const labelOffsetY = side * (isTop ? -1 : 1) > 0 ? -10 : 14;
      labelG.appendChild(this.text(causeEndX, causeEndY + labelOffsetY, cause.name, 11, '600', '#2c3e50'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 小骨
      this.drawSubcauses(cause.subcauses, attachX, attachY, causeEndX, causeEndY, side, i);
    });
  }

  drawSubcauses(subcauses, startX, startY, endX, endY, parentSide, causeIdx) {
    const n = subcauses.length;
    if (n === 0) return;

    // 中骨のベクトル
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);

    // 小骨の長さ
    const subLen = Math.min(len * 0.5, 40);

    // 小骨の角度（中骨に対して55度）
    const subAngle = 55 * Math.PI / 180;

    subcauses.forEach((sub, i) => {
      // 中骨上の位置
      const t = (i + 1) / (n + 1);
      const attachX = startX + dx * t;
      const attachY = startY + dy * t;

      // 交互に上下
      const side = ((i + causeIdx) % 2 === 0) ? 1 : -1;

      // 小骨の方向（中骨に対して斜め）
      const ux = dx / len;
      const uy = dy / len;
      const cos = Math.cos(subAngle * side);
      const sin = Math.sin(subAngle * side);
      const subDirX = ux * cos - uy * sin;
      const subDirY = ux * sin + uy * cos;

      const subEndX = attachX + subDirX * subLen;
      const subEndY = attachY + subDirY * subLen;

      // 小骨を描画
      this.drawLine(attachX, attachY, subEndX, subEndY, 1.3, '#7f8c8d');
      this.drawArrow(attachX, attachY, Math.atan2(attachY - subEndY, attachX - subEndX) * 180 / Math.PI, 5, '#7f8c8d');

      // ラベル
      const labelG = this.group();
      const labelY = subEndY + (side > 0 ? -8 : 12);
      labelG.appendChild(this.text(subEndX, labelY, sub.name, 9, 'normal', '#34495e'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 孫骨
      this.drawDetails(sub.details, attachX, attachY, subEndX, subEndY, i);
    });
  }

  drawDetails(details, startX, startY, endX, endY, subIdx) {
    const n = details.length;
    if (n === 0) return;

    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);

    const detLen = 25;

    // 垂直方向
    const perpX = -dy / len;
    const perpY = dx / len;

    details.forEach((det, i) => {
      const t = (i + 1) / (n + 1);
      const attachX = startX + dx * t;
      const attachY = startY + dy * t;

      const side = ((i + subIdx) % 2 === 0) ? 1 : -1;

      const detEndX = attachX + perpX * detLen * side;
      const detEndY = attachY + perpY * detLen * side;

      this.drawLine(attachX, attachY, detEndX, detEndY, 0.8, '#95a5a6');

      const labelG = this.group();
      const labelY = detEndY + (side > 0 ? -6 : 10);
      labelG.appendChild(this.text(detEndX, labelY, det, 8, 'normal', '#666'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);
    });
  }

  drawEffectBox(x, spineY, height, text) {
    const boxW = 65;
    const boxH = Math.min(height * 0.5, 380);
    const boxY = spineY - boxH / 2;

    const g = this.group();
    g.appendChild(this.rect(x, boxY, boxW, boxH, '#c0392b', 6));

    const fontSize = 16;
    const lineH = fontSize + 4;
    const maxChars = Math.floor((boxH - 40) / lineH);

    text.split('').slice(0, maxChars).forEach((c, i) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + boxW / 2);
      t.setAttribute('y', boxY + 28 + i * lineH);
      t.setAttribute('font-size', fontSize);
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('fill', 'white');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = c;
      g.appendChild(t);
    });

    this.makeDraggable(g);
    this.mainGroup.appendChild(g);
  }

  // === SVG基本 ===

  initSVG(w, h) {
    this.container.innerHTML = '';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.background = '#fff';
    this.svg.style.touchAction = 'none';

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = '<filter id="sh"><feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.15"/></filter>';
    this.svg.appendChild(defs);

    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);
    this.container.appendChild(this.svg);
  }

  group() { return document.createElementNS('http://www.w3.org/2000/svg', 'g'); }

  drawLine(x1, y1, x2, y2, sw, color) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', sw);
    l.setAttribute('stroke-linecap', 'round');
    this.mainGroup.appendChild(l);
  }

  rect(x, y, w, h, fill, r) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('fill', fill); rect.setAttribute('rx', r);
    rect.setAttribute('filter', 'url(#sh)');
    return rect;
  }

  text(x, y, str, size, weight, fill, anchor = 'middle') {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x); t.setAttribute('y', y);
    t.setAttribute('font-size', size);
    t.setAttribute('font-weight', weight);
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', 'Hiragino Sans, Meiryo, sans-serif');
    t.textContent = str;
    return t;
  }

  drawArrow(x, y, deg, size, color) {
    const r = deg * Math.PI / 180;
    const pts = [
      [x, y],
      [x - size * Math.cos(r - 0.4), y - size * Math.sin(r - 0.4)],
      [x - size * 0.6 * Math.cos(r), y - size * 0.6 * Math.sin(r)],
      [x - size * Math.cos(r + 0.4), y - size * Math.sin(r + 0.4)]
    ];
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    poly.setAttribute('fill', color);
    this.mainGroup.appendChild(poly);
  }

  textWidth(str, size) {
    return [...str].reduce((w, c) => w + (/[\u3000-\u9fff]/.test(c) ? size : size * 0.6), 0);
  }

  makeDraggable(g) {
    g.setAttribute('cursor', 'move');
    g.setAttribute('data-drag', '1');
  }

  // === イベント ===

  setupEvents() {
    const getPos = e => {
      const m = this.svg.getScreenCTM();
      return { x: (e.clientX - m.e) / m.a, y: (e.clientY - m.f) / m.d };
    };

    const findDrag = el => {
      while (el && el !== this.svg) {
        if (el.getAttribute?.('data-drag')) return el;
        el = el.parentElement;
      }
      return null;
    };

    this.svg.onmousedown = e => {
      const d = findDrag(e.target);
      if (d) {
        this.dragging = d;
        const p = getPos(e);
        const m = d.getCTM();
        this.dragOffset = { x: p.x - m.e, y: p.y - m.f };
        d.style.opacity = '0.7';
      } else {
        this.isPanning = true;
        this.panStart = getPos(e);
        this.svg.style.cursor = 'grabbing';
      }
    };

    this.svg.onmousemove = e => {
      if (this.dragging) {
        const p = getPos(e);
        this.dragging.setAttribute('transform', `translate(${p.x - this.dragOffset.x},${p.y - this.dragOffset.y})`);
      } else if (this.isPanning) {
        const p = getPos(e);
        this.viewBox.x -= p.x - this.panStart.x;
        this.viewBox.y -= p.y - this.panStart.y;
        this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
        this.panStart = getPos(e);
      }
    };

    this.svg.onmouseup = this.svg.onmouseleave = () => {
      if (this.dragging) { this.dragging.style.opacity = '1'; this.dragging = null; }
      this.isPanning = false;
      this.svg.style.cursor = 'default';
    };

    this.svg.onwheel = e => {
      e.preventDefault();
      const d = e.deltaY > 0 ? 1.1 : 0.9;
      const p = getPos(e);
      const nw = this.viewBox.width * d, nh = this.viewBox.height * d;
      this.viewBox.x -= (nw - this.viewBox.width) * ((p.x - this.viewBox.x) / this.viewBox.width);
      this.viewBox.y -= (nh - this.viewBox.height) * ((p.y - this.viewBox.y) / this.viewBox.height);
      this.viewBox.width = nw; this.viewBox.height = nh;
      this.zoomLevel *= d;
      this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    };

    this.svg.ondblclick = () => {
      this.viewBox = { x: 0, y: 0, width: this.viewBox.width / this.zoomLevel, height: this.viewBox.height / this.zoomLevel };
      this.zoomLevel = 1;
      this.svg.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);
    };

    // タッチ
    let touches = [], lastDist = 0;

    this.svg.ontouchstart = e => {
      e.preventDefault();
      touches = [...e.touches];
      if (touches.length === 1) {
        const t = touches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const d = findDrag(el);
        if (d) {
          this.dragging = d;
          const m = this.svg.getScreenCTM();
          const p = { x: (t.clientX - m.e) / m.a, y: (t.clientY - m.f) / m.d };
          const dm = d.getCTM();
          this.dragOffset = { x: p.x - dm.e, y: p.y - dm.f };
          d.style.opacity = '0.7';
        } else {
          this.isPanning = true;
          const m = this.svg.getScreenCTM();
          this.panStart = { x: (t.clientX - m.e) / m.a, y: (t.clientY - m.f) / m.d };
        }
      } else if (touches.length === 2) {
        lastDist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
      }
    };

    this.svg.ontouchmove = e => {
      e.preventDefault();
      touches = [...e.touches];
      if (touches.length === 1) {
        const t = touches[0];
        const m = this.svg.getScreenCTM();
        const p = { x: (t.clientX - m.e) / m.a, y: (t.clientY - m.f) / m.d };
        if (this.dragging) {
          this.dragging.setAttribute('transform', `translate(${p.x - this.dragOffset.x},${p.y - this.dragOffset.y})`);
        } else if (this.isPanning) {
          this.viewBox.x -= p.x - this.panStart.x;
          this.viewBox.y -= p.y - this.panStart.y;
          this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
          this.panStart = p;
        }
      } else if (touches.length === 2) {
        const dist = Math.hypot(touches[1].clientX - touches[0].clientX, touches[1].clientY - touches[0].clientY);
        const d = dist / lastDist;
        const nw = this.viewBox.width / d, nh = this.viewBox.height / d;
        const cx = (touches[0].clientX + touches[1].clientX) / 2;
        const cy = (touches[0].clientY + touches[1].clientY) / 2;
        const m = this.svg.getScreenCTM();
        const cp = { x: (cx - m.e) / m.a, y: (cy - m.f) / m.d };
        this.viewBox.x -= (nw - this.viewBox.width) * ((cp.x - this.viewBox.x) / this.viewBox.width);
        this.viewBox.y -= (nh - this.viewBox.height) * ((cp.y - this.viewBox.y) / this.viewBox.height);
        this.viewBox.width = nw; this.viewBox.height = nh;
        this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
        lastDist = dist;
      }
    };

    this.svg.ontouchend = e => {
      e.preventDefault();
      if (this.dragging) { this.dragging.style.opacity = '1'; this.dragging = null; }
      this.isPanning = false;
      touches = [];
    };
  }

  // === エクスポート ===

  exportAsPNG() {
    const c = this.svg.cloneNode(true);
    c.setAttribute('width', this.viewBox.width);
    c.setAttribute('height', this.viewBox.height);
    c.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const data = new XMLSerializer().serializeToString(c);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = this.viewBox.width * 2;
    canvas.height = this.viewBox.height * 2;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `ishikawa-${Date.now()}.png`;
        a.click();
      });
    };
    img.src = url;
  }

  exportAsSVG() {
    const c = this.svg.cloneNode(true);
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    c.setAttribute('width', this.viewBox.width);
    c.setAttribute('height', this.viewBox.height);
    c.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const data = '<?xml version="1.0"?>\n' + new XMLSerializer().serializeToString(c);
    const blob = new Blob([data], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ishikawa-${Date.now()}.svg`;
    a.click();
  }
}

if (typeof window !== 'undefined') window.IshikawaDiagram = IshikawaDiagram;
