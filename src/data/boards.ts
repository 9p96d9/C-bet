// GTO C-bet board data — 54 representative boards
// Design: 2-axis matrix (wetness × range advantage) + paired special slots

export type Texture = 'Rainbow' | 'Two-Tone' | 'Monotone' | 'Paired'
export type Wetness = 'ドライ' | 'セミドライ' | 'セミウェット' | 'ウェット' | 'スーパーウェット'
export type RangeAdv = 'IP有利' | 'ニュートラル' | 'OOP有利'

export interface Board {
  id: number
  cards: string        // compact notation: "A72r", "AT8s", "AKQm"
  texture: Texture
  wetness: Wetness
  rangeAdv: RangeAdv
  cbetFreq: number     // GTO C-bet frequency 0-100
  checkFreq: number    // = 100 - cbetFreq
  betSize: 25 | 33 | 75 | 150  // recommended pot-fraction size (%)
}

// ── Seeded pseudo-random ─────────────────────────────────────────────────────
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

// ── Base frequency ranges by wetness × rangeAdv ──────────────────────────────
type RangeSpec = { min: number; max: number; size: 25 | 33 | 75 | 150 }

const RANGE_MATRIX: Record<Wetness, Record<RangeAdv, RangeSpec>> = {
  ドライ: {
    IP有利:      { min: 65, max: 80, size: 33 },
    ニュートラル: { min: 55, max: 70, size: 33 },
    OOP有利:     { min: 45, max: 60, size: 33 },
  },
  セミドライ: {
    IP有利:      { min: 58, max: 74, size: 33 },
    ニュートラル: { min: 50, max: 65, size: 33 },
    OOP有利:     { min: 40, max: 55, size: 33 },
  },
  セミウェット: {
    IP有利:      { min: 52, max: 67, size: 75 },
    ニュートラル: { min: 44, max: 59, size: 75 },
    OOP有利:     { min: 36, max: 50, size: 75 },
  },
  ウェット: {
    IP有利:      { min: 48, max: 62, size: 75 },
    ニュートラル: { min: 40, max: 55, size: 75 },
    OOP有利:     { min: 33, max: 47, size: 75 },
  },
  スーパーウェット: {
    IP有利:      { min: 40, max: 55, size: 75 },
    ニュートラル: { min: 38, max: 52, size: 75 },
    OOP有利:     { min: 30, max: 44, size: 75 },
  },
}

// Monotone override (regardless of rangeAdv)
const MONOTONE_RANGE: Record<RangeAdv, RangeSpec> = {
  IP有利:      { min: 40, max: 55, size: 75 },
  ニュートラル: { min: 38, max: 52, size: 75 },
  OOP有利:     { min: 32, max: 46, size: 75 },
}

// Paired override
const PAIRED_RANGE: Record<Wetness, RangeSpec> = {
  ドライ:        { min: 30, max: 50, size: 33 },
  セミドライ:    { min: 30, max: 50, size: 33 },
  セミウェット:  { min: 32, max: 46, size: 33 },
  ウェット:      { min: 30, max: 45, size: 33 },
  スーパーウェット: { min: 28, max: 42, size: 33 },
}

function getRange(texture: Texture, wetness: Wetness, rangeAdv: RangeAdv): RangeSpec {
  if (texture === 'Paired')   return PAIRED_RANGE[wetness]
  if (texture === 'Monotone') return MONOTONE_RANGE[rangeAdv]
  return RANGE_MATRIX[wetness][rangeAdv]
}

function genFreq(id: number, texture: Texture, wetness: Wetness, rangeAdv: RangeAdv): number {
  const { min, max } = getRange(texture, wetness, rangeAdv)
  return Math.round(min + seededRand(id) * (max - min))
}

function genSize(texture: Texture, wetness: Wetness, rangeAdv: RangeAdv): 25 | 33 | 75 | 150 {
  return getRange(texture, wetness, rangeAdv).size
}

// ── Board definitions ─────────────────────────────────────────────────────────
type BoardDef = Omit<Board, 'cbetFreq' | 'checkFreq' | 'betSize'>

