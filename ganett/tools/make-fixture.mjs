/*
 * 代替サンプル CSV 生成器
 * ------------------------------------------------------------------
 * Sample.zip（サポートルーム_サンプル工程表.csv）が本セッションに
 * 提供されなかったため、00_共通仕様 3.1〜3.4 の記述だけを根拠に
 * 「実測値」欄を全て満たす CSV を再構成する。
 *
 * これは本物のサンプルではない。工程数・形状分布・線幅分布・矢印 none
 * 件数・斜行件数・中間ノード件数・行番号範囲・工程表の期間だけが一致する。
 * 日付や色や項目名は再構成であり、PDF とは一致しない。
 *
 * ツール本体はこのファイルを一切参照しない（禁止事項 1）。
 */
import { writeFileSync } from 'node:fs';

const PERIOD = '2026/09/01-2026/11/30';

// ---- 見出し 124 列の再構成 ---------------------------------------
// 3.3 に列挙された列を全て含み、残りを詳細工程 1〜6 の下位列で埋める。
const BASE_HEADERS = [
  '工程ID', '工程線名', '工程線の形状', '工程線の矢印', '実線・点線',
  '工程線の太さ', '工程線の色', '工程線の背景色', '工程線の斜行',
  '項目ID（開始日ノード）', '項目名（開始日ノード）', '開始日の行番号', '開始日',
  '開始日ノード形状', '開始日ノードの依存タスク（行程ID、依存関係）', '開始日ノードの関係線名',
  '項目ID（終了日ノード）', '項目名（終了日ノード）', '終了日の行番号', '終了日',
  '終了日ノード形状', '終了日ノードの依存タスク（行程ID、依存関係）', '終了日ノードの関係線名',
  '項目ID（中間ノード）', '中間ノード日付',
  '延べ日数', '日数', '休日', '調整日数', '0.5日', '工程削除',
];
const DETAIL_SUFFIX = [
  'の名称', 'の協力会社', 'の人数', 'の台数', 'の開始日', 'の終了日', 'の延べ日数',
  'の日数', 'の休日', 'の色', 'の背景色', 'の形状', 'の矢印', 'の備考', 'の表示',
];
const HEADERS = [...BASE_HEADERS];
for (let i = 1; i <= 6; i++) for (const s of DETAIL_SUFFIX) HEADERS.push(`詳細工程${i}${s}`);
HEADERS.push('備考', '作成日時', '更新日時');
if (HEADERS.length !== 124) throw new Error(`見出しが 124 列でない: ${HEADERS.length}`);

// ---- 工程定義 -----------------------------------------------------
// [name, shape, startNode, startRow, endNode, endRow, start, end, opts]
const P = (name, shape, sn, sr, en, er, start, end, opts = {}) =>
  ({ name, shape, sn, sr, en, er, start, end, ...opts });

