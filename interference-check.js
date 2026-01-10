/**
 * 石川ダイアグラムの干渉チェックスクリプト
 * 4Mサンプルデータでの実際の座標を計算して干渉を検証
 */

// 調整後の設定値
const config = {
  numCategories: 4,

  // SVG（拡大）
  svgWidth: 2000,
  spineStartX: 100,
  spineY: 500,

  // 背骨の長さ（SVG幅の85%に調整）
  spineEndX: Math.round(2000 * 0.85), // 1700

  // 効果ボックス（距離拡大）
  effectOffsetFromSpine: 150,
  effectBoxWidth: 80,

  // 大骨
  majorBoneLength: 550,
  majorBoneAngle: 60, // 度

  // 中骨（大幅短縮）
  mediumBoneLength: 180,

  // 小骨
  smallBoneLength: 90,
  smallBoneAngle: 60, // 度

  // 孫骨
  tinyBoneLength: 55
};

console.log('=== 石川ダイアグラム干渉チェック（4M） ===\n');

// 1. 基本寸法の計算
console.log('【1. 基本寸法】');
console.log(`SVG幅: ${config.svgWidth}px`);
console.log(`背骨: ${config.spineStartX}px ～ ${config.spineEndX}px (長さ: ${config.spineEndX - config.spineStartX}px)`);
const effectX = config.spineEndX + config.effectOffsetFromSpine;
console.log(`効果ボックス: X=${effectX}px, 幅=${config.effectBoxWidth}px`);
console.log(`背骨終点と効果ボックスの距離: ${config.effectOffsetFromSpine}px`);
console.log(`効果ボックス右端: ${effectX + config.effectBoxWidth}px`);
console.log(`右端マージン: ${config.svgWidth - (effectX + config.effectBoxWidth)}px\n`);

// 2. 大骨の位置計算
console.log('【2. 大骨の配置】');
const numCategories = config.numCategories;
const spineLength = config.spineEndX - config.spineStartX;

const numTop = Math.ceil(numCategories / 2); // 2
const numBottom = Math.floor(numCategories / 2); // 2

const majorBones = [];
let topIndex = 0;
let bottomIndex = 0;

for (let i = 0; i < numCategories; i++) {
  const isTop = i % 2 === 0;
  let ratio;

  if (isTop) {
    ratio = (topIndex + 1) / (numTop + 1);
    topIndex++;
  } else {
    ratio = (bottomIndex + 1) / (numBottom + 1);
    bottomIndex++;
  }

  const spineX = config.spineStartX + spineLength * ratio;

  majorBones.push({
    index: i,
    name: ['機械', '人', '材料', '方法'][i],
    isTop: isTop,
    spineX: spineX,
    spineY: config.spineY
  });

  console.log(`大骨${i + 1}（${majorBones[i].name}）: X=${Math.round(spineX)}px, ${isTop ? '上側' : '下側'}`);
}

// 大骨間の距離をチェック
console.log('\n大骨間の距離:');
for (let i = 0; i < majorBones.length - 1; i++) {
  const distance = majorBones[i + 1].spineX - majorBones[i].spineX;
  console.log(`大骨${i + 1} ～ 大骨${i + 2}: ${Math.round(distance)}px`);
}

// 3. 中骨の範囲計算
console.log('\n【3. 中骨の配置範囲】');
const rad = (config.majorBoneAngle * Math.PI) / 180;

