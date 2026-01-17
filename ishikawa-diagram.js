/**
 * 石川ダイアグラム（特性要因図）描画エンジン v3.0
 * 本格的な配置アルゴリズムと干渉回避システムを実装
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.data = null;
    this.elements = [];
    this.draggingElement = null;
    this.offset = { x: 0, y: 0 };

    // ズーム・パン用
    this.viewBox = { x: 0, y: 0, width: 1600, height: 900 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.zoomLevel = 1;

    // タッチ操作用
    this.touches = [];
    this.lastTouchDistance = 0;

    // レスポンシブ対応用
    this.resizeObserver = null;
    this.resizeTimeout = null;

    // 描画設定
    this.config = {
      // 背骨設定
      spine: {
        strokeWidth: 5,
        color: '#1a252f',
        arrowSize: 18
      },

      // 特性ボックス設定
      effect: {
        width: 80,
        fontSize: 18,
        fontWeight: 'bold',
        bgColor: '#c0392b',
        textColor: '#ffffff',
        borderRadius: 8
      },

      // 大骨設定
      majorBone: {
        angle: 60,
        strokeWidth: 3.5,
        color: '#2c3e50',
        arrowSize: 12,
        boxPadding: { x: 14, y: 8 },
        fontSize: 14,
        fontWeight: 'bold',
        boxColor: '#2980b9',
        textColor: '#ffffff'
      },

      // 中骨設定
      mediumBone: {
        strokeWidth: 2.2,
        color: '#5d6d7e',
        arrowSize: 8,
        fontSize: 12,
        fontWeight: '600',
        textColor: '#2c3e50'
      },

      // 小骨設定
      smallBone: {
        angle: 60,
        strokeWidth: 1.6,
        color: '#7f8c8d',
        arrowSize: 6,
        fontSize: 11,
        textColor: '#34495e'
      },

      // 孫骨設定
      tinyBone: {
        strokeWidth: 1.2,
        color: '#95a5a6',
        arrowSize: 5,
        fontSize: 10,
        textColor: '#5d6d7e'
      }
    };
  }

  /**
   * ダイアグラムを初期化
   */
  initialize(width, height) {
    this.container.innerHTML = '';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.backgroundColor = '#ffffff';
    this.svg.style.cursor = 'default';
    this.svg.style.touchAction = 'none';

    this.viewBox = { x: 0, y: 0, width, height };

    // グラデーション定義
    this.createDefs();

    // メインコンテンツグループ
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);

    this.container.appendChild(this.svg);

    this.setupEventListeners();
    this.setupResponsive();
  }

  /**
   * SVGの定義
   */
  createDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'dropShadow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');

    const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    feDropShadow.setAttribute('dx', '2');
    feDropShadow.setAttribute('dy', '2');
    feDropShadow.setAttribute('stdDeviation', '2');
    feDropShadow.setAttribute('flood-color', 'rgba(0,0,0,0.15)');

    filter.appendChild(feDropShadow);
    defs.appendChild(filter);
    this.svg.appendChild(defs);
  }

  /**
   * データを描画
   */
  render(data) {
    this.data = data;
    this.elements = [];

    // レイアウトを計算
    const layout = this.calculateLayout(data);

    // 初期化
    this.initialize(layout.width, layout.height);

    // 描画順序：背骨 → 効果ボックス → カテゴリー
    this.drawSpine(layout);
    this.drawEffectBox(layout);
    this.drawCategories(layout);
  }

  /**
   * レイアウト計算（配置アルゴリズムのコア）
   */
  calculateLayout(data) {
    const categories = data.categories;
    const numCategories = categories.length;

    // 各カテゴリーの複雑度を分析
    const categoryComplexities = categories.map(cat => {
      let complexity = cat.causes.length;
      cat.causes.forEach(cause => {
        complexity += cause.subcauses.length * 0.5;
        cause.subcauses.forEach(sub => {
          complexity += sub.details.length * 0.25;
        });
      });
      return complexity;
    });

    const maxComplexity = Math.max(...categoryComplexities, 1);
    const totalComplexity = categoryComplexities.reduce((a, b) => a + b, 0);

    // キャンバスサイズを計算
    const baseWidth = 1400;
    const baseHeight = 800;
    const width = Math.max(baseWidth, baseWidth + (numCategories - 4) * 150);
    const height = Math.max(baseHeight, baseHeight + (maxComplexity - 3) * 30);

    // マージン設定
    const margin = {
      left: 80,
      right: 160,
      top: 80,
      bottom: 80
    };

    // 背骨の位置
    const spineY = height / 2;
    const spineStartX = margin.left;
    const spineEndX = width - margin.right;
    const spineLength = spineEndX - spineStartX;

    // 効果ボックスの位置
    const effectBoxX = spineEndX + 15;
    const effectBoxHeight = Math.min(height - margin.top - margin.bottom, 400);

    // カテゴリーを上下に分割
    const topCategories = [];
    const bottomCategories = [];

    categories.forEach((cat, i) => {
      const catData = {
        category: cat,
        index: i,
        complexity: categoryComplexities[i]
      };
      if (i % 2 === 0) {
        topCategories.push(catData);
      } else {
        bottomCategories.push(catData);
      }
    });

    // 大骨の長さを計算（干渉を避けるため）
    const verticalSpace = (height / 2) - margin.top - 30;
    const numTopCats = topCategories.length;
    const numBottomCats = bottomCategories.length;
    const maxCatsInRow = Math.max(numTopCats, numBottomCats, 1);

    // カテゴリー間の最小間隔
    const minCategorySpacing = spineLength / (maxCatsInRow + 1);

    // 大骨の長さ（垂直方向の利用可能スペースに基づく）
    const majorBoneLength = Math.min(
      verticalSpace * 0.9,
      minCategorySpacing * 0.7,
      280
    );

    // 中骨の長さ
    const mediumBoneLength = Math.min(majorBoneLength * 0.35, 100);

    // 小骨の長さ
    const smallBoneLength = Math.min(mediumBoneLength * 0.55, 55);

    // 孫骨の長さ
    const tinyBoneLength = Math.min(smallBoneLength * 0.6, 35);

    // カテゴリーの位置を計算
    const calculateCategoryPositions = (cats, isTop) => {
      const numCats = cats.length;
      if (numCats === 0) return [];

      const positions = [];
      const spacing = spineLength / (numCats + 1);

      cats.forEach((catData, idx) => {
        const x = spineStartX + spacing * (idx + 1);
        positions.push({
          ...catData,
          spineX: x,
          isTop
        });
      });

      return positions;
    };

    const topPositions = calculateCategoryPositions(topCategories, true);
    const bottomPositions = calculateCategoryPositions(bottomCategories, false);

    return {
      width,
      height,
      margin,
      spineY,
      spineStartX,
      spineEndX,
      spineLength,
      effectBoxX,
      effectBoxHeight,
      majorBoneLength,
      mediumBoneLength,
      smallBoneLength,
      tinyBoneLength,
      topCategories: topPositions,
      bottomCategories: bottomPositions,
      allCategories: [...topPositions, ...bottomPositions]
    };
  }

  /**
   * 背骨を描画
   */
  drawSpine(layout) {
    const { spineStartX, spineEndX, spineY } = layout;
    const { strokeWidth, color, arrowSize } = this.config.spine;

    const line = this.createLine(spineStartX, spineY, spineEndX, spineY, strokeWidth, color);
    this.mainGroup.appendChild(line);

    const arrow = this.createArrowhead(spineEndX, spineY, 0, arrowSize, color);
    this.mainGroup.appendChild(arrow);
  }

  /**
   * 効果ボックスを描画
   */
  drawEffectBox(layout) {
    const { effectBoxX, spineY, effectBoxHeight } = layout;
    const { width, fontSize, fontWeight, bgColor, textColor, borderRadius } = this.config.effect;

    const boxY = spineY - effectBoxHeight / 2;

    const group = this.createGroup();

    // ボックス
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', effectBoxX);
    rect.setAttribute('y', boxY);
    rect.setAttribute('width', width);
    rect.setAttribute('height', effectBoxHeight);
    rect.setAttribute('fill', bgColor);
    rect.setAttribute('rx', borderRadius);
    rect.setAttribute('filter', 'url(#dropShadow)');
    group.appendChild(rect);

    // 縦書きテキスト
    const text = this.data.effect;
    const charSpacing = fontSize + 4;
    const maxChars = Math.floor((effectBoxHeight - 40) / charSpacing);
    const chars = text.split('');

    const startY = boxY + 30;
    const centerX = effectBoxX + width / 2;

    chars.slice(0, maxChars).forEach((char, i) => {
      const charEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      charEl.setAttribute('x', centerX);
      charEl.setAttribute('y', startY + i * charSpacing);
      charEl.setAttribute('font-size', fontSize);
      charEl.setAttribute('font-weight', fontWeight);
      charEl.setAttribute('fill', textColor);
      charEl.setAttribute('text-anchor', 'middle');
      charEl.setAttribute('dominant-baseline', 'middle');
      charEl.textContent = char;
      group.appendChild(charEl);
    });

    this.makeGroupDraggable(group, 'effect');
    this.mainGroup.appendChild(group);
  }

  /**
   * 全カテゴリーを描画
   */
  drawCategories(layout) {
    layout.allCategories.forEach(catPos => {
      this.drawCategory(catPos, layout);
    });
  }

  /**
   * カテゴリー（大骨）を描画
   */
  drawCategory(catPos, layout) {
    const { category, spineX, isTop } = catPos;
    const { spineY, majorBoneLength } = layout;
    const { angle, strokeWidth, color, arrowSize, boxPadding, fontSize, fontWeight, boxColor, textColor } = this.config.majorBone;

    const rad = (angle * Math.PI) / 180;
    const direction = isTop ? -1 : 1;

    // 大骨の終点（カテゴリーボックスの位置）
    const endX = spineX - majorBoneLength * Math.cos(rad);
    const endY = spineY + direction * majorBoneLength * Math.sin(rad);

    // 大骨の線
    const line = this.createLine(spineX, spineY, endX, endY, strokeWidth, color);
    this.mainGroup.appendChild(line);

    // 矢印
    const arrowAngle = Math.atan2(spineY - endY, spineX - endX) * 180 / Math.PI;
    const arrow = this.createArrowhead(spineX, spineY, arrowAngle, arrowSize, color);
    this.mainGroup.appendChild(arrow);

    // カテゴリーボックス
    const textWidth = this.estimateTextWidth(category.name, fontSize);
    const boxWidth = textWidth + boxPadding.x * 2;
    const boxHeight = fontSize + boxPadding.y * 2;

    const group = this.createGroup();

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', endX - boxWidth / 2);
    rect.setAttribute('y', endY - boxHeight / 2);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('fill', boxColor);
    rect.setAttribute('rx', 5);
    rect.setAttribute('filter', 'url(#dropShadow)');
    group.appendChild(rect);

    const text = this.createText(endX, endY, category.name, fontSize, fontWeight, textColor, 'middle');
    group.appendChild(text);

    this.makeGroupDraggable(group, 'category', category);
    this.mainGroup.appendChild(group);

    // 中骨を描画
    this.drawCauses(category.causes, {
      boneStartX: spineX,
      boneStartY: spineY,
      boneEndX: endX,
      boneEndY: endY,
      isTop,
      layout
    });
  }

  /**
   * 中骨を描画
   */
  drawCauses(causes, params) {
    const { boneStartX, boneStartY, boneEndX, boneEndY, isTop, layout } = params;
    const { mediumBoneLength } = layout;
    const { strokeWidth, color, arrowSize, fontSize, fontWeight, textColor } = this.config.mediumBone;

    const numCauses = causes.length;
    if (numCauses === 0) return;

    // 大骨に沿って均等に配置（両端に余白を確保）
    const startRatio = 0.15;
    const endRatio = 0.90;

    causes.forEach((cause, idx) => {
      // 配置位置を計算
      const t = numCauses === 1
        ? 0.5
        : startRatio + (endRatio - startRatio) * (idx / (numCauses - 1));

      const attachX = boneStartX + (boneEndX - boneStartX) * t;
      const attachY = boneStartY + (boneEndY - boneStartY) * t;

      // 交互に左右に配置
      const isRight = idx % 2 === 0;
      const horizDir = isRight ? 1 : -1;

      // 中骨の終点（水平）
      const startX = attachX + horizDir * mediumBoneLength;
      const startY = attachY;

      // 中骨の線
      const line = this.createLine(startX, startY, attachX, attachY, strokeWidth, color);
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = isRight ? 180 : 0;
      const arrow = this.createArrowhead(attachX, attachY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const labelX = startX + (isRight ? 4 : -4);
      const labelY = startY - 10;

      // 背景
      const textWidth = this.estimateTextWidth(cause.name, fontSize);
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', isRight ? labelX - 2 : labelX - textWidth - 2);
      bg.setAttribute('y', labelY - fontSize / 2 - 2);
      bg.setAttribute('width', textWidth + 4);
      bg.setAttribute('height', fontSize + 4);
      bg.setAttribute('fill', 'white');
      bg.setAttribute('fill-opacity', '0.9');
      bg.setAttribute('rx', '2');
      labelGroup.appendChild(bg);

      const labelText = this.createText(labelX, labelY, cause.name, fontSize, fontWeight, textColor, isRight ? 'start' : 'end');
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'cause', cause);
      this.mainGroup.appendChild(labelGroup);

      // 小骨を描画
      this.drawSubcauses(cause.subcauses, {
        causeStartX: startX,
        causeStartY: startY,
        causeEndX: attachX,
        causeEndY: attachY,
        causeIsRight: isRight,
        causeIdx: idx,
        isTop,
        layout
      });
    });
  }

  /**
   * 小骨を描画
   */
  drawSubcauses(subcauses, params) {
    const { causeStartX, causeStartY, causeEndX, causeEndY, causeIsRight, causeIdx, isTop, layout } = params;
    const { smallBoneLength } = layout;
    const { angle, strokeWidth, color, arrowSize, fontSize, textColor } = this.config.smallBone;

    const numSubcauses = subcauses.length;
    if (numSubcauses === 0) return;

    const rad = (angle * Math.PI) / 180;

    subcauses.forEach((subcause, idx) => {
      // 中骨上の位置
      const t = (idx + 1) / (numSubcauses + 1);
      const attachX = causeStartX + (causeEndX - causeStartX) * t;
      const attachY = causeStartY;

      // 交互に上下配置（causeIdxも考慮）
      const isAbove = (idx + causeIdx) % 2 === 0;
      const vertDir = isAbove ? -1 : 1;
      const horizDir = causeIsRight ? 1 : -1;

      // 小骨の終点
      const startX = attachX + horizDir * smallBoneLength * Math.cos(rad);
      const startY = attachY + vertDir * smallBoneLength * Math.sin(rad);

      // 小骨の線
      const line = this.createLine(startX, startY, attachX, attachY, strokeWidth, color);
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = Math.atan2(attachY - startY, attachX - startX) * 180 / Math.PI;
      const arrow = this.createArrowhead(attachX, attachY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const labelY = startY + (isAbove ? -8 : 16);

      const labelText = this.createText(startX, labelY, subcause.name, fontSize, 'normal', textColor, 'middle');
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'subcause', subcause);
      this.mainGroup.appendChild(labelGroup);

      // 孫骨を描画
      this.drawDetails(subcause.details, {
        subcauseStartX: startX,
        subcauseStartY: startY,
        subcauseEndX: attachX,
        subcauseEndY: attachY,
        subcauseIdx: idx,
        causeIsRight,
        isAbove,
        layout
      });
    });
  }

  /**
   * 孫骨を描画
   */
  drawDetails(details, params) {
    const { subcauseStartX, subcauseStartY, subcauseEndX, subcauseEndY, subcauseIdx, causeIsRight, isAbove, layout } = params;
    const { tinyBoneLength } = layout;
    const { strokeWidth, color, arrowSize, fontSize, textColor } = this.config.tinyBone;

    const numDetails = details.length;
    if (numDetails === 0) return;

    details.forEach((detail, idx) => {
      // 小骨上の位置
      const t = (idx + 1) / (numDetails + 1);
      const attachX = subcauseStartX + (subcauseEndX - subcauseStartX) * t;
      const attachY = subcauseStartY + (subcauseEndY - subcauseStartY) * t;

      // 孫骨の方向
      const horizDir = causeIsRight ? 1 : -1;
      const startX = attachX + horizDir * tinyBoneLength;
      const startY = attachY;

      // 孫骨の線
      const line = this.createLine(startX, startY, attachX, attachY, strokeWidth, color);
      this.mainGroup.appendChild(line);

      // 矢印
      const arrowAngle = causeIsRight ? 180 : 0;
      const arrow = this.createArrowhead(attachX, attachY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const isAboveLabel = (idx + subcauseIdx) % 2 === 0;
      const labelX = startX + (causeIsRight ? 3 : -3);
      const labelY = startY + (isAboveLabel ? -6 : 14);

      const labelText = this.createText(labelX, labelY, detail, fontSize, 'normal', textColor, causeIsRight ? 'start' : 'end');
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'detail', { name: detail });
      this.mainGroup.appendChild(labelGroup);
    });
  }

  // ========== SVG要素作成ユーティリティ ==========

  createGroup() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'g');
  }

  createLine(x1, y1, x2, y2, strokeWidth, color) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', strokeWidth);
    line.setAttribute('stroke-linecap', 'round');
    return line;
  }

  createText(x, y, text, fontSize, fontWeight, fill, textAnchor) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('font-size', fontSize);
    el.setAttribute('font-weight', fontWeight);
    el.setAttribute('fill', fill);
    el.setAttribute('text-anchor', textAnchor);
    el.setAttribute('dominant-baseline', 'middle');
    el.setAttribute('font-family', "'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif");
    el.textContent = text;
    return el;
  }

  createArrowhead(x, y, angle, size, color) {
    const group = this.createGroup();
    const rad = (angle * Math.PI) / 180;

    const points = [
      { x: x, y: y },
      { x: x - size * Math.cos(rad - Math.PI / 7), y: y - size * Math.sin(rad - Math.PI / 7) },
      { x: x - size * 0.7 * Math.cos(rad), y: y - size * 0.7 * Math.sin(rad) },
      { x: x - size * Math.cos(rad + Math.PI / 7), y: y - size * Math.sin(rad + Math.PI / 7) }
    ];

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    polygon.setAttribute('fill', color);

    group.appendChild(polygon);
    return group;
  }

  estimateTextWidth(text, fontSize) {
    let width = 0;
    for (const char of text) {
      if (/[\u3000-\u9fff]/.test(char)) {
        width += fontSize;
      } else {
        width += fontSize * 0.6;
      }
    }
    return width;
  }

  // ========== ドラッグ&ドロップ ==========

  setupEventListeners() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    this.svg.addEventListener('dblclick', this.resetView.bind(this));

    this.svg.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.svg.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.svg.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  }

  makeGroupDraggable(group, type, data = null) {
    group.setAttribute('cursor', 'move');
    group.setAttribute('data-type', type);
    group.setAttribute('data-draggable', 'true');
    if (data) {
      group.setAttribute('data-name', data.name || '');
    }
  }

  onMouseDown(e) {
    const target = e.target;
    let group = target;
    while (group && group.tagName !== 'g') {
      group = group.parentElement;
    }

    if (e.button === 1 || e.shiftKey) {
      this.isPanning = true;
      this.panStart = this.getMousePosition(e);
      this.svg.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (group && group.getAttribute('data-draggable') === 'true') {
      this.draggingElement = group;
      const pt = this.getMousePosition(e);
      const matrix = group.getCTM();
      this.offset = { x: pt.x - matrix.e, y: pt.y - matrix.f };
      group.style.opacity = '0.7';
    } else {
      this.isPanning = true;
      this.panStart = this.getMousePosition(e);
      this.svg.style.cursor = 'grabbing';
    }
  }

  onMouseMove(e) {
    if (this.isPanning) {
      const pt = this.getMousePosition(e);
      const dx = pt.x - this.panStart.x;
      const dy = pt.y - this.panStart.y;
      this.viewBox.x -= dx;
      this.viewBox.y -= dy;
      this.updateViewBox();
      this.panStart = this.getMousePosition(e);
      return;
    }

    if (!this.draggingElement) return;

    const pt = this.getMousePosition(e);
    const x = pt.x - this.offset.x;
    const y = pt.y - this.offset.y;
    this.draggingElement.setAttribute('transform', `translate(${x}, ${y})`);
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
    const pt = this.getMousePosition(e);

    const newWidth = this.viewBox.width * delta;
    const newHeight = this.viewBox.height * delta;

    const dx = (newWidth - this.viewBox.width) * ((pt.x - this.viewBox.x) / this.viewBox.width);
    const dy = (newHeight - this.viewBox.height) * ((pt.y - this.viewBox.y) / this.viewBox.height);

    this.viewBox.x -= dx;
    this.viewBox.y -= dy;
    this.viewBox.width = newWidth;
    this.viewBox.height = newHeight;
    this.zoomLevel *= delta;
    this.updateViewBox();
  }

  resetView() {
    const width = this.viewBox.width / this.zoomLevel;
    const height = this.viewBox.height / this.zoomLevel;
    this.viewBox = { x: 0, y: 0, width, height };
    this.zoomLevel = 1;
    this.updateViewBox();
  }

  updateViewBox() {
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
  }

  getMousePosition(e) {
    const CTM = this.svg.getScreenCTM();
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
  }

  // ========== タッチイベント ==========

  onTouchStart(e) {
    e.preventDefault();
    this.touches = Array.from(e.touches);

    if (this.touches.length === 1) {
      const touch = this.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      let group = target;
      while (group && group.tagName !== 'g') {
        group = group.parentElement;
      }

      if (group && group.getAttribute('data-draggable') === 'true') {
        this.draggingElement = group;
        const pt = this.getTouchPosition(touch);
        const matrix = group.getCTM();
        this.offset = { x: pt.x - matrix.e, y: pt.y - matrix.f };
        group.style.opacity = '0.7';
      } else {
        this.isPanning = true;
        this.panStart = this.getTouchPosition(touch);
      }
    } else if (this.touches.length === 2) {
      this.isPanning = false;
      this.draggingElement = null;
      this.lastTouchDistance = this.getTouchDistance(this.touches[0], this.touches[1]);
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    this.touches = Array.from(e.touches);

    if (this.touches.length === 1) {
      const touch = this.touches[0];
      if (this.draggingElement) {
        const pt = this.getTouchPosition(touch);
        const x = pt.x - this.offset.x;
        const y = pt.y - this.offset.y;
        this.draggingElement.setAttribute('transform', `translate(${x}, ${y})`);
      } else if (this.isPanning) {
        const pt = this.getTouchPosition(touch);
        const dx = pt.x - this.panStart.x;
        const dy = pt.y - this.panStart.y;
        this.viewBox.x -= dx;
        this.viewBox.y -= dy;
        this.updateViewBox();
        this.panStart = this.getTouchPosition(touch);
      }
    } else if (this.touches.length === 2) {
      const currentDistance = this.getTouchDistance(this.touches[0], this.touches[1]);
      const delta = currentDistance / this.lastTouchDistance;

      const centerX = (this.touches[0].clientX + this.touches[1].clientX) / 2;
      const centerY = (this.touches[0].clientY + this.touches[1].clientY) / 2;
      const CTM = this.svg.getScreenCTM();
      const centerPt = {
        x: (centerX - CTM.e) / CTM.a,
        y: (centerY - CTM.f) / CTM.d
      };

      const newWidth = this.viewBox.width / delta;
      const newHeight = this.viewBox.height / delta;

      const dx = (newWidth - this.viewBox.width) * ((centerPt.x - this.viewBox.x) / this.viewBox.width);
      const dy = (newHeight - this.viewBox.height) * ((centerPt.y - this.viewBox.y) / this.viewBox.height);

      this.viewBox.x -= dx;
      this.viewBox.y -= dy;
      this.viewBox.width = newWidth;
      this.viewBox.height = newHeight;
      this.zoomLevel /= delta;
      this.updateViewBox();

      this.lastTouchDistance = currentDistance;
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
    this.lastTouchDistance = 0;
  }

  getTouchPosition(touch) {
    const CTM = this.svg.getScreenCTM();
    return {
      x: (touch.clientX - CTM.e) / CTM.a,
      y: (touch.clientY - CTM.f) / CTM.d
    };
  }

  getTouchDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ========== レスポンシブ ==========

  setupResponsive() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => this.handleResize(), 100);
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('resize', () => {
      if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
      this.resizeTimeout = setTimeout(() => this.handleResize(), 100);
    });

    this.handleResize();
  }

  handleResize() {
    if (!this.svg || !this.container) return;

    const containerWidth = this.container.clientWidth;
    const aspectRatio = this.viewBox.width / this.viewBox.height;
    let svgHeight = containerWidth / aspectRatio;
    svgHeight = Math.min(svgHeight, window.innerHeight * 0.8, 700);
    svgHeight = Math.max(svgHeight, 350);
    this.svg.style.height = `${svgHeight}px`;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
  }

  // ========== エクスポート ==========

  exportAsPNG() {
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('width', this.viewBox.width);
    svgClone.setAttribute('height', this.viewBox.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const scale = 2;
    canvas.width = this.viewBox.width * scale;
    canvas.height = this.viewBox.height * scale;

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `ishikawa-diagram-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };

    img.onerror = () => {
      alert('PNG出力に失敗しました。SVG形式をお試しください。');
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  exportAsSVG() {
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', this.viewBox.width);
    svgClone.setAttribute('height', this.viewBox.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.viewBox.width} ${this.viewBox.height}`);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const fullSvg = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgData;

    const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ishikawa-diagram-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

if (typeof window !== 'undefined') {
  window.IshikawaDiagram = IshikawaDiagram;
}
