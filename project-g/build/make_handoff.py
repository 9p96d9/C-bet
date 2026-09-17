# -*- coding: utf-8 -*-
"""引き渡し用の 2 つの md を生成する。

  A_プロジェクトG_コード一式.md … 全ソースを内包。受け取った LLM はこれを書き出す
  B_プロジェクトG_実装手順.md   … 書き出しから Excel での確認、失敗時の報告まで
"""
import os, sys, glob, hashlib, shutil, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "handoff", "プロジェクトG_引き渡し")
F = "`" * 3

FILES = [
    ("src/Util.bas", "vb", "文字列 / UTF-8 / 見出し名マップ / JSON / 色 / ログ"),
    ("src/CsvReader.bas", "vb", "RFC 4180 パーサ、メタ行の期間、ISO 日時の日付部"),
    ("src/Model.bas", "vb", "工程レコードの型と CSV からの正規化"),
    ("src/Layout.bas", "vb", "表示期間 → 日付列、行 → シート行、行見出し、行の割り当て"),
    ("src/Render.bas", "vb", "T10_Layout にセルだけで描く（Shape 不使用）"),
    ("src/Export.bas", "vb", "業者用 xlsx として別名保存、保護・入力規則・非表示シート"),
    ("src/Verify.bas", "vb", "出力 xlsx を読み戻して機械検査"),
    ("src/Main.bas", "vb", "00_Control の操作と変換の全体進行"),
    ("build/msovba.py", "python", "MS-OVBA の圧縮・データ暗号化・CFB の書き出し"),
    ("build/build_vba.py", "python", "dir / PROJECT / PROJECTwm を組んで vbaProject.bin を作る"),
    ("build/build_xlsm.py", "python", "openpyxl でブックを作り zip に vbaProject.bin を注入"),
    ("build/verify_xlsm.py", "python", "生成物の構造検査（Excel 無しで回せる範囲）"),
]

def sha(path):
    return hashlib.sha256(open(os.path.join(ROOT, path), "rb").read()).hexdigest()

def body(path):
    return open(os.path.join(ROOT, path), encoding="utf-8").read().rstrip("\n")

def lines(path):
    return body(path).count("\n") + 1


HEAD_A = """# プロジェクトG 変換ツール ― コード一式

この 1 ファイルに、`プロジェクトG変換ツール.xlsm` を生成するのに必要なものが全部入っている。
手順は別紙 `B_プロジェクトG_実装手順.md` を見ること。

## 読む人（LLM）への指示

1. 下の各節を **1 文字も変えずに** 指定されたパスへ書き出す。
   整形・改行幅の調整・コメントの翻訳・「改善」は**一切しない**。
   バイト単位で一致していないと、後段のハッシュ照合と VBA の埋め込みが壊れる。
2. 書き出しは **UTF-8（BOM なし）・改行 LF** で固定。
   Windows で作業する場合もエディタの自動 CRLF 変換を切ること。
3. 書き出し後、必ず下の一覧の SHA-256 と突き合わせる。1 つでも違えば次に進まない。

{F}bash
# 照合コマンド（プロジェクトのルートで実行）
sha256sum src/*.bas build/*.py
{F}

## ファイル一覧

| # | パス | 行数 | SHA-256 | 役割 |
|---|---|---:|---|---|
{TABLE}

合計 {TOTAL_FILES} ファイル / {TOTAL_LINES} 行。

変換の入力となる CSV は、このフォルダの `sample/` に入っている。
CSV が無くても xlsm のビルド自体はできるが、手順 5（実際に変換してみる）には要る。

---
"""

HEAD_B = """# プロジェクトG 変換ツール ― 実装手順

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

{F}bash
pip install openpyxl olefile oletools
{F}

---

## 1. ファイルを書き出す

`A_プロジェクトG_コード一式.md` の各節を、指定パスへそのまま書き出す。

{F}
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
{F}

書き出したら **必ず** SHA-256 を照合する（値は A の一覧にある）。

{F}bash
sha256sum src/*.bas build/*.py
{F}

> ここで 1 つでも食い違ったら先に進まない。
> 原因はほぼ「改行が CRLF になった」「BOM が付いた」「末尾の改行が増減した」のどれか。
> 差分が出たファイル名と、`file` / `head -c 32 | xxd` の結果を控えておく。

---

## 2. xlsm を生成する

{F}bash
python3 build/build_xlsm.py src dist
{F}

期待する出力:

{F}
wrote <...>/dist/プロジェクトG変換ツール.xlsm (約 42000 bytes)
modules: ThisWorkbook, Sheet1, Sheet2, Sheet3, Sheet4, CsvReader, Export, Layout, Main, Model, Render, Util, Verify
{F}

モジュールは **13 本**（標準 8 + 文書 5）。ここで例外が出たら、
その traceback を全文控えて 7 章へ。

---

## 3. 構造検査（Excel 無しで確認できる範囲）

{F}bash
python3 build/verify_xlsm.py dist/プロジェクトG変換ツール.xlsm src
{F}

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

{F}markdown
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
{F}

### 報告のときのお願い

- **エラーメッセージは要約せず全文**で。番号（例: 実行時エラー '9'）が効く。
- 修復ダイアログが出た場合の**修復ログが一番情報量が多い**。省略しないでほしい。
- 直せそうでも**勝手に直さない**。何がどう壊れていたかを先に返してほしい。
  どこを直したかが分からなくなると、生成側の原因究明ができなくなる。
- 全部うまくいった場合も、その旨と 手順 5 の変換ログを返してくれると助かる。

---

## 8. 参考: 生成側で `verify_xlsm.py` を通したときの出力

Excel の無い環境で取ったもの。手順 3 の結果と見比べる用。

{F}
{VERIFY}
{F}
"""


