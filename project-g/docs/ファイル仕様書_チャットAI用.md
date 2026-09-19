# ファイル仕様書（チャット AI に渡す用）

自動生成：`node tools/build-spec.mjs`　／　生成日 2026-09-19

この文書は **手で書いていません**。`src/*.js` の中身から機械的に作っています。
コードを直したら作り直してください。直さずに書き換えると、コードとズレます。

---

## 0. まず読む：このツールの構造

納品する `プロジェクトG_工程表ツール.html` は 1 枚の HTML ですが、
中身は **8 つの JS ファイルを順番に連結しただけ** です。
8 つは `<script>` 1 つの中に並ぶので、**全部が同じスコープを共有**します。
`import` も `export` もありません。前のファイルで作った名前を、後のファイルがそのまま使います。

```
 1. 00-holiday.js
 2. 01-csv-model.js
 3. 02-geometry.js
 4. 03-render.js
 5. 04-xlsx.js
 6. 05-verify.js
 7. 07-diag.js
 8. 06-ui.js
```

### チャット AI に 1 ファイルだけ渡すときの言い方

```
これは 1 枚の HTML に連結される JS の一部です。
import/export はありません。ファイルの先頭にある「自動生成」の枠に、
このファイルが他から借りている名前と、他に使われている名前が書いてあります。
・借りている名前は「すでに存在する」ものとして扱ってください（定義し直さないでください）。
・他に使われている名前は、名前も引数も変えないでください。
・新しい外部ライブラリ、fetch、import、URL は使えません（オフラインで動く必要があります）。
・ES モジュール構文（import/export）は使えません。
直してほしいのは次のところです：（ここに用件）
```

### 直したあと

1. `tools/開発用.html` をブラウザで開く（`src/` を直接読みます。組み立て不要）
2. CSV を読ませて［描画］→［xlsx 書き出し］まで通ることを見る
3. 画面下のログに **NG が 1 つも無い**ことを見る（機械検査が自動で走ります）
4. `tools/組み立て.html` で 1 枚の HTML に戻す

---

## 1. どこを触ればいいか（困りごと → 場所）

| やりたいこと | ファイル | 名前 |
| --- | --- | --- |
| 日付の列の幅を変えたい | `02-geometry.js` | `DEFAULTS` |
| 1 行の高さを変えたい | `02-geometry.js` | `DEFAULTS` |
| 図形の高さ（バー１〜６の太さ）を変えたい | `02-geometry.js` | `H_RATIO` |
| 折れ角の丸みを変えたい | `02-geometry.js` | `CORNER_R_PT` |
| 斜めの線の寝かせ方を変えたい | `02-geometry.js` | `SLANT_COLS` |
| 工程線名の文字の大きさを変えたい | `02-geometry.js` | `TEXT_RATIO` |
| 形状の種類を足したい（新しい折れ方） | `02-geometry.js` | `SHAPE_RULES` / `SHAPE_KIND` / `shapeOf` |
| 工程線の色や太さの既定値を変えたい | `01-csv-model.js` | `DEFAULT_LINE_COLOR` / `DEFAULT_WEIGHT` |
| gate の中間ノードの行の決め方を変えたい | `01-csv-model.js` | `gateRowByRule` / `GATE_RULE_TEXT` |
| CSV の列名が違う工程表に対応したい | `01-csv-model.js` | `COL` / `REQUIRED_COLS` |
| 祝日の扱いを変えたい（会社の休みを足すなど） | `00-holiday.js` | `isNonWorkingDay` / `isPublicHoliday` |
| 休日の色（灰色）を変えたい | `03-render.js` | `HOLIDAY_FILL` |
| 格子の線の色を変えたい | `03-render.js` | `GRID_COLOR` |
| ノードの丸の大きさを変えたい | `03-render.js` | `NODE_R` |
| 矢印の形を変えたい | `03-render.js` | `markerId` / `render` |
| xlsx の列の並びを変えたい | `04-xlsx.js` | `buildWorkbook` |
| xlsx の条件付き書式を変えたい | `04-xlsx.js` | `buildWorkbook` |
| 検査の項目を足したい | `05-verify.js` | `verifySvg` / `verifyXlsx` |
| 診断ログに入れる／入れない物を変えたい | `07-diag.js` | `buildDiagnosticText` |
| ボタンや入力欄を足したい | `06-ui.js` | shell.html も直す |
| 画面の色や字の大きさを変えたい | `src/shell.html` | <style> の中 |

