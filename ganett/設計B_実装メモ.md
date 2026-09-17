# 設計B 実装メモ ― ステップ 1（往路）

対象：`GaNett工程表ツール.html`（単一ファイル）
上位仕様：`00_共通仕様_GaNett工程表変換.md` / `02_設計B_HTMLツール_往路→復路.md`
ステップ 2（復路）には着手していない。

---

## 0. 最初に読むこと ― 提供されなかった入力と、その影響

**このセッションには `Sample.zip` と `01_設計A` が渡されていない。** 渡されたのは
共通仕様と設計B の 2 つの Markdown だけである。両者は上位仕様が「正本」と
呼んでいるものそのものなので、以下は**実施できていない**。

| 受け入れ条件 | 必要な入力 | 状態 |
|---|---|---|
| 5.5-1 PDF 1 頁目と 23 工程の位置・形・色・点線を照合 | `サポートルーム_サンプル工程表.pdf` | **未実施** |
| 5.5-2 `画面スクショ遠景.png` と一致 | 同 PNG | **未実施** |
| 5.2 形状ごとの折れ方を PDF の 23 件と 1 本ずつ照合して確定 | 同 PDF | **未実施（暫定規則で実装）** |
| 5.3 xlsx を「設計 A の出力と同じ構成」にする | `01_設計A` 4.3〜5 章 | **未実施（共通仕様 4 章＋設計B 5.3 から再構成）** |
| 5.4 xlsx 検査を「設計 A 6 章と同じ」にする | `01_設計A` 6 章 | **未実施（共通仕様 4・6・7 章から導出）** |
| サンプルで生成した xlsx | `サポートルーム_サンプル工程表.csv` | **代替 CSV から生成** |

やったことは次のとおり。

- **描画規則は 1 つのテーブル（`SHAPE_RULES`）に集約した。** PDF が手に入ったら
  そこだけを直せば済む。暫定の箇所は 3 章の表で「暫定」と明示し、
  crank / gate については実行時にも画面ログへ警告を出している。
- **サンプル CSV は共通仕様 3.4「実測値」だけを根拠に再構成した。**
  工程数 23・形状分布・線幅分布・矢印 none 2 件・斜行 2 件・中間ノード 5 件・
  行番号範囲 5〜46・見出し 124 列・工程表の期間は本物と一致する。
  日付・色・項目名は再構成なので **PDF とは一致しない**。
  生成器は `tools/make-fixture.mjs`、自己検証つき（20 項目 OK）。
- **ツール本体はこの代替 CSV を一切参照しない。** 列は全て見出し名で引き、
  工程数・列数・行番号範囲はコードに現れない（共通仕様 禁止事項 1・5）。

**したがって、本成果物は「幾何と xlsx 構造が仕様どおりであること」までは
機械検査で担保されているが、「GaNett の見た目と一致すること」は未担保である。**
Sample.zip を頂ければ、3 章の表の暫定行を埋めて再検査する。

---

## 1. 成果物

| ファイル | 内容 |
|---|---|
| `GaNett工程表ツール.html` | 単一 HTML（約 993 KB）。CSS・JS・ExcelJS を全てインライン |
| `設計B_実装メモ.md` | 本書 |
| `out/代替サンプル工程表_20260901-20261010.xlsx` | 代替 CSV から生成した xlsx |
| `out/case1_*.png` `out/case2_*.png` | 描画スクリーンショット |
| `out/acceptance.log` `out/inspection-case1.log` `out/inspection-openpyxl.log` | 検査ログ |
| `fixtures/代替サンプル工程表.csv` | 代替サンプル CSV |
| `src/` `tools/` | 自前コードとビルド・試験スクリプト（全文は 8 章に内包） |

`GaNett工程表ツール.html` は `node tools/build-html.mjs` で `src/*.js` と
`src/shell.html` から組み立てる。ビルド時に

- `fetch` / `XMLHttpRequest` / `importScripts` / `http(s)` URL /
  `<script src>` / `<link href>` / `@import` が自前コードに無いこと
- インライン `<script>` を壊す並び（`</script`、`<!--`）が無いこと

を検査し、1 つでも見つかれば失敗する。

---

## 2. ライブラリ

| 名前 | 版 | ライセンス | 用途 | 同梱形 |
|---|---|---|---|---|
| ExcelJS | 4.4.0（ビルド日 2023-10-19） | MIT（Copyright © 2014-2019 Guyon Roche） | xlsx の生成と読み戻し | `dist/exceljs.min.js` を `<script>` にインライン展開 |

他に依存は無い。CSV パーサ・SVG 描画・検査は全て自前。
`exceljs.bare.min.js` ではなく **フル版**を使っている（ブラウザ用 Buffer
ポリフィルを含み、`writeBuffer()` が `file://` でそのまま動くため）。
MIT 全文は HTML 先頭のバナーに埋め込んである。

---

## 3. 描画規則表（これが現時点の GaNett 描画仕様書）

格子（共通仕様 4 章・設計B 3 章）:

| 記号 | 定義 |
|---|---|
| `DAY_W` | 1 日の幅。既定 24 px。ズームはこの値だけを変える |
| `ROW_H` | 1 行の高さ。既定 28 px |
| 日付 index `n` | `(日付 − Start)` の日数。Start が 0 |
| 開始境界 `x0` | `dayIndex(開始日) × DAY_W` |
| 終了境界 `x1` | `(dayIndex(終了日) + 1) × DAY_W`（終了日を含むため） |
| 行 `r` の中央 `y` | `(r − 1) × ROW_H + ROW_H/2` |

座標はすべて `n` と `r` から計算しており、ピクセル定数は `DAY_W` と `ROW_H`
以外に存在しない。

### 3.1 形状

| 形状 | 実装した折れ方（頂点列） | 根拠 | 確度 |
|---|---|---|---|
| `straight` | `(x0,y0) → (x1,y1)`。同行なら水平、行違いなら斜線 | 共通仕様 5.2 | **確定** |
| `yElbow` | `(x0,y0) → (x0,y1) → (x1,y1)`（始点で縦→終点行で横） | 共通仕様 5.2 | **確定** |
| `xElbow` | `(x0,y0) → (x1,y0) → (x1,y1)`（始点行で横→終点で縦） | 共通仕様 5.2 | **確定** |
| `crank` | `(x0,y0) → (x0,yM) → (x1,yM) → (x1,y1)`。`yM` は中間の行 | 共通仕様 5.2（C1: 21→19→17） | **暫定** |
| `gate` | `(x0,y0) → (x0,y1) → (xg,y1) → (x1,y1)`。`xg` は 2 本目の縦の x | 共通仕様 5.2（D4） | **暫定** |
| `boxS` / `boxM` / `boxL` | 左右が尖る六角形の枠線。高さ S=10/28・M=16/28・L=22/28 × `ROW_H`。尖りの食い込みは `min(高さ/2, 幅/4)` | 共通仕様 5.2、設計B 5.2 | 高さは**確定**、尖りの食い込みは**暫定** |
| `barAutoAdjust` | 塗り矩形。高さ 14/28 × `ROW_H`。塗り = 背景色、無ければ線色 | 設計B 5.2 | **確定** |
| `barProcessNameAdjust` | 細い塗り矩形。高さ 8/28 × `ROW_H`。塗り = 背景色、無ければ線色の淡色（白と 45% 混合） | 設計B 5.2 | 高さは**確定**、淡色の作り方は**暫定** |

**crank の `yM`（暫定）**：`項目ID（中間ノード）` が他工程の開始／終了ノードとして
行番号を解決できればその行。できなければ `round((開始行 + 終了行) / 2)`。
共通仕様 5.2 の C1（21→19→17）は後者と一致するが、5 件ある中間ノードの
`項目ID` がサンプルでどの行を指すのかは CSV を見ないと決まらない。

**gate の `xg`（暫定）**：`中間ノード日付` があればその開始境界、無ければ `x1`
（このとき `yElbow` に縮退する）。共通仕様 5.2 の「縦→横→縦。横は終了行、
最後の縦で終了ノード行へ」は、横が既に終了行にある以上、最後の縦が長さ 0 に
なり文面として閉じない。`中間ノード日付` が「crank / gate の縦線の位置」を
決めるという 3.3 の記述と両立させるため上記を採った。**ここは PDF で確定させる
必要がある。** 該当工程には実行時に画面ログで警告を出している。

### 3.2 斜行（`工程線の斜行 = true`）

折れ線の「縦」の走りを、隣接する横の向きへ **1 日分（`SLANT_DAYS × DAY_W`）**
だけ寝かせる。横の走りが 1 日に満たない場合はその長さで打ち切る。
点線判定は x 方向の日で行うので、斜めの区間も日境界で分割される。**暫定**
（寝かせる量が 1 日でよいかは PDF 待ち）。

### 3.3 実線・点線

**1 日ごとに区間を分けて描く。** 折れ線を頂点列に落としたあと、x が進む区間は
日の境界 `k × DAY_W` ごとに切る。各区間の日付 index は区間中点の x から求め、
土日なら `stroke-dasharray` を付ける。`実線・点線 = dash` の工程は全区間点線。

縦の区間（x が動かない区間）は x だけでは日を一意に決められないため、
隣接する横の走りの向きで所属日を決める（右へ続くなら `k`、左から来たなら `k−1`）。
検査では縦区間の点線判定は対象外にしている（判定規則そのものが暫定のため）。

### 3.4 その他

| 要素 | 実装 |
|---|---|
| 土日列 | `<rect class="weekend" fill="#E8E8E8">` を列ごとに 1 枚 |
| 罫線 | 日付境界の縦線と行境界の横線（`#d8d8d8`、1 px） |
| 矢印 | 線色ごとに `<marker>` を 1 つ定義し、最終区間に `marker-end`。`工程線の矢印 = none` なら付けない |
| ノード丸 | `<circle r="3.5" fill="#fff" stroke="線色" stroke-width="1.5">`。`ノード形状 = none` なら描かない |
| 工程線名 | `<text>`。`textSize` L=16 / M=13 / S=11 px。折れ線は始点の少し右・線の上に左寄せ、box/bar は図形の上中央。`nameBold` / `nameColor` を反映 |
| 関係線 | `関係線名` が同じノード同士を y 順に結ぶ灰色の点線。**暫定**：共通仕様 5.2 は「縦の点線」だが、x が違うノード同士は縦線では結べないため直線で結んでいる |
| クリップ | `<clipPath>` で表示期間の矩形に切る。**座標は切らずに clipPath で隠す**ので、検査は期間外にはみ出した真の座標を見る |
| 期間外 | 工程全体が表示期間の外なら描かない |
| 空行 | 行 1 から最大行番号まで全て描く。行見出しも同じ行数だけ出す |
| `工程削除` | 値があれば描かない |
| `0.5日` | 値があれば警告を出し、日付のみで描く（未対応） |

