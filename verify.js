#!/usr/bin/env node
/**
 * Visual verification script for the Ishikawa diagram.
 * Loads index.html, generates diagram with various dataset sizes,
 * and screenshots the result for inspection.
 *
 * Also runs in-page assertions to detect overlaps and overflows.
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const ROOT = __dirname;
const OUT_DIR = path.join(ROOT, 'screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// Test datasets covering many shapes
const DATASETS = {
  '01-default': null, // use the textarea default

  '02-1M-minimal': `ishikawa
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
        detail "ライセンス問題"
      subcause "学習コスト"
  category "人"
    cause "リーダー経験不足"
    cause "コミュニケーション不足"
      subcause "ミーティング少ない"
      subcause "ドキュメント不足"
        detail "Wiki 未整備"
      subcause "リモート問題"
      subcause "言語の壁"
  category "材料"
    cause "外部API遅延"
  category "方法"
    cause "見積もり甘い"
    cause "テスト不足"
      subcause "ユニットテスト不足"
      subcause "結合テスト未実施"
    cause "アジャイル運用不徹底"`,

  '08-long-names': `ishikawa
  effect "新規顧客の獲得率が伸び悩んでいる"
  category "機械"
    cause "CRM システムが古い"
      subcause "リードトラッキング機能が貧弱"
        detail "履歴管理が不十分"
    cause "MA ツールの設定不備"
  category "人"
    cause "営業スキルのバラツキ"
      subcause "新人教育プログラム未整備"
    cause "マーケティング部との連携不足"
  category "材料"
    cause "ターゲットリストの質が低い"
      subcause "業界カバレッジ不足"
  category "方法"
    cause "提案資料の説得力不足"
      subcause "事例ストーリーが弱い"
        detail "ROI 試算が抽象的"
    cause "ナーチャリングシナリオ未設計"`,

  '09-single-cause': `ishikawa
  effect "とにかく一個"
  category "原因"
    cause "唯一の原因"`,
};

async function runChecks(page) {
  // Run in-page overlap/overflow detection
  return await page.evaluate(() => {
    const svg = document.querySelector('#diagramContainer svg');
    if (!svg) return { error: 'no svg' };

    const viewBox = svg.viewBox.baseVal;
    const issues = [];

    // Layout mode summary (diagram is exposed as global in index.html via top-level script)
    let layoutSummary = null;
    try {
      // eslint-disable-next-line no-undef
      const d = (typeof diagram !== 'undefined') ? diagram : null;
      if (d && d.layout) {
        layoutSummary = d.layout.categoryInfos.map(c => ({
          name: c.category.name,
          mode: c.layoutMode,
          numCauses: c.numCauses,
          L: Math.round(c.majorBoneLength),
        }));
      }
    } catch (_) { /* ignore */ }

    // Collect all text elements and their bounding boxes (in viewBox coords)
    const texts = Array.from(svg.querySelectorAll('text'));
    const lines = Array.from(svg.querySelectorAll('line'));

    // Get bbox for each text in SVG coords
    const textBoxes = texts.map(t => {
      const bb = t.getBBox();
      // Apply any transform on parent group
      let dx = 0, dy = 0;
      let parent = t.parentElement;
      while (parent && parent !== svg) {
        const tr = parent.getAttribute && parent.getAttribute('transform');
        if (tr) {
          const m = tr.match(/translate\(([-\d.]+),?\s*([-\d.]+)?\)/);
          if (m) { dx += parseFloat(m[1] || 0); dy += parseFloat(m[2] || 0); }
        }
        parent = parent.parentElement;
      }
      return {
        text: t.textContent.slice(0, 24),
        x: bb.x + dx,
        y: bb.y + dy,
        w: bb.width,
        h: bb.height,
      };
    }).filter(b => b.w > 0 && b.h > 0);

    // Overflow: text outside viewBox
    const overflows = textBoxes.filter(b =>
      b.x < viewBox.x - 2 ||
      b.y < viewBox.y - 2 ||
      b.x + b.w > viewBox.x + viewBox.width + 2 ||
      b.y + b.h > viewBox.y + viewBox.height + 2
    );
    overflows.forEach(o => issues.push({
      kind: 'overflow',
      text: o.text,
      bbox: [o.x|0, o.y|0, o.w|0, o.h|0],
    }));

    // Overlap: any two text boxes that overlap
    let overlapCount = 0;
    const overlapExamples = [];
    for (let i = 0; i < textBoxes.length; i++) {
      for (let j = i + 1; j < textBoxes.length; j++) {
        const a = textBoxes[i], b = textBoxes[j];
        const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (overlapX > 2 && overlapY > 2) {
          overlapCount++;
          if (overlapExamples.length < 6) {
            overlapExamples.push({ a: a.text, b: b.text, ox: overlapX|0, oy: overlapY|0 });
          }
        }
      }
    }
    if (overlapCount > 0) {
      issues.push({ kind: 'text-overlap', count: overlapCount, examples: overlapExamples });
    }

    // Line overlap with spine: check whether non-spine lines cross y=spineY too closely
    // (looking for "small bones touching spine")
    const spineLine = lines.find(l =>
      Math.abs(parseFloat(l.getAttribute('y1')) - parseFloat(l.getAttribute('y2'))) < 0.5
      && parseFloat(l.getAttribute('stroke-width')) >= 3
    );
    if (spineLine) {
      const spineY = parseFloat(spineLine.getAttribute('y1'));
      const spineX1 = parseFloat(spineLine.getAttribute('x1'));
      const spineX2 = parseFloat(spineLine.getAttribute('x2'));
      // For each other line, check whether it crosses spineY within spine's X range
      // (excluding lines that ARE the spine or major bones meeting at spine)
      let crossCount = 0;
      lines.forEach(l => {
        if (l === spineLine) return;
        const x1 = parseFloat(l.getAttribute('x1'));
        const y1 = parseFloat(l.getAttribute('y1'));
        const x2 = parseFloat(l.getAttribute('x2'));
        const y2 = parseFloat(l.getAttribute('y2'));
        // Major bones end on spine — skip them
        const touchesSpine = (Math.abs(y1 - spineY) < 1 && x1 > spineX1 - 1 && x1 < spineX2 + 1) ||
                             (Math.abs(y2 - spineY) < 1 && x2 > spineX1 - 1 && x2 < spineX2 + 1);
        if (touchesSpine) return;
        // Check if the line crosses spineY
        if ((y1 < spineY && y2 > spineY) || (y1 > spineY && y2 < spineY)) {
          // Solve for X at spineY
          const t = (spineY - y1) / (y2 - y1);
          const xc = x1 + t * (x2 - x1);
          if (xc > spineX1 - 1 && xc < spineX2 + 1) {
            crossCount++;
          }
        }
      });
      if (crossCount > 0) {
        issues.push({ kind: 'spine-cross', count: crossCount });
      }
    }

    return {
      viewBox: [viewBox.x, viewBox.y, viewBox.width, viewBox.height],
      textCount: texts.length,
      lineCount: lines.length,
      issues,
      layoutSummary,
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

    // Resize SVG render area for screenshot consistency: capture only the svg
    const svg = await page.$('#diagramContainer svg');
    const file = path.join(OUT_DIR, `${name}.png`);
    if (svg) {
      await svg.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, fullPage: true });
    }

    const check = await runChecks(page);
    summary.push({ name, file, check });
    const issueSummary = (check.issues || [])
      .map(i => i.kind + (i.count ? `:${i.count}` : ''))
      .join(', ') || 'clean';
    const modes = (check.layoutSummary || [])
      .map(c => `${c.name}:${c.mode === 'pair' ? 'P' : 'S'}(${c.numCauses})`)
      .join(' ');
    console.log(`${name.padEnd(20)} | vb=${check.viewBox.map(v=>v|0).join(',')} | ${modes} | ${issueSummary}`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
})();
