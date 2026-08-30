/**
 * テーマ別検証データセット
 *
 * verify.js の 62 パターンが「構造ストレス」(最大分岐・極端な非対称・
 * 1 文字ラベル等) を中心にした固定回帰テストであるのに対し、本ファイルは
 * 実務で実際に書かれる特性要因図に近い「テーマ」を集めたもの。
 * 業種・階層の深さ・原因数・ラベル長・言語をばらつかせ、現実的な入力で
 * レイアウトが安定してバランスするかを検証する。
 *
 * 使い方:
 *   DATASET_FILE=datasets-themes.js OUT_SUBDIR=themes node verify.js
 *   DATASET_FILE=datasets-themes.js node audit-balance.js
 */
const DATASETS = {
  // --- 製造・品質 (4M の教科書的な形) ---
  'T01-製造歩留まり': `ishikawa
  effect "基板実装の歩留まり低下"
  category "機械"
    cause "マウンタ精度低下"
      subcause "ノズル摩耗"
        detail "交換周期超過"
      subcause "キャリブレーション未実施"
    cause "リフロー炉の温度ムラ"
      subcause "熱電対の劣化"
  category "人"
    cause "段取り替えのばらつき"
      subcause "手順書に依存しない作業"
    cause "熟練者への依存!"
  category "材料"
    cause "はんだペースト劣化"
      subcause "冷蔵管理の逸脱"
        detail "受入時の温度未記録"
      subcause "使用期限切れ"
    cause "基板の反り"
  category "方法"
    cause "検査基準が曖昧"
      subcause "目視判定の個人差"
    cause "初物確認の省略"`,

  // --- 医療 (深い階層、専門用語) ---
  'T02-病院待ち時間': `ishikawa
  effect "外来待ち時間の長期化"
  category "患者フロー"
    cause "予約枠の設計不備"
      subcause "診療時間の見積もり甘い"
        detail "初診と再診を同枠"
      subcause "当日枠が過大"
    cause "受付から診察までの動線が長い"
  category "スタッフ"
    cause "医師の診察時間ばらつき"
      subcause "電子カルテ入力に時間"
    cause "看護師の人員配置不均衡!"
      subcause "曜日変動を考慮せず"
  category "システム"
    cause "電子カルテの応答遅延"
      subcause "サーバ老朽化"
        detail "更新計画が未策定"
    cause "検査結果連携の待ち"
  category "検査部門"
    cause "採血の混雑集中"
      subcause "朝一に予約が集中"
    cause "画像診断の枠不足"`,

  // --- IT / SaaS (英数字・カタカナ混在) ---
  'T03-SaaS解約率': `ishikawa
  effect "SaaS の月次解約率が上昇"
  category "プロダクト"
    cause "オンボーディングが不親切"
      subcause "初期設定が複雑"
        detail "SSO 設定で離脱"
      subcause "チュートリアル不足"
    cause "主要機能のバグ多発"
      subcause "リグレッションテスト不足"
  category "サポート"
    cause "一次回答が遅い"
      subcause "問い合わせ導線が分散"
    cause "FAQ が古い"
  category "価格"
    cause "競合より割高に見える"
      subcause "従量課金が読めない"
    cause "年間契約の割引が弱い"
  category "営業"
    cause "期待値のミスマッチ!"
      subcause "デモが理想環境のみ"
        detail "実データ量で性能劣化"`,

  // --- 建設 / 安全 (短めラベル、原因数多め) ---
  'T04-建設労災': `ishikawa
  effect "作業所での墜落・転落災害"
  category "人"
    cause "安全帯の不使用"
    cause "経験不足"
    cause "危険予知の形骸化"
    cause "長時間労働による疲労"
  category "設備"
    cause "足場の組立不良"
      subcause "点検記録なし"
    cause "開口部の養生不足"
    cause "照明不足"
  category "管理"
    cause "作業手順書の未整備"
      subcause "職長への周知漏れ"
    cause "新規入場者教育の形式化!"
  category "環境"
    cause "強風時の作業継続"
    cause "雨天後の足場の滑り"`,

  // --- 物流 (中程度の深さ) ---
  'T05-配送遅延': `ishikawa
  effect "当日配送の遅延率が悪化"
  category "倉庫"
    cause "ピッキング動線が非効率"
      subcause "ロケーション設計が古い"
        detail "売れ筋が奥に配置"
    cause "検品のボトルネック"
  category "配送"
    cause "ドライバー不足"
      subcause "採用が追いつかない"
    cause "積載効率の低さ"
      subcause "方面別の仕分け不足"
  category "システム"
    cause "配車計画の自動化不足"
      subcause "手作業での調整に依存"
    cause "在庫データの遅延反映"
  category "外部要因"
    cause "道路渋滞の慢性化"
    cause "再配達の増加!"`,

  // --- 教育 (原因数少なめ、浅い) ---
  'T06-学習定着率': `ishikawa
  effect "オンライン研修の学習定着率が低い"
  category "教材"
    cause "動画が長すぎる"
    cause "演習問題が不足"
  category "受講者"
    cause "業務との両立が困難"
      subcause "受講時間の確保不足"
    cause "受講目的が不明確"
  category "運営"
    cause "フォローアップ不在"
    cause "理解度測定が形式的"
  category "環境"
    cause "通信環境が不安定"`,

  // --- 飲食 (2 カテゴリのみ、浅い = 極小に近い) ---
  'T07-カフェ客数減': `ishikawa
  effect "平日午後の客数が減少"
  category "商品"
    cause "季節メニューの訴求不足"
      subcause "SNS 発信が不定期"
    cause "価格改定による離脱"
  category "店舗"
    cause "席の回転率が低い"
      subcause "長時間滞在が多い"
    cause "内装が古い"`,

  // --- 金融 / コンプライアンス (長いラベル) ---
  'T08-金融事務ミス': `ishikawa
  effect "投資信託販売における事務handling ミスの増加"
  category "業務プロセス"
    cause "本人確認書類の確認手順が複数系統に分岐している"
      subcause "商品ごとに必要書類が異なる"
    cause "二重チェック体制の形骸化!"
  category "人材"
    cause "専門知識を持つ担当者の高齢化と退職"
      subcause "後継者育成計画が未整備"
        detail "OJT のみで体系的研修なし"
    cause "繁忙期の応援要員に習熟度差"
  category "システム"
    cause "基幹システムと販売端末の入力仕様が不一致"
      subcause "改修が個別対応の積み重ね"
  category "規程"
    cause "改定内容の周知が通達のみ"
      subcause "既読確認の仕組みがない"`,

  // --- 英語のみ ---
  'T09-english-churn': `ishikawa
  effect "Enterprise customer churn increased"
  category "Product"
    cause "Missing integrations"
      subcause "No Salesforce connector"
        detail "Requested by 12 accounts"
      subcause "Limited API rate"
    cause "Performance degradation at scale"
  category "People"
    cause "High CSM turnover"
      subcause "Unclear career path"
    cause "Slow escalation handling!"
  category "Process"
    cause "QBR cadence not enforced"
      subcause "Owner not assigned"
    cause "Renewal reminders too late"
  category "Pricing"
    cause "Seat based model penalizes growth"
    cause "Discount approval takes weeks"`,

  // --- 多言語混在 (日中韓英) ---
  'T10-多言語混在': `ishikawa
  effect "グローバル拠点間の情報共有が遅延"
  category "言語"
    cause "翻訳品質のばらつき"
      subcause "機械翻訳のみで公開"
    cause "専門用語の対訳未整備"
  category "文化 / Culture"
    cause "報告のタイミング差"
      subcause "会議体の設計が本社基準"
    cause "Escalation reluctance"
  category "系统 / システム"
    cause "共有ドライブの権限分断"
      subcause "拠点ごとに別テナント"
        detail "SSO 未統合"
    cause "时区差による同期困難"
  category "프로세스"
    cause "문서 표준 미비"
    cause "承認フローが拠点依存"`,

  // --- 農業 (5 カテゴリ = 奇数、片側が多い) ---
  'T11-収量低下': `ishikawa
  effect "露地トマトの収量低下"
  category "土壌"
    cause "排水性の悪化"
      subcause "踏圧による固結"
    cause "pH の偏り"
  category "気象"
    cause "夏季の高温continuation"
      subcause "夜温が下がらない"
    cause "梅雨明けの急激な乾燥"
  category "栽培管理"
    cause "灌水量の判断が経験則!"
      subcause "土壌水分計を未導入"
    cause "整枝のタイミング遅れ"
  category "病害虫"
    cause "灰色かび病の発生"
      subcause "換気不足"
    cause "コナジラミの増加"
  category "苗"
    cause "育苗期のストレス"`,

  // --- コールセンター (原因数が偏る = 非対称テスト) ---
  'T12-応答品質': `ishikawa
  effect "コールセンターの一次解決率が低下"
  category "オペレーター"
    cause "商品知識の不足"
      subcause "新商品の研修が直前"
        detail "リリース前日に実施"
      subcause "ナレッジ検索に時間"
    cause "経験年数の偏り"
      subcause "離職率の高さ"
    cause "対応スクリプト依存"
      subcause "例外ケースに弱い"
  category "システム"
    cause "顧客情報の画面分散!"
  category "運用"
    cause "エスカレーション基準が曖昧"
  category "顧客"
    cause "問い合わせ内容の複雑化"`,

  // --- 公共サービス (6 カテゴリ = 3 列、横長テスト) ---
  'T13-窓口混雑': `ishikawa
  effect "市役所窓口の混雑と待ち時間増"
  category "来庁者"
    cause "手続きの事前準備不足"
      subcause "必要書類が分かりにくい"
    cause "月初への集中"
  category "職員"
    cause "繁忙期の人員不足"
    cause "複数手続きの兼務"
  category "手続き"
    cause "押印・添付書類が多い"
      subcause "制度上の要求"
    cause "課をまたぐ手続き"
  category "システム"
    cause "オンライン申請の利用率低迷!"
      subcause "操作が分かりにくい"
    cause "端末台数の不足"
  category "施設"
    cause "待合スペースが狭い"
    cause "案内表示が不十分"
  category "情報提供"
    cause "ホームページの情報が探しにくい"
    cause "多言語対応の遅れ"`,

  // --- エネルギー (深さ最大: 孫骨まで多用) ---
  'T14-設備停止': `ishikawa
  effect "発電設備の計画外停止"
  category "機器"
    cause "タービン軸振動の増大"
      subcause "軸受摩耗"
        detail "潤滑油の劣化"
        detail "油圧低下"
      subcause "アライメント不良"
        detail "据付後の再測定なし"
    cause "制御弁の固着"
      subcause "異物混入"
        detail "フィルタ交換遅延"
  category "保全"
    cause "予知保全の未導入!"
      subcause "振動データの蓄積不足"
        detail "測定が手動"
    cause "点検周期が一律"
  category "運転"
    cause "急激な負荷変動"
      subcause "需給調整への追従"
    cause "手順逸脱"
  category "環境"
    cause "冷却水温度の上昇"
      subcause "夏季の河川水温上昇"`,
};

module.exports = DATASETS;
