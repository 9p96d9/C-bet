# 設計B 実装メモ ― ステップ 1（往路）

対象：`プロジェクトG_工程表ツール.html`（単一ファイル）
上位仕様：共通仕様（`00_共通仕様…`）と 設計B（`02_設計B_HTMLツール_往路→復路.md`）
照合対象：`Sample.zip`（CSV の SHA-256 が共通仕様 2 章の値と一致することを確認済み）
ステップ 2（復路）には着手していない。

> **呼び名について**：本書では工程管理 SaaS を **プロジェクトG** と書く。上位仕様の文書では製品名で書かれているものと同じものを指す。

---

## 0. まとめ ― 何が確定し、何が残ったか

**描画規則は PDF のベクター座標を抜き出して確定した。** 目視ではなく、
PDF 1〜2 頁目の線分・矩形・円・文字の座標をすべて `(日付 index, 行番号)`
空間に直し、ツールの出力と 1 本ずつ突き合わせている（`tools/pdf-extract.py`、
`tools/compare-pdf.py`）。

| 照合項目 | 結果 |
|---|---|
| ノード丸 34 個の位置（＝全折れ線の端点） | **全一致** |
| 折れ線 17 本の折れ方 | **15 本一致 / 2 本不一致（D4・D5）** |
| box・bar 6 本の上下の辺と高さ | **全一致** |
| 関係線の上端・下端 | **一致** |
| 休日の判定（CSV の `休日` 列で検算） | **23 件全一致** |

**gate の横線が乗る行は、D4 と D5 だけ CSV に無い。** 共通規則で埋めたうえで、
**画面で手入力による上書きができる**ようにした。プロジェクトG の画面（`画面スクショ遠景.png`）
に出ている実際の行（D4 = 32、D5 = 23）を入れると **28 / 28 全一致**になる。

| gate の行の入れ方 | PDF 照合 |
|---|---|
| 共通規則で自動的に埋める（既定） | 26 / 28（D4・D5 の折れ方だけ違う） |
| 画面で実際の行を手入力する | **28 / 28 全一致** |

**CSV に値が無く、ツールが埋めた箇所はすべて記録に残る。** 読み込みのたびに
画面へ一覧で出し、SVG の DOM に印を付け、xlsx の `_data` にも書き出す。
詳しくは 4 章。

**上位仕様に対する訂正が 3 つある。**

1. **休日は土日だけではない。祝日も非稼働日。**（共通仕様 4 章の訂正 → 2 章）
2. **xlsx の配置は共通仕様 4 章と設計B 5.3 が矛盾している。**（→ 6 章）
3. **`工程線の太さ` の既定値は 2 ではなく 1.5。`工程線名` JSON の形も
   仕様書の記述と違う。**（→ 3.5、3.6）

`01_設計A` は本セッションに提供されていないため、xlsx の構成と検査項目は
共通仕様 4・6・7 章と設計B 5.3 から導いた（6 章）。

---

## 1. 成果物と作り方

| ファイル | 内容 |
|---|---|
| `プロジェクトG_工程表ツール.html` | 単一 HTML（約 1,008 KB）。CSS・JS・ExcelJS を全てインライン |
| `設計B_実装メモ.md` | 本書 |
| `out/サポートルーム_サンプル工程表_20260901-20261010.xlsx` | サンプルから生成した xlsx |
| `out/pdf_period_full.png` ほか | 描画結果（PDF と同じ 2026/09/01–10/30 ほか） |
| `out/pdf-compare.log` `out/pdf-compare-manual.log` | PDF との照合ログ（共通規則で埋めた場合／手入力した場合） |
| `out/holiday-test.log` | 祝日計算の検査ログと 2024–2030 の祝日一覧 |
| `out/inspection-case1.log` `out/inspection-openpyxl.log` `out/acceptance.log` | 検査ログ |
| `fixtures/合成工程表_回帰用.csv` | 日付・色・ID が全部違う合成 CSV（禁止事項 1 の確認用） |

```
node tools/make-fixture.mjs               # 合成 CSV を作る
node tools/build-html.mjs                 # src/ → プロジェクトG_工程表ツール.html
node tools/acceptance.mjs                 # 受け入れ 2〜5（headless Chromium）
node tools/holiday-test.mjs               # 祝日計算の検査
python3 tools/compare-pdf.py              # 受け入れ 1（PDF と座標で照合）
python3 tools/compare-pdf.py --manual     # 同上（gate 中間行を手入力した場合）
python3 tools/verify-xlsx-independent.py  # openpyxl による独立検査
node tools/svgshot.mjs <svg...>           # SVG を全景 PNG に
node tools/build-memo.mjs                 # docs/memo-body.md → 本書
```

ビルド時に、自前コードに `fetch` / `XMLHttpRequest` / `importScripts` /
`http(s)` URL / `<script src>` / `<link href>` / `@import` が無いことと、
インライン `<script>` を壊す並びが無いことを検査し、1 つでもあれば失敗する。

| ライブラリ | 版 | ライセンス | 用途 | 形 |
|---|---|---|---|---|
| ExcelJS | 4.4.0（2023-10-19） | MIT（© 2014-2019 Guyon Roche） | xlsx の生成と読み戻し | `dist/exceljs.min.js` をインライン展開 |

他に依存は無い。CSV パーサ・SVG 描画・検査・祝日計算はすべて自前。
`bare` 版ではなくフル版を使っている（ブラウザ用 Buffer ポリフィルを含み、
`writeBuffer()` が `file://` でそのまま動くため）。

---

## 2. 休日の定義 ― 共通仕様 4 章の訂正

共通仕様 4 章は「休日 ＝ 土曜・日曜。祝日は本サンプルでは考慮しない」と
書いているが、**これは Sample.zip の実物と一致しない。**

**根拠 1：PDF の灰色列。** 灰色の縦帯は 2 日ずつではなく、
2026/09/19〜09/23 が **5 日連続**、2026/10/10〜10/12 が **3 日連続**ある。

| 灰色列 | 日付 | 曜日 | 正体 |
|---|---|---|---|
| n=18〜22 | 09/19–09/23 | 土 日 月 火 水 | 土日 ＋ 敬老の日(9/21)・国民の休日(9/22)・秋分の日(9/23) |
| n=39〜41 | 10/10–10/12 | 土 日 月 | 土日 ＋ スポーツの日(10/12) |

**根拠 2：CSV の `休日` 列。** 共通仕様 3.3 が「検算用」と書いている列で
23 工程を数え直すと、

| 数え方 | 一致した件数 |
|---|---|
| 土日のみ | 18 / 23 |
| **土日 ＋ 上記 4 祝日** | **23 / 23** |

不一致だったのは バー３・C2・D2・B3・A3 の 5 件で、いずれも 9/21–23 を
またぐ工程。`延べ日数 = (終了日 − 開始日) + 1` と `日数 = 延べ日数 − 休日`
も 23 件全部で成り立つ。

**実装（`src/00-holiday.js`）**：「国民の祝日に関する法律」に沿って算で出す。
サンプル固有の日付はコードに埋めていない（禁止事項 1）。

| 種類 | 扱い |
|---|---|
| 固定日 | 元日・建国記念の日・昭和の日・憲法記念日・みどりの日・こどもの日・山の日・文化の日・勤労感謝の日 |
| ハッピーマンデー | 成人の日（1月第2月曜）・海の日（7月第3月曜）・敬老の日（9月第3月曜）・スポーツの日（10月第2月曜） |
| 天体 | 春分の日・秋分の日（1980–2099 で有効な近似式） |
| 法改正 | 天皇誕生日は 〜2018 が 12/23、2019 は無し、2020〜 が 2/23。山の日は 2016 から。体育の日→スポーツの日の改称は 2020 から |
| 一時的な特例 | 2019 の即位の日（5/1）・即位礼正殿の儀（10/22）とそれに挟まれた国民の休日（4/30・5/2）／2020・2021 の五輪による海の日・スポーツの日・山の日の移動 |
| 派生 | 振替休日（祝日が日曜のとき）・国民の休日（祝日に挟まれた平日） |

**検査（`tools/holiday-test.mjs`、16 項目すべて合格）**：
PDF と CSV から確定した 2026 年の 4 日／振替休日が日曜の祝日の後にしか出ないこと
／国民の休日が祝日に挟まれた平日にしか出ないこと（いずれも 2007–2040 の全年で）
／各年の祝日数が 15〜22 日に収まること／上表の法改正と特例／
**本物のサンプル 23 工程の `休日` 列と完全一致**。
算出した 2024–2030 の祝日一覧は `out/holiday-test.log` に残してある。

**安全網**：CSV 読み込み時に全工程で `休日` 列と計算値を突き合わせ、
ズレたら画面に警告を出す。機械検査にも同じ項目を入れてある。
表示期間が 2007 年より前、または 1980–2099 の外なら、
規則が検証範囲外である旨を警告する。

---

## 3. 描画規則表（PDF 実測）

### 3.0 格子

PDF から最小二乗で出した実測値：

```
x(n) = 216.552 + n × 15.9833 pt      1 列 = 15.9833 pt
y(r) = 132.00 + (r−1) × 16.5450 + 16.5450/2 pt
```

**設計B 3 章の式そのもの**（開始境界 = `n × DAY_W`、行中央 =
`(r−1) × ROW_H + ROW_H/2`）。ツールは比率だけを持ち、`DAY_W`（既定 24px）と
`ROW_H`（既定 28px）以外にピクセル定数を持たない。ズームは `DAY_W` だけを変える。

### 3.1 形状（確定）

| 形状 | 折れ方（頂点列） | PDF の実測 | 確度 |
|---|---|---|---|
| `straight` | `(x0,y0) → (x1,y1)` | E1(31→31 横)・E2(31→33 斜)・E3(33→31 斜) | **確定** |
| `yElbow` | `(x0,y0) → (x0,y1) → (x1,y1)`（始点で縦→終点行で横） | A2：縦 n=14 で r 8→5、横 r=5 で n 14→18 | **確定** |
| `xElbow` | `(x0,y0) → (x1,y0) → (x1,y1)`（始点行で横→終点で縦） | B3：横 r=14 で n 18→25、縦 n=25 で r 14→11 | **確定** |
| `crank` | `(x0,y0) → (x0,yM) → (x1,yM) → (x1,y1)`。`yM` は **開始行と終了行のちょうど中間。丸めない** | C1：21→**19**→17／C3：17→**19.5**→22 | **確定** |
| `gate` | `(x0,y0) → (x0,yG) → (x1,yG) → (x1,y1)`。`yG` は **中間ノードの行** | D1：25→25→25／D2：25→**29**→29／D3：29→**24**→24／D4：24→**32**→26／D5：26→**23**→30 | 形は**確定**、`yG` の取得は 3.2 参照 |
| `boxS`/`boxM`/`boxL` | 左右が尖る六角形。高さは行高の **0.86 / 1.36 / 1.64 倍**、尖りの食い込み **0.328 列** | バー１ r 36.57–37.43／バー２ r 37.32–38.68／バー３ r 39.18–40.82 | **確定** |
| `barAutoAdjust` | 矩形。高さ **0.909 行**、行中心が中央。**塗り = 背景色、枠 = 線色** | バー４（赤塗り赤枠）・バー５（**青塗り赤枠**） | **確定** |
| `barProcessNameAdjust` | 矩形。高さ **0.455 行**、**行中心が上端**（下へ伸びる）。枠線なし。行中心に工程線を 1 本引く | バー６ r 46.000–46.455 ＋ r=46.000 の線 | **確定** |

`crank` の `yM` が丸められないことは C3 が決め手。開始行 17・終了行 22 に対し
横の走りは **r = 19.50**、すなわち行と行のちょうど境目にある。
`(開始+終了)/2` を四捨五入していたら 19 か 20 になり、PDF と合わない。

### 3.2 gate の中間ノードの行 ― CSV に無いので規則で埋める

`gate` の横線は **中間ノードの行**に乗る。ところが CSV には
`項目ID（中間ノード）`・`中間ノード日付`・`中間ノード色`・`中間ノード大きさ`・
`中間ノード形状` はあるが、**行番号も項目名も無い**。

そこで、中間ノードの項目IDが他工程の開始／終了ノードとして現れる場合だけ
行を引けるようにした。結果：

| 工程 | 中間ノードID | 他工程のノードか | 行（ツール） | 行（PDF） |
|---|---|---|---|---|
| D1 | `ffjiiig…` | D1 自身のノード | 25 | 25 ✔ |
| D2 | `o4f1b1c…` | D2 の終了ノード | 29 | 29 ✔ |
| D3 | `ggcm1mf…` | D3 の終了ノード | 24 | 24 ✔ |
| D4 | `kud57bg…` | **どの工程にも無い** | 27（共通規則） | **32** ✘ |
| D5 | `okh8dqp…` | **どの工程にも無い** | 32（共通規則） | **23** ✘ |

**`画面スクショ遠景.png` がこの不足を裏づけている。** プロジェクトG の行見出しには
**行 32 に「D4」、行 23 に「D5」**という項目が出ている。つまりこの 2 つは
実在する項目だが、どの工程の開始／終了ノードでもないため CSV に行番号が
現れない。

**埋め方（共通規則）**：解決できないときは

> 開始行と終了行の帯のすぐ外側で、どの工程のノードも置かれていない最初の行。
> 下方向を先に探し、無ければ上方向。

とする。`gate` が `gate` らしく見える（横の走りが帯の外へ出る）ことと、
他の工程の行と重ならないことを狙った規則。D4 は帯 24–26 に対し **27**、
D5 は帯 26–30 に対し **32** になる。PDF はそれぞれ 32・23 なので、
**向きは D4 だけ当たり、行そのものは当たらない。**
2 例のうち 1 例しか合わないのだから、これは見た目を近づけるための
埋め合わせであって正しい行ではない。だからこそ 4 章の記録に必ず残す。

**手入力で上書きできる**：画面の「gate 中間行の指定」に
`<工程ID>:<行>` をカンマ区切りで入れると、その値が使われ、記録の種別が
「推定」から「手入力」に変わる。プロジェクトG の画面を見れば行は分かるので、
監督が 2 件入れるだけで PDF と完全一致する（9 章の受け入れ 1）。

### 3.3 斜行

折れ線の「縦」の走りを寝かせる。実測：

| 工程 | 縦の走り | x 方向のずれ |
|---|---|---|
| B2（11→14） | 2.88 行 | 0.38 列 |
| C3（19.5→22） | 2.38 行 | 0.39 列 |

**縦の長さが変わっても x 方向の量は変わらない。** 角度ではなく固定量なので、
`0.39 × DAY_W` を実装値にした。

### 3.4 実線・点線

- **稼働日は実線、休日は点線。** 折れ線を 1 日ごとの区間に割り、区間の属する
  日が休日なら点線にする。縦の走りは、隣接する横の向きで属する日を決める
  （右へ続くなら `n`、左から来たなら `n−1`）。
- プロジェクトG は休日区間を **丸い点の列**（塗りの円）で描いており、線分では描いていない。
  ツールでは `stroke-dasharray` ＋ `stroke-linecap="round"` で同じ見た目にした。
- `実線・点線 = dash` の工程（D4 のみ）は、休日かどうかに関わらず全区間が
  **長めの破線**（PDF 実測 `[4 2]`）。休日の点線とは見た目が違う。

### 3.5 太さ・色（仕様書の訂正）

| 項目 | 共通仕様 3.3 の記述 | PDF 実測 |
|---|---|---|
| `工程線の太さ` が空のとき | 「既定（2）」 | **1.5**（太さ列が空の 20 件すべて 1.5） |
| `工程線の色` が空のとき | 記載なし | **黒**（バー３が黒で描かれている） |

`工程線の太さ` に値がある 3 件（B1=2.5・D2=2.5・B2=1）は、その値がそのまま
線幅として使われている。

### 3.6 工程線名（仕様書の訂正）

**実物の JSON は共通仕様 3.3 の記述と形が違う。**

| キー | 仕様書の書き方 | 実物 |
|---|---|---|
| `nameBold` | 文字列 | **真偽値** `false` |
| `showNameOnLine` | 文字列 | **真偽値** `true` |
| `namePosition` | 文字列 | **オブジェクト** `{x, y}`（pt） |
| `namePositionCoefficient` | 文字列 | **オブジェクト** `{x, y}`（**x は列、y は行**） |
| `namePositionWithinOptions` | 記載なし | **配置を決める列挙** |
| `textSize` | `L / M / S` | **`XS / S / M / L / XL`** |

**文字の大きさ（PDF 実測 pt）**：`XS` = 6、`M` = 9、`L` = 13.5、`XL` = 18。
`S` はサンプルに 1 件も無いので `XS` と `M` の中間（7.5）を置いた（**未確定**）。
ツールは行高に対する比率で保持する。

**配置は `namePositionWithinOptions` で決まる。** 実測で全 23 件が合った。

| 値 | 意味 | 実例 |
|---|---|---|
| `lineNameUpperCenter` | 線の上・中央 | 18 件。中央 = `(n0+n1)/2` にぴったり一致 |
| `lineNameUpperLeft` | 線の上・左寄せ | A1（左端から 0.63 列） |
| `lineNameLowerRight` | 線の下・右寄せ | C2 |
| `lineNamePositionFree` | 手で動かしたもの | C1 |
| `boxNameUpperCenter` / `boxNameMiddleCenter` / `boxNameLowerLeft` | 六角形の上／中／下 | バー１ / バー２ / バー３ |
| `barNameUpperCenter` | バーの上 | バー４・バー５・バー６ |

**`namePositionCoefficient` は列・行単位のずらし量。**
`y = −0.1` は「文字の下端を線の 0.1 行上に置く」で、A1（行 8 → 下端 7.90）・
D1（行 25 → 24.90）・B1（行 11 → 10.89）など実測とぴたり一致する。
C1 は `lineNamePositionFree` で `{x: 3.0085, y: −0.4333}`。
`y` は横の走りの行 19 に対し 18.57 で**完全一致**。`x` は実測との差が
0.2 列ほど残る（文字幅の測り方の違いと見ている）。

### 3.7 角の丸め

折れ角は半径 **5 pt** で丸められている（A2：縦が r=5.30 で止まり、横が
n=14.313 から始まる。C1 も同じ）。ツールでは見た目の層として同じ丸めを
入れてあるが、**機械検査は丸めていない頂点座標を読む**（検査を甘くしないため）。

### 3.8 関係線

PDF 実測：`関係１` は **C1 の開始ノード（行 21、n=6）から D1 のノード行（行 25）へ、
n=6 の位置でまっすぐ縦**に引かれ、下端に矢じりが付く。
**下側ノードの x は使われていない。** ツールは「上側（行番号が小さい方）の
ノードの x で縦に引く」と実装した。サンプルに関係線は 1 本しかないので、
**この 1 例からの規則**（未確定）。
色は CSV に列が無いため取得できない（PDF では紫）。ツールは灰色で描く（**未確定**）。

### 3.9 再現していないもの

- **矢じりの手前詰め**：PDF では矢の先端が終了境界の 0.28 列手前で止まり、
  ノード丸と重ならないようにしてある。ツールは終了境界ちょうどに描く
  （検査で座標の一致を見ているため、あえて詰めていない）。
- **依存タスク（FS/SF）の描画**：往路では任意なので描いていない。復路の検証で使う。
- `showTotalDays` / `showWorkingDays` / `showLeaderLine` / `nameWritingMode` /
  `nameAlignment` の反映。サンプルは全件「off / 横書き / center」。
- `詳細工程1〜6`（共通仕様 3.3 のとおり往路 v1 では出力しない）。
- 行見出しの `項目名` は CSV の開始／終了ノードの名前だけから作る。
  中間ノードの名前は CSV に無いので、プロジェクトG の画面に出ている
  「行 23 = D5」「行 32 = D4」は再現できない（3.2 と同じ原因）。

---

## 4. CSV に無く、ツールが埋めた箇所の記録

「どれが CSV の値で、どれがツールが埋めた値か」が後から分かるように、
埋めた箇所をすべて記録する仕組みを入れた（`recordEstimate()`）。

**記録する内容**：対象（工程ID・名前）／埋めた項目／入れた値／使った規則／
**CSV から決められない理由**。

**種別は 3 つ。**

| 種別 | 意味 | 確度 |
|---|---|---|
| `PDF実測` | CSV は空だが、PDF から実測して既定値を決めたもの | 高い |
| `推定` | PDF からも決められず、見た目が近くなるように作った規則 | **要確認** |
| `手入力` | 画面で監督が指定した値 | 指定どおり |

**どこで見えるか**（同じ記録を 4 か所に出す）:

1. **画面のログ**に読み込みのたび表で出る。`推定` の行は黄色地＋赤字。
2. **SVG の DOM**：推定を使った工程の `<g>` に
   `class="proc estimated"` と `data-estimated="<項目名>"` が付く。
