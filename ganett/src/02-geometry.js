/* ===================================================================
 * 02. 格子と形状規則
 * 共通仕様 4 章・5 章 / 設計B 3 章・5.2
 *
 * 形状ごとの折れ方は全て SHAPE_RULES 1 箇所に集約してある。
 * PDF 照合で規則が確定したら、このテーブルだけを直せばよい。
 * =================================================================== */

const DEFAULTS = {
  DAY_W: 24,   // 1 日の幅 px（ズームはこの値だけを変える）
  ROW_H: 28,   // 1 行の高さ px
};

/* 高さは ROW_H に対する比率で保持する（設計B 5.2）。基準 ROW_H = 28 */
const H_RATIO = {
  boxS: 10 / 28, boxM: 16 / 28, boxL: 22 / 28,
  barAutoAdjust: 14 / 28, barProcessNameAdjust: 8 / 28,
};
const TEXT_PX = { L: 16, M: 13, S: 11 };

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
  }
  return {
    start, end, days, maxRow,
    DAY_W: o.DAY_W, ROW_H: o.ROW_H,
    width: days * o.DAY_W,
    height: maxRow * o.ROW_H,
    dayIndex: (d) => dayDiff(start, d),
    /** 日付 index n の列の左端 x（共通仕様 4 章「開始境界」） */
    xAt: (n) => n * o.DAY_W,
    /** 行 r の中央 y（設計B 3 章） */
    yAt: (r) => (r - 1) * o.ROW_H + o.ROW_H / 2,
    dateAt: (n) => addDays(start, n),
  };
}

/**
 * 形状ごとの折れ方。
 * 返すのは (x0,y0) で始まり (x1,y1) で終わる折れ線の頂点列。
 * PROVISIONAL と書いた規則は PDF 照合で確定させること（設計B 5.2）。
 */
const SHAPE_RULES = {
  // 始点と終点を直線で結ぶ。行が違えば斜線（共通仕様 5.2）
  straight: (c) => [[c.x0, c.y0], [c.x1, c.y1]],

  // 始点で縦 → 終点行で横（共通仕様 5.2）
  yElbow: (c) => [[c.x0, c.y0], [c.x0, c.y1], [c.x1, c.y1]],

  // 始点行で横 → 終点で縦（共通仕様 5.2）
  xElbow: (c) => [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1]],

  // 縦 → 横 → 縦。横は中間の行（共通仕様 5.2、例 C1: 21→19→17）
  // PROVISIONAL: 中間の行は「項目ID（中間ノード）」が他工程のノードとして
  // 解決できればその行、できなければ開始行と終了行の中点を四捨五入した行。
  crank: (c) => {
    const yM = c.yAt(c.midRow);
    return [[c.x0, c.y0], [c.x0, yM], [c.x1, yM], [c.x1, c.y1]];
  },

  // 縦 → 横 → 縦。横は終了行、最後の縦で終了ノード行へ（共通仕様 5.2、例 D4）
  // PROVISIONAL: 2 本目の縦の x は「中間ノード日付」の開始境界。
  // 中間ノード日付が無い場合は終了境界に置く（＝yElbow に縮退する）。
  gate: (c) => {
    const xg = c.xMid == null ? c.x1 : c.xMid;
    const pts = [[c.x0, c.y0], [c.x0, c.y1], [xg, c.y1]];
    if (xg !== c.x1) pts.push([c.x1, c.y1]);
    return pts;
  },
};

/**
 * 斜行（工程線の斜行 = true）。
 * 「折れ線の縦部分を斜線にする」（共通仕様 3.3 / 5.2）。
 * PROVISIONAL: 縦の走りを 1 日分（SLANT_DAYS × DAY_W）だけ x 方向に寝かせる。
 * 隣接する横の走りが 1 日分に満たない場合はその長さまでで打ち切る。
 */
