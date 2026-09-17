/* ===================================================================
 * 04. xlsx 書き出し（業者用）
 * 設計B 5.3 / 共通仕様 4 章・6 章・7 章
 *
 * 【仕様の矛盾についての判断】
 * 共通仕様 4 章「xlsx での配置」は "B 列以降が日付列 / 行 r+3 が GaNett 行 r"
 * と書いているが、設計B 5.3 は T10_Layout に
 * 「行見出し／名前／開始日／終了日／日数／日付列」を持たせ、
 * 条件付き書式を =AND(F$2>=$C5, F$2<=$D5) と明示している。
 * 後者は C=開始日・D=終了日・F=最初の日付列・データ開始行 5 を意味し、
 * 前者と両立しない。
 * さらに GaNett は 1 工程が 2 行にまたがるネットワークなので、
 * 「行 = GaNett 行番号」にすると同じ開始行を持つ 2 工程
 * （本ツールでは E1/E2 が該当）が 1 行に重なり C/D を持てない。
 * 復路の突き合わせキーが工程ID である以上、
 * **1 行 1 工程**でなければ C/D は定義できない。
 * よってここでは設計B 5.3 の列レターに従った。共通仕様 4 章は要修正。
 * =================================================================== */

const LAYOUT_SHEET = 'T10_Layout';
const DATA_SHEET = '_data';
const HELP_SHEET = '使い方';

const COL_HEAD = 1;   // A 行見出し
const COL_NAME = 2;   // B 工程線名
const COL_START = 3;  // C 開始日
const COL_END = 4;    // D 終了日
const COL_DAYS = 5;   // E 日数
const COL_DATE0 = 6;  // F 最初の日付列（＝表示期間の Start）
const ROW_MONTH = 1, ROW_DAY = 2, ROW_WEEK = 3, ROW_LABEL = 4, ROW_DATA0 = 5;

const argb = (hex, fallback) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  return 'FF' + (m ? m[1].toUpperCase() : fallback);
};
const solid = (hex, fallback) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex, fallback) } });

/** 表示対象の工程（削除済み・期間外を除く）。描画と同じ条件で選ぶ。 */
function visibleProcesses(doc, start, end) {
  return doc.processes.filter((p) => !p.deleted && p.start && p.end
    && Number.isFinite(p.startNode.row) && Number.isFinite(p.endNode.row)
    && p.end.getTime() >= start.getTime() && p.start.getTime() <= end.getTime());
}

function workingDays(a, b) {
  let n = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += MS_DAY) if (!isWeekend(new Date(t))) n++;
  return n;
}