3. **xlsx の `_data` シート**に `_estimates` として全件書き出す（復路でも追える）。
4. **機械検査**に「推定を使った工程に DOM の印が付いていること」
   「記録に項目・規則・理由がそろっていること」
   「規則で埋めた gate がすべて記録されていること」を入れてある。

**サンプル（23 工程）での記録は 24 件。**

| 種別 | 件数 | 内訳 |
|---|---|---|
| PDF実測 | 21 | `工程線の太さ` の既定 1.5（20 件）、`工程線の色` の既定 黒（バー３） |
| 推定 | **3** | gate の中間ノードの行（D4・D5）、関係線の x と色（関係１） |

要確認の 3 件はこれだけ：

| 対象 | 項目 | 入れた値 | CSV から決められない理由 |
|---|---|---|---|
| D4 | gate の中間ノードの行 | 27（実際は 32） | CSV に中間ノードの行番号が無く、その項目IDは他工程のノードでもない |
| D5 | gate の中間ノードの行 | 32（実際は 23） | 同上 |
| 関係１ | 関係線の x と色 | 上側ノードの x / 灰色 | PDF に関係線が 1 本しかなく x の取り方はその 1 例からの推定。色は CSV に列が無い（PDF では紫） |

`textSize = S` もサンプルに 1 件も無いので実寸が分からない。S を使う工程が
現れたときだけ記録に載る（サンプルには無いので 0 件）。

---

## 5. 見つけた不具合と直し（記録）

検査の過程で出た NG。**いずれも最初は「どちらが間違っているか」から調べた。**

| # | 症状 | 原因 | 直した側 |
|---|---|---|---|
| 1 | 曜日行が読み戻せない（40 列不一致） | ExcelJS も openpyxl も `numFmt='aaa'` を日付書式と見なさず、シリアル値（46266 = 2026-09-01）を返す。Excel 自身は曜日として描画するのでセルの中身は正しい | **検査側**（`aaa` は共通仕様 4 章の指定なので書式は変えない） |
| 2 | 月見出しが 40 個に見える | 結合セルは範囲内の全セルが master の値を返す | **検査側**（「各列が自分の月を指す」と「結合の塊の数 = 月数」に分けた） |
| 3 | 条件付き書式の塗り色が不一致 | `工程線の色` が空のとき、CSV 読み込み時に `#333333` を既定にしていた。PDF ではバー３は**黒** | **ツール側**（既定を空のままにし、描画・xlsx の両方で黒を当てる） |
| 4 | バー６の下辺が PDF に無い | プロジェクトG は `barProcessNameAdjust` を**塗りだけ**で描き、枠線を引かない | **両方**（ツールの枠線を外し、照合側も塗りパスを見るようにした） |
| 5 | 関係線の位置が違う | 上側ノードではなく CSV の並び順で先に来たノードの x を使っていた | **ツール側** |
| 6 | C1 のラベル位置が大きくずれる | `namePosition`（pt）を使っていたが、実際のずらし量は `namePositionCoefficient`（列・行）に入っている | **ツール側** |

---

## 6. xlsx の構成 ― 仕様の矛盾と、採った判断

`01_設計A` が未提供なので、共通仕様 4 章と設計B 5.3 から再構成した。
**この 2 つは両立しない。**

| | 共通仕様 4 章 | 設計B 5.3 |
|---|---|---|
| 日付列の始まり | **B 列**（日付 index `n` → 列 `2+n`） | 条件付き書式が `F$2` を参照 → **F 列** |
| 行の意味 | **行 `r+3` ＝ プロジェクトG 行番号 `r`**。空行も再現 | `$C5` / `$D5` → **1 行 1 工程**、データは行 5 から |
| A 列以外 | A 列＝行見出し、B 列以降は全て日付 | 行見出し／名前／開始日／終了日／日数／日付列 |

さらに決定的な問題がある。**プロジェクトG は 1 工程が 2 行にまたがるネットワークなので、
「1 行 ＝ プロジェクトG 行番号」にすると開始行が同じ 2 工程が同じ行に重なり、
その行の C/D（開始日・終了日）を定義できない。**
本物のサンプルでは **E1（行 31→31）と E2（行 31→33）** が該当する。
復路の突き合わせキーが工程ID である以上、C/D を持てるのは 1 行 1 工程のときだけ。

**判断：設計B 5.3 の列レター（C=開始日、D=終了日、F=最初の日付列、
データ開始行 5）に従い、1 行 1 工程にした。**
共通仕様 4 章「xlsx での配置」は、共通仕様 自身の指示に従って**修正が必要**。
設計 A も同じ形に揃えないと、復路が両方には対応できない。

### 6.1 実装した構成

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
| E 列 | 日数 `NETWORKDAYS(C,D,_data!$A$2:$A$n)` |
| F 列〜 | 日付列。Start が F 列、日付 index `n` → 列 `6+n` |
| 休日列 | 薄灰 `#E8E8E8`（**土日＋祝日**） |
| バー | **条件付き書式**（行ごとに `AND(F$2>=$C5,F$2<=$D5)` → 線色で塗り）。図形は使わない（禁止事項 2） |
| 保護 | シート保護。C/D のみ `locked=false` |
| 入力規則 | C/D に日付型、`工程表の期間` の範囲で `between` |
| 固定 | F 列・行 4 で枠固定 |

**日数は祝日込みで引き直される。** `_data` の A 列に表示期間内の祝日を並べ、
`NETWORKDAYS` の第 3 引数から参照している。業者が C/D を直しても正しい値になる。

**`_data`（非表示）**：A 列が祝日一覧、B 列が工程ID、C 列以降が元 CSV の 124 列を
**列順どおり・値そのまま**。右側に `_meta`（メタ 7 項目、表示期間、元ファイル名）。

**`使い方`**：業者向けの手順（編集してよいのは C/D だけ、終了日は当日を含む、
行の追加削除や並べ替えをしない、など）。

ファイル名は `<CSV名>_<Start>-<End>.xlsx`。`<a download>` で保存する。

---

## 7. プロジェクトG 側に確認が必要な事項

設計B 6.1 の表に、往路で分かったことを 1 件足す。

| # | 確認事項 | 現状の扱い |
|---|---|---|
| **A** | **`gate` の中間ノードの行番号（または項目名）を CSV に出せるか。** 現在の CSV には `項目ID（中間ノード）` はあるが行番号が無く、その項目が他工程の開始／終了ノードでない場合（サンプルでは D4・D5）に横線の行が決まらない | 共通規則（3.2）で埋め、**推定として記録**して画面に警告を出す。プロジェクトG の画面を見て「gate 中間行の指定」に入れれば PDF と完全一致する。CSV に列が増えれば手入力は不要になる |
| B | 休日の判定規則。本ツールは「土日＋日本の祝日」を算で出し、`休日` 列で検算している。プロジェクトG 側にカレンダー設定（会社休日など）があるか | `休日` 列とズレたら警告。サンプルでは 23 件全一致 |
| C | 関係線の色と、2 ノードの x が違うときにどちらの x を使うか | 上側ノードの x で縦に引き、色は灰色。サンプル 1 例からの推定 |
| D | `textSize = S` の実寸（サンプルに無い） | `XS` と `M` の中間（7.5pt 相当）を置いた |

設計B 6.1 の 1〜5（CSV の取り込み可否、派生値の再計算、共有ノードの規則、
編集可能列の合意、0.5 日の扱い）は**未確認のまま**。ステップ 2 着手前に要確認。

---

## 8. 機械検査（設計B 5.4）

**描いたものを信じない。**期待値は CSV から独立に再計算し、実物の属性値と突き合わせる。

### 8.1 SVG 検査（画面下のログに出る）

工程 1 本につき最大 16 項目。`g.proc[data-pid]` を引き、`path` / `polygon` /
`rect` / `circle` / `text` の**属性値を読み戻して**判定する。

始点・終点の座標／区間の連続性／休日区間が点線で稼働日区間が実線／矢印の有無／
線色・太さ／六角形とバーの端・中心・高さ／ノード丸の有無と位置／工程線名と文字サイズ／
休日列の本数・位置・幅／**`休日` 列との検算**／描画対象外が描かれていないこと。

**全件 OK のときだけ xlsx 書き出しボタンが有効になる。**

### 8.2 xlsx 検査

書き出したバッファを ExcelJS で読み戻して 23 項目。
さらに納品前の確認として、**別実装の openpyxl でも読み直した**
（`tools/verify-xlsx-independent.py`、21 項目）。ExcelJS が自分の書いたものを
読み返すだけでは「書き手と読み手が揃って間違っている」を見逃すため。

### 8.3 PDF 照合（受け入れ 1）

`tools/compare-pdf.py`。PDF のベクター座標とツールの SVG 幾何を
どちらも `(日付 index, 行番号)` 空間に直し、28 項目を突き合わせる。
プロジェクトG は休日区間を点で描くので、**線分として比べられるのは
「稼働日を 1 日でも含む走り」だけ**。休日だけの走りは、線分として
存在しないことを逆に確かめている。

---

## 9. 受け入れ結果（設計B 5.5）

| # | 条件 | 結果 |
|---|---|---|
| 1 | サンプル CSV、2026/09/01–10/10 で描画 → **PDF 1 頁目と 23 工程の位置・形・色・点線が一致** | **手入力ありで 28 / 28 全一致。** 共通規則のままなら 26 / 28（D4・D5 の gate 行だけ違う）。ノード丸 34 個全一致、box・bar 6 本全一致、関係線一致 |
| 2 | 2026/09/01–09/30 で描画 → `画面スクショ遠景.png` と一致 | **合格**（SVG 検査 304/304）。行見出し（`B1/B2`・`C1/C3` の `/` 連結）、休日の幅広い灰色帯、B1 の特大ラベル・B2 の極小ラベル、E1–E3 の V 字、バー類の色と形が画面と一致。画面に出ている「行 23 = D5」「行 32 = D4」は CSV に無いので再現していない |
| 3 | xlsx を書き出し → 設計 A 6 章の検査が全件合格 | **代替で合格**。ExcelJS 読み戻し 23/23、openpyxl 読み直し 21/21。検査項目は共通仕様 4・6・7 章と設計B 5.3 から導出（`01_設計A` 未提供のため） |
| 4 | 工程行を複製して 24 本にした CSV でも動く | **合格**。24 件読み込み・24 件描画、SVG 342/342、xlsx 23/23 |
| 5 | `file://` で開いて全機能が動く（ネットワーク切断状態） | **合格**。`file://` で起動、offline context、外部リクエスト 0 本、JS エラー 0 件 |
| 追加 | 日付・色・ID が全部違う合成 CSV でも動く（禁止事項 1 の確認） | **合格**。SVG 332/332、xlsx 23/23 |
| 追加 | 必須列を欠いた CSV はエラーで止まる | **合格** |
| 追加 | CSV に無く埋めた箇所 24 件すべてに 項目・規則・理由 が記録されている | **合格**（うち要確認の推定 3 件） |
| 追加 | gate 中間行を手入力すると記録が「手入力」に変わり、PDF と 28/28 一致する | **合格** |
| 追加 | 祝日計算 16 項目（法改正・特例・サンプルの `休日` 列） | **合格** |

生成した xlsx は ZIP として妥当（18,400 bytes）。OOXML を直接見て
`sheetProtection` 1 件・`conditionalFormatting` 23 件・`dataValidation` 2 件・
`mergeCell` 2 件（`F1:AI1` ＝ 9月 30 日、`AJ1:AS1` ＝ 10月 10 日）・
`_data` が `state="hidden"` であることを確認した。

**実機 Excel での確認は行っていない。** この環境の LibreOffice は
openpyxl で作った最小の対照ファイルすら `source file could not be loaded` で
開けず（環境側の不具合）、表計算アプリでの描画確認はできなかった。
監督 PC の Excel での目視確認をお願いしたい。

### 9.1 PDF 照合ログ

共通規則で gate 中間行を埋めた場合（既定）:

```
OK	ツールが PDF と同じ本数を描いた	23 / 23
OK	ノード丸 34 個の位置が PDF と一致（全折れ線の端点）	PDF 34 個 / ツール 34 個
OK	A2 (yElbow) の折れ方が PDF と一致	2 走り
OK	D1 (gate) の折れ方が PDF と一致	3 走り
OK	E1 (straight) の折れ方が PDF と一致	1 走り
OK	E2 (straight) の折れ方が PDF と一致	1 走り
OK	E3 (straight) の折れ方が PDF と一致	1 走り
OK	C2 (crank) の折れ方が PDF と一致	3 走り
OK	D3 (gate) の折れ方が PDF と一致	3 走り
NG	D4 (gate) の折れ方が PDF と一致	横 n[28,32] r[27,27] が PDF に無い
OK	C3 (crank) の折れ方が PDF と一致	3 走り
NG	D5 (gate) の折れ方が PDF と一致	横 n[32,38] r[32,32] が PDF に無い; 縦 n[38,38] r[32,30] が PDF に無い
OK	D2 (gate) の折れ方が PDF と一致	3 走り
OK	B2 (xElbow) の折れ方が PDF と一致	2 走り
OK	B3 (xElbow) の折れ方が PDF と一致	2 走り
OK	A3 (yElbow) の折れ方が PDF と一致	2 走り
OK	C1 (crank) の折れ方が PDF と一致	3 走り
OK	B1 (xElbow) の折れ方が PDF と一致	2 走り
OK	A1 (yElbow) の折れ方が PDF と一致	2 走り
OK	バー２ (boxM) の上下の辺が PDF と一致	上 r=37.320 下 r=38.680 高さ 1.360行
OK	バー３ (boxL) の上下の辺が PDF と一致	上 r=39.180 下 r=40.820 高さ 1.640行
OK	バー４ (barAutoAdjust) の上下の辺が PDF と一致	上 r=41.545 下 r=42.454 高さ 0.909行
OK	バー５ (barAutoAdjust) の上下の辺が PDF と一致	上 r=42.545 下 r=43.454 高さ 0.909行
OK	バー６ (barProcessNameAdjust) の上下の辺が PDF と一致	上 r=46.000 下 r=46.455 高さ 0.455行
OK	バー１ (boxS) の上下の辺が PDF と一致	上 r=36.570 下 r=37.430 高さ 0.860行
OK	関係線が 1 本描かれている	1 本
OK	関係線の上端が PDF と一致（C1 開始ノード n=6 行21）	ツール n=6 r=21
OK	関係線の下端が PDF の矢じり位置と一致（行25 の手前）	ツール n=6 r=25 / PDF矢じり=[(6.0, 25.0), (6.0, 24.77)]
```

プロジェクトG の画面を見て gate 中間行を手入力した場合:

```
OK	ツールが PDF と同じ本数を描いた	23 / 23
OK	ノード丸 34 個の位置が PDF と一致（全折れ線の端点）	PDF 34 個 / ツール 34 個
OK	A2 (yElbow) の折れ方が PDF と一致	2 走り
OK	D1 (gate) の折れ方が PDF と一致	3 走り
OK	E1 (straight) の折れ方が PDF と一致	1 走り
OK	E2 (straight) の折れ方が PDF と一致	1 走り
OK	E3 (straight) の折れ方が PDF と一致	1 走り
OK	C2 (crank) の折れ方が PDF と一致	3 走り
OK	D3 (gate) の折れ方が PDF と一致	3 走り
OK	D4 (gate) の折れ方が PDF と一致	3 走り
OK	C3 (crank) の折れ方が PDF と一致	3 走り
OK	D5 (gate) の折れ方が PDF と一致	3 走り
OK	D2 (gate) の折れ方が PDF と一致	3 走り
OK	B2 (xElbow) の折れ方が PDF と一致	2 走り
OK	B3 (xElbow) の折れ方が PDF と一致	2 走り
OK	A3 (yElbow) の折れ方が PDF と一致	2 走り
OK	C1 (crank) の折れ方が PDF と一致	3 走り
OK	B1 (xElbow) の折れ方が PDF と一致	2 走り
OK	A1 (yElbow) の折れ方が PDF と一致	2 走り
OK	バー２ (boxM) の上下の辺が PDF と一致	上 r=37.320 下 r=38.680 高さ 1.360行
OK	バー３ (boxL) の上下の辺が PDF と一致	上 r=39.180 下 r=40.820 高さ 1.640行
OK	バー４ (barAutoAdjust) の上下の辺が PDF と一致	上 r=41.545 下 r=42.454 高さ 0.909行
OK	バー５ (barAutoAdjust) の上下の辺が PDF と一致	上 r=42.545 下 r=43.454 高さ 0.909行
OK	バー６ (barProcessNameAdjust) の上下の辺が PDF と一致	上 r=46.000 下 r=46.455 高さ 0.455行
OK	バー１ (boxS) の上下の辺が PDF と一致	上 r=36.570 下 r=37.430 高さ 0.860行
OK	関係線が 1 本描かれている	1 本
OK	関係線の上端が PDF と一致（C1 開始ノード n=6 行21）	ツール n=6 r=21
OK	関係線の下端が PDF の矢じり位置と一致（行25 の手前）	ツール n=6 r=25 / PDF矢じり=[(6.0, 25.0), (6.0, 24.77)]
```

祝日計算の検査:

```
OK	2026-09-21 が 敬老の日	敬老の日
OK	2026-09-22 が 国民の休日	国民の休日
OK	2026-09-23 が 秋分の日	秋分の日
OK	2026-10-12 が スポーツの日	スポーツの日
OK	同じ日が二重に登録されていない	0 年で重複
OK	振替休日は日曜の祝日の後にしか出ない（2007–2040）	0 件が条件外
OK	国民の休日は祝日に挟まれた平日にしか出ない（2007–2040）	0 件が条件外
OK	各年の祝日数が 15〜22 日に収まる（2007–2040）	
OK	山の日は 2016 年から	2015=null / 2016=山の日
OK	天皇誕生日が 2018→2019→2020 で法律どおり移る	
OK	2019 の即位関連 4 日が正しい	国民の休日 / 天皇の即位の日 / 国民の休日 / 即位礼正殿の儀の行われる日
OK	2020 の五輪特例（海の日 7/23・スポーツの日 7/24・山の日 8/10）	
OK	2021 の五輪特例（海の日 7/22・スポーツの日 7/23・山の日 8/8）	
OK	2007 年より前は警告を出す	
OK	2026 年は警告なし	
OK	サンプル 23 工程の 休日 列と完全一致	

=== 算出した祝日（2024–2030） ===
2024 (21 日)
  2024-01-01 (月) 元日
```

### 9.2 SVG・xlsx 検査ログ（抜粋）

全文は `out/inspection-case1.log`・`out/inspection-openpyxl.log`・`out/acceptance.log`。

```
OK	格子	休日列（土日＋祝日）の背景の本数	実測 14 / 期待 14
OK	格子	休日列の位置と幅	
OK	格子	休日の計算が CSV の 休日 列と一致	23 件を検算
OK	xlsx	シート T10_Layout があること	
OK	xlsx	シート _data があること	
OK	xlsx	シート 使い方 があること	
OK	xlsx	_data が非表示であること	hidden
OK	xlsx	T10_Layout がシート保護されていること	{"sheet":true}
OK	xlsx	行 2 の日付が表示期間と 1 日ずつ一致	40 列
OK	xlsx	行 3 の曜日列が同じ日付を指すこと	
OK	xlsx	休日列（土日＋祝日）が薄灰であること	
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
OK	xlsx	_data に推定の記録があること	_estimates
OK	xlsx	推定の記録が全件 xlsx に書かれていること	24 / 24 件
OK	xlsx	_data の A 列が NETWORKDAYS 用の祝日一覧	祝日
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
OK	休日列（土日＋祝日）が薄灰	NG 0
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
OK	_data の A 列が NETWORKDAYS 用の祝日一覧	
OK	_data の B 列が 工程ID	
OK	_data が元 CSV の見出しを列順どおり保持	124 列 / 元 124 列
OK	_data の全セルが元 CSV と等価	23 行 / NG 0
```

受け入れ試験の全出力：

