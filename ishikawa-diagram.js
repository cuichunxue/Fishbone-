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

    // 描画設定
    this.config = {
      width: 1400,
      height: 900,
      margin: { left: 50, right: 50, top: 50, bottom: 50 },

      // 背骨（主骨）設定
      spine: {
        startX: 100,
        endX: 1100,
        y: 450,
        strokeWidth: 4,
        color: '#2c3e50'
      },

      // 特性ボックス設定
      effect: {
        x: 1100,
        y: 420,
        width: 240,
        height: 60,
        fontSize: 18,
        fontWeight: 'bold'
      },

      // 大骨設定
      majorBone: {
        length: 200,
        angle: 30, // 度
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
        length: 120,
        strokeWidth: 2,
        color: '#7f8c8d',
        spacing: 70,
        fontSize: 14,
        labelOffset: 10
      },

      // 小骨設定
      smallBone: {
        length: 80,
        strokeWidth: 1.5,
        color: '#95a5a6',
        spacing: 35,
        fontSize: 12,
        labelOffset: 8
      },

      // 孫骨設定
      tinyBone: {
        length: 60,
        strokeWidth: 1,
        color: '#bdc3c7',
        spacing: 20,
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
    this.svg.setAttribute('width', this.config.width);
    this.svg.setAttribute('height', this.config.height);
    this.svg.style.border = '1px solid #ddd';
    this.svg.style.backgroundColor = '#ffffff';

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
    this.svg.appendChild(spineLine);

    // 矢印
    const arrowSize = 15;
    const arrow = this.createArrowhead(endX, y, 0, arrowSize, color);
    this.svg.appendChild(arrow);
  }

  /**
   * 特性ボックスを描画
   */
  drawEffect() {
    const { x, y, width, height, fontSize, fontWeight } = this.config.effect;

    const group = this.createGroup();

    // ボックス
    const rect = this.createRect(x, y, width, height, '#e74c3c', '#fff', 2);
    group.appendChild(rect);

    // テキスト
    const text = this.createText(
      x + width / 2,
      y + height / 2,
      this.data.effect,
      fontSize,
      fontWeight,
      '#fff',
      'middle'
    );
    group.appendChild(text);

    // ドラッグ可能に設定
    this.makeGroupDraggable(group, 'effect');

    this.svg.appendChild(group);
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
      { name: '機械', isTop: true, ratio: 0.3 },   // 上側、左から30%
      { name: '人', isTop: true, ratio: 0.7 },     // 上側、左から70%
      { name: '材料', isTop: false, ratio: 0.3 },  // 下側、左から30%
      { name: '方法', isTop: false, ratio: 0.7 }   // 下側、左から70%
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
    this.svg.appendChild(boneLine);

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
    this.svg.appendChild(group);
    this.elements.push({ type: 'category', element: group, data: category });

    // 中骨を描画
    this.drawCauses(category.causes, pos, endX, endY, pos.isTop, angle);
  }

  /**
   * 中骨を描画
   * @param {Array} causes - 原因配列
   * @param {Object} spinePos - 背骨の位置
   * @param {number} boneEndX - 大骨の終点X
   * @param {number} boneEndY - 大骨の終点Y
   * @param {boolean} isTop - 上側かどうか
   * @param {number} majorAngle - 大骨の角度
   */
  drawCauses(causes, spinePos, boneEndX, boneEndY, isTop, majorAngle) {
    const { length, strokeWidth, color, spacing, fontSize, labelOffset } = this.config.mediumBone;
    const rad = (majorAngle * Math.PI) / 180;

    causes.forEach((cause, index) => {
      // 中骨の開始点を大骨上に配置
      const t = 0.3 + index * 0.25; // 大骨上の位置（0.3, 0.55, 0.8）
      const startX = spinePos.spineX - (spinePos.spineX - boneEndX) * t;
      const startY = isTop
        ? spinePos.spineY - (spinePos.spineY - boneEndY) * t
        : spinePos.spineY + (boneEndY - spinePos.spineY) * t;

      // 中骨は水平線（左→右）
      const endX = startX - length;
      const endY = startY;

      // 中骨の線
      const causeLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.svg.appendChild(causeLine);

      // 矢印（大骨側）
      const arrow = this.createArrowhead(startX, startY, 0, 8, color);
      this.svg.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const labelBg = this.createRect(
        endX - 100,
        endY - 15,
        100,
        30,
        '#ecf0f1',
        '#2c3e50',
        1
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        endX - 50,
        endY,
        cause.name,
        fontSize,
        'normal',
        '#2c3e50',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'cause', cause);
      this.svg.appendChild(labelGroup);
      this.elements.push({ type: 'cause', element: labelGroup, data: cause });

      // 小骨を描画
      this.drawSubcauses(cause.subcauses, endX, endY, isTop, majorAngle);
    });
  }

  /**
   * 小骨を描画
   * @param {Array} subcauses - 副原因配列
   * @param {number} causeEndX - 中骨の終点X
   * @param {number} causeEndY - 中骨の終点Y
   * @param {boolean} isTop - 上側かどうか
   * @param {number} majorAngle - 大骨の角度
   */
  drawSubcauses(subcauses, causeEndX, causeEndY, isTop, majorAngle) {
    const { length, strokeWidth, color, spacing, fontSize, labelOffset } = this.config.smallBone;
    const rad = (majorAngle * Math.PI) / 180;

    subcauses.forEach((subcause, index) => {
      // 小骨の開始点を中骨上に配置
      const startX = causeEndX + index * 40;
      const startY = causeEndY;

      // 小骨は斜め線（大骨と同じ向き）
      const endX = startX - length * Math.cos(rad);
      const endY = isTop
        ? startY - length * Math.sin(rad)
        : startY + length * Math.sin(rad);

      // 小骨の線
      const subcauseLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.svg.appendChild(subcauseLine);

      // 矢印（中骨側）
      const arrowAngle = isTop ? majorAngle : -majorAngle;
      const arrow = this.createArrowhead(startX, startY, arrowAngle, 6, color);
      this.svg.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const labelBg = this.createRect(
        endX - 40,
        endY - 12,
        80,
        24,
        '#ecf0f1',
        '#34495e',
        1
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        endX,
        endY,
        subcause.name,
        fontSize,
        'normal',
        '#34495e',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'subcause', subcause);
      this.svg.appendChild(labelGroup);
      this.elements.push({ type: 'subcause', element: labelGroup, data: subcause });

      // 孫骨を描画
      this.drawDetails(subcause.details, endX, endY, isTop);
    });
  }

  /**
   * 孫骨を描画
   * @param {Array} details - 詳細配列
   * @param {number} subcauseEndX - 小骨の終点X
   * @param {number} subcauseEndY - 小骨の終点Y
   * @param {boolean} isTop - 上側かどうか
   */
  drawDetails(details, subcauseEndX, subcauseEndY, isTop) {
    const { length, strokeWidth, color, spacing, fontSize, labelOffset } = this.config.tinyBone;

    details.forEach((detail, index) => {
      // 孫骨の開始点を小骨上に配置
      const startX = subcauseEndX + index * 30;
      const startY = subcauseEndY;

      // 孫骨は水平線
      const endX = startX - length;
      const endY = startY;

      // 孫骨の線
      const detailLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.svg.appendChild(detailLine);

      // 矢印（小骨側）
      const arrow = this.createArrowhead(startX, startY, 0, 5, color);
      this.svg.appendChild(arrow);

      // ラベル
      const labelGroup = this.createGroup();
      const labelBg = this.createRect(
        endX - 50,
        endY - 10,
        50,
        20,
        '#ecf0f1',
        '#7f8c8d',
        1
      );
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        endX - 25,
        endY,
        detail,
        fontSize,
        'normal',
        '#7f8c8d',
        'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'detail', { name: detail });
      this.svg.appendChild(labelGroup);
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
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));
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

    if (group && group.getAttribute('data-draggable') === 'true') {
      this.draggingElement = group;

      const svgRect = this.svg.getBoundingClientRect();
      const matrix = group.getCTM();

      this.offset = {
        x: e.clientX - svgRect.left - matrix.e,
        y: e.clientY - svgRect.top - matrix.f
      };

      group.style.opacity = '0.7';
    }
  }

  /**
   * マウス移動イベント
   */
  onMouseMove(e) {
    if (!this.draggingElement) return;

    const svgRect = this.svg.getBoundingClientRect();
    const x = e.clientX - svgRect.left - this.offset.x;
    const y = e.clientY - svgRect.top - this.offset.y;

    this.draggingElement.setAttribute('transform', `translate(${x}, ${y})`);
  }

  /**
   * マウスアップイベント
   */
  onMouseUp(e) {
    if (this.draggingElement) {
      this.draggingElement.style.opacity = '1';
      this.draggingElement = null;
    }
  }

  // ========== エクスポート機能 ==========

  /**
   * SVGをPNG画像としてダウンロード
   */
  exportAsPNG() {
    const svgData = new XMLSerializer().serializeToString(this.svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    canvas.width = this.config.width;
    canvas.height = this.config.height;

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ishikawa-diagram.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  }

  /**
   * SVGファイルとしてダウンロード
   */
  exportAsSVG() {
    const svgData = new XMLSerializer().serializeToString(this.svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ishikawa-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.IshikawaDiagram = IshikawaDiagram;
}
