import { describe, it, expect } from 'vitest'
import { applyProfile, applyProfileToBoards, getProfile, PROFILES } from '../utils/profile'
import type { Board } from '../data/boards'

const sampleBoard: Board = {
  id: 1,
  cards: 'A72r',
  texture: 'Rainbow',
  wetness: 'ドライ',
  rangeAdv: 'IP有利',
  cbetFreq: 70,
  checkFreq: 30,
  betSize: 33,
}

describe('Profile utils', () => {
  it('GTO profile returns unchanged board', () => {
    const gto = getProfile('GTO')
    const result = applyProfile(sampleBoard, gto)
    expect(result.cbetFreq).toBe(70)
    expect(result.checkFreq).toBe(30)
  })

  it('cbetFreq + checkFreq always equals 100 for all profiles', () => {
    PROFILES.forEach((profile) => {
      const result = applyProfile(sampleBoard, profile)
      expect(result.cbetFreq + result.checkFreq).toBe(100)
    })
  })

  it('Nit profile reduces cbetFreq', () => {
    const nit = getProfile('Nit')
    const result = applyProfile(sampleBoard, nit)
    expect(result.cbetFreq).toBeLessThan(sampleBoard.cbetFreq)
  })

  it('Maniac profile increases cbetFreq', () => {
    const maniac = getProfile('Maniac')
    const result = applyProfile(sampleBoard, maniac)
    expect(result.cbetFreq).toBeGreaterThan(sampleBoard.cbetFreq)
  })

  it('applyProfileToBoards applies to all boards', () => {
    const boards = [sampleBoard, { ...sampleBoard, id: 2 }]
    const nit = getProfile('Nit')
    const results = applyProfileToBoards(boards, nit)
    expect(results).toHaveLength(2)
    results.forEach((r) => {
      expect(r.cbetFreq + r.checkFreq).toBe(100)
    })
  })

  it('cbetFreq is always clamped between 0 and 100', () => {
    const edgeBoardHigh: Board = { ...sampleBoard, cbetFreq: 98, checkFreq: 2 }
    const edgeBoardLow: Board  = { ...sampleBoard, cbetFreq: 2,  checkFreq: 98 }
    PROFILES.forEach((profile) => {
      const high = applyProfile(edgeBoardHigh, profile)
      const low  = applyProfile(edgeBoardLow,  profile)
      expect(high.cbetFreq).toBeGreaterThanOrEqual(0)
      expect(high.cbetFreq).toBeLessThanOrEqual(100)
      expect(low.cbetFreq).toBeGreaterThanOrEqual(0)
      expect(low.cbetFreq).toBeLessThanOrEqual(100)
    })
  })

  it('there are exactly 5 profiles', () => {
    expect(PROFILES).toHaveLength(5)
  })
})
