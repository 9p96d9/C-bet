# GaNett工程表ツール ― ステップ 1（往路）

`00_共通仕様_GaNett工程表変換.md` と `02_設計B_HTMLツール_往路→復路.md` を
最上位仕様とする実装。**ステップ 2（復路）には着手していない。**

## 納品物

| ファイル | 内容 |
|---|---|
| `GaNett工程表ツール.html` | 単一 HTML。CSS・JS・ExcelJS 4.4.0 を全てインライン。`file://` で動く |
| `設計B_実装メモ.md` | 描画規則表（PDF 実測）・推定の記録・検査ログ・自前コード全文 |
| `out/サポートルーム_サンプル工程表_20260901-20261010.xlsx` | サンプルから生成した xlsx |

**`設計B_実装メモ.md` の 0 章を最初に読むこと。**

## 使い方

`GaNett工程表ツール.html` をブラウザで開き、CSV を選んで［描画］。
SVG 検査が全件 OK になると［xlsx 書き出し］が有効になる。

**CSV に値が無く、ツールが規則で埋めた箇所は読み込みのたびに一覧で出る。**
「推定」と出た行は CSV から決められない値なので、GaNett の画面で確認してほしい。
gate の中間行は「gate 中間行の指定」に `<工程ID>:<行>` を入れれば上書きできる。

## 検査

| 検査 | 実行 | 結果 |
|---|---|---|
| PDF との座標照合（受け入れ 1） | `python3 tools/compare-pdf.py` | 26 / 28（共通規則で埋めた場合） |
| 同上・gate 中間行を手入力 | `python3 tools/compare-pdf.py --manual` | **28 / 28 全一致** |
| 受け入れ 2〜5 ＋ 回帰 | `node tools/acceptance.mjs` | ALL PASS |
| 祝日計算 | `node tools/holiday-test.mjs` | 16 / 16 |
| xlsx の独立検査（openpyxl） | `python3 tools/verify-xlsx-independent.py` | 21 / 21 |

## 開発

```
node tools/make-fixture.mjs               # 合成 CSV（禁止事項 1 の確認用）
node tools/build-html.mjs                 # src/ → GaNett工程表ツール.html
python3 tools/pdf-extract.py              # PDF からベクター座標を抜く
node tools/build-memo.mjs                 # docs/memo-body.md → 設計B_実装メモ.md
```

`GaNett工程表ツール.html` は生成物。直さずに `src/` を直して再ビルドすること。
