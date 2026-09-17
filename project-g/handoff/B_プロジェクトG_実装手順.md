# プロジェクトG 変換ツール ― 実装手順

`A_プロジェクトG_コード一式.md` を受け取った側が、この順に進める。

**この手順の目的は 2 つある。**

1. `プロジェクトG変換ツール.xlsm` を生成すること。
2. **Excel 実機で開けるかを確かめ、駄目だった場合に原因を切り分けて返すこと。**

2 が本題。生成側の環境には Excel も表計算ソフトも無く、
vbaProject.bin（VBA プロジェクトのバイナリ）は MS-OVBA 仕様に沿って
自前で組み立てたものを、別実装（oletools）で読み戻す所までしか確認できていない。
**Excel 本体で開くのは今回が初めて**になる。
動かなかったときは 7 章のテンプレートを埋めて返してほしい。

---

## 0. 前提環境

| 項目 | 要件 |
|---|---|
| Python | 3.9 以上 |
| Python パッケージ | `openpyxl`（必須）、`olefile` と `oletools`（検査に使う。無くても生成はできる） |
| Excel | Windows 版 Excel 2016 以降（Microsoft 365 想定）。**確認は実機で行う** |
| 文字コード | ソースは UTF-8 / LF。VBA はコードページ 932（Shift-JIS）で埋め込まれる |

```bash
pip install openpyxl olefile oletools
```

---

## 1. ファイルを書き出す

`A_プロジェクトG_コード一式.md` の各節を、指定パスへそのまま書き出す。

```
<プロジェクトルート>/
├── src/
│   ├── Util.bas
│   ├── CsvReader.bas
│   ├── Model.bas
│   ├── Layout.bas
│   ├── Render.bas
│   ├── Export.bas
│   ├── Verify.bas
│   └── Main.bas
└── build/
    ├── msovba.py
    ├── build_vba.py
    ├── build_xlsm.py
    └── verify_xlsm.py
```

書き出したら **必ず** SHA-256 を照合する（値は A の一覧にある）。

```bash
sha256sum src/*.bas build/*.py
```

> ここで 1 つでも食い違ったら先に進まない。
> 原因はほぼ「改行が CRLF になった」「BOM が付いた」「末尾の改行が増減した」のどれか。
> 差分が出たファイル名と、`file` / `head -c 32 | xxd` の結果を控えておく。

---

## 2. xlsm を生成する

```bash
python3 build/build_xlsm.py src dist
```

期待する出力:

```
wrote <...>/dist/プロジェクトG変換ツール.xlsm (約 42000 bytes)
modules: ThisWorkbook, Sheet1, Sheet2, Sheet3, Sheet4, CsvReader, Export, Layout, Main, Model, Render, Util, Verify
```

モジュールは **13 本**（標準 8 + 文書 5）。ここで例外が出たら、
その traceback を全文控えて 7 章へ。

---

## 3. 構造検査（Excel 無しで確認できる範囲）

```bash
python3 build/verify_xlsm.py dist/プロジェクトG変換ツール.xlsm src
```

**全項目が OK になるはず。**参考までに、生成側で同じ検査を通したときの出力を 8 章に載せてある。
ここで NG が出たら、Excel を開く前にその出力を返してほしい（Excel のせいではない）。

---

## 4. Excel で開く

xlsm をブラウザ経由やメール経由で受け取った場合、Windows が
**Mark of the Web** を付けるため、そのまま開くと保護ビューになり**マクロが動かない**。

1. xlsm（または同梱の ZIP）を右クリック → **プロパティ**
2. 全般タブ下部の「セキュリティ:」で **「許可する」にチェック → OK**
   （ZIP の場合は、解除してから展開する。展開後のファイルには MOTW が付かない）
3. xlsm を開く
4. 「**コンテンツの有効化**」を押す

### ここで見るべきこと

| 見るもの | 期待 |
|---|---|
| ファイルが開くか | 「一部の内容に問題が見つかりました」等の修復ダイアログが**出ない** |
| シート | `00_Control` / `T09_Audit` / `T10_Layout` / `使い方` の 4 枚 |
| `00_Control` の B14 | `A-1.0.0` |
| Alt+F11（VBE） | `VBAProject (プロジェクトG変換ツール.xlsm)` の下に標準モジュール 8 本と ThisWorkbook / Sheet1〜4 |
| VBE の 参照設定 | Visual Basic For Applications / Microsoft Excel xx.x Object Library / OLE Automation / Microsoft Office xx.x Object Library の 4 つに **チェックが入っていて「参照不可」が付いていない** |
| VBE で Alt+F8 → デバッグ → VBAProject のコンパイル | **エラーが出ない** |
| `00_Control` のボタン | 「CSV 選択」「変換実行」の 2 つが出ている（`Auto_Open` が作る） |

