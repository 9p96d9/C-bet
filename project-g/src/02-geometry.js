/* ===================================================================
 * 02. 格子と形状規則
 *
 * ここに書いてある数値は全て Sample.zip の PDF 1〜2 頁目から
 * ベクター座標を抜き出して実測したもの（tools/pdf-extract.py）。
 * 測り方と実測値は 設計B_実装メモ.md 3 章の表に載せた。
 *
 * PDF の格子（実測）:
 *   x(n) = 216.552 + n * 15.9833 pt      1 列 = 15.9833 pt
 *   y(r) = 上端 132.00 + (r-1) * 16.5450 + 16.5450/2 pt
 * → 設計B 3 章の式そのもの。比率だけを取り出してここに持つ。
 * =================================================================== */

const DEFAULTS = {
  DAY_W: 24,   // 1 日の幅 px（ズームはこの値だけを変える）
  ROW_H: 28,   // 1 行の高さ px
};

/* PDF 実測の基準寸法。比率を出すためだけに使う。 */
const PDF = { DAY_W: 15.9833, ROW_H: 16.5450 };

/* 図形の高さ。PDF 実測値を ROW_H に対する比率で保持する（設計B 5.2）。 */
const H_RATIO = {
  boxS: 0.86,               // 実測 半分 0.43 行（バー１）
  boxM: 1.36,               // 実測 半分 0.68 行（バー２）
  boxL: 1.64,               // 実測 半分 0.82 行（バー３）
  barAutoAdjust: 0.909,     // 実測 半分 0.455 行（バー４・バー５）
  barProcessNameAdjust: 0.455, // 実測 行中心から下へ 0.455 行（バー６）
};
/* box の尖りが内側へ食い込む量。実測 0.328 列（バー１〜３で共通） */
const BOX_POINT_INSET = 0.328;
/* 折れ角の丸め半径。実測 5 pt */
const CORNER_R_PT = 5;
/* 斜行で「縦」を寝かせる x 方向の量。実測 0.38〜0.39 列（B2・C3） */
const SLANT_COLS = 0.39;
/* 工程線の太さの既定値。実測 1.5（太さ列が空の 20 件すべて） */
const DEFAULT_WEIGHT = 1.5;

/* 文字の大きさ。PDF 実測 pt を ROW_H に対する比率にしたもの。
   XS=6 / M=9 / L=13.5 / XL=18 pt。S はサンプルに無いので XS と M の中間に置いた（未確定）。 */
const TEXT_RATIO = {
  XS: 6 / PDF.ROW_H,
  S: 7.5 / PDF.ROW_H,
  M: 9 / PDF.ROW_H,
  L: 13.5 / PDF.ROW_H,
  XL: 18 / PDF.ROW_H,
};

/* -------------------------------------------------------------------
 * gate の中間ノードの行が CSV から分からないときの共通規則
 *
 * CSV には 項目ID（中間ノード）・中間ノード日付 はあるが、
 * 中間ノードの行番号も項目名も無い。その項目IDが他工程の開始／終了
 * ノードとして現れていれば行は分かるが、どの工程にも紐づかない項目
 * （サンプルの D4・D5 の中間ノード）は行が決まらない。
 *
 * そこで、gate が gate らしく見える（横の走りが開始行と終了行の帯の
 * 外側に出る）ように、次の規則で埋める：
 *
 *   開始行と終了行の帯のすぐ外側で、どの工程のノードも置かれていない
 *   最初の行。下方向を先に探し、無ければ上方向。どちらも見つからなければ
 *   帯の 1 行下。
 *
 * 「下方向を先に」はサンプルの D4（帯 24–26 に対し PDF は行 32 ＝ 下）に
 * 合わせたもの。D5（帯 26–30 に対し PDF は行 23 ＝ 上）は外れる。
 * 2 例のうち 1 例しか当たらないので、これは**見た目を近づけるための
 * 埋め合わせであって、正しい行ではない**。使った箇所は必ず
 * recordEstimate() に残し、画面で手入力による上書きができるようにしてある。
 * ------------------------------------------------------------------- */
const GATE_RULE_TEXT = '開始行と終了行の帯のすぐ外側で、ノードの無い最初の行（下方向を優先）';
const GATE_SEARCH_LIMIT = 24;   // 何行まで外を探すか

function gateRowByRule(p, usedRows) {
  const lo = Math.min(p.startNode.row, p.endNode.row);
  const hi = Math.max(p.startNode.row, p.endNode.row);
  for (let k = 1; k <= GATE_SEARCH_LIMIT; k++) {
    if (!usedRows.has(hi + k)) return hi + k;
    if (lo - k >= 1 && !usedRows.has(lo - k)) return lo - k;
  }
  return hi + 1;
}