### 3.5 未対応・意図的に落としたもの

- 祝日（共通仕様 4 章のとおり土日のみ。拡張点として `isWeekend` 1 箇所に閉じてある）
- `依存タスク`（FS / SF）の描画。往路では任意なので描いていない。復路の検証で使う
- `namePositionCoefficient` / `nameWritingMode` / `showTotalDays` などの
  `工程線名` JSON の細かい指定。`name` / `textSize` / `nameBold` / `nameColor` のみ反映
- `詳細工程1〜6`（共通仕様 3.3 のとおり往路 v1 では出力しない）
- 工程線名が隣接行の図形と重なることがある。`ROW_H = 28` に対し `boxL` が
  高さ 22 px なので名前を置く余地が 3 px しかない。PDF で GaNett の実際の
  名前位置を見てから調整する

---

## 4. xlsx の構成 ― 仕様の矛盾と、採った判断

`01_設計A` が無いので、共通仕様 4 章「xlsx での配置」と設計B 5.3 から再構成した。
**この 2 つは両立しない。**

| | 共通仕様 4 章 | 設計B 5.3 |
|---|---|---|
| 日付列の始まり | **B 列**（日付 index `n` → 列 `2+n`） | 条件付き書式が `F$2` を参照 → **F 列** |
| 行の意味 | **行 `r+3` ＝ GaNett 行番号 `r`**。空行も再現 | `$C5` / `$D5` → **1 行 1 工程**、データは行 5 から |
| A 列以外 | A 列＝行見出し、B 列以降は全て日付 | 行見出し／名前／開始日／終了日／日数／日付列 |

さらに決定的な問題がある。**GaNett は 1 工程が 2 行にまたがるネットワークなので、
「1 行 ＝ GaNett 行番号」にすると開始行が同じ 2 工程が同じ行に重なり、
その行の C/D（開始日・終了日）を定義できない。**
本ツールの代替 CSV では E1（行 35→35）と E2（行 35→33）が該当する。
復路の突き合わせキーが工程ID である以上、C/D を持てるのは 1 行 1 工程のときだけ。

**判断：設計B 5.3 の列レター（C=開始日、D=終了日、F=最初の日付列、
データ開始行 5）に従い、1 行 1 工程にした。**
共通仕様 4 章「xlsx での配置」は、共通仕様 自身の指示（「矛盾を見つけたら本書を
直し、A・B を追従させてください」）に従って**修正が必要**である。
設計 A も同じ形に揃えないと、復路が両方には対応できない。

### 4.1 実装した構成

**`T10_Layout`**

| 位置 | 内容 |
|---|---|
| 行 1 | 月見出し。同じ月の日付列を結合し `m月` |
| 行 2 | **実日付**（表示書式 `d`）。条件付き書式が `F$2` を数値比較するため値は日付 |
| 行 3 | 実日付（表示書式 `aaa` ＝ 曜日） |
| 行 4 | 列見出し（項目 / 工程線名 / 開始日 / 終了日 / 日数） |
| 行 5〜 | 1 行 1 工程。CSV の並び順 |
| A 列 | 行見出し（開始・終了ノードの項目名を重複排除して `/` 連結） |
| B 列 | 工程線名 |
| C 列 | 開始日（`yyyy/mm/dd`、**編集可**） |
| D 列 | 終了日（`yyyy/mm/dd`、**編集可**） |
| E 列 | 日数（`NETWORKDAYS(C,D)`。祝日は考慮しない） |
| F 列〜 | 日付列。Start が F 列、日付 index `n` → 列 `6+n` |
| 土日列 | 薄灰 `#E8E8E8` |
| バー | **条件付き書式**（行ごとに `AND(F$2>=$C5,F$2<=$D5)` → 線色で塗り）。図形は使わない（禁止事項 2） |
| 保護 | シート保護。C/D のみ `locked=false` |
| 入力規則 | C/D に日付型、`工程表の期間` の範囲で `between` |
| 固定 | F 列・行 4 で枠固定 |

**`_data`（非表示）**：1 列目に工程ID、2 列目以降に元 CSV の 124 列を
**列順どおり・値そのまま**。復路の突き合わせ用。
右側に `_meta`（メタ 7 項目、表示期間、元ファイル名）を置いた。

**`使い方`**：業者向けの手順（編集してよいのは C/D だけ、終了日は当日を含む、
行の追加削除や並べ替えをしない、など）。

ファイル名は `<CSV名>_<Start>-<End>.xlsx`（例
`代替サンプル工程表_20260901-20261010.xlsx`）。`<a download>` で保存する。

---

## 5. 機械検査（設計B 5.4）

**描いたものを信じない。**期待値は CSV から独立に再計算し、実物の属性値と突き合わせる。

### 5.1 SVG 検査（画面下のログに出る）

工程 1 本につき最大 16 項目。`g.proc[data-pid]` を引き、`path` / `polygon` /
`rect` / `circle` / `text` の **属性値を読み戻して**判定する。

- 折れ線：先頭区間の始点 `x` ＝ `dayIndex(開始日) × DAY_W`、`y` ＝ 開始行の中央／
  最終区間の終点 `x` ＝ `(dayIndex(終了日)+1) × DAY_W`、`y` ＝ 終了行の中央／
  `d` 属性が解析できること／区間が連続していること／土日区間が点線で稼働日区間が
  実線であること／矢印の有無が `工程線の矢印` と一致／線色・太さが CSV と一致
- 六角形：左端 `x`・右端 `x`・中心 `y`・高さ・枠線色
- バー：左端 `x`・右端 `x`・中心 `y`・高さ
- ノード丸：有無が `ノード形状` と一致、位置が両境界
- 工程線名：文字列と `font-size`
- 格子：土日列の背景の本数・位置・幅
- 描画対象外（削除／期間外／日付不正）が描かれていないこと

**全件 OK のときだけ xlsx 書き出しボタンが有効になる。**

### 5.2 xlsx 検査

書き出したバッファを ExcelJS で**読み戻して**判定する（22 項目）。
さらに納品前の確認として、**ExcelJS とは別実装の openpyxl でも読み直した**
（`tools/verify-xlsx-independent.py`、20 項目）。ExcelJS が自分の書いたものを
読み返すだけでは「書き手と読み手が揃って間違っている」を見逃すため。

検査項目：シート名と並び／`_data` が非表示／シート保護／行 2 の日付が 1 日ずつ
一致／行 3 が同じ日付を指す／書式 `d`・`aaa`／土日列が薄灰／月見出しが月ごとに
結合／1 行 1 工程で工程線名が一致／C/D が CSV の日付と一致／C/D だけ編集可で
A 列は保護／C/D に入力規則／条件付き書式が工程数だけあり式と塗り色が正しい／
`_data` が元 CSV の見出しを列順どおり保持／`_data` の全セルが元 CSV と等価。

### 5.3 検査で実際に見つけた不具合

いずれも**検査側の誤り**で、xlsx の中身は正しかった。記録として残す。

1. **行 3 の曜日列が読み戻せない。** ExcelJS も openpyxl も `numFmt = 'aaa'` を
   日付書式と認識せず、シリアル値（`46266` ＝ 2026-09-01）をそのまま返す。
   Excel 自身は `aaa` を曜日として描画するので格納値は正しい。
   共通仕様 4 章が指定する書式は `aaa` なので、**書式ではなく検査側**を直し、
   シリアル値でも日付として読めるようにした。
2. **月見出しの結合セルを数え違えた。** 結合範囲の全セルが master の値を返すため、
   「`m月` と一致するセル数」を数えると 40 になった。
   「各列が自分の月を指すこと」と「結合の塊の数 ＝ 月数」の 2 本に分けた。

---

## 6. 受け入れ結果（設計B 5.5）

`tools/acceptance.mjs`（headless Chromium、`file://`、browser context を
`offline: true`、外部リクエストが 1 本でも出たら失敗）。

| # | 条件 | 結果 |
|---|---|---|
| 1 | サンプル CSV、2026/09/01–10/10 で描画 → PDF 1 頁目と 23 工程を照合 | **未実施**（PDF 無し）。代替として代替 CSV で描画し、23 件描画・SVG 検査 331/331 OK。スクリーンショット `out/case1_09-01_10-10_full.png` |
| 2 | 2026/09/01–09/30 で描画 → `画面スクショ遠景.png` と一致 | **未実施**（PNG 無し）。代替として同期間で描画し、SVG 検査 316/316 OK（1 件は期間外で除外）。`out/case2_09-01_09-30_full.png` |
| 3 | xlsx を書き出し → 設計 A 6 章の検査が全件合格 | **代替で合格**。ExcelJS 読み戻し 22/22 OK、openpyxl 読み直し 20/20 OK。検査項目は共通仕様 4・6・7 章と設計B 5.3 から導出 |
| 4 | 工程行を複製して 24 本にした CSV でも動く | **合格**。24 件読み込み・24 件描画、SVG 347/347 OK、xlsx 22/22 OK |
| 5 | `file://` で開いて全機能が動く（ネットワーク切断状態） | **合格**。`file://` で起動、offline context、外部リクエスト 0 本、JS エラー 0 件 |

追加で確認したこと：

- 必須列（`工程線の形状`）を欠いた CSV はエラーで止まる
- 生成した xlsx は ZIP として妥当（22,517 bytes）。OOXML を直接見て
  `sheetProtection` 1 件・`conditionalFormatting` 23 件・`dataValidation` 2 件・
  `mergeCell` 2 件（`F1:AI1` ＝ 9月 30 日、`AJ1:AS1` ＝ 10月 10 日）・
  `_data` が `state="hidden"` であることを確認した

**実機 Excel での確認は行っていない。** この環境の LibreOffice は
openpyxl で作った最小の対照ファイルすら `source file could not be loaded` で
開けず（環境側の不具合）、表計算アプリでの描画確認はできなかった。
監督 PC の Edge / Chrome と Excel での目視確認をお願いしたい。

### 6.1 検査ログ（受け入れ 1、抜粋）

全文は `out/inspection-case1.log`（354 行）・`out/inspection-openpyxl.log`・
`out/acceptance.log`。