> ボタンが出ないだけなら致命ではない。Alt+F8 → `SelectCsv` / `RunConversion` で同じ操作ができる。

---

## 5. 動かしてみる

1. `00_Control` の「CSV 選択」で工程表 CSV を選ぶ
2. Start / End を確認（既定は CSV の「工程表の期間」の先頭から 40 日）
3. 「変換実行」
4. CSV と同じフォルダーに次の 2 つができる
   - `<CSV名>_<開始>-<終了>.xlsx` … 業者用（マクロなし）
   - `変換ログ.txt` … 読み込み件数・除外件数・機械検査の結果
5. **`変換ログ.txt` の末尾が「合格」であること**を確認する

「不合格」なら、NG 行に理由が出ている。xlsx は消さずに残してある。

---

## 6. 生成側で怪しいと見ている箇所（優先度順）

Excel で開けなかった場合、この順に疑ってほしい。理由も書いておく。

### ① vbaProject.bin の `dir` ストリーム内の REFERENCE レコード

`build_vba.py` の `REFERENCES` に、stdole / Office / Excel / VBA の 4 つの
型ライブラリへの参照を `REFERENCENAME` + `REFERENCEREGISTERED` として書き込んでいる。
**Libid 文字列の中のパスとバージョンは、生成側の環境から確かめようがないので推定値**。

- Excel は GUID で解決するのでパスが違っても通るはず、という前提で書いている
- この前提が外れていると「参照不可」やコンパイルエラーになる
- 症状: VBE の参照設定に「参照不可: ...」が出る / `xlEdgeBottom` 等の定数で
  「変数が定義されていません」になる
- 確認方法: VBE → ツール → 参照設定 のスクリーンショット

### ② 文書モジュール（ThisWorkbook / Sheet1〜4）と codeName の対応

xlsm 側は `xl/workbook.xml` の `workbookPr codeName="ThisWorkbook"` と
各シートの `sheetPr codeName="SheetN"` で、VBA 側は `PROJECT` ストリームの
`Document=ThisWorkbook/&H00000000` で結び付けている。
**この対応が Excel の期待とずれていると、開いた瞬間に修復ダイアログが出る可能性がある。**

- 症状: 「一部の内容に問題が見つかりました」→ 修復して開くと VBA が消えている
- 確認方法: 修復ダイアログの **「ログを表示」の全文**（これが一番効く）

### ③ `PROJECT` ストリームの CMG / DPB / GC

MS-OVBA 2.4.3 のデータ暗号化を実装して、保護なし・パスワードなし・可視 を
暗号化した値を書いている。復号が自前実装でしか検証できていない。

- 症状: 「予期しないエラー」/ プロジェクトを開こうとするとパスワードを聞かれる
- 確認方法: VBE で VBAProject を右クリック → プロパティ が開けるか

### ④ コードページ 932 と、日本語環境でない Excel

VBA ソースは cp932 で埋め込み、`dir` の `PROJECTCODEPAGE` も 932 にしている。
日本語 Windows なら素直に読めるはずだが、英語版 Excel で開いた場合に
コメントが文字化けする可能性がある（**動作には影響しないはず**）。

- 症状: コメントだけが化ける。コードは動く
- 確認方法: 日本語環境かどうかを報告に書く

### ⑤ Mark of the Web / マクロのブロック

一番ありふれた原因。**これを外す前の結果は「動かなかった」に数えない**こと。
4 章の手順を踏んだかどうかを必ず報告に書いてほしい。

---

## 7. 報告テンプレート（動かなかった場合はこれを埋めて返す）

```markdown
## 環境
- OS / ビルド:
- Excel のバージョンとビット数:   （Excel → ファイル → アカウント → Excel のバージョン情報）
- Windows の表示言語 / システムロケール:
- Python のバージョン:
- openpyxl / olefile / oletools のバージョン:

## 手順 1（ファイル書き出し）
- sha256 の照合結果: 全一致 / 不一致（不一致なら該当ファイル名と実際の値）

## 手順 2（ビルド）
- build_xlsm.py は成功したか:
- 標準出力の全文:
- 失敗した場合、traceback の全文:

## 手順 3（構造検査）
- verify_xlsm.py の出力**全文**:

## 手順 4（Excel で開く）
- Mark of the Web を解除したか:  はい / いいえ
- 「コンテンツの有効化」を押したか:  はい / いいえ
- 開いたときのダイアログ:  出ない / 「一部の内容に問題が見つかりました」/ その他
  - 修復ダイアログが出た場合、**「ログを表示」の全文**をここに貼る（最重要）
- シートは 4 枚あるか:
- Alt+F11 で見えるモジュール一覧:
- VBE → ツール → 参照設定 の状態（「参照不可」の有無）:
- VBAProject のコンパイル結果（デバッグ → VBAProject のコンパイル）:
  - エラーが出た場合: メッセージ全文と、止まった行

## 手順 5（実行）
- 「CSV 選択」「変換実行」ボタンは出たか:
- 変換は走ったか / 途中で止まったか:
- VBA のエラーが出た場合: エラー番号・メッセージ・「デバッグ」で反転した行
- 生成された 変換ログ.txt の全文:

## そのほか気づいたこと
```

