/**
 * 石川ダイアグラム（特性要因図）描画・編集エンジン v2.0
 * 干渉回避アルゴリズムと動的レイアウト最適化を実装
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.data = null;
    this.elements = [];
    this.draggingElement = null;
    this.offset = { x: 0, y: 0 };

    // 干渉検出用の境界ボックス管理
    this.boundingBoxes = [];

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

    // 描画設定（最適化済み）
    this.config = {
      width: 1600,
      height: 900,
      margin: { left: 80, right: 120, top: 60, bottom: 60 },

      // 背骨（主骨）設定
      spine: {
        startX: 80,
        y: 450,
        strokeWidth: 5,
        color: '#1a252f',
        arrowSize: 18
      },

      // 特性ボックス設定（縦書き縦長）
      effect: {
        width: 70,
        height: 420,
        fontSize: 18,
        fontWeight: 'bold',
        bgColor: '#c0392b',
        textColor: '#ffffff',
        borderRadius: 8
      },

      // 大骨設定
      majorBone: {
        angle: 55, // 度（少し鋭角にして干渉を減らす）
        strokeWidth: 3.5,
        color: '#2c3e50',
        arrowSize: 12,
        boxPadding: { x: 16, y: 10 },
        fontSize: 15,
        fontWeight: 'bold',
        boxColor: '#2980b9',
        textColor: '#ffffff'
      },

      // 中骨設定
      mediumBone: {
        strokeWidth: 2.5,
        color: '#5d6d7e',
        arrowSize: 9,
        fontSize: 13,
        fontWeight: '600',
        textColor: '#2c3e50',
        minSpacing: 55 // 中骨間の最小間隔
      },

      // 小骨設定
      smallBone: {
        angle: 55, // 中骨に対する角度
        strokeWidth: 1.8,
        color: '#7f8c8d',
        arrowSize: 7,
        fontSize: 12,
        textColor: '#34495e',
        minSpacing: 35
      },

      // 孫骨設定
      tinyBone: {
        strokeWidth: 1.2,
        color: '#95a5a6',
        arrowSize: 5,
        fontSize: 11,
        textColor: '#5d6d7e',
        minSpacing: 28
      }
    };
  }

  /**
   * ダイアグラムを初期化
   */
  initialize() {
    this.container.innerHTML = '';
    this.boundingBoxes = [];

    // SVG要素を作成
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute('viewBox', `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.backgroundColor = '#ffffff';
    this.svg.style.cursor = 'default';
    this.svg.style.touchAction = 'none';

    // グラデーション定義
    this.createDefs();

    // メインコンテンツグループ
    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);

    this.container.appendChild(this.svg);

    // イベントリスナーを設定
    this.setupEventListeners();
    this.setupResponsive();
  }

  /**
   * SVGのグラデーション等を定義
   */
  createDefs() {
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

    // ドロップシャドウフィルター
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', 'dropShadow');
    filter.setAttribute('x', '-20%');
    filter.setAttribute('y', '-20%');
    filter.setAttribute('width', '140%');
    filter.setAttribute('height', '140%');

    const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    feDropShadow.setAttribute('dx', '2');
    feDropShadow.setAttribute('dy', '2');
    feDropShadow.setAttribute('stdDeviation', '3');
    feDropShadow.setAttribute('flood-color', 'rgba(0,0,0,0.2)');

    filter.appendChild(feDropShadow);
    defs.appendChild(filter);

    this.svg.appendChild(defs);
  }

  /**
   * データを描画
   * @param {Object} data - パース済みデータ
   */
  render(data) {
    this.data = data;
    this.elements = [];
    this.boundingBoxes = [];

    // レイアウトを計算
    const layout = this.calculateOptimalLayout(data);

    // ビューボックスを設定
    this.viewBox = { x: 0, y: 0, width: layout.svgWidth, height: layout.svgHeight };
    this.config.width = layout.svgWidth;
    this.config.height = layout.svgHeight;

    this.initialize();

    // 描画
    this.drawSpine(layout);
    this.drawEffect(layout);
    this.drawAllCategories(layout);
  }

  /**
   * 最適なレイアウトを計算
   */
  calculateOptimalLayout(data) {
    const numCategories = data.categories.length;

    // カテゴリーごとの要素数を詳細に分析
    let maxCausesPerCategory = 0;
    let maxSubcausesPerCause = 0;
    let maxDetailsPerSubcause = 0;
    let totalElements = 0;

    data.categories.forEach(cat => {
      maxCausesPerCategory = Math.max(maxCausesPerCategory, cat.causes.length);
      cat.causes.forEach(cause => {
        totalElements++;
        maxSubcausesPerCause = Math.max(maxSubcausesPerCause, cause.subcauses.length);
        cause.subcauses.forEach(sub => {
          totalElements++;
          maxDetailsPerSubcause = Math.max(maxDetailsPerSubcause, sub.details.length);
          totalElements += sub.details.length;
        });
      });
    });

    // 複雑度係数（要素数に基づく）
    const complexityFactor = Math.min(1.5, 1 + (totalElements / 100));

    // SVGサイズを動的に計算（複雑度を考慮）
    const baseWidth = 1500;
    const categoryWidthFactor = numCategories <= 4 ? 200 : 170;
    let svgWidth = Math.max(baseWidth, baseWidth + (numCategories - 4) * categoryWidthFactor);
    svgWidth = Math.round(svgWidth * Math.min(complexityFactor, 1.3));

    const baseHeight = 900;
    const heightFactor = Math.max(maxCausesPerCategory, 3) * 25;
    const svgHeight = Math.min(1100, Math.max(800, baseHeight + heightFactor));

    // 背骨の長さを計算（効果ボックス用の余白を確保）
    const spineStartX = 100;
    const effectBoxWidth = 90;
    const spineEndX = svgWidth - effectBoxWidth - 40;
    const spineY = svgHeight / 2;

    // 上側と下側のカテゴリー数
    const numTop = Math.ceil(numCategories / 2);
    const numBottom = Math.floor(numCategories / 2);

    // 大骨の長さを計算（上下の干渉を避けるため）
    const spineLength = spineEndX - spineStartX;
    const maxCategorySpacing = spineLength / (Math.max(numTop, numBottom) + 1);

    // 大骨の長さは、カテゴリー間の距離と高さの両方を考慮
    const verticalSpace = svgHeight / 2 - 50; // 背骨から上下端までの距離
    const horizontalLimit = maxCategorySpacing * 0.65;
    const majorBoneLength = Math.min(
      verticalSpace * 0.85,
      horizontalLimit,
      350 // 最大長
    );

    // 中骨の長さ（干渉を避けるため、カテゴリー間の距離に基づいて計算）
    const mediumBoneLengthBase = Math.min(
      majorBoneLength * 0.32,
      maxCategorySpacing * 0.25
    );
    const mediumBoneLength = Math.max(80, Math.min(mediumBoneLengthBase, 130));

    // 小骨の長さ（要素数に応じて調整）
    const smallBoneLengthBase = mediumBoneLength * 0.5;
    const smallBoneLength = Math.max(40, Math.min(smallBoneLengthBase, 65));

    // 孫骨の長さ
    const tinyBoneLength = Math.max(30, Math.min(smallBoneLength * 0.65, 45));

    return {
      svgWidth,
      svgHeight,
      spineStartX,
      spineEndX,
      spineY,
      majorBoneLength,
      mediumBoneLength,
      smallBoneLength,
      tinyBoneLength,
      numCategories,
      numTop,
      numBottom,
      maxCausesPerCategory,
      maxSubcausesPerCause,
      maxDetailsPerSubcause,
      complexityFactor,
      effectBoxWidth
    };
  }

  /**
   * 背骨を描画
   */
  drawSpine(layout) {
    const { spineStartX, spineEndX, spineY } = layout;
    const { strokeWidth, color, arrowSize } = this.config.spine;

    // 背骨の線
    const spineLine = this.createLine(spineStartX, spineY, spineEndX, spineY, strokeWidth, color);
    this.mainGroup.appendChild(spineLine);

    // 矢印
    const arrow = this.createArrowhead(spineEndX, spineY, 0, arrowSize, color);
    this.mainGroup.appendChild(arrow);
  }

  /**
   * 効果ボックスを描画
   */
  drawEffect(layout) {
    const { spineEndX, spineY, svgHeight, effectBoxWidth } = layout;
    const { fontSize, fontWeight, bgColor, textColor, borderRadius } = this.config.effect;

    // 効果ボックスのサイズを動的に計算
    const boxWidth = effectBoxWidth || 80;
    const boxHeight = Math.min(svgHeight * 0.55, 450);

    const boxX = spineEndX + 12;
    const boxY = spineY - boxHeight / 2;

    const group = this.createGroup();

    // ボックス
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', boxX);
    rect.setAttribute('y', boxY);
    rect.setAttribute('width', boxWidth);
    rect.setAttribute('height', boxHeight);
    rect.setAttribute('fill', bgColor);
    rect.setAttribute('rx', borderRadius);
    rect.setAttribute('filter', 'url(#dropShadow)');
    group.appendChild(rect);

    // 縦書きテキスト
    const text = this.data.effect;
    const charSpacing = fontSize + 3;
    const maxCharsPerColumn = Math.floor((boxHeight - 50) / charSpacing);
    const chars = text.split('');
    const numColumns = Math.ceil(chars.length / maxCharsPerColumn);
    const columnSpacing = 22;

    for (let col = 0; col < numColumns; col++) {
      const startIdx = col * maxCharsPerColumn;
      const endIdx = Math.min(startIdx + maxCharsPerColumn, chars.length);
      const columnChars = chars.slice(startIdx, endIdx);

      const xPos = boxX + boxWidth / 2 - ((numColumns - 1) * columnSpacing) / 2 + col * columnSpacing;

      columnChars.forEach((char, i) => {
        const charText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        charText.setAttribute('x', xPos);
        charText.setAttribute('y', boxY + 35 + i * charSpacing);
        charText.setAttribute('font-size', fontSize);
        charText.setAttribute('font-weight', fontWeight);
        charText.setAttribute('fill', textColor);
        charText.setAttribute('text-anchor', 'middle');
        charText.setAttribute('dominant-baseline', 'middle');
        charText.textContent = char;
        group.appendChild(charText);
      });
    }

    this.makeGroupDraggable(group, 'effect');
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'effect', element: group, data: this.data });

    // 境界ボックスを登録
    this.boundingBoxes.push({
      type: 'effect',
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight
    });
  }

  /**
   * 全カテゴリーを描画
   */
  drawAllCategories(layout) {
    const categories = this.data.categories;
    const { spineStartX, spineEndX, spineY, majorBoneLength, numTop, numBottom } = layout;
    const spineLength = spineEndX - spineStartX;

    // 上下に分けて配置（カテゴリーの順序を維持）
    const topCategories = [];
    const bottomCategories = [];

    categories.forEach((cat, i) => {
      if (i % 2 === 0) {
        topCategories.push({ category: cat, originalIndex: i });
      } else {
        bottomCategories.push({ category: cat, originalIndex: i });
      }
    });

    // 配置の最適化：干渉を避けるため、配置位置を計算
    const topSpacing = spineLength / (numTop + 1);
    const bottomSpacing = spineLength / (numBottom + 1);

    // 上側のカテゴリー配置
    topCategories.forEach((item, idx) => {
      const spineX = spineStartX + topSpacing * (idx + 1);

      this.drawCategory(item.category, {
        spineX,
        spineY,
        isTop: true,
        majorBoneLength,
        layout,
        categoryIndex: item.originalIndex,
        totalInRow: numTop,
        indexInRow: idx
      });
    });

    // 下側のカテゴリー配置（上側とオフセットを付けて干渉を減らす）
    bottomCategories.forEach((item, idx) => {
      // 下側は上側と少しずらして配置（干渉回避）
      const offset = topSpacing * 0.5;
      const spineX = spineStartX + offset + bottomSpacing * (idx + 1);

      this.drawCategory(item.category, {
        spineX: Math.min(spineX, spineEndX - 50), // 右端に寄りすぎないよう調整
        spineY,
        isTop: false,
        majorBoneLength,
        layout,
        categoryIndex: item.originalIndex,
        totalInRow: numBottom,
        indexInRow: idx
      });
    });
  }

  /**
   * カテゴリー（大骨）を描画
   */
  drawCategory(category, params) {
    const { spineX, spineY, isTop, majorBoneLength, layout } = params;
    const { angle, strokeWidth, color, arrowSize, boxPadding, fontSize, fontWeight, boxColor, textColor } = this.config.majorBone;

    const rad = (angle * Math.PI) / 180;
    const direction = isTop ? -1 : 1;

    // 大骨の終点
    const endX = spineX - majorBoneLength * Math.cos(rad);
    const endY = spineY + direction * majorBoneLength * Math.sin(rad);

    // 大骨の線
    const boneLine = this.createLine(spineX, spineY, endX, endY, strokeWidth, color);
    this.mainGroup.appendChild(boneLine);

    // 矢印（背骨上）
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
    rect.setAttribute('rx', 6);
    rect.setAttribute('filter', 'url(#dropShadow)');
    group.appendChild(rect);

    const text = this.createText(endX, endY, category.name, fontSize, fontWeight, textColor, 'middle');
    group.appendChild(text);

    this.makeGroupDraggable(group, 'category', category);
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'category', element: group, data: category });

    // 境界ボックスを登録
    this.boundingBoxes.push({
      type: 'category',
      name: category.name,
      x: endX - boxWidth / 2,
      y: endY - boxHeight / 2,
      width: boxWidth,
      height: boxHeight
    });

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
    const { strokeWidth, color, arrowSize, fontSize, fontWeight, textColor, minSpacing } = this.config.mediumBone;

    const numCauses = causes.length;
    if (numCauses === 0) return;

    // 中骨の配置間隔を計算（干渉を避けるため均等配置）
    const startT = 0.12;  // 大骨の先端側から12%
    const endT = 0.88;    // 背骨側から88%
    const range = endT - startT;

    causes.forEach((cause, idx) => {
      // 大骨上の位置を計算
      const t = numCauses === 1 ? 0.5 : startT + (idx / (numCauses - 1)) * range;

      const attachX = boneStartX + (boneEndX - boneStartX) * t;
      const attachY = boneStartY + (boneEndY - boneStartY) * t;

      // 交互に左右配置
      const isRight = idx % 2 === 0;
      const direction = isRight ? 1 : -1;

      // 中骨は水平
      const startX = attachX + direction * mediumBoneLength;
      const startY = attachY;
      const endX = attachX;
      const endY = attachY;

      // 中骨の線
      const causeLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(causeLine);

      // 矢印
      const arrowAngle = isRight ? 180 : 0;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（背景付きで読みやすく）
      const labelGroup = this.createGroup();
      const labelX = startX + (isRight ? 5 : -5);
      const labelY = startY - 12;

      // ラベル背景（オプション：読みやすさ向上）
      const textWidth = this.estimateTextWidth(cause.name, fontSize);
      const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      labelBg.setAttribute('x', isRight ? labelX - 2 : labelX - textWidth - 2);
      labelBg.setAttribute('y', labelY - fontSize / 2 - 2);
      labelBg.setAttribute('width', textWidth + 4);
      labelBg.setAttribute('height', fontSize + 4);
      labelBg.setAttribute('fill', 'white');
      labelBg.setAttribute('fill-opacity', '0.85');
      labelBg.setAttribute('rx', '2');
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        labelX, labelY,
        cause.name, fontSize, fontWeight, textColor,
        isRight ? 'start' : 'end'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'cause', cause);
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'cause', element: labelGroup, data: cause });

      // 境界ボックス登録
      this.boundingBoxes.push({
        type: 'cause',
        name: cause.name,
        x: isRight ? labelX : labelX - textWidth,
        y: labelY - fontSize / 2,
        width: textWidth,
        height: fontSize
      });

      // 小骨を描画
      this.drawSubcauses(cause.subcauses, {
        causeStartX: startX,
        causeStartY: startY,
        causeEndX: endX,
        causeEndY: endY,
        causeIsRight: isRight,
        causeIndex: idx,
        layout
      });
    });
  }

  /**
   * 小骨を描画
   */
  drawSubcauses(subcauses, params) {
    const { causeStartX, causeStartY, causeEndX, causeEndY, causeIsRight, causeIndex, layout } = params;
    const { smallBoneLength } = layout;
    const { angle, strokeWidth, color, arrowSize, fontSize, textColor, minSpacing } = this.config.smallBone;

    const numSubcauses = subcauses.length;
    if (numSubcauses === 0) return;

    const rad = (angle * Math.PI) / 180;

    subcauses.forEach((subcause, idx) => {
      // 中骨上の位置（均等配置）
      const t = (idx + 1) / (numSubcauses + 1);
      const attachX = causeStartX + (causeEndX - causeStartX) * t;
      const attachY = causeStartY;

      // 交互に上下配置（causeIndexも考慮して分散）
      const isAbove = (idx + causeIndex) % 2 === 0;
      const vertDir = isAbove ? -1 : 1;
      const horizDir = causeIsRight ? 1 : -1;

      // 小骨は斜め
      const startX = attachX + horizDir * smallBoneLength * Math.cos(rad);
      const startY = attachY + vertDir * smallBoneLength * Math.sin(rad);
      const endX = attachX;
      const endY = attachY;

      // 小骨の線
      const subcauseLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(subcauseLine);

      // 矢印
      const arrowAngle = Math.atan2(endY - startY, endX - startX) * 180 / Math.PI;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル（背景付き）
      const labelGroup = this.createGroup();
      const labelX = startX;
      const labelY = startY + (isAbove ? -10 : 18);

      // ラベル背景
      const textWidth = this.estimateTextWidth(subcause.name, fontSize);
      const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      labelBg.setAttribute('x', labelX - textWidth / 2 - 2);
      labelBg.setAttribute('y', labelY - fontSize / 2 - 1);
      labelBg.setAttribute('width', textWidth + 4);
      labelBg.setAttribute('height', fontSize + 2);
      labelBg.setAttribute('fill', 'white');
      labelBg.setAttribute('fill-opacity', '0.8');
      labelBg.setAttribute('rx', '2');
      labelGroup.appendChild(labelBg);

      const labelText = this.createText(
        labelX, labelY,
        subcause.name, fontSize, 'normal', textColor, 'middle'
      );
      labelGroup.appendChild(labelText);

      this.makeGroupDraggable(labelGroup, 'subcause', subcause);
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'subcause', element: labelGroup, data: subcause });

      // 孫骨を描画
      this.drawDetails(subcause.details, {
        subcauseStartX: startX,
        subcauseStartY: startY,
        subcauseEndX: endX,
        subcauseEndY: endY,
        subcauseIsAbove: isAbove,
        causeIsRight,
        subcauseIndex: idx,
        layout
      });
    });
  }

  /**
   * 孫骨を描画
   */
  drawDetails(details, params) {
    const { subcauseStartX, subcauseStartY, subcauseEndX, subcauseEndY, subcauseIsAbove, causeIsRight, subcauseIndex, layout } = params;
    const { tinyBoneLength } = layout;
    const { strokeWidth, color, arrowSize, fontSize, textColor, minSpacing } = this.config.tinyBone;

    const numDetails = details.length;
    if (numDetails === 0) return;

    details.forEach((detail, idx) => {
      // 小骨上の位置
      const t = (idx + 1) / (numDetails + 1);
      const attachX = subcauseStartX + (subcauseEndX - subcauseStartX) * t;
      const attachY = subcauseStartY + (subcauseEndY - subcauseStartY) * t;

      // 孫骨は水平
      const horizDir = causeIsRight ? 1 : -1;
      const startX = attachX + horizDir * tinyBoneLength;
      const startY = attachY;
      const endX = attachX;
      const endY = attachY;

      // 孫骨の線
      const detailLine = this.createLine(startX, startY, endX, endY, strokeWidth, color);
      this.mainGroup.appendChild(detailLine);

      // 矢印
      const arrowAngle = causeIsRight ? 180 : 0;
      const arrow = this.createArrowhead(endX, endY, arrowAngle, arrowSize, color);
      this.mainGroup.appendChild(arrow);

      // ラベル配置（subcauseIndexも考慮して分散配置）
      const labelGroup = this.createGroup();
      const isAboveLabel = (idx + subcauseIndex) % 2 === 0;
      const labelX = startX + (causeIsRight ? 3 : -3);
      const labelY = startY + (isAboveLabel ? -7 : 15);

      const maxChars = 6;
      if (detail.length <= maxChars) {
        const labelText = this.createText(
          labelX, labelY,
          detail, fontSize, 'normal', textColor, causeIsRight ? 'start' : 'end'
        );
        labelGroup.appendChild(labelText);
      } else {
        // 2行に分割
        const line1 = detail.substring(0, maxChars);
        const line2 = detail.substring(maxChars);

        const text1 = this.createText(
          labelX, labelY - fontSize * 0.55,
          line1, fontSize, 'normal', textColor, causeIsRight ? 'start' : 'end'
        );
        const text2 = this.createText(
          labelX, labelY + fontSize * 0.55,
          line2, fontSize, 'normal', textColor, causeIsRight ? 'start' : 'end'
        );
        labelGroup.appendChild(text1);
        labelGroup.appendChild(text2);
      }

      this.makeGroupDraggable(labelGroup, 'detail', { name: detail });
      this.mainGroup.appendChild(labelGroup);
      this.elements.push({ type: 'detail', element: labelGroup, data: { name: detail } });
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
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', x);
    textEl.setAttribute('y', y);
    textEl.setAttribute('font-size', fontSize);
    textEl.setAttribute('font-weight', fontWeight);
    textEl.setAttribute('fill', fill);
    textEl.setAttribute('text-anchor', textAnchor);
    textEl.setAttribute('dominant-baseline', 'middle');
    textEl.setAttribute('font-family', "'Segoe UI', 'Hiragino Sans', 'Meiryo', sans-serif");
    textEl.textContent = text;
    return textEl;
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
    // 日本語文字の概算幅
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

  // ========== ドラッグ&ドロップ機能 ==========

  setupEventListeners() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.svg.addEventListener('contextmenu', (e) => e.preventDefault());
    this.svg.addEventListener('dblclick', this.resetView.bind(this));

    // タッチイベント
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
      this.offset = {
        x: pt.x - matrix.e,
        y: pt.y - matrix.f
      };
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
    this.viewBox = { x: 0, y: 0, width: this.config.width, height: this.config.height };
    this.zoomLevel = 1;
    this.updateViewBox();
  }

  updateViewBox() {
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
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
        this.offset = {
          x: pt.x - matrix.e,
          y: pt.y - matrix.f
        };
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

  // ========== レスポンシブ対応 ==========

  setupResponsive() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (this.resizeTimeout) {
          clearTimeout(this.resizeTimeout);
        }
        this.resizeTimeout = setTimeout(() => {
          this.handleResize();
        }, 100);
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('resize', () => {
      if (this.resizeTimeout) {
        clearTimeout(this.resizeTimeout);
      }
      this.resizeTimeout = setTimeout(() => {
        this.handleResize();
      }, 100);
    });

    this.handleResize();
  }

  handleResize() {
    if (!this.svg || !this.container) return;

    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const viewportHeight = window.innerHeight;
    const aspectRatio = this.config.width / this.config.height;

    let svgHeight = containerWidth / aspectRatio;
    svgHeight = Math.min(svgHeight, viewportHeight * 0.85, 800);
    svgHeight = Math.max(svgHeight, 350);

    this.svg.style.height = `${svgHeight}px`;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.resizeTimeout) {
      clearTimeout(this.resizeTimeout);
    }
  }

  // ========== エクスポート機能 ==========

  exportAsPNG() {
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('width', this.config.width);
    svgClone.setAttribute('height', this.config.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.config.width} ${this.config.height}`);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    const scale = 2; // 高解像度
    canvas.width = this.config.width * scale;
    canvas.height = this.config.height * scale;

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

    img.onerror = (err) => {
      console.error('PNG export error:', err);
      alert('PNG形式でのエクスポートに失敗しました。代わりにSVG形式をお試しください。');
      URL.revokeObjectURL(url);
    };

    img.src = url;
  }

  exportAsSVG() {
    const svgClone = this.svg.cloneNode(true);
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', this.config.width);
    svgClone.setAttribute('height', this.config.height);
    svgClone.setAttribute('viewBox', `0 0 ${this.config.width} ${this.config.height}`);

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

// グローバルに公開
if (typeof window !== 'undefined') {
  window.IshikawaDiagram = IshikawaDiagram;
}
