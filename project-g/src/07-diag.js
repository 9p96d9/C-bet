/* ===== この下は自動生成（node tools/gen-headers.mjs）。手で直さない =====
 * ファイル: 07-diag.js    読み込み順 7 / 8    268 行（この案内板を除く）
 * 役割    : 中身を伏せたまま原因を追える診断ログを作る
 * 前      : 05-verify.js
 * 後      : 06-ui.js
 *
 * 【このファイルが他から借りている名前】
 *   01-csv-model.js: REQUIRED_COLS fmtIso fmtSlash
 *   00-holiday.js: countNonWorking holidayRangeWarning holidaysBetween usingPublicHolidays
 *
 * 【このファイルが出していて、他が使っている名前】
 *   buildDiagnosticText→06 diagFileName→06 diagInstallErrorHooks→06
 *   diagRecordError→06
 *   ※ → の右は、その名前を使っているファイルの番号
 *
 * 【触ると見た目・動きが変わる値】
 *   DIAG_VERSION=1 DIAG_ERRORS[…]
 *
 * 名前を変える・消すときは、上の「他が使っている名前」に載っている
 * ものだけ注意すればよい。載っていない名前はこのファイルの中だけの話。
 * ===== 自動生成ここまで ===================================================== */

/* ===================================================================
 * 07. 診断ログ
 *
 * 実際の現場の工程表でうまくいかなかったとき、
 * **中身を外に出さずに**原因を追えるようにするための書き出し。
 *
 * 【入れないもの】
 *   プロジェクトID・工程表ID・ユーザー名・ファイル名の本体・
 *   工程線名・項目名・協力会社・詳細工程・タグ・工程IDと項目IDの実値。
 *   ID は P001 / N001 のような通し番号に置き換える（対応表は出さない）。
 *   名前は文字数だけを残す。
 *
 * 【入れるもの】
 *   形状・行番号・日付・色・太さ・矢印・点線・見出しの列名・件数・
 *   検査の結果（期待値と実測値の数値）・警告・推定・JS エラー・
 *   ブラウザの種類。原因を突き止めるのに要るのはこれだけ。
 *
 * 書き出す前に画面で全文を見せる。何が出ていくか隠さない。
 * =================================================================== */

const DIAG_VERSION = 1;

/* JS エラーを拾っておく（読み込みや描画が落ちたときのため） */
const DIAG_ERRORS = [];
/** 起きた例外を 1 件覚えておく（診断ログに出す） */
function diagRecordError(kind, message, stack) {
  DIAG_ERRORS.push({
    at: new Date().toISOString(), kind,
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').split('\n').slice(0, 6).join('\n').slice(0, 1200),
  });
  if (DIAG_ERRORS.length > 50) DIAG_ERRORS.shift();
}
/** window の onerror などに引っかけて、落ちても拾えるようにする */
function diagInstallErrorHooks() {
  window.addEventListener('error', (e) => {
    diagRecordError('error', e.message, e.error && e.error.stack);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason || {};
    diagRecordError('unhandledrejection', r.message || r, r.stack);
  });
}

/* ---- 伏せ字 ------------------------------------------------------ */
/** 実値 → 通し番号。対応表は書き出さない */
function makeAliaser(prefix) {
  const map = new Map();
  return (v) => {
    const k = String(v == null ? '' : v);
    if (k === '') return '';
    if (!map.has(k)) map.set(k, prefix + String(map.size + 1).padStart(3, '0'));
    return map.get(k);
  };
}
/** 文字列は「何文字あったか」だけ残す */
function shape_(s) {
  const t = String(s == null ? '' : s);
  if (t === '') return '(空)';
  return `(${t.length}文字)`;
}
/** ファイル名は拡張子だけ */
function extOnly(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? '(ファイル名).' + m[1] : '(ファイル名)';
}

