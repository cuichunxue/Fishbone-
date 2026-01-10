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
    this.viewBox = { x: 0, y: 0, width: 1900, height: 1000 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.zoomLevel = 1;

    // タッチ操作用
    this.touches = [];
    this.lastTouchDistance = 0;

    // レスポンシブ対応用
    this.resizeObserver = null;
    this.resizeTimeout = null;

    // ブレークポイント定義
    this.breakpoints = {
      smallMobile: 480,      // 小型スマートフォン
      mobile: 768,           // 標準スマートフォン
      tablet: 1024,          // タブレット
      laptop: 1440,          // ノートPC/小型デスクトップ
      desktop: 1920          // 標準デスクトップ
      // 1920px以上: 大型デスクトップ
    };

    // 描画設定
    this.config = {
      width: 1900,
      height: 1000,
      margin: { left: 50, right: 50, top: 50, bottom: 50 },

      // 背骨（主骨）設定
      spine: {
        startX: 100,
        endX: 1600,
        y: 500,
        strokeWidth: 4,
        color: '#2c3e50'
      },

      // 特性ボックス設定（縦書き縦長）
      effect: {
        x: 1750,
        y: 250,
        width: 80,
        height: 500,
        fontSize: 20,
        fontWeight: 'bold'
      },

      // 大骨設定
      majorBone: {
        length: 550,
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
        length: 260,
        strokeWidth: 2,
        color: '#7f8c8d',
        spacing: 50,
        fontSize: 14,
        labelOffset: 10
      },

      // 小骨設定
      smallBone: {
        length: 90,
        strokeWidth: 1.5,
        color: '#95a5a6',
        spacing: 45,
        fontSize: 12,
        labelOffset: 8
      },

      // 孫骨設定
      tinyBone: {
        length: 55,
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
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.border = '1px solid #ddd';
    this.svg.style.backgroundColor = '#ffffff';
    this.svg.style.cursor = 'default';
    this.svg.style.touchAction = 'none'; // タッチ操作を完全制御
    this.svg.style.maxHeight = '100vh'; // ビューポートの高さを超えない

    // メインコンテンツグループ
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);

    this.container.appendChild(this.svg);

    // マウスイベントを設定
    this.setupEventListeners();

    // レスポンシブ対応を設定
    this.setupResponsive();
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
    const { x, y, fontSize, fontWeight } = this.config.effect;
    const maxCharsPerColumn = 18; // 1列あたりの最大文字数
    const columnSpacing = 30; // 列間隔

    const chars = this.data.effect.split('');
    const numColumns = Math.ceil(chars.length / maxCharsPerColumn);
    const totalWidth = 50 + (numColumns - 1) * columnSpacing;
    const height = 500;

    const group = this.createGroup();

    // ボックス
    const rect = this.createRect(x, y, totalWidth, height, '#e74c3c', '#fff', 2);
    group.appendChild(rect);

    // 各列にテキストを配置
    for (let col = 0; col < numColumns; col++) {
      const startIdx = col * maxCharsPerColumn;
      const endIdx = Math.min(startIdx + maxCharsPerColumn, chars.length);
      const columnChars = chars.slice(startIdx, endIdx);

      // 列ごとにtext要素を作成
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const xPos = x + 25 + col * columnSpacing;
      text.setAttribute('x', xPos);
      text.setAttribute('y', y + 30);
      text.setAttribute('font-size', fontSize);
      text.setAttribute('font-weight', fontWeight);
      text.setAttribute('fill', '#fff');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('writing-mode', 'tb');  // 縦書き
      text.setAttribute('glyph-orientation-vertical', '0');

      // 1文字ずつ縦に配置
      columnChars.forEach(char => {
        const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        tspan.setAttribute('x', xPos);
        tspan.setAttribute('dy', fontSize + 5);
        tspan.textContent = char;
        text.appendChild(tspan);
      });

      group.appendChild(text);
    }

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
      { name: '機械', isTop: true, ratio: 0.2 },    // 上側、左から20%
      { name: '人', isTop: true, ratio: 0.8 },      // 上側、左から80%
      { name: '材料', isTop: false, ratio: 0.2 },   // 下側、左から20%
      { name: '方法', isTop: false, ratio: 0.8 }    // 下側、左から80%
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

    // 大骨の線
    const boneLine = this.createLine(
      pos.spineX,
      pos.spineY,
      endX,
      endY,
      strokeWidth,
      color
    );
    this.mainGroup.appendChild(boneLine);

    // 矢印（背骨上に配置、背骨に向かって指す）
    const arrowDx = pos.spineX - endX;
    const arrowDy = pos.spineY - endY;
    const arrowAngle = Math.atan2(arrowDy, arrowDx) * 180 / Math.PI;
    const arrow = this.createArrowhead(pos.spineX, pos.spineY, arrowAngle, 10, color);
    this.mainGroup.appendChild(arrow);

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
      // 中骨の終点を大骨上に配置（均等間隔で配置）
      const t = 0.18 + index * 0.22; // 大骨上の位置（0.18, 0.40, 0.62, 0.84）
      const endX = spinePos.spineX - (spinePos.spineX - boneEndX) * t;
      const endY = isTop
        ? spinePos.spineY - (spinePos.spineY - boneEndY) * t
        : spinePos.spineY + (boneEndY - spinePos.spineY) * t;

      // 中骨は左右交互に配置（0:右, 1:左, 2:右, 3:左）
      const isRight = index % 2 === 0;
      const direction = isRight ? 1 : -1;  // 右なら+1、左なら-1

      // 中骨は水平線で、外側から大骨へ向かう
      const startX = endX + (direction * length);
      const startY = endY;

      // 中骨の線（水平）
      const causeLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(causeLine);

      // 矢印（終点=大骨上に配置）
      const arrowAngle = isRight ? 180 : 0;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, 8, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=外側にテキストのみ）
      const labelGroup = this.createGroup();
      const labelXOffset = isRight ? 5 : -5;
      const labelYOffset = -8;

      const labelText = this.createText(
        startX + labelXOffset,
        startY + labelYOffset,
        cause.name,
        fontSize,
        'normal',
        '#2c3e50',
        isRight ? 'start' : 'end'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'cause', cause);
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'cause', element: labelGroup, data: cause });

      // 小骨を描画
      this.drawSubcauses(cause.subcauses, startX, startY, endX, endY, isRight, majorAngle, index);
    });
  }

  /**
   * 小骨を描画（中骨に対し60度、上下配置）
   * @param {Array} subcauses - 副原因配列
   * @param {number} causeStartX - 中骨の始点X（外側）
   * @param {number} causeStartY - 中骨の始点Y
   * @param {number} causeEndX - 中骨の終点X（大骨上）
   * @param {number} causeEndY - 中骨の終点Y
   * @param {boolean} causeIsRight - 中骨が右側かどうか
   * @param {number} majorAngle - 大骨の角度（60度）
   * @param {number} causeIndex - 中骨のインデックス
   */
  drawSubcauses(subcauses, causeStartX, causeStartY, causeEndX, causeEndY, causeIsRight, majorAngle, causeIndex) {
    const { length, strokeWidth, color, spacing, fontSize } = this.config.smallBone;
    const angle = 60; // 中骨（水平）に対して60度
    const rad = (angle * Math.PI) / 180;

    subcauses.forEach((subcause, index) => {
      // 小骨の終点を中骨上に配置
      const t = (index + 1) / (subcauses.length + 1); // 中骨を均等分割
      const endX = causeStartX + (causeEndX - causeStartX) * t;
      const endY = causeStartY + (causeEndY - causeStartY) * t;

      // 小骨は中骨に対し60度（交互に上下）
      const subcauseIsTop = index % 2 === 0;
      const direction = subcauseIsTop ? -1 : 1;  // 上なら-1、下なら+1

      // 小骨の始点座標を計算（外側から中骨へ60度）
      const offsetX = causeIsRight ? length * Math.cos(rad) : -length * Math.cos(rad);
      const startX = endX + offsetX;
      const startY = endY + direction * length * Math.sin(rad);

      // 小骨の線
      const subcauseLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(subcauseLine);

      // 矢印（終点=中骨上に配置、線の進行方向に沿う）
      const arrowDx = endX - startX;
      const arrowDy = endY - startY;
      const arrowAngle = Math.atan2(arrowDy, arrowDx) * 180 / Math.PI;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, 6, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=外側にテキストのみ）
      const labelGroup = this.createGroup();
      const labelXOffset = 0;
      const labelYOffset = subcauseIsTop ? -5 : 15;

      const labelText = this.createText(
        startX + labelXOffset,
        startY + labelYOffset,
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
   * @param {number} subcauseStartX - 小骨の始点X（外側）
   * @param {number} subcauseStartY - 小骨の始点Y
   * @param {number} subcauseEndX - 小骨の終点X（中骨上）
   * @param {number} subcauseEndY - 小骨の終点Y
   * @param {boolean} subcauseIsTop - 小骨が上側かどうか
   * @param {boolean} causeIsRight - 中骨が右側かどうか
   * @param {number} subcauseIndex - 小骨のインデックス
   */
  drawDetails(details, subcauseStartX, subcauseStartY, subcauseEndX, subcauseEndY, subcauseIsTop, causeIsRight, subcauseIndex) {
    const { length, strokeWidth, color, spacing, fontSize } = this.config.tinyBone;

    details.forEach((detail, index) => {
      // 孫骨の終点を小骨上に配置（小骨は斜めなのでY座標も変化）
      const t = (index + 1) / (details.length + 1); // 小骨を均等分割

      const endX = subcauseStartX + (subcauseEndX - subcauseStartX) * t;
      const endY = subcauseStartY + (subcauseEndY - subcauseStartY) * t;  // Y座標も補間

      // 孫骨は水平線（交互に上下）
      const detailIsTop = index % 2 === 0;
      const verticalDirection = detailIsTop ? -1 : 1;

      // 孫骨は外側から小骨へ水平に伸びる
      const direction = causeIsRight ? 1 : -1;
      const startX = endX + (direction * length);
      const startY = endY;

      // 孫骨の線（水平）
      const detailLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(detailLine);

      // 矢印（終点=小骨上に配置）
      const arrowAngle = causeIsRight ? 180 : 0;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, 5, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（始点=外側にテキストのみ、長い場合は2行）
      const labelGroup = this.createGroup();
      const labelXOffset = 0;
      const labelYOffset = detailIsTop ? -5 : 15;

      const labelText = this.createMultilineText(
        startX + labelXOffset,
        startY + labelYOffset,
        detail,
        fontSize,
        'normal',
        '#7f8c8d',
        'middle',
        8  // 最大8文字で改行
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
   * 複数行テキストを作成
   */
  createMultilineText(x, y, text, fontSize, fontWeight, fill, textAnchor, maxChars = 8) {
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', x);
    textEl.setAttribute('y', y);
    textEl.setAttribute('font-size', fontSize);
    textEl.setAttribute('font-weight', fontWeight);
    textEl.setAttribute('fill', fill);
    textEl.setAttribute('text-anchor', textAnchor);

    // テキストが短い場合は1行
    if (text.length <= maxChars) {
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.textContent = text;
    } else {
      // テキストが長い場合は2行に分割
      const line1 = text.substring(0, maxChars);
      const line2 = text.substring(maxChars);

      const tspan1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan1.setAttribute('x', x);
      tspan1.setAttribute('dy', -fontSize * 0.5);
      tspan1.textContent = line1;

      const tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan2.setAttribute('x', x);
      tspan2.setAttribute('dy', fontSize);
      tspan2.textContent = line2;

      textEl.appendChild(tspan1);
      textEl.appendChild(tspan2);
    }

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

    // 中クリックまたはShiftキー押下時はパン
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
    } else {
      // 背景（空白部分）をクリックした場合はグラフ全体を移動
      this.isPanning = true;
      this.panStart = this.getMousePosition(e);
      this.svg.style.cursor = 'grabbing';
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
      this.svg.style.cursor = 'default';
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
    this.viewBox = { x: 0, y: 0, width: 1900, height: 1000 };
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
   * レスポンシブ対応を設定
   */
  setupResponsive() {
    // ResizeObserverでコンテナサイズの変更を監視
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(entries => {
        // デバウンス処理（連続したリサイズイベントを制限）
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
          this.handleResize();
        }, 100);
      });
      this.resizeObserver.observe(this.container);
    }

    // ウィンドウリサイズイベント（フォールバック）
    window.addEventListener('resize', () => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 100);
    });

    // 初回サイズ調整
    this.handleResize();
  }

  /**
   * リサイズ処理
   */
  handleResize() {
    if (!this.svg || !this.container) return;

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const viewportHeight = window.innerHeight;
    const aspectRatio = this.config.width / this.config.height; // 1900 / 1000 = 1.9

    // デバイスの向きを検出
    const isPortrait = window.innerHeight > window.innerWidth;

    // デバイスタイプを判定
    const deviceType = this.getDeviceType(containerWidth);

    // ブレークポイント別の設定
    let heightConfig = this.getHeightConfig(deviceType, containerWidth, viewportHeight, isPortrait);

    // アスペクト比から基本の高さを計算
    let svgHeight = containerWidth / aspectRatio;

    // デバイス別の最適化
    switch (deviceType) {
      case 'smallMobile':
        // 小型スマートフォン (< 480px)
        svgHeight = Math.min(svgHeight, heightConfig.max);
        this.svg.style.height = `${svgHeight}px`;
        this.svg.style.minHeight = `${heightConfig.min}px`;
        break;

      case 'mobile':
        // 標準スマートフォン (480-768px)
        svgHeight = Math.min(svgHeight, heightConfig.max);
        if (isPortrait) {
          // 縦向き: コンパクトに表示
          this.svg.style.height = `${Math.min(svgHeight, viewportHeight * 0.6)}px`;
        } else {
          // 横向き: より広く表示
          this.svg.style.height = `${Math.min(svgHeight, viewportHeight * 0.85)}px`;
        }
        this.svg.style.minHeight = `${heightConfig.min}px`;
        break;

      case 'tablet':
        // タブレット (768-1024px)
        if (isPortrait) {
          // 縦向き: 適度なサイズ
          svgHeight = Math.min(svgHeight, viewportHeight * 0.7);
        } else {
          // 横向き: 大きめに表示
          svgHeight = Math.min(svgHeight, viewportHeight * 0.8);
        }
        this.svg.style.height = `${Math.max(heightConfig.min, Math.min(svgHeight, heightConfig.max))}px`;
        break;

      case 'laptop':
        // ノートPC/小型デスクトップ (1024-1440px)
        svgHeight = Math.min(svgHeight, viewportHeight * 0.85);
        this.svg.style.height = `${Math.max(heightConfig.min, Math.min(svgHeight, heightConfig.max))}px`;
        break;

      case 'desktop':
        // 標準デスクトップ (1440-1920px)
        svgHeight = Math.min(svgHeight, viewportHeight * 0.9);
        this.svg.style.height = `${Math.max(heightConfig.min, Math.min(svgHeight, heightConfig.max))}px`;
        break;

      case 'largeDesktop':
        // 大型デスクトップ (> 1920px)
        svgHeight = Math.min(svgHeight, 1000); // 最大1000pxに固定
        this.svg.style.height = `${svgHeight}px`;
        break;
    }

    // コンテナにデバイスタイプを設定（CSS用）
    this.container.setAttribute('data-device-type', deviceType);
    this.container.setAttribute('data-orientation', isPortrait ? 'portrait' : 'landscape');
  }

  /**
   * デバイスタイプを判定
   */
  getDeviceType(width) {
    if (width < this.breakpoints.smallMobile) {
      return 'smallMobile';
    } else if (width < this.breakpoints.mobile) {
      return 'mobile';
    } else if (width < this.breakpoints.tablet) {
      return 'tablet';
    } else if (width < this.breakpoints.laptop) {
      return 'laptop';
    } else if (width < this.breakpoints.desktop) {
      return 'desktop';
    } else {
      return 'largeDesktop';
    }
  }

  /**
   * デバイス別の高さ設定を取得
   */
  getHeightConfig(deviceType, containerWidth, viewportHeight, isPortrait) {
    const configs = {
      smallMobile: {
        min: 300,
        max: isPortrait ? 450 : 350,
        ideal: containerWidth / 1.9
      },
      mobile: {
        min: 350,
        max: isPortrait ? 550 : 450,
        ideal: containerWidth / 1.9
      },
      tablet: {
        min: 400,
        max: isPortrait ? 700 : 600,
        ideal: containerWidth / 1.9
      },
      laptop: {
        min: 500,
        max: 850,
        ideal: containerWidth / 1.9
      },
      desktop: {
        min: 600,
        max: 1000,
        ideal: containerWidth / 1.9
      },
      largeDesktop: {
        min: 700,
        max: 1000,
        ideal: 1000
      }
    };

    return configs[deviceType] || configs.desktop;
  }

  /**
   * リソースをクリーンアップ
   */
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
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
