/* ===== この下は自動生成（node tools/gen-headers.mjs）。手で直さない =====
 * ファイル: 06-ui.js    読み込み順 8 / 8    455 行（この案内板を除く）
 * 役割    : ボタン・入力欄・進行状況。他の全部をここから呼ぶ
 * 前      : 07-diag.js
 * 後      : なし（末尾）
 *
 * 【このファイルが他から借りている名前】
 *   02-geometry.js: DEFAULTS
 *   07-diag.js: buildDiagnosticText diagFileName diagInstallErrorHooks diagRecordError
 *   01-csv-model.js: buildDocument fmtIso fmtSlash inputDate
 *   04-xlsx.js: buildWorkbook xlsxFileName
 *   03-render.js: el render renderDateHeader renderRowHeader
 *   05-verify.js: verifySvg verifyXlsx
 *
 * 【このファイルが出していて、他が使っている名前】
 *   なし（他から呼ばれない）
 *
 * 【触ると見た目・動きが変わる値】
 *   EST_LABEL{…}
 *
 * 名前を変える・消すときは、上の「他が使っている名前」に載っている
 * ものだけ注意すればよい。載っていない名前はこのファイルの中だけの話。
 * ===== 自動生成ここまで ===================================================== */

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
  showEst: false,
};

/**
 * 状態バー。ログは下へ流れて埋もれるので、
 * 「いま何件描けていて、検査は通っていて、要確認は何件か」だけは常に見えるようにする。
 */
function setStatus() {
  const bar = $('#status');
  bar.textContent = '';
  const pill = (cls, text, onClick, title) => {
    const e = document.createElement('span');
    e.className = 'pill ' + cls + (onClick ? ' act' : '');
    e.textContent = text;
    if (title) e.title = title;
    if (onClick) e.addEventListener('click', onClick);
    bar.appendChild(e);
    return e;
  };
  if (!state.doc) { bar.innerHTML = '<span class="st-idle">CSV を選んで［描画］を押してください</span>'; return; }

  pill('', `工程 ${state.doc.processes.length} 件`);
  if (state.rendered) {
    const sk = state.rendered.skipped.length;
    pill(sk ? 'warn' : '', `描画 ${state.rendered.drawn.length} 件` + (sk ? ` ／ 除外 ${sk}` : ''),
      null, sk ? state.rendered.skipped.map((x) => `${x.id}: ${x.reason}`).join('\n') : '');
  }
  const svgNg = state.svgResults.filter((r) => !r.ok).length;
  if (state.svgResults.length) {
    pill(svgNg ? 'bad' : 'good',
      `図の検査 ${state.svgResults.length - svgNg}/${state.svgResults.length}` + (svgNg ? ` NG ${svgNg}` : ' OK'));
  }
  const xNg = state.xlsxResults.filter((r) => !r.ok).length;
  if (state.xlsxResults.length) {
    pill(xNg ? 'bad' : 'good',
      `xlsx の検査 ${state.xlsxResults.length - xNg}/${state.xlsxResults.length}` + (xNg ? ` NG ${xNg}` : ' OK'));
  }
  const warns = state.doc.warnings.length;
  if (warns) pill('warn', `警告 ${warns} 件`, null, state.doc.warnings.join('\n'));
  const ruleEst = state.doc.estimates.filter((e) => e.source === 'rule');
  if (ruleEst.length) {
    pill('warn', `要確認の推定 ${ruleEst.length} 件 ▸`, () => setShowEstimates(true),
      '押すと図の上に出します\n' + ruleEst.map((e) => `${e.name || e.scope}: ${e.field} = ${e.value}`).join('\n'));
  } else {
    pill('good', '推定なし', null, 'すべて CSV の値か、PDF 実測の既定値です');
  }
  if (svgNg) pill('bad', 'xlsx は書き出せません', null, '図の検査に NG があるためです');
}

/** 画面下のログに 1 行出す */
function log(kind, text) {
  const box = $('#log');
  const line = document.createElement('div');
  line.className = 'log-line log-' + kind;
  line.textContent = text;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}
/** 画面下のログを空にする */
function clearLog() { $('#log').textContent = ''; }