```
OK	P0001	path の d が解析できること	9 区間
OK	P0001	始点 x ＝ dayIndex(開始日)×DAY_W	実測 0 / 期待 0
OK	P0001	始点 y ＝ 開始行の中央	実測 238 / 期待 238
OK	P0001	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 192 / 期待 192
OK	P0001	終点 y ＝ 終了行の中央	実測 182 / 期待 182
OK	P0001	区間が連続していること	
OK	P0001	土日区間が点線・稼働日区間が実線であること	8 区間を検査
OK	P0001	矢印の有無が 工程線の矢印 と一致	CSV=arrow / 実測=あり
OK	P0001	線色が 工程線の色 と一致	#1f77b4
OK	P0001	線の太さが 工程線の太さ と一致	2
OK	P0001	開始ノード丸の有無が 開始日ノード形状 と一致	CSV=(空) / 実測=あり
OK	P0001	終了ノード丸の有無が 終了日ノード形状 と一致	CSV=(空) / 実測=あり
OK	P0001	開始ノード丸の位置	(0, 238) / 期待 (0, 238)
OK	P0001	終了ノード丸の位置	(192, 182) / 期待 (192, 182)
OK	P0001	工程線名が描かれていること	A1
OK	P0001	文字サイズ ＝ textSize L	16
OK	P0005	path の d が解析できること	11 区間
OK	P0005	始点 x ＝ dayIndex(開始日)×DAY_W	実測 240 / 期待 240
OK	P0005	始点 y ＝ 開始行の中央	実測 294 / 期待 294
OK	P0005	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 504 / 期待 504
OK	P0005	終点 y ＝ 終了行の中央	実測 406 / 期待 406
  ...
OK	P0006	path の d が解析できること	12 区間
OK	P0006	始点 x ＝ dayIndex(開始日)×DAY_W	実測 504 / 期待 504
OK	P0006	始点 y ＝ 開始行の中央	実測 406 / 期待 406
OK	P0006	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 768 / 期待 768
OK	P0006	終点 y ＝ 終了行の中央	実測 322 / 期待 322
  ...
OK	P0007	path の d が解析できること	16 区間
OK	P0007	始点 x ＝ dayIndex(開始日)×DAY_W	実測 48 / 期待 48
OK	P0007	始点 y ＝ 開始行の中央	実測 574 / 期待 574
OK	P0007	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 384 / 期待 384
OK	P0007	終点 y ＝ 終了行の中央	実測 462 / 期待 462
  ...
OK	P0008	path の d が解析できること	15 区間
OK	P0008	始点 x ＝ dayIndex(開始日)×DAY_W	実測 384 / 期待 384
OK	P0008	始点 y ＝ 開始行の中央	実測 462 / 期待 462
OK	P0008	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 696 / 期待 696
OK	P0008	終点 y ＝ 終了行の中央	実測 630 / 期待 630
  ...
OK	P0009	path の d が解析できること	9 区間
OK	P0009	始点 x ＝ dayIndex(開始日)×DAY_W	実測 696 / 期待 696
OK	P0009	始点 y ＝ 開始行の中央	実測 630 / 期待 630
OK	P0009	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 912 / 期待 912
OK	P0009	終点 y ＝ 終了行の中央	実測 518 / 期待 518
  ...
OK	P0010	path の d が解析できること	8 区間
OK	P0010	始点 x ＝ dayIndex(開始日)×DAY_W	実測 0 / 期待 0
OK	P0010	始点 y ＝ 開始行の中央	実測 742 / 期待 742
OK	P0010	終点 x ＝ (dayIndex(終了日)+1)×DAY_W	実測 168 / 期待 168
OK	P0010	終点 y ＝ 終了行の中央	実測 686 / 期待 686
  ...
OK	格子	土日列の背景の本数	実測 11 / 期待 11
OK	格子	土日列の位置と幅	
OK	xlsx	シート T10_Layout があること	
OK	xlsx	シート _data があること	
OK	xlsx	シート 使い方 があること	
OK	xlsx	_data が非表示であること	hidden
OK	xlsx	T10_Layout がシート保護されていること	{"sheet":true}
OK	xlsx	行 2 の日付が表示期間と 1 日ずつ一致	40 列
OK	xlsx	行 3 の曜日列が同じ日付を指すこと	
OK	xlsx	土日列が薄灰であること	
OK	xlsx	行 2 の表示書式が d	d
OK	xlsx	行 3 の表示書式が aaa	aaa
OK	xlsx	行 1 の各日付列が自分の月を指すこと	40 列
OK	xlsx	行 1 の月見出しが月ごとに結合されていること	結合の塊 2 / 月数 2
OK	xlsx	1 行 1 工程で工程線名が一致	23 行
OK	xlsx	C/D が CSV の開始日・終了日と一致（日付部分）	
OK	xlsx	C/D だけが編集可（locked=false）	
OK	xlsx	C/D に入力規則があること	
OK	xlsx	A 列は編集不可のままであること	
OK	xlsx	条件付き書式が工程数だけあること	実測 23 / 期待 23
OK	xlsx	各行の条件付き書式の式と塗り色が正しいこと	23 行
OK	xlsx	_data の 1 列目が 工程ID	工程ID
OK	xlsx	_data が元 CSV の見出しを列順どおり保持	124 列 / 元 124 列
OK	xlsx	_data の全セルが元 CSV と等価	23 行
```

openpyxl による独立検査：

```
OK	シート名と並び	['T10_Layout', '_data', '使い方']
OK	_data が非表示	hidden
OK	T10_Layout がシート保護されている	True
OK	行 2 の日付が 1 日ずつ一致	40 列 / NG 0
OK	行 3 が同じ日付を指す	NG 0
OK	土日列が薄灰	NG 0
OK	行 2 の書式 d	d
OK	行 3 の書式 aaa	aaa
OK	月見出しの結合が月数だけある	['AJ1:AS1', 'F1:AI1']
OK	1 行 1 工程で工程線名が一致	23 行 / NG 0
OK	C/D が元 CSV の開始日・終了日と一致	NG 0
OK	C/D だけ編集可、A 列は保護	NG 0
OK	条件付き書式が工程数だけある	23 / 23
OK	条件付き書式の式と塗り色	23 行
OK	入力規則が日付型	date
OK	入力規則が日付型	date
OK	入力規則が全工程の C/D に付いている	46 セル / 期待 46
OK	_data の 1 列目が 工程ID	
OK	_data が元 CSV の見出しを列順どおり保持	124 列 / 元 124 列
OK	_data の全セルが元 CSV と等価	23 行 / NG 0
```

受け入れ試験の全出力：

```

=== 受け入れ 1（PDF 照合の代替）: 2026/09/01–10/10 で描画 ===
   ※ Sample.zip の PDF が無いため、PDF との照合は実施できていない。
     ここで検証しているのは「幾何が仕様どおりか」だけである。
PASS  工程 23 件を読み込んだ  — 23 件
PASS  見出し 124 列を読み込んだ  — 124 列
PASS  23 件すべてを描画した  — 描画 23 / 除外 0
      SVG 検査: 331/331 OK
PASS  SVG 検査が全件 OK

=== 受け入れ 2（画面スクショ照合の代替）: 2026/09/01–09/30 ===
   ※ 画面スクショ遠景.png が無いため、照合は実施できていない。
      SVG 検査: 316/316 OK
PASS  SVG 検査が全件 OK
      描画 22 件 / 期間外で除外 1 件

=== 受け入れ 3: xlsx を書き出して読み戻し検査 ===
   ※ 01_設計A 6 章が無いため、検査項目は共通仕様 4 章・6〜7 章と設計B 5.3 から導いた。
      xlsx 検査: 22/22 OK
PASS  xlsx 検査が全件 OK
PASS  xlsx バッファを生成した
PASS  ファイル名が <CSV名>_<Start>-<End>.xlsx  — 代替サンプル工程表_20260901-20261010.xlsx
PASS  xlsx が ZIP として妥当  — 22517 bytes
      書き出し: out/代替サンプル工程表_20260901-20261010.xlsx (22517 bytes)

=== 受け入れ 4: 工程行を複製して 24 本にした CSV ===
PASS  工程 24 件を読み込んだ  — 24 件
PASS  24 件すべてを描画した  — 描画 24
      SVG 検査: 347/347 OK
PASS  SVG 検査が全件 OK
      xlsx 検査: 22/22 OK
PASS  xlsx 検査が全件 OK

=== 受け入れ 5: file:// ＋ オフラインで全機能が動く ===
PASS  file:// で開いた  — file:///home/user/C-bet/ganett/GaNett%E5%B7%A5%E7%A8%8B%E8%A1%A8%E3%83%84%E3%83%BC%E3%83%AB.html
PASS  外部通信が 1 本も出ていない  — 0 本
PASS  JS エラーが出ていない

=== 追加検査: 異常系 ===
PASS  必須列が無い CSV はエラーになる  — CSV: 必須列がありません → 工程線の形状
PASS  フックが生きている

ALL PASS  （受け入れ 1・2 の PDF／スクショ照合は未実施）
```

---

## 7. ステップ 2（復路）への申し送り

着手していないが、往路の段階で決めた／気づいたことを残す。

- **`Document.allRows` を追加した。** 行 4 以降の生の行を**空行込みで**保持し、
  各工程に `rawIndex`（`allRows` の添字）を持たせてある。復路が
  「変更対象のセルだけ書き換え、他は元のまま」（禁止事項 6）を満たすための土台。
- **`_data` は元 CSV の 124 列を列順どおり値そのまま持っている。** 復路の
  構造検査（行数・工程ID の一致）はこれだけで足りる。
- **共有ノードの矛盾検出**に必要な情報は `Process.startNode.id` /
  `endNode.id` で引ける。`nodeRowIndex()` が項目ID→行番号の索引を返す。
- 設計B 6.1 の 5 項目（GaNett が CSV を取り込めるか、派生値を再計算するか、
  共有ノードの規則、編集可能列の最終合意、0.5 日の扱い）は**未確認のまま**。
  ステップ 2 着手前に監督が GaNett 側に確認する必要がある。
- 4 章の仕様矛盾（xlsx の列レターと行の意味）は、**復路を書く前に共通仕様と
  設計 A を直して確定させること。** 復路は「設計 A / 設計 B どちらの往路の
  出力にも対応する」前提なので、両者の構成が揃っていないと成立しない。

---

## 8. 自前コード全文

ライブラリ（ExcelJS）を除いた、書いたコードの全文。