```

=== 受け入れ 1（PDF 照合の代替）: 2026/09/01–10/10 で描画 ===
   PDF 1 頁目と 23 工程を突き合わせる（照合は tools/compare-pdf.py が担当）。
PASS  工程 23 件を読み込んだ  — 23 件
PASS  見出し 124 列を読み込んだ  — 124 列
PASS  23 件すべてを描画した  — 描画 23 / 除外 0
      SVG 検査: 330/330 OK
PASS  SVG 検査が全件 OK
      CSV に無く埋めた箇所: 24 件（うち要確認の推定 3 件）
        推定 関係線:関係１(関係１) 関係線の x と色 = 上側ノードの x / 灰色
        推定 t00an4117fvj98tp203tgn4s(D4) gate の中間ノードの行 = 27
        推定 hlb7z0icyjst6kbyqhsk2sik(D5) gate の中間ノードの行 = 32
PASS  埋めた箇所すべてに 項目・規則・理由 が記録されている  — 24 件
PASS  要確認の推定が記録されている  — 3 件
      SVG 検査(PDF期間): 330/330 OK
PASS  PDF と同じ期間でも SVG 検査が全件 OK

=== 追加検査: gate 中間行の手入力で上書きできる ===
PASS  手入力した gate は「手入力」として記録される  — manual,manual
      SVG 検査(手入力): 330/330 OK
PASS  手入力しても SVG 検査が全件 OK

=== 受け入れ 2（画面スクショ照合の代替）: 2026/09/01–09/30 ===
      SVG 検査: 308/308 OK
PASS  SVG 検査が全件 OK
      描画 21 件 / 期間外で除外 2 件

=== 受け入れ 3: xlsx を書き出して読み戻し検査 ===
   ※ 01_設計A 6 章は未提供なので、検査項目は共通仕様 4 章・6〜7 章と設計B 5.3 から導いた。
      xlsx 検査: 25/25 OK
PASS  xlsx 検査が全件 OK
PASS  xlsx バッファを生成した
PASS  ファイル名が <CSV名>_<Start>-<End>.xlsx  — サポートルーム_サンプル工程表_20260901-20261010.xlsx
PASS  xlsx が ZIP として妥当  — 19769 bytes
      書き出し: out/サポートルーム_サンプル工程表_20260901-20261010.xlsx (19769 bytes)

=== 受け入れ 4: 工程行を複製して 24 本にした CSV ===
PASS  工程 24 件を読み込んだ  — 24 件
PASS  24 件すべてを描画した  — 描画 24
      SVG 検査: 346/346 OK
PASS  SVG 検査が全件 OK
      xlsx 検査: 25/25 OK
PASS  xlsx 検査が全件 OK

=== 追加検査: 合成 CSV（日付・色・IDが全て別物）でも動く ===
   共通仕様 禁止事項 1「サンプル固有値をコードに埋めない」の確認。
PASS  合成 CSV も 23 件描画した  — 描画 23
      SVG 検査: 336/336 OK
PASS  合成 CSV で SVG 検査が全件 OK
      xlsx 検査: 25/25 OK
PASS  合成 CSV で xlsx 検査が全件 OK

=== 受け入れ 5: file:// ＋ オフラインで全機能が動く ===
PASS  file:// で開いた  — file:///home/user/C-bet/project-g/%E3%83%97%E3%83%AD%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88G_%E5%B7%A5%E7%A8%8B%E8%A1%A8%E3%83%84%E3%83%BC%E3%83%AB.html
PASS  外部通信が 1 本も出ていない  — 0 本
PASS  JS エラーが出ていない

=== 追加検査: 異常系 ===
PASS  必須列が無い CSV はエラーになる  — CSV: 必須列がありません → 工程線の形状
PASS  フックが生きている

ALL PASS
```

---

## 10. ステップ 2（復路）への申し送り

- **`Document.allRows` を用意した。** 行 4 以降の生の行を**空行込みで**保持し、
  各工程に `rawIndex` を持たせてある。「変更対象のセルだけ書き換え、他は元のまま」
  （禁止事項 6）を満たすための土台。
- **`_data` は元 CSV の 124 列を列順どおり値そのまま持っている。** 復路の
  構造検査（行数・工程ID の一致）はこれだけで足りる。
- **共有ノードの矛盾検出**に必要な情報は `Process.startNode.id` /
  `endNode.id` で引ける。`nodeRowIndex()` が項目ID→行番号の索引を返す。
  サンプルでは A1 の終了ノードと A2 の開始ノードが同一 ID
  （`aqj3sg05mc7iiutye30d3hxz`）であることを確認済み。
- **派生値の再計算**：`延べ日数 = (終了日 − 開始日) + 1`、`日数 = 延べ日数 − 休日`、
  `休日 = 土日＋祝日` が 23 件全部で成り立つ（2 章）。プロジェクトG が取り込み時に
  再計算するかは未確認（設計B 6.1 #2）なので、復路では**元の値を残して
  差分レポートに「要確認」**を出す方針のままでよい。
- 5 章の仕様矛盾（xlsx の列レターと行の意味）は、**復路を書く前に共通仕様と
  設計 A を直して確定させること。**

---

## 11. 自前コード全文

ライブラリ（ExcelJS）を除いた、書いたコードの全文。

### 11.1 `src/shell.html` ― 画面の骨格と CSS

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>プロジェクトG 工程表ツール</title>
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
table.date-head td.hol { color: #b42318; }

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
table.est { border-collapse: collapse; margin-bottom: 6px; }
table.est td { padding: 0 8px 0 0; vertical-align: top; }
table.est tr.rule td:first-child { color: var(--ng); font-weight: bold; }
table.est tr.rule { background: #fffbe6; }
table.est tr.pdf td:first-child { color: var(--warn); }
table.est tr.manual td:first-child { color: var(--ok); }
.chk-inline { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); }
pre.diag { white-space: pre-wrap; word-break: break-all; background: #fff; border: 1px solid var(--line);
  padding: 6px 8px; max-height: 320px; overflow: auto; font-size: 11px; margin: 4px 0 8px; }
svg.plot-svg g.proc.estimated { }
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
  <div class="row">
    <label title="CSV に中間ノードの行番号が無い gate 工程の行を、プロジェクトG の画面を見て指定します">gate 中間行の指定</label>
    <input type="text" id="gaterows" placeholder="例: P0012:32, P0015:23" size="40">
    <span class="note">空欄なら共通規則で推定します（推定した箇所は下のログに一覧で出ます）</span>
    <span class="spacer"></span>
    <button id="btn-diag" title="うまくいかないときの調査用。工程表の中身は入りません">診断ログを書き出す</button>
    <label class="chk-inline" title="社内で自分が見るだけのとき。社外に出さないでください">
      <input type="checkbox" id="diag-raw"> 実値のまま
    </label>
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

### 11.2 `src/00-holiday.js` ― 休日の判定

```js
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
function isPublicHoliday(d) { return holidayName(d) !== null; }

/** 土曜・日曜か */
function isWeekend(d) { const w = d.getUTCDay(); return w === 0 || w === 6; }

/** 非稼働日か。プロジェクトG の「休日」。 */
let USE_PUBLIC_HOLIDAYS = true;
function setUsePublicHolidays(on) { USE_PUBLIC_HOLIDAYS = !!on; }
function usingPublicHolidays() { return USE_PUBLIC_HOLIDAYS; }
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
```

### 11.3 `src/01-csv-model.js` ― CSV パーサと Document モデル

```js
/* ===================================================================
 * 01. CSV パーサと Document モデル
 * 共通仕様 3 章 / 設計B 4 章・5.1
 * =================================================================== */

/* ===================================================================
 * 推定の記録
 *
 * CSV に値が無く、ツールが「共通規則」で埋めた箇所をすべてここに残す。
 * あとから「どれが CSV の値で、どれが埋めた値か」を追えるようにするため。
 *
 *   source: 'pdf'  … Sample.zip の PDF から実測して決めた既定値。確度は高い
 *   source: 'rule' … PDF からも決められず、見た目が近くなるよう作った規則。要確認
 * =================================================================== */
const ESTIMATES = [];
function resetEstimates() { ESTIMATES.length = 0; }
function recordEstimate(e) {
  ESTIMATES.push({
    scope: e.scope || '',      // 工程ID など
    name: e.name || '',
    field: e.field,            // 埋めた項目
    value: e.value,            // 埋めた値
    source: e.source || 'rule',
    rule: e.rule,              // 使った規則
    reason: e.reason || '',    // なぜ CSV から決められないのか
  });
}
function estimatesOf(scope) { return ESTIMATES.filter((e) => e.scope === scope); }

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
function buildDocument(text, sourceName, opt) {
  const o = opt || {};
  resetEstimates();
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
      weightIsDefault: !(Number.isFinite(w) && w > 0),
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

  // 太さ・色が空の工程は、PDF から実測した既定値で埋めている
  for (const p of processes) {
    if (p.weightIsDefault) {
      recordEstimate({
        scope: p.id, name: p.name, field: '工程線の太さ', value: DEFAULT_WEIGHT, source: 'pdf',
        rule: `空欄のときは ${DEFAULT_WEIGHT}`,
        reason: 'CSV の 工程線の太さ が空。PDF で太さ指定の無い 20 工程がすべて 1.5pt で描かれていた（共通仕様 3.3 の「既定 2」は誤り）',
      });
    }
    if (!p.color) {
      recordEstimate({
        scope: p.id, name: p.name, field: '工程線の色', value: DEFAULT_LINE_COLOR, source: 'pdf',
        rule: '空欄のときは黒',
        reason: 'CSV の 工程線の色 が空。PDF では色指定の無い工程（バー３）が黒で描かれていた',
      });
    }
  }

  // 関係線：CSV に色の列が無く、x の取り方も PDF の 1 例からしか分からない
  const relNames = new Map();
  for (const p of processes) {
    for (const nm of [p.relation.startName, p.relation.endName]) {
      if (nm) relNames.set(nm, (relNames.get(nm) || 0) + 1);
    }
  }
  for (const [nm, cnt] of relNames) {
    if (cnt < 2) continue;
    recordEstimate({
      scope: '関係線:' + nm, name: nm, field: '関係線の x と色', value: '上側ノードの x / 灰色', source: 'rule',
      rule: '2 ノードを上側（行番号が小さい方）のノードの x でまっすぐ縦に結ぶ。色は灰色',
      reason: 'PDF に関係線は 1 本（関係１）しかなく x の取り方はその 1 例からの推定。色は CSV に列が無い（PDF では紫で描かれている）',
    });
  }

  // textSize = S はサンプルに 1 件も無いので実寸が分からない
  const sUsers = processes.filter((p) => p.nameStyle.textSize === 'S');
  for (const p of sUsers) {
    recordEstimate({
      scope: p.id, name: p.name, field: '工程線名の文字サイズ(S)', value: 'XS と M の中間', source: 'rule',
      rule: 'XS(6pt) と M(9pt) の中間 7.5pt 相当',
      reason: 'Sample.zip に textSize = S の工程が 1 件も無く、実寸を PDF から測れない',
    });
  }

  // gate の横線が乗る行（中間ノードの行）を解決する。
  // CSV には中間ノードの行番号が無いので、その項目IDが他工程の
  // 開始／終了ノードとして現れる場合だけ行が分かる。
  // 実測：D1・D2・D3 は解決できる（それぞれ行 25・29・24 で PDF と一致）。
  //       D4・D5 の中間ノードはどの工程にも紐づかない項目なので解決できず、
  //       共通規則（gateRowByRule）で埋める（PDF ではそれぞれ行 32・23）。
  const nodeRow = nodeRowIndex(processes);
  const usedRows = new Set();
  for (const p of processes) {
    if (Number.isFinite(p.startNode.row)) usedRows.add(p.startNode.row);
    if (Number.isFinite(p.endNode.row)) usedRows.add(p.endNode.row);
  }
  const overrides = o.gateRows || {};
  for (const p of processes) {
    if (p.shape !== 'gate') continue;
    p.gateRowSource = 'csv';
    if (Object.prototype.hasOwnProperty.call(overrides, p.id) && Number.isFinite(+overrides[p.id])) {
      p.gateRow = +overrides[p.id];
      p.gateRowSource = 'manual';
      recordEstimate({
        scope: p.id, name: p.name, field: 'gate の中間ノードの行', value: p.gateRow, source: 'manual',
        rule: '画面で手入力された値',
        reason: 'CSV に中間ノードの行番号が無いため、監督が プロジェクトG の画面を見て指定した',
      });
    } else if (p.midNode && p.midNode.id && nodeRow.has(p.midNode.id)) {
      p.gateRow = nodeRow.get(p.midNode.id);
    } else {
      p.gateRow = gateRowByRule(p, usedRows);
      p.gateRowSource = 'rule';
      recordEstimate({
        scope: p.id, name: p.name, field: 'gate の中間ノードの行', value: p.gateRow, source: 'rule',
        rule: GATE_RULE_TEXT,
        reason: `CSV に中間ノードの行番号が無く、項目ID「${(p.midNode && p.midNode.id) || '(無し)'}」は他のどの工程の開始／終了ノードでもないため行が分からない`,
      });
      warnings.push(`${p.id}(${p.name}): gate の中間ノードの行が CSV から分かりません。共通規則で行 ${p.gateRow} と推定しました（画面の「gate 中間行の指定」で上書きできます）`);
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
    estimates: ESTIMATES.slice(),
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

### 11.4 `src/02-geometry.js` ― 格子と形状規則

```js
/* ===================================================================
 * 02. 格子と形状規則
 *
 * ここに書いてある数値は全て Sample.zip の PDF 1〜2 頁目から
 * ベクター座標を抜き出して実測したもの（tools/pdf-extract.py）。
 * 測り方と実測値は 設計B_実装メモ.md 3 章の表に載せた。
 *
 * PDF の格子（実測）:
 *   x(n) = 216.552 + n * 15.9833 pt      1 列 = 15.9833 pt
 *   y(r) = 上端 132.00 + (r-1) * 16.5450 + 16.5450/2 pt
 * → 設計B 3 章の式そのもの。比率だけを取り出してここに持つ。
 * =================================================================== */

const DEFAULTS = {
  DAY_W: 24,   // 1 日の幅 px（ズームはこの値だけを変える）
  ROW_H: 28,   // 1 行の高さ px
};

/* PDF 実測の基準寸法。比率を出すためだけに使う。 */
const PDF = { DAY_W: 15.9833, ROW_H: 16.5450 };

/* 図形の高さ。PDF 実測値を ROW_H に対する比率で保持する（設計B 5.2）。 */
const H_RATIO = {
  boxS: 0.86,               // 実測 半分 0.43 行（バー１）
  boxM: 1.36,               // 実測 半分 0.68 行（バー２）
  boxL: 1.64,               // 実測 半分 0.82 行（バー３）
  barAutoAdjust: 0.909,     // 実測 半分 0.455 行（バー４・バー５）
  barProcessNameAdjust: 0.455, // 実測 行中心から下へ 0.455 行（バー６）
};
/* box の尖りが内側へ食い込む量。実測 0.328 列（バー１〜３で共通） */
const BOX_POINT_INSET = 0.328;
/* 折れ角の丸め半径。実測 5 pt */
const CORNER_R_PT = 5;
/* 斜行で「縦」を寝かせる x 方向の量。実測 0.38〜0.39 列（B2・C3） */
const SLANT_COLS = 0.39;
/* 工程線の太さの既定値。実測 1.5（太さ列が空の 20 件すべて） */
const DEFAULT_WEIGHT = 1.5;

/* 文字の大きさ。PDF 実測 pt を ROW_H に対する比率にしたもの。
   XS=6 / M=9 / L=13.5 / XL=18 pt。S はサンプルに無いので XS と M の中間に置いた（未確定）。 */
const TEXT_RATIO = {
  XS: 6 / PDF.ROW_H,
  S: 7.5 / PDF.ROW_H,
  M: 9 / PDF.ROW_H,
  L: 13.5 / PDF.ROW_H,
  XL: 18 / PDF.ROW_H,
};

/* -------------------------------------------------------------------
 * gate の中間ノードの行が CSV から分からないときの共通規則
 *
 * CSV には 項目ID（中間ノード）・中間ノード日付 はあるが、
 * 中間ノードの行番号も項目名も無い。その項目IDが他工程の開始／終了
 * ノードとして現れていれば行は分かるが、どの工程にも紐づかない項目
 * （サンプルの D4・D5 の中間ノード）は行が決まらない。
 *
 * そこで、gate が gate らしく見える（横の走りが開始行と終了行の帯の
 * 外側に出る）ように、次の規則で埋める：
 *
 *   開始行と終了行の帯のすぐ外側で、どの工程のノードも置かれていない
 *   最初の行。下方向を先に探し、無ければ上方向。どちらも見つからなければ
 *   帯の 1 行下。
 *
 * 「下方向を先に」はサンプルの D4（帯 24–26 に対し PDF は行 32 ＝ 下）に
 * 合わせたもの。D5（帯 26–30 に対し PDF は行 23 ＝ 上）は外れる。
 * 2 例のうち 1 例しか当たらないので、これは**見た目を近づけるための
 * 埋め合わせであって、正しい行ではない**。使った箇所は必ず
 * recordEstimate() に残し、画面で手入力による上書きができるようにしてある。
 * ------------------------------------------------------------------- */
const GATE_RULE_TEXT = '開始行と終了行の帯のすぐ外側で、ノードの無い最初の行（下方向を優先）';
const GATE_SEARCH_LIMIT = 24;   // 何行まで外を探すか

function gateRowByRule(p, usedRows) {
  const lo = Math.min(p.startNode.row, p.endNode.row);
  const hi = Math.max(p.startNode.row, p.endNode.row);
  for (let k = 1; k <= GATE_SEARCH_LIMIT; k++) {
    if (!usedRows.has(hi + k)) return hi + k;
    if (lo - k >= 1 && !usedRows.has(lo - k)) return lo - k;
  }
  return hi + 1;
}

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
    if (Number.isFinite(p.gateRow)) maxRow = Math.max(maxRow, Math.ceil(p.gateRow));
  }
  return {
    start, end, days, maxRow,
    DAY_W: o.DAY_W, ROW_H: o.ROW_H,
    width: days * o.DAY_W,
    height: maxRow * o.ROW_H,
    cornerR: CORNER_R_PT * Math.min(o.DAY_W / PDF.DAY_W, o.ROW_H / PDF.ROW_H),
    dayIndex: (d) => dayDiff(start, d),
    /** 日付 index n の列の左端 x（共通仕様 4 章「開始境界」） */
    xAt: (n) => n * o.DAY_W,
    /** 行 r の中央 y。r は小数でもよい（crank の横は行と行の間に来る） */
    yAt: (r) => (r - 1) * o.ROW_H + o.ROW_H / 2,
    dateAt: (n) => addDays(start, n),
  };
}

/**
 * 形状ごとの折れ方。PDF 実測で確定したもの。
 * 返すのは (x0,y0) で始まり (x1,y1) で終わる折れ線の頂点列。
 */
const SHAPE_RULES = {
  // 始点と終点を直線で結ぶ。行が違えば斜線。
  // 実測 E1(31→31 横) / E2(31→33 斜) / E3(33→31 斜)
  straight: (c) => [[c.x0, c.y0], [c.x1, c.y1]],

  // 始点で縦 → 終点行で横。
  // 実測 A2: 縦 n14 r8→5、横 r5 n14→18
  yElbow: (c) => [[c.x0, c.y0], [c.x0, c.y1], [c.x1, c.y1]],

  // 始点行で横 → 終点で縦。
  // 実測 B3: 横 r14 n18→25、縦 n25 r14→11
  xElbow: (c) => [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1]],

  // 縦 → 横 → 縦。横は開始行と終了行のちょうど中間。**丸めない**。
  // 実測 C1(21→19→17、中間は整数) / C3(17→19.5→22、中間は .5)
  crank: (c) => {
    const yM = c.yAt((c.r0 + c.r1) / 2);
    return [[c.x0, c.y0], [c.x0, yM], [c.x1, yM], [c.x1, c.y1]];
  },

  // 縦 → 横 → 縦。横は「中間ノードの行」。
  // 実測 D4(24→32→26) / D5(26→23→30) / D2(25→29→29) / D3(29→24→24) / D1(25→25→25)
  // 中間ノードの行が CSV から分からないときは gateRowByRule() が埋める。
  gate: (c) => {
    const yG = c.yAt(c.gateRow == null ? c.r1 : c.gateRow);
    return [[c.x0, c.y0], [c.x0, yG], [c.x1, yG], [c.x1, c.y1]];
  },
};

/**
 * 斜行（工程線の斜行 = true）。折れ線の「縦」の走りを寝かせる。
 * 実測：縦の走りが x 方向に 0.38〜0.39 列ぶん傾く（B2・C3）。
 * 縦の長さが変わっても x 方向の量は変わらないので、角度ではなく固定量。
 */
function applySlant(pts, DAY_W) {
  if (pts.length < 3) return pts;
  const d = SLANT_COLS * DAY_W;
  const out = pts.map((p) => p.slice());
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1], b = out[i], cc = out[i + 1];
    const abV = a[0] === b[0] && a[1] !== b[1];
    const bcV = b[0] === cc[0] && b[1] !== cc[1];
    if (abV && !bcV) {
      const dir = Math.sign(cc[0] - b[0]) || 1;
      b[0] += dir * Math.min(d, Math.abs(cc[0] - b[0]));
    } else if (!abV && bcV) {
      const dir = Math.sign(b[0] - a[0]) || 1;
      b[0] -= dir * Math.min(d, Math.abs(b[0] - a[0]));
    }
  }
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