/** 検査結果の表を組む */
function checkTable(rows) {
  const table = document.createElement('table');
  table.className = 'chk';
  for (const r of rows) {
    const tr = table.insertRow();
    tr.className = r.ok ? 'ok' : 'ng';
    tr.insertCell().textContent = r.ok ? 'OK' : 'NG';
    tr.insertCell().textContent = r.scope;
    tr.insertCell().textContent = r.label;
    tr.insertCell().textContent = r.detail;
  }
  return table;
}

/**
 * 検査結果。既定では「要約 1 行」と「NG の行」だけ出す。
 * OK の行は数が多い（工程 500 件なら 7000 行）ので、
 * 押されたときにはじめて組み立てる。DOM を無駄に膨らませない。
 */
function renderResults(title, results) {
  const box = $('#log');
  const ng = results.filter((r) => !r.ok);
  const h = document.createElement('div');
  h.className = 'log-head ' + (ng.length ? 'bad' : 'good');
  h.textContent = title + '：' + (results.length - ng.length) + ' / ' + results.length + ' 件 OK'
    + (ng.length ? '（NG ' + ng.length + ' 件）' : '');
  box.appendChild(h);

  if (ng.length) box.appendChild(checkTable(ng));   // NG は隠さない

  const okN = results.length - ng.length;
  if (okN) box.appendChild(collapsible(`OK の ${okN} 件`,
    () => checkTable(results.filter((r) => r.ok))));
  box.scrollTop = box.scrollHeight;
}

/** CSV を読んだ直後に、表示期間の初期値を工期から決める */
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

