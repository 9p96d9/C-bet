# 仕様書 — Poker GTO C-bet Trainer

バージョン: 1.0.0（2026-03-27 時点）
リポジトリ: https://github.com/9p96d9/C-bet

---

## 1. アプリケーション概要

ポーカーのフロップ C-bet 戦略を GTO データで学べる「レポート＆トレーナー Web アプリ」。

### 主要機能
| 機能 | 説明 |
|-----|-----|
| C-bet レポート | 54 ボードの GTO C-bet 頻度・推奨サイズをフィルター付きで一覧表示 |
| プロファイル切替 | 5 種類のエクスプロイト戦略に切り替えると全数値が即時更新 |
| トレーナー | ランダム出題 → ユーザー回答 → 正解フィードバック → スコア記録 |

---

## 2. 技術スタック

| 区分 | ライブラリ / ツール | バージョン |
|-----|-----------------|---------|
| フレームワーク | React | 18.2 |
| 言語 | TypeScript | 5.2 |
| ビルドツール | Vite | 5.0 |
| スタイリング | TailwindCSS | 3.4 |
| 状態管理 | Zustand | 4.4 |
| テスト | Vitest + React Testing Library | 1.1 / 14.1 |
| テスト環境 | jsdom | 23.0 |

---

## 3. データ設計

### 3-1. Board 型定義

```typescript
// /src/data/boards.ts

export type Texture  = 'Rainbow' | 'Two-Tone' | 'Monotone' | 'Paired'
export type Wetness  = 'ドライ' | 'セミドライ' | 'セミウェット' | 'ウェット' | 'スーパーウェット'
export type RangeAdv = 'IP有利' | 'ニュートラル' | 'OOP有利'

export interface Board {
  id: number            // 1 〜 54
  cards: string         // コンパクト表記: "A72r" / "AT8s" / "AKQm"
  texture: Texture
  wetness: Wetness
  rangeAdv: RangeAdv
  cbetFreq: number      // GTO C-bet 頻度 0〜100
  checkFreq: number     // = 100 - cbetFreq
  betSize: 25 | 33 | 75 | 150  // 推奨ベットサイズ（ポット%）
}
```

### 3-2. カード表記フォーマット

コンパクト表記の末尾1文字がテクスチャを示す：

| サフィックス | テクスチャ | 表示スーツ割り当て |
|-----------|---------|---------------|
| `r` | Rainbow（全スート異なる） | ♠ ♦ ♥ |
| `s` | Two-Tone（2枚同スート） | ♠ ♥ ♠（1枚目と3枚目が♠） |
| `m` | Monotone（全スート同じ） | ♠ ♠ ♠ |

Paired ボードも同ルールを適用（例: `AA2r` → A♠ A♦ 2♥）。

### 3-3. ボード構成（54 枚）

#### マトリクスボード（45 枚）

| | IP有利 | ニュートラル | OOP有利 |
|--|-------|-----------|--------|
| **ドライ** | 1〜3 | 16〜18 | 31〜33 |
| **セミドライ** | 4〜6 | 19〜21 | 34〜36 |
| **セミウェット** | 7〜9 | 22〜24 | 37〜39 |
| **ウェット** | 10〜12 | 25〜27 | 40〜42 |
| **スーパーウェット** | 13〜15 | 28〜30 | 43〜45 |

- IP有利: Aハイ / Kハイ
- ニュートラル: Q / J / Tハイ
- OOP有利: 9 以下トップ

#### ペアボード特殊枠（9 枚）

| id | ボード | 分類 |
|----|------|-----|
| 46 | AA2r | ハイペア / IP有利 |
| 47 | KK3r | ハイペア / IP有利 |
| 48 | QQ7r | ハイペア / ニュートラル |
| 49 | TT4r | ミドルペア / ニュートラル |
| 50 | 77Ar | ミドルペア / OOP有利 |
| 51 | 22Kr | ミドルペア / OOP有利 |
| 52 | JJ9s | ペア＋ドロー / ニュートラル |
| 53 | TT8s | ペア＋ドロー / ニュートラル |
| 54 | 997s | ペア＋ドロー / OOP有利 |

### 3-4. cbetFreq / betSize の生成ルール

現在は近似乱数（シード固定）で生成。以下の傾向を反映している：

