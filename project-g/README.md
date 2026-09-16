# プロジェクトG 工程表変換 ― 設計A（xlsm 往路）

プロジェクトG が出力する工程表 CSV を読み、表示期間を指定して、業者が読める/直せる
xlsx を出力する xlsm。

- 上位仕様: [`spec/00_共通仕様_プロジェクトG工程表変換.md`](spec/00_共通仕様_プロジェクトG工程表変換.md) /
  [`spec/01_設計A_xlsm往路.md`](spec/01_設計A_xlsm往路.md)
- **実装メモ（判断の記録・PDF との差異・未対応事項・VBA 全文）:
  [`設計A_実装メモ.md`](設計A_実装メモ.md)**

## 納品物

| パス | 中身 |
|---|---|
| `dist/プロジェクトG変換ツール.xlsm` | 監督 PC 用。VBA 8 モジュール入り |
| `dist/サポートルーム_サンプル工程表_20260901-20261010.xlsx` | サンプルで生成した業者用ファイル（マクロなし） |
| `dist/変換ログ.txt` | 上記を生成したときのログ。末尾が「合格」 |
| `docs/スマホ表示_*.png` | 受け入れ試験 5 のスクリーンショット |
| `src/*.bas` | xlsm に埋め込んだ VBA と同一のソース |

## 使い方（監督）

1. `dist/プロジェクトG変換ツール.xlsm` を ZIP で配布し、展開前に Mark of the Web を解除する。
2. 開いてマクロを有効化 → `00_Control` で CSV を選び、Start / End を入れて「変換実行」。
3. CSV と同じフォルダーに xlsx と `変換ログ.txt` ができる。ログ末尾が「合格」なら業者へ送る。

詳しい手順は xlsm の `使い方` シートにも書いてある。

## 作り直す

```bash
python3 build/make_deliverables.py                                  # xlsm + サンプル一式
python3 test/acceptance.py sample/Sample/サポートルーム_サンプル工程表.csv /tmp/acc
python3 test/fault_injection.py sample/Sample/サポートルーム_サンプル工程表.csv
```

`build/` は xlsm の組み立て（MS-OVBA の vbaProject.bin 生成を含む）、
`test/` は納品する `.bas` をそのまま実行して受け入れ試験を回すための道具。
このコンテナに Excel も LibreOffice Calc も無いための構成で、理由は
実装メモ 7 章に書いてある。