majorBones.forEach((bone, boneIndex) => {
  // 大骨の終点
  const majorEndX = bone.spineX - config.majorBoneLength * Math.cos(rad);
  const majorEndY = bone.isTop
    ? bone.spineY - config.majorBoneLength * Math.sin(rad)
    : bone.spineY + config.majorBoneLength * Math.sin(rad);

  console.log(`\n大骨${boneIndex + 1}（${bone.name}）から展開される中骨:`);
  console.log(`  大骨終点: (${Math.round(majorEndX)}, ${Math.round(majorEndY)})`);

  // 中骨は4本と仮定（実際のサンプルデータに基づく）
  const numMediumBones = 4;
  const mediumBones = [];

  for (let i = 0; i < numMediumBones; i++) {
    const t = 0.18 + i * 0.22;
    const endX = bone.spineX - (bone.spineX - majorEndX) * t;
    const endY = bone.isTop
      ? bone.spineY - (bone.spineY - majorEndY) * t
      : bone.spineY + (majorEndY - bone.spineY) * t;

    const isRight = i % 2 === 0;
    const direction = isRight ? 1 : -1;
    const startX = endX + (direction * config.mediumBoneLength);

    mediumBones.push({
      index: i,
      isRight: isRight,
      startX: startX,
      startY: endY,
      endX: endX,
      endY: endY
    });

    console.log(`  中骨${i + 1} (${isRight ? '右' : '左'}): ${Math.round(startX)}px ～ ${Math.round(endX)}px`);
  }

  // 同じ大骨からの中骨同士の干渉チェック
  for (let i = 0; i < mediumBones.length; i++) {
    for (let j = i + 1; j < mediumBones.length; j++) {
      const bone1 = mediumBones[i];
      const bone2 = mediumBones[j];

      // 水平方向の重なりをチェック
      const leftMost1 = Math.min(bone1.startX, bone1.endX);
      const rightMost1 = Math.max(bone1.startX, bone1.endX);
      const leftMost2 = Math.min(bone2.startX, bone2.endX);
      const rightMost2 = Math.max(bone2.startX, bone2.endX);

      const horizontalOverlap = Math.max(0, Math.min(rightMost1, rightMost2) - Math.max(leftMost1, leftMost2));

      // 垂直方向の距離
      const verticalDistance = Math.abs(bone1.startY - bone2.startY);

      if (horizontalOverlap > 0 && verticalDistance < 50) {
        console.log(`  ⚠️  中骨${i + 1}と中骨${j + 1}が接近: 水平重複=${Math.round(horizontalOverlap)}px, 垂直距離=${Math.round(verticalDistance)}px`);
      }
    }
  }

  bone.mediumBones = mediumBones;
});

// 4. 隣接する大骨間の中骨干渉チェック
console.log('\n【4. 隣接する大骨間の中骨干渉チェック】');
for (let i = 0; i < majorBones.length - 1; i++) {
  const bone1 = majorBones[i];
  const bone2 = majorBones[i + 1];

  // 上側同士、下側同士のペアのみチェック
  if (bone1.isTop === bone2.isTop) {
    console.log(`\n大骨${i + 1}（${bone1.name}）と大骨${i + 2}（${bone2.name}）:`);

    if (!bone1.mediumBones || !bone2.mediumBones) continue;

    // bone1から右に伸びる中骨とbone2から左に伸びる中骨の干渉をチェック
    const bone1RightBones = bone1.mediumBones.filter(b => b.isRight);
    const bone2LeftBones = bone2.mediumBones.filter(b => !b.isRight);

    let minClearance = Infinity;

    bone1RightBones.forEach(rb => {
      bone2LeftBones.forEach(lb => {
        const clearance = lb.startX - rb.startX;
        if (clearance < minClearance) {
          minClearance = clearance;
        }
      });
    });

    if (minClearance < Infinity) {
      console.log(`  最小クリアランス: ${Math.round(minClearance)}px`);
      if (minClearance < 80) {
        console.log(`  ⚠️  クリアランス不足（推奨: 80px以上）`);
      } else {
        console.log(`  ✅ 十分なクリアランス`);
      }
    }
  }
}

// 5. 小骨と背骨の距離チェック
console.log('\n【5. 小骨と背骨の最短距離】');
const smallBoneRad = (config.smallBoneAngle * Math.PI) / 180;

