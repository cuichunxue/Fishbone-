/**
 * Mermaid形式の石川ダイアグラムデータをパースするクラス
 */
class MermaidParser {
  constructor() {
    this.data = {
      effect: "",
      categories: []
    };
  }

  /**
   * Mermaidテキストをパースしてデータ構造を返す
   * @param {string} mermaidText - Mermaid形式のテキスト
   * @returns {Object} パース済みデータ
   */
  parse(mermaidText) {
    this.data = {
      effect: "",
      categories: []
    };

    const lines = mermaidText.trim().split('\n');
    let currentCategory = null;
    let currentCause = null;
    let currentSubcause = null;
    let indentStack = [];

    for (let line of lines) {
      const trimmedLine = line.trim();

      // 空行とコメントをスキップ
      if (!trimmedLine || trimmedLine.startsWith('%%')) {
        continue;
      }

      // ishikawa宣言をスキップ
      if (trimmedLine === 'ishikawa') {
        continue;
      }

      // インデントレベルを計算
      const indent = line.search(/\S/);

      // effect（特性）を解析
      if (trimmedLine.startsWith('effect ')) {
        this.data.effect = this.extractQuotedText(trimmedLine);
        continue;
      }

      // category（大骨・カテゴリー）を解析
      if (trimmedLine.startsWith('category ')) {
        currentCategory = {
          name: this.extractQuotedText(trimmedLine),
          causes: []
        };
        this.data.categories.push(currentCategory);
        currentCause = null;
        currentSubcause = null;
        indentStack = [indent];
        continue;
      }

      // cause（中骨・原因）を解析
      if (trimmedLine.startsWith('cause ') && currentCategory) {
        // インデントが前のcauseと同じか、categoryより1段深い場合
        if (indent <= indentStack[0] + 2) {
          currentCause = {
            name: this.extractQuotedText(trimmedLine),
            subcauses: []
          };
          currentCategory.causes.push(currentCause);
          currentSubcause = null;
          if (indentStack.length === 1) {
            indentStack.push(indent);
          } else {
            indentStack[1] = indent;
          }
          continue;
        }
      }

      // subcause（小骨・副原因）を解析
      if (trimmedLine.startsWith('subcause ') && currentCause) {
        currentSubcause = {
          name: this.extractQuotedText(trimmedLine),
          details: []
        };
        currentCause.subcauses.push(currentSubcause);
        if (indentStack.length === 2) {
          indentStack.push(indent);
        } else if (indentStack.length === 3) {
          indentStack[2] = indent;
        }
        continue;
      }

      // detail（孫骨・詳細）を解析
      if (trimmedLine.startsWith('detail ') && currentSubcause) {
        const detail = this.extractQuotedText(trimmedLine);
        currentSubcause.details.push(detail);
        continue;
      }
    }

    return this.validateAndNormalize(this.data);
  }

  /**
   * 引用符で囲まれたテキストを抽出
   * @param {string} line - 行テキスト
   * @returns {string} 抽出されたテキスト
   */
  extractQuotedText(line) {
    const match = line.match(/"([^"]*)"/);
    if (match) {
      return match[1];
    }
    // 引用符がない場合、キーワード以降の文字列を返す
    const parts = line.split(/\s+/);
    return parts.slice(1).join(' ').replace(/"/g, '');
  }

  /**
   * データを検証して正規化
   * @param {Object} data - パース済みデータ
   * @returns {Object} 正規化されたデータ
   */
  validateAndNormalize(data) {
    // 4Mの順序を保証（機械、人、材料、方法）
    const order = ['機械', '人', '材料', '方法'];
    const orderedCategories = [];

    for (const categoryName of order) {
      const category = data.categories.find(c => c.name === categoryName);
      if (category) {
        orderedCategories.push(category);
      }
    }

    // 4M以外のカテゴリーも追加
    for (const category of data.categories) {
      if (!order.includes(category.name)) {
        orderedCategories.push(category);
      }
    }

    // 視認性のための安全上限（極端なデータでもレイアウトを保つ）
    const MAX_CAUSES = 6;
    const MAX_SUBCAUSES = 4;
    const MAX_DETAILS = 3;
    for (const category of orderedCategories) {
      category.causes = category.causes.slice(0, MAX_CAUSES);
      for (const cause of category.causes) {
        cause.subcauses = cause.subcauses.slice(0, MAX_SUBCAUSES);
        for (const subcause of cause.subcauses) {
          subcause.details = subcause.details.slice(0, MAX_DETAILS);
        }
      }
    }

    data.categories = orderedCategories;
    return data;
  }

  /**
   * データをMermaid形式に逆変換
   * @param {Object} data - データ構造
   * @returns {string} Mermaid形式のテキスト
   */
  toMermaid(data) {
    let output = 'ishikawa\n';
    output += `  effect "${data.effect}"\n\n`;

    for (const category of data.categories) {
      output += `  category "${category.name}"\n`;

      for (const cause of category.causes) {
        output += `    cause "${cause.name}"\n`;

        for (const subcause of cause.subcauses) {
          output += `      subcause "${subcause.name}"\n`;

          for (const detail of subcause.details) {
            output += `        detail "${detail}"\n`;
          }
        }
      }
      output += '\n';
    }

    return output;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.MermaidParser = MermaidParser;
}
