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
 *  - 線の太さは階層で単調減少 (背骨 5 > 大骨 3.5 > 中骨 2.2 > 小骨 1.5 > 孫骨 1)。
 *
 * 自動レイアウトのルール:
 *  - 完全データ駆動: 描画前に全座標を計算し、どんなデータでも重ならない
 *    キャンバスサイズと配置を決める (テキスト幅も推定して反映)。
 *  - 親骨の長さは子骨のペア数 (ceil(N/2)) に応じて段階的に伸縮。
 *  - 大骨長は全カテゴリで統一 → 大骨先端の Y がそろい、バランスが取れる。
 *  - モード (両側ペア/片側) は図全体で統一。全カテゴリが両側配置の
 *    閾値に収まる場合のみペア、それ以外は片側にフォールバック。
 *  - 背骨は常にキャンバスの上下中央。最低アスペクト比 1.15 を保証。
 *  - 内側 (背骨側) へ伸びる中骨・小骨は背骨に届かない長さに自動キャップ。
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
    // 中骨は「ペア配置(両側)」を優先し、データ密度が高くて両側配置が
    // キャンバスを巨大化させる場合のみ片側(全て外側)にフォールバック。
    this.params = {
      majorAngleDeg: 60,           // 大骨の傾き (教科書標準の 60°)
      subcauseAngleDeg: 60,        // 小骨の傾き = 大骨と平行 (教科書ルール)

      // ペア配置 (両側) 用 t 範囲
      // 中骨は「大骨の付け根 (背骨側) から必要な分だけ」順に詰めて配置する
      // (親骨側 = 大骨の起点から展開するイメージ)。pairTAnchor は最初の
      // ペアが取り得る最小 t (背骨に最も近い位置)。そこから先は
      // 実際に必要な間隔 (verticalNeedBetweenCauses / 内側クリアランス)
      // の分だけ t を進める — 均等配置 (computeEvenT) だと不要に
      // pairTMax まで広げてしまい、原因数が奇数/少数のカテゴリで
      // 中間に大きな空白ができる (スカスカの原因) ため、
      // 必要最小限の間隔で詰めるモデルに変更。
      pairTAnchor: 0.16,
      pairTMax: 0.86,
      // 大骨長 L が小さい図で、ペアが pairTMax まで詰まっても
      // カテゴリボックスまで最低限これだけの絶対距離 (px) を確保する
      // (小骨・重要マーク楕円がボックスに接触しないようにする安全弁)
      pairBoxClearance: 150,
      // pairTs (中骨ペアの位置) 計算時のみに使う内側クリアランスの緩和係数
      // (大骨長 L のサイジングには使わない、緩和なしの値を使う。詳細は
      // globalInnerNeedByPairIndexForTs のコメント参照)
      innerNeedRelax: 0.94,
      // 片側配置 (フォールバック) 用 t 範囲
      singleTMin: 0.18,
      singleTMax: 0.84,

      subcauseTMin: 0.18,
      subcauseTMax: 0.84,
      subcauseStaggerRatio: 0.68,
      detailTMin: 0.30,
      detailTMax: 0.76,

      causeSpacingAlongBone: 96,
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
      effectGap: 18,               // 背骨矢先は特性ボックスに接する (教科書ルール)
      pairStaggerT: 0.08,          // ペアの左右段差: 右(内側)を先端寄りに (模範図の描き方 + 内側の横余地確保)
      effectBoxMaxHeight: 360,
      spineEndPadding: 110,
      innerSafeMargin: 26,
      // 最小描画範囲 (空きカテゴリでも視覚を保つ)
      minCanvasHeight: 520,
      minCanvasWidth: 900,

      // 相対可読性: 専用ソフト並みにキャンバスに対して文字を大きく
      fontPx: {
        effect: 24,
        category: 18,
        cause: 15,
        subcause: 13,
        detail: 12,
      },
      sideMarginX: 70,
      verticalMargin: 56,
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

    const numCategories = Math.max(1, data.categories.length);
    const numTop = Math.ceil(numCategories / 2);
    const numBottom = Math.floor(numCategories / 2);

    // 1) 各カテゴリ・各原因の「必要な長さ」の材料 (causeMetrics) を計算
    //    (この段階ではまだ長さを確定しない — 全体最大値を後で求めるため)
    const tSubRange = p.subcauseTMax - p.subcauseTMin;
    const categoryBasics = data.categories.map((cat, idx) => {
      const isTop = idx % 2 === 0;
      const numCauses = Math.max(1, cat.causes.length);
      const numPairs = Math.ceil(numCauses / 2);

      // カテゴリ名も長文なら折返し、ボックス自体を拡幅・拡高する
      // (固定幅のままだと長いカテゴリ名がボックスからはみ出しキャンバス外で
      // 切れてしまうため、cause/subcause/detail と同じ折返しルールを適用)
      const catLabelM = this.wrappedLabelMetrics(
        cat.name, p.fontPx.category, p.labelWrapWidth.category);
      const categoryBoxWidth = Math.max(p.categoryBoxWidth, catLabelM.width + 28);
      const categoryBoxHeight = Math.max(
        p.categoryBoxHeight,
        catLabelM.lineCount * (p.fontPx.category + 6) + 20
      );

      const causeMetrics = cat.causes.map(cause => {
        // ラベルは labelWrapWidth を超えると 2 行に折り返される前提で幅を推定
        const causeLabelM = this.wrappedLabelMetrics(
          cause.name, p.fontPx.cause, p.labelWrapWidth.cause);
        const causeLabelW = causeLabelM.width + 20;
        const causeLabelLines = causeLabelM.lineCount;
        const numSub = cause.subcauses.length;

        const subLabelMs = cause.subcauses.map(s =>
          this.wrappedLabelMetrics(s.name, p.fontPx.subcause, p.labelWrapWidth.subcause));
        const maxSubLabel = numSub > 0
          ? Math.max(...subLabelMs.map(m => m.width))
          : 0;
        const maxSubLabelLines = numSub > 0
          ? Math.max(...subLabelMs.map(m => m.lineCount))
          : 1;

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

        const detailLabelMs = cause.subcauses.flatMap(s =>
          s.details.map(d =>
            this.wrappedLabelMetrics(
              typeof d === 'string' ? d : d.name,
              p.fontPx.detail, p.labelWrapWidth.detail)));
        const maxDetailLabel = detailLabelMs.length > 0
          ? Math.max(0, ...detailLabelMs.map(m => m.width))
          : 0;

        return {
          causeLabelW, causeLabelLines, subSpread, subMinLen: subLayoutLen,
          maxSubLabel, maxSubLabelLines,
          hasDetails, subLen, maxDetailLabel, numSub,
        };
      });

      return {
        category: cat, idx, isTop, numCauses, numPairs, causeMetrics,
        categoryBoxWidth, categoryBoxHeight, catLabelLines: catLabelM.lines,
      };
    });

    // 2) 「同じ層の親骨」の長さを図全体で統一する
    //    中骨 (親=大骨、子=小骨の数) と 小骨 (親=中骨、子=孫骨の数) それぞれの
    //    階層で、最も子骨数が多い (=最も長さを必要とする) ものを基準に
    //    全ての同階層の親骨へ同じ長さを適用する。
    //    これにより階層ごとに骨の長さが揃い、子が少ない骨だけが不釣り合いに
    //    間延びする「スカスカ」を防ぎつつ、全体で一貫した見た目になる
    //    (大骨長 globalL は既にこの方式で統一済み — 中骨・小骨も同じ考え方)。
    //
    // 注意: 統一の基準は「子骨数」であって「親骨自身のラベル幅」ではない。
    // causeLabelW (原因自身のラベル幅) を混ぜると、1 つだけ極端に長い
    // ラベルの原因が図全体の中骨長を間延びさせてしまう
    // (子骨が少ない他の原因まで無駄に長い骨になる = 別種のスカスカ)。
    // ラベルが骨より長い場合は単に骨の先端からラベルがはみ出して描画される
    // だけで正しく表示されるため、ラベル幅はキャンバスサイズ計算
    // (beyondAttachHorizontal 等) にのみ使い、骨の長さ自体には使わない。
    const allCauseMetrics = categoryBasics.flatMap(c => c.causeMetrics);
    const globalCauseLength = Math.max(
      p.causeBaseLength,
      ...allCauseMetrics.map(m => Math.max(m.subSpread, m.maxSubLabel + 40))
    );
    const globalSubLen = Math.max(
      p.subcauseLength,
      ...allCauseMetrics.map(m => m.subLen)
    );

    // 3) 統一された長さを使い、各カテゴリの派生量を計算
    const categoryInfos = categoryBasics.map(basic => {
      const {
        category: cat, idx, isTop, numCauses, numPairs, causeMetrics,
        categoryBoxWidth, categoryBoxHeight, catLabelLines,
      } = basic;
      const causeLength = globalCauseLength;
      const subLenLong = globalSubLen;
      const hasAnySubcauses = cat.causes.some(c => c.subcauses.length > 0);
      const hasAnyDetails = cat.causes.some(c => c.subcauses.some(s => s.details.length > 0));

      const maxSubLabelGlobal = Math.max(0, ...causeMetrics.map(m => m.maxSubLabel));
      const maxDetailLabelGlobal = Math.max(0, ...causeMetrics.map(m => m.maxDetailLabel));
      const maxCauseLabelW = Math.max(0, ...causeMetrics.map(m => m.causeLabelW));
      const maxCauseLabelLines = Math.max(1, ...causeMetrics.map(m => m.causeLabelLines));
      const maxSubLabelLines = Math.max(1, ...causeMetrics.map(m => m.maxSubLabelLines || 1));

      // 折返しによる追加行の高さ
      const causeLabelExtraH = (maxCauseLabelLines - 1) * (p.fontPx.cause + 3);
      const subLabelExtraH = (maxSubLabelLines - 1) * (p.fontPx.subcause + 3);

      // 小骨の垂直占有 (小骨が無いカテゴリは 0)
      const subVertical = hasAnySubcauses
        ? subLenLong * sinS + p.subcauseLabelGap + 18 + subLabelExtraH
        : 0;

      // 水平方向の張り出し (実データに応じて)
      const subHorizontalOuter = hasAnySubcauses ? subLenLong * cosS : 0;
      const detailHorizontalOuter = hasAnyDetails
        ? p.detailLength + maxDetailLabelGlobal + 16
        : 0;

      // 中骨の attach 点から先 (free end 方向) の最大水平張り出し:
      //   経路 1: 中骨本体 + 先端の中骨ラベル
      //   経路 2: 小骨 attach (t=subcauseTMax) + 小骨水平投影 + 孫骨連鎖
      // 従来は「中骨本体 + 小骨連鎖」で計算しており、
      //   - ラベルの張り出しが漏れる (長文で不足)
      //   - 小骨連鎖を骨の先端起点として過大評価
      // の両方を修正
      const beyondAttachHorizontal = Math.max(
        causeLength + maxCauseLabelW + 12,
        causeLength * p.subcauseTMax + subHorizontalOuter + detailHorizontalOuter,
      );

      // === 大骨長を 2 通り計算して、両側 / 片側を選択 ===
      // 縦間隔: 隣接する中骨の間には
      //   「手前の中骨の外側小骨」+「奥の中骨の内側小骨」が入る。
      //   外側小骨は小骨 1 本以上、内側小骨は小骨 2 本以上で初めて使われる。
      //   実データの使用状況に応じて必要分だけ確保する (スカスカ防止)。
      const anyOuterSub = cat.causes.some(c => c.subcauses.length >= 1);
      const anyInnerSub = cat.causes.some(c => c.subcauses.length >= 2);
      const sideNeed = subLenLong * sinS + subLabelExtraH + p.subcauseLabelGap;
      const outerNeed = anyOuterSub ? sideNeed : 0;
      const innerNeed = anyInnerSub ? sideNeed : 0;
      const verticalNeedBetweenCauses = Math.max(
        55,
        outerNeed + innerNeed + 22 + causeLabelExtraH,
      );

      // 両側配置: 中骨は「同じ親骨 (大骨) 上で左右交互のサイクル」で
      // 展開する (再帰ルール: 斜め骨の子は左右交互)。
      // このため左右は同じ t 配列を共有するペア単位で配置し、
      // 大骨に沿った見た目の順序が必ず L,R,L,R,... と交互になるように
      // する (左右を別々の t 範囲に分離すると、大骨上の実際の高さ順が
      // L,R,R,L のように崩れて交互サイクルに見えなくなるため)。
      const tipExtrasOf = m => Math.max(
        (m.numSub > 0 ? subLenLong * cosS : 0)
          + (m.hasDetails ? p.detailLength + m.maxDetailLabel + 16 : 0),
        m.causeLabelW + 12,
      );
      // 内側 (背骨側) 原因の必要長。ownLen は「最低限これだけあれば
      // 小骨ラベルが破綻しない」目安であり、実行時キャップ
      // (causeLen = max(80, min(causeLength, maxInner))) が別途安全弁
      // として働くため、ここでは緩めの係数をかけて大骨長の過大な
      // 事前確保を避ける (スカスカ防止)。
      const innerNeedOf = m => {
        const ownLen = Math.max(70, m.numSub > 0 ? m.subMinLen * 0.92 : 0);
        return ownLen + tipExtrasOf(m) + p.innerSafeMargin;
      };
      // どの原因をどのペア・どちら側にするかは、内容量 (内側にしたときの
      // 必要長) の昇順で決める。L,R,L,R... という交互サイクルは大骨上の
      // "位置" の順序であり、その位置をどの原因が占めるかは自由に選べる。
      // 軽い原因同士を背骨に一番近いペアにまとめ、ペア内では軽い方を
      // 内側にすることで、たまたま隣接する原因が両方重い場合でも
      // 背骨付近のペアだけは軽く保たれ、大骨全体が不必要に間延びしない
      // (重い原因は背骨から遠い — 元々余地の大きいペアに割り当てられる)。
      const orderByNeed = causeMetrics
        .map((m, i) => ({ i, need: innerNeedOf(m) }))
        .sort((a, b) => a.need - b.need)
        .map(o => o.i);

      const sideOfIndex = [];
      const pairSlotOfIndex = [];
      const innerNeedByPairIndex = [];
      for (let k = 0; k < numPairs; k++) {
        const a = orderByNeed[2 * k];
        const b = orderByNeed[2 * k + 1];
        pairSlotOfIndex[a] = k;
        if (b !== undefined) {
          pairSlotOfIndex[b] = k;
          // orderByNeed は昇順なので a の方が必要長が小さい (= 内側向き)
          sideOfIndex[a] = 'right';
          sideOfIndex[b] = 'left';
          innerNeedByPairIndex[k] = innerNeedOf(causeMetrics[a]);
        } else {
          sideOfIndex[a] = 'left'; // 相方のいない単独中骨は常に外側
        }
      }

      // 大骨長・pairTs (t 位置) は図全体で統一するため、ここでは各カテゴリの
      // 必要量 (innerNeedByPairIndex/verticalNeedBetweenCauses) を算出する
      // だけに留め、実際の L と pairTs の決定は全カテゴリ収集後に行う
      // (下記「図全体で統一するペア位置」参照)。

      // 片側配置 (フォールバック): すべての中骨が外側に伸びる
      const singleTRange = p.singleTMax - p.singleTMin;
      const requiredMajorByVerticalSingle = numCauses <= 1
        ? 0
        : verticalNeedBetweenCauses * (numCauses - 1) / (sinA * singleTRange);
      const requiredMajorBySpacingSingle = numCauses <= 1
        ? 0
        : p.causeSpacingAlongBone * (numCauses - 1) / singleTRange;
      const majorBySingleSide = Math.max(
        420,
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
        majorBySingleSide,
        verticalNeedBetweenCauses,
        innerNeedByPairIndex,
        sideOfIndex,
        pairSlotOfIndex,
        // 以降は最終 globalL 決定後に再計算
        majorBoneLength: 0,
        majorHorizontal: 0,
        farthestCauseY: 0,
        categoryVertical: 0,
        horizontalExtentFromSpine: 0,
        layoutMode: null,
        subHorizontalOuter,
        detailHorizontalOuter,
        beyondAttachHorizontal,
        subVertical,
        maxDetailLabelGlobal,
        maxCauseLabelW,
        hasAnySubcauses,
        hasAnyDetails,
        categoryBoxWidth,
        categoryBoxHeight,
        catLabelLines,
      };
    });

    // ---- 図全体で統一するモードと大骨長・ペア位置を決定 ----
    // 特性要因図の基本ルール: 中骨は大骨の両側に配置する。
    // データがどれだけ密でも (キャンバスが大きくなっても) この原則を優先し、
    // 片側配置へのフォールバックは行わない。
    // 中骨 1 本のカテゴリのみ、ペアを組む相手がいないため単側になる。
    // 統一 L = 全カテゴリの必要 L の最大値
    //   ⇒ 大骨先端 Y がカテゴリ間で揃い、視覚バランスが取れる
    categoryInfos.forEach(c => {
      c.layoutMode = c.numCauses >= 2 ? 'pair' : 'single';
    });

    // pairTs (各ペアの t 位置) も大骨長と同じ「同じ層は図全体で統一」の
    // 原則を適用する。カテゴリごとに個別計算すると、内容量の違いで
    // カテゴリ間の中骨配置バランスがバラついて見えるため (例: あるカテゴリは
    // 背骨近くに詰まり、別のカテゴリは中間まで間延びする)、pair k 番目の
    // 必要量は全カテゴリの最大値を取り、pairTs は 1 組だけ計算して
    // 全カテゴリで共有する。
    const pairCats = categoryInfos.filter(c => c.layoutMode === 'pair');
    const maxNumPairs = pairCats.length ? Math.max(...pairCats.map(c => c.numPairs)) : 0;
    const globalVerticalNeed = pairCats.length
      ? Math.max(...pairCats.map(c => c.verticalNeedBetweenCauses))
      : 0;
    const globalInnerNeedByPairIndex = [];
    for (let k = 0; k < maxNumPairs; k++) {
      globalInnerNeedByPairIndex[k] = Math.max(
        0, ...pairCats.map(c => c.innerNeedByPairIndex[k] || 0)
      );
    }
    // 最後のペアが pairTMax を超えず、かつカテゴリボックスまでの絶対距離
    // (px) が pairBoxClearance 以上になる最小の大骨長を二分探索する
    // (両条件とも L が大きいほど満たしやすくなるため単調)。
    const lastPairT = (L) => {
      const ts = this.computePairPackedT(maxNumPairs, L, globalVerticalNeed, globalInnerNeedByPairIndex, sinA, cosA);
      return ts[ts.length - 1] ?? 0;
    };
    const feasibleL = (L) => {
      if (maxNumPairs === 0) return true;
      const t = lastPairT(L);
      if (t > p.pairTMax) return false;
      return (1 - t) * L >= p.pairBoxClearance;
    };
    let loL = 1;
    let hiL = 440;
    while (!feasibleL(hiL) && hiL < 1e7) {
      hiL *= 2;
    }
    for (let iter = 0; iter < 60; iter++) {
      const mid = (loL + hiL) / 2;
      if (feasibleL(mid)) {
        hiL = mid;
      } else {
        loL = mid;
      }
    }
    const globalPairRequiredL = maxNumPairs > 0 ? Math.max(440, hiL) : 0;

    const globalL = Math.max(440, globalPairRequiredL, ...categoryInfos.map(c =>
      c.layoutMode === 'single' ? c.majorBySingleSide : 0
    ));

    // 全カテゴリで共有する pairTs (1 組だけ計算)。numPairs が maxNumPairs
    // より少ないカテゴリは先頭から必要な分だけ使う (背骨に近い側から
    // 詰まっているため、少ないペア数でも背骨側の位置が揃う)。
    // 大骨長 L 自体は上の安全な (未緩和の) 必要量で決めるが、実際の
    // pairTs は innerNeedRelax で少し緩和した必要量を使って計算する。
    // こうすると各ペア間の間隔 (tStep = verticalNeed/(sinA*L)) は L が
    // 変わらないため保たれたまま、背骨最寄りのペアだけをさらに
    // 背骨側へ詰められる (L も一緒に緩めると tStep 自体が変わり、
    // ペア間隔まで崩れてしまうため分離している)。
    const globalInnerNeedByPairIndexForTs = globalInnerNeedByPairIndex.map(
      need => need * p.innerNeedRelax
    );
    const globalPairTs = maxNumPairs > 0
      ? this.computePairPackedT(maxNumPairs, globalL, globalVerticalNeed, globalInnerNeedByPairIndexForTs, sinA, cosA)
      : [];

    // 各カテゴリに統一 L を適用し、派生量を計算
    // ペア配置では右側 (内側) 中骨が pairTMax + pairStaggerT まで進むため、
    // extents はスタガー分を含めて計算する
    categoryInfos.forEach(info => {
      info.majorBoneLength = globalL;
      info.globalPairTs = globalPairTs;
      const tMaxForExtents = (info.layoutMode === 'pair')
        ? p.pairTMax + p.pairStaggerT : p.singleTMax;
      info.farthestCauseY = globalL * sinA * tMaxForExtents;
      // 縦張り出しは「最遠中骨 + 小骨」と「大骨先端 + カテゴリボックス」の大きい方
      // (大骨先端は t=1.0 なので、大型キャンバスでは中骨最遠点より遠くなる)
      // ボックスサイズはカテゴリ名の長さに応じて拡幅・拡高されるため、
      // 固定値 p.categoryBoxHeight/Width ではなくカテゴリ毎の実サイズを使う
      const boneTipVertical =
        globalL * sinA
        + info.categoryBoxHeight * 0.25 * sinA  // ボックス中心の先端側オフセット
        + info.categoryBoxHeight / 2 + 14;
      info.categoryVertical = Math.max(
        info.farthestCauseY + info.subVertical + 24,
        boneTipVertical,
      );
      info.majorHorizontal = globalL * cosA;
      // 中骨ラベル/小骨連鎖の張り出しは beyondAttachHorizontal に集約済み
      const farLeftFromSpine =
        globalL * cosA * tMaxForExtents + info.beyondAttachHorizontal;
      info.horizontalExtentFromSpine = Math.max(
        info.majorHorizontal + info.categoryBoxWidth * 0.55 + 24,
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

    // 3) カテゴリを「列 (ペア)」単位で配置する
    // 入力データの並び順は元々 4M の慣習で「機械, 人, 材料, 方法」のように
    // 上下交互 (idx%2 で isTop 判定) に並ぶため、連続する 2 件
    // (idx=2k を上、idx=2k+1 を下) は視覚的に「同じ列」として対応する
    // カテゴリだと期待できる (機械/人が左列、材料/方法が右列、など)。
    // この列単位で同じ spineX を共有させることで、上下対称かつ
    // 左右に整列した「教科書通りの 4M レイアウト」を実現する。
    const safetyGap = 60;
    const pairCount = Math.ceil(categoryInfos.length / 2);
    const columns = [];
    for (let k = 0; k < pairCount; k++) {
      const top = categoryInfos.find(c => c.idx === 2 * k && c.isTop);
      const bot = categoryInfos.find(c => c.idx === 2 * k + 1 && !c.isTop);
      columns.push([top, bot].filter(Boolean));
    }

    let cursor = null;
    columns.forEach(members => {
      const extent = Math.max(...members.map(c => c.horizontalExtentFromSpine));
      const x = cursor === null
        ? p.sideMarginX + extent
        : cursor + extent + safetyGap;
      members.forEach(c => { c.spineX = x; });
      cursor = x;
    });

    // 4) spine の最右端: 最後の列の spine X
    let lastCategoryX = cursor ?? p.sideMarginX;

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

    // 中骨配置を 2 通りで分岐
    const numCauses = info.numCauses;
    let causePlacements; // [{t, side: 'left'|'right'}]

    if (info.layoutMode === 'pair') {
      // 中骨は大骨に沿って左右交互のサイクルで展開する (再帰ルール)。
      // 同じペア (i, i+1) は同じ t (± stagger) を共有し、大骨の高さ順に
      // 並べると必ず L,R,L,R,... の交互サイクルになる。
      const numPairs = info.numPairs;
      // pairTs は図全体で共有 (背骨に近い側から詰まっているため、
      // 先頭から numPairs 個を使えばこのカテゴリでも背骨側の位置が揃う)
      const pairTs = info.globalPairTs.slice(0, numPairs);
      causePlacements = info.category.causes.map((_, i) => {
        const side = info.sideOfIndex[i];
        const k = info.pairSlotOfIndex[i];
        return {
          t: pairTs[k] + (side === 'left' ? -p.pairStaggerT : +p.pairStaggerT),
          side,
        };
      });
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
      const causeM = info.causeMetrics[i] || {};

      // 中骨方向と長さ
      // side='left'  : 外側 (-x), 長さは causeLength
      // side='right' : 内側 (+x), 長さは背骨に届かないよう制限
      let direction, causeLen;
      if (side === 'left') {
        direction = -1;
        causeLen = info.causeLength;
      } else {
        direction = 1;
        // 内側中骨の最大長: 先端の中骨ラベル・小骨/孫骨連鎖のいずれも
        // 背骨に届かない距離に制限する。
        // 小骨長は同階層で統一済み (info.subLenLong) — 実際の描画に
        // 使われる値と同じ基準で評価する (この原因自身の孫骨有無/
        // ラベル幅は個別に反映する)
        const m = causeM;
        const cosS = Math.cos((p.subcauseAngleDeg * Math.PI) / 180);
        const ownTipExtras = Math.max(
          ((m.numSub || 0) > 0 ? info.subLenLong * cosS : 0)
            + (m.hasDetails ? p.detailLength + (m.maxDetailLabel || 0) + 16 : 0),
          (m.causeLabelW || 60) + 12,
        ) + p.innerSafeMargin;
        const distToSpine = info.spineX - attachX;
        const maxInner = distToSpine - ownTipExtras;
        causeLen = Math.max(80, Math.min(info.causeLength, maxInner));
      }

      const startX = attachX + direction * causeLen; // 中骨の free end
      const startY = attachY;

      // 小骨レイアウト (side 情報と背骨 Y を伝搬)
      // 小骨長は「同じ層の親骨」の原則により図全体で統一済み (info.subLenLong)
      // causeSide を伝搬: 孫骨の左右交互展開を安全な範囲 (外側の中骨) に
      // 限定するための判定材料として使う
      const subInfos = this.computeSubcauseGeometry(
        cause,
        {
          startX, startY, attachX, attachY, causeLen,
          isTop: info.isTop,
          side,
          direction,
          spineY,
          spineX: info.spineX,
          subLen: info.subLenLong,
          causeSide: side,
          maxSubLabel: causeM.maxSubLabel || 0,
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

    // 小骨は「中骨の付け根 (大骨側 = 親の親に近い側)」の subcauseTMax から
    // 実際に必要な間隔だけ詰めて展開する (親骨の起点側から展開)。
    // 子が少ないカテゴリでは大骨側にまとまり、多い原因だけが先端側へ
    // 伸びるため、図全体で統一した中骨長 (info.causeLength) を使っても
    // 不要な空白が生まれない。stepPx は「同じ側 (上/下) の隣接小骨」が
    // 重ならない間隔 (ラベル幅+マージン) の半分 (2 ステップで 1 間隔分)。
    const labelSafeSpacing = (ctx.maxSubLabel || 0) + 24;
    const stepPx = labelSafeSpacing / 2;
    const ts = this.computeAnchoredPackedT(
      subs.length, p.subcauseTMax, stepPx, ctx.causeLen, -1, p.subcauseTMin,
    );
    const horizontalDir = ctx.direction;
    // 内側小骨が背骨にぶつからないよう、最大長を概算
    // 中骨の Y 座標 (cause line Y) と背骨 Y の距離 = |attachY - spineY|
    // 内側小骨先端の Y = attachY + sign * len * sinS が背骨を越えないこと
    const distToSpineY = Math.abs(ctx.attachY - (ctx.spineY ?? 0));
    const innerSubMaxLen =
      distToSpineY > 0
        ? Math.max(40, (distToSpineY - p.innerSafeMargin) / sinS)
        : ctx.subLen;

    // 「同じ側 (上/下)」の隣接小骨との間隔。
    // 小骨は上下交互のため、衝突リスクがあるのは同じ側の小骨同士のみ
    // (i と i+2)。隣り合う i と i+1 は反対側なので考慮不要 — ここを
    // 誤って考慮すると安全距離が半分になり反転がほぼ常に禁止されてしまう。
    // 孫骨を反転展開する際、同じ側の次の小骨の陣地まで届かないよう
    // この値の一部を安全な反転距離の上限として使う。
    const sameSideStepX = subs.length > 2
      ? Math.abs(ts[2] - ts[0]) * Math.abs(ctx.attachX - ctx.startX)
      : Infinity; // 同じ側の隣が存在しない (2本以下) → 制約なし
    const maxSafeFlipReach = sameSideStepX * 0.46;

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

    // 孫骨は「小骨の付け根 (中骨側 = 親の親に近い側)」の detailTMin から
    // 実際に必要な間隔だけ詰めて展開する (親骨の起点側から展開)。
    // 詳細が少ない小骨は付け根付近にまとまり、多い小骨だけが先端側へ
    // 伸びるため、図全体で統一した小骨長 (info.subLenLong) でも
    // 不要な空白が生まれない。孫骨は基本的に同一方向へ並ぶ (allowAlternate
    // が有効な場合のみ隣が反転) ため、隣接間隔はラベル幅そのものを使う
    // (小骨側の「同じ側 (2本毎)」の緩和は適用しない)。
    const detailLabelMs = sub.details.map(d =>
      this.wrappedLabelMetrics(
        typeof d === 'string' ? d : d.name, p.fontPx.detail, p.labelWrapWidth.detail));
    const maxDetailLabelHere = detailLabelMs.length
      ? Math.max(...detailLabelMs.map(m => m.width))
      : 0;
    const stepPx = maxDetailLabelHere + p.detailLabelGap * 2 + 14;
    const ts = this.computeAnchoredPackedT(
      sub.details.length, p.detailTMin, stepPx, ctx.subLen, +1, p.detailTMax,
    );
    const parentDir = ctx.horizontalDir;
    const hasBoneRef = ctx.boneStartX !== undefined && ctx.boneEndX !== undefined;

    return sub.details.map((detailRaw, i) => {
      const detail = typeof detailRaw === 'string'
        ? { name: detailRaw, important: false }
        : detailRaw;
      const t = ts[i];
      const attachX = ctx.attachX + (ctx.endX - ctx.attachX) * t;
      const attachY = ctx.attachY + (ctx.endY - ctx.attachY) * t;

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
            p.innerSafeMargin
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
   * ペア配置の各ペアの t 位置を、大骨の背骨側 (pairTAnchor) から
   * 実際に必要な間隔分だけ詰めて計算する (親骨の起点側から展開)。
   * L (大骨長) が大きいほど同じ物理間隔に必要な t は縮む。
   */
  computePairPackedT(numPairs, L, verticalNeed, innerNeedByPairIndex, sinA, cosA) {
    const p = this.params;
    if (numPairs <= 0) return [];
    const tStep = numPairs > 1 ? verticalNeed / (sinA * L) : 0;
    const ts = [];
    for (let k = 0; k < numPairs; k++) {
      const need = innerNeedByPairIndex[k] || 0;
      const minT = need > 0 ? Math.max(0, need / (cosA * L) - p.pairStaggerT) : 0;
      const base = k === 0 ? p.pairTAnchor : ts[k - 1] + tStep;
      ts.push(Math.max(base, minT));
    }
    return ts;
  }

  /**
   * 汎用: 親骨上で子骨を「親の親に近い側 (anchorT)」から実際に必要な
   * 物理間隔 (stepPx) の分だけ順に詰めて配置する。子が少なければ
   * anchorT 付近にまとまり、子が多いほど dirSign 方向へ伸びる —
   * 均等配置 (computeEvenT) のように常に全域へ間延びさせない。
   * tBound を渡した場合、自然な (詰めた) 配置が tBound を超えるときは
   * 全体を均等スケールし、最後の点がちょうど tBound に収まるようにする
   * (単純な per-step クランプだと複数点が同じ tBound 値に重なって
   *  ラベルが完全一致・重複してしまうため、必ず不等間隔を保つ)。
   * 十分な余地がない極端なケースでは、結果的に旧来の均等配置と同じになる。
   */
  computeAnchoredPackedT(n, anchorT, stepPx, parentLenPx, dirSign, tBound) {
    if (n <= 0) return [];
    if (n === 1) return [anchorT];
    const tStep = parentLenPx > 0 ? stepPx / parentLenPx : 0;
    const ts = [anchorT];
    for (let k = 1; k < n; k++) {
      ts.push(ts[k - 1] + dirSign * tStep);
    }
    if (tBound === undefined) return ts;
    const last = ts[n - 1];
    const overshoot = dirSign < 0 ? (tBound - last) : (last - tBound);
    if (overshoot <= 0) return ts;
    const span = last - anchorT; // 同じ符号 (dirSign) を持つ
    const scale = span !== 0 ? (tBound - anchorT) / span : 0;
    return ts.map(t => anchorT + (t - anchorT) * scale);
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