README = """# プロジェクトG 変換ツール ― 引き渡し一式

別環境の LLM / 担当者へ渡す一式。**まず `B_プロジェクトG_実装手順.md` を読むこと。**

## 中身

| パス | 何か | いつ使う |
|---|---|---|
| `B_プロジェクトG_実装手順.md` | **最初に読む。** 書き出し → ビルド → 検査 → Excel 確認 → 報告まで | 通し |
| `A_プロジェクトG_コード一式.md` | ソース 12 ファイルを SHA-256 付きで内包 | 手順 1 |
| `sample/` | 変換の入力に使う工程表 CSV | 手順 5 |
| `reference/プロジェクトG変換ツール.xlsm` | **生成側で作った現物。**突き合わせ用 | 手順 2・4 |
| `reference/変換ログ.txt` | 生成側で手順 5 を回したときのログ（末尾が「合格」） | 手順 5 |

## 一番知りたいこと

**この xlsm が Windows の Excel 実機で開き、マクロが動くか。**

生成側の環境には Excel も表計算ソフトも無く、VBA プロジェクトのバイナリ
(`vbaProject.bin`) は MS-OVBA 仕様に沿って自前で組み立てたものを、
別実装で読み戻す所までしか確認できていない。Excel で開くのは今回が初めてになる。

## 急ぐ場合の最短ルート

ビルドを飛ばして `reference/プロジェクトG変換ツール.xlsm` を
Excel で開くだけでも、上の問いには答えられる。
その場合も **手順 4（Mark of the Web の解除）は必ず踏むこと**。
これを飛ばした「動かなかった」は原因の切り分けにならない。

ビルドまでやる場合は、出来た xlsm の `xl/vbaProject.bin` が
`reference/` のものとバイト一致するかも見てほしい。ずれていれば書き写しの事故。

## 返してほしいもの

`B_プロジェクトG_実装手順.md` の 7 章にテンプレートがある。それを埋めて返す。
うまくいった場合も、その旨と変換ログを返してくれると助かる。
"""


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(os.path.join(OUT, "sample"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "reference"), exist_ok=True)
    open(os.path.join(OUT, "README.md"), "w", encoding="utf-8").write(README)
    shutil.copy(os.path.join(ROOT, "sample", "Sample",
                             "サポートルーム_サンプル工程表.csv"),
                os.path.join(OUT, "sample"))
    for n in ("プロジェクトG変換ツール.xlsm", "変換ログ.txt"):
        shutil.copy(os.path.join(ROOT, "dist", n), os.path.join(OUT, "reference"))

    rows = []
    for i, (path, _lang, role) in enumerate(FILES, 1):
        rows.append("| %d | `%s` | %d | `%s` | %s |" % (i, path, lines(path), sha(path), role))
    head = (HEAD_A.replace("{F}", F)
            .replace("{TABLE}", "\n".join(rows))
            .replace("{TOTAL_FILES}", str(len(FILES)))
            .replace("{TOTAL_LINES}", str(sum(lines(p) for p, _, _ in FILES))))

    parts = [head]
    for i, (path, lang, role) in enumerate(FILES, 1):
        parts.append("## %d. `%s`\n\n%s\n\nSHA-256: `%s`\n\n%s%s\n%s\n%s\n"
                     % (i, path, role, sha(path), F, lang, body(path), F))
    open(os.path.join(OUT, "A_プロジェクトG_コード一式.md"), "w", encoding="utf-8") \
        .write("\n".join(parts) + "\n")

    verify = sys.argv[1] if len(sys.argv) > 1 else ""
    vtext = open(verify, encoding="utf-8").read().rstrip() if verify and os.path.exists(verify) else "(未取得)"
    open(os.path.join(OUT, "B_プロジェクトG_実装手順.md"), "w", encoding="utf-8") \
        .write(HEAD_B.replace("{F}", F).replace("{VERIFY}", vtext) + "\n")

    zip_path = os.path.join(ROOT, "handoff", "プロジェクトG_引き渡し.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for base, _dirs, files in os.walk(OUT):
            for f in sorted(files):
                full = os.path.join(base, f)
                z.write(full, os.path.join(os.path.basename(OUT),
                                           os.path.relpath(full, OUT)))
    for base, _dirs, files in os.walk(OUT):
        for f in sorted(files):
            full = os.path.join(base, f)
            print("  %-52s %8d bytes" % (os.path.relpath(full, os.path.dirname(OUT)),
                                         os.path.getsize(full)))
    print("zip -> %s (%d bytes)" % (zip_path, os.path.getsize(zip_path)))

main()
