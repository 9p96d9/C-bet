/* ===================================================================
 * 06. 画面まわり（設計B 3 章）
 * 外部通信ゼロ。fetch は使わない。
 * =================================================================== */

const $ = (sel) => document.querySelector(sel);

const state = {
  doc: null,
  rendered: null,
  svgResults: [],
  xlsxResults: [],
  buffer: null,
  start: null,
  end: null,
};

function log(kind, text) {
  const box = $('#log');
  const line = document.createElement('div');
  line.className = 'log-line log-' + kind;
  line.textContent = text;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
function clearLog() { $('#log').textContent = ''; }

function renderResults(title, results) {
  const box = $('#log');
  const h = document.createElement('div');
  const ng = results.filter((r) => !r.ok);
  h.className = 'log-head ' + (ng.length ? 'bad' : 'good');
  h.textContent = title + '：' + (results.length - ng.length) + ' / ' + results.length + ' 件 OK'
    + (ng.length ? '（NG ' + ng.length + ' 件）' : '');
  box.appendChild(h);
  const table = document.createElement('table');
  table.className = 'chk';
  for (const r of results) {
    const tr = table.insertRow();
    tr.className = r.ok ? 'ok' : 'ng';
    tr.insertCell().textContent = r.ok ? 'OK' : 'NG';
    tr.insertCell().textContent = r.scope;
    tr.insertCell().textContent = r.label;
    tr.insertCell().textContent = r.detail;
  }
  box.appendChild(table);
  box.scrollTop = box.scrollHeight;
}

function setPeriodDefaults(doc) {
  const s = $('#start'), e = $('#end');
  if (doc.meta.periodStart) { s.min = fmtIso(doc.meta.periodStart); s.value = fmtIso(doc.meta.periodStart); }
  if (doc.meta.periodEnd) { e.max = fmtIso(doc.meta.periodEnd); e.value = fmtIso(doc.meta.periodEnd); }
  if (doc.meta.periodStart) e.min = fmtIso(doc.meta.periodStart);
  if (doc.meta.periodEnd) s.max = fmtIso(doc.meta.periodEnd);
}

/** 「P0012:32, P0015:23」のような指定を { 工程ID: 行 } に直す */
function parseGateRows(text) {
  const out = {};
  for (const part of String(text || '').split(/[,、\s]+/)) {
    if (!part) continue;
    const m = /^(.+?)[:：](\d+)$/.exec(part.trim());
    if (m) out[m[1].trim()] = parseInt(m[2], 10);
  }
  return out;
}

function loadCsvText(text, name) {
  clearLog();
  state.buffer = null;
  state.rendered = null;
  state.svgResults = []; state.xlsxResults = [];
  $('#btn-xlsx').disabled = true;
  state.csvText = text; state.csvName = name;
  state.doc = buildDocument(text, name, { gateRows: parseGateRows($('#gaterows').value) });
  const d = state.doc;
  log('info', 'CSV 読み込み: ' + name);
  log('info', '  見出し ' + d.headers.length + ' 列 / 工程 ' + d.processes.length + ' 件');
  log('info', '  工程表の期間: ' + (d.meta.period || '(不明)'));
  const dist = {};
  for (const p of d.processes) dist[p.shape] = (dist[p.shape] || 0) + 1;
  log('info', '  形状分布: ' + Object.keys(dist).sort().map((k) => k + ' ' + dist[k]).join(', '));
  for (const w of d.warnings) log('warn', '警告: ' + w);
  renderEstimates(d.estimates);
  setPeriodDefaults(d);
  return d;
}

/**
 * CSV に値が無く、ツールが埋めた箇所の一覧。
 * これを見れば「どれが CSV の値で、どれが規則で埋めた値か」が分かる。
 */
const EST_LABEL = {
  rule: '推定', pdf: 'PDF実測', manual: '手入力',
};
function renderEstimates(estimates) {
  const box = $('#log');
  const h = document.createElement('div');
  const byRule = (estimates || []).filter((e) => e.source === 'rule');
  h.className = 'log-head ' + (byRule.length ? 'bad' : 'good');
  h.textContent = 'CSV に無く、ツールが埋めた箇所：' + (estimates || []).length + ' 件'
    + (byRule.length ? '（うち要確認の推定 ' + byRule.length + ' 件）' : '');
  box.appendChild(h);
  if (!estimates || !estimates.length) return;
  const table = document.createElement('table');
  table.className = 'est';
  const head = table.insertRow();
  for (const t of ['種別', '対象', '項目', '入れた値', '使った規則', 'CSV から決められない理由']) {
    const c = head.insertCell(); c.textContent = t; c.style.fontWeight = 'bold';
  }
  for (const e of estimates) {
    const tr = table.insertRow();
    tr.className = e.source;
    tr.insertCell().textContent = EST_LABEL[e.source] || e.source;
    tr.insertCell().textContent = e.scope + (e.name ? '(' + e.name + ')' : '');
    tr.insertCell().textContent = e.field;
    tr.insertCell().textContent = String(e.value);
    tr.insertCell().textContent = e.rule;
    tr.insertCell().textContent = e.reason;
  }
  box.appendChild(table);
  if (byRule.length) {
    log('warn', '※「推定」の行は CSV から決められないため見た目を近づけるために埋めた値です。'
      + 'GaNett の画面で実際の行を確認し、上の「gate 中間行の指定」で上書きできます。');
  }
  box.scrollTop = box.scrollHeight;
}

function currentPeriod() {
  const s = inputDate($('#start').value), e = inputDate($('#end').value);
  if (!s || !e) throw new Error('表示期間を YYYY-MM-DD で指定してください');
  if (e.getTime() < s.getTime()) throw new Error('表示期間: End が Start より前です');
  const m = state.doc.meta;
  if (m.periodStart && s.getTime() < m.periodStart.getTime()) {
    log('warn', '警告: Start が 工程表の期間 より前です（' + m.period + '）');
  }
  if (m.periodEnd && e.getTime() > m.periodEnd.getTime()) {
    log('warn', '警告: End が 工程表の期間 より後です（' + m.period + '）');
  }
  return { start: s, end: e };
}

function doRender() {
  if (!state.doc) { log('warn', '先に CSV を選んでください'); return null; }
  const { start, end } = currentPeriod();
  state.start = start; state.end = end;
  const opt = { DAY_W: +$('#zoom').value, ROW_H: DEFAULTS.ROW_H };

  const r = render(state.doc, start, end, opt);
  state.rendered = r;

  const plot = $('#plot');
  plot.textContent = '';
  plot.appendChild(r.svg);
  const dh = $('#datehead'); dh.textContent = ''; dh.appendChild(renderDateHeader(r.geo));
  const rh = $('#rowhead'); rh.textContent = ''; rh.appendChild(renderRowHeader(state.doc, r.geo));

  log('info', '描画: ' + fmtSlash(start) + ' 〜 ' + fmtSlash(end)
    + ' / ' + r.drawn.length + ' 件描画, ' + r.skipped.length + ' 件除外');
  for (const s of r.skipped) log('info', '  除外 ' + s.id + ': ' + s.reason);
  for (const w of Array.from(new Set(r.warnings))) log('warn', '警告: ' + w);

  // 検査（設計B 5.4）。SVG の属性値を読んで検査する。
  state.svgResults = verifySvg(state.doc, r.svg, start, end, opt);
  renderResults('SVG 検査', state.svgResults);
  const ng = state.svgResults.filter((x) => !x.ok).length;
  $('#btn-xlsx').disabled = ng > 0;
  if (ng > 0) log('bad', 'SVG 検査に NG があるため xlsx 書き出しは無効です');
  return r;
}

async function doXlsx(download) {
  if (!state.doc || !state.rendered) { log('warn', '先に描画してください'); return null; }
  const { start, end } = state;
  const built = await buildWorkbook(state.doc, start, end);
  const buf = await built.wb.xlsx.writeBuffer();
  state.buffer = buf;

  // 書き出したバッファを読み戻して検査する（設計B 5.4）
  state.xlsxResults = await verifyXlsx(buf, state.doc, start, end);
  renderResults('xlsx 検査', state.xlsxResults);
  const ng = state.xlsxResults.filter((x) => !x.ok).length;
  if (ng > 0) { log('bad', 'xlsx 検査に NG があります。ダウンロードしません'); return null; }

  const name = xlsxFileName(state.doc, start, end);
  if (download) {
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    log('good', 'xlsx を書き出しました: ' + name);
  }
  return { buffer: buf, name };
}

function wire() {
  $('#file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try { loadCsvText(String(fr.result), f.name); }
      catch (e) { clearLog(); log('bad', 'エラー: ' + e.message); }
    };
    fr.onerror = () => log('bad', 'ファイルを読めませんでした');
    fr.readAsText(f, 'utf-8');
  });
  $('#btn-render').addEventListener('click', () => {
    try { doRender(); } catch (e) { log('bad', 'エラー: ' + e.message); }
  });
  $('#btn-xlsx').addEventListener('click', async () => {
    try { await doXlsx(true); } catch (e) { log('bad', 'エラー: ' + e.message); }
  });
  $('#zoom').addEventListener('change', () => { if (state.rendered) { try { doRender(); } catch (e) { log('bad', e.message); } } });
  $('#gaterows').addEventListener('change', () => {
    if (!state.csvText) return;
    try { loadCsvText(state.csvText, state.csvName); doRender(); }
    catch (e) { log('bad', 'エラー: ' + e.message); }
  });

  // 横スクロールの同期（設計B 3 章）
  const scroller = $('#scroller');
  scroller.addEventListener('scroll', () => {
    $('#datehead').style.transform = 'translateX(' + (-scroller.scrollLeft) + 'px)';
    $('#rowhead').style.transform = 'translateY(' + (-scroller.scrollTop) + 'px)';
  });

  log('info', 'GaNett工程表ツール（往路）。CSV を選んで［描画］を押してください。');
  log('info', '休日 = 土日 ＋ 日本の祝日（PDF の灰色列と CSV の 休日 列で確認済み）。読み込み時に 休日 列で検算します。');
  log('info', 'CSV に値が無く規則で埋めた箇所は、読み込みのたびに一覧で出します。');
  log('info', 'ExcelJS ' + (window.ExcelJS ? '読み込み済み' : '未読み込み'));
}

/* 自動試験用のフック。UI を経由せずに同じ経路を叩く。 */
window.__GANETT__ = {
  loadCsvText,
  setGateRows(v) { $('#gaterows').value = v || ''; },
  estimates: () => (state.doc ? state.doc.estimates : []),
  setPeriod(s, e) { $('#start').value = s; $('#end').value = e; },
  setZoom(v) { $('#zoom').value = String(v); },
  render: doRender,
  xlsx: () => doXlsx(false),
  get state() { return state; },
  results: () => ({ svg: state.svgResults, xlsx: state.xlsxResults }),
  logText: () => $('#log').innerText,
};

document.addEventListener('DOMContentLoaded', wire);
