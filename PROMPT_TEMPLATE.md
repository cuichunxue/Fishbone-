# 特性要因図（Ishikawa Diagram）生成プロンプト

## 基本プロンプト

```
以下の問題について、特性要因図（石川ダイアグラム/魚骨図）を作成してください。

【問題/特性】: {ここに問題を記述}

以下の形式で出力してください：

ishikawa
  effect "問題の名称"

  category "カテゴリー1"
    cause "原因1"
      subcause "副原因1-1"
        detail "詳細1-1-1"
    cause "原因2"

  category "カテゴリー2"
    cause "原因1"

【制約】
- カテゴリーは4〜6個（4M/5M/6Mを推奨）
- 各カテゴリーの原因(cause)は最大5個
- 各原因の副原因(subcause)は最大4個
- 各副原因の詳細(detail)は最大3個
- 各項目は短く簡潔に（10文字以内推奨）
```

---

## 4M分析用プロンプト（製造業向け）

```
以下の問題について、4M分析に基づく特性要因図を作成してください。

【問題】: {問題を記述}

4Mカテゴリー:
- 人(Man): 作業者、スキル、教育
- 機械(Machine): 設備、工具、治具
- 材料(Material): 原材料、部品、消耗品
- 方法(Method): 手順、基準、マニュアル

ishikawa形式で出力:

ishikawa
  effect "問題名"

  category "人"
    cause "原因"
      subcause "副原因"

  category "機械"
    cause "原因"

  category "材料"
    cause "原因"

  category "方法"
    cause "原因"
```

---

## 5M1E分析用プロンプト

```
以下の問題について、5M1E分析の特性要因図を作成してください。

【問題】: {問題を記述}

5M1Eカテゴリー:
- 人(Man)
- 機械(Machine)
- 材料(Material)
- 方法(Method)
- 測定(Measurement)
- 環境(Environment)

ishikawa形式で、各カテゴリーに2〜4個の原因を含めてください。
```

---

## サービス業向けプロンプト（4P分析）

```
以下の問題について、サービス業向け4P分析の特性要因図を作成してください。

【問題】: {問題を記述}

4Pカテゴリー:
- 方針(Policy): 規則、ルール、方針
- 手順(Procedure): プロセス、手順
- 人(People): スタッフ、顧客
- 設備(Plant): 施設、環境、ツール

ishikawa形式で出力してください。
```

---

## 出力例

```
ishikawa
  effect "製品の品質不良"

  category "人"
    cause "スキル不足"
      subcause "教育不足"
        detail "OJT未実施"
      subcause "経験不足"
    cause "注意力低下"
      subcause "疲労"
      subcause "集中力欠如"

  category "機械"
    cause "設備老朽化"
      subcause "メンテ不足"
        detail "点検漏れ"
    cause "精度低下"

  category "材料"
    cause "品質ばらつき"
      subcause "ロット差"
    cause "保管不良"
      subcause "湿度管理"

  category "方法"
    cause "手順不明確"
      subcause "標準化不足"
    cause "検査漏れ"
      subcause "チェック不足"
```

---

## 使用上の注意

1. **バランスを保つ**: 各カテゴリーの要素数は均等に近づける
2. **簡潔に**: 各項目は短い名詞または名詞句で
3. **階層を意識**: cause → subcause → detail の因果関係を明確に
4. **具体的に**: 抽象的すぎる表現を避け、具体的な原因を挙げる

---

## JSON形式での直接入力

パーサーを介さず直接データを渡す場合:

```javascript
const data = {
  effect: "問題の名称",
  categories: [
    {
      name: "カテゴリー1",
      causes: [
        {
          name: "原因1",
          subcauses: [
            {
              name: "副原因1",
              details: ["詳細1", "詳細2"]
            }
          ]
        }
      ]
    }
  ]
};

diagram.render(data);
```