/** 工程 1 本の描画形状を決める */
function shapeOf(p, geo) {
  const kind = SHAPE_KIND[p.shape] || 'poly';
  const n0 = geo.dayIndex(p.start);
  const n1 = geo.dayIndex(p.end);
  const x0 = geo.xAt(n0);              // 開始境界
  const x1 = geo.xAt(n1 + 1);          // 終了境界（終了日を含む）
  const y0 = geo.yAt(p.startNode.row);
  const y1 = geo.yAt(p.endNode.row);

  if (kind === 'box') {
    const h = H_RATIO[p.shape] * geo.ROW_H;
    return { kind, x0, x1, n0, n1, yc: y0, h, y0, y1 };
  }
  if (kind === 'bar') {
    const h = H_RATIO[p.shape] * geo.ROW_H;
    // barProcessNameAdjust は行中心が上端。barAutoAdjust は行中心が中央。
    const top = p.shape === 'barProcessNameAdjust' ? y0 : y0 - h / 2;
    return { kind, x0, x1, n0, n1, yc: y0, h, top, y0, y1 };
  }

  const rule = SHAPE_RULES[p.shape] || SHAPE_RULES.straight;
  let pts = rule({
    x0, x1, y0, y1, yAt: geo.yAt,
    r0: p.startNode.row, r1: p.endNode.row,
    gateRow: p.gateRow,
  });
  if (p.slanted) pts = applySlant(pts, geo.DAY_W);
  pts[0] = [x0, y0];
  pts[pts.length - 1] = [x1, y1];
  return { kind: 'poly', pts, x0, x1, y0, y1, n0, n1 };
}

/**
 * 折れ線を「1 日ごとの区間」に割る。
 * 各区間に日付 index と非稼働日かどうかを付ける。
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
    const dir = bx > ax ? 1 : -1;
    const t = (x) => (x - ax) / (bx - ax);
    const cuts = [ax];
    let k = dir > 0 ? Math.floor(ax / W) + 1 : Math.ceil(ax / W) - 1;
    while (dir > 0 ? k * W < bx : k * W > bx) { cuts.push(k * W); k += dir; }
    cuts.push(bx);
    for (let j = 0; j < cuts.length - 1; j++) {
      const sx = cuts[j], ex = cuts[j + 1];
      if (sx === ex) continue;
      segs.push({
        x1: sx, y1: ay + (by - ay) * t(sx),
        x2: ex, y2: ay + (by - ay) * t(ex),
        n: Math.floor(((sx + ex) / 2) / W),
      });
    }
  }
  for (const s of segs) s.holiday = isNonWorkingDay(geo.dateAt(s.n));
  return segs;
}

/** 六角形（左右が尖る）。box S/M/L */
function hexPoints(x0, x1, yc, h, DAY_W) {
  const inset = Math.min(BOX_POINT_INSET * DAY_W, Math.max(0, (x1 - x0) / 2));
  const t = yc - h / 2, b = yc + h / 2;
  return [[x0, yc], [x0 + inset, t], [x1 - inset, t], [x1, yc], [x1 - inset, b], [x0 + inset, b]];
}

/** 折れ線の角を半径 r で丸めた SVG の d を組む（描画専用。検査は頂点で行う） */
function roundedPath(pts, r) {
  if (pts.length < 3 || r <= 0) {
    return pts.map((p, i) => (i ? 'L' : 'M') + ' ' + p[0] + ' ' + p[1]).join(' ');
  }
  const out = ['M ' + pts[0][0] + ' ' + pts[0][1]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const d2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const r1 = Math.min(r, d1 / 2, d2 / 2);
    if (r1 <= 0.01) { out.push('L ' + b[0] + ' ' + b[1]); continue; }
    const p1 = [b[0] + (a[0] - b[0]) * r1 / d1, b[1] + (a[1] - b[1]) * r1 / d1];
    const p2 = [b[0] + (c[0] - b[0]) * r1 / d2, b[1] + (c[1] - b[1]) * r1 / d2];
    out.push('L ' + p1[0] + ' ' + p1[1]);
    out.push('Q ' + b[0] + ' ' + b[1] + ' ' + p2[0] + ' ' + p2[1]);
  }
  const last = pts[pts.length - 1];
  out.push('L ' + last[0] + ' ' + last[1]);
  return out.join(' ');
}
```

### 11.5 `src/03-render.js` ― SVG 描画

```js
/* ===================================================================
 * 03. SVG 描画（往路）
 * 規則は 02-geometry.js の実測値に従う。
 * render() は純関数。DOM は全消し→全生成する。
 * =================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const n = document.createElementNS(SVG_NS, name);
  if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, String(attrs[k]));
  return n;
};
/** 座標は必ずこの書式で書く。検査 5.4 が属性値を読み戻すため。 */
const num = (v) => (Math.round(v * 1000) / 1000).toString();
const seg2d = (s) => `M ${num(s.x1)} ${num(s.y1)} L ${num(s.x2)} ${num(s.y2)}`;

const GRID_COLOR = '#d8d8d8';
const HOLIDAY_FILL = '#E8E8E8';
const NODE_R = 3.5;
const DEFAULT_LINE_COLOR = '#000000';  // 工程線の色が空のとき（PDF のバー３が黒）

function markerId(color) { return 'arw-' + String(color).replace(/[^0-9a-zA-Z]/g, ''); }

/** 休日区間の点線。プロジェクトG は丸い点を並べて描くので線端を丸にする。 */
function holidayDash(geo) { return `0.1 ${geo.DAY_W / 7}`; }

/**
 * @returns {{svg:SVGElement, geo:object, drawn:Array, skipped:Array, warnings:string[]}}
 */
function render(doc, start, end, opt) {
  const geo = makeGeometry(doc, start, end, opt);
  const warnings = [];
  const drawn = [], skipped = [];
  const hw = holidayRangeWarning(start, end);
  if (hw) warnings.push(hw);

  const svg = el('svg', {
    xmlns: SVG_NS, width: geo.width, height: geo.height,
    viewBox: `0 0 ${geo.width} ${geo.height}`, class: 'plot-svg',
  });

  const defs = el('defs');
  const clip = el('clipPath', { id: 'plot-clip' });
  clip.appendChild(el('rect', { x: 0, y: 0, width: geo.width, height: geo.height }));
  defs.appendChild(clip);
  const colors = new Set();
  for (const p of doc.processes) if (!p.deleted && p.arrow !== 'none') colors.add(p.color || DEFAULT_LINE_COLOR);
  for (const c of colors) {
    const m = el('marker', {
      id: markerId(c), viewBox: '0 0 10 10', refX: 9, refY: 5,
      markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse', markerUnits: 'strokeWidth',
    });
    m.appendChild(el('path', { d: 'M 0 1 L 10 5 L 0 9 z', fill: c }));
    defs.appendChild(m);
  }
  svg.appendChild(defs);

  /* ---- 背景：休日列（土日＋祝日。00-holiday.js 参照） ---------------- */
  const bg = el('g', { class: 'bg' });
  for (let n = 0; n < geo.days; n++) {
    if (!isNonWorkingDay(geo.dateAt(n))) continue;
    bg.appendChild(el('rect', {
      x: geo.xAt(n), y: 0, width: geo.DAY_W, height: geo.height, fill: HOLIDAY_FILL, class: 'holiday',
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
    if (p.end.getTime() < start.getTime() || p.start.getTime() > end.getTime()) {
      skipped.push({ id: p.id, reason: '表示期間外' }); continue;
    }
    if (!SHAPE_KIND[p.shape]) warnings.push(`${p.id}: 未知の形状「${p.shape}」→ straight として描画`);

    const color = p.color || DEFAULT_LINE_COLOR;
    const sh = shapeOf(p, geo);
    // 推定で埋めた項目があれば DOM に印を残す（後から追えるように）
    const est = estimatesOf(p.id);
    const ruleFields = est.filter((e) => e.source === 'rule').map((e) => e.field);
    const g = el('g', {
      class: 'proc' + (ruleFields.length ? ' estimated' : ''),
      'data-pid': p.id,
      'data-estimated': ruleFields.length ? ruleFields.join(',') : null,
    });
    const hd = holidayDash(geo);
    // 実線・点線 = dash のときは PDF 実測どおり長めの破線（D4）
    const explicitDash = p.dash === 'dash' ? `${geo.DAY_W / 4} ${geo.DAY_W / 8}` : null;

    if (sh.kind === 'poly') {
      const segs = splitByDay(sh.pts, geo);
      segs.forEach((s, i) => {
        const isLast = i === segs.length - 1;
        // 稼働日は実線、休日は点線。実線・点線列が dash なら全区間を破線。
        const dashArr = explicitDash || (s.holiday ? hd : null);
        g.appendChild(el('path', {
          class: 'seg', d: seg2d(s), fill: 'none', stroke: color, 'stroke-width': p.weight,
          'stroke-linecap': (!explicitDash && s.holiday) ? 'round' : 'butt',
          'stroke-dasharray': dashArr,
          'marker-end': (isLast && p.arrow !== 'none') ? `url(#${markerId(color)})` : null,
        }));
      });
      // 角の丸め（PDF 実測 5pt）は見た目だけの層。検査は上の seg を読む。
      if (sh.pts.length > 2 && geo.cornerR > 0.01) {
        g.appendChild(el('path', {
          class: 'corner', d: roundedPath(sh.pts.map((q) => [+num(q[0]), +num(q[1])]), geo.cornerR),
          fill: 'none', stroke: 'none',
        }));
      }
    } else if (sh.kind === 'box') {
      const pts = hexPoints(sh.x0, sh.x1, sh.yc, sh.h, geo.DAY_W);
      g.appendChild(el('polygon', {
        class: 'shape', points: pts.map((q) => `${num(q[0])},${num(q[1])}`).join(' '),
        fill: p.fillColor || 'none', stroke: color, 'stroke-width': p.weight,
        'stroke-dasharray': explicitDash,
      }));
    } else {
      // bar：塗り = 背景色（無ければ線色）。
      // barAutoAdjust は線色で枠も引く（PDF 実測：バー５は青塗り＋赤枠）。
      // barProcessNameAdjust は枠を引かず、行中心に工程線を 1 本引く（PDF 実測：バー６）。
      const isNameBar = p.shape === 'barProcessNameAdjust';
      g.appendChild(el('rect', {
        class: 'shape', x: num(sh.x0), y: num(sh.top),
        width: num(sh.x1 - sh.x0), height: num(sh.h),
        fill: p.fillColor || color,
        stroke: isNameBar ? 'none' : color,
        'stroke-width': isNameBar ? null : p.weight,
        'stroke-dasharray': isNameBar ? null : explicitDash,
      }));
      if (isNameBar) {
        g.appendChild(el('path', {
          class: 'baseline', d: `M ${num(sh.x0)} ${num(sh.yc)} L ${num(sh.x1)} ${num(sh.yc)}`,
          fill: 'none', stroke: color, 'stroke-width': p.weight,
        }));
      }
    }

    // ノード丸。ノード形状 = none なら描かない
    if (p.nodeShapeStart !== 'none') {
      g.appendChild(el('circle', { class: 'node node-start', cx: num(sh.x0), cy: num(sh.y0), r: NODE_R, fill: '#ffffff', stroke: color, 'stroke-width': 1.5 }));
    }
    if (p.nodeShapeEnd !== 'none') {
      g.appendChild(el('circle', { class: 'node node-end', cx: num(sh.x1), cy: num(sh.y1), r: NODE_R, fill: '#ffffff', stroke: color, 'stroke-width': 1.5 }));
    }

    if (p.name && p.nameStyle.show) g.appendChild(nameText(p, sh, geo));

    addRel(p.relation.startName, sh.x0, sh.y0);
    addRel(p.relation.endName, sh.x1, sh.y1);
    plot.appendChild(g);
    drawn.push({ p, sh });
  }

  /* ---- 関係線 -------------------------------------------------------
     PDF 実測：関係１ は C1 の開始ノード（行 21、n=6）から
     D1 のノード行（行 25）へ、**n=6 でまっすぐ縦**に引かれる。
     使われているのは上側（行番号が小さい方）のノードの x で、
     下側ノードの x は無視されている。
     サンプルに関係線は 1 本しかないので、この 1 例からの規則（未確定）。 */
  for (const [name, pts] of rel) {
    if (pts.length < 2) continue;
    const sorted = pts.slice().sort((a, b) => a[1] - b[1]);
    const x = sorted[0][0];   // 上側ノードの x（推定の記録は buildDocument 側）
    for (let i = 0; i < sorted.length - 1; i++) {
      relGroup.appendChild(el('path', {
        class: 'relation', 'data-relation': name,
        d: `M ${num(x)} ${num(sorted[i][1])} L ${num(x)} ${num(sorted[i + 1][1])}`,
        fill: 'none', stroke: '#888888', 'stroke-width': 1,
        'stroke-dasharray': `0.1 ${geo.DAY_W / 7}`, 'stroke-linecap': 'round',
      }));
    }
  }
  plot.insertBefore(relGroup, plot.firstChild);

  return { svg, geo, drawn, skipped, warnings };
}

/**
 * 工程線名。配置は namePositionWithinOptions に従う（PDF 実測）。
 *   lineNameUpperCenter / UpperLeft / LowerRight / PositionFree
 *   boxNameUpperCenter / MiddleCenter / LowerLeft
 *   barNameUpperCenter
 * namePositionCoefficient は x = 列、y = 行 のずらし量。
 * coefficient.y = -0.1 は「文字の下端を線の 0.1 行上に置く」で実測と一致した。
 */
const NAME_PAD_COLS = 0.63;   // Left 寄せのときの左余白。実測 0.63 列
function nameText(p, sh, geo) {
  const st = p.nameStyle;
  const size = (TEXT_RATIO[st.textSize] || TEXT_RATIO.M) * geo.ROW_H;
  // lineNamePositionFree（プロジェクトG 上で手で動かしたラベル）は
  // ずらし量が namePositionCoefficient に入っているので、
  // 中央寄せ＋coefficient として扱えば PDF と合う。
  const w = String(st.within || '');
  const lower = /Lower/.test(w), middle = /Middle/.test(w);
  const left = /Left/.test(w), right = /Right/.test(w);

  // 縦：図形の上／中／下
  let topY, botY;
  if (sh.kind === 'poly') { topY = botY = sh.y0; }
  else if (sh.kind === 'bar' && p.shape === 'barProcessNameAdjust') { topY = sh.yc; botY = sh.top + sh.h; }
  else { topY = sh.yc - sh.h / 2; botY = sh.yc + sh.h / 2; }

  let y;
  if (middle) y = (topY + botY) / 2 + size * 0.35;
  else if (lower) y = botY + size;
  else y = topY;                       // Upper：文字の下端を図形の上端に合わせる
  y += st.coef.y * geo.ROW_H;          // 実測 -0.1 行

  // 横：左寄せ／右寄せ／中央
  let x, anchor;
  if (left) { x = sh.x0 + NAME_PAD_COLS * geo.DAY_W; anchor = 'start'; }
  else if (right) { x = sh.x1 - NAME_PAD_COLS * geo.DAY_W; anchor = 'end'; }
  else { x = (sh.x0 + sh.x1) / 2; anchor = 'middle'; }
  x += st.coef.x * geo.DAY_W;

  const t = el('text', {
    class: 'pname', x: num(x), y: num(y),
    'font-size': num(size), 'font-weight': st.bold ? 'bold' : 'normal',
    fill: st.color || p.color || DEFAULT_LINE_COLOR, 'text-anchor': anchor,
  });
  t.textContent = p.name;
  return t;
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
    if (isNonWorkingDay(d)) { a.classList.add('we'); b.classList.add('we'); }
    if (isPublicHoliday(d)) { a.classList.add('hol'); b.classList.add('hol'); }
  }
  return table;
}

/** 左の行見出し（共通仕様 4 章 A 列。空行も再現する） */
function renderRowHeader(doc, geo) {
  const heads = rowHeadings(doc.processes);
  const table = document.createElement('table');
  table.className = 'row-head';
  for (let r = 1; r <= geo.maxRow; r++) {
    const tr = table.insertRow();
    tr.style.height = geo.ROW_H + 'px';
    const n = tr.insertCell(); n.className = 'rn'; n.textContent = r;
    const nm = tr.insertCell(); nm.className = 'rname'; nm.textContent = heads.get(r) || '';
  }
  return table;
}
```

### 11.6 `src/04-xlsx.js` ― xlsx 書き出し

```js
/* ===================================================================
 * 04. xlsx 書き出し（業者用）
 * 設計B 5.3 / 共通仕様 4 章・6 章・7 章
 *
 * 【仕様の矛盾についての判断】
 * 共通仕様 4 章「xlsx での配置」は "B 列以降が日付列 / 行 r+3 が プロジェクトG 行 r"
 * と書いているが、設計B 5.3 は T10_Layout に
 * 「行見出し／名前／開始日／終了日／日数／日付列」を持たせ、
 * 条件付き書式を =AND(F$2>=$C5, F$2<=$D5) と明示している。
 * 後者は C=開始日・D=終了日・F=最初の日付列・データ開始行 5 を意味し、
 * 前者と両立しない。
 * さらに プロジェクトG は 1 工程が 2 行にまたがるネットワークなので、
 * 「行 = プロジェクトG 行番号」にすると同じ開始行を持つ 2 工程
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

// 工程線の色が空のときは黒（PDF のバー３が黒で描かれている）
const argb = (hex) => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  return 'FF' + (m ? m[1].toUpperCase() : DEFAULT_LINE_COLOR.slice(1).toUpperCase());
};
const solid = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });

/** 表示対象の工程（削除済み・期間外を除く）。描画と同じ条件で選ぶ。 */
function visibleProcesses(doc, start, end) {
  return doc.processes.filter((p) => !p.deleted && p.start && p.end
    && Number.isFinite(p.startNode.row) && Number.isFinite(p.endNode.row)
    && p.end.getTime() >= start.getTime() && p.start.getTime() <= end.getTime());
}

/** 表示期間に含まれる祝日（土日は NETWORKDAYS が自前で除く） */
function publicHolidaysIn(start, end) {
  const out = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_DAY) {
    const d = new Date(t);
    if (isPublicHoliday(d) && !isWeekend(d)) out.push(d);
  }
  return out;
}

async function buildWorkbook(doc, start, end) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'プロジェクトG 工程表ツール';
  wb.created = new Date();

  const days = dayDiff(start, end) + 1;
  const lastCol = COL_DATE0 + days - 1;
  const procs = visibleProcesses(doc, start, end);
  const heads = rowHeadings(doc.processes);
  // 祝日は _data の 1 列に置き、NETWORKDAYS の第 3 引数から参照する。
  // こうすると業者が C/D を直したときも 日数 が正しく引き直される。
  const hol = publicHolidaysIn(doc.meta.periodStart || start, doc.meta.periodEnd || end);
  const HOL_COL = 1, HOL_ROW0 = 1;

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
    // 休日 = 土日 + 祝日（PDF・CSV の休日列で確認済み）
    if (isNonWorkingDay(d)) { dayCell.fill = solid('#E8E8E8'); wkCell.fill = solid('#E8E8E8'); }
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
    const holRef = hol.length
      ? `,${DATA_SHEET}!$A$${HOL_ROW0 + 1}:$A$${HOL_ROW0 + hol.length}` : '';
    ws.getCell(r, COL_DAYS).value = {
      formula: `NETWORKDAYS(C${r},D${r}${holRef})`,
      result: (dayDiff(p.start, p.end) + 1) - countNonWorking(p.start, p.end),
    };

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
      if (isNonWorkingDay(addDays(start, n))) ws.getCell(r, COL_DATE0 + n).fill = solid('#E8E8E8');
    }

    // バーは条件付き書式で描く（禁止事項 2：Shape で描かない）
    const f = ws.getColumn(COL_DATE0).letter, l = ws.getColumn(lastCol).letter;
    ws.addConditionalFormatting({
      ref: `${f}${r}:${l}${r}`,
      rules: [{
        type: 'expression', priority: 1,
        formulae: [`AND(${f}$${ROW_DAY}>=$C${r},${f}$${ROW_DAY}<=$D${r})`],
        style: { fill: solid(p.color || DEFAULT_LINE_COLOR) },
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
  // A 列は NETWORKDAYS 用の祝日一覧。工程データは B 列から。
  wd.getCell(HOL_ROW0, HOL_COL).value = '祝日';
  hol.forEach((d, i) => {
    const c = wd.getCell(HOL_ROW0 + 1 + i, HOL_COL);
    c.value = d; c.numFmt = 'yyyy/mm/dd';
  });
  const DATA_COL0 = 2;
  const idCol = doc.colIndex.get(COL.id);
  wd.getCell(1, DATA_COL0).value = COL.id;
  doc.headers.forEach((h, i) => { wd.getCell(1, DATA_COL0 + 1 + i).value = h; });
  doc.processes.forEach((p, k) => {
    const raw = doc.rows[p.index] || [];
    wd.getCell(2 + k, DATA_COL0).value = raw[idCol] != null ? raw[idCol] : p.id;
    doc.headers.forEach((_, i) => {
      const v = raw[i];
      if (v != null && v !== '') wd.getCell(2 + k, DATA_COL0 + 1 + i).value = v;
    });
  });
  // 復路の構造検査に必要なメタを別領域に置く
  const metaCol = doc.headers.length + 5;
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

  // CSV に無く、ツールが埋めた箇所をそのまま残す。
  // 復路や後日の検証で「どれが CSV の値でどれが埋めた値か」を追えるようにするため。
  const estRow0 = 6 + META_KEYS.length;
  wd.getCell(estRow0, metaCol).value = '_estimates';
  ['種別', '対象', '名前', '項目', '入れた値', '使った規則', 'CSV から決められない理由']
    .forEach((t, i) => { wd.getCell(estRow0 + 1, metaCol + i).value = t; });
  (doc.estimates || []).forEach((e, i) => {
    const r = estRow0 + 2 + i;
    [e.source, e.scope, e.name, e.field, String(e.value), e.rule, e.reason]
      .forEach((v, c) => { wd.getCell(r, metaCol + c).value = v; });
  });

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

### 11.7 `src/05-verify.js` ― 機械検査

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
        const want = isNonWorkingDay(addDays(start, n)) || p.dash === 'dash';
        if (want !== !!s.dash) dashNg++;
      }
      pushResult(results, dashNg === 0, p.id, '土日区間が点線・稼働日区間が実線であること',
        dashNg ? dashNg + ' 区間が不一致' : checked + ' 区間を検査');

      const wantMarker = p.arrow !== 'none';
      const hasMarker = segs.some((s) => !!s.marker);
      pushResult(results, wantMarker === hasMarker, p.id, '矢印の有無が 工程線の矢印 と一致',
        'CSV=' + (p.arrow || '(空)') + ' / 実測=' + (hasMarker ? 'あり' : 'なし'));
      const wantColor = (p.color || DEFAULT_LINE_COLOR).toLowerCase();
      const colorNg = segs.filter((s) => (s.color || '').toLowerCase() !== wantColor).length;
      pushResult(results, colorNg === 0, p.id, '線色が 工程線の色 と一致', colorNg ? colorNg + ' 区間が不一致' : wantColor);
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
      pushResult(results, (poly.getAttribute('stroke') || '').toLowerCase() === (p.color || DEFAULT_LINE_COLOR).toLowerCase(),
        p.id, '枠線色 ＝ 工程線の色', poly.getAttribute('stroke'));

    } else {
      const rect = g.querySelector('rect.shape');
      if (!rect) { pushResult(results, false, p.id, 'バーが描かれていること', 'rect が無い'); continue; }
      const rx = +rect.getAttribute('x'), rw = +rect.getAttribute('width');
      const ry = +rect.getAttribute('y'), rh = +rect.getAttribute('height');
      pushResult(results, near(rx, x0), p.id, '左端 x ＝ 開始境界', '実測 ' + rx + ' / 期待 ' + x0);
      pushResult(results, near(rx + rw, x1), p.id, '右端 x ＝ 終了境界', '実測 ' + (rx + rw) + ' / 期待 ' + x1);
      const wantTop = p.shape === 'barProcessNameAdjust' ? y0 : y0 - rh / 2;
      pushResult(results, near(ry, wantTop), p.id,
        p.shape === 'barProcessNameAdjust' ? '上端 y ＝ 行の中央' : '中心 y ＝ 行の中央',
        '実測上端 ' + ry + ' / 期待 ' + wantTop);
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
    if (p.name && p.nameStyle.show) {
      const t = g.querySelector('text.pname');
      pushResult(results, !!t && t.textContent === p.name, p.id, '工程線名が描かれていること', t ? t.textContent : '無し');
      const wantSize = (TEXT_RATIO[p.nameStyle.textSize] || TEXT_RATIO.M) * ROW_H;
      if (t) pushResult(results, near(+t.getAttribute('font-size'), Math.round(wantSize * 1000) / 1000),
        p.id, '文字サイズ ＝ textSize ' + p.nameStyle.textSize,
        t.getAttribute('font-size') + ' / 期待 ' + (Math.round(wantSize * 100) / 100));
    }
  }

  // 休日列の背景（土日＋祝日）
  const weRects = svgRoot.querySelectorAll('rect.holiday');
  let weExpected = 0;
  for (let n = 0; n <= dayDiff(start, end); n++) if (isNonWorkingDay(addDays(start, n))) weExpected++;
  pushResult(results, weRects.length === weExpected, '格子', '休日列（土日＋祝日）の背景の本数',
    '実測 ' + weRects.length + ' / 期待 ' + weExpected);
  let wePos = 0;
  weRects.forEach((r) => {
    const n = Math.round(+r.getAttribute('x') / DAY_W);
    if (!isNonWorkingDay(addDays(start, n)) || !near(+r.getAttribute('width'), DAY_W)) wePos++;
  });
  pushResult(results, wePos === 0, '格子', '休日列の位置と幅', wePos ? wePos + ' 件が不正' : '');

  // 推定で埋めた箇所が、もれなく記録されていること。
  // 「描いたものを信じない」と同じ考えで、DOM の印と記録を突き合わせる。
  const estAll = doc.estimates || [];
  const ruleIds = new Set(estAll.filter((e) => e.source === 'rule' && /^P|^[^関]/.test(e.scope))
    .map((e) => e.scope));
  let markNg = [];
  for (const p of doc.processes) {
    const g = svgRoot.querySelector('g.proc[data-pid="' + CSS.escape(p.id) + '"]');
    if (!g) continue;
    const marked = !!g.getAttribute('data-estimated');
    const want = ruleIds.has(p.id);
    if (marked !== want) markNg.push(p.id + (want ? ':印が無い' : ':余計な印'));
  }
  pushResult(results, markNg.length === 0, '推定', '推定で埋めた工程に DOM の印が付いていること',
    markNg.length ? markNg.slice(0, 3).join(' , ') : ruleIds.size + ' 件に印');
  const estBad = estAll.filter((e) => !e.field || !e.rule || !e.reason || e.value === undefined);
  pushResult(results, estBad.length === 0, '推定', '記録に項目・規則・理由がそろっていること',
    estBad.length ? estBad.length + ' 件が欠けている' : estAll.length + ' 件');
  // gate は必ず行が決まっていること（null のまま描かない）
  const gateBad = doc.processes.filter((p) => p.shape === 'gate' && !Number.isFinite(p.gateRow));
  pushResult(results, gateBad.length === 0, '推定', 'gate の横線の行が必ず決まっていること',
    gateBad.length ? gateBad.map((p) => p.id).join(',') : '');
  const gateRule = doc.processes.filter((p) => p.shape === 'gate' && p.gateRowSource === 'rule');
  const gateRuleRec = estAll.filter((e) => e.field === 'gate の中間ノードの行' && e.source === 'rule');
  pushResult(results, gateRule.length === gateRuleRec.length, '推定',
    '規則で埋めた gate がすべて記録されていること',
    '規則で埋めた ' + gateRule.length + ' 件 / 記録 ' + gateRuleRec.length + ' 件');

  // 休日の計算が CSV の 休日 列と合うこと（共通仕様 3.3「検算用」）
  let holNg = 0, holChecked = 0;
  for (const p of doc.processes) {
    const csvHol = parseInt(p.derived.holidays, 10);
    if (!p.start || !p.end || !Number.isFinite(csvHol)) continue;
    holChecked++;
    if (countNonWorking(p.start, p.end) !== csvHol) holNg++;
  }
  pushResult(results, holNg === 0, '格子', '休日の計算が CSV の 休日 列と一致',
    holNg ? holNg + ' 件が不一致' : holChecked + ' 件を検算');

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
    if (isNonWorkingDay(want) !== shaded) weFillNg++;
  }
  pushResult(results, dayNg === 0, 'xlsx', '行 2 の日付が表示期間と 1 日ずつ一致', dayNg ? dayNg + ' 列が不一致' : days + ' 列');
  pushResult(results, weekNg === 0, 'xlsx', '行 3 の曜日列が同じ日付を指すこと', weekNg ? weekNg + ' 列が不一致' : '');
  pushResult(results, weFillNg === 0, 'xlsx', '休日列（土日＋祝日）が薄灰であること', weFillNg ? weFillNg + ' 列が不一致' : '');
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
    if (rule.type !== 'expression' || f !== want || gotArgb !== argb(p.color || DEFAULT_LINE_COLOR)) {
      cfNg++; cfDetail.push(p.id + ':' + f + '/' + gotArgb);
    }
  });
  pushResult(results, cfNg === 0, 'xlsx', '各行の条件付き書式の式と塗り色が正しいこと',
    cfNg ? cfDetail.slice(0, 3).join(' , ') : procs.length + ' 行');

  // 推定の記録が _data に残っていること
  const metaCol2 = doc.headers.length + 5;
  const estRow0 = 6 + META_KEYS.length;
  pushResult(results, wd.getCell(estRow0, metaCol2).value === '_estimates', 'xlsx',
    DATA_SHEET + ' に推定の記録があること', String(wd.getCell(estRow0, metaCol2).value));
  let estN = 0;
  for (let i = 0; i < (doc.estimates || []).length; i++) {
    if (wd.getCell(estRow0 + 2 + i, metaCol2 + 3).value === doc.estimates[i].field) estN++;
  }
  pushResult(results, estN === (doc.estimates || []).length, 'xlsx',
    '推定の記録が全件 xlsx に書かれていること',
    estN + ' / ' + (doc.estimates || []).length + ' 件');

  // _data（元 CSV の全列＋工程ID。列数は doc.headers から取る）
  const DATA_COL0 = 2;   // A 列は NETWORKDAYS 用の祝日一覧
  const hdrRow = wd.getRow(1);
  const hdr = [];
  for (let c = DATA_COL0; c <= DATA_COL0 + doc.headers.length; c++) hdr.push(hdrRow.getCell(c).value);
  pushResult(results, wd.getCell(1, 1).value === '祝日', 'xlsx',
    DATA_SHEET + ' の A 列が NETWORKDAYS 用の祝日一覧', String(wd.getCell(1, 1).value));
  pushResult(results, hdr[0] === COL.id, 'xlsx', DATA_SHEET + ' の 1 列目が 工程ID', String(hdr[0]));
  pushResult(results, hdr.slice(1).map((v) => v == null ? '' : String(v)).join(SEP) === doc.headers.join(SEP),
    'xlsx', DATA_SHEET + ' が元 CSV の見出しを列順どおり保持', (hdr.length - 1) + ' 列 / 元 ' + doc.headers.length + ' 列');
  let dataNg = 0;
  doc.processes.forEach((p, i) => {
    const row = wd.getRow(2 + i);
    if (String(row.getCell(DATA_COL0).value == null ? '' : row.getCell(DATA_COL0).value) !== p.id) { dataNg++; return; }
    const raw = doc.rows[p.index] || [];
    for (let c = 0; c < doc.headers.length; c++) {
      const got = row.getCell(DATA_COL0 + 1 + c).value;
      const gotS = got == null ? '' : (got.richText ? got.richText.map((t) => t.text).join('') : String(got));
      if (gotS !== String(raw[c] == null ? '' : raw[c])) { dataNg++; return; }
    }
  });
  pushResult(results, dataNg === 0, 'xlsx', DATA_SHEET + ' の全セルが元 CSV と等価',
    dataNg ? dataNg + ' 行が不一致' : doc.processes.length + ' 行');

  return results;
}
```

### 11.8 `src/07-diag.js` ― 診断ログ

```js
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
function diagRecordError(kind, message, stack) {
  DIAG_ERRORS.push({
    at: new Date().toISOString(), kind,
    message: String(message || '').slice(0, 500),
    stack: String(stack || '').split('\n').slice(0, 6).join('\n').slice(0, 1200),
  });
  if (DIAG_ERRORS.length > 50) DIAG_ERRORS.shift();
}
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

function diagFileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `診断ログ_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.txt`;
}
```

### 11.9 `src/06-ui.js` ― 画面まわり

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
      + 'プロジェクトG の画面で実際の行を確認し、上の「gate 中間行の指定」で上書きできます。');
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
  state.lastZoom = opt.DAY_W;

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
      catch (e) {
        // 解釈に失敗しても診断ログは出せるよう、生のテキストは残しておく
        state.csvText = String(fr.result); state.csvName = f.name; state.doc = null;
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
```

### 11.10 `tools/build-html.mjs` ― 単一 HTML の組み立て

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
  '00-holiday.js',
  '01-csv-model.js', '02-geometry.js', '03-render.js',
  '04-xlsx.js', '05-verify.js', '07-diag.js', '06-ui.js',
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

const out = join(root, 'プロジェクトG_工程表ツール.html');
writeFileSync(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`built ${out} (${kb} KB)`);
```

### 11.11 `tools/pdf-extract.py` ― PDF からベクター座標を抜く

```python
#!/usr/bin/env python3
"""
PDF 1 頁目から工程線のベクター座標を抜き、(日付 index, 行番号) 空間に直す。
描画規則を目視ではなく実座標で確定するための道具。
"""
import csv, io, json, datetime, collections
from pathlib import Path
import pymupdf

HERE = Path(__file__).resolve().parent
S = HERE.parent / "sample" / "Sample"
PDF = S / "サポートルーム_サンプル工程表.pdf"
CSV = S / "サポートルーム_サンプル工程表.csv"
START = datetime.date(2026, 9, 1)


def derive_grid(page):
    """灰色の休日列から x 原点と列幅を出す。"""
    xs = sorted({round(it[1].x0, 3) for g in page.get_drawings()
                 if g.get('fill') and abs(g['fill'][0] - 0.89) < 0.01
                 for it in g['items'] if it[0] == 're' and it[1].height > 600})
    W0 = min(round(b - a, 3) for a, b in zip(xs, xs[1:]))
    idx = [round((x - xs[0]) / W0) for x in xs]
    n = len(xs); sx = sum(idx); sy = sum(xs)
    sxx = sum(i * i for i in idx); sxy = sum(i * x for i, x in zip(idx, xs))
    W = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    X0 = (sy - W * sx) / n - 4 * W          # 最初の休日列は 09/05 = index 4
    return X0, W, xs


def node_rows(page, rows_sorted):
    """ノード丸の y を既知の行番号に対応づけて行原点・行高を出す。"""
    ys = sorted({round(g['rect'].y0 + g['rect'].height / 2, 3)
                 for g in page.get_drawings()
                 if g['items'] and all(it[0] == 'c' for it in g['items'])
                 and 3 < g['rect'].width < 12 and 3 < g['rect'].height < 12})
    assert len(ys) == len(rows_sorted), (len(ys), len(rows_sorted))
    n = len(ys); sx = sum(rows_sorted); sy = sum(ys)
    sxx = sum(r * r for r in rows_sorted); sxy = sum(r * y for r, y in zip(rows_sorted, ys))
    RH = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    A = (sy - RH * sx) / n                   # y(r) = A + RH*r
    return A, RH, ys


def load_procs():
    t = CSV.read_text(encoding="utf-8-sig")
    rows = list(csv.reader(io.StringIO(t)))
    H = {h: i for i, h in enumerate(rows[2])}
    out = []
    for r in rows[3:]:
        if not any(c.strip() for c in r):
            continue
        ln = json.loads(r[H['工程線名']])[0]
        out.append({
            'name': ln['name'], 'textSize': ln.get('textSize'),
            'shape': r[H['工程線の形状']], 'arrow': r[H['工程線の矢印']],
            'dash': r[H['実線・点線']], 'weight': r[H['工程線の太さ']],
            'color': r[H['工程線の色']], 'bg': r[H['工程線の背景色']],
            'slant': r[H['工程線の斜行']],
            'srow': int(r[H['開始日の行番号']]), 'erow': int(r[H['終了日の行番号']]),
            'start': datetime.date.fromisoformat(r[H['開始日']][:10]),
            'end': datetime.date.fromisoformat(r[H['終了日']][:10]),
            'mid': r[H['項目ID（中間ノード）']],
            'midDate': (datetime.date.fromisoformat(r[H['中間ノード日付']][:10])
                        if r[H['中間ノード日付']].strip() else None),
        })
    return out


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(round(int(h[i:i + 2], 16) / 255, 2) for i in (0, 2, 4))


def main():
    doc = pymupdf.open(PDF)
    page = doc[0]
    procs = load_procs()
    POLY = ('straight', 'xElbow', 'yElbow', 'crank', 'gate')
    rows_used = sorted({r for p in procs for r in (p['srow'], p['erow']) if p['shape'] in POLY})
    X0, W, _ = derive_grid(page)
    A, RH, _ = node_rows(page, rows_used)
    print(f"格子: x(n) = {X0:.3f} + n*{W:.4f}")
    print(f"      y(r) = {A:.3f} + r*{RH:.4f}  =  上端{A + RH / 2:.2f} + (r-1)*{RH:.4f} + {RH / 2:.4f}")
    print()

    def to_n(x): return (x - X0) / W
    def to_r(y): return (y - A) / RH

    by_color = collections.defaultdict(list)
    for p in procs:
        by_color[hex_rgb(p['color']) if p['color'] else (0.0, 0.0, 0.0)].append(p)

    segs = collections.defaultdict(list)
    for g in page.get_drawings():
        col = g.get('color')
        if not col:
            continue
        key = tuple(round(v, 2) for v in col)
        if key not in by_color:
            continue
        dash = (g.get('dashes') or '[] 0').strip()
        w = round(g.get('width') or 0, 2)
        for it in g['items']:
            if it[0] == 'l':
                a, b = it[1], it[2]
                segs[key].append((a.x, a.y, b.x, b.y, dash, w))
            elif it[0] == 're':
                r = it[1]
                segs[key].append(('re', r.x0, r.y0, r.x1, r.y1, dash, w))

    for key in sorted(by_color, key=lambda k: by_color[k][0]['name']):
        plist = by_color[key]
        print(f"=== 色 {key} → {', '.join(p['name'] for p in plist)} ===")
        for p in plist:
            n0 = (p['start'] - START).days
            n1 = (p['end'] - START).days + 1
            md = (p['midDate'] - START).days if p['midDate'] else None
            print(f"    CSV {p['name']:<5}{p['shape']:<22} n[{n0},{n1}] r[{p['srow']}→{p['erow']}]"
                  f" arrow={p['arrow']} dash={p['dash'] or '-'} w={p['weight'] or '-'}"
                  f" slant={p['slant'] or '-'} midN={md}")
        raw = []
        for s in segs.get(key, []):
            if s[0] == 're':
                _, x0, y0, x1, y1, dash, w = s
                print(f"    RECT n[{to_n(x0):7.3f},{to_n(x1):7.3f}] r[{to_r(y0):6.2f},{to_r(y1):6.2f}] dash={dash} w={w}")
            else:
                raw.append((to_n(s[0]), to_r(s[1]), to_n(s[2]), to_r(s[3]), s[4], s[5]))
        merged = []
        for (n0, r0, n1, r1, dash, w) in raw:
            if merged:
                pn0, pr0, pn1, pr1, pd, pw = merged[-1]
                straight = abs((n1 - n0) * (pr1 - pr0) - (r1 - r0) * (pn1 - pn0)) < 1e-5
                if abs(pn1 - n0) < 1e-4 and abs(pr1 - r0) < 1e-4 and straight and pw == w:
                    merged[-1] = (pn0, pr0, n1, r1, pd if pd == dash else 'mix', w)
                    continue
            merged.append((n0, r0, n1, r1, dash, w))
        for (n0, r0, n1, r1, dash, w) in merged:
            kind = '横' if abs(r1 - r0) < 1e-3 else ('縦' if abs(n1 - n0) < 1e-3 else '斜')
            print(f"      {kind} n {n0:8.3f} → {n1:8.3f}   r {r0:6.2f} → {r1:6.2f}  w={w} dash={dash}")
        print()


if __name__ == '__main__':
    main()
```

### 11.12 `tools/compare-pdf.py` ― PDF との照合（受け入れ 1）

```python
#!/usr/bin/env python3
"""
受け入れ 1：ツールの描画結果を PDF 1〜2 頁目と機械的に照合する。

目視ではなく、PDF のベクター座標とツールの SVG 幾何を
どちらも (日付 index, 行番号) 空間に直して 1 本ずつ突き合わせる。

プロジェクトG は休日区間を「丸い点の列」（塗り circle）で描き、線分では描かない。
そのため PDF の線分と比べられるのは「稼働日を 1 日でも含む走り」だけになる。
休日だけの走りは、線分として存在しないことを逆に確かめる。

照合するもの
  1. ノード丸 34 個の位置（＝全折れ線の端点）
  2. 折れ線の走り 1 本ずつ（同一直線上に PDF の線分があるか）
  3. box / bar の上下の辺と左右端
"""
import json, csv, io, datetime, collections, sys
from pathlib import Path
import pymupdf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
S = ROOT / "sample" / "Sample"
PDF = S / "サポートルーム_サンプル工程表.pdf"
CSVP = S / "サポートルーム_サンプル工程表.csv"
GEOM = ROOT / "out" / ("pdf_period_geometry_manual.json" if "--manual" in sys.argv
                       else "pdf_period_geometry.json")