---

## 2. 一覧

| # | ファイル | 行 | 役割 | 借りる | 使われる |
| --- | --- | --- | --- | --- | --- |
| 1 | `00-holiday.js` | 195 | 土日と日本の祝日を判定する | — | 01 02 03 04 05 07 |
| 2 | `01-csv-model.js` | 448 | CSV を読んで Document（工程の配列）にする。CSV に無い値の穴埋めもここ | 00 | 02 03 04 05 07 06 |
| 3 | `02-geometry.js` | 264 | 日付と行番号を px 座標に直し、形状ごとの折れ方を決める | 01 00 | 03 05 06 |
| 4 | `03-render.js` | 406 | 02 の座標を SVG の要素に変換して画面に出す | 01 02 00 | 06 |
| 5 | `04-xlsx.js` | 275 | Document から xlsx を組み立てる | 01 00 | 05 06 |
| 6 | `05-verify.js` | 392 | 描いた SVG と書いた xlsx を読み戻して検査する | 01 04 02 00 | 06 |
| 7 | `07-diag.js` | 291 | 中身を伏せたまま原因を追える診断ログを作る | 01 00 | 06 |
| 8 | `06-ui.js` | 480 | ボタン・入力欄・進行状況。他の全部をここから呼ぶ | 02 07 01 04 03 05 | — |

「借りる」「使われる」はファイル名の先頭 2 桁です。

---

## 3.1 `00-holiday.js`

**役割**　土日と日本の祝日を判定する

**読み込み順**　1 / 8　（195 行 / 6,631 文字）

**このファイルが他から借りている名前**

