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
 * よって GaNett は日本の祝日を非稼働日として扱う。ここでは
 * 祝日を算出し、CSV の `休日` 列で毎回検算する（ズレたら警告）。
 * サンプル固有の日付は埋めない（禁止事項 1）。
 * =================================================================== */

const MS_DAY = 86400000;
const HOLIDAY_RULES_VALID = { from: 1980, to: 2099 }; // 春分・秋分の近似式の有効範囲

/** その年の n 番目の指定曜日（月曜 = 1） */
function nthWeekday(year, month, weekday, nth) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + shift + (nth - 1) * 7));
}

/** 春分・秋分（1980–2099 で有効な近似式） */
function equinox(year, spring) {
  const base = spring ? 20.8431 : 23.2488;
  const day = Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return new Date(Date.UTC(year, spring ? 2 : 8, day));
}

const keyOf = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

/** 指定年の祝日（振替休日・国民の休日を含む）を Set<number> で返す */
const holidayCache = new Map();
function holidaysOfYear(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const base = [
    new Date(Date.UTC(year, 0, 1)),    // 元日
    nthWeekday(year, 1, 1, 2),          // 成人の日（1月第2月曜）
    new Date(Date.UTC(year, 1, 11)),   // 建国記念の日
    new Date(Date.UTC(year, 1, 23)),   // 天皇誕生日
    equinox(year, true),                // 春分の日
    new Date(Date.UTC(year, 3, 29)),   // 昭和の日
    new Date(Date.UTC(year, 4, 3)),    // 憲法記念日
    new Date(Date.UTC(year, 4, 4)),    // みどりの日
    new Date(Date.UTC(year, 4, 5)),    // こどもの日
    nthWeekday(year, 7, 1, 3),          // 海の日（7月第3月曜）
    new Date(Date.UTC(year, 7, 11)),   // 山の日
    nthWeekday(year, 9, 1, 3),          // 敬老の日（9月第3月曜）
    equinox(year, false),               // 秋分の日
    nthWeekday(year, 10, 1, 2),         // スポーツの日（10月第2月曜）
    new Date(Date.UTC(year, 10, 3)),   // 文化の日
    new Date(Date.UTC(year, 10, 23)),  // 勤労感謝の日
  ];
  const set = new Set(base.map(keyOf));

  // 振替休日：祝日が日曜なら、その後で最初の「祝日でない日」
  for (const d of base.slice()) {
    if (d.getUTCDay() !== 0) continue;
    let t = new Date(d.getTime() + MS_DAY);
    while (set.has(keyOf(t))) t = new Date(t.getTime() + MS_DAY);
    set.add(keyOf(t));
  }
  // 国民の休日：前日と翌日がどちらも祝日で、その日自身が日曜でも祝日でもない日
  const between = [];
  for (const k of Array.from(set)) {
    const y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, dd = k % 100;
    const d = new Date(Date.UTC(y, m - 1, dd));
    const mid = new Date(d.getTime() + MS_DAY);
    const next = new Date(d.getTime() + 2 * MS_DAY);
    if (set.has(keyOf(mid))) continue;
    if (!set.has(keyOf(next))) continue;
    if (mid.getUTCDay() === 0) continue;
    between.push(keyOf(mid));
  }
  for (const k of between) set.add(k);
  holidayCache.set(year, set);
  return set;
}

/** 国民の祝日か */
function isPublicHoliday(d) {
  return holidaysOfYear(d.getUTCFullYear()).has(keyOf(d));
}

/** 土曜・日曜か */
function isWeekend(d) { const w = d.getUTCDay(); return w === 0 || w === 6; }

/**
 * 非稼働日か。GaNett の「休日」。
 * opt.holidays === false なら土日だけで判定する（逃げ道）。
 */
let USE_PUBLIC_HOLIDAYS = true;
function setUsePublicHolidays(on) { USE_PUBLIC_HOLIDAYS = !!on; }
function isNonWorkingDay(d) {
  return isWeekend(d) || (USE_PUBLIC_HOLIDAYS && isPublicHoliday(d));
}

/** 期間内の非稼働日数（終了日を含む） */
function countNonWorking(a, b) {
  let n = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += MS_DAY) if (isNonWorkingDay(new Date(t))) n++;
  return n;
}

/** 年が近似式の有効範囲外なら理由を返す */
function holidayRangeWarning(start, end) {
  const ys = start.getUTCFullYear(), ye = end.getUTCFullYear();
  if (ys < HOLIDAY_RULES_VALID.from || ye > HOLIDAY_RULES_VALID.to) {
    return `春分・秋分の計算式は ${HOLIDAY_RULES_VALID.from}–${HOLIDAY_RULES_VALID.to} 年でのみ検証済みです（表示期間 ${ys}–${ye}）`;
  }
  return null;
}