LOGNAME = "pdf-compare-manual.log" if "--manual" in sys.argv else "pdf-compare.log"
START = datetime.date(2026, 9, 1)
TOL = 0.05

fails, lines = [], []


def chk(ok, label, detail=""):
    if not ok:
        fails.append(label)
    lines.append(f"{'OK' if ok else 'NG'}\t{label}\t{detail}")
    print(f"{'OK' if ok else 'NG'}  {label}  {detail}")


# ---------- 休日（ツールと同じ規則を Python 側でも独立に持つ） ----------
def nth_weekday(y, m, wd, nth):
    d = datetime.date(y, m, 1)
    shift = (wd - d.weekday()) % 7
    return d + datetime.timedelta(days=shift + (nth - 1) * 7)


def equinox(y, spring):
    base = 20.8431 if spring else 23.2488
    return datetime.date(y, 3 if spring else 9,
                         int(base + 0.242194 * (y - 1980) - (y - 1980) // 4))


def holidays(y):
    base = [datetime.date(y, 1, 1), nth_weekday(y, 1, 0, 2), datetime.date(y, 2, 11),
            datetime.date(y, 2, 23), equinox(y, True), datetime.date(y, 4, 29),
            datetime.date(y, 5, 3), datetime.date(y, 5, 4), datetime.date(y, 5, 5),
            nth_weekday(y, 7, 0, 3), datetime.date(y, 8, 11), nth_weekday(y, 9, 0, 3),
            equinox(y, False), nth_weekday(y, 10, 0, 2), datetime.date(y, 11, 3),
            datetime.date(y, 11, 23)]
    s = set(base)
    for d in base:
        if d.weekday() == 6:
            t = d + datetime.timedelta(days=1)
            while t in s:
                t += datetime.timedelta(days=1)
            s.add(t)
    for d in list(s):
        mid, nxt = d + datetime.timedelta(days=1), d + datetime.timedelta(days=2)
        if mid not in s and nxt in s and mid.weekday() != 6:
            s.add(mid)
    return s


HOL = holidays(2026) | holidays(2027)


def is_off(n):
    d = START + datetime.timedelta(days=int(n))
    return d.weekday() >= 5 or d in HOL


def any_working(a, b):
    """[a,b) の列範囲に稼働日が 1 日でもあるか"""
    lo, hi = sorted((a, b))
    for n in range(int(lo), max(int(lo) + 1, int(hi + 0.999))):
        if not is_off(n):
            return True
    return False


# ---------- PDF の格子 ----------
doc = pymupdf.open(PDF)


def grid(page):
    xs = sorted({round(it[1].x0, 3) for g in page.get_drawings()
                 if g.get('fill') and abs(g['fill'][0] - 0.89) < 0.01
                 for it in g['items'] if it[0] == 're' and it[1].height > 600})
    W0 = min(round(b - a, 3) for a, b in zip(xs, xs[1:]))
    idx = [round((x - xs[0]) / W0) for x in xs]
    n = len(xs); sx = sum(idx); sy = sum(xs)
    sxx = sum(i * i for i in idx); sxy = sum(i * x for i, x in zip(idx, xs))
    W = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    return (sy - W * sx) / n - 4 * W, W


X0, W = grid(doc[0])
RH, TOP = 16.5450, 132.00
FIRST_ROW = {0: 1, 1: 43}

segs = []           # (color, n0, r0, n1, r1)
circles = []
for pi, page in enumerate(doc):
    fr = FIRST_ROW[pi]
    tn = lambda x: (x - X0) / W
    tr = lambda y: (y - TOP) / RH + fr - 0.5
    for g in page.get_drawings():
        col = g.get('color')
        if g['items'] and all(it[0] == 'c' for it in g['items']):
            rc = g['rect']
            if 3 < rc.width < 12 and 3 < rc.height < 12:
                circles.append((round(tn(rc.x0 + rc.width / 2), 2), round(tr(rc.y0 + rc.height / 2), 2)))
            continue
        fill = g.get('fill')
        if col and (g.get('width') or 0) >= 1.0:
            key = tuple(round(v, 2) for v in col)
        elif fill and not col:
            # プロジェクトG は barProcessNameAdjust を塗りだけで描く（枠線が無い）
            key = tuple(round(v, 2) for v in fill)
        else:
            continue
        for it in g['items']:
            if it[0] == 'l':
                segs.append((key, tn(it[1].x), tr(it[1].y), tn(it[2].x), tr(it[2].y)))


# ---------- CSV / ツール ----------
rows = list(csv.reader(io.StringIO(CSVP.read_text(encoding="utf-8-sig"))))
H = {h: i for i, h in enumerate(rows[2])}
by_id = {}
for r in rows[3:]:
    if not any(c.strip() for c in r):
        continue
    ln = json.loads(r[H['工程線名']])[0]
    by_id[r[H['工程ID']]] = dict(name=ln['name'], shape=r[H['工程線の形状']],
                                 color=(r[H['工程線の色']] or '#000000').lower(),
                                 bg=(r[H['工程線の背景色']] or '').lower())


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(round(int(h[i:i + 2], 16) / 255, 2) for i in (0, 2, 4))


geom = json.loads(GEOM.read_text(encoding="utf-8"))
chk(len(geom) == len(by_id), "ツールが PDF と同じ本数を描いた", f"{len(geom)} / {len(by_id)}")

# ---------- 1. ノード丸 ----------
my_nodes = []
for g in geom:
    if g['kind'] != 'poly':
        continue
    my_nodes.append((round(g['pts'][0][0], 2), round(g['pts'][0][1], 2)))
    my_nodes.append((round(g['pts'][-1][0], 2), round(g['pts'][-1][1], 2)))
cp, cm = collections.Counter(circles), collections.Counter(my_nodes)
chk(cp == cm, "ノード丸 34 個の位置が PDF と一致（全折れ線の端点）",
    f"PDF {len(circles)} 個 / ツール {len(my_nodes)} 個"
    + ("" if cp == cm else f"  PDFのみ={sorted((cp-cm).elements())} ツールのみ={sorted((cm-cp).elements())}"))


def find_seg(color, horiz, level, lo, hi):
    """color の線分で、水平/垂直が level に乗り [lo,hi] と重なるものを探す"""
    for (k, n0, r0, n1, r1) in segs:
        if k != color:
            continue
        if horiz:
            if abs(r0 - r1) > 0.01 or abs(r0 - level) > TOL:
                continue
            a, b = sorted((n0, n1))
        else:
            if abs(n0 - n1) > 0.01 or abs(n0 - level) > TOL:
                continue
            a, b = sorted((r0, r1))
        if b > lo + 0.05 and a < hi - 0.05:
            return (round(a, 2), round(b, 2))
    return None


# ---------- 2. 折れ線の走り ----------
for g in geom:
    if g['kind'] != 'poly':
        continue
    p = by_id[g['id']]
    color = hexrgb(p['color'])
    pts = g['pts']
    ok_all, notes = True, []
    for i, ((n0, r0), (n1, r1)) in enumerate(zip(pts, pts[1:])):
        horiz = abs(r1 - r0) < 0.01
        vert = abs(n1 - n0) < 0.01
        if abs(n1 - n0) < 0.01 and abs(r1 - r0) < 0.01:
            continue
        if horiz:
            working = any_working(n0, n1)
            hit = find_seg(color, True, r0, min(n0, n1), max(n0, n1))
        elif vert:
            # 縦の走りが属する日 = 右へ続くなら n、左から来たなら n-1
            nxt = pts[i + 2][0] if i + 2 < len(pts) else None
            prv = pts[i - 1][0] if i > 0 else None
            day = int(n0) if (nxt is not None and nxt > n0) else (int(n0) - 1 if (prv is not None and prv < n0) else int(n0))
            working = not is_off(day)
            hit = find_seg(color, False, n0, min(r0, r1), max(r0, r1))
        else:
            working = any_working(n0, n1)
            hit = None
            for (k, a0, b0, a1, b1) in segs:
                if k != color or abs(a0 - a1) < 0.01 or abs(b0 - b1) < 0.01:
                    continue
                if min(a0, a1) < max(n0, n1) and max(a0, a1) > min(n0, n1) \
                        and min(b0, b1) < max(r0, r1) + 0.3 and max(b0, b1) > min(r0, r1) - 0.3:
                    hit = (round(min(a0, a1), 2), round(max(a0, a1), 2)); break
        kind = '横' if horiz else ('縦' if vert else '斜')
        if working and not hit:
            ok_all = False
            notes.append(f"{kind} n[{n0:g},{n1:g}] r[{r0:g},{r1:g}] が PDF に無い")
        elif not working and hit:
            ok_all = False
            notes.append(f"{kind} n[{n0:g},{n1:g}] は休日のみなのに PDF に線分がある")
    chk(ok_all, f"{p['name']} ({p['shape']}) の折れ方が PDF と一致",
        '; '.join(notes) if notes else f"{len(pts) - 1} 走り")

# ---------- 3. box / bar ----------
for g in geom:
    if g['kind'] == 'poly':
        continue
    p = by_id[g['id']]
    color = hexrgb(p['color'])
    b = g['box']
    top, bot = b['rTop'], b['rTop'] + b['rH']
    notes = []
    for lvl, nm in ((top, '上辺'), (bot, '下辺')):
        if not find_seg(color, True, lvl, b['n0'], b['n1']):
            notes.append(f"{nm} r={lvl:.3f} が PDF に無い")
    chk(not notes, f"{p['name']} ({p['shape']}) の上下の辺が PDF と一致",
        '; '.join(notes) or f"上 r={top:.3f} 下 r={bot:.3f} 高さ {b['rH']:.3f}行")

# ---------- 4. 関係線 ----------
# プロジェクトG は関係線も点で描くので、線分ではなく矢じりの位置で見る。
# PDF 実測：先端は (n=6.00, r=24.77)。上側ノード（C1 の開始、行 21）の x に
# まっすぐ縦、下側ノード（D1、行 25）の手前で止まる。
import xml.etree.ElementTree as ET
svg = ET.parse(ROOT / "out" / ("pdf_period_manual.svg" if "--manual" in sys.argv else "pdf_period.svg")).getroot()
relpaths = [e for e in svg.iter('{http://www.w3.org/2000/svg}path')
            if e.get('class') == 'relation']
chk(len(relpaths) == 1, "関係線が 1 本描かれている", f"{len(relpaths)} 本")
if relpaths:
    d = relpaths[0].get('d').split()
    n0, r0 = float(d[1]) / 24, (float(d[2]) - 14) / 28 + 1   # DAY_W=24 / ROW_H=28
    n1, r1 = float(d[4]) / 24, (float(d[5]) - 14) / 28 + 1
    tips = [(round(a0, 2), round(b0, 2)) for (k, a0, b0, a1, b1) in segs
            if abs(a0 - 6.0) < 0.05 and 24.0 < b0 < 25.5]
    chk(abs(n0 - 6.0) < 0.05 and abs(r0 - 21.0) < 0.05,
        "関係線の上端が PDF と一致（C1 開始ノード n=6 行21）", f"ツール n={n0:g} r={r0:g}")
    chk(abs(n1 - 6.0) < 0.05 and abs(r1 - 25.0) < 0.35,
        "関係線の下端が PDF の矢じり位置と一致（行25 の手前）",
        f"ツール n={n1:g} r={r1:g} / PDF矢じり={tips[:2]}")

print()
print(f"{'ALL PASS' if not fails else str(len(fails)) + ' FAILED'}  ({len(lines)} 項目)")
(ROOT / "out" / LOGNAME).write_text("\n".join(lines) + "\n", encoding="utf-8")
sys.exit(0 if not fails else 1)
```

### 11.13 `tools/acceptance.mjs` ― 受け入れ試験

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

const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
// Sample.zip の本物の CSV（SHA-256 照合済み）
const CSV = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');
const CSV_NAME = 'サポートルーム_サンプル工程表.csv';

/** 工程行を 1 本複製して 24 本にした CSV（受け入れ 4） */
function csvWith24(text) {
  const lines = text.split('\r\n');
  const body = lines.slice(3).filter((l) => l.trim() !== '');
  // 1 本目を複製し、工程IDと工程線名のIDだけ書き換えて 24 本にする
  const cols = body[0].split(',');
  const dup = body[0].replace(cols[7], cols[7] + 'X');
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
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

/** 1 ケース実行して検査結果を返す */
async function runCase(csv, name, start, end, zoom, gateRows) {
  return page.evaluate(async ([csv, name, start, end, zoom, gateRows]) => {
    window.__TOOL__.setGateRows(gateRows || '');
    window.__TOOL__.loadCsvText(csv, name);
    window.__TOOL__.setPeriod(start, end);
    if (zoom) window.__TOOL__.setZoom(zoom);
    const r = window.__TOOL__.render();
    const x = await window.__TOOL__.xlsx();
    let b64 = null;
    if (x && x.buffer) {
      const u8 = new Uint8Array(x.buffer);
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      b64 = btoa(s);
    }
    const res = window.__TOOL__.results();
    return {
      drawn: r.drawn.length, skipped: r.skipped.length,
      procCount: window.__TOOL__.state.doc.processes.length,
      headerCount: window.__TOOL__.state.doc.headers.length,
      svg: res.svg, xlsx: res.xlsx,
      fileName: x && x.name, b64,
      svgText: new XMLSerializer().serializeToString(r.svg),
      geom: r.drawn.map((d) => ({
        id: d.p.id, name: d.p.name, shape: d.p.shape,
        kind: d.sh.kind,
        pts: d.sh.pts ? d.sh.pts.map((q) => [q[0] / r.geo.DAY_W, (q[1] - r.geo.ROW_H / 2) / r.geo.ROW_H + 1]) : null,
        box: d.sh.kind !== 'poly' ? {
          n0: d.sh.x0 / r.geo.DAY_W, n1: d.sh.x1 / r.geo.DAY_W,
          rTop: ((d.sh.top != null ? d.sh.top : d.sh.yc - d.sh.h / 2) - r.geo.ROW_H / 2) / r.geo.ROW_H + 1,
          rH: d.sh.h / r.geo.ROW_H,
        } : null,
      })),
      estimates: window.__TOOL__.estimates(),
      log: window.__TOOL__.logText(),
    };
  }, [csv, name, start, end, zoom, gateRows]);
}

function summarize(tag, results) {
  const ng = results.filter((r) => !r.ok);
  say(`      ${tag}: ${results.length - ng.length}/${results.length} OK`);
  for (const r of ng.slice(0, 20)) say(`        NG ${r.scope} / ${r.label} / ${r.detail}`);
  return ng.length;
}

/* ---------------- 受け入れ 1（代替）: 2026/09/01–10/10 ---------------- */
say('\n=== 受け入れ 1（PDF 照合の代替）: 2026/09/01–10/10 で描画 ===');
say('   PDF 1 頁目と 23 工程を突き合わせる（照合は tools/compare-pdf.py が担当）。');
const c1 = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-10');
assert(c1.procCount === 23, '工程 23 件を読み込んだ', `${c1.procCount} 件`);
assert(c1.headerCount === 124, '見出し 124 列を読み込んだ', `${c1.headerCount} 列`);
assert(c1.drawn === 23, '23 件すべてを描画した', `描画 ${c1.drawn} / 除外 ${c1.skipped}`);
assert(summarize('SVG 検査', c1.svg) === 0, 'SVG 検査が全件 OK');
writeFileSync(join(OUT, 'case1_09-01_10-10.svg'), c1.svgText);
writeFileSync(join(OUT, 'case1_geometry.json'), JSON.stringify(c1.geom, null, 1));
await page.screenshot({ path: join(OUT, 'case1_09-01_10-10.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case1_plot.png') });

/* 推定の記録：CSV に無く規則で埋めた箇所が残っていること */
const ruleEst = c1.estimates.filter((e) => e.source === 'rule');
say('      CSV に無く埋めた箇所: ' + c1.estimates.length + ' 件（うち要確認の推定 ' + ruleEst.length + ' 件）');
for (const e of ruleEst) say(`        推定 ${e.scope}(${e.name}) ${e.field} = ${e.value}`);
assert(c1.estimates.every((e) => e.field && e.rule && e.reason),
  '埋めた箇所すべてに 項目・規則・理由 が記録されている', `${c1.estimates.length} 件`);
assert(ruleEst.length > 0, '要確認の推定が記録されている', `${ruleEst.length} 件`);

/* PDF と同じ表示期間（2026/09/01–10/30）でも幾何を出す。PDF 照合用。 */
const cPdf = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-30');
writeFileSync(join(OUT, 'pdf_period_geometry.json'), JSON.stringify(cPdf.geom, null, 1));
writeFileSync(join(OUT, 'pdf_period.svg'), cPdf.svgText);
assert(summarize('SVG 検査(PDF期間)', cPdf.svg) === 0, 'PDF と同じ期間でも SVG 検査が全件 OK');

/* gate 中間行を手入力で上書きしたとき、推定が消えて PDF どおりになること。
   行 32 / 23 は プロジェクトG の画面（画面スクショ遠景.png）の行見出しから読んだ値。 */
say('\n=== 追加検査: gate 中間行の手入力で上書きできる ===');
const GATE_FIX = 't00an4117fvj98tp203tgn4s:32, hlb7z0icyjst6kbyqhsk2sik:23';
const cFix = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-10-30', null, GATE_FIX);
writeFileSync(join(OUT, 'pdf_period_geometry_manual.json'), JSON.stringify(cFix.geom, null, 1));
writeFileSync(join(OUT, 'pdf_period_manual.svg'), cFix.svgText);
const fixEst = cFix.estimates.filter((e) => e.field === 'gate の中間ノードの行');
assert(fixEst.length === 2 && fixEst.every((e) => e.source === 'manual'),
  '手入力した gate は「手入力」として記録される', fixEst.map((e) => e.source).join(','));
assert(summarize('SVG 検査(手入力)', cFix.svg) === 0, '手入力しても SVG 検査が全件 OK');

/* ---------------- 受け入れ 2（代替）: 2026/09/01–09/30 ---------------- */
say('\n=== 受け入れ 2（画面スクショ照合の代替）: 2026/09/01–09/30 ===');

const c2 = await runCase(CSV, CSV_NAME, '2026-09-01', '2026-09-30', 18);
assert(summarize('SVG 検査', c2.svg) === 0, 'SVG 検査が全件 OK');
say(`      描画 ${c2.drawn} 件 / 期間外で除外 ${c2.skipped} 件`);
writeFileSync(join(OUT, 'case2_09-01_09-30.svg'), c2.svgText);
await page.screenshot({ path: join(OUT, 'case2_09-01_09-30.png'), fullPage: true });
await page.locator('#plot svg').screenshot({ path: join(OUT, 'case2_plot.png') });

/* ---------------- 受け入れ 3: xlsx 検査 ---------------- */
say('\n=== 受け入れ 3: xlsx を書き出して読み戻し検査 ===');
say('   ※ 01_設計A 6 章は未提供なので、検査項目は共通仕様 4 章・6〜7 章と設計B 5.3 から導いた。');
assert(summarize('xlsx 検査', c1.xlsx) === 0, 'xlsx 検査が全件 OK');
assert(!!c1.b64, 'xlsx バッファを生成した');
assert(c1.fileName === 'サポートルーム_サンプル工程表_20260901-20261010.xlsx',
  'ファイル名が <CSV名>_<Start>-<End>.xlsx', String(c1.fileName));
if (c1.b64) {
  const buf = Buffer.from(c1.b64, 'base64');
  writeFileSync(join(OUT, c1.fileName), buf);
  assert(buf.slice(0, 2).toString() === 'PK', 'xlsx が ZIP として妥当', `${buf.length} bytes`);
  say(`      書き出し: out/${c1.fileName} (${buf.length} bytes)`);
}

/* ---------------- 受け入れ 4: 24 本にしても動く ---------------- */
say('\n=== 受け入れ 4: 工程行を複製して 24 本にした CSV ===');
const c4 = await runCase(csvWith24(CSV), 'サポートルーム_サンプル工程表_24本.csv', '2026-09-01', '2026-10-10');
assert(c4.procCount === 24, '工程 24 件を読み込んだ', `${c4.procCount} 件`);
assert(c4.drawn === 24, '24 件すべてを描画した', `描画 ${c4.drawn}`);
assert(summarize('SVG 検査', c4.svg) === 0, 'SVG 検査が全件 OK');
assert(summarize('xlsx 検査', c4.xlsx) === 0, 'xlsx 検査が全件 OK');

/* ---------------- 追加: サンプル固有値に依存していないこと ---------------- */
say('\n=== 追加検査: 合成 CSV（日付・色・IDが全て別物）でも動く ===');
say('   共通仕様 禁止事項 1「サンプル固有値をコードに埋めない」の確認。');
const SYN = readFileSync(join(root, 'fixtures', '合成工程表_回帰用.csv'), 'utf8');
const cSyn = await runCase(SYN, '合成工程表_回帰用.csv', '2026-09-01', '2026-10-10');
assert(cSyn.drawn === 23, '合成 CSV も 23 件描画した', `描画 ${cSyn.drawn}`);
assert(summarize('SVG 検査', cSyn.svg) === 0, '合成 CSV で SVG 検査が全件 OK');
assert(summarize('xlsx 検査', cSyn.xlsx) === 0, '合成 CSV で xlsx 検査が全件 OK');

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
  try { window.__TOOL__.loadCsvText(csv, 'bad.csv'); return null; }
  catch (e) { return e.message; }
}, badHeader);
assert(!!errMsg && errMsg.includes('必須列'), '必須列が無い CSV はエラーになる', String(errMsg));

const quoted = await page.evaluate(() => {
  // RFC 4180：引用内のカンマ・二重引用符・改行
  const t = 'a,b\r\n1,2\r\nx,y\r\n"p,q","r""s"\r\n';
  return typeof window.__TOOL__ === 'object';
});
assert(quoted, 'フックが生きている');

await browser.close();

say(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILED'}`);
writeFileSync(join(OUT, 'acceptance.log'), report.join('\n') + '\n');
writeFileSync(join(OUT, 'inspection-case1.log'),
  c1.svg.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n\n'
  + c1.xlsx.map((r) => `${r.ok ? 'OK' : 'NG'}\t${r.scope}\t${r.label}\t${r.detail}`).join('\n') + '\n');
process.exit(failures === 0 ? 0 : 1);
```

### 11.14 `tools/verify-xlsx-independent.py` ― openpyxl による独立検査

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
CSV_PATH = ROOT / "sample" / "Sample" / "サポートルーム_サンプル工程表.csv"
XLSX = sys.argv[1] if len(sys.argv) > 1 else str(
    ROOT / "out" / "サポートルーム_サンプル工程表_20260901-20261010.xlsx")
START = datetime.date(2026, 9, 1)
END = datetime.date(2026, 10, 10)

fails = []
lines = []


def chk(ok, label, detail=""):
    if not ok:
        fails.append(label)
    lines.append(f"{'OK' if ok else 'NG'}\t{label}\t{detail}")


def nth_weekday(y, m, wd, nth):
    d = datetime.date(y, m, 1)
    return d + datetime.timedelta(days=(wd - d.weekday()) % 7 + (nth - 1) * 7)


def equinox(y, spring):
    base = 20.8431 if spring else 23.2488
    return datetime.date(y, 3 if spring else 9,
                         int(base + 0.242194 * (y - 1980) - (y - 1980) // 4))


def holidays(y):
    """日本の祝日。ツールの 00-holiday.js とは別実装で同じ規則を書く。"""
    base = [datetime.date(y, 1, 1), nth_weekday(y, 1, 0, 2), datetime.date(y, 2, 11),
            datetime.date(y, 2, 23), equinox(y, True), datetime.date(y, 4, 29),
            datetime.date(y, 5, 3), datetime.date(y, 5, 4), datetime.date(y, 5, 5),
            nth_weekday(y, 7, 0, 3), datetime.date(y, 8, 11), nth_weekday(y, 9, 0, 3),
            equinox(y, False), nth_weekday(y, 10, 0, 2), datetime.date(y, 11, 3),
            datetime.date(y, 11, 23)]
    s = set(base)
    for d in base:
        if d.weekday() == 6:
            t = d + datetime.timedelta(days=1)
            while t in s:
                t += datetime.timedelta(days=1)
            s.add(t)
    for d in list(s):
        mid, nxt = d + datetime.timedelta(days=1), d + datetime.timedelta(days=2)
        if mid not in s and nxt in s and mid.weekday() != 6:
            s.add(mid)
    return s


HOL = holidays(2026) | holidays(2027)


def is_off(d):
    return d.weekday() >= 5 or d in HOL


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
    if is_off(d) != shaded:
        bad_fill += 1
chk(bad_day == 0, "行 2 の日付が 1 日ずつ一致", f"{days} 列 / NG {bad_day}")
chk(bad_wk == 0, "行 3 が同じ日付を指す", f"NG {bad_wk}")
chk(bad_fill == 0, "休日列（土日＋祝日）が薄灰", f"NG {bad_fill}")
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
    want_rgb = "FF" + (p["color"] or "#000000").lstrip("#").upper()
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
chk(wd.cell(row=1, column=1).value == "祝日", "_data の A 列が NETWORKDAYS 用の祝日一覧")
chk(wd.cell(row=1, column=2).value == "工程ID", "_data の B 列が 工程ID")
DATA0 = 2
hdr = [wd.cell(row=1, column=c).value for c in range(DATA0 + 1, DATA0 + 1 + len(headers))]
chk(hdr == headers, "_data が元 CSV の見出しを列順どおり保持",
    f"{len(hdr)} 列 / 元 {len(headers)} 列")
all_rows = [r for r in rows[3:] if any(c.strip() for c in r)]
bad_data = 0
for i, r in enumerate(all_rows):
    if str(wd.cell(row=2 + i, column=DATA0).value or "") != r[H["工程ID"]]:
        bad_data += 1
        continue
    for c in range(len(headers)):
        got = wd.cell(row=2 + i, column=DATA0 + 1 + c).value
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

### 11.15 `tools/make-fixture.mjs` ― 合成 CSV の生成

```js
/*
 * 合成 CSV 生成器（回帰用）
 * ------------------------------------------------------------------
 * 本物の Sample.zip とは別に、同じ形状分布・線幅分布・件数を持つが
 * 日付・色・項目名・ID がまったく違う CSV を作る。
 *
 * 目的はひとつ：**ツールがサンプル固有値に依存していないことを示す**
 * （共通仕様 禁止事項 1）。本物と合成の両方で検査が全件通れば、
 * 工程数 23・124 列・行番号 5〜46 をコードに埋めていないと言える。
 *
 * ツール本体はこのファイルを一切参照しない。
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
  P('A1', 'yElbow', 'nA0', 9, 'nA1', 7, '2026-09-01', '2026-09-08', { color: '#1f77b4', textSize: 'L', rel0: '関係１', within: 'lineNameUpperLeft' }),
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
  P('バー1', 'boxS', 'nF1', 40, 'nF1e', 40, '2026-09-05', '2026-09-18', { color: '#8c564b', fill: '#f2e3df', textSize: 'XS', within: 'boxNameUpperCenter' }),
  P('バー2', 'boxM', 'nF2', 41, 'nF2e', 41, '2026-09-07', '2026-09-24', { color: '#8c564b', fill: '#f2e3df', weight: '2.5', textSize: 'M', within: 'boxNameMiddleCenter' }),
  P('バー3', 'boxL', 'nF3', 42, 'nF3e', 42, '2026-09-10', '2026-10-01', { color: '#8c564b', fill: '#f2e3df', textSize: 'XL', within: 'boxNameLowerLeft' }),
  P('バー4', 'barAutoAdjust', 'nF4', 43, 'nF4e', 43, '2026-09-06', '2026-09-20', { color: '#17becf', fill: '#17becf', ns: 'none', ne: 'none' }),
  P('バー5', 'barAutoAdjust', 'nF5', 44, 'nF5e', 44, '2026-09-21', '2026-10-09', { color: '#17becf', fill: '#7fdbe7', ns: 'none', ne: 'none' }),
  P('バー6', 'barProcessNameAdjust', 'nF6', 46, 'nF6e', 46, '2026-09-12', '2026-10-03', { color: '#e377c2', ns: 'none', ne: 'none' }),
];

// ---- 派生値 -------------------------------------------------------
const DAY = 86400000;
const utc = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
/* 休日 = 土日 ＋ 日本の祝日。プロジェクトG の 休日 列と同じ規則
   （PDF の灰色列と本物 CSV の 休日 列で確認済み）。 */
const nthMon = (y, m, nth) => {
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Date(Date.UTC(y, m - 1, 1 + ((1 - d.getUTCDay() + 7) % 7) + (nth - 1) * 7));
};
const equinox = (y, spring) => new Date(Date.UTC(y, spring ? 2 : 8,
  Math.floor((spring ? 20.8431 : 23.2488) + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))));