### 8.1 `src/shell.html` ― 画面の骨格と CSS

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GaNett工程表ツール</title>
<style>
:root {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #6b6b6b; --line: #d8d8d8;
  --panel: #f7f7f7; --ok: #1a7f37; --ng: #b42318; --warn: #9a6700;
  --row-h: 28px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font: 13px/1.5 "Segoe UI", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
  color: var(--fg); background: var(--bg);
  display: flex; flex-direction: column;
}
header { padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--panel); flex: 0 0 auto; }
header .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
header .row + .row { margin-top: 6px; }
header label { color: var(--muted); }
button, input, select { font: inherit; }
button { padding: 4px 12px; border: 1px solid var(--line); background: #fff; border-radius: 4px; cursor: pointer; }
button:hover:not(:disabled) { background: #eee; }
button:disabled { opacity: .45; cursor: not-allowed; }
.spacer { flex: 1 1 auto; }
.note { color: var(--muted); font-size: 12px; }

#grid { flex: 1 1 auto; display: grid; grid-template-columns: 220px 1fr; grid-template-rows: auto 1fr; min-height: 0; }
#corner { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--panel); }
#datehead-clip { overflow: hidden; border-bottom: 1px solid var(--line); background: var(--panel); }
#rowhead-clip { overflow: hidden; border-right: 1px solid var(--line); background: var(--panel); }
#scroller { overflow: auto; min-height: 0; }

table.date-head { border-collapse: collapse; table-layout: fixed; }
table.date-head td { border: 1px solid var(--line); text-align: center; font-size: 11px; padding: 1px 0; white-space: nowrap; }
table.date-head td.month { font-weight: bold; background: #eee; }
table.date-head td.we { background: #E8E8E8; }

table.row-head { border-collapse: collapse; width: 220px; table-layout: fixed; }
table.row-head td { border-bottom: 1px solid var(--line); padding: 0 4px; font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: var(--row-h); }
table.row-head td.rn { width: 34px; color: var(--muted); text-align: right; border-right: 1px solid var(--line); }

svg.plot-svg { display: block; }
svg.plot-svg text.pname { font-family: inherit; dominant-baseline: auto; }

#log { flex: 0 0 34%; overflow: auto; border-top: 1px solid var(--line);
  background: #fbfbfb; padding: 6px 10px; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.log-line { white-space: pre-wrap; }
.log-warn { color: var(--warn); }
.log-bad { color: var(--ng); font-weight: bold; }
.log-good { color: var(--ok); font-weight: bold; }
.log-head { margin: 8px 0 2px; font-weight: bold; }
.log-head.good { color: var(--ok); }
.log-head.bad { color: var(--ng); }
table.chk { border-collapse: collapse; margin-bottom: 6px; }
table.chk td { padding: 0 8px 0 0; vertical-align: top; }
table.chk tr.ok td:first-child { color: var(--ok); }
table.chk tr.ng td:first-child { color: var(--ng); font-weight: bold; }
table.chk tr.ng { background: #fff2f0; }
</style>
</head>
<body>
<header>
  <div class="row">
    <label>CSV</label><input type="file" id="file" accept=".csv,text/csv">
    <label>表示期間</label>
    <input type="date" id="start"> 〜 <input type="date" id="end">
    <label>1日の幅</label>
    <select id="zoom">
      <option value="12">12px</option>
      <option value="18">18px</option>
      <option value="24" selected>24px</option>
      <option value="32">32px</option>
      <option value="48">48px</option>
    </select>
    <button id="btn-render">描画</button>
    <button id="btn-xlsx" disabled>xlsx 書き出し</button>
    <span class="spacer"></span>
    <span class="note">ステップ 1（往路）／ 外部通信なし</span>
  </div>
</header>

<div id="grid">
  <div id="corner"></div>
  <div id="datehead-clip"><div id="datehead"></div></div>
  <div id="rowhead-clip"><div id="rowhead"></div></div>
  <div id="scroller"><div id="plot"></div></div>
</div>

<div id="log"></div>

<script>/*__EXCELJS__*/</script>
<script>/*__APP__*/</script>
</body>
</html>
```

### 8.2 `src/01-csv-model.js` ― CSV パーサと Document モデル

```js
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
const MS_DAY = 86400000;

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
const isWeekend = (d) => { const w = d.getUTCDay(); return w === 0 || w === 6; };
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
    const w = parseFloat(get(r, COL.weight));
    return {
      index: k,            // rows（工程行のみ）の添字
      rawIndex: rawIndex[k], // allRows（空行込み）の添字。復路の書き戻し先
      id,
      name: String(nameObj.name ?? ''),
      nameStyle: {
        textSize: String(nameObj.textSize || 'M'),
        bold: String(nameObj.nameBold || '') === 'true',
        color: String(nameObj.nameColor || ''),
        position: String(nameObj.namePosition || 'top'),
      },
      startNode: { id: get(r, COL.startNodeId), name: get(r, COL.startNodeName), row: startRow },
      endNode: { id: get(r, COL.endNodeId), name: get(r, COL.endNodeName), row: endRow },
      start, end,
      shape: String(get(r, COL.shape) || '').trim(),
      arrow: String(get(r, COL.arrow) || '').trim(),
      dash: String(get(r, COL.dash) || '').trim(),
      weight: Number.isFinite(w) && w > 0 ? w : 2,
      color: String(get(r, COL.color) || '').trim() || '#333333',
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
```

### 8.3 `src/02-geometry.js` ― 格子と形状規則

```js
/* ===================================================================
 * 02. 格子と形状規則
 * 共通仕様 4 章・5 章 / 設計B 3 章・5.2
 *
 * 形状ごとの折れ方は全て SHAPE_RULES 1 箇所に集約してある。
 * PDF 照合で規則が確定したら、このテーブルだけを直せばよい。
 * =================================================================== */

const DEFAULTS = {
  DAY_W: 24,   // 1 日の幅 px（ズームはこの値だけを変える）
  ROW_H: 28,   // 1 行の高さ px
};

/* 高さは ROW_H に対する比率で保持する（設計B 5.2）。基準 ROW_H = 28 */
const H_RATIO = {
  boxS: 10 / 28, boxM: 16 / 28, boxL: 22 / 28,
  barAutoAdjust: 14 / 28, barProcessNameAdjust: 8 / 28,
};
const TEXT_PX = { L: 16, M: 13, S: 11 };

const SHAPE_KIND = {
  straight: 'poly', xElbow: 'poly', yElbow: 'poly', crank: 'poly', gate: 'poly',
  boxS: 'box', boxM: 'box', boxL: 'box',
  barAutoAdjust: 'bar', barProcessNameAdjust: 'bar',
};

/** 表示期間から格子を作る */
function makeGeometry(doc, start, end, opt) {
  const o = Object.assign({}, DEFAULTS, opt || {});
  const days = dayDiff(start, end) + 1;
  let maxRow = 1;
  for (const p of doc.processes) {
    if (Number.isFinite(p.startNode.row)) maxRow = Math.max(maxRow, p.startNode.row);
    if (Number.isFinite(p.endNode.row)) maxRow = Math.max(maxRow, p.endNode.row);
  }
  return {
    start, end, days, maxRow,
    DAY_W: o.DAY_W, ROW_H: o.ROW_H,
    width: days * o.DAY_W,
    height: maxRow * o.ROW_H,
    dayIndex: (d) => dayDiff(start, d),
    /** 日付 index n の列の左端 x（共通仕様 4 章「開始境界」） */
    xAt: (n) => n * o.DAY_W,
    /** 行 r の中央 y（設計B 3 章） */
    yAt: (r) => (r - 1) * o.ROW_H + o.ROW_H / 2,
    dateAt: (n) => addDays(start, n),
  };
}

/**
 * 形状ごとの折れ方。
 * 返すのは (x0,y0) で始まり (x1,y1) で終わる折れ線の頂点列。
 * PROVISIONAL と書いた規則は PDF 照合で確定させること（設計B 5.2）。
 */
const SHAPE_RULES = {
  // 始点と終点を直線で結ぶ。行が違えば斜線（共通仕様 5.2）
  straight: (c) => [[c.x0, c.y0], [c.x1, c.y1]],

  // 始点で縦 → 終点行で横（共通仕様 5.2）
  yElbow: (c) => [[c.x0, c.y0], [c.x0, c.y1], [c.x1, c.y1]],

  // 始点行で横 → 終点で縦（共通仕様 5.2）
  xElbow: (c) => [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1]],

  // 縦 → 横 → 縦。横は中間の行（共通仕様 5.2、例 C1: 21→19→17）
  // PROVISIONAL: 中間の行は「項目ID（中間ノード）」が他工程のノードとして
  // 解決できればその行、できなければ開始行と終了行の中点を四捨五入した行。
  crank: (c) => {
    const yM = c.yAt(c.midRow);
    return [[c.x0, c.y0], [c.x0, yM], [c.x1, yM], [c.x1, c.y1]];
  },

  // 縦 → 横 → 縦。横は終了行、最後の縦で終了ノード行へ（共通仕様 5.2、例 D4）
  // PROVISIONAL: 2 本目の縦の x は「中間ノード日付」の開始境界。
  // 中間ノード日付が無い場合は終了境界に置く（＝yElbow に縮退する）。
  gate: (c) => {
    const xg = c.xMid == null ? c.x1 : c.xMid;
    const pts = [[c.x0, c.y0], [c.x0, c.y1], [xg, c.y1]];
    if (xg !== c.x1) pts.push([c.x1, c.y1]);
    return pts;
  },
};

/**
 * 斜行（工程線の斜行 = true）。
 * 「折れ線の縦部分を斜線にする」（共通仕様 3.3 / 5.2）。
 * PROVISIONAL: 縦の走りを 1 日分（SLANT_DAYS × DAY_W）だけ x 方向に寝かせる。
 * 隣接する横の走りが 1 日分に満たない場合はその長さまでで打ち切る。
 */
const SLANT_DAYS = 1;
function applySlant(pts, DAY_W) {
  if (pts.length < 3) return pts;
  const out = pts.map((p) => p.slice());
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], cc = out[i + 1];
    const abVertical = a[0] === b[0] && a[1] !== b[1];
    const bcVertical = b[0] === cc[0] && b[1] !== cc[1];
    if (abVertical && !bcVertical) {
      // 縦 → 横：縦の下端を横の向きへ寝かせる
      const dir = Math.sign(cc[0] - b[0]) || 1;
      const room = Math.abs(cc[0] - b[0]);
      b[0] += dir * Math.min(SLANT_DAYS * DAY_W, room);
    } else if (!abVertical && bcVertical) {
      // 横 → 縦：縦の上端を横の向きの逆へ寝かせる
      const dir = Math.sign(b[0] - a[0]) || 1;
      const room = Math.abs(b[0] - a[0]);
      b[0] -= dir * Math.min(SLANT_DAYS * DAY_W, room);
    }
  }
  // 寝かせた結果できた重複頂点を畳む
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

/** 工程 1 本の描画形状を決める。geo 非依存の純関数。 */
function shapeOf(p, geo, nodeRows) {
  const kind = SHAPE_KIND[p.shape] || 'poly';
  const n0 = geo.dayIndex(p.start);
  const n1 = geo.dayIndex(p.end);
  const x0 = geo.xAt(n0);              // 開始境界
  const x1 = geo.xAt(n1 + 1);          // 終了境界（終了日を含む）
  const y0 = geo.yAt(p.startNode.row);
  const y1 = geo.yAt(p.endNode.row);

  if (kind === 'box' || kind === 'bar') {
    const h = (H_RATIO[p.shape] || 0.5) * geo.ROW_H;
    return { kind, x0, x1, n0, n1, yc: y0, h, y0, y1 };
  }

  // crank の中間行
  let midRow = null;
  if (p.midNode && p.midNode.id && nodeRows.has(p.midNode.id)) midRow = nodeRows.get(p.midNode.id);
  if (midRow == null) midRow = Math.round((p.startNode.row + p.endNode.row) / 2);

  // gate の 2 本目の縦の x
  let xMid = null;
  if (p.midNode && p.midNode.date) {
    const nm = geo.dayIndex(p.midNode.date);
    if (nm > n0 && nm <= n1) xMid = geo.xAt(nm);
  }

  const rule = SHAPE_RULES[p.shape] || SHAPE_RULES.straight;
  let pts = rule({ x0, x1, y0, y1, midRow, xMid, yAt: geo.yAt, DAY_W: geo.DAY_W });
  if (p.slanted) pts = applySlant(pts, geo.DAY_W);
  // 始点・終点は必ず境界に一致させる（検査 5.4 の前提）
  pts[0] = [x0, y0];
  pts[pts.length - 1] = [x1, y1];
  return { kind: 'poly', pts, x0, x1, y0, y1, n0, n1, midRow, xMid };
}

/**
 * 折れ線を「1 日ごとの区間」に割る（設計B 5.2）。
 * 各区間に、その区間が属する日付 index と土日かどうかを付ける。
 */
function splitByDay(pts, geo) {
  const W = geo.DAY_W;
  const segs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    if (ax === bx) {
      // 縦（または斜行で潰れた区間）。属する日は隣接する横の向きで決める。
      let n = Math.floor(ax / W);
      if (Math.abs(ax / W - Math.round(ax / W)) < 1e-9) {
        const k = Math.round(ax / W);
        const goesRight = i + 2 < pts.length ? pts[i + 2][0] > ax : false;
        const cameFromLeft = i > 0 ? pts[i - 1][0] < ax : false;
        n = goesRight ? k : (cameFromLeft ? k - 1 : k);
      }
      segs.push({ x1: ax, y1: ay, x2: bx, y2: by, n });
      continue;
    }
    // x 方向に進む区間は日の境界で割る
    const dir = bx > ax ? 1 : -1;
    const t = (x) => (x - ax) / (bx - ax);
    const cuts = [ax];
    let k = dir > 0 ? Math.floor(ax / W) + 1 : Math.ceil(ax / W) - 1;
    while (dir > 0 ? k * W < bx : k * W > bx) { cuts.push(k * W); k += dir; }
    cuts.push(bx);
    for (let j = 0; j < cuts.length - 1; j++) {
      const sx = cuts[j], ex = cuts[j + 1];
      if (sx === ex) continue;
      const sy = ay + (by - ay) * t(sx);
      const ey = ay + (by - ay) * t(ex);
      const n = Math.floor(((sx + ex) / 2) / W);
      segs.push({ x1: sx, y1: sy, x2: ex, y2: ey, n });
    }
  }
  for (const s of segs) s.weekend = isWeekend(geo.dateAt(s.n));
  return segs;
}

/** 六角形（左右が尖る）。共通仕様 5.2 boxS/M/L */
function hexPoints(x0, x1, yc, h) {
  const inset = Math.min(h / 2, Math.max(0, (x1 - x0) / 4));
  const t = yc - h / 2, b = yc + h / 2;
  return [[x0, yc], [x0 + inset, t], [x1 - inset, t], [x1, yc], [x1 - inset, b], [x0 + inset, b]];
}
```

### 8.4 `src/03-render.js` ― SVG 描画

```js
/* ===================================================================
 * 03. SVG 描画（往路）
 * 共通仕様 5 章 / 設計B 5.2
 * render() は純関数。DOM は全消し→全生成する。
 * =================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  return n;
};
/** 座標は必ずこの書式で書く。検査 5.4 が d 属性を読み戻すため。 */
const num = (v) => (Math.round(v * 1000) / 1000).toString();
const seg2d = (s) => `M ${num(s.x1)} ${num(s.y1)} L ${num(s.x2)} ${num(s.y2)}`;

const GRID_COLOR = '#d8d8d8';
const WEEKEND_FILL = '#E8E8E8';
const NODE_R = 3.5;
const NAME_GAP = 4;

function markerId(color) { return 'arw-' + String(color).replace(/[^0-9a-zA-Z]/g, ''); }

/**
 * @returns {{svg:SVGElement, drawn:Array, skipped:Array, warnings:string[]}}
 */
function render(doc, start, end, opt) {
  const geo = makeGeometry(doc, start, end, opt);
  const nodeRows = nodeRowIndex(doc.processes);
  const warnings = [];
  const drawn = [], skipped = [];

  const svg = el('svg', {
    xmlns: SVG_NS, width: geo.width, height: geo.height,
    viewBox: `0 0 ${geo.width} ${geo.height}`, class: 'plot-svg',
  });

  const defs = el('defs');
  const clip = el('clipPath', { id: 'plot-clip' });
  clip.appendChild(el('rect', { x: 0, y: 0, width: geo.width, height: geo.height }));
  defs.appendChild(clip);
  const colors = new Set();
  for (const p of doc.processes) if (!p.deleted && p.arrow !== 'none') colors.add(p.color);
  for (const c of colors) {
    const m = el('marker', {
      id: markerId(c), viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    });
    m.appendChild(el('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: c }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  /* ---- 背景：土日列（共通仕様 4 章「休日 = 土曜・日曜」） ---------- */
  const bg = el('g', { class: 'bg' });
  for (let n = 0; n < geo.days; n++) {
    if (!isWeekend(geo.dateAt(n))) continue;
    bg.appendChild(el('rect', {
      x: geo.xAt(n), y: 0, width: geo.DAY_W, height: geo.height, fill: WEEKEND_FILL, class: 'weekend',
    }));
  }
  for (let n = 0; n <= geo.days; n++) {
    bg.appendChild(el('line', { x1: geo.xAt(n), y1: 0, x2: geo.xAt(n), y2: geo.height, stroke: GRID_COLOR, 'stroke-width': 1 }));
  }
  for (let r = 0; r <= geo.maxRow; r++) {
    const y = r * geo.ROW_H;
    bg.appendChild(el('line', { x1: 0, y1: y, x2: geo.width, y2: y, stroke: GRID_COLOR, 'stroke-width': 1 }));
  }
  svg.appendChild(bg);

  const plot = el('g', { class: 'plot', 'clip-path': 'url(#plot-clip)' });
  svg.appendChild(plot);

  /* ---- 関係線（共通仕様 5.2）。同名の関係線名を持つノード同士を結ぶ ---- */
  const relGroup = el('g', { class: 'relations' });
  const rel = new Map();
  const addRel = (name, x, y) => {
    if (!name) return;
    if (!rel.has(name)) rel.set(name, []);
    rel.get(name).push([x, y]);
  };

  /* ---- 工程 ------------------------------------------------------- */
  for (const p of doc.processes) {
    if (p.deleted) { skipped.push({ id: p.id, reason: '工程削除' }); continue; }
    if (!p.start || !p.end || !Number.isFinite(p.startNode.row) || !Number.isFinite(p.endNode.row)) {
      skipped.push({ id: p.id, reason: '日付または行番号が不正' }); continue;
    }
    // 完全に表示期間外なら描かない（共通仕様 4 章「クリップ」）
    if (p.end.getTime() < start.getTime() || p.start.getTime() > end.getTime()) {
      skipped.push({ id: p.id, reason: '表示期間外' }); continue;
    }
    if (!SHAPE_KIND[p.shape]) warnings.push(`${p.id}: 未知の形状「${p.shape}」→ straight として描画`);
    if (p.shape === 'gate' || p.shape === 'crank') {
      warnings.push(`${p.id}: ${p.shape} の折れ方は暫定規則です（PDF 照合で確定させること）`);
    }

    const sh = shapeOf(p, geo, nodeRows);
    const g = el('g', { class: 'proc', 'data-pid': p.id });
    const strokeDash = p.dash === 'dash' ? `${geo.DAY_W / 6} ${geo.DAY_W / 6}` : null;

    if (sh.kind === 'poly') {
      const segs = splitByDay(sh.pts, geo);
      segs.forEach((s, i) => {
        const isLast = i === segs.length - 1;
        // 稼働日は実線、土日は点線（共通仕様 5.1）。実線・点線列が dash なら全区間点線。
        const dashArr = (p.dash === 'dash' || s.weekend) ? (strokeDash || `${geo.DAY_W / 6} ${geo.DAY_W / 6}`) : null;
        g.appendChild(el('path', {
          class: 'seg', d: seg2d(s), fill: 'none', stroke: p.color, 'stroke-width': p.weight,
          'stroke-linecap': 'butt', 'stroke-dasharray': dashArr,
          'marker-end': (isLast && p.arrow !== 'none') ? `url(#${markerId(p.color)})` : null,
        }));
      });
    } else if (sh.kind === 'box') {
      const pts = hexPoints(sh.x0, sh.x1, sh.yc, sh.h);
      g.appendChild(el('polygon', {
        class: 'shape', points: pts.map((q) => `${num(q[0])},${num(q[1])}`).join(' '),
        fill: p.fillColor || 'none', stroke: p.color, 'stroke-width': p.weight,
        'stroke-dasharray': strokeDash,
      }));
    } else {
      const fill = p.shape === 'barProcessNameAdjust'
        ? (p.fillColor || lighten(p.color, 0.45))
        : (p.fillColor || p.color);
      g.appendChild(el('rect', {
        class: 'shape', x: num(sh.x0), y: num(sh.yc - sh.h / 2),
        width: num(sh.x1 - sh.x0), height: num(sh.h),
        fill, stroke: 'none',
      }));
    }

    // ノード丸（共通仕様 5.1。ノード形状 = none なら描かない）
    if (p.nodeShapeStart !== 'none') {
      g.appendChild(el('circle', { class: 'node node-start', cx: num(sh.x0), cy: num(sh.y0), r: NODE_R, fill: '#ffffff', stroke: p.color, 'stroke-width': 1.5 }));
    }
    if (p.nodeShapeEnd !== 'none') {
      g.appendChild(el('circle', { class: 'node node-end', cx: num(sh.x1), cy: num(sh.y1), r: NODE_R, fill: '#ffffff', stroke: p.color, 'stroke-width': 1.5 }));
    }

    // 工程線名（線の上）
    if (p.name) {
      const size = TEXT_PX[p.nameStyle.textSize] || TEXT_PX.M;
      const centered = sh.kind !== 'poly';
      const tx = centered ? (sh.x0 + sh.x1) / 2 : sh.x0 + NAME_GAP;
      const top = sh.kind === 'poly' ? sh.y0 : sh.yc - sh.h / 2;
      g.appendChild(Object.assign(el('text', {
        class: 'pname', x: num(tx), y: num(top - NAME_GAP),
        'font-size': size, 'font-weight': p.nameStyle.bold ? 'bold' : 'normal',
        fill: p.nameStyle.color || p.color, 'text-anchor': centered ? 'middle' : 'start',
      }), { textContent: p.name }));
    }

    addRel(p.relation.startName, sh.x0, sh.y0);
    addRel(p.relation.endName, sh.x1, sh.y1);
    plot.appendChild(g);
    drawn.push({ p, sh });
  }

  for (const [name, pts] of rel) {
    if (pts.length < 2) continue;
    const sorted = pts.slice().sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      relGroup.appendChild(el('path', {
        class: 'relation', 'data-relation': name,
        d: `M ${num(a[0])} ${num(a[1])} L ${num(b[0])} ${num(b[1])}`,
        fill: 'none', stroke: '#888888', 'stroke-width': 1, 'stroke-dasharray': '3 3',
      }));
    }
  }
  plot.insertBefore(relGroup, plot.firstChild);

  return { svg, geo, drawn, skipped, warnings };
}

/** 淡色化（barProcessNameAdjust の塗り） */
function lighten(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#cccccc';
  const v = parseInt(m[1], 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const r = mix((v >> 16) & 255), g = mix((v >> 8) & 255), b = mix(v & 255);
  return '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** 上の日付ヘッダー（HTML テーブル。設計B 3 章） */
function renderDateHeader(geo) {
  const table = document.createElement('table');
  table.className = 'date-head';
  const months = [];
  for (let n = 0; n < geo.days; n++) {
    const d = geo.dateAt(n);
    const key = d.getUTCFullYear() + '-' + d.getUTCMonth();
    const last = months[months.length - 1];
    if (last && last.key === key) last.span++;
    else months.push({ key, span: 1, label: `${d.getUTCMonth() + 1}月` });
  }
  const r1 = table.insertRow();
  for (const m of months) {
    const c = r1.insertCell(); c.colSpan = m.span; c.textContent = m.label; c.className = 'month';
  }
  const r2 = table.insertRow(), r3 = table.insertRow();
  for (let n = 0; n < geo.days; n++) {
    const d = geo.dateAt(n);
    const a = r2.insertCell(); a.textContent = d.getUTCDate();
    const b = r3.insertCell(); b.textContent = WEEKDAY_JA[d.getUTCDay()];
    a.style.width = b.style.width = geo.DAY_W + 'px';
    if (isWeekend(d)) { a.classList.add('we'); b.classList.add('we'); }
  }
  return table;
}

/** 左の行見出し（HTML テーブル。共通仕様 4 章 A 列。空行も再現する） */
function renderRowHeader(doc, geo) {
  const heads = rowHeadings(doc.processes);
  const table = document.createElement('table');
  table.className = 'row-head';
  for (let r = 1; r <= geo.maxRow; r++) {
    const tr = table.insertRow();
    tr.style.height = geo.ROW_H + 'px';
    const num = tr.insertCell(); num.className = 'rn'; num.textContent = r;
    const nm = tr.insertCell(); nm.className = 'rname'; nm.textContent = heads.get(r) || '';
  }
  return table;
}
```

### 8.5 `src/04-xlsx.js` ― xlsx 書き出し

```js
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
```

### 8.6 `src/05-verify.js` ― 機械検査

```js
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
        const want = isWeekend(addDays(start, n)) || p.dash === 'dash';
        if (want !== !!s.dash) dashNg++;
      }
      pushResult(results, dashNg === 0, p.id, '土日区間が点線・稼働日区間が実線であること',
        dashNg ? dashNg + ' 区間が不一致' : checked + ' 区間を検査');

      const wantMarker = p.arrow !== 'none';
      const hasMarker = segs.some((s) => !!s.marker);
      pushResult(results, wantMarker === hasMarker, p.id, '矢印の有無が 工程線の矢印 と一致',
        'CSV=' + (p.arrow || '(空)') + ' / 実測=' + (hasMarker ? 'あり' : 'なし'));
      const colorNg = segs.filter((s) => (s.color || '').toLowerCase() !== p.color.toLowerCase()).length;
      pushResult(results, colorNg === 0, p.id, '線色が 工程線の色 と一致', colorNg ? colorNg + ' 区間が不一致' : p.color);
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
      pushResult(results, (poly.getAttribute('stroke') || '').toLowerCase() === p.color.toLowerCase(),
        p.id, '枠線色 ＝ 工程線の色', poly.getAttribute('stroke'));

    } else {
      const rect = g.querySelector('rect.shape');
      if (!rect) { pushResult(results, false, p.id, 'バーが描かれていること', 'rect が無い'); continue; }
      const rx = +rect.getAttribute('x'), rw = +rect.getAttribute('width');
      const ry = +rect.getAttribute('y'), rh = +rect.getAttribute('height');
      pushResult(results, near(rx, x0), p.id, '左端 x ＝ 開始境界', '実測 ' + rx + ' / 期待 ' + x0);
      pushResult(results, near(rx + rw, x1), p.id, '右端 x ＝ 終了境界', '実測 ' + (rx + rw) + ' / 期待 ' + x1);
      pushResult(results, near(ry + rh / 2, y0), p.id, '中心 y ＝ 行の中央', '実測 ' + (ry + rh / 2) + ' / 期待 ' + y0);
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
    if (p.name) {
      const t = g.querySelector('text.pname');
      pushResult(results, !!t && t.textContent === p.name, p.id, '工程線名が描かれていること', t ? t.textContent : '無し');
      if (t) pushResult(results, near(+t.getAttribute('font-size'), TEXT_PX[p.nameStyle.textSize] || TEXT_PX.M),
        p.id, '文字サイズ ＝ textSize ' + p.nameStyle.textSize, t.getAttribute('font-size'));
    }
  }

  // 土日列の背景（共通仕様 4 章）
  const weRects = svgRoot.querySelectorAll('rect.weekend');
  let weExpected = 0;
  for (let n = 0; n <= dayDiff(start, end); n++) if (isWeekend(addDays(start, n))) weExpected++;
  pushResult(results, weRects.length === weExpected, '格子', '土日列の背景の本数',
    '実測 ' + weRects.length + ' / 期待 ' + weExpected);
  let wePos = 0;
  weRects.forEach((r) => {
    const n = Math.round(+r.getAttribute('x') / DAY_W);
    if (!isWeekend(addDays(start, n)) || !near(+r.getAttribute('width'), DAY_W)) wePos++;
  });
  pushResult(results, wePos === 0, '格子', '土日列の位置と幅', wePos ? wePos + ' 件が不正' : '');

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
    if (isWeekend(want) !== shaded) weFillNg++;
  }
  pushResult(results, dayNg === 0, 'xlsx', '行 2 の日付が表示期間と 1 日ずつ一致', dayNg ? dayNg + ' 列が不一致' : days + ' 列');
  pushResult(results, weekNg === 0, 'xlsx', '行 3 の曜日列が同じ日付を指すこと', weekNg ? weekNg + ' 列が不一致' : '');
  pushResult(results, weFillNg === 0, 'xlsx', '土日列が薄灰であること', weFillNg ? weFillNg + ' 列が不一致' : '');
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
    if (rule.type !== 'expression' || f !== want || gotArgb !== argb(p.color, '333333')) {
      cfNg++; cfDetail.push(p.id + ':' + f + '/' + gotArgb);
    }
  });
  pushResult(results, cfNg === 0, 'xlsx', '各行の条件付き書式の式と塗り色が正しいこと',
    cfNg ? cfDetail.slice(0, 3).join(' , ') : procs.length + ' 行');

  // _data（元 CSV の全列＋工程ID。列数は doc.headers から取る）
  const hdrRow = wd.getRow(1);
  const hdr = [];
  for (let c = 1; c <= doc.headers.length + 1; c++) hdr.push(hdrRow.getCell(c).value);
  pushResult(results, hdr[0] === COL.id, 'xlsx', DATA_SHEET + ' の 1 列目が 工程ID', String(hdr[0]));
  pushResult(results, hdr.slice(1).map((v) => v == null ? '' : String(v)).join(SEP) === doc.headers.join(SEP),
    'xlsx', DATA_SHEET + ' が元 CSV の見出しを列順どおり保持', (hdr.length - 1) + ' 列 / 元 ' + doc.headers.length + ' 列');
  let dataNg = 0;
  doc.processes.forEach((p, i) => {
    const row = wd.getRow(2 + i);
    if (String(row.getCell(1).value == null ? '' : row.getCell(1).value) !== p.id) { dataNg++; return; }
    const raw = doc.rows[p.index] || [];
    for (let c = 0; c < doc.headers.length; c++) {
      const got = row.getCell(2 + c).value;
      const gotS = got == null ? '' : (got.richText ? got.richText.map((t) => t.text).join('') : String(got));
      if (gotS !== String(raw[c] == null ? '' : raw[c])) { dataNg++; return; }
    }
  });
  pushResult(results, dataNg === 0, 'xlsx', DATA_SHEET + ' の全セルが元 CSV と等価',
    dataNg ? dataNg + ' 行が不一致' : doc.processes.length + ' 行');

  return results;
}
```

### 8.7 `src/06-ui.js` ― 画面まわり

```js
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

function loadCsvText(text, name) {
  clearLog();
  state.buffer = null;
  state.rendered = null;
  state.svgResults = []; state.xlsxResults = [];
  $('#btn-xlsx').disabled = true;
  state.doc = buildDocument(text, name);
  const d = state.doc;
  log('info', 'CSV 読み込み: ' + name);
  log('info', '  見出し ' + d.headers.length + ' 列 / 工程 ' + d.processes.length + ' 件');
  log('info', '  工程表の期間: ' + (d.meta.period || '(不明)'));
  const dist = {};
  for (const p of d.processes) dist[p.shape] = (dist[p.shape] || 0) + 1;
  log('info', '  形状分布: ' + Object.keys(dist).sort().map((k) => k + ' ' + dist[k]).join(', '));
  for (const w of d.warnings) log('warn', '警告: ' + w);
  setPeriodDefaults(d);
  return d;
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

  // 横スクロールの同期（設計B 3 章）
  const scroller = $('#scroller');
  scroller.addEventListener('scroll', () => {
    $('#datehead').style.transform = 'translateX(' + (-scroller.scrollLeft) + 'px)';
    $('#rowhead').style.transform = 'translateY(' + (-scroller.scrollTop) + 'px)';
  });

  log('info', 'GaNett工程表ツール（往路）。CSV を選んで［描画］を押してください。');
  log('info', 'ExcelJS ' + (window.ExcelJS ? '読み込み済み' : '未読み込み'));
}

/* 自動試験用のフック。UI を経由せずに同じ経路を叩く。 */
window.__GANETT__ = {
  loadCsvText,
  setPeriod(s, e) { $('#start').value = s; $('#end').value = e; },
  setZoom(v) { $('#zoom').value = String(v); },
  render: doRender,
  xlsx: () => doXlsx(false),
  get state() { return state; },
  results: () => ({ svg: state.svgResults, xlsx: state.xlsxResults }),
  logText: () => $('#log').innerText,
};

document.addEventListener('DOMContentLoaded', wire);
```

### 8.8 `tools/build-html.mjs` ― 単一 HTML の組み立て

```js
/*
 * src/*.js と src/shell.html から単一 HTML を組み立てる。
 * CDN 参照は作らない。ExcelJS はインライン同梱する。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'src');

const PARTS = [
  '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '06-ui.js',
];

const excelPath = join(root, 'vendor', 'exceljs.min.js');
if (!existsSync(excelPath)) {
  console.error('vendor/exceljs.min.js がありません');
  process.exit(1);
}
const exceljs = readFileSync(excelPath, 'utf8');
const license = readFileSync(join(root, 'vendor', 'exceljs.LICENSE'), 'utf8');

const app = PARTS.map((f) => readFileSync(join(src, f), 'utf8')).join('\n');

// インライン <script> を壊す並びが混ざっていないこと
for (const [name, body] of [['ExcelJS', exceljs], ['app', app]]) {
  if (/<\/script/i.test(body) || /<!--/.test(body)) {
    console.error(`${name} に <script> を壊す並びがあります`);
    process.exit(1);
  }
}

const banner = [
  '/*!',
  ' * ExcelJS 4.4.0 (MIT) — https://github.com/exceljs/exceljs',
  ...license.trim().split('\n').map((l) => ' * ' + l),
  ' */',
].join('\n');

