# 石川ダイアグラム（特性要因図）自動生成Webアプリ

Mermaidデータから正確で美しい特性要因図（Fishbone Diagram / Ishikawa Diagram）を自動生成するWebアプリケーションです。

## 特徴

- ✅ **正確な描画**: 教科書レベルの正統派石川ダイアグラム
- ✅ **Mermaid対応**: Mermaid形式のデータから自動生成
- ✅ **編集可能**: ラベルのドラッグ&ドロップ、矢印の調整が可能
- ✅ **4M対応**: 機械・人・材料・方法の4大骨を正確に配置
- ✅ **階層構造**: 大骨→中骨→小骨→孫骨の厳密な階層管理

## 使い方

1. `index.html` をブラウザで開く
2. Mermaidデータを入力エリアに貼り付け
3. 「生成」ボタンをクリック
4. 生成された図をドラッグ&ドロップで編集可能

## Mermaidデータ形式

```mermaid
ishikawa
  effect "不良率が高い"

  category "機械"
    cause "設備老朽化"
      subcause "メンテナンス不足"
        detail "点検頻度低い"
      subcause "部品摩耗"
    cause "温度管理"
    cause "振動異常"

  category "人"
    cause "技能不足"
    cause "疲労"
    cause "コミュニケーション不足"

  category "材料"
    cause "品質バラツキ"
    cause "保管環境"
    cause "検査不備"

  category "方法"
    cause "作業手順"
    cause "標準化不足"
    cause "チェック体制"
```

## ファイル構成

- `index.html` - メインページ
- `style.css` - スタイルシート
- `mermaid-parser.js` - Mermaidパーサー
- `ishikawa-diagram.js` - ダイアグラム生成・編集エンジン

## 技術仕様

- SVGベースの描画（正確な座標制御）
- バニラJavaScript（依存ライブラリなし）
- レスポンシブデザイン

## ライセンス

MIT License
