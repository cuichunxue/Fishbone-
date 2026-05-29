/**
 * 石川ダイアグラム（特性要因図）描画・編集エンジン
 *
 * 設計方針:
 *  - データ駆動の自動レイアウト: 描画前にすべての座標を計算し、
 *    どのカテゴリ・原因数・小骨数でも重ならないキャンバスサイズと配置を決める。
 *  - 大骨は固定角度で背骨に対して上下に交互配置。
 *  - 中骨はすべて背骨と逆方向（外側）に水平に伸ばし、ジグザグを排除。
 *  - 小骨は中骨に対し外側へ斜めに延ばし、3本目以降は長さを交互に変えてラベルを縦にずらす。
 *  - 孫骨は小骨先端から外側へ水平に伸ばす。
 *  - キャンバス座標は計算済みなので、ビューボックスもそれに合わせて自動設定。
 */
class IshikawaDiagram {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.svg = null;
    this.mainGroup = null;
    this.data = null;
    this.layout = null;
    this.elements = [];

    // ドラッグ／パン状態
    this.draggingElement = null;
    this.offset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // ズーム
    this.viewBox = { x: 0, y: 0, width: 1600, height: 900 };
    this.initialViewBox = { ...this.viewBox };
    this.zoomLevel = 1;

    // タッチ
    this.touches = [];
    this.lastTouchDistance = 0;

    // レスポンシブ
    this.resizeObserver = null;
    this.resizeTimeout = null;
    this.breakpoints = {
      smallMobile: 480,
      mobile: 768,
      tablet: 1024,
      laptop: 1440,
      desktop: 1920,
    };

    // 色とフォント
    this.style = {
      spine: '#1f2d3d',
      major: '#2c3e50',
      cause: '#5d6d7e',
      subcause: '#85929e',
      detail: '#aab7b8',
      effectFill: '#c0392b',
      effectStroke: '#922b21',
      categoryFill: '#2980b9',
      categoryStroke: '#1f618d',
      textDark: '#1b2631',
      textMid: '#34495e',
      textLight: '#ffffff',
      textMuted: '#566573',
      bg: '#ffffff',
    };