| 組み合わせ | cbetFreq 範囲 | betSize |
|----------|-------------|--------|
| ドライ + IP有利 | 65〜80% | 33% |
| セミドライ + IP有利 | 58〜74% | 33% |
| セミウェット + IP有利 | 52〜67% | 75% |
| ウェット + IP有利 | 48〜62% | 75% |
| スーパーウェット + IP有利 | 40〜55% | 75% |
| ドライ + ニュートラル | 55〜70% | 33% |
| ウェット + OOP有利 | 33〜47% | 75% |
| スーパーウェット + OOP有利 | 30〜44% | 75% |
| Monotone（全） | 30〜55% | 75% |
| Paired（ドライ） | 30〜50% | 33% |
| Paired（セミウェット） | 32〜46% | 33% |

---

## 4. プロファイル仕様

### 4-1. プロファイル定義

```typescript
// /src/utils/profile.ts
export type ProfileName = 'GTO' | 'Fish' | 'CallingStation' | 'Maniac' | 'Nit'

export interface Profile {
  name: ProfileName
  foldAdj: number   // Fold 頻度調整（%pt）
  checkAdj: number  // Check 頻度調整（%pt）
  callAdj: number   // Call 頻度調整（%pt）
  betAdj: number    // Bet 頻度調整（%pt）
}
```

### 4-2. 各プロファイルのパラメータ

| プロファイル | foldAdj | checkAdj | callAdj | betAdj |
|-----------|--------|---------|--------|-------|
| GTO | 0 | 0 | 0 | 0 |
| Fish | 0 | -6 | +4 | 0 |
| Calling Station | 0 | +2 | +6 | -3 |
| Maniac | -6 | 0 | +3 | +6 |
| Nit | +7 | +2 | 0 | -3 |

### 4-3. 補正計算式

```typescript
// cbetFreq（C-bet はベットの一形態）に betAdj と checkAdj を適用
cbetFreq = clamp(gtoValue + betAdj - checkAdj, 0, 100)
checkFreq = 100 - cbetFreq
```

---

## 5. ストア仕様

### 5-1. 状態定義

```typescript
// /src/store/index.ts
interface AppState {
  activeProfile: ProfileName    // 選択中プロファイル（デフォルト: 'GTO'）
  wetnessFilter: Wetness[]      // 空 = 全表示
  rangeAdvFilter: RangeAdv[]    // 空 = 全表示
  textureFilter: Texture[]      // 空 = 全表示
  quiz: QuizState
}

interface QuizState {
  currentBoard: Board | null
  answered: boolean
  isCorrect: boolean | null
  userCbetFreq: string          // ユーザー入力（数値文字列）
  userBetSize: string           // ユーザー選択（"25"|"33"|"75"|"150"）
  score: number
  totalAnswered: number
  weakSpots: Record<string, { correct: number; total: number }>
  weakSpotMode: boolean
}
```

### 5-2. 主要アクション

| アクション | 説明 |
|----------|-----|
| `setProfile(name)` | プロファイル変更（全ボード数値即時更新） |
| `toggleWetnessFilter(w)` | ウェット度フィルター ON/OFF トグル |
| `toggleRangeAdvFilter(r)` | レンジ有利フィルター ON/OFF トグル |
| `toggleTextureFilter(t)` | テクスチャフィルター ON/OFF トグル |
| `clearFilters()` | 全フィルターリセット |
| `getDisplayBoards()` | フィルター適用 + プロファイル補正後のボード一覧を返す |
| `drawQuestion()` | 全54ボード（プロファイル補正後）からランダム出題 |
| `submitAnswer()` | 回答判定（±10%以内 + サイズ完全一致で正解） |

---

## 6. UI コンポーネント仕様

### 6-1. コンポーネント一覧

```
App.tsx
├── ReportScreen.tsx
│   ├── ProfileSwitcher.tsx
│   ├── [FilterChip] × 11（ウェット5 + レンジ3 + テクスチャ4）
│   └── BoardCard.tsx × n
│       ├── BoardCards → Card × 3
│       └── FrequencyGauge.tsx
└── TrainerScreen.tsx
    ├── BoardCards → Card × 3
    ├── [数値入力フィールド]
    └── [ベットサイズボタン × 4]
```

### 6-2. Card コンポーネント

```typescript
// /src/components/Card.tsx

// コンパクト表記のパース
parseCompactBoard("A72r")  // → [{rank:"A",suit:"♠"},{rank:"7",suit:"♦"},{rank:"2",suit:"♥"}]
parseCompactBoard("AT8s")  // → [{rank:"A",suit:"♠"},{rank:"T",suit:"♥"},{rank:"8",suit:"♠"}]
parseCompactBoard("AKQm")  // → [{rank:"A",suit:"♠"},{rank:"K",suit:"♠"},{rank:"Q",suit:"♠"}]

// スーツ → 背景色
♠ → bg-gray-900（黒）
♥ → bg-red-600（赤）
♦ → bg-blue-600（青）
♣ → bg-green-700（緑）

// カードサイズ: w-12 h-8 rounded-md border-2 border-white
```

