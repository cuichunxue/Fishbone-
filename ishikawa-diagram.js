/**
 * 石川ダイアグラム（特性要因図）描画・編集エンジン
 *
 * 教科書ルール (実装済み):
 *  - 背骨: 太い水平矢印。矢先は特性ボックスの左辺に接する。
 *  - 大骨: 背骨に対し 60° で上下交互。矢先は背骨に刺さる。先端にカテゴリボックス。
 *  - 中骨: 水平 (背骨と平行)。大骨の両側にペアで交互配置し、矢先は大骨へ。
 *    ペアの左右は大骨上で少し段違いにして矢印の衝突を防ぐ (参考図と同じ)。
 *  - 小骨: 大骨と平行 (同じ 60°)。中骨の上下に交互配置し、矢先は中骨へ。
 *  - 孫骨: 水平 (中骨と平行)。小骨ライン上に分岐し、矢先は小骨へ。
 *  - 線の太さは階層で単調減少 (背骨 6.0 > 大骨 4.2 > 中骨 2.6 > 小骨 1.8 > 孫骨 1.2)。
 *
 * 空間・距離最適化レイアウト (2024 最終仕様):
 *  同じ階層の骨をすべて同じ長さにする方式は廃止した。統一対象は
 *  「骨の絶対長」ではなく、以下の視覚規則へ変更している。
 *   - 骨の角度 / 8px 単位の距離リズム / 子骨間の近接ルール
 *   - 背骨から最初の中骨までの距離 (大骨長に比例させず実距離 px で管理)
 *   - 骨長は内容量から個別算出し、カテゴリ内で長さバンド (最大3種、
 *     15% 許容) へゆるく統一する。図全体には無条件統一しない。
 *   - 上下同列カテゴリの大骨長は、必要長差が 18% 以内のときのみ統一する。
 *  子骨は「親の親に近い側 (背骨側/付け根側)」を起点に、実際に必要な
 *  物理間隔だけを詰めて配置する (t 比率による均等配置・比例縮小は
 *  行わない)。これにより、単純な入力は引き締まった図に、複雑な入力は
 *  必要な箇所だけが自然に拡張される。詳細は DIAGRAM_RULES.md を参照。
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
      cause: '#4d5d6e',
      subcause: '#75828f',
      detail: '#93a0aa',
      effectFill: '#c0392b',
      effectStroke: '#922b21',
      categoryFill: '#2980b9',
      categoryStroke: '#1f618d',
      textDark: '#1b2631',
      textMid: '#2e4053',
      textLight: '#ffffff',
      textMuted: '#4d5a66',
      bg: '#ffffff',
    };

    // カテゴリ色パレット (模範的な現代フィッシュボーンの色分けスタイル)
    // 大骨とカテゴリボックスを系統ごとに色分けし、視覚グルーピングを強化。
    // 中骨以下はグレー階調のままにして階層構造を保つ。
    // 落ち着いたトーンで彩度を揃え、色覚多様性にも配慮した並び。
    this.categoryPalette = [
      { fill: '#2f6fb3', stroke: '#245a92' }, // 青
      { fill: '#2e8b6e', stroke: '#247258' }, // 緑
      { fill: '#b3762f', stroke: '#946025' }, // 琥珀
      { fill: '#8e5aa8', stroke: '#75488c' }, // 紫
      { fill: '#3a8fa3', stroke: '#2e7686' }, // 青緑
      { fill: '#6a7b8c', stroke: '#556575' }, // スレート
      { fill: '#a3663a', stroke: '#87542f' }, // 褐色
      { fill: '#5d8a4a', stroke: '#4b713c' }, // 深緑
    ];

    // 主要パラメータ（必要に応じてレイアウト計算で上書き）
    // 空間・距離最適化レイアウト仕様: 骨の絶対長ではなく、角度・距離リズム・
    // 近接ルール・密度目標・長さバンドを図全体で共有する。子骨の位置は
    // t 比率ではなく実距離 (px) で、親の親に近い側から必要な分だけ詰めて
    // 配置する (DIAGRAM_RULES.md 参照)。
    this.params = {
      majorAngleDeg: 60,           // 大骨の傾き (教科書標準の 60°)
      subcauseAngleDeg: 60,        // 小骨の傾き = 大骨と平行 (教科書ルール)

      // ---- 距離体系 (8px 基本単位のリズム) ----
      baseUnit: 8,
      preferredFirstCauseGap: 48,   // 背骨→最初の中骨ペアの基準距離 (実距離 px)
      minimumFirstCauseGap: 40,     // 同、下限
      pairGapMin: 56,               // 隣接ペア間の最小 along-bone 間隔
      pairStaggerPx: 24,            // ペアの左右段差 (px)。内側を先端寄りに
      firstSubcauseGap: 48,         // 中骨の付け根→最初の小骨の基準距離
      subStagger: 32,               // 隣り合う反対側 (上/下) 小骨の段差
      firstDetailGap: 32,           // 小骨の付け根→最初の孫骨の基準距離
      columnGapPreferred: 64,       // カテゴリ列間の基準間隔

      // ---- 骨長 (全要素から必要長を正確に算出し、層単位で最大値に統一) ----
      causeBaseLength: 168,
      subcauseBaseLength: 104,
      subcauseStaggerRatio: 0.68,       // 内側小骨 (孫骨なし) の追加短縮比率
      detailLength: 56,

      categoryBoxWidth: 140,
      categoryBoxHeight: 48,
      effectGap: 18,               // 背骨矢先は特性ボックスに接する (教科書ルール)
      innerSafeMargin: 24,
      // 内側 (背骨側) 原因の骨本体分の事前確保に対する緩和係数。
      // 1.0 = 完全事前確保 (キャップ発動 0 だが背骨際の空白が大きい)。
      // 小さいほど背骨に詰まるが、実行時キャップ + インターリーブ圧縮に
      // 頼る度合いが増える。verify.js 全パターン clean を保つ範囲で調整。
      innerReserveRelax: 0.9,
      categoryEndClearanceMin: 112, // 最後の中骨〜カテゴリボックスの最小余白
      // 最小描画範囲 (空きカテゴリでも視覚を保つ)
      minCanvasHeight: 520,

      // 相対可読性: 専用ソフト並みにキャンバスに対して文字を大きく
      fontPx: {
        effect: 24,
        category: 18,
        cause: 15,
        subcause: 13,
        detail: 12,
      },
      horizontalMargin: 48,
      verticalMargin: 40,
      maxAspectPadding: 96,         // アスペクト比補正で追加してよい余白の上限 (px)
      maxAspectPaddingRatio: 0.06,  // 同、キャンバス幅に対する比率上限
      causeLabelGap: 18,
      subcauseLabelGap: 12,
      detailLabelGap: 6,

      // ラベル折返し: この幅 (px) を超えるラベルは 2 行にバランス分割
      // 長文ラベルでキャンバスが横に間延びするのを防ぎ、読みやすくする
      labelWrapWidth: {
        cause: 180,     // 約 12 全角文字
        subcause: 143,  // 約 11 全角文字
        detail: 108,    // 約 9 全角文字
        category: 200,  // 約 14 全角文字 (超えると2行、ボックス自体も拡幅)
      },
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

    // ==== Phase 1: 各中骨の内容量メトリクスと「自身の」必要長を計算 ====
    // 図全体で骨長を無条件に統一せず、各中骨・小骨は自分の子要素の量から
    // 個別に必要長を求める (空間・距離最適化レイアウト仕様 9 節)。
    const categoryInfos = data.categories.map((cat, idx) => {
      const isTop = idx % 2 === 0;
      const catLabelM = this.wrappedLabelMetrics(
        cat.name, p.fontPx.category, p.labelWrapWidth.category);
      const categoryBoxWidth = Math.max(p.categoryBoxWidth, catLabelM.width + 32);
      const categoryBoxHeight = Math.max(
        p.categoryBoxHeight,
        catLabelM.lineCount * (p.fontPx.category + 6) + 20
      );

      const causeContents = cat.causes.map(cause => {
        const causeLabelM = this.wrappedLabelMetrics(
          cause.name, p.fontPx.cause, p.labelWrapWidth.cause);
        const causeLabelW = causeLabelM.width + 20;
        const numSub = cause.subcauses.length;

        const subLabelMs = cause.subcauses.map(s =>
          this.wrappedLabelMetrics(s.name, p.fontPx.subcause, p.labelWrapWidth.subcause));
        const maxSubLabel = numSub > 0 ? Math.max(...subLabelMs.map(m => m.width)) : 0;
        const maxSubLabelLines = numSub > 0 ? Math.max(...subLabelMs.map(m => m.lineCount)) : 1;

        const hasDetails = cause.subcauses.some(s => s.details.length > 0);
        const detailLabelMs = cause.subcauses.flatMap(s =>
          s.details.map(d => this.wrappedLabelMetrics(
            typeof d === 'string' ? d : d.name, p.fontPx.detail, p.labelWrapWidth.detail)));
        const maxDetailLabel = detailLabelMs.length
          ? Math.max(0, ...detailLabelMs.map(m => m.width))
          : 0;

        // この中骨「自身」の小骨長 (図全体には統一しない)。
        // 孫骨を絶対距離 (firstDetailGap 起点 + ラベル幅ベースの間隔) で
        // 配置するのに必要な長さを実測ベースで見込む (9.3 節)。
        // detailTipClear は小骨の自由端 (小骨ラベルの位置) との干渉を
        // 避けるための終端余白。
        const detailTipClear = 32;
        const subLensPerSub = cause.subcauses.map(s => {
          const n = s.details.length;
          if (n === 0) return p.subcauseBaseLength;
          const dLabelMs = s.details.map(d => this.wrappedLabelMetrics(
            typeof d === 'string' ? d : d.name, p.fontPx.detail, p.labelWrapWidth.detail));
          const dMaxLabel = Math.max(...dLabelMs.map(m => m.width));
          const dStep = dMaxLabel + p.detailLabelGap * 2 + 14;
          const detailSpan = p.firstDetailGap + (n - 1) * dStep + detailTipClear;
          return Math.max(p.subcauseBaseLength, detailSpan);
        });
        const subOwnLen = subLensPerSub.length
          ? Math.max(p.subcauseBaseLength, ...subLensPerSub)
          : p.subcauseBaseLength;

        // この中骨「自身」の必要長: 小骨を絶対距離で配置するのに必要な
        // スパン (firstSubcauseGap 起点、上下交互のインターリーブ配置 +
        // 中骨先端の余白 subTipClear) と、中骨自身のラベル幅の大きい方。
        // subTipClear は中骨の自由端 (中骨ラベルの位置) と最後の小骨の
        // 干渉を避けるための終端余白。
        // 小骨は上下交互のため、ラベル幅の安全間隔が必要なのは
        // 「同じ側 (2本毎)」の小骨同士のみ — 隣り合う反対側の小骨は
        // 小さなスタガーで足りる (computeInterleavedDistances)。
        // 注意: 小骨の斜めチェーン (subLen*cos60° + 孫骨張り出し) は
        // 中骨の軸から離れる方向へ伸びるため中骨の長さを消費しない
        // (キャンバス側は beyondAttachHorizontal が別途確保)。
        // ここへ足すと骨が不必要に長くなり図がスカスカに見える。
        const subTipClear = 40;
        const subDs = this.computeInterleavedDistances(
          numSub, p.firstSubcauseGap, maxSubLabel + 24, p.subStagger);
        const subSpanPx = numSub > 0
          ? subDs[numSub - 1] + subTipClear
          : 0;
        const causeOwnLen = Math.max(
          p.causeBaseLength,
          subSpanPx,
          causeLabelW + 40,
        );

        return {
          cause, causeLabelW, causeLabelLines: causeLabelM.lineCount,
          numSub, maxSubLabel, maxSubLabelLines, hasDetails, maxDetailLabel,
          subOwnLen, subLensPerSub, causeOwnLen, subSpanPx,
        };
      });

      return {
        category: cat, idx, isTop, causeContents,
        categoryBoxWidth, categoryBoxHeight, catLabelLines: catLabelM.lines,
      };
    });

    // ==== Phase 2: 骨長を「層」単位で図全体統一 ====
    // 各骨の必要長は Phase 1 で全要素 (子のラベル幅・孫骨のスパン・
    // 自身のラベル) から正確に算出済み。その上で、同じ層の骨は
    // 図全体で「最大必要長」へ統一する:
    //   - 中骨層: 全中骨の causeOwnLen の最大値
    //   - 小骨層: 全小骨の必要長 (subLensPerSub) の最大値
    //   (大骨層は Phase 4 で最大必要長へ統一)
    // 長さの見た目が層ごとに完全に揃い、密度は実距離パッキング
    // (Phase 3) と内容量ベースの側割当てが保つ。
    const allCauseContents = categoryInfos.flatMap(info => info.causeContents);
    const globalCauseLen = Math.ceil(Math.max(
      p.causeBaseLength,
      ...allCauseContents.map(c => c.causeOwnLen),
    ) / p.baseUnit) * p.baseUnit;
    const globalSubLen = Math.ceil(Math.max(
      p.subcauseBaseLength,
      ...allCauseContents.flatMap(c => c.subLensPerSub),
    ) / p.baseUnit) * p.baseUnit;
    allCauseContents.forEach(c => {
      c.causeLength = globalCauseLen;
      c.subLens = c.subLensPerSub.map(() => globalSubLen);
      c.subLen = globalSubLen;
    });

    // ==== Phase 3: 中骨の絶対距離配置 (t 比率を使わない) ====
    // 背骨から最初の中骨ペアまでは preferredFirstCauseGap (既定 48px) を
    // 基準とし、大骨長に比例させない。以降のペアは、前後のペアが実際に
    // 必要とする縦方向 envelope から距離を決める (固定間隔ではない)。
    categoryInfos.forEach(info => {
      const causeContents = info.causeContents;
      const numCauses = Math.max(1, causeContents.length);
      const numPairs = Math.ceil(numCauses / 2);
      info.numCauses = numCauses;
      info.numPairs = numPairs;
      info.layoutMode = numCauses >= 2 ? 'pair' : 'single';

      const effMargin = this.effectiveInnerSafeMargin();
      const tipExtrasOf = c => Math.max(
        (c.numSub > 0 ? c.subLen * cosS : 0) + (c.hasDetails ? p.detailLength + c.maxDetailLabel + 16 : 0),
        c.causeLabelW + 12,
      );
      // 内側 (背骨側) に置いたときに必要な「背骨までの水平距離」。
      // 骨本体分は「小骨の配置に必要な along-bone スパン」(subSpanPx) が
      // 基準だが、完全確保すると 60° 幾何の変換 (/cos60° = 2倍) で
      // 背骨際に大きな空白帯ができる (スカスカ)。そこで骨本体分にのみ
      // 緩和係数 innerReserveRelax をかけ、不足分は実行時キャップ +
      // インターリーブ配置の比例圧縮で吸収する (反対側の隣接小骨は
      // 32px 段差で足りるため、軽度の圧縮は視覚上破綻しない)。
      // ラベル・先端張り出し・安全余白はハード制約なので緩和しない。
      const innerNeedOf = c => {
        const ownLen = Math.max(70, c.numSub > 0 ? c.subSpanPx * p.innerReserveRelax : 0);
        return ownLen + tipExtrasOf(c) + effMargin;
      };
      // 小骨チェーンの縦方向 (y) 占有。away = 背骨から離れる側 (外側小骨 =
      // 偶数番目、1本以上で発生)、toward = 背骨へ向かう側 (内側小骨 =
      // 奇数番目、2本以上で発生)。小骨長は 1 本ごとに異なる (Phase 2) ため、
      // 該当する側の小骨の実長の最大値で評価する。
      // ペア間ギャップ用は折返し追加行 + ラベル余白のみ (実証済みの旧式)。
      const subLabelExtraOf = c =>
        (c.maxSubLabelLines - 1) * (p.fontPx.subcause + 3) + p.subcauseLabelGap;
      // 側の割当て (computeSubcauseGeometry と同じ規則):
      //  内容の軽い (孫骨の少ない) floor(n/2) 本 → 内側 (toward)、
      //  残りの重い方 → 外側 (away)。
      //  内側は孫骨なしなら 0.68 短縮で描画されるため、内側全てが
      //  孫骨なしの場合は toward 占有も短縮後の実効長で評価する。
      const towardHasDetailsOf = c => {
        const k = Math.floor(c.numSub / 2);
        if (k <= 0) return false;
        const detailCounts = c.cause.subcauses
          .map(s => s.details.length)
          .sort((a, b) => a - b);
        return detailCounts.slice(0, k).some(n => n > 0);
      };
      const maxTowardLenOf = c => c.numSub >= 2
        ? c.subLen * (towardHasDetailsOf(c) ? 1 : p.subcauseStaggerRatio)
        : 0;
      const awayFootOf = c => c.numSub >= 1
        ? (c.subLen * sinS + subLabelExtraOf(c)) : 0;
      const towardFootOf = c => c.numSub >= 2
        ? (maxTowardLenOf(c) * sinS + subLabelExtraOf(c)) : 0;
      const causeLabelExtraHOf = c => (c.causeLabelLines - 1) * (p.fontPx.cause + 3);
      // 内側小骨 (とそのラベル) が背骨に届かないために必要な
      // 「中骨の背骨からの y 距離」→ attach 距離 (along-bone) への変換は /sinA。
      // 小骨の骨本体分には innerReserveRelax をかける (不足時は実行時の
      // innerSubMaxLen キャップが短縮して吸収する)。ラベル 1 行目の高さ +
      // アンカーオフセット (~14px) + 安全余白はハード制約なので緩和しない。
      const towardSpineSafeDistOf = c => c.numSub >= 2
        ? (maxTowardLenOf(c) * sinS * p.innerReserveRelax + subLabelExtraOf(c) + 14 + effMargin) / sinA
        : 0;

      if (info.layoutMode === 'pair') {
        // 内容量 (内側配置時の必要長) 昇順に並べ、軽いペアを背骨側にまとめる。
        // L,R,L,R... の交互サイクルは大骨上の「位置」の順序であり、
        // その位置をどの原因が占めるかは自由に選べるため、これで崩れない。
        const order = causeContents
          .map((c, i) => ({ i, need: innerNeedOf(c) }))
          .sort((a, b) => a.need - b.need)
          .map(o => o.i);

        const sideOfIndex = [];
        const pairSlotOfIndex = [];
        const pairInner = [];
        const pairOuter = [];
        for (let k = 0; k < numPairs; k++) {
          const a = order[2 * k];
          const b = order[2 * k + 1];
          pairSlotOfIndex[a] = k;
          if (b !== undefined) {
            pairSlotOfIndex[b] = k;
            sideOfIndex[a] = 'right'; sideOfIndex[b] = 'left';
            pairInner[k] = a; pairOuter[k] = b;
          } else {
            sideOfIndex[a] = 'left';
            pairOuter[k] = a;
          }
        }

        const pairCausesOf = k => [pairOuter[k], pairInner[k]]
          .filter(i => i !== undefined)
          .map(i => causeContents[i]);

        // 各ペアの左右それぞれの away/toward 占有。中骨の小骨チェーンは
        // 大骨の左右どちらか一方の側にあり、反対側のチェーンとは
        // 水平位置が重ならない — よってペア間の必要 y 距離は
        // 「同じ側同士 (L-L / R-R)」で独立に評価し、大きい方を採る。
        // 左右まとめて max を取ると、重いチェーンが反対側同士の場合に
        // 不要に広い間隔になる (スカスカの一因)。
        const sideFootsOf = k => ({
          awayL: pairOuter[k] !== undefined ? awayFootOf(causeContents[pairOuter[k]]) : 0,
          awayR: pairInner[k] !== undefined ? awayFootOf(causeContents[pairInner[k]]) : 0,
          towardL: pairOuter[k] !== undefined ? towardFootOf(causeContents[pairOuter[k]]) : 0,
          towardR: pairInner[k] !== undefined ? towardFootOf(causeContents[pairInner[k]]) : 0,
        });

        const pairCenters = [];
        for (let k = 0; k < numPairs; k++) {
          const causesHere = pairCausesOf(k);
          let center;
          if (k === 0) {
            center = p.preferredFirstCauseGap;
          } else {
            // 隣接ペア間の必要 y 距離 = 同じ側の「手前ペアの away 小骨 +
            // 奥ペアの toward 小骨」の大きい方 + ラベル分
            // → along-bone は /sinA
            const prev = sideFootsOf(k - 1);
            const here = sideFootsOf(k);
            const chainNeed = Math.max(
              prev.awayL + here.towardL,
              prev.awayR + here.towardR,
            );
            const labelExtra = Math.max(...causesHere.map(causeLabelExtraHOf), 0);
            // +22 は中骨ラベル 1 行分 + 余白 (pairGapPadding 相当を含む)
            const verticalNeed = chainNeed + 30 + labelExtra;
            const gap = Math.max(p.pairGapMin, verticalNeed / sinA);
            center = pairCenters[k - 1] + gap;
          }
          // 内側原因が背骨までの水平距離を確保できる along-bone 距離。
          // 水平距離 = attachDist * cosA なので変換は /cosA
          // (7.1 節: 安全を確保できない場合のみ既定 48px を超えることを許可)
          if (pairInner[k] !== undefined) {
            const requiredCenter =
              innerNeedOf(causeContents[pairInner[k]]) / cosA - p.pairStaggerPx;
            center = Math.max(center, requiredCenter);
          }
          // 内側小骨 (toward 側) が背骨に届かない along-bone 距離
          center = Math.max(center, ...causesHere.map(towardSpineSafeDistOf));
          center = Math.max(center, p.minimumFirstCauseGap);
          if (k > 0) center = Math.max(center, pairCenters[k - 1] + p.pairGapMin);
          pairCenters[k] = center;
        }

        // 8px の距離リズムへ丸める (切り上げで安全側)
        info.sideOfIndex = sideOfIndex;
        info.pairSlotOfIndex = pairSlotOfIndex;
        info.pairCenters = pairCenters.map(c => Math.ceil(c / p.baseUnit) * p.baseUnit);
        info.farthestAttachDist = info.pairCenters[numPairs - 1] + p.pairStaggerPx;
        info.lastPairAwayFoot = Math.max(...pairCausesOf(numPairs - 1).map(awayFootOf), 0);
        info.lastPairMaxSubLen = Math.max(
          ...pairCausesOf(numPairs - 1).map(c => c.numSub > 0 ? c.subLen : 0), 0);
      } else {
        // 原因が1本のカテゴリ: 固定 t 範囲を使わず、背骨から
        // preferredFirstCauseGap を基準に外側配置する (22 節)。
        // 内側小骨が背骨に届く場合のみ、安全な距離まで移動する (12 節:
        // 長さの強制短縮ではなく接続位置の移動で解決する)。
        // 原因が 0 本 (空カテゴリ) でも骨とボックスは描画するため、
        // 既定距離で安全にフォールバックする。
        const c0 = causeContents[0];
        const d = Math.max(
          p.preferredFirstCauseGap,
          c0 ? towardSpineSafeDistOf(c0) : 0,
        );
        info.sideOfIndex = ['left'];
        info.pairSlotOfIndex = [0];
        info.pairCenters = [Math.ceil(d / p.baseUnit) * p.baseUnit];
        info.farthestAttachDist = info.pairCenters[0];
        info.lastPairAwayFoot = c0 ? awayFootOf(c0) : 0;
        info.lastPairMaxSubLen = c0 && c0.numSub > 0 ? c0.subLen : 0;
      }

      // ---- 大骨の必要長 ----
      // 最後の中骨の attach 位置 + カテゴリ側終端余白。
      // 終端余白は固定最小値 (112px) だけでなく内容から決める (8.2 節):
      // 最後のペアの外側 (ボックス側) 小骨チェーン + ラベルが
      // カテゴリボックスに重ならない縦距離を along-bone へ換算し、
      // ボックス自体の高さ分も加える。
      const endClearance = Math.max(
        p.categoryEndClearanceMin,
        (info.lastPairAwayFoot + 20) / sinA + info.categoryBoxHeight * 0.75,
      );
      info.majorRequiredLength = Math.ceil(
        (info.farthestAttachDist + endClearance) / p.baseUnit
      ) * p.baseUnit;
    });

    // ==== Phase 4: 大骨長を図全体で統一 ====
    // すべての大骨を最大必要長へ揃える → 大骨先端 (カテゴリボックス) の
    // 位置がカテゴリ間で揃い、視覚バランスが取れる。
    // 中骨の位置は「背骨からの実距離」で決まっており大骨長に比例しない
    // ため、大骨を伸ばしても中骨・小骨の内容は背骨側へ詰まったままで
    // 間延びしない — 伸びるのは中身のない骨の先端部分だけであり、
    // 旧方式 (t 比率) のように内容ごと引き伸ばされる問題は起きない。
    const globalMajorLen = Math.max(
      ...categoryInfos.map(c => c.majorRequiredLength));
    categoryInfos.forEach(c => { c.majorBoneLength = globalMajorLen; });

    // ==== Phase 5: キャンバスサイズに必要な縦横張り出しを算出 ====
    categoryInfos.forEach(info => {
      const causeContents = info.causeContents;
      const maxCauseLabelW = Math.max(0, ...causeContents.map(c => c.causeLabelW));
      const maxCauseLength = Math.max(0, ...causeContents.map(c => c.causeLength));
      const hasAnySubcauses = causeContents.some(c => c.numSub > 0);
      const hasAnyDetails = causeContents.some(c => c.hasDetails);
      const maxSubLenAll = Math.max(0, ...causeContents.map(c => c.numSub > 0 ? c.subLen : 0));
      const maxDetailLabelAll = Math.max(0, ...causeContents.map(c => c.maxDetailLabel));
      const maxSubLabelLinesAll = Math.max(1, ...causeContents.map(c => c.maxSubLabelLines || 1));
      const subLabelExtraH = (maxSubLabelLinesAll - 1) * (p.fontPx.subcause + 3);

      info.subVertical = hasAnySubcauses
        ? maxSubLenAll * sinS + p.subcauseLabelGap + 18 + subLabelExtraH
        : 0;
      const subHorizontalOuter = hasAnySubcauses ? maxSubLenAll * cosS : 0;
      const detailHorizontalOuter = hasAnyDetails ? p.detailLength + maxDetailLabelAll + 16 : 0;
      info.beyondAttachHorizontal = Math.max(
        maxCauseLength + maxCauseLabelW + 12,
        maxCauseLength + subHorizontalOuter + detailHorizontalOuter,
      );

      const boneTipVertical =
        info.majorBoneLength * sinA
        + info.categoryBoxHeight * 0.25 * sinA
        + info.categoryBoxHeight / 2 + 14;
      info.categoryVertical = Math.max(
        info.farthestAttachDist * sinA + info.subVertical + 24,
        boneTipVertical,
      );
      info.majorHorizontal = info.majorBoneLength * cosA;
      const farLeftFromSpine = info.farthestAttachDist * cosA + info.beyondAttachHorizontal;
      info.horizontalExtentFromSpine = Math.max(
        info.majorHorizontal + info.categoryBoxWidth * 0.55 + 24,
        farLeftFromSpine + 20,
      );
    });

    // 上下別の最大値を取得
    const topInfos = categoryInfos.filter(c => c.isTop);
    const botInfos = categoryInfos.filter(c => !c.isTop);
    const maxVerticalTop = topInfos.length ? Math.max(...topInfos.map(c => c.categoryVertical)) : 0;
    const maxVerticalBot = botInfos.length ? Math.max(...botInfos.map(c => c.categoryVertical)) : 0;

    // 効果ボックスがどちらの side にも収まるよう、最低限の半分高さを確保
    const effectLayoutEarly = this.computeEffectBoxLayout(data.effect || '');
    const minHalfForEffect = effectLayoutEarly.height / 2 + 40;

    // キャンバスは内容へ密着させる (14.1 節)。上下の必要高さが大きく
    // 異なる場合、背骨を無理にキャンバス中央へ置くと軽い側に巨大な
    // 空白ができるため、上下それぞれの実必要量でキャンバスを取る。
    // ただし極端な非対称は不安定に見えるため、軽い側にも重い側の
    // 40% は確保する (ソフト対称性)。
    const halfHeightTopRaw = Math.max(maxVerticalTop + p.verticalMargin, minHalfForEffect);
    const halfHeightBotRaw = Math.max(maxVerticalBot + p.verticalMargin, minHalfForEffect);
    const halfTop = Math.max(
      halfHeightTopRaw, halfHeightBotRaw * 0.4, p.minCanvasHeight / 2);
    const halfBot = Math.max(
      halfHeightBotRaw, halfHeightTopRaw * 0.4, p.minCanvasHeight / 2);
    const svgHeight = halfTop + halfBot;
    const spineY = halfTop;

    // カテゴリを「列 (ペア)」単位で配置する。入力データは 4M の慣習で
    // 上下交互 (idx%2 で isTop 判定) に並ぶため、連続する 2 件
    // (idx=2k を上、idx=2k+1 を下) を同じ列として扱い、同じ spineX を
    // 共有させることで上下対称・左右整列の教科書レイアウトを実現する。
    // 列間隔もカテゴリ数や文字量が少なければ広げすぎない。
    const columnPairCount = Math.ceil(categoryInfos.length / 2);
    const columns = [];
    for (let k = 0; k < columnPairCount; k++) {
      const top = categoryInfos.find(c => c.idx === 2 * k && c.isTop);
      const bot = categoryInfos.find(c => c.idx === 2 * k + 1 && !c.isTop);
      columns.push([top, bot].filter(Boolean));
    }

    let cursor = null;
    columns.forEach(members => {
      const extent = Math.max(...members.map(c => c.horizontalExtentFromSpine));
      const columnGap = Math.round(p.columnGapPreferred / p.baseUnit) * p.baseUnit;
      const x = cursor === null
        ? p.horizontalMargin + extent
        : cursor + extent + columnGap;
      members.forEach(c => { c.spineX = x; });
      cursor = x;
    });

    // spine の最右端: 最後の列の spine X
    let lastCategoryX = cursor ?? p.horizontalMargin;
    const spineEndX = lastCategoryX + 100;

    // 効果ボックスの寸法を決定（テキスト長に応じて縦長 / 横長）
    const effectText = data.effect || '';
    const effectLayout = this.computeEffectBoxLayout(effectText);
    const effectX = spineEndX + p.effectGap;

    // SVG 全体の幅 (アスペクト比下限を満たすよう左右パディング)
    let svgWidth = effectX + effectLayout.width + p.horizontalMargin;
    let spineStartX = p.horizontalMargin;
    let effectXFinal = effectX;
    let spineEndXFinal = spineEndX;

    // 目標アスペクト比は参考値とし、内容密着を優先する。アスペクト補正の
    // 追加余白には上限を設け、無条件に大きな空白を追加しない。
    const preferredAspectMin = 1.20;
    if (svgWidth / svgHeight < preferredAspectMin) {
      const targetWidth = svgHeight * preferredAspectMin;
      const maxPadding = Math.min(p.maxAspectPadding, svgWidth * p.maxAspectPaddingRatio);
      const shift = Math.min((targetWidth - svgWidth) / 2, maxPadding / 2);
      spineStartX += shift;
      spineEndXFinal += shift;
      effectXFinal += shift;
      categoryInfos.forEach(c => { c.spineX += shift; });
      svgWidth += shift * 2;
    }

    // 各カテゴリの大骨と原因の座標を計算 (シフト後の spineX を反映)
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
    const boxOffset = info.categoryBoxHeight * 0.25;
    info.boxCenter = {
      x: info.boneEndX - boxOffset * cosA,
      y: info.boneEndY + sign * boxOffset * sinA,
    };

    // 中骨は絶対距離モデルで配置する (t 比率は使わない)。
    // pairCenters[k] は背骨からの絶対距離 (px)。同じペア (i, i+1) は
    // 同じ pairCenters を共有し、大骨の高さ順に並べると必ず
    // L,R,L,R,... の交互サイクルになる (外側=center、内側=center+stagger)。
    info.causes = info.category.causes.map((cause, i) => {
      const side = info.sideOfIndex[i];
      const k = info.pairSlotOfIndex[i];
      const distFromSpine = side === 'right'
        ? info.pairCenters[k] + p.pairStaggerPx
        : info.pairCenters[k];

      const attachX = info.spineX - distFromSpine * cosA;
      const attachY = spineY + sign * distFromSpine * sinA;
      const cm = info.causeContents[i];

      // 中骨方向と長さ
      // side='left'  : 外側 (-x), 長さは cm.causeLength
      // side='right' : 内側 (+x), 長さは背骨に届かないよう制限
      let direction, causeLen;
      if (side === 'left') {
        direction = -1;
        causeLen = cm.causeLength;
      } else {
        direction = 1;
        // 内側中骨の最大長: 先端の中骨ラベル・小骨/孫骨連鎖のいずれも
        // 背骨に届かない距離に制限する (実行時安全キャップ)。
        const ownTipExtras = Math.max(
          (cm.numSub > 0 ? cm.subLen * cosS : 0)
            + (cm.hasDetails ? p.detailLength + cm.maxDetailLabel + 16 : 0),
          cm.causeLabelW + 12,
        ) + this.effectiveInnerSafeMargin();
        const distToSpine = info.spineX - attachX;
        const maxInner = distToSpine - ownTipExtras;
        causeLen = Math.max(80, Math.min(cm.causeLength, maxInner));
      }

      const startX = attachX + direction * causeLen; // 中骨の free end
      const startY = attachY;

      // 小骨レイアウト (side 情報と背骨 Y を伝搬)。中骨自身の長さ (cm.subLen)
      // を使う (図全体には統一しない)。causeSide を伝搬: 孫骨の左右交互
      // 展開を安全な範囲 (外側の中骨) に限定するための判定材料として使う
      const subInfos = this.computeSubcauseGeometry(
        cause,
        {
          startX, startY, attachX, attachY, causeLen,
          isTop: info.isTop,
          side,
          direction,
          spineY,
          spineX: info.spineX,
          subLen: cm.subLen,
          subLens: cm.subLens,
          causeSide: side,
          maxSubLabel: cm.maxSubLabel || 0,
          // 孫骨の交互展開の安全判定 (大骨との交差チェック) に使う
          boneStartX: info.spineX,
          boneStartY: spineY,
          boneEndX: info.boneEndX,
          boneEndY: info.boneEndY,
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

    // 小骨は「中骨の付け根 (大骨側 = 親の親に近い側)」から絶対距離
    // firstSubcauseGap (既定 48px) を基準に開始し、実際に必要な間隔だけ
    // 自由端方向へ詰めて展開する (t 比率は使わない)。子が少ない中骨は
    // 付け根付近にまとまり、多い中骨だけが自由端側へ伸びる。stepPx は
    // 「同じ側 (上/下) の隣接小骨」が重ならない間隔 (ラベル幅+マージン)
    // の半分 (2 ステップで 1 間隔分)。
    // 上下交互のインターリーブ配置: 同じ側 (2本毎) はラベル幅ベースの
    // 安全間隔、隣り合う反対側は 32px の段差のみ (Phase 1 と同じ計算)。
    // 終端余白 40px: 中骨の自由端には中骨ラベルが置かれるため、
    // 最後の小骨がそこへ近づきすぎないようにする (subTipClear と対応)
    const distances = this.computeInterleavedDistances(
      subs.length, p.firstSubcauseGap, (ctx.maxSubLabel || 0) + 24, p.subStagger,
      ctx.causeLen, 40,
    );
    const horizontalDir = ctx.direction;
    // 内側小骨が背骨にぶつからないよう、最大長を概算
    // 中骨の Y 座標 (cause line Y) と背骨 Y の距離 = |attachY - spineY|
    // 内側小骨先端の Y = attachY + sign * len * sinS が背骨を越えないこと
    const distToSpineY = Math.abs(ctx.attachY - (ctx.spineY ?? 0));
    const innerSubMaxLen =
      distToSpineY > 0
        ? Math.max(40, (distToSpineY - this.effectiveInnerSafeMargin()) / sinS)
        : ctx.subLen;

    // 「同じ側 (上/下)」の隣接小骨との間隔 (px、実測)。
    // 小骨は上下交互のため、衝突リスクがあるのは同じ側の小骨同士のみ
    // (i と i+2)。隣り合う i と i+1 は反対側なので考慮不要 — ここを
    // 誤って考慮すると安全距離が半分になり反転がほぼ常に禁止されてしまう。
    // 孫骨を反転展開する際、同じ側の次の小骨の陣地まで届かないよう
    // この値の一部を安全な反転距離の上限として使う。
    const sameSideStepX = subs.length > 2
      ? Math.abs(distances[2] - distances[0])
      : Infinity; // 同じ側の隣が存在しない (2本以下) → 制約なし
    const maxSafeFlipReach = sameSideStepX * 0.40;

    // どの小骨をどの位置 (側) に置くかは内容量で決める:
    //  - 孫骨が少ない/無い小骨 (floor(n/2) 本) を内側 (背骨側、奇数位置) へ
    //    → 内側は短く描かれる (0.68 短縮) ため、孫骨ラベルの居場所が
    //      要らない軽い小骨が適する。背骨との安全距離も小さく済む。
    //  - 孫骨持ちの小骨を外側 (偶数位置) へ、付け根から遠いほど内容が
    //    重くなるよう昇順に並べる → 孫骨ラベルが、同じ側の隣の小骨の
    //    先端ラベルへ届いて重なる事故を防ぐ。
    // 上下交互サイクル (位置の交互) 自体は保たれる。
    const lens = subs.map((_, i) => (ctx.subLens && ctx.subLens[i]) || ctx.subLen);
    const sortedIdx = subs.map((_, i) => i)
      .sort((a, b) =>
        (lens[a] - lens[b])
        || (subs[a].details.length - subs[b].details.length)
        || (a - b));
    const nToward = Math.floor(subs.length / 2);
    const towardIdxs = sortedIdx.slice(0, nToward);   // 軽い順 → 位置 1,3,5,...
    const awayIdxs = sortedIdx.slice(nToward);        // 軽い順 → 位置 0,2,4,...
    const subIdxAtPos = [];
    for (let pos = 0; pos < subs.length; pos++) {
      subIdxAtPos[pos] = pos % 2 === 0
        ? awayIdxs[pos / 2]
        : towardIdxs[(pos - 1) / 2];
    }

    return subIdxAtPos.map((subIdx, i) => {
      const sub = subs[subIdx];
      const d = distances[i]; // 中骨の付け根からの絶対距離 (px)
      const attachX = ctx.attachX + horizontalDir * d;
      const attachY = ctx.startY;

      // 上下交互 (位置 i=0 → 外側、i=1 → 内側)
      const isOuterSub = (i % 2 === 0);
      const verticalDir = ctx.isTop
        ? (isOuterSub ? -1 : +1)
        : (isOuterSub ? +1 : -1);

      const hasDetails = sub.details && sub.details.length > 0;
      // 小骨長は 1 本ごとに自身の孫骨量から決定済み (Phase 2 バンド統一)
      const lenBase = lens[subIdx];
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

      // 孫骨の左右交互展開は「外側の中骨 かつ 外側の小骨」に限定候補とし、
      // さらに大骨ラインとの実際の交差チェックを個別に行う (computeDetailGeometry 内)
      const allowAlternateDetails = (ctx.causeSide === 'left') && isOuterSub;

      const detailInfos = this.computeDetailGeometry(
        sub,
        {
          attachX, attachY, endX, endY,
          isTop: ctx.isTop,
          verticalDir,
          horizontalDir,
          subLen: len,
          sinS, cosS,
          allowAlternate: allowAlternateDetails,
          maxSafeFlipReach,
          boneStartX: ctx.boneStartX,
          boneStartY: ctx.boneStartY,
          boneEndX: ctx.boneEndX,
          boneEndY: ctx.boneEndY,
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
   *
   * ルール: 小骨は斜め骨 ⇒ 孫骨は左右交互に展開する (再帰ルール)。
   * ただし当初は全ての小骨でこれを適用したところ、INNER 孫骨が
   * 親小骨の傾きと大骨方向の関係で大骨ラインに干渉するケースが
   * 発生したため、交互展開は ctx.allowAlternate が true の場合のみ
   * (= 外側の中骨 かつ 外側の小骨という最も安全な組み合わせ) 有効にし、
   * それ以外 (内側配置で大骨に近い場合) は従来通り親小骨と同じ方向に
   * 統一して安全性を確保する。
   *
   * 交互展開時: 偶数番目 (i=0,2,...) は親と同じ方向 (外側)、
   * 奇数番目 (i=1,3,...) は反対方向 (内側) に伸ばす。
   */
  computeDetailGeometry(sub, ctx) {
    const p = this.params;
    if (!sub.details.length) return [];

    // 孫骨は「小骨の付け根 (中骨側 = 親の親に近い側)」から絶対距離
    // firstDetailGap (既定 32px) を基準に開始し、実際に必要な間隔だけ
    // 自由端方向へ詰めて展開する (t 比率は使わない)。詳細が少ない小骨は
    // 付け根付近にまとまり、多い小骨だけが自由端側へ伸びる。
    const detailLabelMs = sub.details.map(d =>
      this.wrappedLabelMetrics(
        typeof d === 'string' ? d : d.name, p.fontPx.detail, p.labelWrapWidth.detail));
    const maxDetailLabelHere = detailLabelMs.length
      ? Math.max(...detailLabelMs.map(m => m.width))
      : 0;
    const stepPx = maxDetailLabelHere + p.detailLabelGap * 2 + 14;
    // 終端余白 32px: 小骨の自由端には小骨ラベルが置かれるため、
    // 最後の孫骨がそこへ近づきすぎないようにする (Phase 1 の
    // detailTipClear と対応)
    const distances = this.computeAnchoredPackedDistances(
      sub.details.length, p.firstDetailGap, stepPx, ctx.subLen, 32,
    );
    const parentDir = ctx.horizontalDir;
    const hasBoneRef = ctx.boneStartX !== undefined && ctx.boneEndX !== undefined;

    return sub.details.map((detailRaw, i) => {
      const detail = typeof detailRaw === 'string'
        ? { name: detailRaw, important: false }
        : detailRaw;
      const d = distances[i]; // 小骨の付け根からの絶対距離 (px)
      const attachX = ctx.attachX + ctx.horizontalDir * ctx.cosS * d;
      const attachY = ctx.attachY + ctx.verticalDir * ctx.sinS * d;

      let isOuterDetail = !ctx.allowAlternate || (i % 2 === 0);

      if (!isOuterDetail) {
        // 反転候補: 大骨ラインとの交差、および隣接小骨の陣地への
        // 侵入を検査する。ラベルは線の終点からさらに外側に伸びて
        // 描画されるため、ラベル幅も含めた「実効到達距離」で判定する
        // (線分だけで判定するとラベルがはみ出て交差/衝突する)
        const detailName = typeof detailRaw === 'string' ? detailRaw : detailRaw.name;
        const labelW = this.estimateTextWidth(detailName, p.fontPx.detail);
        const effectiveReach = p.detailLength + labelW + 8;

        // 1) 隣接小骨の領域を侵さないか (中骨上の間隔の 42% を上限とする)
        const withinNeighborBudget =
          !isFinite(ctx.maxSafeFlipReach) || effectiveReach <= ctx.maxSafeFlipReach;

        // 2) 大骨ラインとの交差・過度な接近がないか
        let safeFromBone = true;
        if (hasBoneRef) {
          const flippedStartX = attachX - parentDir * effectiveReach;
          safeFromBone = !this.segmentTooCloseToLine(
            attachX, attachY, flippedStartX, attachY,
            ctx.boneStartX, ctx.boneStartY, ctx.boneEndX, ctx.boneEndY,
            this.effectiveInnerSafeMargin()
          );
        }

        if (!withinNeighborBudget || !safeFromBone) isOuterDetail = true;
      }

      const horizontalDir = isOuterDetail ? parentDir : -parentDir;

      const startX = attachX + horizontalDir * p.detailLength;
      const startY = attachY;

      return {
        detail,
        attachX, attachY,
        startX, startY,
        verticalDir: ctx.verticalDir,
        horizontalDir,
      };
    });
  }

  /**
   * 線分 (ax,ay)-(bx,by) が 直線 (lx1,ly1)-(lx2,ly2) の有限線分に
   * margin 未満まで接近する、または交差するかどうかを判定する。
   * 孫骨の反転展開が大骨ラインに干渉しないかの安全チェックに使用。
   */
  segmentTooCloseToLine(ax, ay, bx, by, lx1, ly1, lx2, ly2, margin) {
    // 線分同士の交差判定 (交差していれば当然危険)
    const ccw = (p1x, p1y, p2x, p2y, p3x, p3y) =>
      (p3y - p1y) * (p2x - p1x) - (p2y - p1y) * (p3x - p1x);
    const d1 = ccw(lx1, ly1, lx2, ly2, ax, ay);
    const d2 = ccw(lx1, ly1, lx2, ly2, bx, by);
    const d3 = ccw(ax, ay, bx, by, lx1, ly1);
    const d4 = ccw(ax, ay, bx, by, lx2, ly2);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true; // 実際に交差
    }
    // 交差していなくても、線分 (ax,ay)-(bx,by) の端点 b が大骨線分に
    // margin 未満まで接近していないか (点と線分の最短距離) を確認
    const distPointToSegment = (px, py, x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = x1 + t * dx, cy = y1 + t * dy;
      return Math.hypot(px - cx, py - cy);
    };
    const dist = distPointToSegment(bx, by, lx1, ly1, lx2, ly2);
    return dist < margin;
  }

  /**
   * 効果ボックスのレイアウトを決定
   * 模範図 (QC 教科書の実例) にならい横書き複数行で折り返す。
   * 縦書き複数列は画面上の可読性が低いため廃止。
   */
  computeEffectBoxLayout(text) {
    const p = this.params;
    const fontSize = p.fontPx.effect;
    const t = text || '';

    if (!t) {
      return { width: 150, height: 76, lines: [''] };
    }

    // 1 行あたり約 9 全角文字で貪欲に折返し
    const maxLineW = fontSize * 9;
    const lines = this.wrapLabelMulti(t, fontSize, maxLineW);
    const maxW = Math.max(...lines.map(l => this.estimateTextWidth(l, fontSize)));
    const lineH = fontSize + 8;
    return {
      width: Math.max(150, maxW + 44),
      height: lines.length * lineH + 28,
      lines,
    };
  }

  /**
   * 貪欲法でテキストを複数行に折り返す (行数無制限)
   */
  wrapLabelMulti(text, fontSize, maxWidth) {
    const lines = [];
    let current = '';
    let currentW = 0;
    for (const ch of text) {
      const chW = fontSize * (ch.charCodeAt(0) < 128 ? 0.55 : 1.0);
      if (currentW + chW > maxWidth && current) {
        lines.push(current);
        current = ch;
        currentW = chW;
      } else {
        current += ch;
        currentW += chW;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
  }

  /**
   * 汎用: 親骨上で子骨を「親の親に近い側」から絶対距離 (px) で詰めて
   * 配置する。firstGap を起点に、以降は stepPx ずつ自由端方向へ進む。
   * 親骨長は Phase 1 でこの配置に必要な長さを見込んで決まっているため、
   * 通常は収まる。極端に収まらない場合のみ全体を比例圧縮する
   * (per-step クランプだと複数点が同じ位置に重なりラベルが完全一致して
   *  しまうため、必ず不等間隔を保つ)。
   */
  computeAnchoredPackedDistances(n, firstGap, stepPx, parentLenPx, endPad = 0) {
    if (n <= 0) return [];
    const ds = [firstGap];
    for (let k = 1; k < n; k++) {
      ds.push(ds[k - 1] + stepPx);
    }
    const limit = Math.max(firstGap, parentLenPx - endPad);
    const last = ds[n - 1];
    if (last <= limit || n === 1) return ds;
    const span = last - firstGap;
    const scale = span > 0 ? (limit - firstGap) / span : 0;
    return ds.map(d => firstGap + (d - firstGap) * scale);
  }

  /**
   * 上下 (左右) 交互に展開する子骨の親骨上の絶対距離を計算する。
   * 交互配置では衝突リスクがあるのは「同じ側 (index 差 2)」の子同士
   * のみなので、同じ側にはラベル幅ベースの安全間隔 (sameSideStep) を、
   * 隣り合う反対側の子には小さな段差 (oppStagger) だけを与える。
   * これにより、均等な全間隔確保よりも大幅にコンパクトに詰められる。
   * parentLenPx - endPad に収まらない場合は全体を比例圧縮する
   * (per-step クランプによる完全重なりを避ける)。
   */
  computeInterleavedDistances(n, firstGap, sameSideStep, oppStagger, parentLenPx, endPad = 0) {
    if (n <= 0) return [];
    const ds = [];
    for (let i = 0; i < n; i++) {
      if (i === 0) ds.push(firstGap);
      else if (i === 1) ds.push(firstGap + oppStagger);
      else ds.push(ds[i - 2] + sameSideStep);
    }
    if (parentLenPx === undefined) return ds;
    const limit = Math.max(firstGap, parentLenPx - endPad);
    const last = ds[n - 1];
    if (last <= limit || n === 1) return ds;
    const span = last - firstGap;
    const scale = span > 0 ? (limit - firstGap) / span : 0;
    return ds.map(d => firstGap + (d - firstGap) * scale);
  }

  /**
   * 内側 (背骨側) 骨の実効安全距離 (仕様 12 節)。
   * 固定値だけでなく、フォントサイズ・矢印サイズも考慮する。
   */
  effectiveInnerSafeMargin() {
    const p = this.params;
    return Math.max(
      p.innerSafeMargin,
      p.fontPx.subcause * 1.4,
      10 + 8, // 中骨矢印サイズ + 8
    );
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

  /**
   * 長いラベルを最大 2 行にバランス良く折り返す
   * @returns {string[]} 1 行または 2 行の配列
   */
  wrapLabel(text, fontSize, maxWidth) {
    if (!text) return [''];
    const total = this.estimateTextWidth(text, fontSize);
    if (total <= maxWidth) return [text];
    // 2 行に均等分割: 累積幅が半分を超える位置で切る
    const half = total / 2;
    let acc = 0;
    let splitIdx = 1;
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      const isAscii = chars[i].charCodeAt(0) < 128;
      acc += fontSize * (isAscii ? 0.55 : 1.0);
      if (acc >= half) {
        splitIdx = Math.min(Math.max(1, i + 1), chars.length - 1);
        break;
      }
    }
    return [
      chars.slice(0, splitIdx).join(''),
      chars.slice(splitIdx).join(''),
    ];
  }

  /**
   * 折返し後のラベル幅 (最長行) を推定
   */
  wrappedLabelMetrics(text, fontSize, maxWidth) {
    const lines = this.wrapLabel(text, fontSize, maxWidth);
    const width = Math.max(...lines.map(l => this.estimateTextWidth(l, fontSize)));
    return { lines, width, lineCount: lines.length };
  }

  // ===== 描画 =====

  drawAll() {
    this.drawSpine();
    this.drawEffect();
    this.drawCategories();
  }

  drawSpine() {
    const L = this.layout;
    // 背骨は特性ボックスの左辺まで延長し、矢先がボックスに接する (教科書ルール)
    const tipX = L.effectX - 4;
    const spineLine = this.createLine(
      L.spineStartX, L.spineY, tipX - 6, L.spineY,
      6, this.style.spine
    );
    this.mainGroup.appendChild(spineLine);

    const arrow = this.createArrowhead(tipX, L.spineY, 0, 20, this.style.spine);
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

    // 横書き複数行 (模範図スタイル)。ボックス中央に行ブロックを配置
    const fontSize = p.fontPx.effect;
    const lineH = fontSize + 8;
    const lines = eff.lines || [''];
    const cx = x + eff.width / 2;
    const blockTop = L.effectY - ((lines.length - 1) * lineH) / 2;
    const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textEl.setAttribute('x', cx);
    textEl.setAttribute('y', blockTop);
    textEl.setAttribute('font-size', fontSize);
    textEl.setAttribute('font-weight', 'bold');
    textEl.setAttribute('fill', this.style.textLight);
    textEl.setAttribute('text-anchor', 'middle');
    textEl.setAttribute('dominant-baseline', 'middle');
    textEl.setAttribute('font-family', 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif');
    lines.forEach((line, i) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', cx);
      tspan.setAttribute('dy', i === 0 ? 0 : lineH);
      tspan.textContent = line;
      textEl.appendChild(tspan);
    });
    group.appendChild(textEl);

    this.makeGroupDraggable(group, 'effect');
    this.mainGroup.appendChild(group);
    this.elements.push({ type: 'effect', element: group, data: this.data });
  }

  drawCategories() {
    this.layout.categoryInfos.forEach(info => this.drawCategory(info));
  }

  drawCategory(info) {
    const p = this.params;
    // カテゴリごとの色 (パレットを循環)
    const color = this.categoryPalette[info.idx % this.categoryPalette.length];

    // 大骨 (カテゴリ色で系統をグルーピング)
    const boneLine = this.createLine(
      info.spineX, info.spineY, info.boneEndX, info.boneEndY,
      4.2, color.fill
    );
    this.mainGroup.appendChild(boneLine);

    // 矢印（背骨上に向かう）
    const arrowAngle = Math.atan2(info.spineY - info.boneEndY, info.spineX - info.boneEndX) * 180 / Math.PI;
    const arrow = this.createArrowhead(info.spineX, info.spineY, arrowAngle, 12, color.fill);
    this.mainGroup.appendChild(arrow);

    // カテゴリボックス（大骨先端中心、カテゴリ色）
    // ボックスサイズはカテゴリ名の長さに応じて拡幅・拡高される (長文で折返し)
    const group = this.createGroup();
    const bw = info.categoryBoxWidth;
    const bh = info.categoryBoxHeight;
    const bx = info.boxCenter.x - bw / 2;
    const by = info.boxCenter.y - bh / 2;
    const rect = this.createRect(
      bx, by, bw, bh,
      color.fill, color.stroke, 2, 6
    );
    rect.setAttribute('filter', 'url(#boxShadow)');
    group.appendChild(rect);
    const txt = this.createWrappedText(
      info.boxCenter.x, info.boxCenter.y,
      info.catLabelLines,
      p.fontPx.category, 'bold',
      this.style.textLight, 'middle',
      0
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
      2.6, this.style.cause
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 大骨に向かう)
    // LEFT cause: free end は左、attach は右 → 矢印は右向き (angle=0)
    // RIGHT cause: free end は右、attach は左 → 矢印は左向き (angle=180)
    const arrowAngle = isLeft ? 0 : 180;
    const arrow = this.createArrowhead(
      causeInfo.attachX, causeInfo.attachY, arrowAngle, 10, this.style.cause
    );
    this.mainGroup.appendChild(arrow);

    // ラベル: 中骨の free end の少し外側。長文は 2 行に折り返し、
    // 骨のライン上に上下中央でブロック配置 (先端の先なので線と重ならない)
    const labelGroup = this.createGroup();
    const labelX = causeInfo.startX + (isLeft ? -6 : 6);
    const anchor = isLeft ? 'end' : 'start';
    const lines = this.wrapLabel(
      causeInfo.cause.name, p.fontPx.cause, p.labelWrapWidth.cause);
    const labelDy = lines.length > 1
      ? 0  // 複数行はブロックを線の中心に
      : (catInfo.isTop ? -p.causeLabelGap * 0.4 : p.causeLabelGap * 0.4);
    const labelText = this.createWrappedText(
      labelX,
      causeInfo.startY + labelDy,
      lines,
      p.fontPx.cause, '700',
      this.style.textDark,
      anchor,
      0  // 中央揃え
    );
    labelGroup.appendChild(labelText);
    if (causeInfo.cause.important) {
      labelGroup.insertBefore(
        this.createImportanceEllipse(
          labelX, causeInfo.startY + labelDy, lines, p.fontPx.cause, anchor, 0),
        labelText
      );
    }
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
      1.8, this.style.subcause
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 中骨に向かう, 線の進行方向に沿う)
    const arrowAngle = Math.atan2(
      subInfo.attachY - subInfo.endY,
      subInfo.attachX - subInfo.endX,
    ) * 180 / Math.PI;
    const arrow = this.createArrowhead(
      subInfo.attachX, subInfo.attachY, arrowAngle, 8, this.style.subcause
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
    // 長文は 2 行に折り返し、小骨の伸びる方向 (外側) に積む
    const lines = this.wrapLabel(
      subInfo.sub.name, p.fontPx.subcause, p.labelWrapWidth.subcause);
    const labelText = this.createWrappedText(
      labelAnchorX,
      labelAnchorY + labelDy,
      lines,
      p.fontPx.subcause, '600',
      this.style.textMid,
      anchor,
      verticalDir  // UP 小骨は上へ、DOWN 小骨は下へ積む
    );
    labelGroup.appendChild(labelText);
    if (subInfo.sub.important) {
      labelGroup.insertBefore(
        this.createImportanceEllipse(
          labelAnchorX, labelAnchorY + labelDy, lines, p.fontPx.subcause, anchor, verticalDir),
        labelText
      );
    }
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
      1.2, this.style.detail
    );
    this.mainGroup.appendChild(line);

    // 矢印 (attach 側 = 小骨に向かう)
    // LEFT: arrow points right (angle=0), RIGHT: arrow points left (angle=180)
    const arrowAngle = isLeft ? 0 : 180;
    const arrow = this.createArrowhead(
      detailInfo.attachX, detailInfo.attachY, arrowAngle, 6, this.style.detail
    );
    this.mainGroup.appendChild(arrow);

    // ラベル: 親小骨の verticalDir に従って上下決定 (上下交互配置対応)
    // 長文は 2 行に折り返し、親小骨の方向に積む
    const labelGroup = this.createGroup();
    const subVDir = detailInfo.verticalDir || (catInfo.isTop ? -1 : 1);
    const labelDy = subVDir * 7;  // 親小骨方向に追従
    const labelX = detailInfo.startX + (isLeft ? -2 : 2);
    const anchor = isLeft ? 'end' : 'start';
    const detailName = detailInfo.detail.name;
    const lines = this.wrapLabel(
      detailName, p.fontPx.detail, p.labelWrapWidth.detail);
    const labelText = this.createWrappedText(
      labelX,
      detailInfo.startY + labelDy,
      lines,
      p.fontPx.detail, 'normal',
      this.style.textMuted,
      anchor,
      subVDir
    );
    labelGroup.appendChild(labelText);
    if (detailInfo.detail.important) {
      labelGroup.insertBefore(
        this.createImportanceEllipse(
          labelX, detailInfo.startY + labelDy, lines, p.fontPx.detail, anchor, subVDir),
        labelText
      );
    }
    this.makeGroupDraggable(labelGroup, 'detail', { name: detailName });
    this.mainGroup.appendChild(labelGroup);
    this.elements.push({ type: 'detail', element: labelGroup, data: { name: detailName } });
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
   * 折返し済みの複数行テキストを作成
   * @param {string[]} lines - wrapLabel の結果
   * @param {number} stackDir - 行の積み方向:
   *   -1 = 上に積む (最終行がアンカー y)、+1 = 下に積む (先頭行がアンカー y)、
   *    0 = ブロックを y 中心に配置
   */
  createWrappedText(x, y, lines, fontSize, fontWeight, fill, textAnchor, stackDir = 0) {
    const lineH = fontSize + 3;
    const n = lines.length;
    let y0;
    if (stackDir < 0) {
      y0 = y - (n - 1) * lineH;      // 上へ積む
    } else if (stackDir > 0) {
      y0 = y;                         // 下へ積む
    } else {
      y0 = y - ((n - 1) * lineH) / 2; // 中央揃え
    }
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y0);
    t.setAttribute('font-size', fontSize);
    t.setAttribute('font-weight', fontWeight);
    t.setAttribute('fill', fill);
    t.setAttribute('text-anchor', textAnchor);
    t.setAttribute('dominant-baseline', 'middle');
    t.setAttribute('font-family', 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif');
    lines.forEach((line, i) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', i === 0 ? 0 : lineH);
      tspan.textContent = line;
      t.appendChild(tspan);
    });
    return t;
  }

  /**
   * 重要要因の丸囲み (QC の慣習: 重要と思われる要因を赤楕円で囲む)
   * createWrappedText と同じ配置ロジックでラベルブロックを囲む楕円を作る
   */
  createImportanceEllipse(x, y, lines, fontSize, textAnchor, stackDir = 0) {
    const lineH = fontSize + 3;
    const n = lines.length;
    let y0;
    if (stackDir < 0) y0 = y - (n - 1) * lineH;
    else if (stackDir > 0) y0 = y;
    else y0 = y - ((n - 1) * lineH) / 2;
    const cy = y0 + ((n - 1) * lineH) / 2;
    const w = Math.max(...lines.map(l => this.estimateTextWidth(l, fontSize)));
    const blockH = (n - 1) * lineH + fontSize;
    let cx;
    if (textAnchor === 'end') cx = x - w / 2;
    else if (textAnchor === 'start') cx = x + w / 2;
    else cx = x;
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', cx);
    ellipse.setAttribute('cy', cy);
    ellipse.setAttribute('rx', w / 2 + 14);
    ellipse.setAttribute('ry', blockH / 2 + 9);
    ellipse.setAttribute('fill', 'none');
    ellipse.setAttribute('stroke', '#d63031');
    ellipse.setAttribute('stroke-width', 2.4);
    return ellipse;
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

  exportAsPNG(scale = 2) {
    // 高解像度エクスポート (既定 2 倍) — 印刷・スライド貼付でも文字が鮮明
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
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    img.onload = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
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