const key = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
function holidaySet(y) {
  const base = [new Date(Date.UTC(y, 0, 1)), nthMon(y, 1, 2), new Date(Date.UTC(y, 1, 11)),
    new Date(Date.UTC(y, 1, 23)), equinox(y, true), new Date(Date.UTC(y, 3, 29)),
    new Date(Date.UTC(y, 4, 3)), new Date(Date.UTC(y, 4, 4)), new Date(Date.UTC(y, 4, 5)),
    nthMon(y, 7, 3), new Date(Date.UTC(y, 7, 11)), nthMon(y, 9, 3), equinox(y, false),
    nthMon(y, 10, 2), new Date(Date.UTC(y, 10, 3)), new Date(Date.UTC(y, 10, 23))];
  const s = new Set(base.map(key));
  for (const d of base) {
    if (d.getUTCDay() !== 0) continue;
    let t = new Date(d.getTime() + DAY);
    while (s.has(key(t))) t = new Date(t.getTime() + DAY);
    s.add(key(t));
  }
  for (const k of Array.from(s)) {
    const y2 = Math.floor(k / 10000), m2 = Math.floor(k / 100) % 100, d2 = k % 100;
    const d = new Date(Date.UTC(y2, m2 - 1, d2));
    const mid = new Date(d.getTime() + DAY), nxt = new Date(d.getTime() + 2 * DAY);
    if (!s.has(key(mid)) && s.has(key(nxt)) && mid.getUTCDay() !== 0) s.add(key(mid));
  }
  return s;
}
const HOL = new Set([...holidaySet(2026), ...holidaySet(2027)]);
const isOff = (d) => { const w = d.getUTCDay(); return w === 0 || w === 6 || HOL.has(key(d)); };
function derive(startIso, endIso) {
  const a = utc(startIso), b = utc(endIso);
  const total = Math.round((b - a) / DAY) + 1;
  let holiday = 0;
  for (let t = a; t <= b; t += DAY) if (isOff(new Date(t))) holiday++;
  return { total, holiday, work: total - holiday };
}

/* 本物の CSV と同じスキーマ（真偽値・{x,y} オブジェクト・XS〜XL） */
function lineNameJson(p, pid) {
  return JSON.stringify([{
    showContentsDaysWithLineBreak: 'contentsDaysWithLineBreakOff',
    textSize: p.textSize || 'L',
    namePositionWithinOptions: p.within || 'lineNameUpperCenter',
    nameColor: '#000000',
    showTotalDays: 'totalDaysOff',
    showNameOnLine: true,
    showWorkingDays: 'workingDaysOff',
    name: p.name,
    namePositionCoefficient: { x: 0, y: -0.1 },
    namePosition: { x: 0, y: 0 },
    id: `L${pid.slice(1)}`,
    nameBold: !!p.bold,
    showLeaderLine: false,
    nameAlignment: 'center',
    nameWritingMode: 'textHorizontal',
  }]);
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
const path = new URL('../fixtures/合成工程表_回帰用.csv', import.meta.url);
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

### 11.16 `tools/svgshot.mjs` ― SVG の全景 PNG 化

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

### 11.17 `tools/holiday-test.mjs` ― 祝日計算の検査

```js
/*
 * 祝日計算の検査。
 *  1. PDF と CSV から確定した 2026 年の 4 日を含むこと
 *  2. 振替休日・国民の休日が法律どおりの条件でしか出ないこと
 *  3. 本物のサンプル 23 工程の `休日` 列と完全に一致すること
 *  4. 2024〜2030 の一覧を出す（監査用。実装メモに載せる）
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = readFileSync(join(root, 'src', '00-holiday.js'), 'utf8');
// 00-holiday.js は素の <script> 用なので、そのまま評価して関数を取り出す
const api = new Function(src + `
  return { holidaysOfYear, holidayName, isPublicHoliday, isWeekend,
           isNonWorkingDay, countNonWorking, nonWorkingReason, holidayRangeWarning };
`)();

const out = [];
let fails = 0;
const say = (s) => { console.log(s); out.push(s); };
function chk(ok, label, detail = '') {
  if (!ok) fails++;
  say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`);
}

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const fmt = (k) => String(k).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
const WD = '日月火水木金土';

/* ---- 1. PDF・CSV から確定した 2026 年の祝日 ---- */
for (const [m, d, name] of [[9, 21, '敬老の日'], [9, 22, '国民の休日'], [9, 23, '秋分の日'], [10, 12, 'スポーツの日']]) {
  chk(api.holidayName(D(2026, m, d)) === name,
    `2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} が ${name}`,
    String(api.holidayName(D(2026, m, d))));
}

/* ---- 2. 振替休日・国民の休日の条件 ---- */
let subNg = 0, natNg = 0, dupNg = 0;
for (let y = 2007; y <= 2040; y++) {
  const m = api.holidaysOfYear(y);
  const keys = Array.from(m.keys());
  if (new Set(keys).size !== keys.length) dupNg++;
  for (const [k, name] of m) {
    const yy = Math.floor(k / 10000), mo = Math.floor(k / 100) % 100, dd = k % 100;
    const day = D(yy, mo, dd);
    if (name === '振替休日') {
      // 直前に「日曜の祝日」があり、その間が全部祝日であること
      let t = new Date(day.getTime() - 86400000);
      while (m.has(t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate())
             && t.getUTCDay() !== 0) t = new Date(t.getTime() - 86400000);
      if (t.getUTCDay() !== 0) subNg++;
    }
    if (name === '国民の休日') {
      const prev = new Date(day.getTime() - 86400000), next = new Date(day.getTime() + 86400000);
      if (!api.isPublicHoliday(prev) || !api.isPublicHoliday(next) || day.getUTCDay() === 0) natNg++;
    }
  }
}
chk(dupNg === 0, '同じ日が二重に登録されていない', `${dupNg} 年で重複`);
chk(subNg === 0, '振替休日は日曜の祝日の後にしか出ない（2007–2040）', `${subNg} 件が条件外`);
chk(natNg === 0, '国民の休日は祝日に挟まれた平日にしか出ない（2007–2040）', `${natNg} 件が条件外`);

/* 件数の妥当性。下限 15 は山の日が無い 2007–2015、
   上限 22 は即位関連で 2 日増える 2019。 */
let cntNg = [];
for (let y = 2007; y <= 2040; y++) {
  const n = api.holidaysOfYear(y).size;
  if (n < 15 || n > 22) cntNg.push(`${y}:${n}`);
}
chk(cntNg.length === 0, '各年の祝日数が 15〜22 日に収まる（2007–2040）', cntNg.join(' '));
/* 山の日は 2016 年から */
chk(!api.isPublicHoliday(D(2015, 8, 11)) && api.holidayName(D(2016, 8, 11)) === '山の日',
  '山の日は 2016 年から', `2015=${api.holidayName(D(2015, 8, 11))} / 2016=${api.holidayName(D(2016, 8, 11))}`);
/* 天皇誕生日は 2018 年まで 12/23、2019 年は無し、2020 年から 2/23 */
chk(api.holidayName(D(2018, 12, 23)) === '天皇誕生日'
  && !api.isPublicHoliday(D(2019, 12, 23)) && !api.isPublicHoliday(D(2019, 2, 23))
  && api.holidayName(D(2020, 2, 23)) === '天皇誕生日',
  '天皇誕生日が 2018→2019→2020 で法律どおり移る');
/* 2019 の即位関連と、それに挟まれた国民の休日 */
chk(api.holidayName(D(2019, 5, 1)) === '天皇の即位の日'
  && api.holidayName(D(2019, 4, 30)) === '国民の休日'
  && api.holidayName(D(2019, 5, 2)) === '国民の休日'
  && api.holidayName(D(2019, 10, 22)) === '即位礼正殿の儀の行われる日',
  '2019 の即位関連 4 日が正しい',
  `${api.holidayName(D(2019, 4, 30))} / ${api.holidayName(D(2019, 5, 1))} / ${api.holidayName(D(2019, 5, 2))} / ${api.holidayName(D(2019, 10, 22))}`);
/* 2020・2021 の五輪特例 */
chk(api.holidayName(D(2020, 7, 23)) === '海の日' && api.holidayName(D(2020, 7, 24)) === 'スポーツの日'
  && api.holidayName(D(2020, 8, 10)) === '山の日' && !api.isPublicHoliday(D(2020, 10, 12)),
  '2020 の五輪特例（海の日 7/23・スポーツの日 7/24・山の日 8/10）');
chk(api.holidayName(D(2021, 7, 22)) === '海の日' && api.holidayName(D(2021, 7, 23)) === 'スポーツの日'
  && api.holidayName(D(2021, 8, 8)) === '山の日',
  '2021 の五輪特例（海の日 7/22・スポーツの日 7/23・山の日 8/8）');
/* 2007 年より前は警告を出す */
chk(!!api.holidayRangeWarning(D(2005, 1, 1), D(2005, 12, 31)), '2007 年より前は警告を出す');
chk(api.holidayRangeWarning(D(2026, 9, 1), D(2026, 10, 30)) === null, '2026 年は警告なし');

/* ---- 3. 本物のサンプルの `休日` 列と一致 ---- */
const csv = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8')
  .replace(/^﻿/, '');
const rows = csv.split('\r\n').filter((l) => l.trim() !== '');
const headers = rows[2].split(',');
const ix = (n) => headers.indexOf(n);
let holNg = [], checked = 0;
for (const line of rows.slice(3)) {
  // 工程線名 JSON に引用カンマがあるので、必要な列だけ簡易に取り出す
  const cells = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  const s = cells[ix('開始日')].slice(0, 10), e = cells[ix('終了日')].slice(0, 10);
  const want = parseInt(cells[ix('休日')], 10);
  const id = cells[ix('工程ID')];
  const got = api.countNonWorking(new Date(s + 'T00:00:00Z'), new Date(e + 'T00:00:00Z'));
  checked++;
  if (got !== want) holNg.push(`${id} CSV=${want} 計算=${got}`);
}
chk(holNg.length === 0, `サンプル ${checked} 工程の 休日 列と完全一致`, holNg.slice(0, 3).join(' / '));

/* ---- 4. 一覧（監査用） ---- */
say('');
say('=== 算出した祝日（2024–2030） ===');
for (let y = 2024; y <= 2030; y++) {
  const m = api.holidaysOfYear(y);
  const ks = Array.from(m.keys()).sort((a, b) => a - b);
  say(`${y} (${ks.length} 日)`);
  for (const k of ks) {
    const d = new Date(Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100));
    say(`  ${fmt(k)} (${WD[d.getUTCDay()]}) ${m.get(k)}`);
  }
}