let html = readFileSync(join(src, 'shell.html'), 'utf8');
html = html.replace('/*__EXCELJS__*/', () => banner + '\n' + exceljs);
html = html.replace('/*__APP__*/', () => app);

// 外部通信につながる書き方が残っていないこと（設計B 2 章）
const app_and_shell = app + readFileSync(join(src, 'shell.html'), 'utf8');
const banned = [
  [/\bfetch\s*\(/, 'fetch('],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bimportScripts\b/, 'importScripts'],
  // XML 名前空間 URI（取得されない識別子）だけは許す
  [/https?:\/\/(?!www\.w3\.org\/)/, 'http(s) URL'],
  [/<script[^>]+\bsrc=/i, 'script src'],
  [/<link[^>]+\bhref=/i, 'link href'],
  [/@import/, '@import'],
];
let ng = 0;
for (const [re, label] of banned) {
  if (re.test(app_and_shell)) { console.error(`自前コードに ${label} があります`); ng++; }
}
if (ng) process.exit(1);

const out = join(root, 'GaNett工程表ツール.html');
writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${out} (${kb} KB)`);
```

### 8.9 `tools/make-fixture.mjs` ― 代替サンプル CSV の生成

```js
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
```

### 8.10 `tools/acceptance.mjs` ― 受け入れ試験

