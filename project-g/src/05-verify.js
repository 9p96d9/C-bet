/* ===== この下は自動生成（node tools/gen-headers.mjs）。手で直さない =====
 * ファイル: 05-verify.js    読み込み順 6 / 8    367 行（この案内板を除く）
 * 役割    : 描いた SVG と書いた xlsx を読み戻して検査する
 * 前      : 04-xlsx.js
 * 後      : 07-diag.js
 *
 * 【このファイルが他から借りている名前】
 *   01-csv-model.js: COL DEFAULT_LINE_COLOR META_KEYS addDays dayDiff
 *   04-xlsx.js: COL_DATE0 COL_END COL_HEAD COL_NAME COL_START DATA_SHEET HELP_SHEET
 *               LAYOUT_SHEET ROW_MONTH argb visibleProcesses
 *   02-geometry.js: DEFAULTS H_RATIO SHAPE_KIND TEXT_RATIO
 *   00-holiday.js: MS_DAY countNonWorking isNonWorkingDay
 *
 * 【このファイルが出していて、他が使っている名前】
 *   verifySvg→06 verifyXlsx→06
 *   ※ → の右は、その名前を使っているファイルの番号
 *
 * 【触ると見た目・動きが変わる値】
 *   EPS=0.002
 *
 * 名前を変える・消すときは、上の「他が使っている名前」に載っている
 * ものだけ注意すればよい。載っていない名前はこのファイルの中だけの話。
 * ===== 自動生成ここまで ===================================================== */

/* ===================================================================
 * 05. 機械検査（設計B 5.4）
 *
 * 描いたものを信じない。SVG は DOM の属性値を読み戻し、
 * xlsx は書き出したバッファを ExcelJS で読み戻して検査する。
 * 期待値は CSV から独立に再計算する（描画に使った値を使い回さない）。
 * =================================================================== */

const EPS = 0.002;
const near = (a, b) => Math.abs(a - b) <= EPS;
const SEP = String.fromCharCode(1);

/** 検査結果を 1 件積む。ok が false なら画面で NG として出る */
function pushResult(list, ok, scope, label, detail) {
  list.push({ ok: !!ok, scope, label, detail: detail || '' });
}

/** "M x y L x y" を読み戻す */
function parseSeg(d) {
  const m = /^M\s*(-?[\d.]+)\s+(-?[\d.]+)\s+L\s*(-?[\d.]+)\s+(-?[\d.]+)$/.exec(String(d).trim());
  if (!m) return null;
  return { x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] };
}

/**
 * SVG 検査。svgRoot の属性だけを見る。
 * 期待値は CSV から独立に再計算する。
 */
