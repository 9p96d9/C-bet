# GaNett工程表ツール ― ステップ 1（往路）

`00_共通仕様_GaNett工程表変換.md` と `02_設計B_HTMLツール_往路→復路.md` を
最上位仕様とする実装。**ステップ 2（復路）には着手していない。**

## 納品物

| ファイル | 内容 |
|---|---|
| `GaNett工程表ツール.html` | 単一 HTML。CSS・JS・ExcelJS 4.4.0 を全てインライン。`file://` で動く |
| `設計B_実装メモ.md` | 描画規則表（PDF 実測）・検査ログ・自前コード全文 |
| `out/サポートルーム_サンプル工程表_20260901-20261010.xlsx` | サンプルから生成した xlsx |

**`設計B_実装メモ.md` の 0 章を最初に読むこと。** 上位仕様に対する訂正が 3 件
（休日に祝日を含む／xlsx 配置の矛盾／太さの既定値と工程線名 JSON の形）と、
GaNett 側への確認事項が 1 件（gate の中間ノードの行番号）ある。

## 使い方

`GaNett工程表ツール.html` をブラウザで開き、CSV を選んで［描画］。
SVG 検査が全件 OK になると［xlsx 書き出し］が有効になる。

## 検査

| 検査 | 実行 | 結果 |
|---|---|---|
| PDF との座標照合（受け入れ 1） | `python3 tools/compare-pdf.py` | 26 / 28（不一致は D4・D5 の gate 行のみ） |
| 受け入れ 2〜5 ＋ 回帰 | `node tools/acceptance.mjs` | ALL PASS |
| xlsx の独立検査（openpyxl） | `python3 tools/verify-xlsx-independent.py` | 21 / 21 |

## 開発

```
node tools/make-fixture.mjs               # 合成 CSV（禁止事項 1 の確認用）
node tools/build-html.mjs                 # src/ → GaNett工程表ツール.html
node tools/pdf-extract.py                 # PDF からベクター座標を抜く
node tools/build-memo.mjs                 # docs/memo-body.md → 設計B_実装メモ.md
```

`GaNett工程表ツール.html` は生成物。直さずに `src/` を直して再ビルドすること。
