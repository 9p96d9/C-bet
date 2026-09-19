/* ===== この下は自動生成（node tools/gen-headers.mjs）。手で直さない =====
 * ファイル: 00-holiday.js    読み込み順 1 / 8    172 行（この案内板を除く）
 * 役割    : 土日と日本の祝日を判定する。日付の計算はここが土台
 * 前      : なし（先頭）
 * 後      : 01-csv-model.js
 *
 * 【このファイルが他から借りている名前】
 *   なし。このファイルだけで完結する
 *
 * 【このファイルが出していて、他が使っている名前】
 *   MS_DAY→01,04,05 countNonWorking→01,04,05,07 holidayRangeWarning→03,07
 *   holidaysBetween→07 isNonWorkingDay→02,03,04,05 isPublicHoliday→03,04
 *   isWeekend→04 usingPublicHolidays→07
 *   ※ → の右は、その名前を使っているファイルの番号
 *
 * 【触ると見た目・動きが変わる値】
 *   MS_DAY=86400000 EQUINOX_VALID{…} HOLIDAY_LAW_FROM=2007
 *
 * 名前を変える・消すときは、上の「他が使っている名前」に載っている
 * ものだけ注意すればよい。載っていない名前はこのファイルの中だけの話。
 * ===== 自動生成ここまで ===================================================== */

/* ===================================================================
 * 00. 休日（非稼働日）の判定
 *
 * 【共通仕様 4 章の訂正】
 * 共通仕様 4 章は「休日 ＝ 土曜・日曜。祝日は本サンプルでは考慮しない」と
 * 書いているが、これは Sample.zip の実物と一致しない。
 *
 *   根拠1: PDF 1 頁目の灰色列は 2026/09/19〜09/23 が 5 日連続、
 *          2026/10/10〜10/12 が 3 日連続。土日だけなら 2 日ずつになる。
 *          増えているのは 9/21 敬老の日・9/22 国民の休日・9/23 秋分の日・
 *          10/12 スポーツの日。
 *   根拠2: CSV の `休日` 列（共通仕様 3.3 が「検算用」と書いている列）は、
 *          土日のみで数えると 23 件中 18 件しか合わないが、
 *          土日＋上記 4 祝日で数えると 23 件全部が一致する。
 *
 * よって プロジェクトG は日本の祝日を非稼働日として扱う。
 * ここでは「国民の祝日に関する法律」に沿って祝日を算出し、
 * CSV の `休日` 列で毎回検算する（ズレたら警告）。
 * サンプル固有の日付は埋めない（禁止事項 1）。
 *
 * 対応範囲：2007 年以降（昭和の日の新設・みどりの日の 5/4 移動以降）。
 * それ以前は規則が違うので警告を出す。
 * 2019〜2021 の特例（即位関連・五輪による移動）は法律どおり個別に持つ。
 * =================================================================== */

const MS_DAY = 86400000;
/** 春分・秋分の近似式が使える範囲 */
const EQUINOX_VALID = { from: 1980, to: 2099 };
/** 祝日の規則をこの版で正しく再現できる範囲 */
const HOLIDAY_LAW_FROM = 2007;

const utcDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const keyOf = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

/** その年・その月の n 番目の月曜 */
function nthMonday(year, month, nth) {
  const first = utcDate(year, month, 1);
  return utcDate(year, month, 1 + ((1 - first.getUTCDay() + 7) % 7) + (nth - 1) * 7);
}

/** 春分・秋分（1980–2099 で有効な近似式） */
function equinox(year, spring) {
  const base = spring ? 20.8431 : 23.2488;
  const day = Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return utcDate(year, spring ? 3 : 9, day);
}

/**
 * 指定年の祝日。Map<yyyymmdd, 名前> を返す。
 * 名前を持つのは、あとから「なぜこの日が休みなのか」を追えるようにするため。
 */
