#!/usr/bin/env node
/**
 * 枝レベル（小骨・孫骨）クリアランス監査
 *
 * verify.js は「重なっているか否か」の二値判定であり、0.1px の隙間で
 * かろうじて通っている脆い配置と、十分な余裕をもった配置を区別できない。
 * audit-balance.js は図全体の空白率・対称性を見るもので、枝の内部品質は
 * 対象外である。本ツールはその間を埋め、**小骨・孫骨の実クリアランス**を
 * 測定して脆い箇所を洗い出す。
 *
 * 測定項目:
 *   subSub     : 小骨ラベル同士の最小クリアランス (px)
 *   detDet     : 孫骨ラベル同士の最小クリアランス
 *   subDet     : 小骨ラベルと孫骨ラベルの最小クリアランス
 *   altViolations    : 小骨の上下交互配置が崩れている件数
 *   detAltViolations : 内側小骨で孫骨が反転している件数 (規則違反)
 *   estErr           : レイアウトエンジンの文字幅推定と実測の誤差
 *                      (推定モデルの妥当性検証)
 *
 * **計測方法の注意**: 図の SVG は viewBox を CSS サイズへ大きく縮小して
 * 描画されるため、その中で getBBox() を呼ぶとグリフのデバイスピクセル
 * 丸めが縮小率倍に拡大されて返る (実測: 同一ラベルがビューポート
 * 900/1280/1920 で 133.8/128.6/93.7px と 43% 変動し、重なりの有無まで
 * 変わる)。本ツールは座標をレイアウト構造から、文字幅を viewBox を
 * 持たない独立 SVG から取得することで、ビューポートに依存しない
 * 再現性のある値を得ている。
 *
 * 負のクリアランスは重なりを意味する。verify.js が clean でも本ツールで
 * 余裕が極小 (数 px) なら、入力が少し変わるだけで破綻する予備軍である。
 *
 * 使い方:
 *   node audit-branches.js [パターン名フィルタ]
 *   DATASET_FILE=datasets-extreme.js node audit-branches.js
 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;

function loadDatasets() {
  if (process.env.DATASET_FILE) {
    return require(path.join(ROOT, process.env.DATASET_FILE));
  }
  const src = fs.readFileSync(path.join(ROOT, 'verify.js'), 'utf8');
  const start = src.indexOf('const BUILTIN_DATASETS = {');
  if (start < 0) throw new Error('BUILTIN_DATASETS not found in verify.js');
  const endMarker = '\n};\n';
  const end = src.indexOf(endMarker, start);
  const body = src.slice(start, end + endMarker.length);
  // eslint-disable-next-line no-new-func
  return new Function(body + '\nreturn BUILTIN_DATASETS;')();
}

async function measure(page) {
  return await page.evaluate(() => {
    const svg = document.querySelector('#diagramContainer svg');
    if (!svg) return { error: 'no svg' };
    const layout = (typeof diagram !== 'undefined') ? diagram.layout : null;
    if (!layout) return { error: 'no layout' };
    const p = diagram.params;

    // === 文字幅は「スケールのかからない独立 SVG」で測る ===
    // 図の SVG は viewBox を CSS サイズへ縮小して描画されるため、
    // その中で getBBox()/getComputedTextLength() を呼ぶと、グリフの
    // デバイスピクセル丸めが縮小率倍に拡大されてユーザー座標へ返る。
    // 実測: 同一ラベルがビューポート 900/1280/1920 で 133.8/128.6/93.7px と
    // 43% も変動し、重なりの有無まで変わってしまう。
    // viewBox を持たない独立 SVG (1 user unit = 1px) で測れば
    // ビューポートに依らず一定 (上記ラベルは常に 91.00px = 7 全角 x 13px)。
    const NS = 'http://www.w3.org/2000/svg';
    const probe = document.createElementNS(NS, 'svg');
    probe.setAttribute('width', '4000');
    probe.setAttribute('height', '200');
    probe.style.cssText = 'position:absolute;left:-99999px;top:0;';
    document.body.appendChild(probe);
    const FAMILY = 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", "Meiryo", sans-serif';
    const wcache = new Map();
    const trueWidth = (text, fontSize, weight) => {
      const key = fontSize + '|' + weight + '|' + text;
      if (wcache.has(key)) return wcache.get(key);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('font-size', fontSize);
      t.setAttribute('font-weight', weight);
      t.setAttribute('font-family', FAMILY);
      t.textContent = text;
      probe.appendChild(t);
      const w = t.getComputedTextLength();
      probe.removeChild(t);
      wcache.set(key, w);
      return w;
    };

    // 描画コード (createWrappedText / createImportanceEllipse) と同一の
    // 配置式でラベル矩形を組み立てる。幅だけを実測値へ差し替える。
    const labelRect = (x, y, lines, fontSize, weight, anchor, stackDir, important) => {
      const lineH = fontSize + 3;
      const n = lines.length;
      let y0;
      if (stackDir < 0) y0 = y - (n - 1) * lineH;
      else if (stackDir > 0) y0 = y;
      else y0 = y - ((n - 1) * lineH) / 2;
      const w = Math.max(...lines.map(l => trueWidth(l, fontSize, weight)));
      const h = (n - 1) * lineH + fontSize;
      const top = y0 - fontSize / 2;
      let x0;
      if (anchor === 'end') x0 = x - w;
      else if (anchor === 'start') x0 = x;
      else x0 = x - w / 2;
      let r = { x: x0, y: top, w, h };
      if (important) {
        const cx = anchor === 'end' ? x - w / 2 : anchor === 'start' ? x + w / 2 : x;
        const cy = y0 + ((n - 1) * lineH) / 2;
        const rx = w / 2 + 14, ry = h / 2 + 9;
        const ex = Math.min(r.x, cx - rx), ey = Math.min(r.y, cy - ry);
        r = { x: ex, y: ey,
              w: Math.max(r.x + r.w, cx + rx) - ex,
              h: Math.max(r.y + r.h, cy + ry) - ey };
      }
      return r;
    };

    const cosS60 = Math.cos((p.subcauseAngleDeg * Math.PI) / 180);
    const sinS60 = Math.sin((p.subcauseAngleDeg * Math.PI) / 180);

    const subs = [], dets = [];
    let estErrMax = 0, estErrSum = 0, estErrN = 0;

    layout.categoryInfos.forEach(cat => {
      cat.causes.forEach(cause => {
        (cause.subInfos || []).forEach(s => {
          // drawSubcause と同一の式
          const isLeft = s.horizontalDir === -1;
          const lines = diagram.wrapLabel(
            s.sub.name, p.fontPx.subcause, p.labelWrapWidth.subcause);
          const ax = s.endX + s.horizontalDir * 8 * cosS60;
          const ay = s.endY + s.verticalDir * 8 * sinS60 + s.verticalDir * 6;
          subs.push({ name: s.sub.name, ...labelRect(
            ax, ay, lines, p.fontPx.subcause, '600',
            isLeft ? 'end' : 'start', s.verticalDir, !!s.sub.important) });
          // 推定幅と実測幅の誤差 (レイアウトエンジンの文字幅モデルの妥当性)
          lines.forEach(l => {
            const e = trueWidth(l, p.fontPx.subcause, '600')
              - diagram.estimateTextWidth(l, p.fontPx.subcause);
            estErrSum += e; estErrN++;
            if (Math.abs(e) > Math.abs(estErrMax)) estErrMax = e;
          });

          (s.detailInfos || []).forEach(d => {
            const dLeft = d.horizontalDir === -1;
            const dLines = diagram.wrapLabel(
              d.detail.name, p.fontPx.detail, p.labelWrapWidth.detail);
            const vd = d.verticalDir || (cat.isTop ? -1 : 1);
            dets.push({ name: d.detail.name, ...labelRect(
              d.startX + (dLeft ? -2 : 2), d.startY + vd * 7,
              dLines, p.fontPx.detail, 'normal',
              dLeft ? 'end' : 'start', vd, !!d.detail.important) });
            dLines.forEach(l => {
              const e = trueWidth(l, p.fontPx.detail, 'normal')
                - diagram.estimateTextWidth(l, p.fontPx.detail);
              estErrSum += e; estErrN++;
              if (Math.abs(e) > Math.abs(estErrMax)) estErrMax = e;
            });
          });
        });
      });
    });
    document.body.removeChild(probe);

    const rectGap = (a, b) => {
      const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
      const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
      return Math.max(dx, dy);
    };
    const worstWithin = arr => {
      let m = Infinity, who = null;
      for (let i = 0; i < arr.length; i++)
        for (let j = i + 1; j < arr.length; j++) {
          const g = rectGap(arr[i], arr[j]);
          if (g < m) { m = g; who = [arr[i].name, arr[j].name]; }
        }
      return { min: m === Infinity ? null : m, who };
    };
    const worstBetween = (A, B) => {
      let m = Infinity, who = null;
      for (const a of A) for (const b of B) {
        const g = rectGap(a, b);
        if (g < m) { m = g; who = [a.name, b.name]; }
      }
      return { min: m === Infinity ? null : m, who };
    };

    // 構造の規則性
    let altViolations = 0, detAltViolations = 0;
    layout.categoryInfos.forEach(cat => {
      cat.causes.forEach(cause => {
        (cause.subInfos || []).forEach((s, i) => {
          if (s.isOuterSub !== (i % 2 === 0)) altViolations++;
          const flipped = (s.detailInfos || [])
            .filter(d => d.horizontalDir !== s.horizontalDir).length;
          if (!s.isOuterSub && flipped > 0) detAltViolations++;
        });
      });
    });

    const ss = worstWithin(subs), dd = worstWithin(dets), sd = worstBetween(subs, dets);
    return {
      nSub: subs.length, nDet: dets.length,
      subSub: ss.min, subSubWho: ss.who,
      detDet: dd.min, detDetWho: dd.who,
      subDet: sd.min, subDetWho: sd.who,
      altViolations, detAltViolations,
      estErrMax: +estErrMax.toFixed(2),
      estErrAvg: estErrN ? +(estErrSum / estErrN).toFixed(2) : 0,
    };
  });
}

// 推奨基準: 隣接ラベルは gapPaddingPx (12px) 以上離れているのが設計値。
// その半分 (6px) を下回るものは「設計余裕を使い切っている」予備軍とみなす。
const FRAGILE = 6;

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

    const flags = [];
    const chk = (v, label) => {
      if (v === null) return;
      if (v < 0) flags.push(`${label}重なり(${v.toFixed(1)})`);
      else if (v < FRAGILE) flags.push(`${label}余裕僅少(${v.toFixed(1)})`);
    };
    chk(m.subSub, '小骨間');
    chk(m.detDet, '孫骨間');
    chk(m.subDet, '小骨-孫骨');
    if (m.altViolations) flags.push(`上下交互違反:${m.altViolations}`);
    if (m.detAltViolations) flags.push(`孫骨反転違反:${m.detAltViolations}`);

    rows.push({ name, ...m, flags });
    const f = v => v === null ? '  -  ' : v.toFixed(1).padStart(5);
    console.log(
      name.padEnd(26) +
      `小骨${String(m.nSub).padStart(3)} 孫骨${String(m.nDet).padStart(3)} | ` +
      `小骨間${f(m.subSub)} 孫骨間${f(m.detDet)} 小-孫${f(m.subDet)} | ` +
      `推定誤差 最大${String(m.estErrMax).padStart(6)} 平均${String(m.estErrAvg).padStart(5)} | ` +
      (flags.length ? '⚠ ' + flags.join(', ') : 'OK')
    );
  }
  await browser.close();

  const n = rows.length;
  const finite = k => rows.map(r => r[k]).filter(v => v !== null && isFinite(v));
  const minOf = k => { const a = finite(k); return a.length ? Math.min(...a) : null; };
  const avgOf = k => { const a = finite(k); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; };
  const fm = v => v === null ? '-' : v.toFixed(2);
  console.log('\n===== 集計 (' + n + ' パターン) =====');
  console.log('小骨総数 / 孫骨総数 :',
    rows.reduce((a, r) => a + r.nSub, 0), '/', rows.reduce((a, r) => a + r.nDet, 0));
  console.log('小骨ラベル間  最小 /平均:', fm(minOf('subSub')), '/', fm(avgOf('subSub')));
  console.log('孫骨ラベル間  最小 /平均:', fm(minOf('detDet')), '/', fm(avgOf('detDet')));
  console.log('小骨-孫骨間   最小 /平均:', fm(minOf('subDet')), '/', fm(avgOf('subDet')));
  console.log('文字幅 推定誤差 最大/平均:', fm(minOf('estErrMax')), '/', fm(avgOf('estErrAvg')));
  console.log('上下交互違反 合計:', rows.reduce((a, r) => a + r.altViolations, 0));
  console.log('孫骨反転違反 合計:', rows.reduce((a, r) => a + r.detAltViolations, 0));
  const flagged = rows.filter(r => r.flags.length);
  console.log('指摘ありパターン:', flagged.length + '/' + n);
  flagged.forEach(r => console.log('  ' + r.name + ': ' + r.flags.join(', ')));

  fs.writeFileSync(path.join(ROOT, 'screenshots', 'branches.json'),
    JSON.stringify(rows, null, 2));
})();
