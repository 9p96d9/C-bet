# 引き継ぎ書 — Poker GTO C-bet Trainer

作成日: 2026-03-27
リポジトリ: https://github.com/9p96d9/C-bet

---

## 1. 今日やったこと（作業ログ）

### フェーズ1: プロジェクト初期構築
- Vite + React 18 + TypeScript のプロジェクトをゼロから手動スキャフォールド
  - `create-vite` が既存の `.claude/` ディレクトリを検知してキャンセルするバグがあったため、全ファイルを手書きで作成
- TailwindCSS / zustand / Vitest + React Testing Library を導入
- 49ボード × 7シチュエーション（SRP IP/OOP、BvB、3BP IP/OOP、4BP IP/OOP）の初期データ設計
- 全機能（レポート画面・プロファイル切替・トレーナー）を実装し、45テスト全パス

### フェーズ2: UIデザイン改修
- **カードコンポーネント作成**: "A♠K♦2♣" のテキスト表示をスート別カラーの「リアルカード風」UIに変更
  - ♠ 黒 / ♥ 赤 / ♦ 青 / ♣ 緑
- **ボードラベル自動判定**: テクスチャ×連続性からサブタイトルを自動生成するロジック実装
  - 例: "ツートーン・コネクテッド" / "レインボー・ハイドライ"
- テスト 45 → 64 に増加（全パス）

### フェーズ3: データ再設計（現在の最終状態）
- ボードデータを **54枚** に完全再設計
  - 2軸マトリクス: ウェット度（5段階）× レンジ有利（3段階）= 45枚
  - ペアボード特殊枠: 9枚
- 7シチュエーションタブを廃止し、**3軸フィルターUI**（ウェット度 / レンジ有利 / テクスチャ）に置き換え
- コンパクト表記 ("A72r", "AT8s", "AKQm") を導入
- `boardLabel.ts` を簡素化（`wetness / rangeAdv` をそのまま表示）
- テスト 64 → **78** に増加（全パス）

### GitHub プッシュ
- `git init` → コミット → `git push -u origin main`
- URL: https://github.com/9p96d9/C-bet

---

## 2. 現在の状態

| 確認項目 | 状態 |
|--------|------|
| `npm run dev` | ✅ 起動する |
| `npm run test` | ✅ 78/78 パス |
| `npm run build` | ✅ エラーなし（165KB JS） |
| GitHub | ✅ `main` ブランチにプッシュ済み |

---

## 3. ファイル構成と役割

```
C-bet/
├── src/
│   ├── data/
│   │   └── boards.ts          ★ ボードデータ定義（54枚）+ 型定義 + フィルター関数
│   ├── utils/
│   │   ├── profile.ts         ★ エクスプロイトプロファイル補正ロジック
│   │   └── boardLabel.ts      ボードのサブタイトル生成
│   ├── store/
│   │   └── index.ts           ★ Zustand グローバルストア（フィルター状態 + クイズ状態）
│   ├── components/
│   │   ├── App.tsx            タブ切替（レポート / トレーナー）
│   │   ├── ReportScreen.tsx   ★ レポート画面（フィルターUI + ボードグリッド）
│   │   ├── TrainerScreen.tsx  ★ トレーナー画面（クイズ UI）
│   │   ├── ProfileSwitcher.tsx プロファイル切替ボタン群
│   │   ├── BoardCard.tsx      ボードカード1枚（カード + ゲージ + バッジ）
│   │   ├── Card.tsx           リアルカード表示 + コンパクト表記パーサー
│   │   └── FrequencyGauge.tsx C-bet頻度ゲージバー
│   └── tests/
│       ├── boards.test.ts     データ整合性（54枚・フィルター動作）
│       ├── profile.test.ts    プロファイル補正ロジック
│       ├── store.test.ts      ストア動作（クイズ・フィルター）
│       ├── card.test.tsx      カードパーサー + Card コンポーネント + boardLabel
│       └── components.test.tsx UI コンポーネント + E2E シナリオ
├── package.json
├── vite.config.ts             テスト設定（vitest + jsdom）も兼務
├── tailwind.config.js
└── tsconfig.json
```

★ = 今後改修する可能性が高いファイル

---

## 4. 次にやることの候補

### データ精度向上（優先度 高）
- 現在の `cbetFreq` / `betSize` は近似乱数生成。実際の GTO ソルバー（GTO+, Monker 等）の出力値に差し替える
- `boards.ts` の各 Board オブジェクトに直接数値を書けばよい（生成関数は不要になる）
- CSV インポート機能を追加すると差し替えが楽になる（後述）

### シチュエーション別 GTO 値の復活（優先度 中）
- 現在のボードは「ボード単体の性質」のみで分類されており、SRP/3BP/4BP の区別がない
- 実際には同じボードでも SRP IP と 3BP IP では C-bet 頻度が大きく異なる
- 設計案: `Board` に `situations: Record<Situation, { cbetFreq, betSize }>` フィールドを追加

### CSV インポート機能（優先度 中）
```
// boards.ts の getFilteredBoards() に差し替えるだけで動く
// CSVフォーマット例:
id,cards,cbetFreq,betSize
1,A72r,72,33
2,A83r,68,33
...
```

### その他
- フィルター状態を URL クエリパラメータに保存（共有リンク）
- レポート画面でボードをクリック → 詳細モーダル（各シチュエーション別の比較表）
- ダークモード以外のテーマ対応（現状はダーク固定）
- Vercel / Netlify へのデプロイ（`npm run build` → `dist/` をアップロードするだけ）

---

## 5. よく使うコマンド

```bash
npm run dev      # 開発サーバー起動 (localhost:5173)
npm run test     # テスト実行（vitest run）
npm run test:watch # テストウォッチモード
npm run build    # 本番ビルド → dist/
npm run preview  # ビルド結果をローカルプレビュー
```

---

## 6. 注意事項・既知の制限

- **betSize は現在 `25|33|75|150` の4種のみ**。`25%` が出るボードはほぼなし（レンジ関係なく 33% か 75% がメイン）
- **ウェット度フィルターで「ドライ」を選ぶと 12〜15 枚** が表示される（ペアボードの一部が含まれるため）
- **トレーナーは全54ボードから抽選**。フィルターはレポート画面のみに効く（トレーナーには影響しない）
- Windows 環境での開発のため改行コードが CRLF になっている（git の警告が出るが動作上問題なし）