/** CSV の中身を読み込んで画面を整える（ファイル選択と検査の共通入口） */
function loadCsvText(text, name) {
  clearLog();
  state.buffer = null;
  state.rendered = null;
  state.svgResults = []; state.xlsxResults = [];
  $('#btn-xlsx').disabled = true;
  state.csvText = text; state.csvName = name;
  state.gateRowsText = $('#gaterows').value;
  state.gateRowsParsed = parseGateRows(state.gateRowsText);
  state.doc = buildDocument(text, name, { gateRows: state.gateRowsParsed });
  const d = state.doc;
  log('info', 'CSV 読み込み: ' + name);
  log('info', '  見出し ' + d.headers.length + ' 列 / 工程 ' + d.processes.length + ' 件');
  log('info', '  工程表の期間: ' + (d.meta.period || '(不明)'));
  const dist = {};
  for (const p of d.processes) dist[p.shape] = (dist[p.shape] || 0) + 1;
  log('info', '  形状分布: ' + Object.keys(dist).sort().map((k) => k + ' ' + dist[k]).join(', '));
  for (const w of d.warnings) log('warn', '警告: ' + w);
  renderEstimates(d.estimates);
  setStatus();
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
/** 推定の一覧を画面下に表として出す */
function renderEstimates(estimates) {
  const box = $('#log');
  const list = estimates || [];
  const byRule = list.filter((e) => e.source === 'rule');
  const rest = list.filter((e) => e.source !== 'rule');

  const h = document.createElement('div');
  h.className = 'log-head ' + (byRule.length ? 'bad' : 'good');
  h.textContent = 'CSV に無く、ツールが埋めた箇所：' + list.length + ' 件'
    + (byRule.length ? '（うち要確認の推定 ' + byRule.length + ' 件）' : '');
  box.appendChild(h);
  if (!list.length) return;

  const mkTable = (rows) => {
    const table = document.createElement('table');
    table.className = 'est';
    const head = table.insertRow();
    for (const t of ['種別', '対象', '項目', '入れた値', '使った規則 ／ CSV から決められない理由']) {
      const c = head.insertCell(); c.textContent = t; c.style.fontWeight = 'bold';
    }
    for (const e of rows) {
      const tr = table.insertRow();
      tr.className = e.source;
      tr.insertCell().textContent = EST_LABEL[e.source] || e.source;
      tr.insertCell().textContent = e.name || e.scope;
      tr.insertCell().textContent = e.field;
      tr.insertCell().textContent = String(e.value);
      tr.insertCell().textContent = e.rule + ' ／ ' + e.reason;
      if (e.source === 'rule') {
        tr.title = 'クリックするとその工程へ移動します';
        tr.addEventListener('click', () => revealProcess(e.scope));
      }
    }
    return table;
  };

  // 要確認の推定は必ず見せる。PDF 実測の既定値は数が多いので畳む。
  if (byRule.length) box.appendChild(mkTable(byRule));
  if (rest.length) box.appendChild(collapsible(
    `PDF 実測の既定値 ${rest.length} 件`, () => mkTable(rest)));

  if (byRule.length) {
    log('warn', '※「推定」の行は CSV から決められないため見た目を近づけて埋めた値です。'
      + '［推定を表示］を押すと、図のどこで使ったかが分かります。');
  }
  box.scrollTop = box.scrollHeight;
}

/** 「〜を見る」で開く折りたたみ。中身は開かれたときに初めて組み立てる。 */
function collapsible(label, build) {
  const box = $('#log');
  const btn = document.createElement('button');
  btn.className = 'more';
  btn.textContent = label + 'を見る';
  let el = null;
  btn.addEventListener('click', () => {
    if (!el) { el = build(); box.insertBefore(el, btn.nextSibling); }
    const open = el.style.display !== 'none';
    el.style.display = open ? 'none' : '';
    btn.textContent = label + (open ? 'を見る' : 'を隠す');
  });
  return btn;
}

/** 入力欄から今の表示期間を取り出す */
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

/** ［描画］を押したときの処理。描いてから検査まで走る */
function doRender() {
  if (!state.doc) { log('warn', '先に CSV を選んでください'); return null; }
  const { start, end } = currentPeriod();
  state.start = start; state.end = end;
  const opt = { DAY_W: +$('#zoom').value, ROW_H: DEFAULTS.ROW_H };
  state.lastZoom = opt.DAY_W;

  const r = render(state.doc, start, end, opt);
  state.rendered = r;

  const plot = $('#plot');
  plot.textContent = '';
  plot.appendChild(r.svg);
  const dh = $('#datehead'); dh.textContent = ''; dh.appendChild(renderDateHeader(r.geo));
  const rh = $('#rowhead'); rh.textContent = ''; rh.appendChild(renderRowHeader(state.doc, r.geo));

  setShowEstimates(state.showEst, false);   // 再描画しても押した状態を保つ（勝手に飛ばさない）

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
  setStatus();
  return r;
}

/** ［xlsx 書き出し］を押したときの処理。作って検査して保存する */
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
  setStatus();
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

/** ボタンと入力欄に処理を結びつける（読み込み時に 1 回だけ呼ぶ） */
function wire() {
  $('#file').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      try { loadCsvText(String(fr.result), f.name); }
      catch (e) {
        // 解釈に失敗しても診断ログは出せるよう、生のテキストは残しておく
        state.csvText = String(fr.result); state.csvName = f.name; state.doc = null;
        setStatus();
        diagRecordError('loadCsvText', e.message, e.stack);
        clearLog();
        log('bad', 'エラー: ' + e.message);
        log('info', '［診断ログを書き出す］でこの状態を書き出せます。');
      }
    };
    fr.onerror = () => log('bad', 'ファイルを読めませんでした');
    fr.readAsText(f, 'utf-8');
  });
  $('#btn-render').addEventListener('click', () => {
    try { doRender(); }
    catch (e) { diagRecordError('render', e.message, e.stack); log('bad', 'エラー: ' + e.message); }
  });
  $('#btn-xlsx').addEventListener('click', async () => {
    try { await doXlsx(true); }
    catch (e) { diagRecordError('xlsx', e.message, e.stack); log('bad', 'エラー: ' + e.message); }
  });
  $('#btn-diag').addEventListener('click', () => { try { doDiag(); } catch (e) { log('bad', 'エラー: ' + e.message); } });
  $('#btn-est').addEventListener('click', () => setShowEstimates(!state.showEst));
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

  log('info', 'プロジェクトG 工程表ツール（往路）。CSV を選んで［描画］を押してください。');
  log('info', '休日 = 土日 ＋ 日本の祝日（PDF の灰色列と CSV の 休日 列で確認済み）。読み込み時に 休日 列で検算します。');
  log('info', 'CSV に値が無く規則で埋めた箇所は、読み込みのたびに一覧で出します。');
  log('info', 'うまくいかないときは［診断ログを書き出す］。工程表の中身（名前・会社名・ID）は入りません。');
  log('info', 'ExcelJS ' + (window.ExcelJS ? '読み込み済み' : '未読み込み'));
}

