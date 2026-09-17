# GaNett工程表ツール ― ステップ 1（往路）

`00_共通仕様_GaNett工程表変換.md` と `02_設計B_HTMLツール_往路→復路.md` を
最上位仕様とする実装。**ステップ 2（復路）には着手していない。**

## 納品物

| ファイル | 内容 |
|---|---|
| `GaNett工程表ツール.html` | 単一 HTML。CSS・JS・ExcelJS 4.4.0 を全てインライン。`file://` で動く |
| `設計B_実装メモ.md` | 描画規則表・検査ログ・自前コード全文・未実施事項 |
| `out/代替サンプル工程表_20260901-20261010.xlsx` | 生成した xlsx |

**`設計B_実装メモ.md` の 0 章を最初に読むこと。** `Sample.zip` と `01_設計A` が
本セッションに提供されなかったため、PDF 照合と設計 A 準拠が未実施である。

## 使い方

`GaNett工程表ツール.html` をブラウザで開き、CSV を選んで［描画］。
SVG 検査が全件 OK になると［xlsx 書き出し］が有効になる。

## 開発

```
node tools/make-fixture.mjs               # 代替サンプル CSV を生成
node tools/build-html.mjs                 # src/ → GaNett工程表ツール.html
node tools/acceptance.mjs                 # 受け入れ試験（headless Chromium）
python3 tools/verify-xlsx-independent.py  # openpyxl による独立検査
node tools/build-memo.mjs                 # docs/memo-body.md → 設計B_実装メモ.md
```

`GaNett工程表ツール.html` は生成物。直さずに `src/` を直して再ビルドすること。
