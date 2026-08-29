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
// 出力先は OUT_SUBDIR で切り替えられる (テーマ別検証で回帰用の
// スクリーンショットを上書きしないため)
const OUT_DIR = path.join(ROOT, 'screenshots',
  process.env.OUT_SUBDIR || '');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BUILTIN_DATASETS = {
  // index.html のテキストエリア初期値 (loadSample() と同一データに統一済み)
  '01-default': null,

  // 旧デフォルト値 (4原因×2-3小骨×詳細ありの最高密度ケース)。
  // 初見の印象を良くするため index.html の初期値からは外したが、
  // 密度上限の回帰チェックとして引き続き検証する。
  '01b-heaviest': `ishikawa
  effect "不良率が高い"

  category "機械"
    cause "設備老朽化"
      subcause "メンテナンス不足"
        detail "点検頻度低い"
        detail "予算不足"
      subcause "部品摩耗"
        detail "使用年数長い"
        detail "交換遅延"
      subcause "校正不十分"
        detail "精度低下"
        detail "基準ズレ"
    cause "温度管理不良"
      subcause "センサー故障"
        detail "劣化進行"
        detail "誤作動"
      subcause "空調不備"
        detail "能力不足"
      subcause "配置不良"
    cause "振動異常"
      subcause "基礎不良"
      subcause "バランス悪化"
      subcause "設置環境"
    cause "油圧低下"
      subcause "漏れ発生"
      subcause "フィルタ詰まり"

  category "人"
    cause "技能不足"
      subcause "研修不足"
        detail "OJT不足"
        detail "座学少ない"
      subcause "経験浅い"
        detail "新人多い"
        detail "ベテラン不足"
      subcause "資格未取得"
    cause "疲労蓄積"
      subcause "長時間労働"
        detail "残業過多"
        detail "休日少ない"
      subcause "休憩不足"
      subcause "夜勤連続"
    cause "コミュニケーション不足"
      subcause "情報共有不備"
      subcause "報連相欠如"
      subcause "チーム連携弱い"
    cause "モチベーション低下"
      subcause "評価不満"
      subcause "目標不明確"

  category "材料"
    cause "品質バラツキ"
      subcause "ロット管理不良"
        detail "トレース不可"
        detail "記録漏れ"
      subcause "検査基準甘い"
        detail "サンプル少ない"
      subcause "供給元変更"
    cause "保管環境不適切"
      subcause "温度管理不良"
        detail "冷蔵設備故障"
        detail "温度記録なし"
      subcause "湿度管理不良"
        detail "除湿器故障"
      subcause "保管期限超過"
    cause "入荷検査不備"
      subcause "検査項目不足"
      subcause "合格基準甘い"
      subcause "サンプリング不適切"
    cause "材料変わった"
      subcause "仕様変更"
      subcause "代替品使用"

  category "方法"
    cause "作業手順不明確"
      subcause "マニュアル古い"
        detail "更新なし"
        detail "実態不一致"
      subcause "手順書なし"
      subcause "口頭伝承のみ"
    cause "標準化不足"
      subcause "各自の方法"
        detail "統一性なし"
        detail "ベテラン依存"
      subcause "基準未設定"
      subcause "ルール不徹底"
    cause "チェック体制不十分"
      subcause "ダブルチェックなし"
      subcause "記録不備"
      subcause "責任者不在"
    cause "設定値が緩い"
      subcause "基準甘い"
      subcause "マージン過多"`,

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

  '29-very-long-labels': `ishikawa
  effect "重要顧客からの継続契約更新率が低下"
  category "営業プロセス"
    cause "更新時期の前倒しアプローチができていない"
      subcause "契約管理システムのリマインダーが未設定"
        detail "設定手順が周知されていない"
      subcause "担当者間の引き継ぎ漏れが頻発している"
    cause "顧客の利用状況データを提案に活かせていない"
      subcause "ダッシュボードの見方の教育不足"
  category "カスタマーサクセス"
    cause "オンボーディング完了後のフォロー体制が薄い"
      subcause "定期ヘルスチェックが仕組み化されていない"
        detail "チェックリストが存在しない"
    cause "解約予兆スコアリングの精度が低い"
  category "プロダクト"
    cause "競合と比較した際の機能優位性の訴求が弱い"
    cause "利用開始初期のつまずきポイントが放置されている"
      subcause "チュートリアルの完了率が低い"`,

  '30-manufacturing-5M1E': `ishikawa
  effect "溶接不良率が目標値を超過"
  category "機械"
    cause "溶接機の電流変動"
      subcause "電源系統の老朽化"
        detail "配電盤未更新"
      subcause "ケーブル接触不良"
    cause "治具の位置決め精度低下"
      subcause "クランプ摩耗"
  category "人"
    cause "溶接姿勢のバラツキ"
      subcause "有資格者の割合低下"
    cause "トーチ角度の個人差"
      subcause "教育カリキュラム未整備"
        detail "実技評価なし"
  category "材料"
    cause "母材の表面汚れ"
      subcause "防錆油の除去不足"
    cause "ワイヤーの吸湿"
      subcause "保管庫の湿度管理不良"
  category "方法"
    cause "溶接条件表が実態と乖離"
      subcause "改訂プロセスが形骸化"
    cause "仮付け位置が不統一"
  category "測定"
    cause "外観検査の見逃し"
      subcause "照度不足"
        detail "作業台の照明配置"
    cause "検査員による判定差"
  category "環境"
    cause "作業場の風による シールドガス乱れ"
      subcause "搬入口の開閉頻度が高い"
    cause "冬季の低温による結露"`,

  '31-it-incident': `ishikawa
  effect "月次バッチ処理が朝までに完了しない"
  category "アプリ"
    cause "SQL の実行計画が不安定"
      subcause "統計情報の更新タイミング"
        detail "自動更新が無効"
      subcause "インデックス設計が古い"
    cause "リトライ処理の指数バックオフ未実装"
  category "インフラ"
    cause "ストレージ IOPS の頭打ち"
      subcause "他システムとの共有帯域"
    cause "夜間の VM リソース縮退"
      subcause "コスト最適化ポリシーの副作用"
  category "データ"
    cause "処理対象レコードの急増"
      subcause "退会データの論理削除が滞留"
        detail "パージ運用なし"
    cause "外部連携ファイルの到着遅延"
  category "運用"
    cause "ジョブ依存関係が手動管理"
      subcause "ジョブネット定義の属人化"
    cause "失敗時の再実行判断が深夜に人手"`,

  '32-restaurant': `ishikawa
  effect "ランチタイムの回転率が低い"
  category "人"
    cause "ホール人員不足"
      subcause "ピーク時間帯のシフト薄い"
    cause "新人の注文操作が遅い"
  category "設備"
    cause "レジが 1 台のみ"
    cause "席のレイアウトが非効率"
      subcause "4人席に1人客"
  category "方法"
    cause "配膳動線が交差する"
      subcause "厨房出口が一つ"
    cause "会計と案内が同一人物"
  category "メニュー"
    cause "調理時間の長い品が人気"
      subcause "揚げ物の同時調理数に上限"
    cause "日替わりの説明に時間がかかる"`,

  '33-extreme-asymmetry': `ishikawa
  effect "非対称ストレス"
  category "重量級"
    cause "原因A"
      subcause "副A1"
        detail "詳A1x"
        detail "詳A1y"
      subcause "副A2"
        detail "詳A2x"
      subcause "副A3"
      subcause "副A4"
    cause "原因B"
      subcause "副B1"
      subcause "副B2"
      subcause "副B3"
    cause "原因C"
      subcause "副C1"
    cause "原因D"
    cause "原因E"
    cause "原因F"
  category "軽量1"
    cause "ぽつん"
  category "軽量2"
    cause "これだけ"
  category "軽量3"
    cause "単独"`,

  '34-uniform-2x2': `ishikawa
  effect "均一 2x2 プロファイル"
  category "第一"
    cause "原因あ"
      subcause "副あ一"
      subcause "副あ二"
    cause "原因い"
      subcause "副い一"
      subcause "副い二"
  category "第二"
    cause "原因う"
      subcause "副う一"
      subcause "副う二"
    cause "原因え"
      subcause "副え一"
      subcause "副え二"
  category "第三"
    cause "原因お"
      subcause "副お一"
      subcause "副お二"
    cause "原因か"
      subcause "副か一"
      subcause "副か二"
  category "第四"
    cause "原因き"
      subcause "副き一"
      subcause "副き二"
    cause "原因く"
      subcause "副く一"
      subcause "副く二"`,

  '36-importance-marks': `ishikawa
  effect "不良率が高い"
  category "機械"
    cause "設備老朽化!"
      subcause "メンテナンス不足!"
        detail "点検頻度低い!"
        detail "予算不足"
      subcause "部品摩耗"
    cause "温度管理不良"
      subcause "センサー故障"
  category "人"
    cause "技能不足!"
      subcause "研修不足"
    cause "疲労蓄積"
  category "材料"
    cause "品質バラツキ"
      subcause "ロット管理不良!"
    cause "保管環境不適切"
  category "方法"
    cause "標準化不足"
      subcause "各自の方法"
    cause "チェック体制不十分!"`,

  '35-mixed-lengths': `ishikawa
  effect "長短混在"
  category "混在A"
    cause "短い"
      subcause "これはかなり長い小骨のラベルで折返しが必要"
      subcause "短"
    cause "こちらは非常に長い中骨ラベルのテスト用テキスト"
      subcause "短い副"
        detail "この孫骨ラベルも折返しが必要なほど長い"
  category "混在B"
    cause "中くらいの長さ"
      subcause "普通"
    cause "又短い"
      subcause "ここも長めの小骨ラベルにしておく"
        detail "短"`,

  // ==== 実務テーマ多様性検証セット (37-46) ====
  // グローバル統一ルール (同じ層の親骨は最大の子骨数で長さを揃える) が
  // 「一部の重い要因が全体を間延びさせないか」を様々な業種で確認する。

  '37-healthcare': `ishikawa
  effect "院内感染発生率上昇"
  category "人"
    cause "手指衛生遵守率低下"
      subcause "多忙による省略"
      subcause "手順の周知不足"
    cause "新人教育不足"
  category "設備"
    cause "個室隔離不足"
      subcause "病床数不足"
    cause "換気設備老朽化"
  category "手順"
    cause "標準予防策の形骸化"
      subcause "チェックリスト未使用"
        detail "監査頻度低い"
    cause "面会者管理不備"
  category "環境"
    cause "清掃頻度不足"
    cause "共有物品の消毒漏れ"
      subcause "消毒液補充遅延"`,

  '38-retail-varlabel': `ishikawa
  effect "客単価低下"
  category "接客"
    cause "声かけ"
    cause "提案"
    cause "レジ待ち時間が長時間化しクレームに繋がっている問題"
  category "商品"
    cause "品揃え"
    cause "陳列"
  category "価格"
    cause "割引多い"
    cause "競合安い"
  category "販促"
    cause "POP少"
    cause "SNS未活用"`,

  '39-logistics': `ishikawa
  effect "配送遅延件数増加"
  category "車両"
    cause "老朽化による故障"
      subcause "定期点検未実施"
    cause "台数不足"
  category "ドライバー"
    cause "人手不足"
      subcause "採用難"
      subcause "離職率高い"
    cause "経路不慣れ"
  category "システム"
    cause "配車最適化未導入"
      subcause "手作業での割当"
        detail "属人化している"
    cause "リアルタイム追跡なし"
  category "荷物"
    cause "積載効率低い"
    cause "再配達多発"
      subcause "不在連絡見落とし"`,

  '40-finance': `ishikawa
  effect "決済エラー率上昇"
  category "システム"
    cause "API タイムアウト"
      subcause "外部連携先の遅延"
    cause "旧システムとの二重管理"
  category "運用"
    cause "リリース手順の属人化"
    cause "監視アラート閾値不適切"
  category "データ"
    cause "顧客情報の不整合"
      subcause "重複登録"
        detail "名寄せ未実施"
    cause "口座情報の更新遅延"
  category "外部要因"
    cause "決済代行会社の障害"`,

  '41-education': `ishikawa
  effect "退学率上昇"
  category "学生"
    cause "経済的困窮"
    cause "学習意欲低下"
      subcause "目標不明確"
  category "教員"
    cause "個別対応の時間不足"
    cause "相談窓口の認知度低い"
  category "カリキュラム"
    cause "難易度のギャップ"
      subcause "基礎科目とのつながり弱い"
    cause "実務との関連性薄い"
  category "環境"
    cause "通学負担大きい"
    cause "友人関係の孤立"
      subcause "サークル参加率低い"`,

  '42-agriculture': `ishikawa
  effect "収穫量が計画を下回る"
  category "気象"
    cause "日照不足"
    cause "台風被害"
  category "土壌"
    cause "連作障害"
      subcause "土壌診断未実施"
    cause "排水不良"
  category "栽培管理"
    cause "施肥タイミングのズレ"
      subcause "経験則に依存"
        detail "記録が残っていない"
    cause "病害虫の発見遅れ"
      subcause "見回り頻度不足"
  category "労働力"
    cause "高齢化による作業遅延"
    cause "収穫期の人手不足"`,

  '43-hospitality': `ishikawa
  effect "宿泊客満足度スコア低下"
  category "フロント"
    cause "チェックイン待ち時間"
      subcause "繁忙期の人員不足"
    cause "多言語対応不足"
  category "客室"
    cause "清掃品質のバラツキ"
      subcause "チェック体制形骸化"
    cause "設備の経年劣化"
  category "レストラン"
    cause "混雑時の提供遅延"
    cause "メニューの魅力不足"
      subcause "季節性反映されず"
  category "予約"
    cause "OTA と自社サイトの在庫不整合"
      subcause "手動更新に依存"
        detail "更新頻度が1日1回のみ"`,

  '44-devops-recurrence': `ishikawa
  effect "本番障害が再発している"
  category "原因分析"
    cause "根本原因の特定が浅い"
      subcause "5 why が徹底されない"
    cause "類似障害の横展開なし"
  category "再発防止"
    cause "対策がドキュメント止まり"
      subcause "自動テスト化されない"
        detail "工数確保できない"
    cause "オーナー不在の対策"
  category "組織"
    cause "ポストモーテム文化未成熟"
      subcause "責任追及になりがち"
    cause "ナレッジ共有の場がない"`,

  // 極端なラベル分散: 1 つだけ非常に長いラベルを持つ原因を混ぜ、
  // グローバル統一ルールで「短いラベルの原因まで間延びしないか」を検証
  '45-outlier-label': `ishikawa
  effect "極端ラベル分散テスト"
  category "A"
    cause "短"
    cause "中くらいの長さの原因名がここに入ります"
    cause "極めて長い原因名でありこれは意図的に全体の中骨長を試すために作られた長文ラベルです"
  category "B"
    cause "短2"
    cause "短3"
  category "C"
    cause "短4"
    cause "短5"
  category "D"
    cause "短6"
    cause "短7"`,

  // 極端な子骨数分散: 1 つだけ小骨が非常に多い原因を混ぜ、
  // グローバル統一ルールで「小骨0本の原因まで中骨が伸びすぎないか」を検証
  '46-outlier-subcount': `ishikawa
  effect "極端子骨数分散テスト"
  category "A"
    cause "裸1"
    cause "裸2"
    cause "多数小骨"
      subcause "s1"
      subcause "s2"
      subcause "s3"
      subcause "s4"
  category "B"
    cause "裸3"
    cause "裸4"
  category "C"
    cause "裸5"
    cause "裸6"
  category "D"
    cause "裸7"
    cause "裸8"`,

  // ==== 複雑パターン追加検証セット (47-56) ====

  // 10 カテゴリ (5 列)、原因数 1〜4 が混在する大規模構成
  '47-10category-mega': `ishikawa
  effect "大規模複合要因"
  category "第一"
    cause "A1"
    cause "A2"
  category "第二"
    cause "B1"
      subcause "b1a"
      subcause "b1b"
    cause "B2"
    cause "B3"
  category "第三"
    cause "C1"
  category "第四"
    cause "D1"
      subcause "d1a"
    cause "D2"
      subcause "d2a"
      subcause "d2b"
      subcause "d2c"
    cause "D3"
    cause "D4"
  category "第五"
    cause "E1"
    cause "E2"
  category "第六"
    cause "F1"
      subcause "f1a"
        detail "詳細1"
    cause "F2"
  category "第七"
    cause "G1"
  category "第八"
    cause "H1"
    cause "H2"
    cause "H3"
  category "第九"
    cause "I1"
      subcause "i1a"
    cause "I2"
  category "第十"
    cause "J1"
    cause "J2"`,

  // 8 カテゴリ、全カテゴリが同一の最大深度構造 (性能/描画の限界テスト)
  '48-full-depth-8cat': `ishikawa
  effect "全カテゴリ最大深度テスト"
  category "カテゴリ1"
    cause "原因1-1"
      subcause "小骨1-1-1"
        detail "孫骨1"
        detail "孫骨2"
      subcause "小骨1-1-2"
        detail "孫骨3"
    cause "原因1-2"
      subcause "小骨1-2-1"
        detail "孫骨4"
  category "カテゴリ2"
    cause "原因2-1"
      subcause "小骨2-1-1"
        detail "孫骨5"
        detail "孫骨6"
      subcause "小骨2-1-2"
        detail "孫骨7"
    cause "原因2-2"
      subcause "小骨2-2-1"
        detail "孫骨8"
  category "カテゴリ3"
    cause "原因3-1"
      subcause "小骨3-1-1"
        detail "孫骨9"
    cause "原因3-2"
      subcause "小骨3-2-1"
        detail "孫骨10"
        detail "孫骨11"
  category "カテゴリ4"
    cause "原因4-1"
      subcause "小骨4-1-1"
        detail "孫骨12"
    cause "原因4-2"
      subcause "小骨4-2-1"
        detail "孫骨13"
  category "カテゴリ5"
    cause "原因5-1"
      subcause "小骨5-1-1"
        detail "孫骨14"
    cause "原因5-2"
      subcause "小骨5-2-1"
        detail "孫骨15"
  category "カテゴリ6"
    cause "原因6-1"
      subcause "小骨6-1-1"
        detail "孫骨16"
    cause "原因6-2"
      subcause "小骨6-2-1"
        detail "孫骨17"
  category "カテゴリ7"
    cause "原因7-1"
      subcause "小骨7-1-1"
        detail "孫骨18"
    cause "原因7-2"
      subcause "小骨7-2-1"
        detail "孫骨19"
  category "カテゴリ8"
    cause "原因8-1"
      subcause "小骨8-1-1"
        detail "孫骨20"
    cause "原因8-2"
      subcause "小骨8-2-1"
        detail "孫骨21"`,

  // 2 種類の外れ値 (長ラベル + 多小骨数) が別々の原因で同時発生
  '49-double-outlier': `ishikawa
  effect "複合外れ値テスト"
  category "A"
    cause "普通1"
    cause "極めて長いラベルを持つ原因でありこれは意図的にテストのために作成された文章です"
  category "B"
    cause "普通2"
    cause "多小骨原因"
      subcause "b1"
      subcause "b2"
      subcause "b3"
      subcause "b4"
      subcause "b5"
  category "C"
    cause "普通3"
    cause "普通4"
  category "D"
    cause "普通5"
    cause "普通6"`,

  // 小骨数の境界値 (1,2,3,4,5,6) を網羅し ceil(N/2) の段階が正しいか検証
  '50-boundary-subcounts': `ishikawa
  effect "小骨数境界値テスト"
  category "A"
    cause "小骨0本"
    cause "小骨1本"
      subcause "s1"
  category "B"
    cause "小骨2本"
      subcause "s1"
      subcause "s2"
    cause "小骨3本"
      subcause "s1"
      subcause "s2"
      subcause "s3"
  category "C"
    cause "小骨4本"
      subcause "s1"
      subcause "s2"
      subcause "s3"
      subcause "s4"
    cause "小骨5本"
      subcause "s1"
      subcause "s2"
      subcause "s3"
      subcause "s4"
      subcause "s5"
  category "D"
    cause "小骨6本"
      subcause "s1"
      subcause "s2"
      subcause "s3"
      subcause "s4"
      subcause "s5"
      subcause "s6"
    cause "対"`,

  // 全カテゴリが原因 1 本のみ (すべて single モード強制)
  '51-all-single-cause': `ishikawa
  effect "全単一原因テスト"
  category "カテゴリA"
    cause "唯一の原因A"
      subcause "副A1"
      subcause "副A2"
  category "カテゴリB"
    cause "唯一の原因B"
  category "カテゴリC"
    cause "唯一の原因C"
      subcause "副C1"
  category "カテゴリD"
    cause "唯一の原因D"
  category "カテゴリE"
    cause "唯一の原因E"
  category "カテゴリF"
    cause "唯一の原因F"
      subcause "副F1"
      subcause "副F2"
      subcause "副F3"`,

  // 日英数混在ラベル
  '52-bilingual-mixed': `ishikawa
  effect "API応答時間がSLA基準300msを超過"
  category "Backend"
    cause "DB接続プールexhausted"
      subcause "max_connections=50が不足"
        detail "ピーク時2000req/sec到達"
    cause "N+1クエリ問題"
  category "Frontend"
    cause "バンドルサイズ肥大化 (3.2MB)"
      subcause "未使用ライブラリ残存"
    cause "画像最適化不足"
  category "Infra"
    cause "オートスケール閾値CPU80%が高すぎ"
    cause "リージョン間レイテンシ150ms"
  category "運用"
    cause "アラート発報がP99でなくAvgベース"
      subcause "Datadog設定ミス"`,

  // 重要マーク(!) と外れ値ラベルの組み合わせ
  '53-importance-plus-outlier': `ishikawa
  effect "重要度と外れ値の複合テスト"
  category "A"
    cause "通常原因!"
    cause "これは非常に長いラベルを持つ重要原因であり両方の効果を同時にテストします!"
  category "B"
    cause "普通原因"
      subcause "重要な小骨!"
    cause "別の原因"
  category "C"
    cause "短!"
    cause "短2"
  category "D"
    cause "短3"
    cause "短4!"`,

  // カテゴリ名の極端な長さ差 (1文字 vs 長文)
  '54-narrow-vs-wide-catname': `ishikawa
  effect "カテゴリ名長さ差テスト"
  category "A"
    cause "原因1"
    cause "原因2"
  category "非常に長いカテゴリ名称でこれはテスト用です"
    cause "原因3"
    cause "原因4"
  category "B"
    cause "原因5"
    cause "原因6"
  category "普通の長さのカテゴリ"
    cause "原因7"
    cause "原因8"`,

  // 1つの中骨配下で孫骨数が 0/1/2/3 とバラつく
  '55-detail-count-variance': `ishikawa
  effect "孫骨数バラツキテスト"
  category "A"
    cause "原因1"
      subcause "小骨なし詳細"
      subcause "小骨1詳細"
        detail "d1"
      subcause "小骨2詳細"
        detail "d1"
        detail "d2"
      subcause "小骨3詳細"
        detail "d1"
        detail "d2"
        detail "d3"
  category "B"
    cause "原因2"
    cause "原因3"
  category "C"
    cause "原因4"
    cause "原因5"
  category "D"
    cause "原因6"
    cause "原因7"`,

  // 12 カテゴリの超横長構成
  '56-12category-ultrawide': `ishikawa
  effect "超横長テスト"
  category "C01"
    cause "a"
    cause "b"
  category "C02"
    cause "a"
    cause "b"
  category "C03"
    cause "a"
    cause "b"
  category "C04"
    cause "a"
    cause "b"
  category "C05"
    cause "a"
    cause "b"
  category "C06"
    cause "a"
    cause "b"
  category "C07"
    cause "a"
    cause "b"
  category "C08"
    cause "a"
    cause "b"
  category "C09"
    cause "a"
    cause "b"
  category "C10"
    cause "a"
    cause "b"
  category "C11"
    cause "a"
    cause "b"
  category "C12"
    cause "a"
    cause "b"`,

  // ==== 「各骨が均等に多分岐」検証セット (57-61) ====
  // これまでの外れ値検証 (1箇所だけ多い) と異なり、全ての骨が
  // 一様に上限近くまで枝を持つケースを検証する。

  // 全カテゴリが中骨上限 (6本) を持つが小骨はなし — 中骨レベルの
  // 幅広い櫛形パターンが同じ層内で均等に揃うか検証
  '57-many-causes-uniform': `ishikawa
  effect "中骨6本均等パターン"
  category "機械"
    cause "原因1"
    cause "原因2"
    cause "原因3"
    cause "原因4"
    cause "原因5"
    cause "原因6"
  category "人"
    cause "原因7"
    cause "原因8"
    cause "原因9"
    cause "原因10"
    cause "原因11"
    cause "原因12"
  category "材料"
    cause "原因13"
    cause "原因14"
    cause "原因15"
    cause "原因16"
    cause "原因17"
    cause "原因18"
  category "方法"
    cause "原因19"
    cause "原因20"
    cause "原因21"
    cause "原因22"
    cause "原因23"
    cause "原因24"`,

  // 全ての原因が小骨上限 (4本) を均等に持つ — 中骨レベルの縦方向
  // 展開が全カテゴリ・全原因で均一に密集した場合の余白計算を検証
  '58-many-subcauses-uniform': `ishikawa
  effect "小骨4本均等パターン"
  category "機械"
    cause "設備トラブル"
      subcause "経年劣化"
      subcause "保守不足"
      subcause "誤操作"
      subcause "部品不良"
    cause "温度異常"
      subcause "センサー故障"
      subcause "空調不良"
      subcause "断熱不足"
      subcause "配置ミス"
    cause "振動問題"
      subcause "基礎不良"
      subcause "バランス崩れ"
      subcause "固定不足"
      subcause "共振発生"
  category "人"
    cause "技能不足"
      subcause "教育不足"
      subcause "経験不足"
      subcause "資格未取得"
      subcause "指導者不足"
    cause "疲労"
      subcause "長時間労働"
      subcause "休憩不足"
      subcause "夜勤連続"
      subcause "睡眠不足"
    cause "連携不足"
      subcause "情報共有不備"
      subcause "報連相欠如"
      subcause "会議不足"
      subcause "文書化不足"
  category "材料"
    cause "品質バラツキ"
      subcause "ロット差"
      subcause "検査甘い"
      subcause "供給元変更"
      subcause "規格外混入"
    cause "保管不良"
      subcause "温度管理不良"
      subcause "湿度管理不良"
      subcause "期限超過"
      subcause "汚染混入"
    cause "検査不備"
      subcause "項目不足"
      subcause "基準甘い"
      subcause "サンプル不足"
      subcause "記録漏れ"
  category "方法"
    cause "手順不明確"
      subcause "マニュアル古い"
      subcause "手順書なし"
      subcause "口頭伝承"
      subcause "更新されない"
    cause "標準化不足"
      subcause "各自流儀"
      subcause "基準未設定"
      subcause "ルール不徹底"
      subcause "教育されない"
    cause "チェック不足"
      subcause "ダブルチェックなし"
      subcause "記録不備"
      subcause "責任者不在"
      subcause "頻度不足"`,

  // 全ての小骨が孫骨上限 (3本) を均等に持つ — 最下層まで一様に
  // 密集した場合の孫骨ラベル間隔・キャンバスサイズを検証
  '59-many-details-uniform': `ishikawa
  effect "孫骨3本均等パターン"
  category "機械"
    cause "設備老朽化"
      subcause "メンテナンス不足"
        detail "点検頻度低い"
        detail "予算不足"
        detail "計画未策定"
      subcause "部品摩耗"
        detail "使用年数長い"
        detail "交換遅延"
        detail "予備品不足"
  category "人"
    cause "技能不足"
      subcause "研修不足"
        detail "OJT不足"
        detail "座学少ない"
        detail "評価されない"
      subcause "経験浅い"
        detail "新人多い"
        detail "ベテラン不足"
        detail "配属期間短い"
  category "材料"
    cause "品質バラツキ"
      subcause "ロット管理不良"
        detail "トレース不可"
        detail "記録漏れ"
        detail "識別票なし"
      subcause "検査基準甘い"
        detail "サンプル少ない"
        detail "基準古い"
        detail "教育不足"
  category "方法"
    cause "作業手順不明確"
      subcause "マニュアル古い"
        detail "更新なし"
        detail "実態不一致"
        detail "改訂履歴なし"
      subcause "手順書なし"
        detail "口頭伝承のみ"
        detail "属人化"
        detail "標準化未着手"`,

  // 絶対最大密度: 全カテゴリが中骨6本、全中骨が小骨4本、
  // 全小骨が孫骨3本 (パーサー上限フル稼働、全て均一)
  '60-full-max-branching': `ishikawa
  effect "絶対最大密度均一パターン"
  category "機械"
    cause "原因A"
      subcause "小骨A1"
        detail "孫A1a"
        detail "孫A1b"
        detail "孫A1c"
      subcause "小骨A2"
        detail "孫A2a"
        detail "孫A2b"
        detail "孫A2c"
      subcause "小骨A3"
        detail "孫A3a"
        detail "孫A3b"
        detail "孫A3c"
      subcause "小骨A4"
        detail "孫A4a"
        detail "孫A4b"
        detail "孫A4c"
    cause "原因B"
      subcause "小骨B1"
        detail "孫B1a"
        detail "孫B1b"
        detail "孫B1c"
      subcause "小骨B2"
        detail "孫B2a"
        detail "孫B2b"
        detail "孫B2c"
      subcause "小骨B3"
        detail "孫B3a"
        detail "孫B3b"
        detail "孫B3c"
      subcause "小骨B4"
        detail "孫B4a"
        detail "孫B4b"
        detail "孫B4c"
    cause "原因C"
      subcause "小骨C1"
        detail "孫C1a"
        detail "孫C1b"
        detail "孫C1c"
      subcause "小骨C2"
        detail "孫C2a"
        detail "孫C2b"
        detail "孫C2c"
      subcause "小骨C3"
        detail "孫C3a"
        detail "孫C3b"
        detail "孫C3c"
      subcause "小骨C4"
        detail "孫C4a"
        detail "孫C4b"
        detail "孫C4c"
    cause "原因D"
      subcause "小骨D1"
        detail "孫D1a"
        detail "孫D1b"
        detail "孫D1c"
      subcause "小骨D2"
        detail "孫D2a"
        detail "孫D2b"
        detail "孫D2c"
      subcause "小骨D3"
        detail "孫D3a"
        detail "孫D3b"
        detail "孫D3c"
      subcause "小骨D4"
        detail "孫D4a"
        detail "孫D4b"
        detail "孫D4c"
    cause "原因E"
      subcause "小骨E1"
        detail "孫E1a"
        detail "孫E1b"
        detail "孫E1c"
      subcause "小骨E2"
        detail "孫E2a"
        detail "孫E2b"
        detail "孫E2c"
      subcause "小骨E3"
        detail "孫E3a"
        detail "孫E3b"
        detail "孫E3c"
      subcause "小骨E4"
        detail "孫E4a"
        detail "孫E4b"
        detail "孫E4c"
    cause "原因F"
      subcause "小骨F1"
        detail "孫F1a"
        detail "孫F1b"
        detail "孫F1c"
      subcause "小骨F2"
        detail "孫F2a"
        detail "孫F2b"
        detail "孫F2c"
      subcause "小骨F3"
        detail "孫F3a"
        detail "孫F3b"
        detail "孫F3c"
      subcause "小骨F4"
        detail "孫F4a"
        detail "孫F4b"
        detail "孫F4c"
  category "人"
    cause "原因G"
      subcause "小骨G1"
        detail "孫G1a"
        detail "孫G1b"
        detail "孫G1c"
      subcause "小骨G2"
        detail "孫G2a"
        detail "孫G2b"
        detail "孫G2c"
      subcause "小骨G3"
        detail "孫G3a"
        detail "孫G3b"
        detail "孫G3c"
      subcause "小骨G4"
        detail "孫G4a"
        detail "孫G4b"
        detail "孫G4c"
    cause "原因H"
      subcause "小骨H1"
        detail "孫H1a"
        detail "孫H1b"
        detail "孫H1c"
      subcause "小骨H2"
        detail "孫H2a"
        detail "孫H2b"
        detail "孫H2c"
      subcause "小骨H3"
        detail "孫H3a"
        detail "孫H3b"
        detail "孫H3c"
      subcause "小骨H4"
        detail "孫H4a"
        detail "孫H4b"
        detail "孫H4c"
    cause "原因I"
      subcause "小骨I1"
        detail "孫I1a"
        detail "孫I1b"
        detail "孫I1c"
      subcause "小骨I2"
        detail "孫I2a"
        detail "孫I2b"
        detail "孫I2c"
      subcause "小骨I3"
        detail "孫I3a"
        detail "孫I3b"
        detail "孫I3c"
      subcause "小骨I4"
        detail "孫I4a"
        detail "孫I4b"
        detail "孫I4c"
    cause "原因J"
      subcause "小骨J1"
        detail "孫J1a"
        detail "孫J1b"
        detail "孫J1c"
      subcause "小骨J2"
        detail "孫J2a"
        detail "孫J2b"
        detail "孫J2c"
      subcause "小骨J3"
        detail "孫J3a"
        detail "孫J3b"
        detail "孫J3c"
      subcause "小骨J4"
        detail "孫J4a"
        detail "孫J4b"
        detail "孫J4c"
    cause "原因K"
      subcause "小骨K1"
        detail "孫K1a"
        detail "孫K1b"
        detail "孫K1c"
      subcause "小骨K2"
        detail "孫K2a"
        detail "孫K2b"
        detail "孫K2c"
      subcause "小骨K3"
        detail "孫K3a"
        detail "孫K3b"
        detail "孫K3c"
      subcause "小骨K4"
        detail "孫K4a"
        detail "孫K4b"
        detail "孫K4c"
    cause "原因L"
      subcause "小骨L1"
        detail "孫L1a"
        detail "孫L1b"
        detail "孫L1c"
      subcause "小骨L2"
        detail "孫L2a"
        detail "孫L2b"
        detail "孫L2c"
      subcause "小骨L3"
        detail "孫L3a"
        detail "孫L3b"
        detail "孫L3c"
      subcause "小骨L4"
        detail "孫L4a"
        detail "孫L4b"
        detail "孫L4c"`,

  // 6 カテゴリ x 各 5〜6 中骨、中程度の小骨深さ — 大規模かつ
  // 高分岐を組み合わせた実務規模の最大構成
  '61-wide-6category-heavy': `ishikawa
  effect "大規模高分岐パターン"
  category "機械"
    cause "設備A"
      subcause "s1"
      subcause "s2"
    cause "設備B"
      subcause "s1"
      subcause "s2"
    cause "設備C"
    cause "設備D"
    cause "設備E"
    cause "設備F"
  category "人"
    cause "要員A"
      subcause "s1"
      subcause "s2"
    cause "要員B"
    cause "要員C"
    cause "要員D"
    cause "要員E"
  category "材料"
    cause "資材A"
      subcause "s1"
      subcause "s2"
    cause "資材B"
      subcause "s1"
      subcause "s2"
    cause "資材C"
    cause "資材D"
    cause "資材E"
    cause "資材F"
  category "方法"
    cause "手法A"
      subcause "s1"
      subcause "s2"
    cause "手法B"
    cause "手法C"
    cause "手法D"
    cause "手法E"
  category "測定"
    cause "計測A"
      subcause "s1"
      subcause "s2"
    cause "計測B"
      subcause "s1"
      subcause "s2"
    cause "計測C"
    cause "計測D"
    cause "計測E"
    cause "計測F"
  category "環境"
    cause "環境A"
      subcause "s1"
      subcause "s2"
    cause "環境B"
    cause "環境C"
    cause "環境D"
    cause "環境E"`,
};

// DATASET_FILE を指定すると、そのファイルのデータセットで検証する
// (テーマ別検証など。未指定なら組み込みの回帰用 62 パターン)
const DATASETS = process.env.DATASET_FILE
  ? require(path.join(ROOT, process.env.DATASET_FILE))
  : BUILTIN_DATASETS;

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
