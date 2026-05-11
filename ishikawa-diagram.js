/**
 * 石川ダイアグラム（特性要因図）v7.0
 * 伝統的な魚骨形状 - 中骨は水平に左向き（背骨と平行）
 * 大骨上の取り付け位置による自然な垂直分散
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

    // キャンバスサイズ（カテゴリー数に応じて拡張）
    const width = Math.max(1400, 1000 + n * 120);
    const height = 850;

    this.viewBox = { x: 0, y: 0, width, height };
    this.initSVG(width, height);

    const spineY = height / 2;
    const spineStart = 120;
    const spineEnd = width - 140;
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
    const angle = 60 * Math.PI / 180; // 60度で傾斜
    const dir = isTop ? -1 : 1;

    // 利用可能な垂直スペース
    const vertSpace = (height / 2) - 100;

    // 大骨の長さ（カテゴリーの要因数に応じて調整）
    const causesCount = cat.causes.length;
    const baseLen = Math.min(vertSpace * 0.85, spacing * 0.6, 200);
    const boneLen = baseLen;

    // 大骨の終点
    const endX = spineX - boneLen * Math.cos(angle);
    const endY = spineY + dir * boneLen * Math.sin(angle);

    // 大骨を描画
    this.drawLine(spineX, spineY, endX, endY, 3.5, '#2c3e50');
    this.drawArrow(spineX, spineY, Math.atan2(spineY - endY, spineX - endX) * 180 / Math.PI, 12, '#2c3e50');

    // カテゴリーボックス
    const g = this.group();
    const tw = this.textWidth(cat.name, 14);
    const bw = tw + 20, bh = 28;
    g.appendChild(this.rect(endX - bw / 2, endY - bh / 2, bw, bh, '#2980b9', 6));
    g.appendChild(this.text(endX, endY, cat.name, 14, 'bold', '#fff'));
    this.makeDraggable(g);
    this.mainGroup.appendChild(g);

    // 中骨を描画
    this.drawCauses(cat.causes, spineX, spineY, endX, endY, isTop, boneLen, spacing);
  }

  drawCauses(causes, spineX, spineY, endX, endY, isTop, majorLen, spacing) {
    const n = causes.length;
    if (n === 0) return;

    // 大骨のベクトル
    const dx = endX - spineX;
    const dy = endY - spineY;

    // 中骨の長さ（隣接カテゴリーと干渉しないよう短めに）
    // spacing の半分以下に制限
    const causeLen = Math.min(majorLen * 0.4, spacing * 0.35, 80);

    causes.forEach((cause, i) => {
      // 大骨上の位置（先端側を避けて均等配置）
      // 先端近くはカテゴリーボックスがあるので避ける
      const t = 0.15 + 0.65 * (i / Math.max(n - 1, 1));
      const attachX = spineX + dx * t;
      const attachY = spineY + dy * t;

      // 中骨は水平に左向き（背骨と平行）
      const causeEndX = attachX - causeLen;
      const causeEndY = attachY;

      // 中骨を描画
      this.drawLine(attachX, attachY, causeEndX, causeEndY, 2, '#5d6d7e');
      this.drawArrow(attachX, attachY, 180, 8, '#5d6d7e');

      // ラベル（中骨の先端、少し上または下）
      const labelG = this.group();
      const labelY = causeEndY + (isTop ? -12 : 14);
      labelG.appendChild(this.text(causeEndX, labelY, cause.name, 11, '600', '#2c3e50'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 小骨
      this.drawSubcauses(cause.subcauses, attachX, attachY, causeEndX, causeEndY, isTop, i);
    });
  }

  drawSubcauses(subcauses, startX, startY, endX, endY, isTop, causeIdx) {
    const n = subcauses.length;
    if (n === 0) return;

    // 中骨のベクトル（水平）
    const dx = endX - startX;
    const len = Math.abs(dx);

    // 小骨の長さ
    const subLen = Math.min(len * 0.45, 35);

    // 小骨の角度（中骨に対して斜め上または下）
    const subAngle = 50 * Math.PI / 180;

    subcauses.forEach((sub, i) => {
      // 中骨上の位置
      const t = (i + 1) / (n + 1);
      const attachX = startX + dx * t;
      const attachY = startY;

      // 上側カテゴリーなら上向き、下側なら下向き
      const side = isTop ? -1 : 1;

      // 小骨の方向
      const subEndX = attachX - subLen * Math.cos(subAngle);
      const subEndY = attachY + side * subLen * Math.sin(subAngle);

      // 小骨を描画
      this.drawLine(attachX, attachY, subEndX, subEndY, 1.5, '#7f8c8d');
      this.drawArrow(attachX, attachY, Math.atan2(attachY - subEndY, attachX - subEndX) * 180 / Math.PI, 5, '#7f8c8d');

      // ラベル
      const labelG = this.group();
      const labelY = subEndY + (side < 0 ? -8 : 12);
      labelG.appendChild(this.text(subEndX, labelY, sub.name, 9, 'normal', '#34495e'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 孫骨
      this.drawDetails(sub.details, attachX, attachY, subEndX, subEndY, isTop, i);
    });
  }

  drawDetails(details, startX, startY, endX, endY, isTop, subIdx) {
    const n = details.length;
    if (n === 0) return;

    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy);

    const detLen = 22;

    // 孫骨は小骨に対して同じ方向（上側カテゴリーなら上、下側なら下）
    const side = isTop ? -1 : 1;

    details.forEach((det, i) => {
      const t = (i + 1) / (n + 1);
      const attachX = startX + dx * t;
      const attachY = startY + dy * t;

      // 垂直方向に配置
      const detEndX = attachX;
      const detEndY = attachY + side * detLen;

      this.drawLine(attachX, attachY, detEndX, detEndY, 0.8, '#95a5a6');

      const labelG = this.group();
      const labelY = detEndY + (side < 0 ? -6 : 10);
      labelG.appendChild(this.text(detEndX, labelY, det, 8, 'normal', '#666'));
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);
    });
  }

  drawEffectBox(x, spineY, height, text) {
    const boxW = 70;
    const boxH = Math.min(height * 0.45, 350);
    const boxY = spineY - boxH / 2;

    const g = this.group();
    g.appendChild(this.rect(x, boxY, boxW, boxH, '#c0392b', 6));

    const fontSize = 17;
    const lineH = fontSize + 5;
    const maxChars = Math.floor((boxH - 40) / lineH);

    text.split('').slice(0, maxChars).forEach((c, i) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + boxW / 2);
      t.setAttribute('y', boxY + 30 + i * lineH);
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
