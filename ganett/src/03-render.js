/* ===================================================================
 * 03. SVG 描画（往路）
 * 共通仕様 5 章 / 設計B 5.2
 * render() は純関数。DOM は全消し→全生成する。
 * =================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  return n;
};
/** 座標は必ずこの書式で書く。検査 5.4 が d 属性を読み戻すため。 */
const num = (v) => (Math.round(v * 1000) / 1000).toString();
const seg2d = (s) => `M ${num(s.x1)} ${num(s.y1)} L ${num(s.x2)} ${num(s.y2)}`;

const GRID_COLOR = '#d8d8d8';
const WEEKEND_FILL = '#E8E8E8';
const NODE_R = 3.5;
const NAME_GAP = 4;

function markerId(color) { return 'arw-' + String(color).replace(/[^0-9a-zA-Z]/g, ''); }

/**
 * @returns {{svg:SVGElement, drawn:Array, skipped:Array, warnings:string[]}}
 */
function render(doc, start, end, opt) {
  const geo = makeGeometry(doc, start, end, opt);
  const nodeRows = nodeRowIndex(doc.processes);
  const warnings = [];
  const drawn = [], skipped = [];

  const svg = el('svg', {
    xmlns: SVG_NS, width: geo.width, height: geo.height,
    viewBox: `0 0 ${geo.width} ${geo.height}`, class: 'plot-svg',
  });

  const defs = el('defs');
  const clip = el('clipPath', { id: 'plot-clip' });
  clip.appendChild(el('rect', { x: 0, y: 0, width: geo.width, height: geo.height }));
  defs.appendChild(clip);
  const colors = new Set();
  for (const p of doc.processes) if (!p.deleted && p.arrow !== 'none') colors.add(p.color);
  for (const c of colors) {
    const m = el('marker', {
      id: markerId(c), viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    });
    m.appendChild(el('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: c }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  /* ---- 背景：土日列（共通仕様 4 章「休日 = 土曜・日曜」） ---------- */
  const bg = el('g', { class: 'bg' });
  for (let n = 0; n < geo.days; n++) {
    if (!isWeekend(geo.dateAt(n))) continue;
    bg.appendChild(el('rect', {
      x: geo.xAt(n), y: 0, width: geo.DAY_W, height: geo.height, fill: WEEKEND_FILL, class: 'weekend',
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

  /* ---- 関係線（共通仕様 5.2）。同名の関係線名を持つノード同士を結ぶ ---- */
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
    // 完全に表示期間外なら描かない（共通仕様 4 章「クリップ」）
    if (p.end.getTime() < start.getTime() || p.start.getTime() > end.getTime()) {
      skipped.push({ id: p.id, reason: '表示期間外' }); continue;
    }
    if (!SHAPE_KIND[p.shape]) warnings.push(`${p.id}: 未知の形状「${p.shape}」→ straight として描画`);
    if (p.shape === 'gate' || p.shape === 'crank') {
      warnings.push(`${p.id}: ${p.shape} の折れ方は暫定規則です（PDF 照合で確定させること）`);
    }

    const sh = shapeOf(p, geo, nodeRows);
    const g = el('g', { class: 'proc', 'data-pid': p.id });
    const strokeDash = p.dash === 'dash' ? `${geo.DAY_W / 6} ${geo.DAY_W / 6}` : null;

    if (sh.kind === 'poly') {
      const segs = splitByDay(sh.pts, geo);
      segs.forEach((s, i) => {
        const isLast = i === segs.length - 1;
        // 稼働日は実線、土日は点線（共通仕様 5.1）。実線・点線列が dash なら全区間点線。
        const dashArr = (p.dash === 'dash' || s.weekend) ? (strokeDash || `${geo.DAY_W / 6} ${geo.DAY_W / 6}`) : null;
        g.appendChild(el('path', {
          class: 'seg', d: seg2d(s), fill: 'none', stroke: p.color, 'stroke-width': p.weight,
          'stroke-linecap': 'butt', 'stroke-dasharray': dashArr,
          'marker-end': (isLast && p.arrow !== 'none') ? `url(#${markerId(p.color)})` : null,
        }));
      });
    } else if (sh.kind === 'box') {
      const pts = hexPoints(sh.x0, sh.x1, sh.yc, sh.h);
      g.appendChild(el('polygon', {
        class: 'shape', points: pts.map((q) => `${num(q[0])},${num(q[1])}`).join(' '),
        fill: p.fillColor || 'none', stroke: p.color, 'stroke-width': p.weight,
        'stroke-dasharray': strokeDash,
      }));
    } else {
      const fill = p.shape === 'barProcessNameAdjust'
        ? (p.fillColor || lighten(p.color, 0.45))
        : (p.fillColor || p.color);
      g.appendChild(el('rect', {
        class: 'shape', x: num(sh.x0), y: num(sh.yc - sh.h / 2),
        width: num(sh.x1 - sh.x0), height: num(sh.h),
        fill, stroke: 'none',
      }));
    }

    // ノード丸（共通仕様 5.1。ノード形状 = none なら描かない）
    if (p.nodeShapeStart !== 'none') {
      g.appendChild(el('circle', { class: 'node node-start', cx: num(sh.x0), cy: num(sh.y0), r: NODE_R, fill: '#ffffff', stroke: p.color, 'stroke-width': 1.5 }));
    }
    if (p.nodeShapeEnd !== 'none') {
      g.appendChild(el('circle', { class: 'node node-end', cx: num(sh.x1), cy: num(sh.y1), r: NODE_R, fill: '#ffffff', stroke: p.color, 'stroke-width': 1.5 }));
    }

    // 工程線名（線の上）
    if (p.name) {
      const size = TEXT_PX[p.nameStyle.textSize] || TEXT_PX.M;
      const centered = sh.kind !== 'poly';
      const tx = centered ? (sh.x0 + sh.x1) / 2 : sh.x0 + NAME_GAP;
      const top = sh.kind === 'poly' ? sh.y0 : sh.yc - sh.h / 2;
      g.appendChild(Object.assign(el('text', {
        class: 'pname', x: num(tx), y: num(top - NAME_GAP),
        'font-size': size, 'font-weight': p.nameStyle.bold ? 'bold' : 'normal',
        fill: p.nameStyle.color || p.color, 'text-anchor': centered ? 'middle' : 'start',
      }), { textContent: p.name }));
    }

    addRel(p.relation.startName, sh.x0, sh.y0);
    addRel(p.relation.endName, sh.x1, sh.y1);
    plot.appendChild(g);
    drawn.push({ p, sh });
  }

  for (const [name, pts] of rel) {
    if (pts.length < 2) continue;
    const sorted = pts.slice().sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      relGroup.appendChild(el('path', {
        class: 'relation', 'data-relation': name,
        d: `M ${num(a[0])} ${num(a[1])} L ${num(b[0])} ${num(b[1])}`,
        fill: 'none', stroke: '#888888', 'stroke-width': 1, 'stroke-dasharray': '3 3',
      }));
    }
  }
  plot.insertBefore(relGroup, plot.firstChild);

  return { svg, geo, drawn, skipped, warnings };
}

/** 淡色化（barProcessNameAdjust の塗り） */
function lighten(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#cccccc';
  const v = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const r = mix((v >> 16) & 255), g = mix((v >> 8) & 255), b = mix(v & 255);
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
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
    if (isWeekend(d)) { a.classList.add('we'); b.classList.add('we'); }
  }
  return table;
}

/** 左の行見出し（HTML テーブル。共通仕様 4 章 A 列。空行も再現する） */
function renderRowHeader(doc, geo) {
  const heads = rowHeadings(doc.processes);
  const table = document.createElement('table');
  table.className = 'row-head';
  for (let r = 1; r <= geo.maxRow; r++) {
    const tr = table.insertRow();
    tr.style.height = geo.ROW_H + 'px';
    const num = tr.insertCell(); num.className = 'rn'; num.textContent = r;
    const nm = tr.insertCell(); nm.className = 'rname'; nm.textContent = heads.get(r) || '';
  }
  return table;
}