const BOARD_DEFS: BoardDef[] = [
  // ── IP有利 ────────────────────────────────────────────────────────────────
  // ドライ
  { id:  1, cards: 'A72r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'IP有利' },
  { id:  2, cards: 'A83r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'IP有利' },
  { id:  3, cards: 'K72r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'IP有利' },
  // セミドライ
  { id:  4, cards: 'AJ4r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'IP有利' },
  { id:  5, cards: 'AT5r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'IP有利' },
  { id:  6, cards: 'KT5r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'IP有利' },
  // セミウェット
  { id:  7, cards: 'AT8s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'IP有利' },
  { id:  8, cards: 'AJ9s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'IP有利' },
  { id:  9, cards: 'KT8s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'IP有利' },
  // ウェット
  { id: 10, cards: 'AT9s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'IP有利' },
  { id: 11, cards: 'AJTs', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'IP有利' },
  { id: 12, cards: 'KQJs', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'IP有利' },
  // スーパーウェット
  { id: 13, cards: 'AKQm', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'IP有利' },
  { id: 14, cards: 'AT8m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'IP有利' },
  { id: 15, cards: 'KT5m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'IP有利' },

  // ── ニュートラル ──────────────────────────────────────────────────────────
  // ドライ
  { id: 16, cards: 'Q73r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'ニュートラル' },
  { id: 17, cards: 'J83r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'ニュートラル' },
  { id: 18, cards: 'T64r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'ニュートラル' },
  // セミドライ
  { id: 19, cards: 'QT5r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'ニュートラル' },
  { id: 20, cards: 'JT4r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'ニュートラル' },
  { id: 21, cards: 'T85r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'ニュートラル' },
  // セミウェット
  { id: 22, cards: 'QT8s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'ニュートラル' },
  { id: 23, cards: 'JT8s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'ニュートラル' },
  { id: 24, cards: 'T87s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'ニュートラル' },
  // ウェット
  { id: 25, cards: 'QJTs', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'ニュートラル' },
  { id: 26, cards: 'JT9s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'ニュートラル' },
  { id: 27, cards: 'T98s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'ニュートラル' },
  // スーパーウェット
  { id: 28, cards: 'QJTm', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'ニュートラル' },
  { id: 29, cards: 'JT9m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'ニュートラル' },
  { id: 30, cards: 'T98m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'ニュートラル' },

  // ── OOP有利 ───────────────────────────────────────────────────────────────
  // ドライ
  { id: 31, cards: '972r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'OOP有利' },
  { id: 32, cards: '852r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'OOP有利' },
  { id: 33, cards: '742r', texture: 'Rainbow',  wetness: 'ドライ',        rangeAdv: 'OOP有利' },
  // セミドライ
  { id: 34, cards: '964r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'OOP有利' },
  { id: 35, cards: '853r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'OOP有利' },
  { id: 36, cards: '743r', texture: 'Rainbow',  wetness: 'セミドライ',    rangeAdv: 'OOP有利' },
  // セミウェット
  { id: 37, cards: '986s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'OOP有利' },
  { id: 38, cards: '875s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'OOP有利' },
  { id: 39, cards: '764s', texture: 'Two-Tone', wetness: 'セミウェット',  rangeAdv: 'OOP有利' },
  // ウェット
  { id: 40, cards: '987s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'OOP有利' },
  { id: 41, cards: '876s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'OOP有利' },
  { id: 42, cards: '765s', texture: 'Two-Tone', wetness: 'ウェット',      rangeAdv: 'OOP有利' },
  // スーパーウェット
  { id: 43, cards: '987m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'OOP有利' },
  { id: 44, cards: '876m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'OOP有利' },
  { id: 45, cards: '654m', texture: 'Monotone', wetness: 'スーパーウェット', rangeAdv: 'OOP有利' },

  // ── ペアボード特殊枠 ──────────────────────────────────────────────────────
  // ハイペア
  { id: 46, cards: 'AA2r', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'IP有利' },
  { id: 47, cards: 'KK3r', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'IP有利' },
  { id: 48, cards: 'QQ7r', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'ニュートラル' },
  // ミドルペア
  { id: 49, cards: 'TT4r', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'ニュートラル' },
  { id: 50, cards: '77Ar', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'OOP有利' },
  { id: 51, cards: '22Kr', texture: 'Paired',   wetness: 'ドライ',        rangeAdv: 'OOP有利' },
  // ペア＋ドロー
  { id: 52, cards: 'JJ9s', texture: 'Paired',   wetness: 'セミウェット',  rangeAdv: 'ニュートラル' },
  { id: 53, cards: 'TT8s', texture: 'Paired',   wetness: 'セミウェット',  rangeAdv: 'ニュートラル' },
  { id: 54, cards: '997s', texture: 'Paired',   wetness: 'セミウェット',  rangeAdv: 'OOP有利' },
]

// ── Build full Board objects ──────────────────────────────────────────────────
export const BOARDS: Board[] = BOARD_DEFS.map((def) => {
  const cbetFreq = genFreq(def.id, def.texture, def.wetness, def.rangeAdv)
  return {
    ...def,
    cbetFreq,
    checkFreq: 100 - cbetFreq,
    betSize: genSize(def.texture, def.wetness, def.rangeAdv),
  }
})

// ── Query helpers ─────────────────────────────────────────────────────────────
export function getAllBoards(): Board[] {
  return BOARDS
}

export interface BoardFilters {
  wetness?: Wetness[]
  rangeAdv?: RangeAdv[]
  texture?: Texture[]
}

export function getFilteredBoards(filters: BoardFilters): Board[] {
  return BOARDS.filter((b) => {
    if (filters.wetness?.length && !filters.wetness.includes(b.wetness)) return false
    if (filters.rangeAdv?.length && !filters.rangeAdv.includes(b.rangeAdv)) return false
    if (filters.texture?.length && !filters.texture.includes(b.texture)) return false
    return true
  })
}

// ── Filter value lists ────────────────────────────────────────────────────────
export const WETNESS_VALUES: Wetness[] = [
  'ドライ', 'セミドライ', 'セミウェット', 'ウェット', 'スーパーウェット',
]
export const RANGE_ADV_VALUES: RangeAdv[] = ['IP有利', 'ニュートラル', 'OOP有利']
export const TEXTURE_VALUES: Texture[] = ['Rainbow', 'Two-Tone', 'Monotone', 'Paired']
