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
          const causeParsed = this.parseImportance(this.extractQuotedText(trimmedLine));
          currentCause = {
            name: causeParsed.name,
            important: causeParsed.important,
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
        const subParsed = this.parseImportance(this.extractQuotedText(trimmedLine));
        currentSubcause = {
          name: subParsed.name,
          important: subParsed.important,
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
        const detailParsed = this.parseImportance(this.extractQuotedText(trimmedLine));
        currentSubcause.details.push({
          name: detailParsed.name,
          important: detailParsed.important
        });
        continue;
      }
    }

    return this.validateAndNormalize(this.data);
  }

  /**
   * 末尾の "!" を重要要因マーカーとして解釈
   * 例: cause "技能不足!" → { name: "技能不足", important: true }
   * QC の慣習「重要と思われる要因を丸で囲む」を表現するための記法。
   * @param {string} text - 抽出済みテキスト
   * @returns {{name: string, important: boolean}}
   */
  parseImportance(text) {
    const t = text || '';
    if (t.endsWith('!') || t.endsWith('！')) {
      return { name: t.slice(0, -1).trim(), important: true };
    }
    return { name: t, important: false };
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

    // 視認性のための安全上限（極端なデータでもレイアウトを保つ）。
    // 超過分は切り捨てるが、**無言では切り捨てない** — 何がいくつ
    // 落ちたかを notices に記録し、UI が利用者へ提示する。
    // 特性要因図は「要因を漏れなく洗い出す」ためのツールであり、
    // 落ちたことに気づかないまま分析を進めるのが最も危険なため。
    const MAX_CAUSES = 6;
    const MAX_SUBCAUSES = 4;
    const MAX_DETAILS = 3;
    const dropped = [];
    for (const category of orderedCategories) {
      if (category.causes.length > MAX_CAUSES) {
        dropped.push(...category.causes.slice(MAX_CAUSES)
          .map(c => `${category.name} > ${c.name}`));
        category.causes = category.causes.slice(0, MAX_CAUSES);
      }
      for (const cause of category.causes) {
        if (cause.subcauses.length > MAX_SUBCAUSES) {
          dropped.push(...cause.subcauses.slice(MAX_SUBCAUSES)
            .map(s => `${category.name} > ${cause.name} > ${s.name}`));
          cause.subcauses = cause.subcauses.slice(0, MAX_SUBCAUSES);
        }
        for (const subcause of cause.subcauses) {
          if (subcause.details.length > MAX_DETAILS) {
            dropped.push(...subcause.details.slice(MAX_DETAILS)
              .map(d => `${category.name} > ${cause.name} > ${subcause.name} > ${typeof d === 'string' ? d : d.name}`));
            subcause.details = subcause.details.slice(0, MAX_DETAILS);
          }
        }
      }
    }

    data.categories = orderedCategories;
    data.notices = this.buildNotices(orderedCategories, dropped,
      { MAX_CAUSES, MAX_SUBCAUSES, MAX_DETAILS });
    return data;
  }

  /**
   * 作図上の助言 (notices) を組み立てる。
   *
   * 特性要因図の定石として広く共有されている次の指針を、
   * 入力データから機械的にチェックできる範囲で支援する。
   *  - カテゴリ (大骨) は 4〜6 が読みやすさの目安。多すぎると
   *    枝の壁になり一目で全体像を掴めなくなる
   *  - 要因の重複は情報量だけを増やし、全体像を掴みにくくする
   *  - 要因が特定の大骨に極端に偏っていないか確認する
   *  - 上限超過分は無言で切り捨てない (何が落ちたかを示す)
   * いずれも「誤り」ではなく助言であり、描画は妨げない。
   */
  buildNotices(categories, dropped, limits) {
    const notices = [];

    if (dropped.length) {
      notices.push({
        level: 'warn',
        title: `表示上限を超えた ${dropped.length} 件の要因を省略しました`,
        detail: `1 カテゴリの原因は ${limits.MAX_CAUSES} 件、原因あたりの副原因は `
          + `${limits.MAX_SUBCAUSES} 件、副原因あたりの詳細は ${limits.MAX_DETAILS} 件までです。`
          + `要因を整理して統合するか、図を分割することを検討してください。`,
        items: dropped,
      });
    }

    const n = categories.length;
    if (n > 6) {
      notices.push({
        level: 'info',
        title: `カテゴリ (大骨) が ${n} 件あります`,
        detail: 'カテゴリは 4〜6 件が読みやすさの目安です。'
          + '多すぎると枝の壁になり、一目で全体像を掴みにくくなります。'
          + '近い意味のカテゴリの統合を検討してください。',
      });
    } else if (n > 0 && n < 3) {
      notices.push({
        level: 'info',
        title: `カテゴリ (大骨) が ${n} 件しかありません`,
        detail: 'カテゴリが少ないと要因の見落としが起きやすくなります。'
          + '製造なら 4M (機械・人・材料・方法)、サービスなら 4P など、'
          + '標準の切り口で漏れがないか確認してください。',
      });
    }

    // 要因の重複 (同一カテゴリ内 / カテゴリ間) を検出する
    const seen = new Map();
    const dupSame = [];
    const dupCross = [];
    categories.forEach(cat => {
      const inThisCat = new Set();
      cat.causes.forEach(c => {
        const key = c.name.trim();
        if (!key) return;
        if (inThisCat.has(key)) dupSame.push(`${cat.name} > ${key}`);
        inThisCat.add(key);
        if (seen.has(key) && seen.get(key) !== cat.name) {
          dupCross.push(`${key} (${seen.get(key)} / ${cat.name})`);
        } else if (!seen.has(key)) {
          seen.set(key, cat.name);
        }
      });
    });
    if (dupSame.length || dupCross.length) {
      notices.push({
        level: 'info',
        title: '重複している要因があります',
        detail: '同じ要因が複数あると情報量だけが増え、全体像を掴みにくくなります。'
          + 'どちらか一方に統合するか、より具体的な表現に書き分けてください。',
        items: [...dupSame, ...dupCross],
      });
    }

    // 要因が特定のカテゴリへ極端に偏っていないか
    if (n >= 3) {
      const counts = categories.map(c => c.causes.length);
      const total = counts.reduce((a, b) => a + b, 0);
      const max = Math.max(...counts);
      if (total >= 6 && max / total >= 0.6) {
        const heavy = categories[counts.indexOf(max)].name;
        notices.push({
          level: 'info',
          title: `要因が「${heavy}」に偏っています`,
          detail: `全 ${total} 件中 ${max} 件がこのカテゴリに集中しています。`
            + '他のカテゴリの掘り下げが不足しているか、カテゴリの切り口が'
            + '合っていない可能性があります。',
        });
      }
    }

    return notices;
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
        const causeMark = cause.important ? '!' : '';
        output += `    cause "${cause.name}${causeMark}"\n`;

        for (const subcause of cause.subcauses) {
          const subMark = subcause.important ? '!' : '';
          output += `      subcause "${subcause.name}${subMark}"\n`;

          for (const detail of subcause.details) {
            const dName = typeof detail === 'string' ? detail : detail.name;
            const dMark = (detail && detail.important) ? '!' : '';
            output += `        detail "${dName}${dMark}"\n`;
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