function verifySvg(doc, svgRoot, start, end, opt) {
  const o = Object.assign({}, DEFAULTS, opt || {});
  const DAY_W = o.DAY_W, ROW_H = o.ROW_H;
  const results = [];
  const expDayIndex = (d) => dayDiff(start, d);
  const expX = (n) => n * DAY_W;
  const expY = (r) => (r - 1) * ROW_H + ROW_H / 2;

  const shouldDraw = (p) => !p.deleted && p.start && p.end
    && Number.isFinite(p.startNode.row) && Number.isFinite(p.endNode.row)
    && p.end.getTime() >= start.getTime() && p.start.getTime() <= end.getTime();

  for (const p of doc.processes) {
    const g = svgRoot.querySelector('g.proc[data-pid="' + CSS.escape(p.id) + '"]');
    if (!shouldDraw(p)) {
      pushResult(results, !g, p.id, '非描画対象が描かれていないこと', g ? '描かれている' : '');
      continue;
    }
    if (!g) { pushResult(results, false, p.id, '工程が描かれていること', '要素が無い'); continue; }

    const x0 = expX(expDayIndex(p.start));
    const x1 = expX(expDayIndex(p.end) + 1);
    const y0 = expY(p.startNode.row);
    const y1 = expY(p.endNode.row);
    const kind = SHAPE_KIND[p.shape] || 'poly';

    if (kind === 'poly') {
      const segs = Array.from(g.querySelectorAll('path.seg')).map((n) => ({
        node: n, g: parseSeg(n.getAttribute('d')),
        dash: n.getAttribute('stroke-dasharray'),
        marker: n.getAttribute('marker-end'),
        color: n.getAttribute('stroke'),
        width: parseFloat(n.getAttribute('stroke-width')),
      }));
      const bad = segs.filter((s) => !s.g);
      pushResult(results, segs.length > 0 && bad.length === 0, p.id, 'path の d が解析できること',
        segs.length === 0 ? 'path.seg が無い' : (bad.length ? bad.length + ' 件が解析不能' : segs.length + ' 区間'));
      if (!segs.length || bad.length) continue;

      const first = segs[0].g, last = segs[segs.length - 1].g;
      pushResult(results, near(first.x1, x0), p.id, '始点 x ＝ dayIndex(開始日)×DAY_W',
        '実測 ' + first.x1 + ' / 期待 ' + x0);
      pushResult(results, near(first.y1, y0), p.id, '始点 y ＝ 開始行の中央',
        '実測 ' + first.y1 + ' / 期待 ' + y0);
      pushResult(results, near(last.x2, x1), p.id, '終点 x ＝ (dayIndex(終了日)+1)×DAY_W',
        '実測 ' + last.x2 + ' / 期待 ' + x1);
      pushResult(results, near(last.y2, y1), p.id, '終点 y ＝ 終了行の中央',
        '実測 ' + last.y2 + ' / 期待 ' + y1);

      let broken = 0;
      for (let i = 0; i < segs.length - 1; i++) {
        if (!near(segs[i].g.x2, segs[i + 1].g.x1) || !near(segs[i].g.y2, segs[i + 1].g.y1)) broken++;
      }
      pushResult(results, broken === 0, p.id, '区間が連続していること', broken ? broken + ' 箇所で不連続' : '');

      // 稼働日は実線、土日は点線（共通仕様 5.1）
      let dashNg = 0, checked = 0;
      for (const s of segs) {
        if (s.g.x1 === s.g.x2) continue; // 縦区間は x から日を一意に決められないので対象外
        checked++;
        const n = Math.floor(((s.g.x1 + s.g.x2) / 2) / DAY_W);
        const want = isNonWorkingDay(addDays(start, n)) || p.dash === 'dash';
        if (want !== !!s.dash) dashNg++;
      }
      pushResult(results, dashNg === 0, p.id, '土日区間が点線・稼働日区間が実線であること',
        dashNg ? dashNg + ' 区間が不一致' : checked + ' 区間を検査');

      const wantMarker = p.arrow !== 'none';
      const hasMarker = segs.some((s) => !!s.marker);
      pushResult(results, wantMarker === hasMarker, p.id, '矢印の有無が 工程線の矢印 と一致',
        'CSV=' + (p.arrow || '(空)') + ' / 実測=' + (hasMarker ? 'あり' : 'なし'));
      const wantColor = (p.color || DEFAULT_LINE_COLOR).toLowerCase();
      const colorNg = segs.filter((s) => (s.color || '').toLowerCase() !== wantColor).length;
      pushResult(results, colorNg === 0, p.id, '線色が 工程線の色 と一致', colorNg ? colorNg + ' 区間が不一致' : wantColor);
      const wNg = segs.filter((s) => !near(s.width, p.weight)).length;
      pushResult(results, wNg === 0, p.id, '線の太さが 工程線の太さ と一致', wNg ? wNg + ' 区間が不一致' : String(p.weight));

    } else if (kind === 'box') {
      const poly = g.querySelector('polygon.shape');
      if (!poly) { pushResult(results, false, p.id, '六角形が描かれていること', 'polygon が無い'); continue; }
      const pts = poly.getAttribute('points').trim().split(/\s+/).map((s) => s.split(',').map(Number));
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      pushResult(results, near(Math.min.apply(null, xs), x0), p.id, '左端 x ＝ 開始境界',
        '実測 ' + Math.min.apply(null, xs) + ' / 期待 ' + x0);
      pushResult(results, near(Math.max.apply(null, xs), x1), p.id, '右端 x ＝ 終了境界',
        '実測 ' + Math.max.apply(null, xs) + ' / 期待 ' + x1);
      const yc = (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2;
      pushResult(results, near(yc, y0), p.id, '中心 y ＝ 行の中央', '実測 ' + yc + ' / 期待 ' + y0);
      const h = Math.max.apply(null, ys) - Math.min.apply(null, ys);
      pushResult(results, near(h, H_RATIO[p.shape] * ROW_H), p.id, '高さ ＝ ' + p.shape + ' の規定値',
        '実測 ' + h + ' / 期待 ' + (H_RATIO[p.shape] * ROW_H));
      pushResult(results, (poly.getAttribute('stroke') || '').toLowerCase() === (p.color || DEFAULT_LINE_COLOR).toLowerCase(),
        p.id, '枠線色 ＝ 工程線の色', poly.getAttribute('stroke'));

    } else {
      const rect = g.querySelector('rect.shape');
      if (!rect) { pushResult(results, false, p.id, 'バーが描かれていること', 'rect が無い'); continue; }
      const rx = +rect.getAttribute('x'), rw = +rect.getAttribute('width');
      const ry = +rect.getAttribute('y'), rh = +rect.getAttribute('height');
      pushResult(results, near(rx, x0), p.id, '左端 x ＝ 開始境界', '実測 ' + rx + ' / 期待 ' + x0);
      pushResult(results, near(rx + rw, x1), p.id, '右端 x ＝ 終了境界', '実測 ' + (rx + rw) + ' / 期待 ' + x1);
      const wantTop = p.shape === 'barProcessNameAdjust' ? y0 : y0 - rh / 2;
      pushResult(results, near(ry, wantTop), p.id,
        p.shape === 'barProcessNameAdjust' ? '上端 y ＝ 行の中央' : '中心 y ＝ 行の中央',
        '実測上端 ' + ry + ' / 期待 ' + wantTop);
      pushResult(results, near(rh, H_RATIO[p.shape] * ROW_H), p.id, '高さ ＝ ' + p.shape + ' の規定値',
        '実測 ' + rh + ' / 期待 ' + (H_RATIO[p.shape] * ROW_H));
    }

    // ノード丸（共通仕様 5.1）
    const cs = g.querySelector('circle.node-start'), ce = g.querySelector('circle.node-end');
    pushResult(results, (p.nodeShapeStart === 'none') === !cs, p.id, '開始ノード丸の有無が 開始日ノード形状 と一致',
      'CSV=' + (p.nodeShapeStart || '(空)') + ' / 実測=' + (cs ? 'あり' : 'なし'));
    pushResult(results, (p.nodeShapeEnd === 'none') === !ce, p.id, '終了ノード丸の有無が 終了日ノード形状 と一致',
      'CSV=' + (p.nodeShapeEnd || '(空)') + ' / 実測=' + (ce ? 'あり' : 'なし'));
    if (cs) pushResult(results, near(+cs.getAttribute('cx'), x0) && near(+cs.getAttribute('cy'), y0),
      p.id, '開始ノード丸の位置',
      '(' + cs.getAttribute('cx') + ', ' + cs.getAttribute('cy') + ') / 期待 (' + x0 + ', ' + y0 + ')');
    if (ce) pushResult(results, near(+ce.getAttribute('cx'), x1) && near(+ce.getAttribute('cy'), y1),
      p.id, '終了ノード丸の位置',
      '(' + ce.getAttribute('cx') + ', ' + ce.getAttribute('cy') + ') / 期待 (' + x1 + ', ' + y1 + ')');

    // 工程線名
    if (p.name && p.nameStyle.show) {
      const t = g.querySelector('text.pname');
      pushResult(results, !!t && t.textContent === p.name, p.id, '工程線名が描かれていること', t ? t.textContent : '無し');
      const wantSize = (TEXT_RATIO[p.nameStyle.textSize] || TEXT_RATIO.M) * ROW_H;
      if (t) pushResult(results, near(+t.getAttribute('font-size'), Math.round(wantSize * 1000) / 1000),
        p.id, '文字サイズ ＝ textSize ' + p.nameStyle.textSize,
        t.getAttribute('font-size') + ' / 期待 ' + (Math.round(wantSize * 100) / 100));
    }
  }

  // 休日列の背景（土日＋祝日）
  const weRects = svgRoot.querySelectorAll('rect.holiday');
  let weExpected = 0;
  for (let n = 0; n <= dayDiff(start, end); n++) if (isNonWorkingDay(addDays(start, n))) weExpected++;
  pushResult(results, weRects.length === weExpected, '格子', '休日列（土日＋祝日）の背景の本数',
    '実測 ' + weRects.length + ' / 期待 ' + weExpected);
  let wePos = 0;
  weRects.forEach((r) => {
    const n = Math.round(+r.getAttribute('x') / DAY_W);
    if (!isNonWorkingDay(addDays(start, n)) || !near(+r.getAttribute('width'), DAY_W)) wePos++;
  });
  pushResult(results, wePos === 0, '格子', '休日列の位置と幅', wePos ? wePos + ' 件が不正' : '');

  // 推定で埋めた箇所が、もれなく記録されていること。
  // 「描いたものを信じない」と同じ考えで、DOM の印と記録を突き合わせる。
  const estAll = doc.estimates || [];
  const ruleIds = new Set(estAll.filter((e) => e.source === 'rule' && /^P|^[^関]/.test(e.scope))
    .map((e) => e.scope));
  let markNg = [];
  for (const p of doc.processes) {
    const g = svgRoot.querySelector('g.proc[data-pid="' + CSS.escape(p.id) + '"]');
    if (!g) continue;
    const marked = !!g.getAttribute('data-estimated');
    const want = ruleIds.has(p.id);
    if (marked !== want) markNg.push(p.id + (want ? ':印が無い' : ':余計な印'));
  }
  pushResult(results, markNg.length === 0, '推定', '推定で埋めた工程に DOM の印が付いていること',
    markNg.length ? markNg.slice(0, 3).join(' , ') : ruleIds.size + ' 件に印');
  const estBad = estAll.filter((e) => !e.field || !e.rule || !e.reason || e.value === undefined);
  pushResult(results, estBad.length === 0, '推定', '記録に項目・規則・理由がそろっていること',
    estBad.length ? estBad.length + ' 件が欠けている' : estAll.length + ' 件');
  // gate は必ず行が決まっていること（null のまま描かない）
  const gateBad = doc.processes.filter((p) => p.shape === 'gate' && !Number.isFinite(p.gateRow));
  pushResult(results, gateBad.length === 0, '推定', 'gate の横線の行が必ず決まっていること',
    gateBad.length ? gateBad.map((p) => p.id).join(',') : '');
  const gateRule = doc.processes.filter((p) => p.shape === 'gate' && p.gateRowSource === 'rule');
  const gateRuleRec = estAll.filter((e) => e.field === 'gate の中間ノードの行' && e.source === 'rule');
  pushResult(results, gateRule.length === gateRuleRec.length, '推定',
    '規則で埋めた gate がすべて記録されていること',
    '規則で埋めた ' + gateRule.length + ' 件 / 記録 ' + gateRuleRec.length + ' 件');

  // 休日の計算が CSV の 休日 列と合うこと（共通仕様 3.3「検算用」）
  let holNg = 0, holChecked = 0;
  for (const p of doc.processes) {
    const csvHol = parseInt(p.derived.holidays, 10);
    if (!p.start || !p.end || !Number.isFinite(csvHol)) continue;
    holChecked++;
    if (countNonWorking(p.start, p.end) !== csvHol) holNg++;
  }
  pushResult(results, holNg === 0, '格子', '休日の計算が CSV の 休日 列と一致',
    holNg ? holNg + ' 件が不一致' : holChecked + ' 件を検算');

  return results;
}

/** xlsx を書き出しバッファから読み戻して検査する（設計B 5.4） */
async function verifyXlsx(buffer, doc, start, end) {
  const results = [];
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const ws = wb.getWorksheet(LAYOUT_SHEET);
  const wd = wb.getWorksheet(DATA_SHEET);
  const wh = wb.getWorksheet(HELP_SHEET);
  pushResult(results, !!ws, 'xlsx', 'シート ' + LAYOUT_SHEET + ' があること');
  pushResult(results, !!wd, 'xlsx', 'シート ' + DATA_SHEET + ' があること');
  pushResult(results, !!wh, 'xlsx', 'シート ' + HELP_SHEET + ' があること');
  if (!ws || !wd) return results;

  pushResult(results, wd.state === 'hidden' || wd.state === 'veryHidden', 'xlsx',
    DATA_SHEET + ' が非表示であること', String(wd.state));
  pushResult(results, !!(ws.sheetProtection && ws.sheetProtection.sheet), 'xlsx',
    'T10_Layout がシート保護されていること', JSON.stringify(ws.sheetProtection || null));

  const days = dayDiff(start, end) + 1;
  const lastCol = COL_DATE0 + days - 1;
  const procs = visibleProcesses(doc, start, end);

  // ExcelJS は numFmt が日付書式と認識されない場合（'aaa' など）
  // 値をシリアル値のまま返す。どちらでも日付として読めるようにする。
  const asDate = (v) => {
    if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(Math.round((v - 25569) * MS_DAY));
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
    return null;
  };
  const cellText = (v) => (v && v.richText) ? v.richText.map((t) => t.text).join('') : v;

  // 行 2 の日付列（共通仕様 4 章：日付 index n → 列 COL_DATE0 + n）
  let dayNg = 0, weekNg = 0, weFillNg = 0;
  for (let n = 0; n < days; n++) {
    const want = addDays(start, n);
    const got = asDate(ws.getCell(ROW_DAY, COL_DATE0 + n).value);
    if (!got || got.getTime() !== want.getTime()) dayNg++;
    const gotW = asDate(ws.getCell(ROW_WEEK, COL_DATE0 + n).value);
    if (!gotW || gotW.getTime() !== want.getTime()) weekNg++;
    const fill = ws.getCell(ROW_DAY, COL_DATE0 + n).fill;
    const shaded = !!(fill && fill.type === 'pattern' && fill.fgColor && /E8E8E8$/i.test(fill.fgColor.argb || ''));
    if (isNonWorkingDay(want) !== shaded) weFillNg++;
  }
  pushResult(results, dayNg === 0, 'xlsx', '行 2 の日付が表示期間と 1 日ずつ一致', dayNg ? dayNg + ' 列が不一致' : days + ' 列');
  pushResult(results, weekNg === 0, 'xlsx', '行 3 の曜日列が同じ日付を指すこと', weekNg ? weekNg + ' 列が不一致' : '');
  pushResult(results, weFillNg === 0, 'xlsx', '休日列（土日＋祝日）が薄灰であること', weFillNg ? weFillNg + ' 列が不一致' : '');
  pushResult(results, ws.getCell(ROW_DAY, COL_DATE0).numFmt === 'd', 'xlsx', '行 2 の表示書式が d', String(ws.getCell(ROW_DAY, COL_DATE0).numFmt));
  pushResult(results, ws.getCell(ROW_WEEK, COL_DATE0).numFmt === 'aaa', 'xlsx', '行 3 の表示書式が aaa', String(ws.getCell(ROW_WEEK, COL_DATE0).numFmt));

  // 行 1 の月見出し。結合セルは全セルが master の値を返すので、
  // 「各列が自分の月を指すこと」と「結合の塊の数 ＝ 月数」の両方を見る。
  const monthSet = new Set();
  for (let n = 0; n < days; n++) { const d = addDays(start, n); monthSet.add(d.getUTCFullYear() + '-' + d.getUTCMonth()); }
  let monthValNg = 0;
  const masters = new Set();
  for (let n = 0; n < days; n++) {
    const c = ws.getCell(ROW_MONTH, COL_DATE0 + n);
    const d = addDays(start, n);
    if (cellText(c.value) !== (d.getUTCMonth() + 1) + '月') monthValNg++;
    masters.add(c.master ? c.master.address : c.address);
  }
  pushResult(results, monthValNg === 0, 'xlsx', '行 1 の各日付列が自分の月を指すこと',
    monthValNg ? monthValNg + ' 列が不一致' : days + ' 列');
  pushResult(results, masters.size === monthSet.size, 'xlsx', '行 1 の月見出しが月ごとに結合されていること',
    '結合の塊 ' + masters.size + ' / 月数 ' + monthSet.size);

  // 1 行 1 工程・C/D・保護・入力規則
  let rowNg = 0, dateNg = 0, lockNg = 0, dvNg = 0;
  procs.forEach((p, i) => {
    const r = ROW_DATA0 + i;
    const gotName = cellText(ws.getCell(r, COL_NAME).value);
    if (String(gotName == null ? '' : gotName) !== String(p.name || '')) rowNg++;
    const cs = asDate(ws.getCell(r, COL_START).value), ce = asDate(ws.getCell(r, COL_END).value);
    if (!cs || !ce || cs.getTime() !== p.start.getTime() || ce.getTime() !== p.end.getTime()) dateNg++;
    const ps = ws.getCell(r, COL_START).protection, pe = ws.getCell(r, COL_END).protection;
    if (!ps || ps.locked !== false || !pe || pe.locked !== false) lockNg++;
    if (!ws.getCell(r, COL_START).dataValidation || !ws.getCell(r, COL_END).dataValidation) dvNg++;
  });
  pushResult(results, rowNg === 0, 'xlsx', '1 行 1 工程で工程線名が一致', rowNg ? rowNg + ' 行が不一致' : procs.length + ' 行');
  pushResult(results, dateNg === 0, 'xlsx', 'C/D が CSV の開始日・終了日と一致（日付部分）', dateNg ? dateNg + ' 行が不一致' : '');
  pushResult(results, lockNg === 0, 'xlsx', 'C/D だけが編集可（locked=false）', lockNg ? lockNg + ' 行が不一致' : '');
  pushResult(results, dvNg === 0, 'xlsx', 'C/D に入力規則があること', dvNg ? dvNg + ' 行が不一致' : '');
  const aProt = ws.getCell(ROW_DATA0, COL_HEAD).protection;
  pushResult(results, !aProt || aProt.locked !== false, 'xlsx', 'A 列は編集不可のままであること');

  // 条件付き書式（バー）
  const cf = ws.conditionalFormattings || [];
  pushResult(results, cf.length === procs.length, 'xlsx', '条件付き書式が工程数だけあること',
    '実測 ' + cf.length + ' / 期待 ' + procs.length);
  const fLetter = ws.getColumn(COL_DATE0).letter, lLetter = ws.getColumn(lastCol).letter;
  let cfNg = 0;
  const cfDetail = [];
  procs.forEach((p, i) => {
    const r = ROW_DATA0 + i;
    const want = 'AND(' + fLetter + '$' + ROW_DAY + '>=$C' + r + ',' + fLetter + '$' + ROW_DAY + '<=$D' + r + ')';
    const hit = cf.find((x) => String(x.ref) === fLetter + r + ':' + lLetter + r);
    if (!hit || !hit.rules || !hit.rules.length) { cfNg++; cfDetail.push(p.id + ':規則なし'); return; }
    const rule = hit.rules[0];
    const f = String((rule.formulae && rule.formulae[0]) || '').replace(/^=/, '');
    const fill = rule.style && rule.style.fill;
    const gotArgb = fill && fill.fgColor && String(fill.fgColor.argb || '').toUpperCase();
    if (rule.type !== 'expression' || f !== want || gotArgb !== argb(p.color || DEFAULT_LINE_COLOR)) {
      cfNg++; cfDetail.push(p.id + ':' + f + '/' + gotArgb);
    }
  });
  pushResult(results, cfNg === 0, 'xlsx', '各行の条件付き書式の式と塗り色が正しいこと',
    cfNg ? cfDetail.slice(0, 3).join(' , ') : procs.length + ' 行');

  // 推定の記録が _data に残っていること
  const metaCol2 = doc.headers.length + 5;
  const estRow0 = 6 + META_KEYS.length;
  pushResult(results, wd.getCell(estRow0, metaCol2).value === '_estimates', 'xlsx',
    DATA_SHEET + ' に推定の記録があること', String(wd.getCell(estRow0, metaCol2).value));
  let estN = 0;
  for (let i = 0; i < (doc.estimates || []).length; i++) {
    if (wd.getCell(estRow0 + 2 + i, metaCol2 + 3).value === doc.estimates[i].field) estN++;
  }
  pushResult(results, estN === (doc.estimates || []).length, 'xlsx',
    '推定の記録が全件 xlsx に書かれていること',
    estN + ' / ' + (doc.estimates || []).length + ' 件');

  // _data（元 CSV の全列＋工程ID。列数は doc.headers から取る）
  const DATA_COL0 = 2;   // A 列は NETWORKDAYS 用の祝日一覧
  const hdrRow = wd.getRow(1);
  const hdr = [];
  for (let c = DATA_COL0; c <= DATA_COL0 + doc.headers.length; c++) hdr.push(hdrRow.getCell(c).value);
  pushResult(results, wd.getCell(1, 1).value === '祝日', 'xlsx',
    DATA_SHEET + ' の A 列が NETWORKDAYS 用の祝日一覧', String(wd.getCell(1, 1).value));
  pushResult(results, hdr[0] === COL.id, 'xlsx', DATA_SHEET + ' の 1 列目が 工程ID', String(hdr[0]));
  pushResult(results, hdr.slice(1).map((v) => v == null ? '' : String(v)).join(SEP) === doc.headers.join(SEP),
    'xlsx', DATA_SHEET + ' が元 CSV の見出しを列順どおり保持', (hdr.length - 1) + ' 列 / 元 ' + doc.headers.length + ' 列');
  let dataNg = 0;
  doc.processes.forEach((p, i) => {
    const row = wd.getRow(2 + i);
    if (String(row.getCell(DATA_COL0).value == null ? '' : row.getCell(DATA_COL0).value) !== p.id) { dataNg++; return; }
    const raw = doc.rows[p.index] || [];
    for (let c = 0; c < doc.headers.length; c++) {
      const got = row.getCell(DATA_COL0 + 1 + c).value;
      const gotS = got == null ? '' : (got.richText ? got.richText.map((t) => t.text).join('') : String(got));
      if (gotS !== String(raw[c] == null ? '' : raw[c])) { dataNg++; return; }
    }
  });
  pushResult(results, dataNg === 0, 'xlsx', DATA_SHEET + ' の全セルが元 CSV と等価',
    dataNg ? dataNg + ' 行が不一致' : doc.processes.length + ' 行');

  return results;
}
