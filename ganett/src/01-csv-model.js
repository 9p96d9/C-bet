/* ===================================================================
 * 01. CSV パーサと Document モデル
 * 共通仕様 3 章 / 設計B 4 章・5.1
 * =================================================================== */

/** RFC 4180 パーサ。引用・埋め込み改行・二重引用符エスケープに対応。 */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // BOM 除去
  const rows = [];
  let row = [], field = '', i = 0, quoted = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { quoted = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = []; i++; continue;
    }
    if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; i++; continue; }
    field += c; i++;
  }
  if (quoted) throw new Error('CSV: 引用符が閉じていません');
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ---- 日付ユーティリティ（全て UTC 基準で日単位演算する） ---------- */
/* MS_DAY と isWeekend は 00-holiday.js にある */

/** ISO 日時から日付部分だけを取り出して UTC 深夜の Date にする。 */
function isoDateOnly(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
/** `2026/09/01` 形式 */
function slashDate(s) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
/** `<input type="date">` の `YYYY-MM-DD` */
function inputDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}
const dayDiff = (a, b) => Math.round((b.getTime() - a.getTime()) / MS_DAY);
const addDays = (d, k) => new Date(d.getTime() + k * MS_DAY);
const fmtIso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
const fmtSlash = (d) => fmtIso(d).replace(/-/g, '/');
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

/* ---- 列名（共通仕様 3.3）。列番号は一切使わない（禁止事項 5） ------ */
const COL = {
  id: '工程ID',
  lineName: '工程線名',
  shape: '工程線の形状',
  arrow: '工程線の矢印',
  dash: '実線・点線',
  weight: '工程線の太さ',
  color: '工程線の色',
  fillColor: '工程線の背景色',
  slanted: '工程線の斜行',
  startNodeId: '項目ID（開始日ノード）',
  startNodeName: '項目名（開始日ノード）',
  startRow: '開始日の行番号',
  start: '開始日',
  startNodeShape: '開始日ノード形状',
  startDeps: '開始日ノードの依存タスク（行程ID、依存関係）',
  startRelation: '開始日ノードの関係線名',
  endNodeId: '項目ID（終了日ノード）',
  endNodeName: '項目名（終了日ノード）',
  endRow: '終了日の行番号',
  end: '終了日',
  endNodeShape: '終了日ノード形状',
  endDeps: '終了日ノードの依存タスク（行程ID、依存関係）',
  endRelation: '終了日ノードの関係線名',
  midNodeId: '項目ID（中間ノード）',
  midNodeDate: '中間ノード日付',
  totalDays: '延べ日数',
  workDays: '日数',
  holidays: '休日',
  adjDays: '調整日数',
  halfDay: '0.5日',
  deleted: '工程削除',
};
/** 無いと描画できない列（設計B 5.1） */
const REQUIRED_COLS = [COL.id, COL.lineName, COL.startRow, COL.endRow, COL.start, COL.end, COL.shape];

const META_KEYS = ['projectId', 'scheduleId', 'period', 'updatedAt', 'userId', 'userName', 'version'];

function safeJson(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch (_) { return null; }
}