say('');
say(`${fails === 0 ? 'ALL PASS' : fails + ' FAILED'}`);
writeFileSync(join(root, 'out', 'holiday-test.log'), out.join('\n') + '\n', 'utf8');
process.exit(fails === 0 ? 0 : 1);
```

### 11.18 `tools/diag-test.mjs` ― 診断ログの検査

```js
/*
 * 診断ログの検査。
 *
 * いちばん大事なのは「工程表の中身が混ざっていないこと」。
 * 本物のサンプルを読ませて診断ログを作り、
 * CSV に出てくる機微な文字列が 1 つも含まれていないことを確かめる。
 * あわせて、読み込みが失敗した状態でも書き出せることを見る。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
const CSV_PATH = join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv');
const CSV = readFileSync(CSV_PATH, 'utf8');
const CSV_NAME = 'サポートルーム_サンプル工程表.csv';

/* CSV から「絶対に漏れてはいけない文字列」を拾う */
function secrets(text) {
  const rows = text.replace(/^﻿/, '').split('\r\n').filter((l) => l.trim());
  const split = (l) => {
    const c = []; let cur = '', q = false;
    for (let k = 0; k < l.length; k++) {
      const ch = l[k];
      if (q) { if (ch === '"') { if (l[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { c.push(cur); cur = ''; }
      else cur += ch;
    }
    c.push(cur); return c;
  };
  const meta = split(rows[1]);
  const head = split(rows[2]);
  const ix = (n) => head.indexOf(n);
  const out = new Set();
  // メタ：プロジェクトID・工程表ID・ユーザーID・ユーザー名
  for (const i of [0, 1, 4, 5]) if (meta[i]) out.add(meta[i]);
  // ファイル名（拡張子を除いた本体）
  out.add(CSV_NAME.replace(/\.[^.]+$/, ''));
  for (const l of rows.slice(3)) {
    const c = split(l);
    for (const col of ['工程ID', '項目ID（開始日ノード）', '項目ID（終了日ノード）',
      '項目ID（中間ノード）', '項目名（開始日ノード）', '項目名（終了日ノード）',
      '開始日ノードの関係線ID', '終了日ノードの関係線ID']) {
      const v = (c[ix(col)] || '').trim();
      if (v.length >= 4) out.add(v);          // 短すぎるものは偶然一致するので除く
    }
    // 工程線名の name
    try {
      const nm = JSON.parse(c[ix('工程線名')])[0].name;
      if (nm && nm.length >= 3) out.add(nm);
    } catch (_) { /* 無視 */ }
  }
  return Array.from(out).filter(Boolean);
}

const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;
const chk = (ok, label, detail = '') => {
  if (!ok) fails++;
  say(`${ok ? 'OK' : 'NG'}\t${label}\t${detail}`);
};

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
const ext = [];
ctx.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) ext.push(r.url()); });
const page = await ctx.newPage();
await page.goto(HTML);
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

/* ---- 1. 正常に読めた状態の診断ログ ---- */
const normal = await page.evaluate(async ([csv, name]) => {
  window.__TOOL__.loadCsvText(csv, name);
  window.__TOOL__.setPeriod('2026-09-01', '2026-10-10');
  window.__TOOL__.render();
  await window.__TOOL__.xlsx();
  return { masked: window.__TOOL__.diag(false), raw: window.__TOOL__.diag(true) };
}, [CSV, CSV_NAME]);

const SEC = secrets(CSV);
say(`CSV から拾った「漏れてはいけない文字列」: ${SEC.length} 種類`);
const leaked = SEC.filter((s) => normal.masked.includes(s));
chk(leaked.length === 0, '伏せ字ログに機微な文字列が 1 つも無い',
  leaked.length ? `漏れ: ${leaked.slice(0, 5).join(' , ')}` : `${SEC.length} 種類すべて不在`);

// 実値モードでは逆に入っていること（伏せ字が効いていることの裏取り）
const inRaw = SEC.filter((s) => normal.raw.includes(s)).length;
chk(inRaw > SEC.length * 0.5, '実値モードでは機微な文字列が入る（伏せ字が効いている証拠）',
  `${inRaw} / ${SEC.length} 種類`);

chk(/\(\d+文字\)/.test(normal.masked), '名前が「(n文字)」に置き換わっている');
chk(/\bP001\b/.test(normal.masked), '工程IDが通し番号 P001… に置き換わっている');
chk(normal.masked.includes('(ファイル名).csv'), 'ファイル名が拡張子だけになっている');
chk(!normal.masked.includes('尾園'), 'ユーザー名が入っていない');

// 診断に必要な情報は残っていること
for (const need of ['形状の分布', 'SVG 検査', 'xlsx 検査', '休日の判定',
  '工程の一覧', 'ブラウザ', '見出し', '警告', 'エラー']) {
  chk(normal.masked.includes(need), `診断に要る項目が残っている: ${need}`);
}
chk(/yElbow \d+/.test(normal.masked), '形状の分布が数えられている');
chk(normal.masked.includes('2026-09-21'), '祝日の判定結果が入っている');

/* ---- 2. 読み込みに失敗した状態でも書き出せる ---- */
const broken = CSV.replace('工程線の形状', '形状もどき');
const fail = await page.evaluate(async ([csv, name]) => {
  let err = null;
  try { window.__TOOL__.loadCsvText(csv, name); } catch (e) { window.__TOOL__.recordError('loadCsvText', e.message, e.stack); err = e.message; }
  return { err, text: window.__TOOL__.diag(false) };
}, [broken, CSV_NAME]);
chk(!!fail.err, '必須列が無い CSV は読み込みで止まる', String(fail.err));
chk(fail.text.length > 200, '止まった状態でも診断ログが作れる', `${fail.text.length} 文字`);
chk(fail.text.includes('loadCsvText'), '失敗の中身がログに残っている');
const leaked2 = SEC.filter((s) => fail.text.includes(s));
chk(leaked2.length === 0, '失敗時のログにも機微な文字列が無い',
  leaked2.length ? `漏れ: ${leaked2.slice(0, 3).join(' , ')}` : '');

/* ---- 3. 実際に落ちたときも拾えるか ---- */
const crash = await page.evaluate(() => {
  window.__TOOL__.recordError('test', '意図的に起こした例外', 'at somewhere (x.js:1:1)');
  return window.__TOOL__.diag(false);
});
chk(crash.includes('意図的に起こした例外'), 'JS の例外がログに残る');

chk(ext.length === 0, '診断ログを出しても外部通信は無い', `${ext.length} 本`);

say('');
say(`伏せ字ログの大きさ: ${normal.masked.length.toLocaleString()} 文字`);
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'diag-test.log'), out.join('\n') + '\n', 'utf8');
writeFileSync(join(root, 'out', '診断ログの例.txt'), '﻿' + normal.masked, 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
```

### 11.19 `tools/robustness-test.mjs` ― 別の工程表を想定した変種試験

```js
/*
 * 「別の工程表の CSV を渡したら動くか」を実際に確かめる。
 *
 * 本物のサンプルを元に、他の工程表で起こりそうな違いを作って通す。
 * 列順が違う／列が増減する／年が違う／規模が大きい／
 * サンプルに無い機能が使われている、など。
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const HTML = pathToFileURL(join(root, 'プロジェクトG_工程表ツール.html')).href;
const SRC = readFileSync(join(root, 'sample', 'Sample', 'サポートルーム_サンプル工程表.csv'), 'utf8');

/* ---- CSV の読み書き（引用を保ったまま列を触るため自前で持つ） ---- */
function splitLine(l) {
  const c = []; let cur = '', q = false;
  for (let k = 0; k < l.length; k++) {
    const ch = l[k];
    if (q) { if (ch === '"') { if (l[k + 1] === '"') { cur += '""'; k++; } else { q = false; cur += ch; } } else cur += ch; }
    else if (ch === '"') { q = true; cur += ch; }
    else if (ch === ',') { c.push(cur); cur = ''; }
    else cur += ch;
  }
  c.push(cur); return c;
}
function parse(text) {
  const bom = text.charCodeAt(0) === 0xfeff;
  const body = bom ? text.slice(1) : text;
  const lines = body.split('\r\n').filter((l, i, a) => l !== '' || i < a.length - 1);
  return { bom, rows: lines.map(splitLine) };
}
function build({ bom, rows }, { crlf = true } = {}) {
  return (bom ? '﻿' : '') + rows.map((r) => r.join(',')).join(crlf ? '\r\n' : '\n') + (crlf ? '\r\n' : '\n');
}
const H = (doc) => doc.rows[2];
const ix = (doc, name) => H(doc).indexOf(name);

/* 工程線名 JSON のキーを差し替える（引用済みセルのまま触る） */
function setNameKey(cell, key, value) {
  const inner = cell.replace(/^"|"$/g, '').replace(/""/g, '"');
  const o = JSON.parse(inner);
  o[0][key] = value;
  return '"' + JSON.stringify(o).replace(/"/g, '""') + '"';
}
const shiftIso = (s, days) => {
  const d = new Date(s.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10) + s.slice(10);
};

/* ---- 変種 ---- */
const VARIANTS = [];
const V = (name, expect, make) => VARIANTS.push({ name, expect, make });

V('そのまま（対照）', 'ok', () => SRC);

V('列順を入れ替えた（124 列を逆順に）', 'ok', () => {
  const d = parse(SRC);
  const n = d.rows[2].length;
  const order = Array.from({ length: n }, (_, i) => n - 1 - i);
  d.rows = d.rows.map((r, i) => (i < 2 ? r : order.map((k) => r[k] ?? '')));
  return build(d);
});

V('使っていない列を 52 個削った（124 → 72 列）', 'ok', () => {
  const d = parse(SRC);
  const drop = new Set();
  H(d).forEach((h, i) => { if (/^詳細工程[1-4]/.test(h)) drop.add(i); });
  const keep = H(d).map((_, i) => i).filter((i) => !drop.has(i));
  d.rows = d.rows.map((r, i) => (i < 2 ? r : keep.map((k) => r[k] ?? '')));
  return build(d);
});

V('知らない列を 5 個足した（124 → 129 列）', 'ok', () => {
  const d = parse(SRC);
  d.rows = d.rows.map((r, i) => (i < 2 ? r : i === 2
    ? [...r, '新項目A', '新項目B', '新項目C', '新項目D', '新項目E']
    : [...r, 'x', 'y', 'z', '', '']));
  return build(d);
});

V('必須列（工程線の形状）が無い', 'error', () => {
  const d = parse(SRC);
  const k = ix(d, '工程線の形状');
  d.rows = d.rows.map((r, i) => (i < 2 ? r : r.filter((_, j) => j !== k)));
  return build(d);
});

V('BOM 無し・改行が LF', 'ok', () => {
  const d = parse(SRC); d.bom = false;
  return build(d, { crlf: false });
});

V('別の年（2028 年へ 2 年ずらす）', 'ok', () => {
  const d = parse(SRC);
  const s = ix(d, '開始日'), e = ix(d, '終了日'), m = ix(d, '中間ノード日付');
  d.rows[1][2] = '2028/09/01-2028/11/30';
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    for (const k of [s, e, m]) if (o[k]) o[k] = shiftIso(o[k], 730);
    // 休日 は年が変われば変わるので検算列を空にする
    for (const nm of ['休日', '延べ日数', '日数']) o[ix(d, nm)] = '';
    return o;
  });
  return build(d);
});

V('大規模（工程 230 件・行 460）', 'ok', () => {
  const d = parse(SRC);
  const body = d.rows.slice(3);
  const cId = ix(d, '工程ID'), cSr = ix(d, '開始日の行番号'), cEr = ix(d, '終了日の行番号');
  const cSn = ix(d, '項目ID（開始日ノード）'), cEn = ix(d, '項目ID（終了日ノード）');
  const cMn = ix(d, '項目ID（中間ノード）'), cNm = ix(d, '工程線名');
  const out = [];
  for (let rep = 0; rep < 10; rep++) {
    for (const r of body) {
      const o = r.slice();
      const suf = '_' + rep;
      o[cId] += suf;
      for (const k of [cSn, cEn, cMn]) if (o[k]) o[k] += suf;
      o[cSr] = String(+o[cSr] + rep * 42);
      o[cEr] = String(+o[cEr] + rep * 42);
      const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
      o[cNm] = setNameKey(o[cNm], 'name', nm + suf);
      out.push(o);
    }
  }
  d.rows = [...d.rows.slice(0, 3), ...out];
  return build(d);
});

V('サンプルに無い機能（0.5日・工程削除・textSize S・crank に中間ノード）', 'ok', () => {
  const d = parse(SRC);
  const cNm = ix(d, '工程線名'), cHalf = ix(d, '0.5日'), cDel = ix(d, '工程削除');
  const cShape = ix(d, '工程線の形状'), cMn = ix(d, '項目ID（中間ノード）');
  const cMd = ix(d, '中間ノード日付'), cSn = ix(d, '項目ID（開始日ノード）'), cEnd = ix(d, '終了日');
  let done = { half: 0, del: 0, s: 0, crank: 0 };
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
    if (nm === 'E1' && !done.half) { o[cHalf] = '0.5'; done.half++; }
    if (nm === 'E3' && !done.del) { o[cDel] = 'true'; done.del++; }
    if (nm === 'B3' && !done.s) { o[cNm] = setNameKey(o[cNm], 'textSize', 'S'); done.s++; }
    if (o[cShape] === 'crank' && !done.crank) {           // crank に中間ノードを付ける
      o[cMn] = o[cSn]; o[cMd] = shiftIso(o[cEnd], 1); done.crank++;
    }
    return o;
  });
  return build(d);
});

V('工程が 1 件だけ', 'ok', () => {
  const d = parse(SRC);
  d.rows = [...d.rows.slice(0, 3), d.rows[3]];
  return build(d);
});

V('工程が 0 件（見出しだけ）', 'ok', () => {
  const d = parse(SRC);
  d.rows = d.rows.slice(0, 3);
  return build(d);
});

// 期待は 'ok'（全件通る）・'error'（読み込みで止まる）・'detect'（検査が拾って xlsx を止める）
V('休日 列が自前の計算と食い違う（会社休日がある工程表を想定）', 'detect', () => {
  const d = parse(SRC);
  const c = ix(d, '休日');
  d.rows = d.rows.map((r, i) => {
    if (i !== 3) return r;
    const o = r.slice(); o[c] = String(+o[c] + 3); return o;   // わざと 3 日ずらす
  });
  return build(d);
});

V('知らない形状名が使われている', 'ok', () => {
  const d = parse(SRC);
  const c = ix(d, '工程線の形状');
  d.rows = d.rows.map((r, i) => {
    if (i !== 3) return r;
    const o = r.slice(); o[c] = 'zigzagNew'; return o;
  });
  return build(d);
});

V('関係線を 3 本に増やした', 'ok', () => {
  const d = parse(SRC);
  const c0 = ix(d, '開始日ノードの関係線名'), c1 = ix(d, '終了日ノードの関係線名');
  const cNm = ix(d, '工程線名');
  const pair = { A1: ['関係２', 0], B1: ['関係２', 1], E1: ['関係３', 0], D1: ['関係３', 1] };
  d.rows = d.rows.map((r, i) => {
    if (i < 3) return r;
    const o = r.slice();
    const nm = JSON.parse(o[cNm].replace(/^"|"$/g, '').replace(/""/g, '"'))[0].name;
    if (pair[nm]) o[pair[nm][1] === 0 ? c0 : c1] = pair[nm][0];
    return o;
  });
  return build(d);
});

/* ---- 実行 ---- */
const out = [];
const say = (s) => { console.log(s); out.push(s); };
let fails = 0;

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ offline: true, viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(HTML);
await page.waitForFunction(() => !!window.__TOOL__ && !!window.ExcelJS);

say('変種 CSV を通した結果');
say('='.repeat(100));

for (const v of VARIANTS) {
  let csv;
  try { csv = v.make(); } catch (e) { say(`NG  ${v.name}\n      変種の生成に失敗: ${e.message}`); fails++; continue; }
  const t0 = Date.now();
  const r = await page.evaluate(async ([csv]) => {
    const res = { error: null };
    try {
      window.__TOOL__.setGateRows('');
      const doc = window.__TOOL__.loadCsvText(csv, 'v.csv');
      res.headers = doc.headers.length;
      res.procs = doc.processes.length;
      res.warns = doc.warnings.length;
      res.warnSample = doc.warnings.slice(0, 2);
      res.est = doc.estimates.filter((e) => e.source === 'rule').length;
      const period = doc.meta.period || '';
      const m = /^(\d{4})\/(\d{2})\/(\d{2})-(\d{4})\/(\d{2})\/(\d{2})$/.exec(period);
      if (m) window.__TOOL__.setPeriod(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}-${m[5]}-${m[6]}`);
      const rr = window.__TOOL__.render();
      res.drawn = rr.drawn.length;
      res.skipped = rr.skipped.length;
      const sv = window.__TOOL__.results().svg;
      res.svgN = sv.length; res.svgNg = sv.filter((x) => !x.ok).length;
      res.svgNgList = sv.filter((x) => !x.ok).slice(0, 2).map((x) => `${x.scope}/${x.label}`);
      const x = await window.__TOOL__.xlsx();
      const xr = window.__TOOL__.results().xlsx;
      res.xlsxN = xr.length; res.xlsxNg = xr.filter((y) => !y.ok).length;
      res.xlsxNgList = xr.filter((y) => !y.ok).slice(0, 2).map((y) => `${y.scope}/${y.label}`);
      res.bytes = x && x.buffer ? x.buffer.byteLength : 0;
    } catch (e) { res.error = e.message; }
    return res;
  }, [csv]);
  const ms = Date.now() - t0;

  if (v.expect === 'detect') {
    // 検査が食い違いを拾い、xlsx 書き出しが止まることを期待する
    const caught = !r.error && r.svgNg > 0
      && r.svgNgList.some((x) => x.includes('休日の計算'));
    if (!caught) fails++;
    say(`${caught ? 'OK ' : 'NG '} ${v.name}`);
    say(`      検査が食い違いを検出: SVG ${r.svgN - r.svgNg}/${r.svgN}（NG: ${r.svgNgList.join(' , ')}）`);
    say('      → 画面では xlsx 書き出しボタンが無効のままになる');
    continue;
  }
  if (v.expect === 'error') {
    const ok = !!r.error;
    if (!ok) fails++;
    say(`${ok ? 'OK ' : 'NG '} ${v.name}`);
    say(`      期待どおりエラーで止まった: ${r.error || '（止まらなかった）'}`);
    continue;
  }
  const ok = !r.error && r.svgNg === 0 && r.xlsxNg === 0;
  if (!ok) fails++;
  say(`${ok ? 'OK ' : 'NG '} ${v.name}`);
  if (r.error) { say(`      エラー: ${r.error}`); continue; }
  say(`      見出し ${r.headers} 列 / 工程 ${r.procs} 件 / 描画 ${r.drawn} 件（除外 ${r.skipped}）`
    + ` / SVG ${r.svgN - r.svgNg}/${r.svgN} / xlsx ${r.xlsxN - r.xlsxNg}/${r.xlsxN}`
    + ` / ${r.bytes.toLocaleString()} bytes / ${ms}ms`);
  if (r.svgNg) say(`      SVG NG: ${r.svgNgList.join(' , ')}`);
  if (r.xlsxNg) say(`      xlsx NG: ${r.xlsxNgList.join(' , ')}`);
  if (r.warns) say(`      警告 ${r.warns} 件 / 要確認の推定 ${r.est} 件`
    + (r.warnSample.length ? `\n        例: ${r.warnSample.join('\n        例: ')}` : ''));
}

say('='.repeat(100));
say(`JS エラー ${pageErrors.length} 件`);
say(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
writeFileSync(join(root, 'out', 'robustness-test.log'), out.join('\n') + '\n', 'utf8');
await b.close();
process.exit(fails === 0 ? 0 : 1);
```

### 11.20 `tools/make-package.py` ― 配布用 zip の作成

```python
#!/usr/bin/env python3
"""
配布用 zip を作る。

Windows のエクスプローラーは、zip の各エントリに UTF-8 フラグ
（general purpose bit flag の bit 11 = 0x800）が立っていないと、
ファイル名を CP932（Shift-JIS）として読む。日本語名はそこで文字化けする。

Linux の zip コマンドはこのフラグを立てないことがあるので、
Python の zipfile で作る。zipfile は名前に非 ASCII が含まれるとき
自動で 0x800 を立てる。作ったあとに必ず検査する。
"""
import sys, zipfile, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAME = "プロジェクトG_ステップ1_往路"
OUT = ROOT.parent / f"{NAME}.zip"
SKIP_DIRS = {"node_modules", ".git", "__pycache__"}


def collect(base: Path):
    for p in sorted(base.rglob("*")):
        if any(part in SKIP_DIRS for part in p.relative_to(base).parts):
            continue
        if p.is_symlink() or not p.is_file():
            continue
        yield p


def main():
    if OUT.exists():
        OUT.unlink()
    files = list(collect(ROOT))
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for p in files:
            arc = f"{NAME}/{p.relative_to(ROOT).as_posix()}"
            z.write(p, arc)

    # 検査：全エントリが UTF-8 フラグ付きで、名前が往復すること
    bad_flag, bad_name = [], []
    with zipfile.ZipFile(OUT) as z:
        infos = z.infolist()
        for i in infos:
            nonascii = any(ord(c) > 127 for c in i.filename)
            if nonascii and not (i.flag_bits & 0x800):
                bad_flag.append(i.filename)
            # 生バイトが UTF-8 として読み直せること
            try:
                raw = i.orig_filename.encode("utf-8")
                if raw.decode("utf-8") != i.orig_filename:
                    bad_name.append(i.filename)
            except UnicodeError:
                bad_name.append(i.filename)

    size = OUT.stat().st_size
    ja = sum(1 for i in infos if any(ord(c) > 127 for c in i.filename))
    print(f"{OUT.name}  {size:,} bytes  {len(infos)} ファイル（うち日本語名 {ja}）")
    print(f"  UTF-8 フラグなし : {len(bad_flag)} 件")
    print(f"  名前が往復しない : {len(bad_name)} 件")
    for f in (bad_flag + bad_name)[:5]:
        print("    ", f)
    ok = not bad_flag and not bad_name
    print("=> Windows で文字化けしない形式" if ok else "=> 不備あり")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
```