```js
/*
 * ステップ 1 の受け入れ試験（設計B 5.5）を headless Chromium で実行する。
 * - file:// で開く
 * - browser context を offline にしてネットワーク遮断状態を再現する
 * - 外部リクエストが 1 本でも出たら失敗させる
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, 'out');
mkdirSync(OUT, { recursive: true });

const HTML = pathToFileURL(join(root, 'GaNett工程表ツール.html')).href;
const CSV = readFileSync(join(root, 'fixtures', '代替サンプル工程表.csv'), 'utf8');

/** 工程行を 1 本複製して 24 本にした CSV（受け入れ 4） */
function csvWith24(text) {
  const lines = text.split('\r\n');
  const body = lines.slice(3).filter((l) => l.trim() !== '');
  const dup = body[0].replace(/^P0001/, 'P0099').replace(/"id":"L0001"/, '"id":"L0099"');
  return [...lines.slice(0, 3), ...body, dup, ''].join('\r\n');
}

const report = [];
const say = (s) => { console.log(s); report.push(s); };
let failures = 0;
function assert(ok, label, detail) {
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await browser.newContext({ offline: true, viewport: { width: 1600, height: 1000 } });

// 外部通信が 1 本でも出たら記録する（設計B 2 章「外部通信ゼロ」）
const external = [];
ctx.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });

await page.goto(HTML);
await page.waitForFunction(() => !!window.__GANETT__ && !!window.ExcelJS);

/** 1 ケース実行して検査結果を返す */
async function runCase(csv, name, start, end, zoom) {
  return page.evaluate(async ([csv, name, start, end, zoom]) => {
    window.__GANETT__.loadCsvText(csv, name);
    window.__GANETT__.setPeriod(start, end);
    if (zoom) window.__GANETT__.setZoom(zoom);
    const r = window.__GANETT__.render();
    const x = await window.__GANETT__.xlsx();
    let b64 = null;
    if (x && x.buffer) {
      const u8 = new Uint8Array(x.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      b64 = btoa(s);
    }
    const res = window.__GANETT__.results();
    return {
      drawn: r.drawn.length, skipped: r.skipped.length,
      procCount: window.__GANETT__.state.doc.processes.length,
      headerCount: window.__GANETT__.state.doc.headers.length,
      svg: res.svg, xlsx: res.xlsx,
      fileName: x && x.name, b64,
      svgText: new XMLSerializer().serializeToString(r.svg),
      log: window.__GANETT__.logText(),
    };
  }, [csv, name, start, end, zoom]);
}

function summarize(tag, results) {
  const ng = results.filter((r) => !r.ok);
  say(`      ${tag}: ${results.length - ng.length}/${results.length} OK`);
  for (const r of ng.slice(0, 20)) say(`        NG ${r.scope} / ${r.label} / ${r.detail}`);
  return ng.length;
}

/* ---------------- 受け入れ 1（代替）: 2026/09/01–10/10 ---------------- */
say('\n=== 受け入れ 1（PDF 照合の代替）: 2026/09/01–10/10 で描画 ===');
say('   ※ Sample.zip の PDF が無いため、PDF との照合は実施できていない。');
say('     ここで検証しているのは「幾何が仕様どおりか」だけである。');
const c1 = await runCase(CSV, '代替サンプル工程表.csv', '2026-09-01', '2026-10-10');
assert(c1.procCount === 23, '工程 23 件を読み込んだ', `${c1.procCount} 件`);
assert(c1.headerCount === 124, '見出し 124 列を読み込んだ', `${c1.headerCount} 列`);
assert(c1.drawn === 23, '23 件すべてを描画した', `描画 ${c1.drawn} / 除外 ${c1.skipped}`);
assert(summarize('SVG 検査', c1.svg) === 0, 'SVG 検査が全件 OK');
writeFileSync(join(OUT, 'case1_09-01_10-10.svg'), c1.svgText);
await page.screenshot({ path: join(OUT, 'case1_09-01_10-10.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case1_plot.png') });

/* ---------------- 受け入れ 2（代替）: 2026/09/01–09/30 ---------------- */
say('\n=== 受け入れ 2（画面スクショ照合の代替）: 2026/09/01–09/30 ===');
say('   ※ 画面スクショ遠景.png が無いため、照合は実施できていない。');
const c2 = await runCase(CSV, '代替サンプル工程表.csv', '2026-09-01', '2026-09-30', 18);
assert(summarize('SVG 検査', c2.svg) === 0, 'SVG 検査が全件 OK');
say(`      描画 ${c2.drawn} 件 / 期間外で除外 ${c2.skipped} 件`);
writeFileSync(join(OUT, 'case2_09-01_09-30.svg'), c2.svgText);
await page.screenshot({ path: join(OUT, 'case2_09-01_09-30.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case2_plot.png') });

/* ---------------- 受け入れ 3: xlsx 検査 ---------------- */
say('\n=== 受け入れ 3: xlsx を書き出して読み戻し検査 ===');
say('   ※ 01_設計A 6 章が無いため、検査項目は共通仕様 4 章・6〜7 章と設計B 5.3 から導いた。');
assert(summarize('xlsx 検査', c1.xlsx) === 0, 'xlsx 検査が全件 OK');
assert(!!c1.b64, 'xlsx バッファを生成した');
assert(c1.fileName === '代替サンプル工程表_20260901-20261010.xlsx',
  'ファイル名が <CSV名>_<Start>-<End>.xlsx', String(c1.fileName));
if (c1.b64) {
  const buf = Buffer.from(c1.b64, 'base64');
  writeFileSync(join(OUT, c1.fileName), buf);
  assert(buf.slice(0, 2).toString() === 'PK', 'xlsx が ZIP として妥当', `${buf.length} bytes`);
  say(`      書き出し: out/${c1.fileName} (${buf.length} bytes)`);
}

/* ---------------- 受け入れ 4: 24 本にしても動く ---------------- */
say('\n=== 受け入れ 4: 工程行を複製して 24 本にした CSV ===');
const c4 = await runCase(csvWith24(CSV), '代替サンプル工程表_24本.csv', '2026-09-01', '2026-10-10');
assert(c4.procCount === 24, '工程 24 件を読み込んだ', `${c4.procCount} 件`);
assert(c4.drawn === 24, '24 件すべてを描画した', `描画 ${c4.drawn}`);
assert(summarize('SVG 検査', c4.svg) === 0, 'SVG 検査が全件 OK');
assert(summarize('xlsx 検査', c4.xlsx) === 0, 'xlsx 検査が全件 OK');

/* ---------------- 受け入れ 5: file:// ＋ ネットワーク遮断 ---------------- */
say('\n=== 受け入れ 5: file:// ＋ オフラインで全機能が動く ===');
assert(HTML.startsWith('file://'), 'file:// で開いた', HTML);
assert(external.length === 0, '外部通信が 1 本も出ていない',
  external.length ? external.slice(0, 5).join(', ') : '0 本');
assert(pageErrors.length === 0, 'JS エラーが出ていない', pageErrors.slice(0, 3).join(' | '));

/* ---------------- 追加: 異常系 ---------------- */
say('\n=== 追加検査: 異常系 ===');
const badHeader = (() => {
  const l = CSV.split('\r\n');
  l[2] = l[2].replace('工程線の形状', '形状もどき');
  return l.join('\r\n');
})();
const errMsg = await page.evaluate((csv) => {
  try { window.__GANETT__.loadCsvText(csv, 'bad.csv'); return null; }
  catch (e) { return e.message; }
}, badHeader);
assert(!!errMsg && errMsg.includes('必須列'), '必須列が無い CSV はエラーになる', String(errMsg));

const quoted = await page.evaluate(() => {
  // RFC 4180：引用内のカンマ・二重引用符・改行
  const t = 'a,b\r\n1,2\r\nx,y\r\n"p,q","r""s"\r\n';
  return typeof window.__GANETT__ === 'object';
});
assert(quoted, 'フックが生きている');

await browser.close();

say(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}  （受け入れ 1・2 の PDF／スクショ照合は未実施）`);
writeFileSync(join(OUT, 'acceptance.log'), report.join('\n') + '\n');
writeFileSync(join(OUT, 'inspection-case1.log'),
  c1.svg.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n\n'
  + c1.xlsx.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n');
process.exit(failures === 0 ? 0 : 1);
```

### 8.11 `tools/verify-xlsx-independent.py` ― openpyxl による独立検査

```python
#!/usr/bin/env python3
"""
出力 xlsx を ExcelJS とは別の実装（openpyxl）で読み直して検査する。
ExcelJS が自分の書いたものを読み返すだけでは「相互に間違っている」を
見逃すため、独立した読み手を 1 つ挟む。期待値は元 CSV から直接作る。
"""
import csv, io, json, re, sys, datetime
from pathlib import Path
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "fixtures" / "代替サンプル工程表.csv"
XLSX = sys.argv[1] if len(sys.argv) > 1 else str(
    ROOT / "out" / "代替サンプル工程表_20260901-20261010.xlsx")
START = datetime.date(2026, 9, 1)
END = datetime.date(2026, 10, 10)

fails = []
lines = []


def chk(ok, label, detail=""):
    if not ok:
        fails.append(label)
    lines.append(f"{'OK' if ok else 'NG'}\t{label}\t{detail}")


def as_date(v):
    """openpyxl は numFmt 'aaa' を日付書式と見なさないのでシリアル値のまま返す。
    Excel 自身は 'aaa' を曜日として描画するので、格納値は正しい。
    ここではどちらの形でも日付として読む（1900 日付システム）。"""
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, (int, float)):
        return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))
    return None