/** 行 1–2 = メタ、行 3 = 見出し、行 4 以降 = 工程（共通仕様 3.1） */
function buildDocument(text, sourceName) {
  const raw = parseCsv(text);
  if (raw.length < 3) throw new Error('CSV: 行が足りません（メタ 2 行＋見出し 1 行が必要）');

  const metaVals = raw[1] || [];
  const meta = {};
  META_KEYS.forEach((k, i) => { meta[k] = metaVals[i] ?? ''; });
  const pm = /^(\d{4}\/\d{2}\/\d{2})-(\d{4}\/\d{2}\/\d{2})$/.exec(String(meta.period || '').trim());
  meta.periodStart = pm ? slashDate(pm[1]) : null;
  meta.periodEnd = pm ? slashDate(pm[2]) : null;

  const headers = raw[2].slice();
  const missing = REQUIRED_COLS.filter((h) => headers.indexOf(h) < 0);
  if (missing.length) throw new Error('CSV: 必須列がありません → ' + missing.join(', '));

  const idx = new Map();
  headers.forEach((h, i) => { if (!idx.has(h)) idx.set(h, i); });
  const get = (row, name) => { const i = idx.get(name); return i == null ? '' : (row[i] ?? ''); };

  // allRows は空行も含む行 4 以降の生の行。復路が元 CSV をバイト等価で
  // 書き戻すための正本なので改変しない（共通仕様 禁止事項 6）。
  const allRows = raw.slice(3);
  const rows = [], rawIndex = [];
  allRows.forEach((r, i) => {
    if (r.some((c) => String(c).trim() !== '')) { rows.push(r); rawIndex.push(i); }
  });
  const warnings = [];
  const processes = rows.map((r, k) => {
    const nameJson = safeJson(get(r, COL.lineName));
    const nameObj = Array.isArray(nameJson) ? (nameJson[0] || {}) : (nameJson || {});
    const startRow = parseInt(get(r, COL.startRow), 10);
    const endRow = parseInt(get(r, COL.endRow), 10);
    const start = isoDateOnly(get(r, COL.start));
    const end = isoDateOnly(get(r, COL.end));
    const id = get(r, COL.id);
    const half = String(get(r, COL.halfDay) || '').trim();
    if (half) warnings.push(`${id}: 0.5日 に値「${half}」があります（未対応。日付のみ扱います）`);
    if (!start || !end) warnings.push(`${id}: 開始日／終了日が ISO 日時として読めません`);
    if (start && end && end.getTime() < start.getTime()) warnings.push(`${id}: 終了日が開始日より前です`);
    if (!Number.isFinite(startRow) || !Number.isFinite(endRow)) warnings.push(`${id}: 行番号が整数ではありません`);
    const midDate = isoDateOnly(get(r, COL.midNodeDate));
    const midId = String(get(r, COL.midNodeId) || '').trim();
    // 太さ列が空のときの既定値は PDF 実測で 1.5（共通仕様 3.3 の「2」は誤り）
    const w = parseFloat(get(r, COL.weight));
    return {
      index: k,            // rows（工程行のみ）の添字
      rawIndex: rawIndex[k], // allRows（空行込み）の添字。復路の書き戻し先
      id,
      name: String(nameObj.name ?? ''),
      // 工程線名 JSON の実物（Sample.zip）は仕様書の記述と形が違う：
      //   nameBold / showNameOnLine は真偽値、namePosition と
      //   namePositionCoefficient は {x, y} のオブジェクト、
      //   textSize は XS / S / M / L / XL、配置は namePositionWithinOptions。
      nameStyle: {
        textSize: String(nameObj.textSize || 'M').toUpperCase(),
        bold: nameObj.nameBold === true || String(nameObj.nameBold) === 'true',
        color: String(nameObj.nameColor || ''),
        show: nameObj.showNameOnLine !== false && String(nameObj.showNameOnLine) !== 'false',
        within: String(nameObj.namePositionWithinOptions || ''),
        // 単位：x は列、y は行（PDF 実測で coefficient.y = -0.1 が
        // 「文字の下端を行中心より 0.1 行上に置く」と一致した）
        coef: {
          x: Number((nameObj.namePositionCoefficient || {}).x) || 0,
          y: Number((nameObj.namePositionCoefficient || {}).y) || 0,
        },
        free: {
          x: Number((nameObj.namePosition || {}).x) || 0,
          y: Number((nameObj.namePosition || {}).y) || 0,
        },
      },
      startNode: { id: get(r, COL.startNodeId), name: get(r, COL.startNodeName), row: startRow },
      endNode: { id: get(r, COL.endNodeId), name: get(r, COL.endNodeName), row: endRow },
      start, end,
      shape: String(get(r, COL.shape) || '').trim(),
      arrow: String(get(r, COL.arrow) || '').trim(),
      dash: String(get(r, COL.dash) || '').trim(),
      weight: Number.isFinite(w) && w > 0 ? w : DEFAULT_WEIGHT,
      // 空のままにしておき、既定色（黒）は描画側で当てる
      color: String(get(r, COL.color) || '').trim(),
      fillColor: String(get(r, COL.fillColor) || '').trim(),
      slanted: String(get(r, COL.slanted) || '').trim() === 'true',
      midNode: (midId || midDate) ? { id: midId, date: midDate } : null,
      nodeShapeStart: String(get(r, COL.startNodeShape) || '').trim(),
      nodeShapeEnd: String(get(r, COL.endNodeShape) || '').trim(),
      deleted: String(get(r, COL.deleted) || '').trim() !== '',
      halfDay: half,
      deps: {
        start: safeJson(get(r, COL.startDeps)) || [],
        end: safeJson(get(r, COL.endDeps)) || [],
      },
      relation: {
        startName: String(get(r, COL.startRelation) || '').trim(),
        endName: String(get(r, COL.endRelation) || '').trim(),
      },
      derived: {
        totalDays: get(r, COL.totalDays), workDays: get(r, COL.workDays),
        holidays: get(r, COL.holidays), adjDays: get(r, COL.adjDays),
      },
    };
  });

  // gate の横線が乗る行（中間ノードの行）を解決する。
  // CSV には中間ノードの行番号が無いので、その項目IDが他工程の
  // 開始／終了ノードとして現れる場合だけ行が分かる。
  // 実測：D1・D2・D3 は解決できる（それぞれ行 25・29・24 で PDF と一致）。
  //       D4・D5 の中間ノードはどの工程にも紐づかない項目なので解決できない
  //       （PDF ではそれぞれ行 32・23）。
  const nodeRow = nodeRowIndex(processes);
  for (const p of processes) {
    if (p.shape !== 'gate') continue;
    if (p.midNode && p.midNode.id && nodeRow.has(p.midNode.id)) {
      p.gateRow = nodeRow.get(p.midNode.id);
    } else {
      p.gateRow = null;
      warnings.push(`${p.id}(${p.name}): gate の中間ノード「${(p.midNode && p.midNode.id) || '(無し)'}」の行番号が CSV から分かりません。終了行に落として描きます（GaNett 側の確認が要ります）`);
    }
  }

  // 休日 列で検算する（共通仕様 3.3「この列は検算用」）
  for (const p of processes) {
    if (!p.start || !p.end) continue;
    const csvHol = parseInt(p.derived.holidays, 10);
    if (!Number.isFinite(csvHol)) continue;
    const calc = countNonWorking(p.start, p.end);
    if (calc !== csvHol) {
      warnings.push(`${p.id}(${p.name}): 休日 の計算が CSV と合いません（CSV ${csvHol} / 計算 ${calc}）。祝日の判定を確認してください`);
    }
  }

  const seen = new Set();
  for (const p of processes) {
    if (!p.id) warnings.push('工程ID が空の行があります');
    else if (seen.has(p.id)) warnings.push(`工程ID が重複しています: ${p.id}`);
    seen.add(p.id);
  }

  return { meta, headers, rows, allRows, processes, warnings,
    sourceName: sourceName || 'input.csv', colIndex: idx };
}

/** 行番号 → その行にノードを持つ項目名（重複排除・`/` 連結。共通仕様 4 章 A 列） */
function rowHeadings(processes) {
  const map = new Map();
  const push = (row, name) => {
    if (!Number.isFinite(row)) return;
    if (!map.has(row)) map.set(row, []);
    const a = map.get(row);
    const t = String(name || '').trim();
    if (t && a.indexOf(t) < 0) a.push(t);
  };
  for (const p of processes) {
    if (p.deleted) continue;
    push(p.startNode.row, p.startNode.name);
    push(p.endNode.row, p.endNode.name);
  }
  const out = new Map();
  for (const [r, a] of map) out.set(r, a.join('/'));
  return out;
}

/** 項目ID → 行番号（crank/gate の中間ノード行の解決に使う） */
function nodeRowIndex(processes) {
  const m = new Map();
  for (const p of processes) {
    if (p.startNode.id && Number.isFinite(p.startNode.row)) m.set(p.startNode.id, p.startNode.row);
    if (p.endNode.id && Number.isFinite(p.endNode.row)) m.set(p.endNode.id, p.endNode.row);
  }
  return m;
}
