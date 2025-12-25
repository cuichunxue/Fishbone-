/**
 * 石川ダイアグラム（特性要因図）描画・編集エンジン
 * 正確で美しい石川ダイアグラムを生成し、ドラッグ&ドロップで編集可能
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

    // 描画設定
    this.config = {
      width: 1600,
      height: 900,
      margin: { left: 50, right: 50, top: 50, bottom: 50 },

      // 背骨（主骨）設定
      spine: {
        startX: 100,
        endX: 1350,
        y: 450,
        strokeWidth: 4,
        color: '#2c3e50'
      },

      // 特性ボックス設定（縦書き縦長）
      effect: {
        x: 1400,
        y: 250,
        width: 80,
        height: 400,
        fontSize: 24,
        fontWeight: 'bold'
      },

      // 大骨設定
      majorBone: {
        length: 200,
        angle: 60, // 度
        strokeWidth: 3,
        color: '#34495e',
        spacing: 250, // 大骨間の間隔
        boxWidth: 100,
        boxHeight: 40,
        fontSize: 16,
        fontWeight: 'bold'
      },

      // 中骨設定
      mediumBone: {
        length: 150,
        strokeWidth: 2,
        color: '#7f8c8d',
        spacing: 50,
        fontSize: 14,
        labelOffset: 10
      },

      // 小骨設定
      smallBone: {
        length: 100,
        strokeWidth: 1.5,
        color: '#95a5a6',
        spacing: 45,
        fontSize: 12,
        labelOffset: 8
      },

      // 孫骨設定
      tinyBone: {
        length: 60,
        strokeWidth: 1,
        color: '#bdc3c7',
        spacing: 30,
        fontSize: 11,
        labelOffset: 6
      }
    };
  }

  /**
   * ダイアグラムを初期化
   */
  initialize() {
    this.container.innerHTML = '';

    // SVG要素を作成
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '700');
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    this.svg.style.border = '1px solid #ddd';
    this.svg.style.backgroundColor = '#ffffff';
    this.svg.style.cursor = 'grab';
    this.svg.style.touchAction = 'none'; // タッチ操作を完全制御

    // メインコンテンツグループ
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);

    this.container.appendChild(this.svg);

    // マウスイベントを設定
    this.setupEventListeners();
  }

  /**
   * データを描画
   * @param {Object} data - パース済みデータ
   */
  render(data) {
    this.data = data;
    this.elements = [];
    this.initialize();

    // 描画順序：背骨 → 大骨 → 中骨 → 小骨 → 孫骨 → ラベル
    this.drawSpine();
    this.drawEffect();
    this.drawCategories();
  }

  /**
   * 背骨（主骨）を描画
   */
  drawSpine() {
    const { startX, endX, y, strokeWidth, color } = this.config.spine;

    // 背骨の線
    const spineLine = this.createLine(startX, y, endX, y, strokeWidth, color);
    this.mainGroup.appendChild(spineLine);

    // 矢印
    const arrowSize = 15;
    const arrow = this.createArrowhead(endX, y, 0, arrowSize, color);
    this.mainGroup.appendChild(arrow);
  }

  /**
   * 特性ボックスを描画（縦書き縦長）
   */
  drawEffect() {
    const { x, y, width, height, fontSize, fontWeight } = this.config.effect;

    const group = this.createGroup();

    // ボックス
    const rect = this.createRect(x, y, width, height, '#e74c3c', '#fff', 2);
    group.appendChild(rect);

    // テキスト（縦書き）
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + width / 2);
    text.setAttribute('y', y + 30);
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-weight', fontWeight);
    text.setAttribute('fill', '#fff');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('writing-mode', 'tb');  // 縦書き
    text.setAttribute('glyph-orientation-vertical', '0');

    // 1文字ずつ縦に配置
    const chars = this.data.effect.split('');
    let currentY = y + 40;
    chars.forEach(char => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', x + width / 2);
      tspan.setAttribute('dy', fontSize + 5);
      tspan.textContent = char;
      text.appendChild(tspan);
    });

    group.appendChild(text);

    // ドラッグ可能に設定
    this.makeGroupDraggable(group, 'effect');

    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'effect', element: group, data: this.data });
  }

  /**
   * カテゴリー（大骨）とその配下を描画
   */
  drawCategories() {
    const categories = this.data.categories.slice(0, 4); // 4M固定
    const positions = this.calculateCategoryPositions(categories);

    categories.forEach((category, index) => {
      const pos = positions[index];
      this.drawCategory(category, pos, index);
    });
  }

  /**
   * カテゴリーの位置を計算
   * @param {Array} categories - カテゴリー配列
   * @returns {Array} 位置情報の配列
   */
  calculateCategoryPositions(categories) {
    const { startX, endX, y } = this.config.spine;
    const totalWidth = endX - startX;

    const positions = [];

    // 4M配置: 機械(上左)、人(上右)、材料(下左)、方法(下右)
    const layout = [
      { name: '機械', isTop: true, ratio: 0.25 },   // 上側、左から25%
      { name: '人', isTop: true, ratio: 0.75 },     // 上側、左から75%
      { name: '材料', isTop: false, ratio: 0.25 },  // 下側、左から25%
      { name: '方法', isTop: false, ratio: 0.75 }   // 下側、左から75%
    ];

    categories.forEach((category, index) => {
      const config = layout[index] || layout[0];
      const x = startX + totalWidth * config.ratio;

      positions.push({
        spineX: x,
        spineY: y,
        isTop: config.isTop,
        name: category.name
      });
    });

    return positions;
  }

  /**
   * 1つのカテゴリー（大骨）を描画
   * @param {Object} category - カテゴリーデータ
   * @param {Object} pos - 位置情報
   * @param {number} index - インデックス
   */
  drawCategory(category, pos, index) {
    const { length, angle, strokeWidth, color, boxWidth, boxHeight, fontSize, fontWeight } = this.config.majorBone;

    // 大骨の角度をラジアンに変換
    const rad = (angle * Math.PI) / 180;

    // 大骨の終点座標を計算
    const endX = pos.spineX - length * Math.cos(rad);
    const endY = pos.isTop
      ? pos.spineY - length * Math.sin(rad)
      : pos.spineY + length * Math.sin(rad);

    // 大骨の線（矢印なし）
    const boneLine = this.createLine(
      pos.spineX,
      pos.spineY,
      endX,
      endY,
      strokeWidth,
      color
    );
    this.mainGroup.appendChild(boneLine);

    // カテゴリーボックス
    const group = this.createGroup();
    const rect = this.createRect(
      endX - boxWidth / 2,
      endY - boxHeight / 2,
      boxWidth,
      boxHeight,
      '#3498db',
      '#fff',
      2
    );
    group.appendChild(rect);

    const text = this.createText(
      endX,
      endY,
      category.name,
      fontSize,
      fontWeight,
      '#fff',
      'middle'
    );
    group.appendChild(text);

    this.makeGroupDraggable(group, 'category', category);
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'category', element: group, data: category });

    // 中骨を描画
    this.drawCauses(category.causes, pos, endX, endY, pos.isTop, angle);
  }

  /**
   * 中骨を描画（水平線、左右配置）
   * @param {Array} causes - 原因配列
   * @param {Object} spinePos - 背骨の位置
   * @param {number} boneEndX - 大骨の終点X
   * @param {number} boneEndY - 大骨の終点Y
   * @param {boolean} isTop - 上側かどうか
   * @param {number} majorAngle - 大骨の角度
   */
  drawCauses(causes, spinePos, boneEndX, boneEndY, isTop, majorAngle) {
    const { length, strokeWidth, color, fontSize, spacing } = this.config.mediumBone;

    causes.forEach((cause, index) => {
      // 中骨の開始点を大骨上に配置
      const t = 0.2 + index * 0.2; // 大骨上の位置（0.2, 0.4, 0.6, 0.8）
      const startX = spinePos.spineX - (spinePos.spineX - boneEndX) * t;
      const startY = isTop
        ? spinePos.spineY - (spinePos.spineY - boneEndY) * t
        : spinePos.spineY + (boneEndY - spinePos.spineY) * t;

      // 中骨は左右交互に配置（0:右, 1:左, 2:右, 3:左）
      const isRight = index % 2 === 0;
      const direction = isRight ? 1 : -1;  // 右なら+1、左なら-1

      // 中骨は水平線で、大骨から左右に伸びる
      const endX = startX + (direction * length);
      const endY = startY;

      // 中骨の線（水平）
      const causeLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(causeLine);

      // 矢印（大骨側）
      const arrowAngle = isRight ? 0 : 180;
      const arrow = this.createArrowhead(startX, startY, arrowAngle, 8, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=大骨上に配置）
      const labelGroup = this.createGroup();
      const labelWidth = 100;
      const labelHeight = 26;
      const labelXOffset = isRight ? 5 : -labelWidth - 5;
      const labelYOffset = -labelHeight - 5;

      const labelBg = this.createRect(
        startX + labelXOffset,
        startY + labelYOffset,
        labelWidth,
        labelHeight,
        '#ecf0f1',
        '#2c3e50',
        1.5
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        startX + labelXOffset + labelWidth / 2,
        startY + labelYOffset + labelHeight / 2,
        cause.name,
        fontSize,
        'normal',
        '#2c3e50',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'cause', cause);
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'cause', element: labelGroup, data: cause });

      // 小骨を描画
      this.drawSubcauses(cause.subcauses, startX, endX, endY, isRight, majorAngle, index);
    });
  }

  /**
   * 小骨を描画（中骨に対し60度、上下配置）
   * @param {Array} subcauses - 副原因配列
   * @param {number} causeStartX - 中骨の始点X（大骨上）
   * @param {number} causeEndX - 中骨の終点X
   * @param {number} causeEndY - 中骨の終点Y
   * @param {boolean} causeIsRight - 中骨が右側かどうか
   * @param {number} majorAngle - 大骨の角度（60度）
   * @param {number} causeIndex - 中骨のインデックス
   */
  drawSubcauses(subcauses, causeStartX, causeEndX, causeEndY, causeIsRight, majorAngle, causeIndex) {
    const { length, strokeWidth, color, spacing, fontSize } = this.config.smallBone;
    const angle = 60; // 中骨（水平）に対して60度
    const rad = (angle * Math.PI) / 180;

    subcauses.forEach((subcause, index) => {
      // 小骨の開始点を中骨上に配置
      const t = (index + 1) / (subcauses.length + 1); // 中骨を均等分割
      const startX = causeStartX + (causeEndX - causeStartX) * t;
      const startY = causeEndY;

      // 小骨は中骨に対し60度（交互に上下）
      const subcauseIsTop = index % 2 === 0;
      const direction = subcauseIsTop ? -1 : 1;  // 上なら-1、下なら+1

      // 小骨の終点座標を計算（中骨に対し60度）
      const dx = causeIsRight ? length * Math.cos(rad) : -length * Math.cos(rad);
      const endX = startX + dx;
      const endY = startY + direction * length * Math.sin(rad);

      // 小骨の線
      const subcauseLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(subcauseLine);

      // 矢印（中骨側）
      let arrowAngle;
      if (causeIsRight) {
        arrowAngle = subcauseIsTop ? angle + 180 : -angle + 180;
      } else {
        arrowAngle = subcauseIsTop ? -angle : angle;
      }
      const arrow = this.createArrowhead(startX, startY, arrowAngle, 6, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=中骨上に配置）
      const labelGroup = this.createGroup();
      const labelWidth = 90;
      const labelHeight = 24;
      const labelXOffset = subcauseIsTop ? -labelWidth / 2 : -labelWidth / 2;
      const labelYOffset = subcauseIsTop ? -labelHeight - 5 : 5;

      const labelBg = this.createRect(
        startX + labelXOffset,
        startY + labelYOffset,
        labelWidth,
        labelHeight,
        '#ecf0f1',
        '#34495e',
        1
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        startX + labelXOffset + labelWidth / 2,
        startY + labelYOffset + labelHeight / 2,
        subcause.name,
        fontSize,
        'normal',
        '#34495e',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'subcause', subcause);
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'subcause', element: labelGroup, data: subcause });

      // 孫骨を描画
      this.drawDetails(subcause.details, startX, startY, endX, endY, subcauseIsTop, causeIsRight, index);
    });
  }

  /**
   * 孫骨を描画（水平線、上下配置）
   * @param {Array} details - 詳細配列
   * @param {number} subcauseStartX - 小骨の始点X（中骨上）
   * @param {number} subcauseStartY - 小骨の始点Y（中骨上）
   * @param {number} subcauseEndX - 小骨の終点X
   * @param {number} subcauseEndY - 小骨の終点Y
   * @param {boolean} subcauseIsTop - 小骨が上側かどうか
   * @param {boolean} causeIsRight - 中骨が右側かどうか
   * @param {number} subcauseIndex - 小骨のインデックス
   */
  drawDetails(details, subcauseStartX, subcauseStartY, subcauseEndX, subcauseEndY, subcauseIsTop, causeIsRight, subcauseIndex) {
    const { length, strokeWidth, color, spacing, fontSize } = this.config.tinyBone;

    details.forEach((detail, index) => {
      // 孫骨の開始点を小骨上に配置（小骨は斜めなのでY座標も変化）
      const t = (index + 1) / (details.length + 1); // 小骨を均等分割

      const startX = subcauseStartX + (subcauseEndX - subcauseStartX) * t;
      const startY = subcauseStartY + (subcauseEndY - subcauseStartY) * t;  // Y座標も補間

      // 孫骨は水平線（交互に上下）
      const detailIsTop = index % 2 === 0;
      const verticalDirection = detailIsTop ? -1 : 1;

      // 孫骨は水平に伸びる
      const direction = causeIsRight ? 1 : -1;
      const endX = startX + (direction * length);
      const endY = startY;

      // 孫骨の線（水平）
      const detailLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(detailLine);

      // 矢印（小骨側）
      const arrowAngle = causeIsRight ? 0 : 180;
      const arrow = this.createArrowhead(startX, startY, arrowAngle, 5, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=小骨上に配置）
      const labelGroup = this.createGroup();
      const labelWidth = 70;
      const labelHeight = 20;
      const labelXOffset = -labelWidth / 2;
      const labelYOffset = detailIsTop ? -labelHeight - 3 : 3;

      const labelBg = this.createRect(
        startX + labelXOffset,
        startY + labelYOffset,
        labelWidth,
        labelHeight,
        '#ecf0f1',
        '#7f8c8d',
        1
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        startX + labelXOffset + labelWidth / 2,
        startY + labelYOffset + labelHeight / 2,
        detail,
        fontSize,
        'normal',
        '#7f8c8d',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'detail', { name: detail });
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'detail', element: labelGroup, data: { name: detail } });
    });
  }

  // ========== SVG要素作成ユーティリティ ==========

  /**
   * グループ要素を作成
   */
  createGroup() {
    return document.createElementNS('http://www.w3.org/2000/svg', 'g');
  }

  /**
   * 線を作成
   */
  createLine(x1, y1, x2, y2, strokeWidth, color) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', strokeWidth);
    return line;
  }

  /**
   * 矩形を作成
   */
  createRect(x, y, width, height, fill, stroke, strokeWidth) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', strokeWidth);
    rect.setAttribute('rx', 5);
    return rect;
  }

  /**
   * テキストを作成
   */
  createText(x, y, text, fontSize, fontWeight, fill, textAnchor) {
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', x);
    textEl.setAttribute('y', y);
    textEl.setAttribute('font-size', fontSize);
    textEl.setAttribute('font-weight', fontWeight);
    textEl.setAttribute('fill', fill);
    textEl.setAttribute('text-anchor', textAnchor);
    textEl.setAttribute('dominant-baseline', 'middle');
    textEl.textContent = text;
    return textEl;
  }

  /**
   * 矢印を作成
   */
  createArrowhead(x, y, angle, size, color) {
    const group = this.createGroup();
    const rad = (angle * Math.PI) / 180;

    const points = [
      { x: x, y: y },
      { x: x - size * Math.cos(rad - Math.PI / 6), y: y - size * Math.sin(rad - Math.PI / 6) },
      { x: x - size * Math.cos(rad + Math.PI / 6), y: y - size * Math.sin(rad + Math.PI / 6) }
    ];

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    polygon.setAttribute('fill', color);

    group.appendChild(polygon);
    return group;
  }

  // ========== ドラッグ&ドロップ機能 ==========

  /**
   * イベントリスナーを設定
   */
  setupEventListeners() {
    // ドラッグ&ドロップ
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));

    // ズーム機能（ホイール）
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });

    // パン機能（中クリックまたはSpaceキー押下時）
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());

    let spacePressed = false;
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !spacePressed) {
        spacePressed = true;
        this.svg.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        spacePressed = false;
        this.svg.style.cursor = 'default';
      }
    });

    // リセットボタン（ダブルクリック）
    this.svg.addEventListener('dblclick', this.resetView.bind(this));

    // タッチイベント（モバイル対応）
    this.svg.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.svg.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.svg.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  }

  /**
   * グループをドラッグ可能に設定
   */
  makeGroupDraggable(group, type, data = null) {
    group.setAttribute('cursor', 'move');
    group.setAttribute('data-type', type);
    group.setAttribute('data-draggable', 'true');
    if (data) {
      group.setAttribute('data-name', data.name || '');
    }
  }

  /**
   * マウスダウンイベント
   */
  onMouseDown(e) {
    const target = e.target;
    let group = target;

    // 親グループを探す
    while (group && group.tagName !== 'g') {
      group = group.parentElement;
    }

    // 中クリックまたはSpaceキー押下時はパン
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
      this.offset = {
        x: pt.x - matrix.e,
        y: pt.y - matrix.f
      };

      group.style.opacity = '0.7';
    }
  }

  /**
   * マウス移動イベント
   */
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

  /**
   * マウスアップイベント
   */
  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.svg.style.cursor = 'grab';
    }

    if (this.draggingElement) {
      this.draggingElement.style.opacity = '1';
      this.draggingElement = null;
    }
  }

  /**
   * マウスホイールイベント（ズーム）
   */
  onWheel(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? 1.1 : 0.9;
    const pt = this.getMousePosition(e);

    // ズーム中心点を基準にビューボックスを調整
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

  /**
   * ビューをリセット（ダブルクリック）
   */
  resetView() {
    this.viewBox = { x: 0, y: 0, width: 1600, height: 900 };
    this.zoomLevel = 1;
    this.updateViewBox();
  }

  /**
   * ビューボックスを更新
   */
  updateViewBox() {
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
  }

  /**
   * マウス位置を取得（SVG座標系）
   */
  getMousePosition(e) {
    const CTM = this.svg.getScreenCTM();
    return {
      x: (e.clientX - CTM.e) / CTM.a,
      y: (e.clientY - CTM.f) / CTM.d
    };
  }

  // ========== タッチイベント（モバイル対応） ==========

  /**
   * タッチ開始イベント
   */
  onTouchStart(e) {
    e.preventDefault();
    this.touches = Array.from(e.touches);

    if (this.touches.length === 1) {
      // 1本指タッチ：ドラッグまたはパン
      const touch = this.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      let group = target;

      // 親グループを探す
      while (group && group.tagName !== 'g') {
        group = group.parentElement;
      }

      if (group && group.getAttribute('data-draggable') === 'true') {
        // ラベルのドラッグ
        this.draggingElement = group;
        const pt = this.getTouchPosition(touch);
        const matrix = group.getCTM();
        this.offset = {
          x: pt.x - matrix.e,
          y: pt.y - matrix.f
        };
        group.style.opacity = '0.7';
      } else {
        // パン
        this.isPanning = true;
        this.panStart = this.getTouchPosition(touch);
      }
    } else if (this.touches.length === 2) {
      // 2本指タッチ：ピンチズーム
      this.isPanning = false;
      this.draggingElement = null;
      this.lastTouchDistance = this.getTouchDistance(this.touches[0], this.touches[1]);
    }
  }

  /**
   * タッチ移動イベント
   */
  onTouchMove(e) {
    e.preventDefault();
    this.touches = Array.from(e.touches);

    if (this.touches.length === 1) {
      const touch = this.touches[0];

      if (this.draggingElement) {
        // ラベルのドラッグ
        const pt = this.getTouchPosition(touch);
        const x = pt.x - this.offset.x;
        const y = pt.y - this.offset.y;
        this.draggingElement.setAttribute('transform', `translate(${x}, ${y})`);
      } else if (this.isPanning) {
        // パン
        const pt = this.getTouchPosition(touch);
        const dx = pt.x - this.panStart.x;
        const dy = pt.y - this.panStart.y;

        this.viewBox.x -= dx;
        this.viewBox.y -= dy;
        this.updateViewBox();

        this.panStart = this.getTouchPosition(touch);
      }
    } else if (this.touches.length === 2) {
      // ピンチズーム
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

  /**
   * タッチ終了イベント
   */
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

  /**
   * タッチ位置を取得（SVG座標系）
   */
  getTouchPosition(touch) {
    const CTM = this.svg.getScreenCTM();
    return {
      x: (touch.clientX - CTM.e) / CTM.a,
      y: (touch.clientY - CTM.f) / CTM.d
    };
  }

  /**
   * 2点間の距離を取得
   */
  getTouchDistance(touch1, touch2) {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ========== エクスポート機能 ==========

  /**
   * SVGをPNG画像としてダウンロード
   */
  exportAsPNG() {
    // SVGのクローンを作成してスタイルを埋め込む
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('width', this.config.width);
    svgClone.setAttribute('height', this.config.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.config.width} ${this.config.height}`);

    // SVGをシリアライズ
    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = this.config.width;
    canvas.height = this.config.height;

    img.onload = () => {
      // 白い背景を描画
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      // PNGとしてダウンロード
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

    img.onerror = (err) => {
      console.error('PNG export error:', err);
      alert('PNG形式でのエクスポートに失敗しました。代わりにSVG形式をお試しください。');
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  /**
   * SVGファイルとしてダウンロード
   */
  exportAsSVG() {
    // SVGのクローンを作成
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', this.config.width);
    svgClone.setAttribute('height', this.config.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.config.width} ${this.config.height}`);

    // SVGをシリアライズ
    const svgData = new XMLSerializer().serializeToString(svgClone);

    // XML宣言を追加
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

// グローバルに公開
if (typeof window !== 'undefined') {
  window.IshikawaDiagram = IshikawaDiagram;
}