なし。このファイルだけで完結します。

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `MS_DAY` | `01-csv-model.js` `04-xlsx.js` `05-verify.js` |
| `countNonWorking` | `01-csv-model.js` `04-xlsx.js` `05-verify.js` `07-diag.js` |
| `holidayRangeWarning` | `03-render.js` `07-diag.js` |
| `holidaysBetween` | `07-diag.js` |
| `isNonWorkingDay` | `02-geometry.js` `03-render.js` `04-xlsx.js` `05-verify.js` |
| `isPublicHoliday` | `03-render.js` `04-xlsx.js` |
| `isWeekend` | `04-xlsx.js` |
| `usingPublicHolidays` | `07-diag.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`EQUINOX_VALID` 、 `HOLIDAY_LAW_FROM` 、 `USE_PUBLIC_HOLIDAYS` 、 `equinox` 、 `holidayCache` 、 `holidayName` 、 `holidaysOfYear` 、 `keyOf` 、 `nonWorkingReason` 、 `nthMonday` 、 `setUsePublicHolidays` 、 `utcDate`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `nthMonday(year, month, nth)` 内 | その年・その月の n 番目の月曜 | 58 |
| `equinox(year, spring)` 内 | 春分・秋分（1980–2099 で有効な近似式） | 64 |
| `holidaysOfYear(year)` 内 | その年の祝日を「日付 → 祝日名」で返す。一度作ったら使い回す | 76 |
| `holidayName(d)` 内 | 祝日なら名前、違えば null | 136 |
| `isPublicHoliday(d)` 外 | 祝日か | 140 |
| `isWeekend(d)` 外 | 土曜・日曜か | 143 |
| `setUsePublicHolidays(on)` 内 | 祝日を休みに数えるかどうかを切り替える（既定は数える） | 148 |
| `usingPublicHolidays()` 外 | 今 祝日を休みに数えているか | 150 |
| `isNonWorkingDay(d)` 外 | 非稼働日か。土日、または（数える設定なら）祝日 | 152 |
| `nonWorkingReason(d)` 内 | 非稼働日の理由（表示・監査用） | 157 |
| `countNonWorking(a, b)` 外 | 期間内の非稼働日数（終了日を含む） | 166 |
| `holidaysBetween(a, b)` 外 | 期間内の祝日を [{date, name}] で返す（xlsx の NETWORKDAYS 用・監査用） | 173 |
| `holidayRangeWarning(start, end)` 外 | 表示期間が規則の対応範囲から外れていれば理由を返す | 184 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.2 `01-csv-model.js`

**役割**　CSV を読んで Document（工程の配列）にする。CSV に無い値の穴埋めもここ

**読み込み順**　2 / 8　（448 行 / 16,889 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `00-holiday.js` | `MS_DAY` `countNonWorking` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `COL` | `04-xlsx.js` `05-verify.js` |
| `DEFAULT_LINE_COLOR` | `03-render.js` `04-xlsx.js` `05-verify.js` |
| `META_KEYS` | `04-xlsx.js` `05-verify.js` |
| `REQUIRED_COLS` | `07-diag.js` |
| `WEEKDAY_JA` | `03-render.js` |
| `addDays` | `02-geometry.js` `04-xlsx.js` `05-verify.js` |
| `buildDocument` | `06-ui.js` |
| `dayDiff` | `02-geometry.js` `04-xlsx.js` `05-verify.js` |
| `estimatesOf` | `03-render.js` |
| `fmtIso` | `07-diag.js` `06-ui.js` |
| `fmtSlash` | `04-xlsx.js` `07-diag.js` `06-ui.js` |
| `inputDate` | `06-ui.js` |
| `rowHeadings` | `03-render.js` `04-xlsx.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`DEFAULT_WEIGHT` 、 `ESTIMATES` 、 `GATE_RULE_TEXT` 、 `GATE_SEARCH_LIMIT` 、 `gateRowByRule` 、 `isoDateOnly` 、 `nodeRowIndex` 、 `parseCsv` 、 `recordEstimate` 、 `resetEstimates` 、 `safeJson` 、 `slashDate`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `resetEstimates()` 内 | 記録した推定を全部消す（CSV を読み直すたびに呼ぶ） | 43 |
| `recordEstimate(e)` 内 | 「CSV に無いのでこう埋めた」を 1 件記録する | 45 |
| `estimatesOf(scope)` 外 | ある工程について記録した推定を取り出す | 57 |
| `parseCsv(text)` 内 | RFC 4180 パーサ。引用・埋め込み改行・二重引用符エスケープに対応。 | 60 |
| `isoDateOnly(s)` 内 | ISO 日時から日付部分だけを取り出して UTC 深夜の Date にする。 | 92 |
| `slashDate(s)` 内 | `2026/09/01` 形式 | 98 |
| `inputDate(s)` 外 | `<input type="date">` の `YYYY-MM-DD` | 104 |
| `gateRowByRule(p, usedRows)` 内 | gate の中間ノードの行を共通規則で決める（上の説明のとおり） | 190 |
| `safeJson(s)` 内 | JSON として読む。読めなければ null（壊れた CSV で落ちないように） | 203 |
| `buildDocument(text, sourceName, opt)` 外 | 行 1–2 = メタ、行 3 = 見出し、行 4 以降 = 工程（共通仕様 3.1） | 210 |
| `rowHeadings(processes)` 外 | 行番号 → その行にノードを持つ項目名（重複排除・`/` 連結。共通仕様 4 章 A 列） | 420 |
| `nodeRowIndex(processes)` 内 | 項目ID → 行番号（crank/gate の中間ノード行の解決に使う） | 440 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.3 `02-geometry.js`

**役割**　日付と行番号を px 座標に直し、形状ごとの折れ方を決める