    // 主要パラメータ（必要に応じてレイアウト計算で上書き）
    // 中骨は「ペア配置(両側)」を優先し、データ密度が高くて両側配置が
    // キャンバスを巨大化させる場合のみ片側(全て外側)にフォールバック。
    this.params = {
      majorAngleDeg: 56,           // 大骨の傾き
      subcauseAngleDeg: 50,        // 小骨の傾き

      // ペア配置 (両側) 用 t 範囲
      // pairTMin が高い ⇒ 内側中骨にゆとり、大骨長が短い
      // pairTMax が低い ⇒ 縦キャンバスが短い
      pairTMin: 0.48,
      pairTMax: 0.88,
      // 片側配置 (フォールバック) 用 t 範囲
      singleTMin: 0.18,
      singleTMax: 0.84,

      subcauseTMin: 0.18,
      subcauseTMax: 0.84,
      subcauseStaggerRatio: 0.68,
      detailTMin: 0.30,
      detailTMax: 0.76,

      causeSpacingAlongBone: 110,
      subcauseSpacingAlongCause: 80,

      // 親骨の長さは "展開される子骨の本数" の 2 本ごとに段階的に伸ばす
      //   length = base + max(0, ceil(N/2) - 1) * stepPerPair
      causeBaseLength: 180,
      causeLengthPerPair: 80,           // 中骨: 小骨ペアごとの追加長
      subcauseLength: 108,
      subcauseLengthPerPair: 30,        // 小骨: 孫骨ペアごとの追加長
      subcauseLengthWithDetails: 132,   // 互換用 (使用していない箇所のフォールバック)
      detailLength: 56,
      categoryBoxWidth: 140,
      categoryBoxHeight: 48,
      categoryGap: 90,
      effectGap: 70,
      effectBoxMaxHeight: 360,
      spineEndPadding: 110,
      innerSafeMargin: 26,
      // 両側配置の判定閾値: 大骨長がこれを超えるなら片側配置に切替
      bothSidesMaxBoneLength: 1800,
      // 最小描画範囲 (空きカテゴリでも視覚を保つ)
      minCanvasHeight: 600,
      minCanvasWidth: 900,

      fontPx: {
        effect: 22,
        category: 17,
        cause: 14,
        subcause: 12,
        detail: 11,
      },
      sideMarginX: 90,
      verticalMargin: 80,
      causeLabelGap: 18,
      subcauseLabelGap: 12,
      detailLabelGap: 6,
    };
  }

  // ===== 公開 API =====

  /**
   * データを描画
   * @param {Object} data - パース済みデータ {effect, categories: [{name, causes: [{name, subcauses: [{name, details:[]}]}]}]}
   */
  render(data) {
    this.data = data;
    this.elements = [];
    this.layout = this.computeLayout(data);

    this.viewBox = {
      x: 0,
      y: 0,
      width: this.layout.svgWidth,
      height: this.layout.svgHeight,
    };
    this.initialViewBox = { ...this.viewBox };

    this.initialize();
    this.drawAll();
  }

  /**
   * SVG とイベントハンドラを初期化
   */
  initialize() {
    this.container.innerHTML = '';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.setAttribute(
      'viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`
    );
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.setAttribute('shape-rendering', 'geometricPrecision');
    this.svg.style.border = '1px solid #ddd';
    this.svg.style.backgroundColor = this.style.bg;
    this.svg.style.cursor = 'default';
    this.svg.style.touchAction = 'none';
    this.svg.style.maxHeight = '100vh';

    // defs: drop shadow filter for boxes
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="boxShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="0" dy="1.5" result="offsetblur"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
    this.svg.appendChild(defs);

    this.mainGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.svg.appendChild(this.mainGroup);
    this.container.appendChild(this.svg);

    this.setupEventListeners();
    this.setupResponsive();
  }

  // ===== レイアウト計算 =====

  /**
   * データから全体レイアウト（キャンバスサイズ・各座標）を算出
   */
  computeLayout(data) {
    const p = this.params;
    const rad = (p.majorAngleDeg * Math.PI) / 180;
    const subRad = (p.subcauseAngleDeg * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);
    const cosS = Math.cos(subRad);
    const sinS = Math.sin(subRad);

    const numCategories = Math.max(1, data.categories.length);
    const numTop = Math.ceil(numCategories / 2);
    const numBottom = Math.floor(numCategories / 2);

    // 1) 各カテゴリの中骨レイアウト指標を計算
    const categoryInfos = data.categories.map((cat, idx) => {
      const isTop = idx % 2 === 0;
      const numCauses = Math.max(1, cat.causes.length);
      const numPairs = Math.ceil(numCauses / 2);

      const tSubRange = p.subcauseTMax - p.subcauseTMin;
      const causeMetrics = cat.causes.map(cause => {
        const causeLabelW = this.estimateTextWidth(cause.name, p.fontPx.cause) + 20;
        const numSub = cause.subcauses.length;

        const maxSubLabel = numSub > 0
          ? Math.max(...cause.subcauses.map(s => this.estimateTextWidth(s.name, p.fontPx.subcause)))
          : 0;

        // 小骨は上下交互配置なので同じ側 (UP/DOWN それぞれ) の隣接小骨は
        // index 差 2 で並ぶ。よって X 間隔は 2*tStep として算出する。
        const labelSafeSpacing = maxSubLabel + 24;
        const subLayoutLen = numSub >= 2
          ? labelSafeSpacing * (numSub - 1) / (2 * tSubRange)
          : (numSub === 1 ? 140 : 0);

        // 中骨長: base + ceil(numSub/2 - 1) * stepPerPair (展開ペアごとの伸縮)
        const subPairs = Math.ceil(numSub / 2);
        const causeLenByPair = p.causeBaseLength
          + Math.max(0, subPairs - 1) * p.causeLengthPerPair;
        const subSpread = numSub > 0
          ? Math.max(subLayoutLen, causeLenByPair)
          : 0;

        // 小骨長: base + ceil(numDetails/2 - 1) * stepPerPair (孫骨ペアごと)
        // カテゴリ内最大の小骨長を採用
        const subLensPerSub = cause.subcauses.map(s => {
          const dPairs = Math.ceil(s.details.length / 2);
          return p.subcauseLength
            + Math.max(0, dPairs - 1) * p.subcauseLengthPerPair;
        });
        const subLen = subLensPerSub.length
          ? Math.max(p.subcauseLength, ...subLensPerSub)
          : p.subcauseLength;
        const hasDetails = cause.subcauses.some(s => s.details.length > 0);

        const maxDetailLabel = cause.subcauses.flatMap(s => s.details).length > 0
          ? Math.max(0, ...cause.subcauses.flatMap(s =>
              s.details.map(d => this.estimateTextWidth(d, p.fontPx.detail))
            ))
          : 0;

        return {
          causeLabelW, subSpread, maxSubLabel,
          hasDetails, subLen, maxDetailLabel, numSub,
        };
      });

      // 中骨長 (左右共通): カテゴリ内最大
      const causeLength = Math.max(
        p.causeBaseLength,
        ...causeMetrics.map(m => Math.max(m.causeLabelW, m.subSpread, m.maxSubLabel + 40))
      );
      const hasAnySubcauses = cat.causes.some(c => c.subcauses.length > 0);
      const hasAnyDetails = cat.causes.some(c => c.subcauses.some(s => s.details.length > 0));

      const subLenLong = Math.max(p.subcauseLength, ...causeMetrics.map(m => m.subLen));
      const maxSubLabelGlobal = Math.max(0, ...causeMetrics.map(m => m.maxSubLabel));
      const maxDetailLabelGlobal = Math.max(0, ...causeMetrics.map(m => m.maxDetailLabel));

      // 小骨の垂直占有 (小骨が無いカテゴリは 0)
      const subVertical = hasAnySubcauses
        ? subLenLong * sinS + p.subcauseLabelGap + 18
        : 0;

      // 水平方向の張り出し (実データに応じて)
      const subHorizontalOuter = hasAnySubcauses ? subLenLong * cosS : 0;
      const detailHorizontalOuter = hasAnyDetails
        ? p.detailLength + maxDetailLabelGlobal + 16
        : 0;

      // === 大骨長を 2 通り計算して、両側 / 片側を選択 ===
      // 新ルール: 小骨は上下交互に展開するため、
      //   隣接中骨間で「DOWN 小骨 + UP 小骨」が衝突しないよう
      //   縦方向の中骨間隔が 2 × 小骨垂直展開 以上必要
      const verticalNeedBetweenCauses = hasAnySubcauses
        ? (2 * subLenLong * sinS + 50)  // 上下両方向の小骨 + ラベル分
        : 60;

      // 両側配置: ペア間隔 (縦) + 内側中骨が背骨に達しない条件
      const pairTRange = p.pairTMax - p.pairTMin;
      const requiredMajorByVerticalBoth = numPairs <= 1
        ? 0
        : verticalNeedBetweenCauses * (numPairs - 1) / (sinA * pairTRange);
      // 内側中骨は中骨本体+小骨水平+孫骨水平が背骨に届かないように
      const innerHorizontalNeed =
        causeLength + subHorizontalOuter + detailHorizontalOuter + p.innerSafeMargin;
      const requiredMajorByInner = innerHorizontalNeed / (cosA * p.pairTMin);
      const majorByBothSides = Math.max(
        500,
        requiredMajorByVerticalBoth,
        requiredMajorByInner,
      );

      // 片側配置 (フォールバック): すべての中骨が外側に伸びる
      const singleTRange = p.singleTMax - p.singleTMin;
      const requiredMajorByVerticalSingle = numCauses <= 1
        ? 0
        : verticalNeedBetweenCauses * (numCauses - 1) / (sinA * singleTRange);
      const requiredMajorBySpacingSingle = numCauses <= 1
        ? 0
        : p.causeSpacingAlongBone * (numCauses - 1) / singleTRange;
      const majorBySingleSide = Math.max(
        460,
        requiredMajorByVerticalSingle,
        requiredMajorBySpacingSingle,
      );

      return {
        category: cat,
        idx,
        isTop,
        numCauses,
        numPairs,
        causeLength,
        causeMetrics,
        subLenLong,
        majorByBothSides,
        majorBySingleSide,
        // 以降は最終 globalL 決定後に再計算
        majorBoneLength: 0,
        majorHorizontal: 0,
        farthestCauseY: 0,
        categoryVertical: 0,
        horizontalExtentFromSpine: 0,
        layoutMode: null,
        subHorizontalOuter,
        detailHorizontalOuter,
        subVertical,
        maxDetailLabelGlobal,
        hasAnySubcauses,
        hasAnyDetails,
      };
    });

    // ---- カテゴリごとのモードと統一大骨長を決定 ----
    // ルール:
    //   1. 中骨 1 本のカテゴリ: 常に S (ペア不可)
    //   2. 中骨 2 本以上で両側配置が閾値内: P
    //   3. それ以外: S (フォールバック)
    // 統一 L = 全カテゴリの選択モードでの必要 L の最大値
    //   ⇒ 大骨先端 Y がカテゴリ間で揃い、視覚バランスが取れる
    categoryInfos.forEach(c => {
      c.layoutMode =
        (c.numCauses >= 2 && c.majorByBothSides <= p.bothSidesMaxBoneLength)
          ? 'pair' : 'single';
    });
    const globalL = Math.max(500, ...categoryInfos.map(c =>
      c.layoutMode === 'pair' ? c.majorByBothSides : c.majorBySingleSide
    ));

    // 各カテゴリに統一 L を適用し、派生量を計算
    categoryInfos.forEach(info => {
      info.majorBoneLength = globalL;
      const tMaxForExtents = (info.layoutMode === 'pair')
        ? p.pairTMax : p.singleTMax;
      info.farthestCauseY = globalL * sinA * tMaxForExtents;
      info.categoryVertical = info.farthestCauseY + info.subVertical + 24;
      info.majorHorizontal = globalL * cosA;
      const farLeftFromSpine =
        globalL * cosA * tMaxForExtents +
        info.causeLength +
        info.subHorizontalOuter +
        info.detailHorizontalOuter;
      info.horizontalExtentFromSpine = Math.max(
        info.majorHorizontal + p.categoryBoxWidth * 0.55 + 24,
        farLeftFromSpine + 20,
      );
    });

    // 2) 上下別の最大値を取得
    const topInfos = categoryInfos.filter(c => c.isTop);
    const botInfos = categoryInfos.filter(c => !c.isTop);

    const maxVerticalTop = topInfos.length
      ? Math.max(...topInfos.map(c => c.categoryVertical))
      : 0;
    const maxVerticalBot = botInfos.length
      ? Math.max(...botInfos.map(c => c.categoryVertical))
      : 0;

    // 効果ボックスがどちらの side にも収まるよう、最低限の半分高さを確保
    const effectLayoutEarly = this.computeEffectBoxLayout(data.effect || '');
    const minHalfForEffect = effectLayoutEarly.height / 2 + 40;

    const halfHeightTopRaw = Math.max(maxVerticalTop + p.verticalMargin, minHalfForEffect);
    const halfHeightBotRaw = Math.max(maxVerticalBot + p.verticalMargin, minHalfForEffect);
    // 背骨を常にキャンバスの上下中央に配置する (左右対称な見た目を維持)
    const halfHeight = Math.max(
      halfHeightTopRaw, halfHeightBotRaw, p.minCanvasHeight / 2
    );
    const svgHeight = halfHeight * 2;
    const spineY = halfHeight;

    // 3) 同じ側で隣接するカテゴリの spine X 間隔を決定
    // 隣接 spine X 間隔は、両カテゴリの horizontalExtentFromSpine を考慮して決める
    // 単純化: 同じ側のカテゴリ間距離 = 両側の horizontalExtentFromSpine の合計 + 安全マージン
    const safetyGap = 60;

    const sideSpacings = side => {
      const infos = side === 'top' ? topInfos : botInfos;
      const gaps = [];
      for (let i = 0; i < infos.length - 1; i++) {
        const a = infos[i];
        const b = infos[i + 1];
        // 左側カテゴリ b は右側カテゴリ a より右にある（spineXが大きい）
        // a の左端は a.spineX - a.horizontalExtentFromSpine
        // b の左端は b.spineX - b.horizontalExtentFromSpine
        // 隣接するために b.spineX - a.spineX > a.horizontalExtentFromSpine となれば良いが、
        // しかし b の中骨群も a の上に被るため、両方の左方向の最大張り出しを考える必要はない。
        // 安全側に: 単に a の張り出し + safetyGap で十分。
        gaps.push(a.horizontalExtentFromSpine + safetyGap);
      }
      return gaps;
    };

    const topGaps = sideSpacings('top');
    const botGaps = sideSpacings('bottom');

    // 各カテゴリの spine X を決定
    // 上側を左→右に並べ、下側を左→右に並べる
    // top: idx順 0,2,4,...; bottom: 1,3,5,...
    // ただしユーザ視覚では「左から順番に並んでいる」のが分かりやすいので
    // 上下は背骨上で似た X を取らない方が読みやすい → 上と下を交互配置でずらす

    // 上下それぞれの最左端
    // 最左の spine X = sideMarginX + 各カテゴリの最大の左方向張り出し + α
    const leftMostTop = topInfos.length
      ? Math.max(...topInfos.map(c => c.horizontalExtentFromSpine))
      : 0;
    const leftMostBot = botInfos.length
      ? Math.max(...botInfos.map(c => c.horizontalExtentFromSpine))
      : 0;

    const startXTop = p.sideMarginX + leftMostTop;
    const startXBot = p.sideMarginX + leftMostBot;

    // 上下の spine X を計算
    let xTop = startXTop;
    topInfos.forEach((c, i) => {
      if (i > 0) {
        xTop += topGaps[i - 1];
      }
      c.spineX = xTop;
    });

    let xBot = startXBot;
    botInfos.forEach((c, i) => {
      if (i > 0) {
        xBot += botGaps[i - 1];
      }
      c.spineX = xBot;
    });

    // 上下交互配置で見栄えを良くする: 同じインデックス順に並べたい
    // → 元々 idx % 2 で上下分けているので、上の i 番目 と 下の i 番目 を「半ずらし」でずらす
    // しかし計算上は spine の右端を統一する方が安全。

    // 4) spine の最右端: 最も右にあるカテゴリの spine X + 余裕
    const lastTopX = topInfos.length ? topInfos[topInfos.length - 1].spineX : 0;
    const lastBotX = botInfos.length ? botInfos[botInfos.length - 1].spineX : 0;
    let lastCategoryX = Math.max(lastTopX, lastBotX);

    // 上下を「均等に上下」感覚で配置するため、両側のスパンが大きい方に合わせて空きを補正
    // 上下交互で背骨 X を再アライン: top[i] と bottom[i] の中点が一定間隔で並ぶようにする
    this.alignTopBottom(topInfos, botInfos, p.sideMarginX);

    lastCategoryX = Math.max(
      ...categoryInfos.map(c => c.spineX),
    );

    // spine 終端: 最後の category から余裕を持って延長 (背骨先端の余地)
    const spineEndX = lastCategoryX + 100;

    // 5) 効果ボックスの寸法を決定（テキスト長に応じて縦長 / 横長）
    const effectText = data.effect || '';
    const effectLayout = this.computeEffectBoxLayout(effectText);
    const effectX = spineEndX + p.effectGap;

    // 6) SVG 全体の幅 (アスペクト比下限を満たすよう左右パディング)
    let svgWidth = effectX + effectLayout.width + p.sideMarginX;
    let spineStartX = p.sideMarginX;
    let effectXFinal = effectX;
    let spineEndXFinal = spineEndX;

    // 最低アスペクト比を確保: ポートレート気味の図に水平余白を加えバランスを取る
    const minAspect = 1.15;
    if (svgWidth / svgHeight < minAspect) {
      const targetWidth = svgHeight * minAspect;
      const shift = (targetWidth - svgWidth) / 2;
      spineStartX += shift;
      spineEndXFinal += shift;
      effectXFinal += shift;
      categoryInfos.forEach(c => { c.spineX += shift; });
      svgWidth = targetWidth;
    }

    // 7) 各カテゴリの大骨と原因の座標を計算 (シフト後の spineX を反映)
    categoryInfos.forEach(info => {
      this.computeCategoryGeometry(info, spineY, rad, sinA, cosA, subRad, sinS, cosS);
    });

    return {
      svgWidth,
      svgHeight,
      spineY,
      spineStartX,
      spineEndX: spineEndXFinal,
      categoryInfos,
      effectX: effectXFinal,
      effectY: spineY,
      effectLayout,
      angleRad: rad,
      subAngleRad: subRad,
    };
  }

  /**
   * 上下カテゴリの spine X を交互に並ぶように再配置
   */
  alignTopBottom(topInfos, botInfos, marginX) {
    const all = [...topInfos, ...botInfos].sort((a, b) => a.idx - b.idx);
    if (all.length === 0) return;

    // 全体を等間隔で並べる: 各カテゴリの最大の左方向張り出しを考慮した最小間隔を確保
    // 単純な再配置: idx 順に並べ、隣接 (idx, idx+1) の中で同じ側であれば張り出しガード
    // ここでは「上下を 1 つずつ交互に置く」前提
    const minStart = marginX + Math.max(...all.map(c => c.horizontalExtentFromSpine));
    let cursor = minStart;
    let lastSameSideX = { top: -Infinity, bottom: -Infinity };

    all.forEach((c, i) => {
      let placedX = cursor;
      const side = c.isTop ? 'top' : 'bottom';
      // 同じ側で前のカテゴリとの最小距離を確保
      const prevSameX = lastSameSideX[side];
      if (prevSameX > -Infinity) {
        const prevSame = all
          .filter(x => x.isTop === c.isTop)
          .find(x => x.spineX === prevSameX);
        const requiredGap =
          (prevSame ? prevSame.horizontalExtentFromSpine : 0) +
          c.horizontalExtentFromSpine * 0.0 + // 自身の左張り出しは前カテゴリの右側
          60;
        placedX = Math.max(placedX, prevSameX + requiredGap);
      }
      // 隣接する反対側カテゴリ（idx-1）との最小距離 (上下が背骨上で接近しすぎないよう)
      if (i > 0) {
        const prev = all[i - 1];
        const horizontalNeed = Math.max(60, c.horizontalExtentFromSpine * 0.4);
        placedX = Math.max(placedX, prev.spineX + horizontalNeed);
      }
      c.spineX = placedX;
      lastSameSideX[side] = placedX;
      cursor = placedX;
    });
  }

  /**
   * 1 カテゴリの幾何（大骨先端、各中骨、小骨、孫骨）を計算
   * info.layoutMode が 'pair' なら左右両側交互配置、'single' なら全て外側
   */
  computeCategoryGeometry(info, spineY, rad, sinA, cosA, subRad, sinS, cosS) {
    const p = this.params;
    const sign = info.isTop ? -1 : 1; // 上側は y を減らす

    // 大骨の終点
    info.spineY = spineY;
    info.boneEndX = info.spineX - info.majorBoneLength * cosA;
    info.boneEndY = spineY + sign * info.majorBoneLength * sinA;

    // カテゴリボックスの位置: 大骨先端から少し外側へオフセット
    const boxOffset = p.categoryBoxHeight * 0.25;
    info.boxCenter = {
      x: info.boneEndX - boxOffset * cosA,
      y: info.boneEndY + sign * boxOffset * sinA,
    };

    // 中骨配置を 2 通りで分岐
    const numCauses = info.numCauses;
    let causePlacements; // [{t, side: 'left'|'right'}]

    if (info.layoutMode === 'pair') {
      const numPairs = info.numPairs;
      const pairTs = this.computeEvenT(numPairs, p.pairTMin, p.pairTMax);
      causePlacements = info.category.causes.map((_, i) => ({
        t: pairTs[Math.floor(i / 2)],
        side: (i % 2 === 0) ? 'left' : 'right',
      }));
    } else {
      const ts = this.computeEvenT(numCauses, p.singleTMin, p.singleTMax);
      causePlacements = info.category.causes.map((_, i) => ({
        t: ts[i],
        side: 'left',
      }));
    }

    info.causes = info.category.causes.map((cause, i) => {
      const { t, side } = causePlacements[i];
      // 大骨上の attach 座標
      const attachX = info.spineX - info.majorBoneLength * cosA * t;
      const attachY = spineY + sign * info.majorBoneLength * sinA * t;

      // 中骨方向と長さ
      // side='left'  : 外側 (-x), 長さは causeLength
      // side='right' : 内側 (+x), 長さは背骨に届かないよう制限
      let direction, causeLen;
      if (side === 'left') {
        direction = -1;
        causeLen = info.causeLength;
      } else {
        direction = 1;
        // 内側中骨の最大長: spineX に対し、中骨先端 + 小骨水平 + 孫骨水平 + 余白 が届く距離
        const distToSpine = info.spineX - attachX;
        const innerExtras =
          info.subHorizontalOuter + info.detailHorizontalOuter + p.innerSafeMargin;
        const maxInner = distToSpine - innerExtras;
        causeLen = Math.max(80, Math.min(info.causeLength, maxInner));
      }

      const startX = attachX + direction * causeLen; // 中骨の free end
      const startY = attachY;

      // 小骨レイアウト (side 情報と背骨 Y を伝搬)
      const causeMetric = info.causeMetrics[i] || {};
      const subInfos = this.computeSubcauseGeometry(
        cause,
        {
          startX, startY, attachX, attachY, causeLen,
          isTop: info.isTop,
          side,
          direction,
          spineY,
          spineX: info.spineX,
          subLen: causeMetric.subLen || info.subLenLong,
        },
        subRad, sinS, cosS,
      );

      return {
        cause,
        attachX, attachY, startX, startY, causeLen,
        side, direction,
        subInfos,
      };
    });
  }

  /**
   * ある中骨上の小骨レイアウト
   *
   * ルール: 中骨は水平なので、小骨は上下交互に展開する
   *   - 偶数番目 (i=0,2,...): 外側 (TOP カテゴリでは上、BOTTOM では下)
   *   - 奇数番目 (i=1,3,...): 内側 (背骨側)
   *
   * 水平方向: 中骨の direction と同じ (LEFT 中骨 → 左斜め、RIGHT 中骨 → 右斜め)
   *
   * 内側へ伸びる小骨が背骨を越えないよう、長さを安全に制限する。
   */
  computeSubcauseGeometry(cause, ctx, subRad, sinS, cosS) {
    const p = this.params;
    const subs = cause.subcauses;
    if (!subs.length) return [];

    const ts = this.computeEvenT(subs.length, p.subcauseTMin, p.subcauseTMax);
    const horizontalDir = ctx.direction;
    // 内側小骨が背骨にぶつからないよう、最大長を概算
    // 中骨の Y 座標 (cause line Y) と背骨 Y の距離 = |attachY - spineY|
    // 内側小骨先端の Y = attachY + sign * len * sinS が背骨を越えないこと
    const distToSpineY = Math.abs(ctx.attachY - (ctx.spineY ?? 0));
    const innerSubMaxLen =
      distToSpineY > 0
        ? Math.max(40, (distToSpineY - p.innerSafeMargin) / sinS)
        : ctx.subLen;

    return subs.map((sub, i) => {
      const t = ts[i];
      const attachX = ctx.startX + (ctx.attachX - ctx.startX) * t;
      const attachY = ctx.startY;

      // 上下交互 (i=0 → 外側、i=1 → 内側)
      const isOuterSub = (i % 2 === 0);
      const verticalDir = ctx.isTop
        ? (isOuterSub ? -1 : +1)
        : (isOuterSub ? +1 : -1);

      const hasDetails = sub.details && sub.details.length > 0;
      const lenBase = ctx.subLen;
      // 外側は通常長、内側は安全長 (背骨に届かない長さ) と通常長の小さい方
      let len;
      if (isOuterSub) {
        len = lenBase;
      } else {
        // 内側は背骨方向。背骨に届かないようキャップ
        const cap = Math.min(lenBase, innerSubMaxLen);
        // 孫骨を持たない場合は更に少し短く (ラベル衝突回避のためのスタガー)
        len = hasDetails ? cap : cap * p.subcauseStaggerRatio;
      }
      // 外側でも、孫骨が無い場合は偶奇でスタガーを残す (ただし上下交互で既にずれるので無効化)

      const dx = horizontalDir * len * cosS;
      const dy = verticalDir * len * sinS;
      const endX = attachX + dx;
      const endY = attachY + dy;

      const detailInfos = this.computeDetailGeometry(
        sub,
        {
          attachX, attachY, endX, endY,
          isTop: ctx.isTop,
          verticalDir,
          horizontalDir,
          subLen: len,
          sinS, cosS,
        }
      );

      return {
        sub,
        attachX, attachY, endX, endY,
        len, verticalDir, horizontalDir, isOuterSub,
        detailInfos,
      };
    });
  }

  /**
   * 孫骨は小骨ライン上に分岐する。
   * ルール: 小骨は斜め骨 ⇒ 孫骨は左右交互に展開する
   *   - 偶数番目 (i=0,2,...): 小骨の進行方向と同じ向き (外側)
   *   - 奇数番目 (i=1,3,...): 反対向き (内側)
   * これにより、隣接する孫骨ラベルがX方向に離れて重なり回避になる。
   */
  computeDetailGeometry(sub, ctx) {
    const p = this.params;
    if (!sub.details.length) return [];

    const ts = this.computeEvenT(sub.details.length, p.detailTMin, p.detailTMax);
    const parentDir = ctx.horizontalDir; // 小骨が向いている水平方向

    return sub.details.map((detail, i) => {
      const t = ts[i];
      const attachX = ctx.attachX + (ctx.endX - ctx.attachX) * t;
      const attachY = ctx.attachY + (ctx.endY - ctx.attachY) * t;

      // 左右交互 (偶数=外側=parentDir, 奇数=内側=-parentDir)
      const isOuterDetail = (i % 2 === 0);
      const horizontalDir = isOuterDetail ? parentDir : -parentDir;

      const startX = attachX + horizontalDir * p.detailLength;
      const startY = attachY;

      return {
        detail,
        attachX, attachY,
        startX, startY,
        verticalDir: ctx.verticalDir,
        horizontalDir,
        isOuterDetail,
      };
    });
  }

  /**
   * 効果ボックスのレイアウトを決定
   *   - 短い文字列は横長ボックス
   *   - 長い場合は縦書きで複数列に折り返し
   */
  computeEffectBoxLayout(text) {
    const p = this.params;
    const fontSize = p.fontPx.effect;
    const charsPerColumn = 10; // 1列の最大文字数
    const len = (text || '').length;

    if (len === 0) {
      return { width: 140, height: 90, mode: 'horizontal', text: '' };
    }
    if (len <= 6) {
      // 横長ボックス: 1行
      const width = Math.max(140, len * (fontSize + 6) + 36);
      const height = fontSize + 36;
      return { width, height, mode: 'horizontal', text };
    }

    // 縦書き
    const cols = Math.ceil(len / charsPerColumn);
    const charsCol = Math.min(charsPerColumn, len);
    const columnWidth = fontSize + 8;
    const width = Math.max(80, cols * columnWidth + 20);
    const height = Math.min(
      p.effectBoxMaxHeight,
      charsCol * (fontSize + 6) + 32
    );
    return { width, height, mode: 'vertical', text, cols, charsPerColumn };
  }

  /**
   * 0..1 区間で N 個を tMin..tMax の範囲に均等配置
   */
  computeEvenT(n, tMin, tMax) {
    if (n <= 0) return [];
    if (n === 1) return [(tMin + tMax) / 2];
    const step = (tMax - tMin) / (n - 1);
    return Array.from({ length: n }, (_, i) => tMin + i * step);
  }

  /**
   * 文字列の表示幅を粗く推定（日本語/英数字混在対応）
   */
  estimateTextWidth(text, fontSize) {
    if (!text) return 0;
    let w = 0;
    for (const ch of text) {
      // 半角 ASCII は約 0.55em、全角は約 1.0em
      const isAscii = ch.charCodeAt(0) < 128;
      w += fontSize * (isAscii ? 0.55 : 1.0);
    }
    return w;
  }

  // ===== 描画 =====

  drawAll() {
    this.drawSpine();
    this.drawEffect();
    this.drawCategories();
  }

  drawSpine() {
    const L = this.layout;
    const spineLine = this.createLine(
      L.spineStartX, L.spineY, L.spineEndX, L.spineY,
      4, this.style.spine
    );
    this.mainGroup.appendChild(spineLine);

    const arrow = this.createArrowhead(L.spineEndX, L.spineY, 0, 16, this.style.spine);
    this.mainGroup.appendChild(arrow);
  }

  drawEffect() {
    const L = this.layout;
    const p = this.params;
    const eff = L.effectLayout;
    const x = L.effectX;
    const y = L.effectY - eff.height / 2;

    const group = this.createGroup();
    const rect = this.createRect(
      x, y, eff.width, eff.height,
      this.style.effectFill, this.style.effectStroke, 2, 6
    );
    rect.setAttribute('filter', 'url(#boxShadow)');
    group.appendChild(rect);

    if (eff.mode === 'horizontal') {
      const t = this.createText(
        x + eff.width / 2,
        L.effectY,
        eff.text,
        p.fontPx.effect,
        'bold',
        this.style.textLight,
        'middle'
      );
      group.appendChild(t);
    } else {
      // 縦書き: 1 文字ずつ tspan
      const cols = eff.cols;
      const charsPerCol = eff.charsPerColumn;
      const colSpacing = (eff.width - 24) / cols;
      const fontSize = p.fontPx.effect;
      const lineH = fontSize + 6;
      const text = eff.text;

      for (let c = 0; c < cols; c++) {
        const colChars = text.slice(c * charsPerCol, (c + 1) * charsPerCol);
        const colX = x + 12 + colSpacing * (c + 0.5);
        const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textEl.setAttribute('x', colX);
        textEl.setAttribute('y', y + 18);
        textEl.setAttribute('font-size', fontSize);
        textEl.setAttribute('font-weight', 'bold');
        textEl.setAttribute('fill', this.style.textLight);
        textEl.setAttribute('text-anchor', 'middle');
        // 開始 dy はそのまま、以降は lineH
        colChars.split('').forEach((ch, i) => {
          const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', colX);
          tspan.setAttribute('dy', i === 0 ? 0 : lineH);
          tspan.textContent = ch;
          textEl.appendChild(tspan);
        });
        group.appendChild(textEl);
      }
    }

    this.makeGroupDraggable(group, 'effect');
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'effect', element: group, data: this.data });
  }

  drawCategories() {
    this.layout.categoryInfos.forEach(info => this.drawCategory(info));
  }

  drawCategory(info) {
    const p = this.params;

    // 大骨
    const boneLine = this.createLine(
      info.spineX, info.spineY, info.boneEndX, info.boneEndY,
      3.2, this.style.major
    );
    this.mainGroup.appendChild(boneLine);

    // 矢印（背骨上に向かう）
    const arrowAngle = Math.atan2(info.spineY - info.boneEndY, info.spineX - info.boneEndX) * 180 / Math.PI;
    const arrow = this.createArrowhead(info.spineX, info.spineY, arrowAngle, 10, this.style.major);
    this.mainGroup.appendChild(arrow);

    // カテゴリボックス（大骨先端中心）
    const group = this.createGroup();
    const bw = p.categoryBoxWidth;
    const bh = p.categoryBoxHeight;
    const bx = info.boxCenter.x - bw / 2;
    const by = info.boxCenter.y - bh / 2;
    const rect = this.createRect(
      bx, by, bw, bh,
      this.style.categoryFill, this.style.categoryStroke, 2, 6
    );
    rect.setAttribute('filter', 'url(#boxShadow)');
    group.appendChild(rect);
    const txt = this.createText(
      info.boxCenter.x, info.boxCenter.y,
      info.category.name,
      p.fontPx.category, 'bold',
      this.style.textLight, 'middle'
    );
    group.appendChild(txt);
    this.makeGroupDraggable(group, 'category', info.category);
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'category', element: group, data: info.category });

    // 中骨を描画
    info.causes.forEach(c => this.drawCause(c, info));
  }

  drawCause(causeInfo, catInfo) {
    const p = this.params;
    const isLeft = causeInfo.direction === -1;

    // 中骨ライン (free end → bone attach)
    const line = this.createLine(
      causeInfo.startX, causeInfo.startY,
      causeInfo.attachX, causeInfo.attachY,
      2.2, this.style.cause
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 大骨に向かう)
    // LEFT cause: free end は左、attach は右 → 矢印は右向き (angle=0)
    // RIGHT cause: free end は右、attach は左 → 矢印は左向き (angle=180)
    const arrowAngle = isLeft ? 0 : 180;
    const arrow = this.createArrowhead(
      causeInfo.attachX, causeInfo.attachY, arrowAngle, 9, this.style.cause
    );
    this.mainGroup.appendChild(arrow);

    // ラベル: 中骨の free end の少し外側
    const labelGroup = this.createGroup();
    const labelDy = catInfo.isTop ? -p.causeLabelGap * 0.4 : p.causeLabelGap * 0.4;
    const labelX = causeInfo.startX + (isLeft ? -6 : 6);
    const anchor = isLeft ? 'end' : 'start';
    const labelText = this.createText(
      labelX,
      causeInfo.startY + labelDy,
      causeInfo.cause.name,
      p.fontPx.cause, '700',
      this.style.textDark,
      anchor
    );
    labelGroup.appendChild(labelText);
    this.makeGroupDraggable(labelGroup, 'cause', causeInfo.cause);
    this.mainGroup.appendChild(labelGroup);
    this.elements.push({ type: 'cause', element: labelGroup, data: causeInfo.cause });

    // 小骨を描画
    causeInfo.subInfos.forEach(sub => this.drawSubcause(sub, causeInfo, catInfo));
  }

  drawSubcause(subInfo, causeInfo, catInfo) {
    const p = this.params;
    const horizontalDir = subInfo.horizontalDir;
    const isLeft = horizontalDir === -1;

    // 小骨ライン (end → attach = 中骨に向かう)
    const line = this.createLine(
      subInfo.endX, subInfo.endY,
      subInfo.attachX, subInfo.attachY,
      1.6, this.style.subcause
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 中骨に向かう, 線の進行方向に沿う)
    const arrowAngle = Math.atan2(
      subInfo.attachY - subInfo.endY,
      subInfo.attachX - subInfo.endX,
    ) * 180 / Math.PI;
    const arrow = this.createArrowhead(
      subInfo.attachX, subInfo.attachY, arrowAngle, 7, this.style.subcause
    );
    this.mainGroup.appendChild(arrow);

    // 小骨ラベル: 小骨の free end の少し外側
    // 小骨は上下交互 (verticalDir で UP/DOWN) のため、
    // ラベルの dy は subcause の verticalDir に従う (UP 小骨なら上、DOWN 小骨なら下)
    const labelGroup = this.createGroup();
    const offsetAlong = 8;
    const cosS60 = Math.cos((p.subcauseAngleDeg * Math.PI) / 180);
    const sinS60 = Math.sin((p.subcauseAngleDeg * Math.PI) / 180);
    const verticalDir = subInfo.verticalDir;
    const labelAnchorX = subInfo.endX + horizontalDir * offsetAlong * cosS60;
    const labelAnchorY = subInfo.endY + verticalDir * offsetAlong * sinS60;
    const labelDy = verticalDir * 6;  // 小骨方向に追従 (上下交互配置対応)
    const anchor = isLeft ? 'end' : 'start';
    const labelText = this.createText(
      labelAnchorX,
      labelAnchorY + labelDy,
      subInfo.sub.name,
      p.fontPx.subcause, '600',
      this.style.textMid,
      anchor
    );
    labelGroup.appendChild(labelText);
    this.makeGroupDraggable(labelGroup, 'subcause', subInfo.sub);
    this.mainGroup.appendChild(labelGroup);
    this.elements.push({ type: 'subcause', element: labelGroup, data: subInfo.sub });

    // 孫骨を描画
    subInfo.detailInfos.forEach(d => this.drawDetail(d, subInfo, catInfo));
  }

  drawDetail(detailInfo, subInfo, catInfo) {
    const p = this.params;
    const horizontalDir = detailInfo.horizontalDir;
    const isLeft = horizontalDir === -1;

    // 孫骨ライン (start (free, 外側) → attach (小骨上))
    const line = this.createLine(
      detailInfo.startX, detailInfo.startY,
      detailInfo.attachX, detailInfo.attachY,
      1.1, this.style.detail
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 小骨に向かう)
    // LEFT: arrow points right (angle=0), RIGHT: arrow points left (angle=180)
    const arrowAngle = isLeft ? 0 : 180;
    const arrow = this.createArrowhead(
      detailInfo.attachX, detailInfo.attachY, arrowAngle, 5, this.style.detail
    );
    this.mainGroup.appendChild(arrow);

    // ラベル: 親小骨の verticalDir に従って上下決定 (上下交互配置対応)
    const labelGroup = this.createGroup();
    const subVDir = detailInfo.verticalDir || (catInfo.isTop ? -1 : 1);
    const labelDy = subVDir * 7;  // 親小骨方向に追従
    const labelX = detailInfo.startX + (isLeft ? -2 : 2);
    const anchor = isLeft ? 'end' : 'start';
    const labelText = this.createText(
      labelX,
      detailInfo.startY + labelDy,
      detailInfo.detail,
      p.fontPx.detail, 'normal',
      this.style.textMuted,
      anchor
    );
    labelGroup.appendChild(labelText);
    this.makeGroupDraggable(labelGroup, 'detail', { name: detailInfo.detail });
    this.mainGroup.appendChild(labelGroup);
    this.elements.push({ type: 'detail', element: labelGroup, data: { name: detailInfo.detail } });
  }

  // ===== SVG 要素ユーティリティ =====

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

  createRect(x, y, width, height, fill, stroke, strokeWidth, rx = 5) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', strokeWidth);
    rect.setAttribute('rx', rx);
    rect.setAttribute('ry', rx);
    return rect;
  }

  createText(x, y, text, fontSize, fontWeight, fill, textAnchor) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('font-size', fontSize);
    t.setAttribute('font-weight', fontWeight);
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', textAnchor);
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif');
    t.textContent = text;
    return t;
  }

  /**
   * 矢印（多角形）を作成。angle は終点方向（度）
   */
  createArrowhead(x, y, angle, size, color) {
    const group = this.createGroup();
    const rad = (angle * Math.PI) / 180;
    const points = [
      { x: x, y: y },
      { x: x - size * Math.cos(rad - Math.PI / 7), y: y - size * Math.sin(rad - Math.PI / 7) },
      { x: x - size * Math.cos(rad + Math.PI / 7), y: y - size * Math.sin(rad + Math.PI / 7) },
    ];
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
    poly.setAttribute('fill', color);
    group.appendChild(poly);
    return group;
  }

  // ===== ドラッグ＆ドロップ / パン / ズーム =====

  makeGroupDraggable(group, type, data = null) {
    group.setAttribute('cursor', 'move');
    group.setAttribute('data-type', type);
    group.setAttribute('data-draggable', 'true');
    if (data) group.setAttribute('data-name', data.name || '');
  }

  setupEventListeners() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.svg.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.svg.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.svg.addEventListener('mouseleave', this.onMouseUp.bind(this));
    this.svg.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.svg.addEventListener('contextmenu', e => e.preventDefault());
    this.svg.addEventListener('dblclick', this.resetView.bind(this));

    this.svg.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.svg.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.svg.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });
  }

  onMouseDown(e) {
    let group = e.target;
    while (group && group.tagName !== 'g') group = group.parentElement;

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
      this.viewBox.x -= pt.x - this.panStart.x;
      this.viewBox.y -= pt.y - this.panStart.y;
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
    const newW = this.viewBox.width * delta;
    const newH = this.viewBox.height * delta;
    const dx = (newW - this.viewBox.width) * ((pt.x - this.viewBox.x) / this.viewBox.width);
    const dy = (newH - this.viewBox.height) * ((pt.y - this.viewBox.y) / this.viewBox.height);
    this.viewBox.x -= dx;
    this.viewBox.y -= dy;
    this.viewBox.width = newW;
    this.viewBox.height = newH;
    this.zoomLevel *= delta;
    this.updateViewBox();
  }

  resetView() {
    this.viewBox = { ...this.initialViewBox };
    this.zoomLevel = 1;
    this.updateViewBox();
  }

  updateViewBox() {
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.width} ${this.viewBox.height}`);
  }

  getMousePosition(e) {
    const CTM = this.svg.getScreenCTM();
    return { x: (e.clientX - CTM.e) / CTM.a, y: (e.clientY - CTM.f) / CTM.d };
  }

  // ===== タッチ =====

  onTouchStart(e) {
    e.preventDefault();
    this.touches = Array.from(e.touches);
    if (this.touches.length === 1) {
      const t = this.touches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      let group = target;
      while (group && group.tagName !== 'g') group = group.parentElement;
      if (group && group.getAttribute('data-draggable') === 'true') {
        this.draggingElement = group;
        const pt = this.getTouchPosition(t);
        const matrix = group.getCTM();
        this.offset = { x: pt.x - matrix.e, y: pt.y - matrix.f };
        group.style.opacity = '0.7';
      } else {
        this.isPanning = true;
        this.panStart = this.getTouchPosition(t);
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
      const t = this.touches[0];
      if (this.draggingElement) {
        const pt = this.getTouchPosition(t);
        const x = pt.x - this.offset.x;
        const y = pt.y - this.offset.y;
        this.draggingElement.setAttribute('transform', `translate(${x}, ${y})`);
      } else if (this.isPanning) {
        const pt = this.getTouchPosition(t);
        this.viewBox.x -= pt.x - this.panStart.x;
        this.viewBox.y -= pt.y - this.panStart.y;
        this.updateViewBox();
        this.panStart = this.getTouchPosition(t);
      }
    } else if (this.touches.length === 2) {
      const cur = this.getTouchDistance(this.touches[0], this.touches[1]);
      const delta = cur / this.lastTouchDistance;
      const cx = (this.touches[0].clientX + this.touches[1].clientX) / 2;
      const cy = (this.touches[0].clientY + this.touches[1].clientY) / 2;
      const CTM = this.svg.getScreenCTM();
      const center = { x: (cx - CTM.e) / CTM.a, y: (cy - CTM.f) / CTM.d };
      const newW = this.viewBox.width / delta;
      const newH = this.viewBox.height / delta;
      const dx = (newW - this.viewBox.width) * ((center.x - this.viewBox.x) / this.viewBox.width);
      const dy = (newH - this.viewBox.height) * ((center.y - this.viewBox.y) / this.viewBox.height);
      this.viewBox.x -= dx;
      this.viewBox.y -= dy;
      this.viewBox.width = newW;
      this.viewBox.height = newH;
      this.zoomLevel /= delta;
      this.updateViewBox();
      this.lastTouchDistance = cur;
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

  getTouchPosition(t) {
    const CTM = this.svg.getScreenCTM();
    return { x: (t.clientX - CTM.e) / CTM.a, y: (t.clientY - CTM.f) / CTM.d };
  }

  getTouchDistance(t1, t2) {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ===== レスポンシブ =====

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
    if (!this.svg || !this.container || !this.layout) return;
    const containerWidth = this.container.clientWidth;
    const aspectRatio = this.layout.svgWidth / this.layout.svgHeight;
    let svgHeight = containerWidth / aspectRatio;
    const viewportHeight = window.innerHeight;
    svgHeight = Math.min(svgHeight, viewportHeight * 0.9);
    this.svg.style.height = `${Math.max(320, svgHeight)}px`;
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.resizeTimeout) clearTimeout(this.resizeTimeout);
  }

  // ===== エクスポート =====

  exportAsPNG() {
    const svgClone = this.svg.cloneNode(true);
    const w = this.layout.svgWidth;
    const h = this.layout.svgHeight;
    svgClone.setAttribute('width', w);
    svgClone.setAttribute('height', h);
    svgClone.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const svgData = new XMLSerializer().serializeToString(svgClone);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    canvas.width = w;
    canvas.height = h;

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        const a = document.createElement('a');
        const downloadUrl = URL.createObjectURL(blob);
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
      alert('PNG エクスポートに失敗しました。SVG をお試しください。');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  exportAsSVG() {
    const svgClone = this.svg.cloneNode(true);
    const w = this.layout.svgWidth;
    const h = this.layout.svgHeight;
    svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgClone.setAttribute('width', w);
    svgClone.setAttribute('height', h);
    svgClone.setAttribute('viewBox', `0 0 ${w} ${h}`);
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