const SHAPE_KIND = {
  straight: 'poly', xElbow: 'poly', yElbow: 'poly', crank: 'poly', gate: 'poly',
  boxS: 'box', boxM: 'box', boxL: 'box',
  barAutoAdjust: 'bar', barProcessNameAdjust: 'bar',
};

/** 表示期間から格子を作る */
function makeGeometry(doc, start, end, opt) {
  const o = Object.assign({}, DEFAULTS, opt || {});
  const days = dayDiff(start, end) + 1;
  let maxRow = 1;
  for (const p of doc.processes) {
    if (Number.isFinite(p.startNode.row)) maxRow = Math.max(maxRow, p.startNode.row);
    if (Number.isFinite(p.endNode.row)) maxRow = Math.max(maxRow, p.endNode.row);
    if (Number.isFinite(p.gateRow)) maxRow = Math.max(maxRow, Math.ceil(p.gateRow));
  }
  return {
    start, end, days, maxRow,
    DAY_W: o.DAY_W, ROW_H: o.ROW_H,
    width: days * o.DAY_W,
    height: maxRow * o.ROW_H,
    cornerR: CORNER_R_PT * Math.min(o.DAY_W / PDF.DAY_W, o.ROW_H / PDF.ROW_H),
    dayIndex: (d) => dayDiff(start, d),
    /** 日付 index n の列の左端 x（共通仕様 4 章「開始境界」） */
    xAt: (n) => n * o.DAY_W,
    /** 行 r の中央 y。r は小数でもよい（crank の横は行と行の間に来る） */
    yAt: (r) => (r - 1) * o.ROW_H + o.ROW_H / 2,
    dateAt: (n) => addDays(start, n),
  };
}

/**
 * 形状ごとの折れ方。PDF 実測で確定したもの。
 * 返すのは (x0,y0) で始まり (x1,y1) で終わる折れ線の頂点列。
 */
const SHAPE_RULES = {
  // 始点と終点を直線で結ぶ。行が違えば斜線。
  // 実測 E1(31→31 横) / E2(31→33 斜) / E3(33→31 斜)
  straight: (c) => [[c.x0, c.y0], [c.x1, c.y1]],

  // 始点で縦 → 終点行で横。
  // 実測 A2: 縦 n14 r8→5、横 r5 n14→18
  yElbow: (c) => [[c.x0, c.y0], [c.x0, c.y1], [c.x1, c.y1]],

  // 始点行で横 → 終点で縦。
  // 実測 B3: 横 r14 n18→25、縦 n25 r14→11
  xElbow: (c) => [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1]],

  // 縦 → 横 → 縦。横は開始行と終了行のちょうど中間。**丸めない**。
  // 実測 C1(21→19→17、中間は整数) / C3(17→19.5→22、中間は .5)
  crank: (c) => {
    const yM = c.yAt((c.r0 + c.r1) / 2);
    return [[c.x0, c.y0], [c.x0, yM], [c.x1, yM], [c.x1, c.y1]];
  },

  // 縦 → 横 → 縦。横は「中間ノードの行」。
  // 実測 D4(24→32→26) / D5(26→23→30) / D2(25→29→29) / D3(29→24→24) / D1(25→25→25)
  // 中間ノードの行が CSV から分からないときは gateRowByRule() が埋める。
  gate: (c) => {
    const yG = c.yAt(c.gateRow == null ? c.r1 : c.gateRow);
    return [[c.x0, c.y0], [c.x0, yG], [c.x1, yG], [c.x1, c.y1]];
  },
};

/**
 * 斜行（工程線の斜行 = true）。折れ線の「縦」の走りを寝かせる。
 * 実測：縦の走りが x 方向に 0.38〜0.39 列ぶん傾く（B2・C3）。
 * 縦の長さが変わっても x 方向の量は変わらないので、角度ではなく固定量。
 */
function applySlant(pts, DAY_W) {
  if (pts.length < 3) return pts;
  const d = SLANT_COLS * DAY_W;
  const out = pts.map((p) => p.slice());
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], cc = out[i + 1];
    const abV = a[0] === b[0] && a[1] !== b[1];
    const bcV = b[0] === cc[0] && b[1] !== cc[1];
    if (abV && !bcV) {
      const dir = Math.sign(cc[0] - b[0]) || 1;
      b[0] += dir * Math.min(d, Math.abs(cc[0] - b[0]));
    } else if (!abV && bcV) {
      const dir = Math.sign(b[0] - a[0]) || 1;
      b[0] -= dir * Math.min(d, Math.abs(b[0] - a[0]));
    }
  }
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

