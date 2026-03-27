export interface ParsedCard {
  rank: string
  suit: string
}

// ── Suit assignment by texture suffix ────────────────────────────────────────
// r = rainbow  → ♠ ♦ ♥
// s = two-tone → ♠ ♥ ♠  (1st & 3rd share suit — flush draw)
// m = monotone → ♠ ♠ ♠
const SUIT_BY_TEXTURE: Record<string, [string, string, string]> = {
  r: ['♠', '♦', '♥'],
  s: ['♠', '♥', '♠'],
  m: ['♠', '♠', '♠'],
}

/**
 * Parse compact board notation "A72r" / "AT8s" / "AKQm" into ParsedCard[].
 * Last character is texture code (r/s/m). All preceding chars are ranks.
 */
export function parseCompactBoard(compact: string): ParsedCard[] {
  if (compact.length < 4) return []
  const textureCode = compact[compact.length - 1]
  const rankChars = compact.slice(0, -1).split('')
  const suits = SUIT_BY_TEXTURE[textureCode] ?? SUIT_BY_TEXTURE['r']
  return rankChars.map((rank, i) => ({ rank, suit: suits[i] ?? '♠' }))
}

// ── Legacy parser for "A♠K♦2♣" format (kept for backward compatibility) ─────
export function parseBoardString(board: string): ParsedCard[] {
  const cards: ParsedCard[] = []
  const regex = /([AKQJT2-9]{1,2})([♠♥♦♣])/g
  let match
  while ((match = regex.exec(board)) !== null) {
    cards.push({ rank: match[1], suit: match[2] })
  }
  return cards
}

// ── Visual styles ─────────────────────────────────────────────────────────────
const SUIT_STYLES: Record<string, string> = {
  '♠': 'bg-gray-900',
  '♥': 'bg-red-600',
  '♦': 'bg-blue-600',
  '♣': 'bg-green-700',
}

interface CardProps {
  rank: string
  suit: string
}

export function Card({ rank, suit }: CardProps) {
  const bg = SUIT_STYLES[suit] ?? 'bg-gray-700'

  return (
    <div
      className={`w-12 h-8 rounded-md border-2 border-white ${bg} flex items-center justify-center`}
      data-testid="playing-card"
      data-suit={suit}
    >
      <span className="text-sm font-bold text-white leading-none">
        {rank}{suit}
      </span>
    </div>
  )
}

interface BoardCardsProps {
  /** Accepts either compact "A72r" or legacy "A♠K♦2♣" format */
  board: string
}

export function BoardCards({ board }: BoardCardsProps) {
  // Detect format: compact ends in r/s/m, legacy contains suit symbols
  const isCompact = /^[AKQJT2-9]{3}[rsm]$/.test(board)
  const cards = isCompact ? parseCompactBoard(board) : parseBoardString(board)

  return (
    <div className="flex items-center gap-1" data-testid="board-cards">
      {cards.map((c, i) => (
        <Card key={i} rank={c.rank} suit={c.suit} />
      ))}
    </div>
  )
}