# ---- 元 CSV を素直に読む（ツールとは別経路） ----
raw = CSV_PATH.read_text(encoding="utf-8-sig")
rows = list(csv.reader(io.StringIO(raw)))
headers = rows[2]
H = {name: i for i, name in enumerate(headers)}
procs = []
for r in rows[3:]:
    if not any(c.strip() for c in r):
        continue
    name = json.loads(r[H["工程線名"]])[0]["name"]
    s = datetime.date.fromisoformat(r[H["開始日"]][:10])
    e = datetime.date.fromisoformat(r[H["終了日"]][:10])
    procs.append({
        "id": r[H["工程ID"]], "name": name, "start": s, "end": e,
        "color": r[H["工程線の色"]], "raw": r,
    })
procs = [p for p in procs if p["end"] >= START and p["start"] <= END]

wb = load_workbook(XLSX)
chk(wb.sheetnames == ["T10_Layout", "_data", "使い方"], "シート名と並び", str(wb.sheetnames))
ws = wb["T10_Layout"]
wd = wb["_data"]
chk(wd.sheet_state == "hidden", "_data が非表示", wd.sheet_state)
chk(ws.protection.sheet is True, "T10_Layout がシート保護されている", str(ws.protection.sheet))

days = (END - START).days + 1
COL0 = 6  # F 列
last = COL0 + days - 1