**読み込み順**　3 / 8　（264 行 / 9,028 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `01-csv-model.js` | `addDays` `dayDiff` |
| `00-holiday.js` | `isNonWorkingDay` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `DEFAULTS` | `05-verify.js` `06-ui.js` |
| `H_RATIO` | `05-verify.js` |
| `SHAPE_KIND` | `03-render.js` `05-verify.js` |
| `TEXT_RATIO` | `03-render.js` `05-verify.js` |
| `hexPoints` | `03-render.js` |
| `makeGeometry` | `03-render.js` |
| `roundedPath` | `03-render.js` |
| `shapeOf` | `03-render.js` |
| `splitByDay` | `03-render.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`BOX_POINT_INSET` 、 `CORNER_R_PT` 、 `PDF` 、 `SHAPE_RULES` 、 `SLANT_COLS` 、 `applySlant`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `makeGeometry(doc, start, end, opt)` 外 | 表示期間から格子を作る | 81 |
| `applySlant(pts, DAY_W)` 内 | 縦の長さが変わっても x 方向の量は変わらないので、角度ではなく固定量。 | 143 |
| `shapeOf(p, geo)` 外 | 工程 1 本の描画形状を決める | 163 |
| `splitByDay(pts, geo)` 外 | 各区間に日付 index と非稼働日かどうかを付ける。 | 199 |
| `hexPoints(x0, x1, yc, h, DAY_W)` 外 | 六角形（左右が尖る）。box S/M/L | 237 |
| `roundedPath(pts, r)` 外 | 折れ線の角を半径 r で丸めた SVG の d を組む（描画専用。検査は頂点で行う） | 244 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.4 `03-render.js`

**役割**　02 の座標を SVG の要素に変換して画面に出す

**読み込み順**　4 / 8　（406 行 / 16,144 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `01-csv-model.js` | `DEFAULT_LINE_COLOR` `WEEKDAY_JA` `estimatesOf` `rowHeadings` |
| `02-geometry.js` | `SHAPE_KIND` `TEXT_RATIO` `hexPoints` `makeGeometry` `roundedPath` `shapeOf` `splitByDay` |
| `00-holiday.js` | `holidayRangeWarning` `isNonWorkingDay` `isPublicHoliday` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `el` | `06-ui.js` |
| `render` | `06-ui.js` |
| `renderDateHeader` | `06-ui.js` |
| `renderRowHeader` | `06-ui.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`EST_PDF_COLOR` 、 `EST_RULE_COLOR` 、 `GRID_COLOR` 、 `HOLIDAY_FILL` 、 `NAME_PAD_COLS` 、 `NODE_R` 、 `SVG_NS` 、 `estLabel` 、 `estimateMarks` 、 `holidayDash` 、 `markerId` 、 `nameText` 、 `num` 、 `seg2d`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `markerId(color)` 内 | 色ごとに 1 つだけ作る矢じりの id。同じ色なら同じ id になる | 48 |
| `holidayDash(geo)` 内 | 休日区間の点線。プロジェクトG は丸い点を並べて描くので線端を丸にする。 | 51 |
| `render(doc, start, end, opt)` 外 | @returns {{svg:SVGElement, geo:object, drawn:Array, skipped:Array, warnings:string[]}} | 56 |
| `estimateMarks(p, sh, geo, est)` 内 | 推定で埋めた箇所に付ける目印（［推定を表示］のときだけ見える） | 249 |
| `estLabel(x, y, text, color, geo)` 内 | 目印の吹き出し（背景付きの小さな文字） | 301 |
| `nameText(p, sh, geo)` 内 | 工程線名の <text>。位置・大きさ・色は CSV の工程線名 JSON に従う | 327 |
| `renderDateHeader(geo)` 外 | 上の日付ヘッダー（HTML テーブル。設計B 3 章） | 366 |
| `renderRowHeader(doc, geo)` 外 | 左の行見出し（共通仕様 4 章 A 列。空行も再現する） | 394 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.5 `04-xlsx.js`

**役割**　Document から xlsx を組み立てる

