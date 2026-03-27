import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card, parseCompactBoard, parseBoardString } from '../components/Card'
import { getBoardLabel } from '../utils/boardLabel'
import type { Board } from '../data/boards'

// ── parseCompactBoard ─────────────────────────────────────────────────────────
describe('parseCompactBoard', () => {
  it('parses rainbow board "A72r" correctly', () => {
    const cards = parseCompactBoard('A72r')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toEqual({ rank: 'A', suit: '♠' })
    expect(cards[1]).toEqual({ rank: '7', suit: '♦' })
    expect(cards[2]).toEqual({ rank: '2', suit: '♥' })
  })

  it('assigns ♠♥♠ for two-tone boards', () => {
    const cards = parseCompactBoard('AT8s')
    expect(cards[0].suit).toBe('♠')
    expect(cards[1].suit).toBe('♥')
    expect(cards[2].suit).toBe('♠')
  })

  it('assigns ♠♠♠ for monotone boards', () => {
    const cards = parseCompactBoard('AKQm')
    cards.forEach((c) => expect(c.suit).toBe('♠'))
  })

  it('parses T correctly in "AT8s"', () => {
    const cards = parseCompactBoard('AT8s')
    expect(cards[0]).toEqual({ rank: 'A', suit: '♠' })
    expect(cards[1]).toEqual({ rank: 'T', suit: '♥' })
    expect(cards[2]).toEqual({ rank: '8', suit: '♠' })
  })

  it('returns empty array for short string', () => {
    expect(parseCompactBoard('A7')).toHaveLength(0)
  })
})

// ── parseBoardString (legacy) ─────────────────────────────────────────────────
describe('parseBoardString (legacy)', () => {
  it('parses "A♠K♦2♣" correctly', () => {
    const cards = parseBoardString('A♠K♦2♣')
    expect(cards).toHaveLength(3)
    expect(cards[0]).toEqual({ rank: 'A', suit: '♠' })
    expect(cards[1]).toEqual({ rank: 'K', suit: '♦' })
    expect(cards[2]).toEqual({ rank: '2', suit: '♣' })
  })
})

// ── Card component ────────────────────────────────────────────────────────────
describe('Card component', () => {
  it('spade card has black background (bg-gray-900)', () => {
    render(<Card rank="A" suit="♠" />)
    expect(screen.getByTestId('playing-card')).toHaveClass('bg-gray-900')
  })

  it('heart card has red background (bg-red-600)', () => {
    render(<Card rank="K" suit="♥" />)
    expect(screen.getByTestId('playing-card')).toHaveClass('bg-red-600')
  })

  it('diamond card has blue background (bg-blue-600)', () => {
    render(<Card rank="Q" suit="♦" />)
    expect(screen.getByTestId('playing-card')).toHaveClass('bg-blue-600')
  })

  it('club card has green background (bg-green-700)', () => {
    render(<Card rank="J" suit="♣" />)
    expect(screen.getByTestId('playing-card')).toHaveClass('bg-green-700')
  })

  it('displays rank and suit text', () => {
    render(<Card rank="A" suit="♠" />)
    expect(screen.getByText('A♠')).toBeInTheDocument()
  })

  it('has white border', () => {
    render(<Card rank="T" suit="♥" />)
    expect(screen.getByTestId('playing-card')).toHaveClass('border-white')
  })
})

// ── getBoardLabel ─────────────────────────────────────────────────────────────
describe('getBoardLabel', () => {
  const makeBoard = (wetness: Board['wetness'], rangeAdv: Board['rangeAdv']): Board => ({
    id: 1,
    cards: 'A72r',
    texture: 'Rainbow',
    wetness,
    rangeAdv,
    cbetFreq: 70,
    checkFreq: 30,
    betSize: 33,
  })

  it('returns "ドライ / IP有利"', () => {
    expect(getBoardLabel(makeBoard('ドライ', 'IP有利'))).toBe('ドライ / IP有利')
  })

  it('returns "ウェット / OOP有利"', () => {
    expect(getBoardLabel(makeBoard('ウェット', 'OOP有利'))).toBe('ウェット / OOP有利')
  })

  it('returns "スーパーウェット / ニュートラル"', () => {
    expect(getBoardLabel(makeBoard('スーパーウェット', 'ニュートラル'))).toBe(
      'スーパーウェット / ニュートラル',
    )
  })

  it('format is always "wetness / rangeAdv"', () => {
    const label = getBoardLabel(makeBoard('セミドライ', 'IP有利'))
    expect(label).toMatch(/^.+ \/ .+$/)
  })
})