/** 工程を画面の中央へスクロールして点滅させる */
function revealProcess(id) {
  const svg = $('#plot').querySelector('svg');
  if (!svg) return;
  const g = svg.querySelector('g.proc[data-pid="' + CSS.escape(id) + '"]');
  if (!g) return;
  const box = g.getBBox();
  const sc = $('#scroller');
  sc.scrollTo({
    left: Math.max(0, box.x + box.width / 2 - sc.clientWidth / 2),
    top: Math.max(0, box.y + box.height / 2 - sc.clientHeight / 2),
    behavior: 'smooth',
  });
  g.classList.remove('flash');
  void g.getBBox();               // 再生し直すための強制再計算
  g.classList.add('flash');
  setTimeout(() => g.classList.remove('flash'), 2400);
}

/**
 * ［推定を表示］。押している間だけ、規則で埋めた箇所を図の上に出す。
 * 押したときに最初の推定まで自動で送る（画面外だと押しても何も見えないため）。
 */
function setShowEstimates(on, scroll) {
  state.showEst = !!on;
  $('#btn-est').setAttribute('aria-pressed', state.showEst ? 'true' : 'false');
  $('#btn-est').textContent = state.showEst ? '推定を隠す' : '推定を表示';
  const svg = $('#plot').querySelector('svg');
  const ruleEst = ((state.doc && state.doc.estimates) || []).filter((e) => e.source === 'rule');
  const onProc = ruleEst.filter((e) => e.scope.indexOf('関係線:') !== 0);
  $('#est-legend').hidden = !state.showEst;
  if (svg) {
    // 規則で埋めた工程が無いときに全部を薄くすると、ただ見えなくなるだけ
    svg.classList.toggle('show-est', state.showEst && ruleEst.length > 0);
  }
  if (state.showEst) {
    if (!ruleEst.length) {
      log('good', '規則で埋めた箇所はありません（すべて CSV の値、または PDF 実測の既定値です）');
    } else if (scroll !== false && onProc.length) {
      revealProcess(onProc[0].scope);
      log('info', `規則で埋めた箇所 ${ruleEst.length} 件を図の上に出しました`
        + `（${onProc.map((e) => e.name || e.scope).join('・')}）。下の一覧の行をクリックすると個別に飛べます。`);
    }
  }
}

/**
 * 診断ログ。書き出す前に全文を画面に出して、
 * 何が外に出るのかを必ず見せる。
 */
function doDiag() {
  const raw = $('#diag-raw').checked;
  const text = buildDiagnosticText(state, raw);
  const box = $('#log');
  const h = document.createElement('div');
  h.className = 'log-head ' + (raw ? 'bad' : 'good');
  h.textContent = raw
    ? '診断ログ（実値のまま）― 社外に出さないでください'
    : '診断ログ ― 名前・ID・ファイル名は伏せてあります。これが全文です';
  box.appendChild(h);
  const pre = document.createElement('pre');
  pre.className = 'diag';
  pre.textContent = text;
  box.appendChild(pre);

  const name = diagFileName();
  const blob = new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  log('good', '診断ログを書き出しました: ' + name + '（' + text.length.toLocaleString() + ' 文字）');
  box.scrollTop = box.scrollHeight;
  return { name, text };
}

/* 自動試験用のフック。UI を経由せずに同じ経路を叩く。 */
window.__TOOL__ = {
  loadCsvText,
  setGateRows(v) { $('#gaterows').value = v || ''; },
  estimates: () => (state.doc ? state.doc.estimates : []),
  diag: (raw) => buildDiagnosticText(state, !!raw),
  showEstimates: setShowEstimates,
  recordError: diagRecordError,
  setPeriod(s, e) { $('#start').value = s; $('#end').value = e; },
  setZoom(v) { $('#zoom').value = String(v); },
  render: doRender,
  xlsx: () => doXlsx(false),
  get state() { return state; },
  results: () => ({ svg: state.svgResults, xlsx: state.xlsxResults }),
  logText: () => $('#log').innerText,
};

diagInstallErrorHooks();
document.addEventListener('DOMContentLoaded', wire);