const SLANT_DAYS = 1;
function applySlant(pts, DAY_W) {
  if (pts.length < 3) return pts;
  const out = pts.map((p) => p.slice());
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], cc = out[i + 1];
    const abVertical = a[0] === b[0] && a[1] !== b[1];
    const bcVertical = b[0] === cc[0] && b[1] !== cc[1];
    if (abVertical && !bcVertical) {
      // 縦 → 横：縦の下端を横の向きへ寝かせる
      const dir = Math.sign(cc[0] - b[0]) || 1;
      const room = Math.abs(cc[0] - b[0]);
      b[0] += dir * Math.min(SLANT_DAYS * DAY_W, room);
    } else if (!abVertical && bcVertical) {
      // 横 → 縦：縦の上端を横の向きの逆へ寝かせる
      const dir = Math.sign(b[0] - a[0]) || 1;
      const room = Math.abs(b[0] - a[0]);
      b[0] -= dir * Math.min(SLANT_DAYS * DAY_W, room);
    }
  }
  // 寝かせた結果できた重複頂点を畳む
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

/** 工程 1 本の描画形状を決める。geo 非依存の純関数。 */
function shapeOf(p, geo, nodeRows) {
  const kind = SHAPE_KIND[p.shape] || 'poly';
  const n0 = geo.dayIndex(p.start);
  const n1 = geo.dayIndex(p.end);
  const x0 = geo.xAt(n0);              // 開始境界
  const x1 = geo.xAt(n1 + 1);          // 終了境界（終了日を含む）
  const y0 = geo.yAt(p.startNode.row);
  const y1 = geo.yAt(p.endNode.row);

  if (kind === 'box' || kind === 'bar') {
    const h = (H_RATIO[p.shape] || 0.5) * geo.ROW_H;
    return { kind, x0, x1, n0, n1, yc: y0, h, y0, y1 };
  }

  // crank の中間行
  let midRow = null;
  if (p.midNode && p.midNode.id && nodeRows.has(p.midNode.id)) midRow = nodeRows.get(p.midNode.id);
  if (midRow == null) midRow = Math.round((p.startNode.row + p.endNode.row) / 2);

  // gate の 2 本目の縦の x
  let xMid = null;
  if (p.midNode && p.midNode.date) {
    const nm = geo.dayIndex(p.midNode.date);
    if (nm > n0 && nm <= n1) xMid = geo.xAt(nm);
  }

  const rule = SHAPE_RULES[p.shape] || SHAPE_RULES.straight;
  let pts = rule({ x0, x1, y0, y1, midRow, xMid, yAt: geo.yAt, DAY_W: geo.DAY_W });
  if (p.slanted) pts = applySlant(pts, geo.DAY_W);
  // 始点・終点は必ず境界に一致させる（検査 5.4 の前提）
  pts[0] = [x0, y0];
  pts[pts.length - 1] = [x1, y1];
  return { kind: 'poly', pts, x0, x1, y0, y1, n0, n1, midRow, xMid };
}

/**
 * 折れ線を「1 日ごとの区間」に割る（設計B 5.2）。
 * 各区間に、その区間が属する日付 index と土日かどうかを付ける。
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
    // x 方向に進む区間は日の境界で割る
    const dir = bx > ax ? 1 : -1;
    const t = (x) => (x - ax) / (bx - ax);
    const cuts = [ax];
    let k = dir > 0 ? Math.floor(ax / W) + 1 : Math.ceil(ax / W) - 1;
    while (dir > 0 ? k * W < bx : k * W > bx) { cuts.push(k * W); k += dir; }
    cuts.push(bx);
    for (let j = 0; j < cuts.length - 1; j++) {
      const sx = cuts[j], ex = cuts[j + 1];
      if (sx === ex) continue;
      const sy = ay + (by - ay) * t(sx);
      const ey = ay + (by - ay) * t(ex);
      const n = Math.floor(((sx + ex) / 2) / W);
      segs.push({ x1: sx, y1: sy, x2: ex, y2: ey, n });
    }
  }
  for (const s of segs) s.weekend = isWeekend(geo.dateAt(s.n));
  return segs;
}

/** 六角形（左右が尖る）。共通仕様 5.2 boxS/M/L */
function hexPoints(x0, x1, yc, h) {
  const inset = Math.min(h / 2, Math.max(0, (x1 - x0) / 4));
  const t = yc - h / 2, b = yc + h / 2;
  return [[x0, yc], [x0 + inset, t], [x1 - inset, t], [x1, yc], [x1 - inset, b], [x0 + inset, b]];
}