### 報告のときのお願い

- **エラーメッセージは要約せず全文**で。番号（例: 実行時エラー '9'）が効く。
- 修復ダイアログが出た場合の**修復ログが一番情報量が多い**。省略しないでほしい。
- 直せそうでも**勝手に直さない**。何がどう壊れていたかを先に返してほしい。
  どこを直したかが分からなくなると、生成側の原因究明ができなくなる。
- 全部うまくいった場合も、その旨と 手順 5 の変換ログを返してくれると助かる。

---

## 8. 参考: 生成側で `verify_xlsm.py` を通したときの出力

Excel の無い環境で取ったもの。手順 3 の結果と見比べる用。

```
環境: python 3.11.15 / linux
======================================================================
1. OPC パッケージ
======================================================================
     dist/プロジェクトG変換ツール.xlsm  42109 bytes  sha256=f8df0d70de99b9c3
OK   zip 整合性: OK
OK   パートの存在: [Content_Types].xml
OK   パートの存在: _rels/.rels
OK   パートの存在: xl/workbook.xml
OK   パートの存在: xl/_rels/workbook.xml.rels
OK   パートの存在: xl/vbaProject.bin
OK   ブックのコンテンツ型が macroEnabled であること
OK   vbaProject の既定コンテンツ型が宣言されていること
OK   workbook -> vbaProject のリレーションがあること
OK   workbookPr codeName = ThisWorkbook
OK   各シートの codeName = Sheet1, Sheet2, Sheet3, Sheet4

======================================================================
2. VBA プロジェクト (vbaProject.bin)
======================================================================
     vbaProject.bin  43520 bytes  sha256=0f8f633139c8eb98
OK   CFB シグネチャ
OK   CFB ヘッダー: major=3 byteorder=0xFFFE sectorShift=9 miniSectorShift=6 (期待 3 / 0xFFFE / 9 / 6)
OK   MiniStreamCutoff = 4096 (期待 4096)
OK   ストリーム: PROJECT
OK   ストリーム: PROJECTwm
OK   ストリーム: VBA/dir
OK   ストリーム: VBA/_VBA_PROJECT
OK   PROJECT に ID= がある
OK   PROJECT に Name= がある
OK   PROJECT に CMG= がある
OK   PROJECT に DPB= がある
OK   PROJECT に GC= がある
     PROJECT が宣言するモジュール (13): ThisWorkbook, Sheet1, Sheet2, Sheet3, Sheet4, CsvReader, Export, Layout, Main, Model, Render, Util, Verify
OK   dir ストリームを展開できた (2335 bytes)
     コードページ = 932
     olevba が復元したモジュール (13): CsvReader, Export, Layout, Main, Model, Render, Sheet1, Sheet2, Sheet3, Sheet4, ThisWorkbook, Util, Verify
OK   埋め込んだ 8 モジュールが .bas と完全一致 

======================================================================
3. VBA ソース
======================================================================
OK   src の .bas が 8 本 (実際 8 本)
     CsvReader.bas   255 行  sha256=74ed91bc1115ff13  cp932 OK
     Export.bas     183 行  sha256=7b91889ecb8b4abc  cp932 OK
     Layout.bas     292 行  sha256=62b9cf7d4721a536  cp932 OK
     Main.bas       263 行  sha256=5c8f83526e304852  cp932 OK
     Model.bas      250 行  sha256=91d96f85c4b5e8d1  cp932 OK
     Render.bas     315 行  sha256=ecf5a5c14272c16c  cp932 OK
     Util.bas       493 行  sha256=6fa2e838d4999e50  cp932 OK
     Verify.bas     484 行  sha256=c7219a41e7208ac3  cp932 OK

======================================================================
結果: 構造検査はすべて OK
（ここまでは Excel 無しで確認できる範囲。実機で開けるかは別途確認が要る）
```