majorBones.forEach((bone, boneIndex) => {
  if (!bone.mediumBones) return;

  let minDistanceToSpine = Infinity;

  bone.mediumBones.forEach((medium, mediumIndex) => {
    // 小骨は3本と仮定
    const numSmallBones = 3;

    for (let i = 0; i < numSmallBones; i++) {
      const t = (i + 1) / (numSmallBones + 1);
      const endX = medium.startX + (medium.endX - medium.startX) * t;
      const endY = medium.startY + (medium.endY - medium.startY) * t;

      const isTop = i % 2 === 0;
      const direction = isTop ? -1 : 1;

      const offsetX = medium.isRight ? config.smallBoneLength * Math.cos(smallBoneRad) : -config.smallBoneLength * Math.cos(smallBoneRad);
      const startX = endX + offsetX;
      const startY = endY + direction * config.smallBoneLength * Math.sin(smallBoneRad);

      // 小骨の各点から背骨までの距離を計算
      const distanceToSpine1 = Math.abs(startY - config.spineY);
      const distanceToSpine2 = Math.abs(endY - config.spineY);
      const minDist = Math.min(distanceToSpine1, distanceToSpine2);

      // 小骨が背骨のX範囲内にある場合のみチェック
      const smallBoneMinX = Math.min(startX, endX);
      const smallBoneMaxX = Math.max(startX, endX);

      if (smallBoneMinX <= config.spineEndX && smallBoneMaxX >= config.spineStartX) {
        if (minDist < minDistanceToSpine) {
          minDistanceToSpine = minDist;
        }
      }
    }
  });

  if (minDistanceToSpine < Infinity) {
    console.log(`大骨${boneIndex + 1}（${bone.name}）の小骨: 最短距離=${Math.round(minDistanceToSpine)}px`);
    if (minDistanceToSpine < 100) {
      console.log(`  ⚠️  背骨に接近しすぎ（推奨: 100px以上）`);
    } else {
      console.log(`  ✅ 十分な距離`);
    }
  }
});

// 6. 孫骨と効果ボックスの距離チェック
console.log('\n【6. 孫骨と効果ボックスの最短距離】');
let minDistanceToEffect = Infinity;

majorBones.forEach((bone, boneIndex) => {
  if (!bone.mediumBones) return;

  bone.mediumBones.forEach((medium, mediumIndex) => {
    // 小骨は3本と仮定
    const numSmallBones = 3;

    for (let i = 0; i < numSmallBones; i++) {
      const t = (i + 1) / (numSmallBones + 1);
      const smallEndX = medium.startX + (medium.endX - medium.startX) * t;
      const smallEndY = medium.startY + (medium.endY - medium.startY) * t;

      const smallIsTop = i % 2 === 0;
      const direction = smallIsTop ? -1 : 1;

      const offsetX = medium.isRight ? config.smallBoneLength * Math.cos(smallBoneRad) : -config.smallBoneLength * Math.cos(smallBoneRad);
      const smallStartX = smallEndX + offsetX;
      const smallStartY = smallEndY + direction * config.smallBoneLength * Math.sin(smallBoneRad);

      // 孫骨は2本と仮定
      const numTinyBones = 2;

      for (let j = 0; j < numTinyBones; j++) {
        const tinyT = (j + 1) / (numTinyBones + 1);
        const tinyEndX = smallStartX + (smallEndX - smallStartX) * tinyT;

        const tinyIsTop = j % 2 === 0;
        const tinyDirection = medium.isRight ? 1 : -1;
        const tinyStartX = tinyEndX + (tinyDirection * config.tinyBoneLength);

        // 孫骨の右端から効果ボックスの左端までの距離
        const rightMostX = Math.max(tinyStartX, tinyEndX);
        const distanceToEffect = effectX - rightMostX;

        if (distanceToEffect < minDistanceToEffect && rightMostX > 0) {
          minDistanceToEffect = distanceToEffect;
        }
      }
    }
  });
});

console.log(`最も右側の孫骨から効果ボックスまでの距離: ${Math.round(minDistanceToEffect)}px`);
if (minDistanceToEffect < 50) {
  console.log(`⚠️  効果ボックスに接近しすぎ（推奨: 50px以上）`);
} else {
  console.log(`✅ 十分な距離`);
}

// 7. 総合評価
console.log('\n【7. 総合評価】');
console.log('推奨される改善:');
const improvements = [];

if (config.effectOffsetFromSpine < 130) {
  improvements.push('• 背骨と効果ボックスの距離を130-150pxに拡大');
}

if (config.mediumBoneLength > 210) {
  improvements.push('• 中骨の長さを200-210pxに短縮（干渉リスク削減）');
}

const rightMargin = config.svgWidth - (effectX + config.effectBoxWidth);
if (rightMargin > 60) {
  improvements.push('• SVG幅を最適化（右端マージンが大きすぎる）');
} else if (rightMargin < 30) {
  improvements.push('• SVG幅を拡大（右端マージンが小さすぎる）');
}

if (improvements.length === 0) {
  console.log('✅ 全ての項目で十分な余裕があります');
} else {
  improvements.forEach(imp => console.log(imp));
}

console.log('\n=== チェック完了 ===');