**読み込み順**　5 / 8　（275 行 / 10,899 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `01-csv-model.js` | `COL` `DEFAULT_LINE_COLOR` `META_KEYS` `addDays` `dayDiff` `fmtSlash` `rowHeadings` |
| `00-holiday.js` | `MS_DAY` `countNonWorking` `isNonWorkingDay` `isPublicHoliday` `isWeekend` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `COL_DATE0` | `05-verify.js` |
| `COL_END` | `05-verify.js` |
| `COL_HEAD` | `05-verify.js` |
| `COL_NAME` | `05-verify.js` |
| `COL_START` | `05-verify.js` |
| `DATA_SHEET` | `05-verify.js` |
| `HELP_SHEET` | `05-verify.js` |
| `LAYOUT_SHEET` | `05-verify.js` |
| `ROW_MONTH` | `05-verify.js` |
| `argb` | `05-verify.js` |
| `buildWorkbook` | `06-ui.js` |
| `visibleProcesses` | `05-verify.js` |
| `xlsxFileName` | `06-ui.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`COL_DAYS` 、 `publicHolidaysIn` 、 `solid`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `visibleProcesses(doc, start, end)` 外 | 表示対象の工程（削除済み・期間外を除く）。描画と同じ条件で選ぶ。 | 65 |
| `publicHolidaysIn(start, end)` 内 | 表示期間に含まれる祝日（土日は NETWORKDAYS が自前で除く） | 72 |
| `async buildWorkbook(doc, start, end)` 外 | Document から ExcelJS のワークブックを組み立てる（このファイルの本体） | 82 |
| `xlsxFileName(doc, start, end)` 外 | 書き出す xlsx のファイル名を作る | 271 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.6 `05-verify.js`

**役割**　描いた SVG と書いた xlsx を読み戻して検査する

**読み込み順**　6 / 8　（392 行 / 19,873 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `01-csv-model.js` | `COL` `DEFAULT_LINE_COLOR` `META_KEYS` `addDays` `dayDiff` |
| `04-xlsx.js` | `COL_DATE0` `COL_END` `COL_HEAD` `COL_NAME` `COL_START` `DATA_SHEET` `HELP_SHEET` `LAYOUT_SHEET` `ROW_MONTH` `argb` `visibleProcesses` |
| `02-geometry.js` | `DEFAULTS` `H_RATIO` `SHAPE_KIND` `TEXT_RATIO` |
| `00-holiday.js` | `MS_DAY` `countNonWorking` `isNonWorkingDay` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `verifySvg` | `06-ui.js` |
| `verifyXlsx` | `06-ui.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`EPS` 、 `SEP` 、 `near` 、 `parseSeg` 、 `pushResult`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `pushResult(list, ok, scope, label, detail)` 内 | 検査結果を 1 件積む。ok が false なら画面で NG として出る | 38 |
| `parseSeg(d)` 内 | "M x y L x y" を読み戻す | 43 |
| `verifySvg(doc, svgRoot, start, end, opt)` 外 | 期待値は CSV から独立に再計算する。 | 53 |
| `async verifyXlsx(buffer, doc, start, end)` 外 | xlsx を書き出しバッファから読み戻して検査する（設計B 5.4） | 242 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.7 `07-diag.js`

**役割**　中身を伏せたまま原因を追える診断ログを作る

**読み込み順**　7 / 8　（291 行 / 10,824 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `01-csv-model.js` | `REQUIRED_COLS` `fmtIso` `fmtSlash` |
| `00-holiday.js` | `countNonWorking` `holidayRangeWarning` `holidaysBetween` `usingPublicHolidays` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

| 名前 | 使っているファイル |
| --- | --- |
| `buildDiagnosticText` | `06-ui.js` |
| `diagFileName` | `06-ui.js` |
| `diagInstallErrorHooks` | `06-ui.js` |
| `diagRecordError` | `06-ui.js` |

**このファイルの中だけの名前（自由に変えてよい）**

`DIAG_ERRORS` 、 `DIAG_VERSION` 、 `diagCsvFacts` 、 `extOnly` 、 `makeAliaser` 、 `shape_`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `diagRecordError(kind, message, stack)` 外 | 起きた例外を 1 件覚えておく（診断ログに出す） | 48 |
| `diagInstallErrorHooks()` 外 | window の onerror などに引っかけて、落ちても拾えるようにする | 57 |
| `makeAliaser(prefix)` 内 | 実値 → 通し番号。対応表は書き出さない | 69 |
| `shape_(s)` 内 | 文字列は「何文字あったか」だけ残す | 79 |
| `extOnly(name)` 内 | ファイル名は拡張子だけ | 85 |
| `diagCsvFacts(text)` 内 | CSV そのものの素性（行数・列名・改行・BOM）だけを取り出す。値は見ない | 92 |
| `buildDiagnosticText(st, raw)` 外 | @param {boolean} raw  true なら伏せ字をやめて実値を入れる（社内用） | 117 |
| `diagFileName()` 外 | 診断ログのファイル名を作る | 286 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 3.8 `06-ui.js`

**役割**　ボタン・入力欄・進行状況。他の全部をここから呼ぶ

**読み込み順**　8 / 8　（480 行 / 17,380 文字）

**このファイルが他から借りている名前**

| 借りる先 | 名前 |
| --- | --- |
| `02-geometry.js` | `DEFAULTS` |
| `07-diag.js` | `buildDiagnosticText` `diagFileName` `diagInstallErrorHooks` `diagRecordError` |
| `01-csv-model.js` | `buildDocument` `fmtIso` `fmtSlash` `inputDate` |
| `04-xlsx.js` | `buildWorkbook` `xlsxFileName` |
| `03-render.js` | `el` `render` `renderDateHeader` `renderRowHeader` |
| `05-verify.js` | `verifySvg` `verifyXlsx` |