const PROCS = [
  // A 系：yElbow ×3（ノード数珠つなぎ）
  P('A1', 'yElbow', 'nA0', 9, 'nA1', 7, '2026-09-01', '2026-09-08', { color: '#1f77b4', textSize: 'L', rel0: '関係１' }),
  P('A2', 'yElbow', 'nA1', 7, 'nA2', 5, '2026-09-09', '2026-09-17', { color: '#1f77b4' }),
  P('A3', 'yElbow', 'nA2', 5, 'nA3', 6, '2026-09-18', '2026-09-25', { color: '#1f77b4', dep0: [{ id: 'P0002', dependency: 'FS' }] }),
  // B 系：xElbow ×3（B2 は斜行）
  P('B1', 'xElbow', 'nB0', 13, 'nB1', 11, '2026-09-02', '2026-09-10', { color: '#d62728', rel0: '関係１' }),
  P('B2', 'xElbow', 'nB1', 11, 'nB2', 15, '2026-09-11', '2026-09-21', { color: '#d62728', slanted: 'true' }),
  P('B3', 'xElbow', 'nB2', 15, 'nB3', 12, '2026-09-22', '2026-10-02', { color: '#d62728' }),
  // C 系：crank ×3（C3 は斜行かつ矢印なし）
  P('C1', 'crank', 'nC0', 21, 'nC1', 17, '2026-09-03', '2026-09-16', { color: '#2ca02c', weight: '2.5', mid: ['nC9', '2026-09-09'] }),
  P('C2', 'crank', 'nC1', 17, 'nC2', 23, '2026-09-17', '2026-09-29', { color: '#2ca02c', mid: ['nC8', '2026-09-23'] }),
  P('C3', 'crank', 'nC2', 23, 'nC3', 19, '2026-09-30', '2026-10-08', { color: '#2ca02c', slanted: 'true', arrow: 'none' }),
  // D 系：gate ×5（D5 は矢印なし）
  P('D1', 'gate', 'nD0', 27, 'nD1', 25, '2026-09-01', '2026-09-07', { color: '#9467bd', mid: ['nD9', '2026-09-04'] }),
  P('D2', 'gate', 'nD1', 25, 'nD2', 29, '2026-09-08', '2026-09-15', { color: '#9467bd' }),
  P('D3', 'gate', 'nD2', 29, 'nD3', 26, '2026-09-16', '2026-09-24', { color: '#9467bd' }),
  P('D4', 'gate', 'nD3', 26, 'nD4', 31, '2026-09-25', '2026-10-05', { color: '#9467bd', mid: ['nD8', '2026-09-30'] }),
  P('D5', 'gate', 'nD4', 31, 'nD5', 28, '2026-10-06', '2026-10-15', { color: '#9467bd', arrow: 'none', mid: ['nD7', '2026-10-10'] }),
  // E 系：straight ×3（E1 は同行、E2/E3 は行違い＝斜線）
  P('E1', 'straight', 'nE0', 35, 'nE1', 35, '2026-09-04', '2026-09-14', { color: '#ff7f0e', weight: '1' }),
  P('E2', 'straight', 'nE1', 35, 'nE2', 33, '2026-09-15', '2026-09-23', { color: '#ff7f0e' }),
  P('E3', 'straight', 'nE2', 33, 'nE3', 37, '2026-09-24', '2026-10-06', { color: '#ff7f0e' }),
  // バー系：box S/M/L ×各1、barAutoAdjust ×2、barProcessNameAdjust ×1
  P('バー1', 'boxS', 'nF1', 40, 'nF1e', 40, '2026-09-05', '2026-09-18', { color: '#8c564b', fill: '#f2e3df', textSize: 'S' }),
  P('バー2', 'boxM', 'nF2', 41, 'nF2e', 41, '2026-09-07', '2026-09-24', { color: '#8c564b', fill: '#f2e3df', weight: '2.5', textSize: 'M' }),
  P('バー3', 'boxL', 'nF3', 42, 'nF3e', 42, '2026-09-10', '2026-10-01', { color: '#8c564b', fill: '#f2e3df', textSize: 'L' }),
  P('バー4', 'barAutoAdjust', 'nF4', 43, 'nF4e', 43, '2026-09-06', '2026-09-20', { color: '#17becf', fill: '#17becf', ns: 'none', ne: 'none' }),
  P('バー5', 'barAutoAdjust', 'nF5', 44, 'nF5e', 44, '2026-09-21', '2026-10-09', { color: '#17becf', fill: '#7fdbe7', ns: 'none', ne: 'none' }),
  P('バー6', 'barProcessNameAdjust', 'nF6', 46, 'nF6e', 46, '2026-09-12', '2026-10-03', { color: '#e377c2', ns: 'none', ne: 'none' }),
];

// ---- 派生値 -------------------------------------------------------
const DAY = 86400000;
const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
function derive(startIso, endIso) {
  const a = utc(startIso), b = utc(endIso);
  const total = Math.round((b - a) / DAY) + 1;
  let holiday = 0;
  for (let t = a; t <= b; t += DAY) { const w = new Date(t).getUTCDay(); if (w === 0 || w === 6) holiday++; }
  return { total, holiday, work: total - holiday };
}

const NAME_KEYS = ['id', 'name', 'nameAlignment', 'nameBold', 'nameColor', 'namePosition',
  'namePositionCoefficient', 'namePositionWithinOptions', 'nameWritingMode',
  'showContentsDaysWithLineBreak', 'showLeaderLine', 'showNameOnLine',
  'showTotalDays', 'showWorkingDays', 'textSize'];

function lineNameJson(p, pid) {
  const o = {
    id: `L${pid.slice(1)}`, name: p.name, nameAlignment: 'center', nameBold: p.bold || '',
    nameColor: p.nameColor || '', namePosition: 'top', namePositionCoefficient: '0',
    namePositionWithinOptions: '', nameWritingMode: 'horizontal-tb',
    showContentsDaysWithLineBreak: 'false', showLeaderLine: 'false', showNameOnLine: 'true',
    showTotalDays: 'false', showWorkingDays: 'false', textSize: p.textSize || 'M',
  };
  // キー順を 3.3 の列挙どおりに固定
  const ordered = {};
  for (const k of NAME_KEYS) ordered[k] = o[k];
  return JSON.stringify([ordered]);
}

// ---- CSV 直列化（RFC 4180） ---------------------------------------
const q = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const line = (arr) => arr.map(q).join(',');

const out = [];
out.push(line(['プロジェクトID', '工程表ID', '工程表の期間', '工程表の最終更新日',
  '最終更新ユーザーID', '最終更新ユーザー名', '工程表の最終更新バージョン']));