### 6-3. FrequencyGauge コンポーネント

- `cbetFreq` を幅（0〜100%）で表示する水平ゲージバー
- `role="progressbar"` / `aria-valuenow` / `aria-valuemin` / `aria-valuemax` でアクセシビリティ対応
- 0〜100 の範囲でクランプ（オーバーフロー防止）

### 6-4. フィルター UI 仕様

| フィルター軸 | 選択肢 | 複数選択 | デフォルト |
|-----------|------|--------|---------|
| ウェット度 | ドライ / セミドライ / セミウェット / ウェット / スーパーウェット | ✅ | 全表示 |
| レンジ有利 | IP有利 / ニュートラル / OOP有利 | ✅ | 全表示 |
| テクスチャ | Rainbow / Two-Tone / Monotone / Paired | ✅ | 全表示 |

- 選択中フィルターがある場合のみ「フィルターをリセット」ボタンを表示
- ボード数カウント: 「{表示数} / 54 ボード」

---

## 7. トレーナー仕様

### 7-1. 出題ロジック

```
通常モード:  全54ボードからランダム抽選
苦手モード:  正解率が低い順にソート → 下位10件のプールからランダム抽選
```

苦手モードは `weakSpots` に記録が蓄積されてから機能する。

### 7-2. 正解判定

| 項目 | 正解条件 |
|-----|--------|
| C-bet 頻度 | `|入力値 - 正解値| ≤ 10` |
| ベットサイズ | 完全一致（25 / 33 / 75 / 150 のいずれか） |

両条件を同時に満たした場合のみ正解。

### 7-3. スコア管理

- `score`: 正解数
- `totalAnswered`: 回答数
- 正解率 = `Math.round(score / totalAnswered * 100)`

---

## 8. テスト仕様

### 8-1. テストファイルと内容

| ファイル | テスト数 | 主な確認内容 |
|--------|--------|-----------|
| boards.test.ts | 19 | 54枚・フィルター動作・各グループ枚数 |
| profile.test.ts | 7 | 補正計算・クランプ・5プロファイル |
| store.test.ts | 12 | クイズフロー・フィルター状態・プロファイル効果 |
| card.test.tsx | 16 | パーサー・Card 背景色・boardLabel |
| components.test.tsx | 24 | UI 描画・フィルター操作・E2E シナリオ |
| **合計** | **78** | |

### 8-2. テスト実行

```bash
npm run test          # 全テスト一括実行
npm run test:watch    # ウォッチモード（開発時）
```

---

## 9. ビルド・デプロイ

### 9-1. ビルド成果物

```
dist/
├── index.html        (~0.5 KB)
├── assets/
│   ├── index-*.css   (~12 KB gzip: ~3 KB)
│   └── index-*.js    (~165 KB gzip: ~52 KB)
```

### 9-2. デプロイ手順（Vercel/Netlify）

```bash
npm run build
# dist/ ディレクトリをホスティングサービスにアップロード
# ビルドコマンド: npm run build
# 出力ディレクトリ: dist
```

---

## 10. 今後の拡張ポイント

### 実GTO値への差し替え方法

`/src/data/boards.ts` の `BOARDS` 配列を直接編集する：

```typescript
// 現在（乱数生成）
export const BOARDS: Board[] = BOARD_DEFS.map((def) => {
  const cbetFreq = genFreq(def.id, ...)
  return { ...def, cbetFreq, checkFreq: 100 - cbetFreq, betSize: genSize(...) }
})

// 差し替え後（手書き or CSV インポート）
export const BOARDS: Board[] = [
  { id: 1, cards: 'A72r', texture: 'Rainbow', wetness: 'ドライ', rangeAdv: 'IP有利',
    cbetFreq: 73, checkFreq: 27, betSize: 33 },
  // ...
]
```

### シチュエーション別データの追加方法

```typescript
// Board 型に以下を追加
situations?: {
  SRP_IP?:  { cbetFreq: number; betSize: 25|33|75|150 }
  SRP_OOP?: { cbetFreq: number; betSize: 25|33|75|150 }
  '3BP_IP'?: { cbetFreq: number; betSize: 25|33|75|150 }
  // ...
}
```

store の `drawQuestion()` で現在選択中のシチュエーションに対応した値を参照するよう変更する。