**他のファイルが使っている名前（勝手に変えてはいけない）**

なし。このファイルの中身は他から呼ばれません。

**このファイルの中だけの名前（自由に変えてよい）**

`$` 、 `EST_LABEL` 、 `checkTable` 、 `clearLog` 、 `collapsible` 、 `currentPeriod` 、 `doDiag` 、 `doRender` 、 `doXlsx` 、 `loadCsvText` 、 `log` 、 `parseGateRows` 、 `renderEstimates` 、 `renderResults` 、 `revealProcess` 、 `setPeriodDefaults` 、 `setShowEstimates` 、 `setStatus` 、 `state` 、 `wire`

**関数**

| 関数 | 何をするか | 行 |
| --- | --- | --- |
| `setStatus()` 内 | 「いま何件描けていて、検査は通っていて、要確認は何件か」だけは常に見えるようにする。 | 47 |
| `log(kind, text)` 内 | 画面下のログに 1 行出す | 90 |
| `clearLog()` 内 | 画面下のログを空にする | 99 |
| `checkTable(rows)` 内 | 検査結果の表を組む | 102 |
| `renderResults(title, results)` 内 | 押されたときにはじめて組み立てる。DOM を無駄に膨らませない。 | 121 |
| `setPeriodDefaults(doc)` 内 | CSV を読んだ直後に、表示期間の初期値を工期から決める | 139 |
| `parseGateRows(text)` 内 | 「P0012:32, P0015:23」のような指定を { 工程ID: 行 } に直す | 148 |
| `loadCsvText(text, name)` 内 | CSV の中身を読み込んで画面を整える（ファイル選択と検査の共通入口） | 159 |
| `renderEstimates(estimates)` 内 | 推定の一覧を画面下に表として出す | 191 |
| `collapsible(label, build)` 内 | 「〜を見る」で開く折りたたみ。中身は開かれたときに初めて組み立てる。 | 240 |
| `currentPeriod()` 内 | 入力欄から今の表示期間を取り出す | 256 |
| `doRender()` 内 | ［描画］を押したときの処理。描いてから検査まで走る | 271 |
| `async doXlsx(download)` 内 | ［xlsx 書き出し］を押したときの処理。作って検査して保存する | 305 |
| `wire()` 内 | ボタンと入力欄に処理を結びつける（読み込み時に 1 回だけ呼ぶ） | 333 |
| `revealProcess(id)` 内 | 工程を画面の中央へスクロールして点滅させる | 385 |
| `setShowEstimates(on, scroll)` 内 | 押したときに最初の推定まで自動で送る（画面外だと押しても何も見えないため）。 | 407 |
| `doDiag()` 内 | 何が外に出るのかを必ず見せる。 | 434 |

「外」＝他のファイルから呼ばれる。「行」はこのファイルの先頭からの行数（自動生成の枠を含む）。

---

## 4. 触ってはいけないこと

| だめなこと | なぜ |
| --- | --- |
| `import` / `export` を書く | `file://` では CORS で読めません。8 つは連結される前提です |
| `fetch` / `XMLHttpRequest` を書く | 外部通信ゼロが要件です。`tools/組み立て.html` が組み立てを断ります |
| `http://` `https://` で始まる文字列を書く | 同上（`www.w3.org` の名前空間だけは例外） |
| `<script src=` `<link href=` `@import` を書く | 同上 |
| コードの中に `</script` と書く | 1 枚に入れたとき、そこで HTML が切れます |
| 他のファイルが使っている名前を変える／消す | 連結した先で落ちます。上の表を見てください |
| 列番号で CSV を読む | 列の並びは変わります。列名（`COL`）で引いてください |

## 5. この仕様書の作り方

```
node tools/analyze-src.mjs    # 依存と公開名を数える（out/src-map.json）
node tools/gen-headers.mjs    # src/*.js の先頭の枠を書き直す
node tools/build-spec.mjs     # この文書を作り直す
node tools/build-html.mjs     # 1 枚の HTML と 開発用.html を作る
```
