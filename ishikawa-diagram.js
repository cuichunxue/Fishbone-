/**
 * 石川ダイアグラム（特性要因図）v5.0
 * シンプルで実用的な配置
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.data = null;
    this.viewBox = { x: 0, y: 0, width: 1200, height: 700 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.zoomLevel = 1;
    this.dragging = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  render(data) {
    this.data = data;
    const n = data.categories.length;

    // サイズ計算
    const width = Math.max(1200, 900 + n * 120);
    const height = 700;

    this.viewBox = { x: 0, y: 0, width, height };
    this.initSVG(width, height);

    // 背骨
    const spineY = height / 2;
    const spineStart = 50;
    const spineEnd = width - 100;

    this.drawLine(spineStart, spineY, spineEnd, spineY, 4, '#2c3e50');
    this.drawArrow(spineEnd, spineY, 0, 14, '#2c3e50');

    // 効果ボックス
    this.drawEffectBox(spineEnd + 10, spineY, data.effect);

    // カテゴリー配置
    const topCats = data.categories.filter((_, i) => i % 2 === 0);
    const botCats = data.categories.filter((_, i) => i % 2 === 1);

    const spineLen = spineEnd - spineStart;

    // 上側カテゴリー
    topCats.forEach((cat, i) => {
      const x = spineStart + spineLen * (i + 1) / (topCats.length + 1);
      this.drawCategory(cat, x, spineY, true, spineLen / (topCats.length + 1));
    });

    // 下側カテゴリー
    botCats.forEach((cat, i) => {
      const x = spineStart + spineLen * (i + 1) / (botCats.length + 1);
      this.drawCategory(cat, x, spineY, false, spineLen / (botCats.length + 1));
    });

    this.setupEvents();
  }

  drawCategory(cat, spineX, spineY, isTop, availWidth) {
    const angle = 60 * Math.PI / 180;
    const dir = isTop ? -1 : 1;

    // 大骨の長さ（利用可能幅に基づく）
    const boneLen = Math.min(availWidth * 0.6, 200);

    // 大骨終点
    const endX = spineX - boneLen * Math.cos(angle);
    const endY = spineY + dir * boneLen * Math.sin(angle);

    // 大骨
    this.drawLine(spineX, spineY, endX, endY, 2.5, '#34495e');
    this.drawArrow(spineX, spineY, Math.atan2(spineY - endY, spineX - endX) * 180 / Math.PI, 9, '#34495e');

    // カテゴリーラベル（ボックス）
    const g = this.group();
    const tw = this.textWidth(cat.name, 12);
    const bw = tw + 16, bh = 24;

    const rect = this.rect(endX - bw/2, endY - bh/2, bw, bh, '#3498db', 4);
    g.appendChild(rect);
    g.appendChild(this.text(endX, endY, cat.name, 12, 'bold', '#fff'));
    this.makeDraggable(g);
    this.mainGroup.appendChild(g);

    // 中骨を描画
    const causes = cat.causes;
    const numCauses = causes.length;
    if (numCauses === 0) return;

    // 中骨の間隔
    const causeSpacing = boneLen * 0.8 / (numCauses + 1);

    causes.forEach((cause, ci) => {
      // 大骨上の位置
      const t = (ci + 1) / (numCauses + 1);
      const cx = spineX + (endX - spineX) * t;
      const cy = spineY + (endY - spineY) * t;

      // 中骨の長さ
      const causeLen = Math.min(causeSpacing * 0.9, 70);

      // 中骨は水平に、背骨と反対方向へ
      const causeEndX = cx - causeLen;
      const causeEndY = cy;

      this.drawLine(cx, cy, causeEndX, causeEndY, 1.8, '#7f8c8d');
      this.drawArrow(cx, cy, 180, 6, '#7f8c8d');

      // 中骨ラベル
      const cg = this.group();
      cg.appendChild(this.text(causeEndX - 3, causeEndY - 10, cause.name, 10, '600', '#2c3e50', 'end'));
      this.makeDraggable(cg);
      this.mainGroup.appendChild(cg);

      // 小骨
      const subs = cause.subcauses;
      if (subs.length === 0) return;

      const subSpacing = causeLen / (subs.length + 1);

      subs.forEach((sub, si) => {
        const st = (si + 1) / (subs.length + 1);
        const sx = causeEndX + (cx - causeEndX) * st;
        const sy = causeEndY;

        // 小骨の長さと方向
        const subLen = Math.min(subSpacing * 0.8, 35);
        const subDir = (si % 2 === 0) ? -1 : 1;
        const subAngle = 55 * Math.PI / 180;

        const subEndX = sx - subLen * Math.cos(subAngle);
        const subEndY = sy + subDir * subLen * Math.sin(subAngle);

        this.drawLine(sx, sy, subEndX, subEndY, 1.2, '#95a5a6');
        this.drawArrow(sx, sy, Math.atan2(sy - subEndY, sx - subEndX) * 180 / Math.PI, 4, '#95a5a6');

        // 小骨ラベル
        const sg = this.group();
        sg.appendChild(this.text(subEndX, subEndY + (subDir < 0 ? -8 : 14), sub.name, 9, 'normal', '#555', 'middle'));
        this.makeDraggable(sg);
        this.mainGroup.appendChild(sg);

        // 孫骨
        const details = sub.details;
        if (details.length === 0) return;

        details.forEach((det, di) => {
          const dt = (di + 1) / (details.length + 1);
          const dx = subEndX + (sx - subEndX) * dt;
          const dy = subEndY + (sy - subEndY) * dt;

          const detLen = 20;
          const detDir = (di % 2 === 0) ? 1 : -1;

          const detEndX = dx - detLen;
          const detEndY = dy;

          this.drawLine(dx, dy, detEndX, detEndY, 0.8, '#bdc3c7');

          const dg = this.group();
          dg.appendChild(this.text(detEndX - 2, detEndY + (detDir < 0 ? -5 : 10), det, 8, 'normal', '#666', 'end'));
          this.makeDraggable(dg);
          this.mainGroup.appendChild(dg);
        });
      });
    });
  }

  drawEffectBox(x, spineY, text) {
    const boxW = 60;
    const boxH = Math.min(350, 20 + text.length * 20);
    const boxY = spineY - boxH / 2;

    const g = this.group();
    g.appendChild(this.rect(x, boxY, boxW, boxH, '#c0392b', 6));

    const fontSize = 15;
    text.split('').forEach((c, i) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + boxW / 2);
      t.setAttribute('y', boxY + 25 + i * (fontSize + 3));
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

  // === SVG基本操作 ===

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
    defs.innerHTML = '<filter id="sh"><feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-opacity="0.15"/></filter>';
    this.svg.appendChild(defs);

    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);
    this.container.appendChild(this.svg);
  }

  group() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'g');
  }

  drawLine(x1, y1, x2, y2, sw, color) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', sw);
    l.setAttribute('stroke-linecap', 'round');
    this.mainGroup.appendChild(l);
  }

  rect(x, y, w, h, fill, r) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('fill', fill);
    rect.setAttribute('rx', r);
    rect.setAttribute('filter', 'url(#sh)');
    return rect;
  }

  text(x, y, str, size, weight, fill, anchor = 'middle') {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
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
      if (this.dragging) {
        this.dragging.style.opacity = '1';
        this.dragging = null;
      }
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
      this.viewBox.width = nw;
      this.viewBox.height = nh;
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
        this.viewBox.width = nw;
        this.viewBox.height = nh;
        this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
        lastDist = dist;
      }
    };

    this.svg.ontouchend = e => {
      e.preventDefault();
      if (this.dragging) {
        this.dragging.style.opacity = '1';
        this.dragging = null;
      }
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
