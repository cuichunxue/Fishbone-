#!/usr/bin/env node
/**
 * バランス監査ツール
 *
 * verify.js が「重なり等のハード制約違反」を検査するのに対し、本ツールは
 * 「図が視覚的にバランス良く空間を使えているか」を数値化する。
 * 実際に描画された全 SVG 要素の外接矩形を集約し、以下を測定する。
 *
 *   canvasWaste   : 1 - 内容外接矩形の面積 / キャンバス面積
 *                   (内容がキャンバスにどれだけ密着しているか)
 *   marginL/R/T/B : 内容外接矩形からキャンバス端までの余白 (px)
 *                   (4 辺の余白が偏っていないか = 図が中央にあるか)
 *   marginSkewX/Y : 左右・上下の余白の偏り 0..1 (0 = 完全に均等)
 *   aspect        : キャンバスの縦横比
 *   fillTop/Bot   : 背骨より上/下の内容が、その側のキャンバス高さを
 *                   どれだけ使っているか (0..1)。上下の偏り検出用
 *   sideBalance   : min(fillTop, fillBot) / max(...) (1 = 上下均等)
 *
 * 使い方: node audit-balance.js [パターン名フィルタ]
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;

// verify.js の DATASETS を再利用する (単一の情報源を保つ)
function loadDatasets() {
  const src = fs.readFileSync(path.join(ROOT, 'verify.js'), 'utf8');
  const start = src.indexOf('const DATASETS = {');
  if (start < 0) throw new Error('DATASETS not found in verify.js');
  // 対応する閉じ括弧まで (テンプレートリテラル内の } を誤検出しないよう
  // 行頭の "};" を終端とする)
  const endMarker = '\n};\n';
  const end = src.indexOf(endMarker, start);
  if (end < 0) throw new Error('DATASETS end not found');
  const body = src.slice(start, end + endMarker.length);
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn DATASETS;')();
}

async function measure(page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('#diagramContainer svg');
    if (!svg) return { error: 'no svg' };
    const vb = svg.viewBox.baseVal;

    // 実際に描画された全要素 (線・テキスト・矩形・楕円・多角形) の
    // 外接矩形を、SVG のユーザー座標系で集約する
    const sel = 'line, text, rect, ellipse, polygon, polyline, path, circle';
    const els = Array.from(svg.querySelectorAll(sel));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let contentArea = 0;
    const layout = (typeof diagram !== 'undefined') ? diagram.layout : null;
    const spineY = layout ? layout.spineY : vb.height / 2;
    const cats = layout ? layout.categoryInfos : [];
    const numTop = cats.filter(c => c.isTop).length;
    const numBot = cats.filter(c => !c.isTop).length;
    // 列数 (上下ペアで 1 列を共有するため) — 図の横長さは列数で決まる
    const numColumns = Math.max(numTop, numBot);
    let topMinY = Infinity, botMaxY = -Infinity;

    for (const el of els) {
      let bb;
      try { bb = el.getBBox(); } catch (_) { continue; }
      if (!bb || (bb.width === 0 && bb.height === 0)) continue;
      // 累積変換を反映 (mainGroup の transform 等)
      let dx = 0, dy = 0;
      let p = el;
      while (p && p !== svg) {
        const tr = p.getAttribute && p.getAttribute('transform');
        if (tr) {
          const m = tr.match(/translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/);
          if (m) { dx += parseFloat(m[1]); dy += parseFloat(m[2]); }
        }
        p = p.parentElement;
      }
      const x0 = bb.x + dx, y0 = bb.y + dy;
      const x1 = x0 + bb.width, y1 = y0 + bb.height;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x1 > maxX) maxX = x1;
      if (y1 > maxY) maxY = y1;
      contentArea += bb.width * bb.height;
      if (y1 < spineY) { if (y0 < topMinY) topMinY = y0; }
      if (y0 > spineY) { if (y1 > botMaxY) botMaxY = y1; }
    }
    if (!isFinite(minX)) return { error: 'no elements' };

    const cw = vb.width, ch = vb.height;
    const bw = maxX - minX, bh = maxY - minY;
    const marginL = minX, marginR = cw - maxX;
    const marginT = minY, marginB = ch - maxY;
    const skew = (a, b) => (a + b) > 0 ? Math.abs(a - b) / (a + b) : 0;

    // 上下それぞれの「内容の縦方向の広がり / その側のキャンバス高さ」
    const halfTop = spineY, halfBot = ch - spineY;
    const spreadTop = isFinite(topMinY) ? (spineY - topMinY) : 0;
    const spreadBot = isFinite(botMaxY) ? (botMaxY - spineY) : 0;
    const fillTop = halfTop > 0 ? spreadTop / halfTop : 0;
    const fillBot = halfBot > 0 ? spreadBot / halfBot : 0;

    return {
      canvas: [cw, ch],
      aspect: cw / ch,
      bbox: [minX, minY, bw, bh],
      canvasWaste: 1 - (bw * bh) / (cw * ch),
      marginL, marginR, marginT, marginB,
      marginSkewX: skew(marginL, marginR),
      marginSkewY: skew(marginT, marginB),
      fillTop, fillBot,
      numTop, numBot, numColumns,
      // 上下密度差は「両側にカテゴリがある」図でのみ意味を持つ
      // (片側のみの図は構造上 0 になるのが正しい)
      sideBalance: (numTop > 0 && numBot > 0 && Math.max(fillTop, fillBot) > 0)
        ? Math.min(fillTop, fillBot) / Math.max(fillTop, fillBot) : 1,
    };
  });
}

// 推奨基準 (DIAGRAM_RULES.md 3.7 節 / 仕様 21.2 節に対応)
//
// アスペクト比は「列数」に依存する構造量である。列が増えれば図は必ず
// 横長になるため、固定上限で評価すると多カテゴリ図が一律に不合格になり
// 指標として機能しない。そこで許容上限を列数に比例させる。
// 縦に余白を足して数値だけ 1.85 に合わせる補正は、空白率を悪化させる
// だけなので行わない (ishikawa-diagram.js の該当コメント参照)。
const CRITERIA = {
  aspectMin: 0.60,
  // 1 列あたり概ね 2.0 の横長さを許容 (2 列で 4.0、6 列で 12.0)。
  // 現行の全 62 パターンはこの範囲に収まる = 退行検出用のガードとして機能する。
  aspectMaxPerColumn: 2.0,
  aspectMaxFloor: 1.85,
  canvasWasteMax: 0.42,
  marginSkewMax: 0.35,
  sideBalanceMin: 0.55,
};

(async () => {
  const filter = process.argv[2];
  const DATASETS = loadDatasets();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.error('PAGEERROR:', e.message));

  const url = 'file://' + path.join(ROOT, 'index.html');
  const rows = [];

  for (const [name, data] of Object.entries(DATASETS)) {
    if (filter && !name.includes(filter)) continue;
    await page.goto(url, { waitUntil: 'load' });
    if (data !== null) {
      await page.evaluate(d => { document.getElementById('mermaidInput').value = d; }, data);
    }
    await page.evaluate(() => generateDiagram());
    await page.waitForTimeout(120);
    const m = await measure(page);
    if (m.error) { console.log(name.padEnd(26), 'ERROR', m.error); continue; }

    const aspectMax = Math.max(
      CRITERIA.aspectMaxFloor, CRITERIA.aspectMaxPerColumn * m.numColumns);
    const flags = [];
    if (m.aspect < CRITERIA.aspectMin) flags.push('縦長');
    if (m.aspect > aspectMax) flags.push('扁平');
    if (m.canvasWaste > CRITERIA.canvasWasteMax) flags.push('空白過多');
    if (m.marginSkewX > CRITERIA.marginSkewMax) flags.push('左右偏り');
    if (m.marginSkewY > CRITERIA.marginSkewMax) flags.push('上下偏り');
    if (m.sideBalance < CRITERIA.sideBalanceMin) flags.push('上下密度差');

    rows.push({ name, ...m, flags });
    console.log(
      name.padEnd(26) +
      `${String(m.canvas[0]|0).padStart(5)}×${String(m.canvas[1]|0).padEnd(5)} ` +
      `aspc=${m.aspect.toFixed(2).padStart(5)} ` +
      `waste=${m.canvasWaste.toFixed(2)} ` +
      `mL/R=${String(m.marginL|0).padStart(4)}/${String(m.marginR|0).padEnd(4)} ` +
      `mT/B=${String(m.marginT|0).padStart(4)}/${String(m.marginB|0).padEnd(4)} ` +
      `skewX=${m.marginSkewX.toFixed(2)} skewY=${m.marginSkewY.toFixed(2)} ` +
      `bal=${m.sideBalance.toFixed(2)} ` +
      (flags.length ? '⚠ ' + flags.join(',') : 'OK')
    );
  }

  await browser.close();

  // 集計
  const n = rows.length;
  const avg = k => rows.reduce((s, r) => s + r[k], 0) / n;
  const flagged = rows.filter(r => r.flags.length);
  console.log('\n===== 集計 (' + n + ' パターン) =====');
  console.log('平均 aspect       :', avg('aspect').toFixed(2));
  console.log('平均 canvasWaste  :', avg('canvasWaste').toFixed(3));
  console.log('平均 marginSkewX  :', avg('marginSkewX').toFixed(3));
  console.log('平均 marginSkewY  :', avg('marginSkewY').toFixed(3));
  console.log('平均 sideBalance  :', avg('sideBalance').toFixed(3));
  console.log('指摘ありパターン  :', flagged.length + '/' + n);
  const byFlag = {};
  flagged.forEach(r => r.flags.forEach(f => { byFlag[f] = (byFlag[f] || 0) + 1; }));
  Object.entries(byFlag).sort((a, b) => b[1] - a[1])
    .forEach(([f, c]) => console.log('  ' + f.padEnd(12), c));

  fs.writeFileSync(path.join(ROOT, 'screenshots', 'balance.json'),
    JSON.stringify(rows, null, 2));
})();
