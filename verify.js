#!/usr/bin/env node
/**
 * 包括的バランス検証スクリプト
 *
 * 9パターンに加え、以下のバランス指標を計測:
 *  - 縦中心線(背骨)からの上下対称性
 *  - カテゴリ間の水平等間隔性
 *  - 大骨先端のY座標バラツキ (同じ側内)
 *  - アスペクト比
 *  - 中央のホワイトスペース (背骨周辺の使用効率)
 *  - 重なり/はみ出し検出 (text + line + arrow)
 *
 * 出力: screenshots/ に個別 PNG と、summary.html (グリッド表示) を生成
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const DATASETS = {
  '01-default': null,

  '02-1M-bare': `ishikawa
  effect "売上が下がっている"
  category "営業"
    cause "提案力不足"
    cause "顧客フォロー不足"`,

  '03-2M-small': `ishikawa
  effect "クレームが多い"
  category "製品"
    cause "品質バラツキ"
      subcause "工程不安定"
    cause "梱包不良"
  category "サービス"
    cause "対応遅い"
      subcause "人手不足"
    cause "説明不足"`,

  '04-3M-typical': `ishikawa
  effect "納期遅延"
  category "機械"
    cause "故障多発"
      subcause "経年劣化"
      subcause "保守不足"
    cause "段取り時間長い"
    cause "稼働率低い"
  category "人"
    cause "経験不足"
      subcause "教育不足"
    cause "離職率高い"
  category "方法"
    cause "工程設計不良"
      subcause "ボトルネック放置"
        detail "見える化なし"
    cause "進捗管理不徹底"`,

  '05-4M-full': `ishikawa
  effect "不良率が高い"
  category "機械"
    cause "設備老朽化"
      subcause "メンテナンス不足"
        detail "点検頻度低い"
        detail "予算不足"
      subcause "部品摩耗"
        detail "使用年数長い"
      subcause "校正不十分"
    cause "温度管理不良"
      subcause "センサー故障"
      subcause "空調不備"
    cause "振動異常"
      subcause "基礎不良"
    cause "油圧低下"
  category "人"
    cause "技能不足"
      subcause "研修不足"
        detail "OJT不足"
      subcause "経験浅い"
    cause "疲労蓄積"
      subcause "長時間労働"
      subcause "休憩不足"
    cause "コミュニケーション不足"
      subcause "情報共有不備"
    cause "モチベーション低下"
  category "材料"
    cause "品質バラツキ"
      subcause "ロット管理不良"
        detail "トレース不可"
      subcause "検査基準甘い"
      subcause "供給元変更"
    cause "保管環境不適切"
      subcause "温度管理不良"
        detail "冷蔵設備故障"
      subcause "湿度管理不良"
    cause "入荷検査不備"
    cause "材料変わった"
  category "方法"
    cause "作業手順不明確"
      subcause "マニュアル古い"
        detail "更新なし"
      subcause "手順書なし"
    cause "標準化不足"
      subcause "各自の方法"
        detail "統一性なし"
      subcause "基準未設定"
    cause "チェック体制不十分"
      subcause "ダブルチェックなし"
    cause "設定値が緩い"`,

  '06-6M-stress': `ishikawa
  effect "顧客満足度低下"
  category "機械"
    cause "故障"
      subcause "経年"
      subcause "保守不足"
    cause "性能不足"
  category "人"
    cause "教育不足"
    cause "離職"
      subcause "労働環境"
  category "材料"
    cause "品質低下"
      subcause "ロット差"
    cause "供給不安"
  category "方法"
    cause "標準化不足"
    cause "手順不徹底"
  category "測定"
    cause "計測誤差"
      subcause "校正不足"
    cause "サンプル不足"
  category "環境"
    cause "温度"
    cause "湿度"
      subcause "季節変動"`,

  '07-uneven': `ishikawa
  effect "プロジェクトが遅れる"
  category "機械"
    cause "ツール選定ミス"
      subcause "互換性なし"
        detail "バージョン不一致"
      subcause "学習コスト"
  category "人"
    cause "リーダー経験不足"
    cause "コミュニケーション不足"
      subcause "ミーティング少ない"
      subcause "ドキュメント不足"
      subcause "リモート問題"
  category "材料"
    cause "外部API遅延"
  category "方法"
    cause "見積もり甘い"
    cause "テスト不足"
      subcause "ユニットテスト不足"
    cause "アジャイル運用不徹底"`,

  '08-long-names': `ishikawa
  effect "新規顧客の獲得率が伸び悩んでいる"
  category "機械"
    cause "CRM システムが古い"
      subcause "リードトラッキング不足"
    cause "MA ツールの設定不備"
  category "人"
    cause "営業スキルのバラツキ"
      subcause "新人教育プログラム未整備"
    cause "マーケ部との連携不足"
  category "材料"
    cause "ターゲットリストの質が低い"
  category "方法"
    cause "提案資料の説得力不足"
      subcause "事例ストーリーが弱い"
    cause "ナーチャリング未設計"`,

  '09-single': `ishikawa
  effect "とにかく一個"
  category "原因"
    cause "唯一の原因"`,

  '10-3M-rich': `ishikawa
  effect "売上目標未達"
  category "市場"
    cause "需要減退"
      subcause "景気悪化"
      subcause "代替品台頭"
    cause "競合増加"
      subcause "新規参入"
        detail "海外勢"
      subcause "価格競争"
        detail "値下げ圧力"
    cause "顧客離反"
      subcause "満足度低下"
        detail "サポート不足"
  category "営業"
    cause "提案力不足"
      subcause "ヒアリング浅い"
      subcause "差別化不明確"
    cause "新規開拓不足"
      subcause "リスト枯渇"
    cause "クロージング弱い"
  category "商品"
    cause "魅力不足"
      subcause "機能差別化なし"
      subcause "ブランド力弱い"
    cause "ラインナップ不足"
    cause "価格設定不適"
      subcause "値ごろ感なし"`,

  '11-uniform-3sub': `ishikawa
  effect "対称性テスト"
  category "A"
    cause "原因A1"
      subcause "A1a"
      subcause "A1b"
      subcause "A1c"
    cause "原因A2"
      subcause "A2a"
      subcause "A2b"
      subcause "A2c"
  category "B"
    cause "原因B1"
      subcause "B1a"
      subcause "B1b"
      subcause "B1c"
    cause "原因B2"
      subcause "B2a"
      subcause "B2b"
      subcause "B2c"
  category "C"
    cause "原因C1"
      subcause "C1a"
      subcause "C1b"
      subcause "C1c"
    cause "原因C2"
      subcause "C2a"
      subcause "C2b"
      subcause "C2c"
  category "D"
    cause "原因D1"
      subcause "D1a"
      subcause "D1b"
      subcause "D1c"
    cause "原因D2"
      subcause "D2a"
      subcause "D2b"
      subcause "D2c"`,

  '12-just-causes': `ishikawa
  effect "シンプル4M"
  category "機械"
    cause "故障"
    cause "性能"
    cause "メンテ"
  category "人"
    cause "スキル"
    cause "モラル"
    cause "教育"
  category "材料"
    cause "品質"
    cause "在庫"
    cause "コスト"
  category "方法"
    cause "標準"
    cause "手順"
    cause "管理"`,

  '13-deep-details': `ishikawa
  effect "障害発生率が高い"
  category "アプリ"
    cause "コードの複雑性"
      subcause "技術的負債"
        detail "リファクタ不足"
        detail "ドキュメント陳腐化"
        detail "テスト網羅率低い"
      subcause "ライブラリ古い"
        detail "脆弱性"
        detail "互換性問題"
    cause "リリース頻度高い"
      subcause "ホットフィックス"
        detail "本番直接修正"
        detail "ロールバック不可"
  category "インフラ"
    cause "監視不足"
      subcause "アラート設計"
        detail "誤検知多発"
        detail "重要度未設定"
      subcause "ダッシュボード不備"
  category "プロセス"
    cause "レビュー浅い"
      subcause "形骸化"
        detail "rubber stamp"
        detail "時間不足"`,

  '14-many-causes-light': `ishikawa
  effect "業務効率が低い"
  category "ツール"
    cause "古い"
    cause "高い"
    cause "遅い"
    cause "重い"
    cause "難しい"
    cause "連携無い"
  category "組織"
    cause "縦割り"
    cause "上意下達"
    cause "会議多い"
    cause "稟議遅い"
    cause "承認多段階"`,

  '15-mixed-density': `ishikawa
  effect "ユーザ離脱率上昇"
  category "UX"
    cause "ナビ複雑"
      subcause "階層深い"
        detail "5階層以上"
      subcause "用語難解"
      subcause "検索貧弱"
    cause "ローディング遅い"
    cause "エラー多い"
  category "コンテンツ"
    cause "鮮度低い"
    cause "重複多い"
  category "サポート"
    cause "FAQ古い"
      subcause "更新無し"
    cause "問合せ困難"
      subcause "電話のみ"
      subcause "営業時間短い"`,

  '16-ascii-mix': `ishikawa
  effect "API response time exceeds SLA"
  category "Server"
    cause "DB query slow"
      subcause "N+1 problem"
        detail "ORM lazy load"
      subcause "Missing index"
    cause "CPU bound"
  category "Network"
    cause "DNS lookup"
      subcause "TTL too short"
    cause "TLS handshake"
  category "Client"
    cause "Large payload"
    cause "Many parallel requests"`,

  '17-single-rich': `ishikawa
  effect "在庫精度が低い"
  category "倉庫オペレーション"
    cause "受入時の検数ミス"
      subcause "目視カウントのみ"
        detail "バーコード未活用"
        detail "ダブルチェック無し"
      subcause "伝票記入漏れ"
      subcause "ロット混在"
    cause "ピッキングミス"
      subcause "ロケーション表示不明確"
      subcause "教育不足"
    cause "システム入力遅延"
      subcause "オフライン作業"
        detail "夕方一括入力"`,

  '18-tight-labels': `ishikawa
  effect "歩留低下"
  category "M"
    cause "A"
      subcause "a1"
      subcause "a2"
      subcause "a3"
      subcause "a4"
    cause "B"
      subcause "b1"
      subcause "b2"
  category "P"
    cause "C"
      subcause "c1"
        detail "x"
        detail "y"
        detail "z"
    cause "D"
  category "M2"
    cause "E"
  category "M3"
    cause "F"
      subcause "f1"
      subcause "f2"`,

  '19-no-subs': `ishikawa
  effect "コスト超過"
  category "材料費"
    cause "単価上昇"
    cause "ロス増加"
    cause "為替変動"
  category "労務費"
    cause "残業増加"
    cause "派遣増加"
  category "経費"
    cause "光熱費高騰"
    cause "設備保守費"
  category "減価償却"
    cause "新規投資"`,

  '20-symmetric-stress': `ishikawa
  effect "完全対称テスト"
  category "A"
    cause "A1"
      subcause "A1a"
        detail "A1aX"
      subcause "A1b"
    cause "A2"
      subcause "A2a"
      subcause "A2b"
        detail "A2bX"
  category "B"
    cause "B1"
      subcause "B1a"
        detail "B1aX"
      subcause "B1b"
    cause "B2"
      subcause "B2a"
      subcause "B2b"
        detail "B2bX"
  category "C"
    cause "C1"
      subcause "C1a"
        detail "C1aX"
      subcause "C1b"
    cause "C2"
      subcause "C2a"
      subcause "C2b"
        detail "C2bX"
  category "D"
    cause "D1"
      subcause "D1a"
        detail "D1aX"
      subcause "D1b"
    cause "D2"
      subcause "D2a"
      subcause "D2b"
        detail "D2bX"`,

  '21-5M-odd': `ishikawa
  effect "設備総合効率低下"
  category "機械"
    cause "チョコ停多発"
      subcause "センサー誤検知"
    cause "サイクルタイム悪化"
  category "人"
    cause "段取り時間長い"
      subcause "手順未標準化"
    cause "熟練者不足"
  category "材料"
    cause "材料待ち"
    cause "不良材混入"
  category "方法"
    cause "計画精度低い"
      subcause "需要予測外れ"
    cause "ロット設計不適"
  category "測定"
    cause "データ収集手動"
      subcause "記入漏れ"
    cause "リアルタイム性なし"`,

  '22-7M-wide': `ishikawa
  effect "サービス品質低下"
  category "人"
    cause "採用難"
    cause "定着率低い"
  category "設備"
    cause "老朽化"
  category "材料"
    cause "調達遅延"
  category "方法"
    cause "手順複雑"
    cause "例外多い"
  category "測定"
    cause "KPI不明確"
  category "環境"
    cause "騒音"
  category "管理"
    cause "権限不明確"
    cause "報告遅い"`,

  '23-long-effect': `ishikawa
  effect "第三四半期における主力製品の顧客クレーム件数が前年同期比で大幅に増加している"
  category "製品"
    cause "設計変更影響"
      subcause "検証不足"
    cause "部品変更"
  category "工程"
    cause "新ライン立上げ"
      subcause "作業者慣れ不足"
    cause "検査基準変更"`,

  '24-max-density': `ishikawa
  effect "最大密度テスト"
  category "機械"
    cause "原因A"
      subcause "副A1"
        detail "詳A1a"
        detail "詳A1b"
        detail "詳A1c"
      subcause "副A2"
        detail "詳A2a"
        detail "詳A2b"
        detail "詳A2c"
      subcause "副A3"
        detail "詳A3a"
        detail "詳A3b"
      subcause "副A4"
        detail "詳A4a"
    cause "原因B"
      subcause "副B1"
        detail "詳B1a"
        detail "詳B1b"
      subcause "副B2"
      subcause "副B3"
      subcause "副B4"
    cause "原因C"
      subcause "副C1"
      subcause "副C2"
      subcause "副C3"
    cause "原因D"
      subcause "副D1"
      subcause "副D2"
    cause "原因E"
      subcause "副E1"
    cause "原因F"
  category "人"
    cause "原因G"
      subcause "副G1"
        detail "詳G1a"
      subcause "副G2"
    cause "原因H"
      subcause "副H1"
    cause "原因I"`,

  '25-empty-category': `ishikawa
  effect "空カテゴリ耐性"
  category "実データ"
    cause "原因X"
      subcause "副X1"
    cause "原因Y"
  category "空っぽ"
  category "もう一つ"
    cause "原因Z"`,

  '26-two-singles': `ishikawa
  effect "最小ペア"
  category "上側"
    cause "唯一の上原因"
  category "下側"
    cause "唯一の下原因"`,

  '27-english-long': `ishikawa
  effect "Deployment failures increasing"
  category "Infrastructure"
    cause "Kubernetes misconfiguration"
      subcause "Resource limits missing"
        detail "OOMKilled pods"
    cause "Flaky CI runners"
  category "Process"
    cause "No canary deployments"
      subcause "All-at-once rollout"
    cause "Insufficient rollback automation"
  category "People"
    cause "On-call fatigue"
    cause "Knowledge silos"`,

  '28-one-char': `ishikawa
  effect "短"
  category "甲"
    cause "a"
      subcause "b"
        detail "c"
      subcause "d"
    cause "e"
  category "乙"
    cause "f"
      subcause "g"
    cause "h"`,
};

async function runChecks(page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('#diagramContainer svg');
    if (!svg) return { error: 'no svg' };

    const viewBox = svg.viewBox.baseVal;
    const issues = [];

    // Layout summary
    let layoutSummary = null;
    let balanceMetrics = null;
    try {
      const d = (typeof diagram !== 'undefined') ? diagram : null;
      if (d && d.layout) {
        const cats = d.layout.categoryInfos;
        layoutSummary = cats.map(c => ({
          name: c.category.name,
          mode: c.layoutMode,
          numCauses: c.numCauses,
          L: Math.round(c.majorBoneLength),
          spineX: Math.round(c.spineX),
          boneEndY: Math.round(c.boneEndY),
        }));
        // Balance metrics
        const topCats = cats.filter(c => c.isTop);
        const botCats = cats.filter(c => !c.isTop);
        const halfTop = d.layout.spineY;
        const halfBot = d.layout.svgHeight - d.layout.spineY;
        const symmetry = Math.min(halfTop, halfBot) / Math.max(halfTop, halfBot);
        // category X spacing variance
        const topXs = topCats.map(c => c.spineX).sort((a,b) => a-b);
        const botXs = botCats.map(c => c.spineX).sort((a,b) => a-b);
        const stddev = arr => {
          if (arr.length < 2) return 0;
          const gaps = [];
          for (let i = 1; i < arr.length; i++) gaps.push(arr[i]-arr[i-1]);
          const m = gaps.reduce((s,v) => s+v, 0) / gaps.length;
          const v = gaps.reduce((s,g) => s + (g-m)*(g-m), 0) / gaps.length;
          return Math.sqrt(v);
        };
        // Bone end Y variance (within same side, should be equal)
        const topBoneYs = topCats.map(c => c.boneEndY);
        const botBoneYs = botCats.map(c => c.boneEndY);
        const range = arr => arr.length ? Math.max(...arr) - Math.min(...arr) : 0;
        balanceMetrics = {
          aspect: (viewBox.width / viewBox.height).toFixed(2),
          symmetry: symmetry.toFixed(3),
          topGapStddev: Math.round(stddev(topXs)),
          botGapStddev: Math.round(stddev(botXs)),
          topBoneYRange: Math.round(range(topBoneYs)),
          botBoneYRange: Math.round(range(botBoneYs)),
          halfTop: Math.round(halfTop),
          halfBot: Math.round(halfBot),
        };
      }
    } catch (_) { /* ignore */ }

    // Major bone / spine line detection: identify thick lines so we can check
    // whether labels accidentally cross them
    const allLines = Array.from(svg.querySelectorAll('line')).map(l => ({
      x1: parseFloat(l.getAttribute('x1')),
      y1: parseFloat(l.getAttribute('y1')),
      x2: parseFloat(l.getAttribute('x2')),
      y2: parseFloat(l.getAttribute('y2')),
      sw: parseFloat(l.getAttribute('stroke-width')) || 1,
    }));

    // Text bounding boxes (capture parent type so we can exclude category boxes
    // from the bone-crossing check: category labels sit inside boxes at the bone tip
    // and a thick category-box rect masks the bone underneath)
    const texts = Array.from(svg.querySelectorAll('text'));
    const textBoxes = texts.map(t => {
      const bb = t.getBBox();
      let dx = 0, dy = 0;
      let parent = t.parentElement;
      let parentType = null;
      while (parent && parent !== svg) {
        const tr = parent.getAttribute && parent.getAttribute('transform');
        if (tr) {
          const m = tr.match(/translate\(([-\d.]+),?\s*([-\d.]+)?\)/);
          if (m) { dx += parseFloat(m[1] || 0); dy += parseFloat(m[2] || 0); }
        }
        if (parent.getAttribute && parent.getAttribute('data-type')) {
          parentType = parent.getAttribute('data-type');
        }
        parent = parent.parentElement;
      }
      return {
        text: t.textContent.slice(0, 24),
        x: bb.x + dx, y: bb.y + dy, w: bb.width, h: bb.height,
        parentType,
      };
    }).filter(b => b.w > 0 && b.h > 0);

    // Overflow
    const overflows = textBoxes.filter(b =>
      b.x < viewBox.x - 2 || b.y < viewBox.y - 2 ||
      b.x + b.w > viewBox.x + viewBox.width + 2 ||
      b.y + b.h > viewBox.y + viewBox.height + 2);
    overflows.forEach(o => issues.push({
      kind: 'overflow', text: o.text, bbox: [o.x|0, o.y|0, o.w|0, o.h|0]
    }));

    // Text overlaps
    let overlapCount = 0;
    const overlapExamples = [];
    for (let i = 0; i < textBoxes.length; i++) {
      for (let j = i + 1; j < textBoxes.length; j++) {
        const a = textBoxes[i], b = textBoxes[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 2 && oy > 2) {
          overlapCount++;
          if (overlapExamples.length < 8) {
            overlapExamples.push({ a: a.text, b: b.text, ox: ox|0, oy: oy|0 });
          }
        }
      }
    }
    if (overlapCount > 0) {
      issues.push({ kind: 'text-overlap', count: overlapCount, examples: overlapExamples });
    }

    // Label vs heavy lines (spine, major bone): text bbox crosses a thick line.
    // Skip thin lines (stroke <= 1.5) since detail/sub lines naturally pass near labels.
    const heavyLines = allLines.filter(l => l.sw >= 2.5);
    const segmentCrossesBbox = (line, b) => {
      // Check if the line segment intersects rectangle (b.x, b.y, b.x+b.w, b.y+b.h)
      // Use Cohen-Sutherland-like approach: parameterize and find intersection.
      const x0 = line.x1, y0 = line.y1, x1 = line.x2, y1 = line.y2;
      const dx = x1 - x0, dy = y1 - y0;
      const r = { l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h };
      let t0 = 0, t1 = 1;
      const clip = (p, q) => {
        if (Math.abs(p) < 1e-9) return q >= 0;
        const r = q / p;
        if (p < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
        return true;
      };
      if (!clip(-dx, x0 - r.l)) return false;
      if (!clip(dx, r.r - x0)) return false;
      if (!clip(-dy, y0 - r.t)) return false;
      if (!clip(dy, r.b - y0)) return false;
      return t0 < t1;
    };
    let labelCrossLines = 0;
    const labelCrossExamples = [];
    for (const tb of textBoxes) {
      // Skip 'category' and 'effect' labels: they sit inside boxes that mask the bone.
      if (tb.parentType === 'category' || tb.parentType === 'effect') continue;
      // shrink bbox slightly so we don't trigger on the line that legitimately attaches to this label
      const bb = { x: tb.x + 1, y: tb.y + 1, w: tb.w - 2, h: tb.h - 2 };
      if (bb.w <= 0 || bb.h <= 0) continue;
      for (const l of heavyLines) {
        if (segmentCrossesBbox(l, bb)) {
          labelCrossLines++;
          if (labelCrossExamples.length < 6) {
            labelCrossExamples.push({ text: tb.text, line: [l.x1|0,l.y1|0,l.x2|0,l.y2|0], sw: l.sw });
          }
          break;
        }
      }
    }
    if (labelCrossLines > 0) {
      issues.push({ kind: 'label-cross-heavy-line', count: labelCrossLines, examples: labelCrossExamples });
    }

    // Text crossing major lines (cause/subcause/detail labels vs spine/major bones)
    // Heuristic: text bounding box center should not lie ON a thick line within tolerance
    const lines = Array.from(svg.querySelectorAll('line')).map(l => ({
      x1: parseFloat(l.getAttribute('x1')),
      y1: parseFloat(l.getAttribute('y1')),
      x2: parseFloat(l.getAttribute('x2')),
      y2: parseFloat(l.getAttribute('y2')),
      sw: parseFloat(l.getAttribute('stroke-width')) || 1,
    }));

    return {
      viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height],
      textCount: texts.length,
      lineCount: lines.length,
      issues,
      layoutSummary,
      balanceMetrics,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGEERROR:', e.message));
  page.on('console', m => {
    if (m.type() === 'error') console.error('CONSOLE-ERR:', m.text());
  });

  const url = 'file://' + path.join(ROOT, 'index.html');

  const summary = [];
  for (const [name, data] of Object.entries(DATASETS)) {
    await page.goto(url, { waitUntil: 'load' });
    if (data !== null) {
      await page.evaluate(d => {
        document.getElementById('mermaidInput').value = d;
      }, data);
    }
    await page.evaluate(() => generateDiagram());
    await page.waitForTimeout(150);

    const svg = await page.$('#diagramContainer svg');
    const file = path.join(OUT_DIR, `${name}.png`);
    if (svg) {
      await svg.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: true });
    }

    const check = await runChecks(page);
    summary.push({ name, file, check });

    const bm = check.balanceMetrics || {};
    const issueSummary = (check.issues || [])
      .map(i => i.kind + (i.count ? `:${i.count}` : '')).join(', ') || 'clean';
    const modes = (check.layoutSummary || [])
      .map(c => `${c.name}:${c.mode === 'pair' ? 'P' : 'S'}(${c.numCauses})`).join(' ');
    console.log(
      `${name.padEnd(20)} | vb=${check.viewBox.map(v=>v|0).join('×').padEnd(11)} ` +
      `| sym=${bm.symmetry || '-'} aspc=${bm.aspect || '-'} ` +
      `topY±${bm.topBoneYRange || 0} botY±${bm.botBoneYRange || 0} ` +
      `gapσT=${bm.topGapStddev || 0} σB=${bm.botGapStddev || 0} ` +
      `| ${modes} | ${issueSummary}`
    );
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  // Generate HTML grid
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Verify grid</title>
<style>
body { font-family: system-ui; background: #f0f0f0; padding: 12px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cell { background: white; padding: 8px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.cell h3 { margin: 0 0 6px 0; font-size: 13px; }
.cell .meta { font-size: 11px; color: #666; margin-bottom: 6px; }
.cell img { max-width: 100%; display: block; border: 1px solid #ddd; }
.issues { font-size: 10px; color: #c00; }
.clean { color: #080; }
</style></head><body>
<h1>Ishikawa Diagram Verification (${summary.length} patterns)</h1>
<div class="grid">
${summary.map(s => `
<div class="cell">
  <h3>${s.name}</h3>
  <div class="meta">vb: ${(s.check.viewBox || []).map(v => v|0).join(' × ')} |
    sym: ${s.check.balanceMetrics ? s.check.balanceMetrics.symmetry : '-'} |
    aspect: ${s.check.balanceMetrics ? s.check.balanceMetrics.aspect : '-'}</div>
  <div class="${(s.check.issues || []).length === 0 ? 'clean' : 'issues'}">
    ${(s.check.issues || []).length === 0 ? '✓ clean' :
      (s.check.issues || []).map(i => i.kind + (i.count ? `:${i.count}` : '')).join(', ')}
  </div>
  <img src="${path.basename(s.file)}" alt="${s.name}">
</div>`).join('\n')}
</div>
</body></html>`;
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

  await browser.close();
})();