out.push(line(['PRJ-0001', 'SCH-0001', PERIOD, '2026-08-28T10:24:11+09:00',
  'U-0001', '監督 太郎', '12']));
out.push(line(HEADERS));

PROCS.forEach((p, i) => {
  const pid = `P${String(i + 1).padStart(4, '0')}`;
  const d = derive(p.start, p.end);
  const cells = new Map();
  cells.set('工程ID', pid);
  cells.set('工程線名', lineNameJson(p, pid));
  cells.set('工程線の形状', p.shape);
  cells.set('工程線の矢印', p.arrow || 'arrow');
  cells.set('実線・点線', p.dash || '');
  cells.set('工程線の太さ', p.weight || '');
  cells.set('工程線の色', p.color || '');
  cells.set('工程線の背景色', p.fill || '');
  cells.set('工程線の斜行', p.slanted || '');
  cells.set('項目ID（開始日ノード）', p.sn);
  cells.set('項目名（開始日ノード）', p.snName ?? `項目${p.sr}`);
  cells.set('開始日の行番号', String(p.sr));
  cells.set('開始日', `${p.start}T00:00:00+09:00`);
  cells.set('開始日ノード形状', p.ns || '');
  cells.set('開始日ノードの依存タスク（行程ID、依存関係）', p.dep0 ? JSON.stringify(p.dep0) : '');
  cells.set('開始日ノードの関係線名', p.rel0 || '');
  cells.set('項目ID（終了日ノード）', p.en);
  cells.set('項目名（終了日ノード）', p.enName ?? `項目${p.er}`);
  cells.set('終了日の行番号', String(p.er));
  cells.set('終了日', `${p.end}T23:59:59+09:00`);
  cells.set('終了日ノード形状', p.ne || '');
  cells.set('終了日ノードの依存タスク（行程ID、依存関係）', p.dep1 ? JSON.stringify(p.dep1) : '');
  cells.set('終了日ノードの関係線名', p.rel1 || '');
  cells.set('項目ID（中間ノード）', p.mid ? p.mid[0] : '');
  cells.set('中間ノード日付', p.mid ? `${p.mid[1]}T00:00:00+09:00` : '');
  cells.set('延べ日数', String(d.total));
  cells.set('日数', String(d.work));
  cells.set('休日', String(d.holiday));
  cells.set('調整日数', '0');
  cells.set('0.5日', '');
  cells.set('工程削除', '');
  out.push(line(HEADERS.map((h) => cells.get(h) ?? '')));
});

// BOM 付き UTF-8 / CRLF（3.1）
const csv = '﻿' + out.join('\r\n') + '\r\n';
const path = new URL('../fixtures/代替サンプル工程表.csv', import.meta.url);
writeFileSync(path, csv, 'utf8');

// ---- 3.4 実測値の自己検証 ------------------------------------------
const dist = {};
for (const p of PROCS) dist[p.shape] = (dist[p.shape] || 0) + 1;
const rows = PROCS.flatMap((p) => [p.sr, p.er]);
const checks = [
  ['工程数 23', PROCS.length === 23],
  ['yElbow 3', dist.yElbow === 3], ['gate 5', dist.gate === 5], ['straight 3', dist.straight === 3],
  ['boxM 1', dist.boxM === 1], ['boxL 1', dist.boxL === 1], ['boxS 1', dist.boxS === 1],
  ['barAutoAdjust 2', dist.barAutoAdjust === 2], ['barProcessNameAdjust 1', dist.barProcessNameAdjust === 1],
  ['crank 3', dist.crank === 3], ['xElbow 3', dist.xElbow === 3],
  ['線幅 既定20', PROCS.filter((p) => !p.weight).length === 20],
  ['線幅 2.5 が2件', PROCS.filter((p) => p.weight === '2.5').length === 2],
  ['線幅 1 が1件', PROCS.filter((p) => p.weight === '1').length === 1],
  ['矢印 none 2件', PROCS.filter((p) => p.arrow === 'none').length === 2],
  ['斜行 true 2件', PROCS.filter((p) => p.slanted === 'true').length === 2],
  ['中間ノード 5件', PROCS.filter((p) => p.mid).length === 5],
  ['中間ノードは全て gate/crank', PROCS.filter((p) => p.mid).every((p) => p.shape === 'gate' || p.shape === 'crank')],
  ['行番号範囲 5〜46', Math.min(...rows) === 5 && Math.max(...rows) === 46],
  ['見出し 124 列', HEADERS.length === 124],
];
let ng = 0;
for (const [label, ok] of checks) { if (!ok) ng++; console.log(`${ok ? 'OK  ' : 'NG  '}${label}`); }
console.log(ng === 0 ? '\n3.4 実測値 全件一致' : `\n${ng} 件 不一致`);
if (ng) process.exit(1);
