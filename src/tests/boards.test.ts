import { describe, it, expect } from 'vitest'
import {
  BOARDS,
  getAllBoards,
  getFilteredBoards,
  WETNESS_VALUES,
  RANGE_ADV_VALUES,
  TEXTURE_VALUES,
} from '../data/boards'

describe('Board data', () => {
  it('total board count is 54', () => {
    expect(BOARDS).toHaveLength(54)
    expect(getAllBoards()).toHaveLength(54)
  })

  it('matrix boards (non-paired) = 45', () => {
    const matrix = BOARDS.filter((b) => b.texture !== 'Paired')
    expect(matrix).toHaveLength(45)
  })

  it('paired special boards = 9', () => {
    const paired = BOARDS.filter((b) => b.texture === 'Paired')
    expect(paired).toHaveLength(9)
  })

  it('cbetFreq + checkFreq = 100 for all 54 boards', () => {
    BOARDS.forEach((b) => {
      expect(b.cbetFreq + b.checkFreq).toBe(100)
    })
  })

  it('all cbetFreq values are in range [0, 100]', () => {
    BOARDS.forEach((b) => {
      expect(b.cbetFreq).toBeGreaterThanOrEqual(0)
      expect(b.cbetFreq).toBeLessThanOrEqual(100)
    })
  })

  it('all betSize values are valid (25 | 33 | 75 | 150)', () => {
    const valid = [25, 33, 75, 150]
    BOARDS.forEach((b) => {
      expect(valid).toContain(b.betSize)
    })
  })

  it('all board ids are unique', () => {
    const ids = BOARDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(54)
  })

  it('ids range from 1 to 54', () => {
    const ids = BOARDS.map((b) => b.id).sort((a, b) => a - b)
    expect(ids[0]).toBe(1)
    expect(ids[53]).toBe(54)
  })

  it('all texture values are valid', () => {
    BOARDS.forEach((b) => {
      expect(TEXTURE_VALUES).toContain(b.texture)
    })
  })

  it('all wetness values are valid', () => {
    BOARDS.forEach((b) => {
      expect(WETNESS_VALUES).toContain(b.wetness)
    })
  })

  it('all rangeAdv values are valid', () => {
    BOARDS.forEach((b) => {
      expect(RANGE_ADV_VALUES).toContain(b.rangeAdv)
    })
  })

  it('each of the 3 rangeAdv groups has 15 matrix boards (5 × 3)', () => {
    const matrixBoards = BOARDS.filter((b) => b.texture !== 'Paired')
    RANGE_ADV_VALUES.forEach((adv) => {
      const group = matrixBoards.filter((b) => b.rangeAdv === adv)
      expect(group).toHaveLength(15)
    })
  })

  it('Monotone boards = 9 in matrix', () => {
    const mono = BOARDS.filter((b) => b.texture === 'Monotone')
    expect(mono).toHaveLength(9)
  })
})

describe('getFilteredBoards', () => {
  it('no filters returns all 54 boards', () => {
    expect(getFilteredBoards({})).toHaveLength(54)
  })

  it('filtering by "ドライ" returns ≤ 15 boards', () => {
    const result = getFilteredBoards({ wetness: ['ドライ'] })
    expect(result.length).toBeLessThanOrEqual(15)
    result.forEach((b) => expect(b.wetness).toBe('ドライ'))
  })

  it('filtering by "Monotone" returns exactly 9 boards', () => {
    const result = getFilteredBoards({ texture: ['Monotone'] })
    expect(result).toHaveLength(9)
  })

  it('filtering by "IP有利" returns 17 boards (15 matrix + 2 paired)', () => {
    const result = getFilteredBoards({ rangeAdv: ['IP有利'] })
    expect(result).toHaveLength(17)
  })

  it('combined filter works correctly', () => {
    const result = getFilteredBoards({ wetness: ['ドライ'], texture: ['Rainbow'] })
    result.forEach((b) => {
      expect(b.wetness).toBe('ドライ')
      expect(b.texture).toBe('Rainbow')
    })
  })

  it('empty filter arrays return all 54 boards', () => {
    expect(getFilteredBoards({ wetness: [], rangeAdv: [], texture: [] })).toHaveLength(54)
  })
})