const holidayCache = new Map();
/** その年の祝日を「日付 → 祝日名」で返す。一度作ったら使い回す */
function holidaysOfYear(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const m = new Map();
  const put = (d, name) => { if (!m.has(keyOf(d))) m.set(keyOf(d), name); };

  put(utcDate(year, 1, 1), '元日');
  put(nthMonday(year, 1, 2), '成人の日');
  put(utcDate(year, 2, 11), '建国記念の日');
  // 天皇誕生日：〜2018 は 12/23、2019 は無し、2020〜 は 2/23
  if (year <= 2018) put(utcDate(year, 12, 23), '天皇誕生日');
  else if (year >= 2020) put(utcDate(year, 2, 23), '天皇誕生日');
  put(equinox(year, true), '春分の日');
  put(utcDate(year, 4, 29), '昭和の日');
  put(utcDate(year, 5, 3), '憲法記念日');
  put(utcDate(year, 5, 4), 'みどりの日');
  put(utcDate(year, 5, 5), 'こどもの日');
  // 海の日・スポーツの日・山の日：2020・2021 は五輪特別措置法で移動している
  if (year === 2020) { put(utcDate(year, 7, 23), '海の日'); put(utcDate(year, 7, 24), 'スポーツの日'); put(utcDate(year, 8, 10), '山の日'); }
  else if (year === 2021) { put(utcDate(year, 7, 22), '海の日'); put(utcDate(year, 7, 23), 'スポーツの日'); put(utcDate(year, 8, 8), '山の日'); }
  else {
    put(nthMonday(year, 7, 3), '海の日');
    if (year >= 2016) put(utcDate(year, 8, 11), '山の日');
    put(nthMonday(year, 10, 2), year >= 2020 ? 'スポーツの日' : '体育の日');
  }
  put(nthMonday(year, 9, 3), '敬老の日');
  put(equinox(year, false), '秋分の日');
  put(utcDate(year, 11, 3), '文化の日');
  put(utcDate(year, 11, 23), '勤労感謝の日');
  // 2019 の即位関連（一日限りの祝日）
  if (year === 2019) {
    put(utcDate(2019, 5, 1), '天皇の即位の日');
    put(utcDate(2019, 10, 22), '即位礼正殿の儀の行われる日');
  }

  // 振替休日：祝日が日曜なら、その後で最初の「祝日でない日」
  for (const k of Array.from(m.keys())) {
    const y = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, dd = k % 100;
    const d = utcDate(y, mo, dd);
    if (d.getUTCDay() !== 0) continue;
    let t = new Date(d.getTime() + MS_DAY);
    while (m.has(keyOf(t))) t = new Date(t.getTime() + MS_DAY);
    m.set(keyOf(t), '振替休日');
  }
  // 国民の休日：前後が祝日で、その日自身が日曜でも祝日でもない日
  const add = [];
  for (const k of Array.from(m.keys())) {
    const y = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, dd = k % 100;
    const d = utcDate(y, mo, dd);
    const mid = new Date(d.getTime() + MS_DAY);
    const next = new Date(d.getTime() + 2 * MS_DAY);
    if (m.has(keyOf(mid)) || !m.has(keyOf(next)) || mid.getUTCDay() === 0) continue;
    add.push(keyOf(mid));
  }
  for (const k of add) m.set(k, '国民の休日');

  holidayCache.set(year, m);
  return m;
}

/** 祝日なら名前、違えば null */
function holidayName(d) {
  return holidaysOfYear(d.getUTCFullYear()).get(keyOf(d)) || null;
}
/** 祝日か */
function isPublicHoliday(d) { return holidayName(d) !== null; }

/** 土曜・日曜か */
function isWeekend(d) { const w = d.getUTCDay(); return w === 0 || w === 6; }

/** 非稼働日か。プロジェクトG の「休日」。 */
let USE_PUBLIC_HOLIDAYS = true;
/** 祝日を休みに数えるかどうかを切り替える（既定は数える） */
function setUsePublicHolidays(on) { USE_PUBLIC_HOLIDAYS = !!on; }
/** 今 祝日を休みに数えているか */
function usingPublicHolidays() { return USE_PUBLIC_HOLIDAYS; }
/** 非稼働日か。土日、または（数える設定なら）祝日 */
function isNonWorkingDay(d) {
  return isWeekend(d) || (USE_PUBLIC_HOLIDAYS && isPublicHoliday(d));
}

/** 非稼働日の理由（表示・監査用） */
function nonWorkingReason(d) {
  const w = d.getUTCDay();
  if (w === 6) return '土曜';
  if (w === 0) return '日曜';
  if (USE_PUBLIC_HOLIDAYS) return holidayName(d);
  return null;
}

/** 期間内の非稼働日数（終了日を含む） */
function countNonWorking(a, b) {
  let n = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += MS_DAY) if (isNonWorkingDay(new Date(t))) n++;
  return n;
}

/** 期間内の祝日を [{date, name}] で返す（xlsx の NETWORKDAYS 用・監査用） */
function holidaysBetween(a, b) {
  const out = [];
  for (let t = a.getTime(); t <= b.getTime(); t += MS_DAY) {
    const d = new Date(t);
    const name = holidayName(d);
    if (name) out.push({ date: d, name });
  }
  return out;
}

/** 表示期間が規則の対応範囲から外れていれば理由を返す */
function holidayRangeWarning(start, end) {
  const ys = start.getUTCFullYear(), ye = end.getUTCFullYear();
  const msgs = [];
  if (ys < HOLIDAY_LAW_FROM) {
    msgs.push(`祝日の規則は ${HOLIDAY_LAW_FROM} 年以降のものです（表示期間 ${ys} 年〜）。それ以前は祝日の判定が違う可能性があります`);
  }
  if (ys < EQUINOX_VALID.from || ye > EQUINOX_VALID.to) {
    msgs.push(`春分・秋分の計算式は ${EQUINOX_VALID.from}–${EQUINOX_VALID.to} 年でのみ有効です（表示期間 ${ys}–${ye}）`);
  }
  return msgs.length ? msgs.join(' / ') : null;
}