async function buildWorkbook(doc, start, end) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GaNett工程表ツール';
  wb.created = new Date();

  const days = dayDiff(start, end) + 1;
  const lastCol = COL_DATE0 + days - 1;
  const procs = visibleProcesses(doc, start, end);
  const heads = rowHeadings(doc.processes);

  /* ---------------- T10_Layout ---------------- */
  const ws = wb.addWorksheet(LAYOUT_SHEET, {
    views: [{ state: 'frozen', xSplit: COL_DATE0 - 1, ySplit: ROW_LABEL }],
  });
  ws.getColumn(COL_HEAD).width = 16;
  ws.getColumn(COL_NAME).width = 16;
  ws.getColumn(COL_START).width = 12;
  ws.getColumn(COL_END).width = 12;
  ws.getColumn(COL_DAYS).width = 7;
  for (let c = COL_DATE0; c <= lastCol; c++) ws.getColumn(c).width = 3.2;

  // 行 1：月見出し（同じ月の日付列を結合）
  let runStart = COL_DATE0, runMonth = null;
  const flushMonth = (endCol) => {
    if (runMonth == null) return;
    const cell = ws.getCell(ROW_MONTH, runStart);
    cell.value = `${runMonth}月`;
    cell.alignment = { horizontal: 'center' };
    cell.font = { bold: true };
    if (endCol > runStart) ws.mergeCells(ROW_MONTH, runStart, ROW_MONTH, endCol);
  };
  for (let n = 0; n < days; n++) {
    const d = addDays(start, n), c = COL_DATE0 + n, m = d.getUTCMonth() + 1;
    if (runMonth === null) { runMonth = m; runStart = c; }
    else if (m !== runMonth) { flushMonth(c - 1); runMonth = m; runStart = c; }
  }
  flushMonth(lastCol);

  // 行 2：日（実日付を numFmt 'd' で見せる。条件付き書式が F$2 を数値比較するため）
  // 行 3：曜日
  for (let n = 0; n < days; n++) {
    const d = addDays(start, n), c = COL_DATE0 + n;
    const dayCell = ws.getCell(ROW_DAY, c);
    dayCell.value = d; dayCell.numFmt = 'd'; dayCell.alignment = { horizontal: 'center' };
    const wkCell = ws.getCell(ROW_WEEK, c);
    wkCell.value = d; wkCell.numFmt = 'aaa'; wkCell.alignment = { horizontal: 'center' };
    if (isWeekend(d)) { dayCell.fill = solid('#E8E8E8'); wkCell.fill = solid('#E8E8E8'); }
  }

  // 行 4：列見出し
  const labels = [[COL_HEAD, '項目'], [COL_NAME, '工程線名'], [COL_START, '開始日'], [COL_END, '終了日'], [COL_DAYS, '日数']];
  for (const [c, t] of labels) {
    const cell = ws.getCell(ROW_LABEL, c);
    cell.value = t; cell.font = { bold: true }; cell.fill = solid('#F0F0F0');
    cell.border = { bottom: { style: 'thin' } };
  }

  // 行 5 以降：1 行 1 工程
  procs.forEach((p, i) => {
    const r = ROW_DATA0 + i;
    const h = [heads.get(p.startNode.row), heads.get(p.endNode.row)].filter(Boolean);
    ws.getCell(r, COL_HEAD).value = Array.from(new Set(h)).join('/');
    ws.getCell(r, COL_NAME).value = p.name;
    const cs = ws.getCell(r, COL_START);
    cs.value = p.start; cs.numFmt = 'yyyy/mm/dd';
    const ce = ws.getCell(r, COL_END);
    ce.value = p.end; ce.numFmt = 'yyyy/mm/dd';
    ws.getCell(r, COL_DAYS).value = { formula: `NETWORKDAYS(C${r},D${r})`, result: workingDays(p.start, p.end) };

    // 業者が編集してよいのは開始日・終了日だけ（共通仕様 7 章）
    cs.protection = { locked: false };
    ce.protection = { locked: false };
    const dv = {
      type: 'date', operator: 'between', allowBlank: false, showErrorMessage: true,
      formulae: [doc.meta.periodStart || start, doc.meta.periodEnd || end],
      errorTitle: '日付の範囲外',
      error: `工程表の期間（${fmtSlash(doc.meta.periodStart || start)}〜${fmtSlash(doc.meta.periodEnd || end)}）内の日付を入れてください`,
    };
    cs.dataValidation = dv; ce.dataValidation = dv;

    // 土日列の薄灰（条件付き書式のバー塗りが優先される）
    for (let n = 0; n < days; n++) {
      if (isWeekend(addDays(start, n))) ws.getCell(r, COL_DATE0 + n).fill = solid('#E8E8E8');
    }

    // バーは条件付き書式で描く（禁止事項 2：Shape で描かない）
    const f = ws.getColumn(COL_DATE0).letter, l = ws.getColumn(lastCol).letter;
    ws.addConditionalFormatting({
      ref: `${f}${r}:${l}${r}`,
      rules: [{
        type: 'expression', priority: 1,
        formulae: [`AND(${f}$${ROW_DAY}>=$C${r},${f}$${ROW_DAY}<=$D${r})`],
        style: { fill: solid(p.color, '333333') },
      }],
    });
  });

  await ws.protect('', {
    selectLockedCells: true, selectUnlockedCells: true,
    formatCells: false, formatColumns: false, formatRows: false,
    insertRows: false, insertColumns: false, deleteRows: false, deleteColumns: false,
    sort: false, autoFilter: false,
  });

  /* ------- _data（元 CSV の全列＋工程ID。非表示）-------
     列数は固定と仮定しない。doc.headers の長さをそのまま使う。 */
  const wd = wb.addWorksheet(DATA_SHEET);
  wd.state = 'hidden';
  wd.addRow(['工程ID', ...doc.headers]);
  const idCol = doc.colIndex.get(COL.id);
  for (const p of doc.processes) {
    const raw = doc.rows[p.index] || [];
    wd.addRow([raw[idCol] ?? p.id, ...doc.headers.map((_, i) => raw[i] ?? '')]);
  }
  // 復路の構造検査に必要なメタを別領域に置く
  const metaCol = doc.headers.length + 3;
  wd.getCell(1, metaCol).value = '_meta';
  META_KEYS.forEach((k, i) => {
    wd.getCell(2 + i, metaCol).value = k;
    wd.getCell(2 + i, metaCol + 1).value = String(doc.meta[k] ?? '');
  });
  wd.getCell(2 + META_KEYS.length, metaCol).value = 'displayStart';
  wd.getCell(2 + META_KEYS.length, metaCol + 1).value = fmtSlash(start);
  wd.getCell(3 + META_KEYS.length, metaCol).value = 'displayEnd';
  wd.getCell(3 + META_KEYS.length, metaCol + 1).value = fmtSlash(end);
  wd.getCell(4 + META_KEYS.length, metaCol).value = 'sourceName';
  wd.getCell(4 + META_KEYS.length, metaCol + 1).value = doc.sourceName;

  /* ---------------- 使い方 ---------------- */
  const wh = wb.addWorksheet(HELP_SHEET);
  wh.getColumn(1).width = 100;
  const lines = [
    'この工程表の直しかた',
    '',
    `1. シート「${LAYOUT_SHEET}」を開きます。`,
    '2. 直せるのは C 列「開始日」と D 列「終了日」だけです。ほかのセルは保護されていて編集できません。',
    `3. 日付は 工程表の期間（${fmtSlash(doc.meta.periodStart || start)} 〜 ${fmtSlash(doc.meta.periodEnd || end)}）の中で入れてください。`,
    '4. 終了日はその日を含みます（終了日当日まで作業する、という意味です）。',
    '5. 色の帯は C・D の日付から自動で引き直されます。帯を直接ぬる必要はありません。',
    '6. 行の追加・削除、並べ替え、シート名の変更はしないでください。取り込みができなくなります。',
    '7. 直し終えたら、このファイルをそのまま返送してください。',
    '',
    '※ E 列「日数」は土日を除いた日数の目安です（NETWORKDAYS）。祝日は考慮していません。',
    `※ シート「${DATA_SHEET}」は取り込み用の控えです。非表示のままにしてください。`,
  ];
  lines.forEach((t, i) => {
    const c = wh.getCell(i + 1, 1);
    c.value = t;
    if (i === 0) c.font = { bold: true, size: 14 };
  });

  return { wb, procs, days, lastCol, start, end };
}

function xlsxFileName(doc, start, end) {
  const base = String(doc.sourceName || 'input').replace(/\.[^.]*$/, '');
  return `${base}_${fmtSlash(start).replace(/\//g, '')}-${fmtSlash(end).replace(/\//g, '')}.xlsx`;
}