/** 工程 1 本の描画形状を決める */
function shapeOf(p, geo) {
  const kind = SHAPE_KIND[p.shape] || 'poly';
  const n0 = geo.dayIndex(p.start);
  const n1 = geo.dayIndex(p.end);
  const x0 = geo.xAt(n0);              // 開始境界
  const x1 = geo.xAt(n1 + 1);          // 終了境界（終了日を含む）
  const y0 = geo.yAt(p.startNode.row);
  const y1 = geo.yAt(p.endNode.row);

  if (kind === 'box') {
    const h = H_RATIO[p.shape] * geo.ROW_H;
    return { kind, x0, x1, n0, n1, yc: y0, h, y0, y1 };
  }
  if (kind === 'bar') {
    const h = H_RATIO[p.shape] * geo.ROW_H;
    // barProcessNameAdjust は行中心が上端。barAutoAdjust は行中心が中央。
    const top = p.shape === 'barProcessNameAdjust' ? y0 : y0 - h / 2;
    return { kind, x0, x1, n0, n1, yc: y0, h, top, y0, y1 };
  }

  const rule = SHAPE_RULES[p.shape] || SHAPE_RULES.straight;
  let pts = rule({
    x0, x1, y0, y1, yAt: geo.yAt,
    r0: p.startNode.row, r1: p.endNode.row,
    gateRow: p.gateRow,
  });
  if (p.slanted) pts = applySlant(pts, geo.DAY_W);
  pts[0] = [x0, y0];
  pts[pts.length - 1] = [x1, y1];
  return { kind: 'poly', pts, x0, x1, y0, y1, n0, n1 };
}

/**
 * 折れ線を「1 日ごとの区間」に割る。
 * 各区間に日付 index と非稼働日かどうかを付ける。
 */
function splitByDay(pts, geo) {
  const W = geo.DAY_W;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    if (ax === bx) {
      // 縦（または斜行で潰れた区間）。属する日は隣接する横の向きで決める。
      let n = Math.floor(ax / W);
      if (Math.abs(ax / W - Math.round(ax / W)) < 1e-9) {
        const k = Math.round(ax / W);
        const goesRight = i + 2 < pts.length ? pts[i + 2][0] > ax : false;
        const cameFromLeft = i > 0 ? pts[i - 1][0] < ax : false;
        n = goesRight ? k : (cameFromLeft ? k - 1 : k);
      }
      segs.push({ x1: ax, y1: ay, x2: bx, y2: by, n });
      continue;
    }
    const dir = bx > ax ? 1 : -1;
    const t = (x) => (x - ax) / (bx - ax);
    const cuts = [ax];
    let k = dir > 0 ? Math.floor(ax / W) + 1 : Math.ceil(ax / W) - 1;
    while (dir > 0 ? k * W < bx : k * W > bx) { cuts.push(k * W); k += dir; }
    cuts.push(bx);
    for (let j = 0; j < cuts.length - 1; j++) {
      const sx = cuts[j], ex = cuts[j + 1];
      if (sx === ex) continue;
      segs.push({
        x1: sx, y1: ay + (by - ay) * t(sx),
        x2: ex, y2: ay + (by - ay) * t(ex),
        n: Math.floor(((sx + ex) / 2) / W),
      });
    }
  }
  for (const s of segs) s.holiday = isNonWorkingDay(geo.dateAt(s.n));
  return segs;
}

/** 六角形（左右が尖る）。box S/M/L */
function hexPoints(x0, x1, yc, h, DAY_W) {
  const inset = Math.min(BOX_POINT_INSET * DAY_W, Math.max(0, (x1 - x0) / 2));
  const t = yc - h / 2, b = yc + h / 2;
  return [[x0, yc], [x0 + inset, t], [x1 - inset, t], [x1, yc], [x1 - inset, b], [x0 + inset, b]];
}

/** 折れ線の角を半径 r で丸めた SVG の d を組む（描画専用。検査は頂点で行う） */
function roundedPath(pts, r) {
  if (pts.length < 3 || r <= 0) {
    return pts.map((p, i) => (i ? 'L' : 'M') + ' ' + p[0] + ' ' + p[1]).join(' ');
  }
  const out = ['M ' + pts[0][0] + ' ' + pts[0][1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r1 = Math.min(r, d1 / 2, d2 / 2);
    if (r1 <= 0.01) { out.push('L ' + b[0] + ' ' + b[1]); continue; }
    const p1 = [b[0] + (a[0] - b[0]) * r1 / d1, b[1] + (a[1] - b[1]) * r1 / d1];
    const p2 = [b[0] + (c[0] - b[0]) * r1 / d2, b[1] + (c[1] - b[1]) * r1 / d2];
    out.push('L ' + p1[0] + ' ' + p1[1]);
    out.push('Q ' + b[0] + ' ' + b[1] + ' ' + p2[0] + ' ' + p2[1]);
  }
  const last = pts[pts.length - 1];
  out.push('L ' + last[0] + ' ' + last[1]);
  return out.join(' ');
}