# 行 2 の日付、行 3 の曜日、土日の薄灰
bad_day = bad_wk = bad_fill = 0
for n in range(days):
    d = START + datetime.timedelta(days=n)
    c2 = ws.cell(row=2, column=COL0 + n)
    c3 = ws.cell(row=3, column=COL0 + n)
    v2 = as_date(c2.value)
    v3 = as_date(c3.value)
    if v2 != d:
        bad_day += 1
    if v3 != d:
        bad_wk += 1
    shaded = (c2.fill is not None and c2.fill.fgColor is not None
              and str(c2.fill.fgColor.rgb or "").upper().endswith("E8E8E8"))
    if (d.weekday() >= 5) != shaded:
        bad_fill += 1
chk(bad_day == 0, "行 2 の日付が 1 日ずつ一致", f"{days} 列 / NG {bad_day}")
chk(bad_wk == 0, "行 3 が同じ日付を指す", f"NG {bad_wk}")
chk(bad_fill == 0, "土日列が薄灰", f"NG {bad_fill}")
chk(ws.cell(row=2, column=COL0).number_format == "d", "行 2 の書式 d",
    ws.cell(row=2, column=COL0).number_format)
chk(ws.cell(row=3, column=COL0).number_format == "aaa", "行 3 の書式 aaa",
    ws.cell(row=3, column=COL0).number_format)

# 月見出しの結合
merges = {str(m) for m in ws.merged_cells.ranges}
months = sorted({(START + datetime.timedelta(days=n)).month for n in range(days)})
chk(len(merges) == len(months), "月見出しの結合が月数だけある", f"{sorted(merges)}")

# 1 行 1 工程・C/D・保護
bad_name = bad_date = bad_lock = 0
for i, p in enumerate(procs):
    r = 5 + i
    if ws.cell(row=r, column=2).value != p["name"]:
        bad_name += 1
    cs, ce = ws.cell(row=r, column=3), ws.cell(row=r, column=4)
    vs, ve = as_date(cs.value), as_date(ce.value)
    if vs != p["start"] or ve != p["end"]:
        bad_date += 1
    if cs.protection.locked is not False or ce.protection.locked is not False:
        bad_lock += 1
    if ws.cell(row=r, column=1).protection.locked is False:
        bad_lock += 1
chk(bad_name == 0, "1 行 1 工程で工程線名が一致", f"{len(procs)} 行 / NG {bad_name}")
chk(bad_date == 0, "C/D が元 CSV の開始日・終了日と一致", f"NG {bad_date}")
chk(bad_lock == 0, "C/D だけ編集可、A 列は保護", f"NG {bad_lock}")

# 条件付き書式
cfs = list(ws.conditional_formatting)
chk(len(cfs) == len(procs), "条件付き書式が工程数だけある", f"{len(cfs)} / {len(procs)}")
bad_cf = []
by_ref = {str(cf.sqref): cf for cf in cfs}
for i, p in enumerate(procs):
    r = 5 + i
    ref = f"F{r}:{ws.cell(row=r, column=last).column_letter}{r}"
    cf = by_ref.get(ref)
    if cf is None:
        bad_cf.append(f"{p['id']}:ref無し({ref})")
        continue
    rule = cf.rules[0]
    want = f"AND(F$2>=$C{r},F$2<=$D{r})"
    got = (rule.formula[0] if rule.formula else "").lstrip("=")
    rgb = str(rule.dxf.fill.fgColor.rgb or "").upper() if rule.dxf and rule.dxf.fill else ""
    want_rgb = "FF" + p["color"].lstrip("#").upper()
    if rule.type != "expression" or got != want or rgb != want_rgb:
        bad_cf.append(f"{p['id']}:{got}/{rgb}")
chk(not bad_cf, "条件付き書式の式と塗り色", "; ".join(bad_cf[:3]) or f"{len(procs)} 行")

# 入力規則
dv_cells = set()
for dv in ws.data_validations.dataValidation:
    chk(dv.type == "date", "入力規則が日付型", str(dv.type))
    for rng in str(dv.sqref).split():
        from openpyxl.utils.cell import range_boundaries
        c1, r1, c2, r2 = range_boundaries(rng)
        for rr in range(r1, r2 + 1):
            for cc in range(c1, c2 + 1):
                dv_cells.add((rr, cc))
want_dv = {(5 + i, c) for i in range(len(procs)) for c in (3, 4)}
chk(dv_cells == want_dv, "入力規則が全工程の C/D に付いている",
    f"{len(dv_cells)} セル / 期待 {len(want_dv)}")

# _data が元 CSV と等価
chk(wd.cell(row=1, column=1).value == "工程ID", "_data の 1 列目が 工程ID")
hdr = [wd.cell(row=1, column=c).value for c in range(2, len(headers) + 2)]
chk(hdr == headers, "_data が元 CSV の見出しを列順どおり保持",
    f"{len(hdr)} 列 / 元 {len(headers)} 列")
all_rows = [r for r in rows[3:] if any(c.strip() for c in r)]
bad_data = 0
for i, r in enumerate(all_rows):
    if str(wd.cell(row=2 + i, column=1).value or "") != r[H["工程ID"]]:
        bad_data += 1
        continue
    for c in range(len(headers)):
        got = wd.cell(row=2 + i, column=2 + c).value
        got = "" if got is None else str(got)
        if got != r[c]:
            bad_data += 1
            break
chk(bad_data == 0, "_data の全セルが元 CSV と等価", f"{len(all_rows)} 行 / NG {bad_data}")

out = "\n".join(lines)
print(out)
print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED'}  ({len(lines)} 項目)")
(ROOT / "out" / "inspection-openpyxl.log").write_text(out + "\n", encoding="utf-8")
sys.exit(0 if not fails else 1)
```

### 8.12 `tools/svgshot.mjs` ― SVG の全景 PNG 化

```js
/* 出力した SVG をそのまま開いて全景 PNG にする（実装メモ用） */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'out');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const f of process.argv.slice(2)) {
  const svg = readFileSync(join(OUT, f), 'utf8');
  const w = +/width="(\d+)"/.exec(svg)[1], h = +/height="(\d+)"/.exec(svg)[1];
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(join(OUT, f)).href);
  await p.screenshot({ path: join(OUT, basename(f, '.svg') + '_full.png') });
  console.log(basename(f, '.svg') + '_full.png', w + 'x' + h);
  await p.close();
}
await b.close();
```
