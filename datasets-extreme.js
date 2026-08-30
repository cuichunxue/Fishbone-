/**
 * 極限パターン検証データセット
 *
 * datasets-complex.js が「上限に迫る実務規模」であるのに対し、本ファイルは
 * パーサの入力上限そのもの（カテゴリ 10 / 原因 6 / 小骨 4 / 孫骨 3）を
 * 飽和させた**理論上の最大規模**と、上限を超えた入力の扱いを検証する。
 *
 * 完全飽和は 10×6×4×3 = 720 孫骨 + 240 小骨 + 60 中骨 ≒ 1,030 ノードに
 * なり手書きは非現実的なため、ラベルは現実的な語彙テンプレートから
 * プログラムで生成する（内容の意味よりも、密度・ラベル長・折返しの
 * 発生具合を実データに近づけることを狙う）。
 *
 * 使い方:
 *   DATASET_FILE=datasets-extreme.js OUT_SUBDIR=extreme node verify.js
 *   DATASET_FILE=datasets-extreme.js node audit-balance.js
 */

// --- 現実的なラベル語彙 ---
const CAT_WORDS = [
  '設計', '調達', '製造', '検査', '物流', '販売', '保全', '教育', '管理', '情報',
  '品質保証', '生産技術',
];
const CAUSE_WORDS = [
  '手順の不徹底', '要員の不足', '設備の劣化', '基準の曖昧さ', '記録の欠落',
  '教育の未実施', '点検の省略', '連絡の遅延', '在庫の偏在', '判断の属人化',
];
const SUB_WORDS = [
  'チェック漏れ', '周知不足', '経年劣化', '閾値未設定', '担当者依存',
  '工数不足', '仕様変更の未反映', '記録が手書き',
];
const DETAIL_WORDS = [
  '監査なし', '更新遅延', '基準未定', '検証不足', '要員偏在', '手配漏れ',
];
const pick = (arr, i) => arr[i % arr.length];

/**
 * 指定した本数構成の ishikawa ソースを生成する。
 * @param {string} effect 特性
 * @param {number} nCat カテゴリ数
 * @param {number} nCause カテゴリあたりの原因数
 * @param {number} nSub 原因あたりの小骨数
 * @param {number} nDetail 小骨あたりの孫骨数
 * @param {object} opt { longLabels: 長文ラベルにする, allImportant: 全てに ! を付ける,
 *                       causeOf/subOf/detailOf: 本数を可変にする関数 }
 */
function build(effect, nCat, nCause, nSub, nDetail, opt = {}) {
  const L = opt.longLabels;
  const mark = opt.allImportant ? '!' : '';
  const lines = ['ishikawa', `  effect "${effect}"`];
  for (let c = 0; c < nCat; c++) {
    const catName = L
      ? `${pick(CAT_WORDS, c)}部門における管理項目`
      : pick(CAT_WORDS, c);
    lines.push(`  category "${catName}"`);
    const causeCount = opt.causeOf ? opt.causeOf(c) : nCause;
    for (let k = 0; k < causeCount; k++) {
      const causeName = L
        ? `${pick(CAUSE_WORDS, c + k)}が慢性化し是正が進まない状態`
        : `${pick(CAUSE_WORDS, c + k)}${k + 1}`;
      lines.push(`    cause "${causeName}${mark}"`);
      const subCount = opt.subOf ? opt.subOf(c, k) : nSub;
      for (let s = 0; s < subCount; s++) {
        const subName = L
          ? `${pick(SUB_WORDS, k + s)}の状態が継続している`
          : `${pick(SUB_WORDS, k + s)}${s + 1}`;
        lines.push(`      subcause "${subName}${mark}"`);
        const detailCount = opt.detailOf ? opt.detailOf(c, k, s) : nDetail;
        for (let d = 0; d < detailCount; d++) {
          const detailName = L
            ? `${pick(DETAIL_WORDS, s + d)}のため未対応`
            : `${pick(DETAIL_WORDS, s + d)}${d + 1}`;
          lines.push(`        detail "${detailName}${mark}"`);
        }
      }
    }
  }
  return lines.join('\n');
}

const DATASETS = {
  // 完全飽和: 仕様上の最大 (10 cat × 6 × 4 × 3)。約 1,030 ノード
  'X01-完全飽和10x6x4x3': build(
    '全社の品質不具合が多発（最大規模）', 10, 6, 4, 3),

  // 完全飽和 + 長文ラベル (折返しが全階層で発生する最悪条件)
  'X02-飽和かつ長文8x6x4x3': build(
    '複数事業部にまたがる重大品質問題の再発防止が進捗しない', 8, 6, 4, 3,
    { longLabels: true }),

  // 完全飽和 + 全要素が重要要因 (赤楕円が全ラベルに付く)
  'X03-飽和かつ全重要6x6x4x3': build(
    '重点管理項目の全面的な未達', 6, 6, 4, 3, { allImportant: true }),

  // 深さ最大 + カテゴリ最大 (孫骨まで全て埋める。列数最大 5)
  'X04-最大深度10x4x4x3': build(
    '基幹プロセス全体の能力不足', 10, 4, 4, 3),

  // 上限超過入力: 原因 8 / 小骨 6 / 孫骨 5 を与え、
  // パーサが 6 / 4 / 3 へ切り詰めても破綻しないことを確認する
  'X05-上限超過入力': build(
    '入力上限を超えたデータの扱い', 6, 8, 6, 5),

  // 極端な非対称 + 飽和: 上側だけ完全飽和、下側は原因 1 本
  'X06-非対称飽和': build(
    '上側に要因が集中した最大規模の図', 8, 6, 4, 3, {
      // idx が偶数 = 上側 (isTop)。上は飽和、下は最小
      causeOf: c => (c % 2 === 0 ? 6 : 1),
      subOf: c => (c % 2 === 0 ? 4 : 0),
      detailOf: c => (c % 2 === 0 ? 3 : 0),
    }),

  // 幅方向の極限: 12 カテゴリ (推奨 6・最大 10 を超える) × 飽和
  'X07-12カテゴリ飽和': build(
    'グループ全社の横断的な課題（12 部門）', 12, 4, 3, 2),

  // 混在: 飽和カテゴリと空カテゴリが交互 (密度差の極端なパターン)
  'X08-飽和と空の混在': build(
    '部門ごとの分析深度が大きく異なるケース', 8, 6, 4, 3, {
      causeOf: c => (c % 2 === 0 ? 6 : 1),
      subOf: (c, k) => (c % 2 === 0 ? 4 : 0),
      detailOf: (c, k, s) => (c % 2 === 0 ? (k % 2 === 0 ? 3 : 0) : 0),
    }),
};

module.exports = DATASETS;
