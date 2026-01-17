/**
 * 石川ダイアグラム（特性要因図）描画エンジン v4.0
 * 実務で使用できる品質を目指した完全再設計版
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.data = null;

    // ズーム・パン
    this.viewBox = { x: 0, y: 0, width: 1400, height: 800 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.zoomLevel = 1;

    // ドラッグ
    this.draggingElement = null;
    this.offset = { x: 0, y: 0 };

    // タッチ
    this.touches = [];
    this.lastTouchDistance = 0;
  }

  /**
   * 描画メイン
   */
  render(data) {
    this.data = data;

    // レイアウト計算
    const layout = this.computeLayout(data);

    // SVG初期化
    this.initSVG(layout.width, layout.height);

    // 描画
    this.drawSpine(layout);
    this.drawEffectBox(layout);

    // カテゴリーを描画
    layout.categories.forEach(cat => {
      this.drawMajorBone(cat, layout);
    });
  }

  /**
   * レイアウト計算 - 干渉を避けるための配置アルゴリズム
   */
  computeLayout(data) {
    const categories = data.categories;
    const n = categories.length;

    // 各カテゴリーの中骨数を取得
    const causeCounts = categories.map(c => c.causes.length);
    const maxCauses = Math.max(...causeCounts, 1);

    // キャンバスサイズ
    const width = Math.max(1400, 1200 + n * 80);
    const height = Math.max(800, 700 + maxCauses * 25);

    // 背骨
    const spineY = height / 2;
    const spineStartX = 60;
    const spineEndX = width - 120;
    const spineLength = spineEndX - spineStartX;

    // カテゴリーを上下に分ける
    const topCats = [];
    const bottomCats = [];
    for (let i = 0; i < n; i++) {
      if (i % 2 === 0) {
        topCats.push({ cat: categories[i], idx: i });
      } else {
        bottomCats.push({ cat: categories[i], idx: i });
      }
    }

    // 大骨の配置計算
    const angleRad = (60 * Math.PI) / 180;

    // 利用可能な垂直スペース
    const topSpace = spineY - 50;
    const bottomSpace = height - spineY - 50;

    // 大骨の長さ（垂直成分がスペースに収まるように）
    const majorBoneLength = Math.min(
      topSpace / Math.sin(angleRad) * 0.85,
      bottomSpace / Math.sin(angleRad) * 0.85,
      250
    );

    // 水平方向の大骨投影長
    const majorBoneHorizProj = majorBoneLength * Math.cos(angleRad);

    // カテゴリー間の最小間隔
    const minSpacing = majorBoneHorizProj * 2.2;

    // 上下それぞれの配置位置を計算
    const computePositions = (cats, isTop) => {
      const count = cats.length;
      if (count === 0) return [];

      // 均等配置
      const totalSpan = spineLength - minSpacing;
      const spacing = count > 1 ? totalSpan / (count - 1) : 0;
      const startX = spineStartX + minSpacing / 2;

      return cats.map((item, i) => {
        const x = count === 1 ? spineStartX + spineLength / 2 : startX + spacing * i;
        return {
          category: item.cat,
          originalIndex: item.idx,
          spineX: x,
          isTop: isTop,
          endX: x - majorBoneLength * Math.cos(angleRad),
          endY: spineY + (isTop ? -1 : 1) * majorBoneLength * Math.sin(angleRad)
        };
      });
    };

    const topPositions = computePositions(topCats, true);
    const bottomPositions = computePositions(bottomCats, false);

    // 中骨の長さ（カテゴリー間隔の半分以下）
    const catSpacing = topCats.length > 1
      ? (spineLength - minSpacing) / (topCats.length - 1)
      : spineLength / 2;
    const mediumBoneLength = Math.min(catSpacing * 0.35, majorBoneLength * 0.4, 90);

    // 小骨・孫骨の長さ
    const smallBoneLength = Math.min(mediumBoneLength * 0.5, 45);
    const tinyBoneLength = Math.min(smallBoneLength * 0.6, 30);

    return {
      width,
      height,
      spineY,
      spineStartX,
      spineEndX,
      spineLength,
      majorBoneLength,
      majorBoneAngle: 60,
      mediumBoneLength,
      smallBoneLength,
      tinyBoneLength,
      categories: [...topPositions, ...bottomPositions].sort((a, b) => a.originalIndex - b.originalIndex)
    };
  }

  /**
   * SVG初期化
   */
  initSVG(width, height) {
    this.container.innerHTML = '';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.backgroundColor = '#ffffff';
    this.svg.style.touchAction = 'none';

    this.viewBox = { x: 0, y: 0, width, height };

    // defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'shadow');
    filter.innerHTML = '<feDropShadow dx="1" dy="1" stdDeviation="2" flood-opacity="0.2"/>';
    defs.appendChild(filter);
    this.svg.appendChild(defs);

    // メイングループ
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);

    this.container.appendChild(this.svg);
    this.setupEvents();
  }

  /**
   * 背骨描画
   */
  drawSpine(layout) {
    const { spineStartX, spineEndX, spineY } = layout;

    // 線
    const line = this.line(spineStartX, spineY, spineEndX, spineY, 5, '#1a252f');
    this.mainGroup.appendChild(line);

    // 矢印
    const arrow = this.arrow(spineEndX, spineY, 0, 16, '#1a252f');
    this.mainGroup.appendChild(arrow);
  }

  /**
   * 効果ボックス描画
   */
  drawEffectBox(layout) {
    const { spineEndX, spineY, height } = layout;

    const boxW = 70;
    const boxH = Math.min(height * 0.45, 350);
    const boxX = spineEndX + 12;
    const boxY = spineY - boxH / 2;

    const g = this.group();

    // 背景
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', boxX);
    rect.setAttribute('y', boxY);
    rect.setAttribute('width', boxW);
    rect.setAttribute('height', boxH);
    rect.setAttribute('fill', '#c0392b');
    rect.setAttribute('rx', '6');
    rect.setAttribute('filter', 'url(#shadow)');
    g.appendChild(rect);

    // 縦書きテキスト
    const text = this.data.effect;
    const fontSize = 16;
    const lineHeight = fontSize + 3;
    const maxChars = Math.floor((boxH - 30) / lineHeight);

    text.split('').slice(0, maxChars).forEach((char, i) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', boxX + boxW / 2);
      t.setAttribute('y', boxY + 25 + i * lineHeight);
      t.setAttribute('font-size', fontSize);
      t.setAttribute('font-weight', 'bold');
      t.setAttribute('fill', 'white');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = char;
      g.appendChild(t);
    });

    this.makeDraggable(g);
    this.mainGroup.appendChild(g);
  }

  /**
   * 大骨描画
   */
  drawMajorBone(catData, layout) {
    const { category, spineX, isTop, endX, endY } = catData;
    const { spineY, mediumBoneLength, smallBoneLength, tinyBoneLength, majorBoneAngle } = layout;

    // 大骨の線
    const line = this.line(spineX, spineY, endX, endY, 3, '#2c3e50');
    this.mainGroup.appendChild(line);

    // 矢印（背骨側）
    const arrowAngle = Math.atan2(spineY - endY, spineX - endX) * 180 / Math.PI;
    const arrow = this.arrow(spineX, spineY, arrowAngle, 10, '#2c3e50');
    this.mainGroup.appendChild(arrow);

    // カテゴリーボックス
    const boxG = this.group();
    const textW = this.textWidth(category.name, 13);
    const boxW = textW + 20;
    const boxH = 26;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', endX - boxW / 2);
    rect.setAttribute('y', endY - boxH / 2);
    rect.setAttribute('width', boxW);
    rect.setAttribute('height', boxH);
    rect.setAttribute('fill', '#2980b9');
    rect.setAttribute('rx', '4');
    rect.setAttribute('filter', 'url(#shadow)');
    boxG.appendChild(rect);

    const text = this.text(endX, endY, category.name, 13, 'bold', 'white', 'middle');
    boxG.appendChild(text);

    this.makeDraggable(boxG);
    this.mainGroup.appendChild(boxG);

    // 中骨を描画
    this.drawMediumBones(category.causes, {
      majorStartX: spineX,
      majorStartY: spineY,
      majorEndX: endX,
      majorEndY: endY,
      isTop,
      mediumBoneLength,
      smallBoneLength,
      tinyBoneLength,
      majorBoneAngle
    });
  }

  /**
   * 中骨描画 - 全て大骨から外側方向に伸ばす
   */
  drawMediumBones(causes, params) {
    const { majorStartX, majorStartY, majorEndX, majorEndY, isTop,
            mediumBoneLength, smallBoneLength, tinyBoneLength, majorBoneAngle } = params;

    const n = causes.length;
    if (n === 0) return;

    // 大骨の方向ベクトル
    const dx = majorEndX - majorStartX;
    const dy = majorEndY - majorStartY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    // 中骨の方向（大骨に垂直、外側向き）
    // 上側カテゴリーなら上向き、下側なら下向き
    const perpX = -uy;
    const perpY = ux;
    const sign = isTop ? -1 : 1;
    const mediumDirX = perpX * sign;
    const mediumDirY = perpY * sign;

    causes.forEach((cause, i) => {
      // 大骨上の位置（先端付近を避ける）
      const t = n === 1 ? 0.5 : 0.15 + 0.7 * (i / (n - 1));
      const attachX = majorStartX + dx * t;
      const attachY = majorStartY + dy * t;

      // 中骨の先端
      const medEndX = attachX + mediumDirX * mediumBoneLength;
      const medEndY = attachY + mediumDirY * mediumBoneLength;

      // 中骨の線
      const line = this.line(medEndX, medEndY, attachX, attachY, 2, '#5d6d7e');
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = Math.atan2(attachY - medEndY, attachX - medEndX) * 180 / Math.PI;
      const arrow = this.arrow(attachX, attachY, arrowAngle, 7, '#5d6d7e');
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelG = this.group();
      const labelX = medEndX;
      const labelY = medEndY + (isTop ? -12 : 16);
      const labelText = this.text(labelX, labelY, cause.name, 11, '600', '#2c3e50', 'middle');
      labelG.appendChild(labelText);
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 小骨を描画
      this.drawSmallBones(cause.subcauses, {
        medStartX: medEndX,
        medStartY: medEndY,
        medEndX: attachX,
        medEndY: attachY,
        isTop,
        smallBoneLength,
        tinyBoneLength,
        causeIdx: i
      });
    });
  }

  /**
   * 小骨描画
   */
  drawSmallBones(subcauses, params) {
    const { medStartX, medStartY, medEndX, medEndY, isTop, smallBoneLength, tinyBoneLength, causeIdx } = params;

    const n = subcauses.length;
    if (n === 0) return;

    // 中骨の方向
    const dx = medEndX - medStartX;
    const dy = medEndY - medStartY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    // 小骨の角度（中骨に対して60度）
    const angleRad = (55 * Math.PI) / 180;

    subcauses.forEach((sub, i) => {
      // 中骨上の位置
      const t = (i + 1) / (n + 1);
      const attachX = medStartX + dx * t;
      const attachY = medStartY + dy * t;

      // 交互に上下（またはカテゴリー位置を考慮）
      const altSign = ((i + causeIdx) % 2 === 0) ? 1 : -1;

      // 小骨の方向を計算（中骨に対して斜め）
      const cosA = Math.cos(angleRad * altSign);
      const sinA = Math.sin(angleRad * altSign);
      const smallDirX = ux * cosA - uy * sinA;
      const smallDirY = ux * sinA + uy * cosA;

      const smallEndX = attachX - smallDirX * smallBoneLength;
      const smallEndY = attachY - smallDirY * smallBoneLength;

      // 小骨の線
      const line = this.line(smallEndX, smallEndY, attachX, attachY, 1.5, '#7f8c8d');
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = Math.atan2(attachY - smallEndY, attachX - smallEndX) * 180 / Math.PI;
      const arrow = this.arrow(attachX, attachY, arrowAngle, 5, '#7f8c8d');
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelG = this.group();
      const labelY = smallEndY + (altSign > 0 ? -8 : 14);
      const labelText = this.text(smallEndX, labelY, sub.name, 10, 'normal', '#34495e', 'middle');
      labelG.appendChild(labelText);
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);

      // 孫骨
      this.drawTinyBones(sub.details, {
        smallStartX: smallEndX,
        smallStartY: smallEndY,
        smallEndX: attachX,
        smallEndY: attachY,
        tinyBoneLength,
        subIdx: i
      });
    });
  }

  /**
   * 孫骨描画
   */
  drawTinyBones(details, params) {
    const { smallStartX, smallStartY, smallEndX, smallEndY, tinyBoneLength, subIdx } = params;

    const n = details.length;
    if (n === 0) return;

    // 小骨の方向
    const dx = smallEndX - smallStartX;
    const dy = smallEndY - smallStartY;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    // 孫骨は小骨に垂直
    const perpX = -uy;
    const perpY = ux;

    details.forEach((detail, i) => {
      // 小骨上の位置
      const t = (i + 1) / (n + 1);
      const attachX = smallStartX + dx * t;
      const attachY = smallStartY + dy * t;

      // 交互
      const altSign = ((i + subIdx) % 2 === 0) ? 1 : -1;

      const tinyEndX = attachX + perpX * tinyBoneLength * altSign;
      const tinyEndY = attachY + perpY * tinyBoneLength * altSign;

      // 孫骨の線
      const line = this.line(tinyEndX, tinyEndY, attachX, attachY, 1, '#95a5a6');
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = Math.atan2(attachY - tinyEndY, attachX - tinyEndX) * 180 / Math.PI;
      const arrow = this.arrow(attachX, attachY, arrowAngle, 4, '#95a5a6');
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelG = this.group();
      const labelY = tinyEndY + (altSign > 0 ? -6 : 12);
      const labelText = this.text(tinyEndX, labelY, detail, 9, 'normal', '#5d6d7e', 'middle');
      labelG.appendChild(labelText);
      this.makeDraggable(labelG);
      this.mainGroup.appendChild(labelG);
    });
  }

  // ========== ユーティリティ ==========

  group() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'g');
  }

  line(x1, y1, x2, y2, strokeWidth, color) {
    const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l.setAttribute('x1', x1);
    l.setAttribute('y1', y1);
    l.setAttribute('x2', x2);
    l.setAttribute('y2', y2);
    l.setAttribute('stroke', color);
    l.setAttribute('stroke-width', strokeWidth);
    l.setAttribute('stroke-linecap', 'round');
    return l;
  }

  text(x, y, content, fontSize, fontWeight, fill, anchor) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('font-size', fontSize);
    t.setAttribute('font-weight', fontWeight);
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', anchor);
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', "'Hiragino Sans', 'Meiryo', sans-serif");
    t.textContent = content;
    return t;
  }

  arrow(x, y, angleDeg, size, color) {
    const rad = (angleDeg * Math.PI) / 180;
    const p1 = { x, y };
    const p2 = { x: x - size * Math.cos(rad - 0.4), y: y - size * Math.sin(rad - 0.4) };
    const p3 = { x: x - size * 0.65 * Math.cos(rad), y: y - size * 0.65 * Math.sin(rad) };
    const p4 = { x: x - size * Math.cos(rad + 0.4), y: y - size * Math.sin(rad + 0.4) };

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`);
    poly.setAttribute('fill', color);
    return poly;
  }

  textWidth(text, fontSize) {
    let w = 0;
    for (const c of text) {
      w += /[\u3000-\u9fff]/.test(c) ? fontSize : fontSize * 0.6;
    }
    return w;
  }

  makeDraggable(g) {
    g.setAttribute('cursor', 'move');
    g.setAttribute('data-draggable', 'true');
  }

  // ========== イベント ==========

  setupEvents() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.svg.addEventListener('dblclick', () => this.resetView());

    this.svg.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.svg.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.svg.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  }

  getPos(e) {
    const CTM = this.svg.getScreenCTM();
    return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d };
  }

  findDraggable(el) {
    while (el && el.tagName !== 'svg') {
      if (el.getAttribute && el.getAttribute('data-draggable') === 'true') return el;
      el = el.parentElement;
    }
    return null;
  }

  onMouseDown(e) {
    const draggable = this.findDraggable(e.target);
    if (e.button === 1 || e.shiftKey || !draggable) {
      this.isPanning = true;
      this.panStart = this.getPos(e);
      this.svg.style.cursor = 'grabbing';
    } else if (draggable) {
      this.draggingElement = draggable;
      const pt = this.getPos(e);
      const m = draggable.getCTM();
      this.offset = { x: pt.x - m.e, y: pt.y - m.f };
      draggable.style.opacity = '0.7';
    }
  }

  onMouseMove(e) {
    if (this.isPanning) {
      const pt = this.getPos(e);
      this.viewBox.x -= pt.x - this.panStart.x;
      this.viewBox.y -= pt.y - this.panStart.y;
      this.updateViewBox();
      this.panStart = this.getPos(e);
    } else if (this.draggingElement) {
      const pt = this.getPos(e);
      this.draggingElement.setAttribute('transform', `translate(${pt.x - this.offset.x},${pt.y - this.offset.y})`);
    }
  }

  onMouseUp() {
    if (this.isPanning) {
      this.isPanning = false;
      this.svg.style.cursor = 'default';
    }
    if (this.draggingElement) {
      this.draggingElement.style.opacity = '1';
      this.draggingElement = null;
    }
  }

  onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const pt = this.getPos(e);

    const nw = this.viewBox.width * delta;
    const nh = this.viewBox.height * delta;
    this.viewBox.x -= (nw - this.viewBox.width) * ((pt.x - this.viewBox.x) / this.viewBox.width);
    this.viewBox.y -= (nh - this.viewBox.height) * ((pt.y - this.viewBox.y) / this.viewBox.height);
    this.viewBox.width = nw;
    this.viewBox.height = nh;
    this.zoomLevel *= delta;
    this.updateViewBox();
  }

  resetView() {
    const w = this.viewBox.width / this.zoomLevel;
    const h = this.viewBox.height / this.zoomLevel;
    this.viewBox = { x: 0, y: 0, width: w, height: h };
    this.zoomLevel = 1;
    this.updateViewBox();
  }

  updateViewBox() {
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
  }

  // タッチ
  getTouchPos(t) {
    const CTM = this.svg.getScreenCTM();
    return { x: (t.clientX - CTM.e) / CTM.a, y: (t.clientY - CTM.f) / CTM.d };
  }

  getTouchDist(t1, t2) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  onTouchStart(e) {
    e.preventDefault();
    this.touches = [...e.touches];
    if (this.touches.length === 1) {
      const t = this.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const draggable = this.findDraggable(el);
      if (draggable) {
        this.draggingElement = draggable;
        const pt = this.getTouchPos(t);
        const m = draggable.getCTM();
        this.offset = { x: pt.x - m.e, y: pt.y - m.f };
        draggable.style.opacity = '0.7';
      } else {
        this.isPanning = true;
        this.panStart = this.getTouchPos(t);
      }
    } else if (this.touches.length === 2) {
      this.isPanning = false;
      this.draggingElement = null;
      this.lastTouchDistance = this.getTouchDist(this.touches[0], this.touches[1]);
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    this.touches = [...e.touches];
    if (this.touches.length === 1) {
      const t = this.touches[0];
      if (this.draggingElement) {
        const pt = this.getTouchPos(t);
        this.draggingElement.setAttribute('transform', `translate(${pt.x - this.offset.x},${pt.y - this.offset.y})`);
      } else if (this.isPanning) {
        const pt = this.getTouchPos(t);
        this.viewBox.x -= pt.x - this.panStart.x;
        this.viewBox.y -= pt.y - this.panStart.y;
        this.updateViewBox();
        this.panStart = this.getTouchPos(t);
      }
    } else if (this.touches.length === 2) {
      const dist = this.getTouchDist(this.touches[0], this.touches[1]);
      const delta = dist / this.lastTouchDistance;
      const cx = (this.touches[0].clientX + this.touches[1].clientX) / 2;
      const cy = (this.touches[0].clientY + this.touches[1].clientY) / 2;
      const CTM = this.svg.getScreenCTM();
      const cpt = { x: (cx - CTM.e) / CTM.a, y: (cy - CTM.f) / CTM.d };

      const nw = this.viewBox.width / delta;
      const nh = this.viewBox.height / delta;
      this.viewBox.x -= (nw - this.viewBox.width) * ((cpt.x - this.viewBox.x) / this.viewBox.width);
      this.viewBox.y -= (nh - this.viewBox.height) * ((cpt.y - this.viewBox.y) / this.viewBox.height);
      this.viewBox.width = nw;
      this.viewBox.height = nh;
      this.zoomLevel /= delta;
      this.updateViewBox();
      this.lastTouchDistance = dist;
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    if (this.draggingElement) {
      this.draggingElement.style.opacity = '1';
      this.draggingElement = null;
    }
    this.isPanning = false;
    this.touches = [];
  }

  // ========== エクスポート ==========

  exportAsPNG() {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('width', this.viewBox.width);
    clone.setAttribute('height', this.viewBox.height);
    clone.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const data = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    canvas.width = this.viewBox.width * 2;
    canvas.height = this.viewBox.height * 2;

    img.onload = () => {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `ishikawa-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = url;
  }

  exportAsSVG() {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', this.viewBox.width);
    clone.setAttribute('height', this.viewBox.height);
    clone.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const data = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ishikawa-${Date.now()}.svg`;
    a.click();
  }
}

if (typeof window !== 'undefined') {
  window.IshikawaDiagram = IshikawaDiagram;
}