/* ---- CSV の素性（解析に失敗しても取れるもの） ---------------------- */
/** CSV そのものの素性（行数・列名・改行・BOM）だけを取り出す。値は見ない */
function diagCsvFacts(text) {
  if (typeof text !== 'string') return null;
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const crlf = (body.match(/\r\n/g) || []).length;
  const lf = (body.match(/\n/g) || []).length - crlf;
  const cr = (body.match(/\r(?!\n)/g) || []).length;
  const lines = body.split(/\r\n|\n|\r/);
  return {
    バイト数: new Blob([text]).size,
    文字数: text.length,
    BOM: bom ? 'あり' : 'なし',
    改行: `CRLF ${crlf} / LF ${lf} / CR ${cr}`,
    行数: lines.length,
    引用符の数: (body.match(/"/g) || []).length,
    先頭3行の列数: lines.slice(0, 3).map((l) => (l.match(/,/g) || []).length + 1).join(' / '),
    非ASCII文字: /[^\x00-\x7F]/.test(body) ? 'あり' : 'なし',
  };
}

/* ---- 本体 -------------------------------------------------------- */
/**
 * @param {object} st  UI の state
 * @param {boolean} raw  true なら伏せ字をやめて実値を入れる（社内用）
 */
function buildDiagnosticText(st, raw) {
  const L = [];
  const put = (k, v) => L.push(`${k}\t${v}`);
  const head = (t) => { L.push(''); L.push('== ' + t + ' =='); };

  const aliasP = makeAliaser('P');
  const aliasN = makeAliaser('N');
  const pid = (v) => (raw ? v : aliasP(v));
  const nid = (v) => (raw ? v : aliasN(v));
  const nm = (v) => (raw ? v : shape_(v));

  L.push('プロジェクトG 工程表ツール 診断ログ');
  L.push(`形式 v${DIAG_VERSION}  /  書き出し ${new Date().toISOString()}`);
  L.push(raw
    ? '※ 実値そのままで書き出しています。社外に出さないでください。'
    : '※ 名前・ID・ファイル名は伏せてあります。工程表の中身は入っていません。');

  head('動かした環境');
  put('ブラウザ', navigator.userAgent);
  put('言語', navigator.language);
  put('画面', `${screen.width}x${screen.height} / 拡大 ${window.devicePixelRatio}`);
  put('開き方', location.protocol);
  put('ExcelJS', typeof ExcelJS !== 'undefined' ? '読み込み済み' : '未読み込み');

  head('読み込んだ CSV');
  put('ファイル名', raw ? (st.csvName || '(未読み込み)') : extOnly(st.csvName));
  const facts = diagCsvFacts(st.csvText);
  if (!facts) put('状態', '未読み込み');
  else for (const k in facts) put(k, facts[k]);

  const doc = st.doc;
  head('CSV の解釈');
  if (!doc) {
    put('状態', '解釈できていない（下の「エラー」を見てください）');
  } else {
    put('工程表の期間', doc.meta.period || '(空)');
    put('見出しの列数', doc.headers.length);
    put('工程の行数', doc.processes.length);
    // 見出し名は製品の書式であって現場の情報ではないので、そのまま出す
    put('見出し', doc.headers.join(' | '));
    const miss = REQUIRED_COLS.filter((h) => doc.headers.indexOf(h) < 0);
    put('足りない必須列', miss.length ? miss.join(', ') : 'なし');
    const dist = {};
    for (const p of doc.processes) dist[p.shape || '(空)'] = (dist[p.shape || '(空)'] || 0) + 1;
    put('形状の分布', Object.keys(dist).sort().map((k) => `${k} ${dist[k]}`).join(', '));
    const ts = {};
    for (const p of doc.processes) ts[p.nameStyle.textSize] = (ts[p.nameStyle.textSize] || 0) + 1;
    put('textSize の分布', Object.keys(ts).sort().map((k) => `${k} ${ts[k]}`).join(', '));
    const rows = doc.processes.flatMap((p) => [p.startNode.row, p.endNode.row]).filter(Number.isFinite);
    put('行番号の範囲', rows.length ? `${Math.min.apply(null, rows)} 〜 ${Math.max.apply(null, rows)}` : 'なし');
    const ds = doc.processes.filter((p) => p.start).map((p) => p.start.getTime());
    const de = doc.processes.filter((p) => p.end).map((p) => p.end.getTime());
    if (ds.length) put('日付の範囲', fmtSlash(new Date(Math.min.apply(null, ds)))
      + ' 〜 ' + fmtSlash(new Date(Math.max.apply(null, de))));
    put('中間ノードあり', doc.processes.filter((p) => p.midNode).length);
    put('斜行', doc.processes.filter((p) => p.slanted).length);
    put('矢印なし', doc.processes.filter((p) => p.arrow === 'none').length);
    put('点線指定', doc.processes.filter((p) => p.dash === 'dash').length);
    put('0.5日に値あり', doc.processes.filter((p) => p.halfDay).length);
    put('工程削除に値あり', doc.processes.filter((p) => p.deleted).length);
    put('関係線名あり', doc.processes.filter((p) => p.relation.startName || p.relation.endName).length);
  }

  head('表示のしかた');
  put('表示期間', st.start && st.end ? `${fmtSlash(st.start)} 〜 ${fmtSlash(st.end)}` : '(未描画)');
  put('1日の幅', st.lastZoom != null ? st.lastZoom + 'px' : '(未描画)');
  put('gate中間行の指定', st.gateRowsText ? (raw ? st.gateRowsText : `(${Object.keys(st.gateRowsParsed || {}).length} 件指定)`) : 'なし');

  head('描画の結果');
  if (!st.rendered) put('状態', '描画していない');
  else {
    put('描いた数', st.rendered.drawn.length);
    put('除外した数', st.rendered.skipped.length);
    const why = {};
    for (const s of st.rendered.skipped) why[s.reason] = (why[s.reason] || 0) + 1;
    put('除外の内訳', Object.keys(why).map((k) => `${k} ${why[k]}`).join(', ') || 'なし');
    put('SVGの大きさ', `${st.rendered.geo.width} x ${st.rendered.geo.height} px（最大行 ${st.rendered.geo.maxRow}）`);
  }

  /* 工程 1 本ずつ。名前と ID は伏せる。幾何と属性だけ残す */
  if (doc) {
    head('工程の一覧（名前と ID は伏せてあります）');
    L.push(['#', 'ID', '名前', '形状', '開始行', '終了行', '開始日', '終了日',
      '色', '太さ', '矢印', '点線', '斜行', '中間', 'gate行', 'gate行の出所'].join('\t'));
    doc.processes.forEach((p, i) => {
      L.push([
        i + 1, pid(p.id), nm(p.name), p.shape || '(空)',
        p.startNode.row, p.endNode.row,
        p.start ? fmtIso(p.start) : '(不正)', p.end ? fmtIso(p.end) : '(不正)',
        p.color || '(空)', p.weight, p.arrow || '(空)', p.dash || '(空)',
        p.slanted ? 'true' : '', p.midNode ? nid(p.midNode.id) : '',
        p.gateRow == null ? '' : p.gateRow, p.gateRowSource || '',
      ].join('\t'));
    });
  }

  head('警告');
  const warns = (doc && doc.warnings) || [];
  put('件数', warns.length);
  // 警告文には工程IDと名前が入るので、伏せ字のときは置き換える
  for (const w of warns) {
    let t = w;
    if (!raw && doc) {
      for (const p of doc.processes) {
        if (p.id) t = t.split(p.id).join(aliasP(p.id));
        if (p.name) t = t.split(p.name).join(shape_(p.name));
      }
    }
    L.push('  ' + t);
  }

  head('CSV に無く、ツールが埋めた箇所');
  const est = (doc && doc.estimates) || [];
  put('件数', `${est.length}（うち要確認の推定 ${est.filter((e) => e.source === 'rule').length}）`);
  L.push(['種別', '対象', '項目', '入れた値', '使った規則'].join('\t'));
  for (const e of est) {
    L.push([e.source, raw ? e.scope : (e.scope.indexOf('関係線:') === 0 ? '関係線' : aliasP(e.scope)),
      e.field, String(e.value), e.rule].join('\t'));
  }

  head('SVG 検査');
  const sv = st.svgResults || [];
  const svNg = sv.filter((r) => !r.ok);
  put('結果', `${sv.length - svNg.length} / ${sv.length} OK`);
  for (const r of svNg) {
    L.push('  NG\t' + (raw ? r.scope : (/^[^\/]+$/.test(r.scope) && doc && doc.processes.some((p) => p.id === r.scope) ? aliasP(r.scope) : r.scope))
      + '\t' + r.label + '\t' + r.detail);
  }

  head('xlsx 検査');
  const xr = st.xlsxResults || [];
  const xrNg = xr.filter((r) => !r.ok);
  put('結果', xr.length ? `${xr.length - xrNg.length} / ${xr.length} OK` : '(未実行)');
  for (const r of xrNg) L.push('  NG\t' + r.scope + '\t' + r.label + '\t' + r.detail);

  head('エラー');
  put('件数', DIAG_ERRORS.length);
  for (const e of DIAG_ERRORS) {
    L.push(`  [${e.at}] ${e.kind}: ${e.message}`);
    if (e.stack) for (const s of e.stack.split('\n')) L.push('      ' + s);
  }

  head('休日の判定');
  put('祝日を休日に含める', usingPublicHolidays() ? 'はい' : 'いいえ');
  if (st.start && st.end) {
    const hs = holidaysBetween(st.start, st.end);
    put('表示期間内の祝日', hs.length
      ? hs.map((h) => `${fmtIso(h.date)}(${h.name})`).join(', ') : 'なし');
    const w = holidayRangeWarning(st.start, st.end);
    if (w) put('注意', w);
  }
  if (doc) {
    const bad = [];
    for (const p of doc.processes) {
      const c = parseInt(p.derived.holidays, 10);
      if (!p.start || !p.end || !Number.isFinite(c)) continue;
      const calc = countNonWorking(p.start, p.end);
      if (calc !== c) bad.push(`${pid(p.id)} CSV=${c} 計算=${calc} (${fmtIso(p.start)}〜${fmtIso(p.end)})`);
    }
    put('休日列と食い違う工程', bad.length ? bad.length + ' 件' : 'なし');
    for (const b of bad) L.push('  ' + b);
  }

  L.push('');
  L.push('== ここまで ==');
  return L.join('\n');
}

/** 診断ログのファイル名を作る */
function diagFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `診断ログ_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.txt`;
}
