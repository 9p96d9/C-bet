/* ===================================================================
 * 03. SVG 描画（往路）
 * 規則は 02-geometry.js の実測値に従う。
 * render() は純関数。DOM は全消し→全生成する。
 * =================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  return n;
};
/** 座標は必ずこの書式で書く。検査 5.4 が属性値を読み戻すため。 */
const num = (v) => (Math.round(v * 1000) / 1000).toString();
const seg2d = (s) => `M ${num(s.x1)} ${num(s.y1)} L ${num(s.x2)} ${num(s.y2)}`;

const GRID_COLOR = '#d8d8d8';
const HOLIDAY_FILL = '#E8E8E8';
const NODE_R = 3.5;
const DEFAULT_LINE_COLOR = '#000000';  // 工程線の色が空のとき（PDF のバー３が黒）

function markerId(color) { return 'arw-' + String(color).replace(/[^0-9a-zA-Z]/g, ''); }

/** 休日区間の点線。プロジェクトG は丸い点を並べて描くので線端を丸にする。 */
function holidayDash(geo) { return `0.1 ${geo.DAY_W / 7}`; }

/**
 * @returns {{svg:SVGElement, geo:object, drawn:Array, skipped:Array, warnings:string[]}}
 */
function render(doc, start, end, opt) {
  const geo = makeGeometry(doc, start, end, opt);
  const warnings = [];
  const drawn = [], skipped = [];
  const hw = holidayRangeWarning(start, end);
  if (hw) warnings.push(hw);

  const svg = el('svg', {
    xmlns: SVG_NS, width: geo.width, height: geo.height,
    viewBox: `0 0 ${geo.width} ${geo.height}`, class: 'plot-svg',
  });

  const defs = el('defs');
  const clip = el('clipPath', { id: 'plot-clip' });
  clip.appendChild(el('rect', { x: 0, y: 0, width: geo.width, height: geo.height }));
  defs.appendChild(clip);
  const colors = new Set();
  for (const p of doc.processes) if (!p.deleted && p.arrow !== 'none') colors.add(p.color || DEFAULT_LINE_COLOR);
  for (const c of colors) {
    const m = el('marker', {
      id: markerId(c), viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    });
    m.appendChild(el('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: c }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  /* ---- 背景：休日列（土日＋祝日。00-holiday.js 参照） ---------------- */
  const bg = el('g', { class: 'bg' });
  for (let n = 0; n < geo.days; n++) {
    if (!isNonWorkingDay(geo.dateAt(n))) continue;
    bg.appendChild(el('rect', {
      x: geo.xAt(n), y: 0, width: geo.DAY_W, height: geo.height, fill: HOLIDAY_FILL, class: 'holiday',
    }));
  }
  for (let n = 0; n <= geo.days; n++) {
    bg.appendChild(el('line', { x1: geo.xAt(n), y1: 0, x2: geo.xAt(n), y2: geo.height, stroke: GRID_COLOR, 'stroke-width': 1 }));
  }
  for (let r = 0; r <= geo.maxRow; r++) {
    const y = r * geo.ROW_H;
    bg.appendChild(el('line', { x1: 0, y1: y, x2: geo.width, y2: y, stroke: GRID_COLOR, 'stroke-width': 1 }));
  }
  svg.appendChild(bg);

  const plot = el('g', { class: 'plot', 'clip-path': 'url(#plot-clip)' });
  svg.appendChild(plot);

  const relGroup = el('g', { class: 'relations' });
  const rel = new Map();
  const addRel = (name, x, y) => {
    if (!name) return;
    if (!rel.has(name)) rel.set(name, []);
    rel.get(name).push([x, y]);
  };

  /* ---- 工程 ------------------------------------------------------- */
  for (const p of doc.processes) {
    if (p.deleted) { skipped.push({ id: p.id, reason: '工程削除' }); continue; }
    if (!p.start || !p.end || !Number.isFinite(p.startNode.row) || !Number.isFinite(p.endNode.row)) {
      skipped.push({ id: p.id, reason: '日付または行番号が不正' }); continue;
    }
    if (p.end.getTime() < start.getTime() || p.start.getTime() > end.getTime()) {
      skipped.push({ id: p.id, reason: '表示期間外' }); continue;
    }
    if (!SHAPE_KIND[p.shape]) warnings.push(`${p.id}: 未知の形状「${p.shape}」→ straight として描画`);

    const color = p.color || DEFAULT_LINE_COLOR;
    const sh = shapeOf(p, geo);
    // 推定で埋めた項目があれば DOM に印を残す（後から追えるように）
    const est = estimatesOf(p.id);
    const ruleFields = est.filter((e) => e.source === 'rule').map((e) => e.field);
    const g = el('g', {
      class: 'proc' + (ruleFields.length ? ' estimated' : ''),
      'data-pid': p.id,
      'data-estimated': ruleFields.length ? ruleFields.join(',') : null,
    });
    const hd = holidayDash(geo);
    // 実線・点線 = dash のときは PDF 実測どおり長めの破線（D4）
    const explicitDash = p.dash === 'dash' ? `${geo.DAY_W / 4} ${geo.DAY_W / 8}` : null;

    if (sh.kind === 'poly') {
      const segs = splitByDay(sh.pts, geo);
      segs.forEach((s, i) => {
        const isLast = i === segs.length - 1;
        // 稼働日は実線、休日は点線。実線・点線列が dash なら全区間を破線。
        const dashArr = explicitDash || (s.holiday ? hd : null);
        g.appendChild(el('path', {
          class: 'seg', d: seg2d(s), fill: 'none', stroke: color, 'stroke-width': p.weight,
          'stroke-linecap': (!explicitDash && s.holiday) ? 'round' : 'butt',
          'stroke-dasharray': dashArr,
          'marker-end': (isLast && p.arrow !== 'none') ? `url(#${markerId(color)})` : null,
        }));
      });
      // 角の丸め（PDF 実測 5pt）は見た目だけの層。検査は上の seg を読む。
      if (sh.pts.length > 2 && geo.cornerR > 0.01) {
        g.appendChild(el('path', {
          class: 'corner', d: roundedPath(sh.pts.map((q) => [+num(q[0]), +num(q[1])]), geo.cornerR),
          fill: 'none', stroke: 'none',
        }));
      }
    } else if (sh.kind === 'box') {
      const pts = hexPoints(sh.x0, sh.x1, sh.yc, sh.h, geo.DAY_W);
      g.appendChild(el('polygon', {
        class: 'shape', points: pts.map((q) => `${num(q[0])},${num(q[1])}`).join(' '),
        fill: p.fillColor || 'none', stroke: color, 'stroke-width': p.weight,
        'stroke-dasharray': explicitDash,
      }));
    } else {
      // bar：塗り = 背景色（無ければ線色）。
      // barAutoAdjust は線色で枠も引く（PDF 実測：バー５は青塗り＋赤枠）。
      // barProcessNameAdjust は枠を引かず、行中心に工程線を 1 本引く（PDF 実測：バー６）。
      const isNameBar = p.shape === 'barProcessNameAdjust';
      g.appendChild(el('rect', {
        class: 'shape', x: num(sh.x0), y: num(sh.top),
        width: num(sh.x1 - sh.x0), height: num(sh.h),
        fill: p.fillColor || color,
        stroke: isNameBar ? 'none' : color,
        'stroke-width': isNameBar ? null : p.weight,
        'stroke-dasharray': isNameBar ? null : explicitDash,
      }));
      if (isNameBar) {
        g.appendChild(el('path', {
          class: 'baseline', d: `M ${num(sh.x0)} ${num(sh.yc)} L ${num(sh.x1)} ${num(sh.yc)}`,
          fill: 'none', stroke: color, 'stroke-width': p.weight,
        }));
      }
    }

    // ノード丸。ノード形状 = none なら描かない
    if (p.nodeShapeStart !== 'none') {
      g.appendChild(el('circle', { class: 'node node-start', cx: num(sh.x0), cy: num(sh.y0), r: NODE_R, fill: '#ffffff', stroke: color, 'stroke-width': 1.5 }));
    }
    if (p.nodeShapeEnd !== 'none') {
      g.appendChild(el('circle', { class: 'node node-end', cx: num(sh.x1), cy: num(sh.y1), r: NODE_R, fill: '#ffffff', stroke: color, 'stroke-width': 1.5 }));
    }

    if (p.name && p.nameStyle.show) g.appendChild(nameText(p, sh, geo));

    // 推定で埋めた箇所の目印。既定では出さず、［推定を表示］を押したときだけ見える。
    const marks = estimateMarks(p, sh, geo, est);
    if (marks) g.appendChild(marks);

    const tip = el('title');
    tip.textContent = `${p.name || '(名前なし)'}  ${p.shape}\n`
      + `${fmtSlash(p.start)} 〜 ${fmtSlash(p.end)}（${dayDiff(p.start, p.end) + 1}日／稼働 ${dayDiff(p.start, p.end) + 1 - countNonWorking(p.start, p.end)}日）\n`
      + `行 ${p.startNode.row} → ${p.endNode.row}`
      + (p.gateRow != null ? `（横線 ${p.gateRow}／${p.gateRowSource === 'rule' ? '推定' : p.gateRowSource === 'manual' ? '手入力' : 'CSV'}）` : '')
      + (est.length ? `\nCSV に無く埋めた項目: ${est.map((e) => e.field).join(' / ')}` : '');
    g.insertBefore(tip, g.firstChild);

    addRel(p.relation.startName, sh.x0, sh.y0);
    addRel(p.relation.endName, sh.x1, sh.y1);
    plot.appendChild(g);
    drawn.push({ p, sh });
  }

  /* ---- 関係線 -------------------------------------------------------
     PDF 実測：関係１ は C1 の開始ノード（行 21、n=6）から
     D1 のノード行（行 25）へ、**n=6 でまっすぐ縦**に引かれる。
     使われているのは上側（行番号が小さい方）のノードの x で、
     下側ノードの x は無視されている。
     サンプルに関係線は 1 本しかないので、この 1 例からの規則（未確定）。 */
  for (const [name, pts] of rel) {
    if (pts.length < 2) continue;
    const sorted = pts.slice().sort((a, b) => a[1] - b[1]);
    const x = sorted[0][0];   // 上側ノードの x（推定の記録は buildDocument 側）
    for (let i = 0; i < sorted.length - 1; i++) {
      relGroup.appendChild(el('path', {
        class: 'relation est-relation', 'data-relation': name,
        d: `M ${num(x)} ${num(sorted[i][1])} L ${num(x)} ${num(sorted[i + 1][1])}`,
        fill: 'none', stroke: '#888888', 'stroke-width': 1,
        'stroke-dasharray': `0.1 ${geo.DAY_W / 7}`, 'stroke-linecap': 'round',
      }));
    }
  }
  plot.insertBefore(relGroup, plot.firstChild);

  return { svg, geo, drawn, skipped, warnings };
}

/* ===================================================================
 * 推定の目印
 *
 * CSV に値が無くツールが埋めた箇所を、図の上で指し示すための層。
 * 既定は display:none。svg に class="show-est" が付いたときだけ見える。
 *   rule …… PDF からも決められず規則で埋めた（要確認）。濃いオレンジ
 *   pdf ……  CSV は空だが PDF から実測した既定値。控えめな灰色
 * =================================================================== */
const EST_RULE_COLOR = '#e8710a';
const EST_PDF_COLOR = '#9aa0a6';

function estimateMarks(p, sh, geo, est) {
  if (!est || !est.length) return null;
  const rule = est.filter((e) => e.source === 'rule');
  const pdf = est.filter((e) => e.source === 'pdf');
  const g = el('g', { class: 'est-mark', 'aria-hidden': 'true' });

  // 1) gate の横線が推定行に乗っている → その走りを太いオレンジで重ねる
  const gateEst = rule.find((e) => e.field === 'gate の中間ノードの行');
  if (gateEst && sh.kind === 'poly' && sh.pts.length >= 4) {
    const a = sh.pts[1], b = sh.pts[2];
    g.appendChild(el('path', {
      class: 'est-line',
      d: `M ${num(a[0])} ${num(a[1])} L ${num(b[0])} ${num(b[1])}`,
      fill: 'none', stroke: EST_RULE_COLOR, 'stroke-width': Math.max(6, p.weight * 3),
      'stroke-linecap': 'round', opacity: 0.35,
    }));
    g.appendChild(estLabel((a[0] + b[0]) / 2, a[1], `行 ${gateEst.value} は推定`, EST_RULE_COLOR, geo));
  }

  // 2) 工程線名の大きさが推定 → 文字を囲む
  const nameEst = rule.find((e) => /工程線名/.test(e.field));
  if (nameEst) {
    const top = sh.kind === 'poly' ? sh.y0 : sh.yc;
    g.appendChild(estLabel(sh.x0, top, '名前の大きさは推定', EST_RULE_COLOR, geo));
  }

  // 3) 形状そのものに印（何を埋めたかを 1 行で）
  if (rule.length) {
    const cx = sh.kind === 'poly' ? sh.pts[0][0] : sh.x0;
    const cy = sh.kind === 'poly' ? sh.pts[0][1] : sh.yc;
    g.appendChild(el('circle', {
      class: 'est-dot', cx: num(cx), cy: num(cy), r: 7,
      fill: 'none', stroke: EST_RULE_COLOR, 'stroke-width': 2,
    }));
  }

  // 4) PDF 実測の既定値（太さ・色）は控えめに。何が空だったかを示す
  if (pdf.length) {
    const cx = sh.kind === 'poly' ? sh.pts[0][0] : sh.x0;
    const cy = sh.kind === 'poly' ? sh.pts[0][1] : sh.yc;
    g.appendChild(el('circle', {
      class: 'est-dot-pdf', cx: num(cx - 10), cy: num(cy), r: 2.5,
      fill: EST_PDF_COLOR, stroke: 'none',
    }));
    const t = el('title');
    t.textContent = 'CSV が空のため既定値を使用: ' + pdf.map((e) => e.field).join(' / ');
    g.appendChild(t);
  }
  return g.childNodes.length ? g : null;
}

/** 目印の吹き出し（背景付きの小さな文字） */
function estLabel(x, y, text, color, geo) {
  const g = el('g', { class: 'est-tag' });
  const fs = Math.max(9, geo.ROW_H * 0.34);
  const w = text.length * fs * 0.62 + 8;
  g.appendChild(el('rect', {
    x: num(x + 4), y: num(y - fs - 5), width: num(w), height: num(fs + 4),
    rx: 2, fill: color, opacity: 0.92,
  }));
  const t = el('text', {
    x: num(x + 8), y: num(y - 8), 'font-size': num(fs), fill: '#ffffff', 'font-weight': 'bold',
  });
  t.textContent = text;
  g.appendChild(t);
  return g;
}

/**
 * 工程線名。配置は namePositionWithinOptions に従う（PDF 実測）。
 *   lineNameUpperCenter / UpperLeft / LowerRight / PositionFree
 *   boxNameUpperCenter / MiddleCenter / LowerLeft
 *   barNameUpperCenter
 * namePositionCoefficient は x = 列、y = 行 のずらし量。
 * coefficient.y = -0.1 は「文字の下端を線の 0.1 行上に置く」で実測と一致した。
 */
const NAME_PAD_COLS = 0.63;   // Left 寄せのときの左余白。実測 0.63 列
function nameText(p, sh, geo) {
  const st = p.nameStyle;
  const size = (TEXT_RATIO[st.textSize] || TEXT_RATIO.M) * geo.ROW_H;
  // lineNamePositionFree（プロジェクトG 上で手で動かしたラベル）は
  // ずらし量が namePositionCoefficient に入っているので、
  // 中央寄せ＋coefficient として扱えば PDF と合う。
  const w = String(st.within || '');
  const lower = /Lower/.test(w), middle = /Middle/.test(w);
  const left = /Left/.test(w), right = /Right/.test(w);

  // 縦：図形の上／中／下
  let topY, botY;
  if (sh.kind === 'poly') { topY = botY = sh.y0; }
  else if (sh.kind === 'bar' && p.shape === 'barProcessNameAdjust') { topY = sh.yc; botY = sh.top + sh.h; }
  else { topY = sh.yc - sh.h / 2; botY = sh.yc + sh.h / 2; }

  let y;
  if (middle) y = (topY + botY) / 2 + size * 0.35;
  else if (lower) y = botY + size;
  else y = topY;                       // Upper：文字の下端を図形の上端に合わせる
  y += st.coef.y * geo.ROW_H;          // 実測 -0.1 行

  // 横：左寄せ／右寄せ／中央
  let x, anchor;
  if (left) { x = sh.x0 + NAME_PAD_COLS * geo.DAY_W; anchor = 'start'; }
  else if (right) { x = sh.x1 - NAME_PAD_COLS * geo.DAY_W; anchor = 'end'; }
  else { x = (sh.x0 + sh.x1) / 2; anchor = 'middle'; }
  x += st.coef.x * geo.DAY_W;

  const t = el('text', {
    class: 'pname', x: num(x), y: num(y),
    'font-size': num(size), 'font-weight': st.bold ? 'bold' : 'normal',
    fill: st.color || p.color || DEFAULT_LINE_COLOR, 'text-anchor': anchor,
  });
  t.textContent = p.name;
  return t;
}

/** 上の日付ヘッダー（HTML テーブル。設計B 3 章） */
function renderDateHeader(geo) {
  const table = document.createElement('table');
  table.className = 'date-head';
  const months = [];
  for (let n = 0; n < geo.days; n++) {
    const d = geo.dateAt(n);
    const key = d.getUTCFullYear() + '-' + d.getUTCMonth();
    const last = months[months.length - 1];
    if (last && last.key === key) last.span++;
    else months.push({ key, span: 1, label: `${d.getUTCMonth() + 1}月` });
  }
  const r1 = table.insertRow();
  for (const m of months) {
    const c = r1.insertCell(); c.colSpan = m.span; c.textContent = m.label; c.className = 'month';
  }
  const r2 = table.insertRow(), r3 = table.insertRow();
  for (let n = 0; n < geo.days; n++) {
    const d = geo.dateAt(n);
    const a = r2.insertCell(); a.textContent = d.getUTCDate();
    const b = r3.insertCell(); b.textContent = WEEKDAY_JA[d.getUTCDay()];
    a.style.width = b.style.width = geo.DAY_W + 'px';
    if (isNonWorkingDay(d)) { a.classList.add('we'); b.classList.add('we'); }
    if (isPublicHoliday(d)) { a.classList.add('hol'); b.classList.add('hol'); }
  }
  return table;
}

/** 左の行見出し（共通仕様 4 章 A 列。空行も再現する） */
function renderRowHeader(doc, geo) {
  const heads = rowHeadings(doc.processes);
  const table = document.createElement('table');
  table.className = 'row-head';
  for (let r = 1; r <= geo.maxRow; r++) {
    const tr = table.insertRow();
    tr.style.height = geo.ROW_H + 'px';
    const n = tr.insertCell(); n.className = 'rn'; n.textContent = r;
    const nm = tr.insertCell(); nm.className = 'rname'; nm.textContent = heads.get(r) || '';
  }
  return table;
}
