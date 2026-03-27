import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '../store'
import { getAllBoards } from '../data/boards'
import { act } from '@testing-library/react'

beforeEach(() => {
  act(() => {
    useAppStore.setState({
      activeProfile: 'GTO',
      wetnessFilter: [],
      rangeAdvFilter: [],
      textureFilter: [],
      quiz: {
        currentBoard: null,
        answered: false,
        isCorrect: null,
        userCbetFreq: '',
        userBetSize: '',
        score: 0,
        totalAnswered: 0,
        weakSpots: {},
        weakSpotMode: false,
      },
    })
  })
})

describe('App store', () => {
  it('initial profile is GTO', () => {
    expect(useAppStore.getState().activeProfile).toBe('GTO')
  })

  it('setProfile updates activeProfile', () => {
    act(() => useAppStore.getState().setProfile('Nit'))
    expect(useAppStore.getState().activeProfile).toBe('Nit')
  })

  it('drawQuestion picks a board from the 54 boards', () => {
    act(() => useAppStore.getState().drawQuestion())
    const { quiz } = useAppStore.getState()
    expect(quiz.currentBoard).not.toBeNull()

    const allIds = getAllBoards().map((b) => b.id)
    expect(allIds).toContain(quiz.currentBoard?.id)
  })

  it('score increments by 1 on correct answer', () => {
    act(() => useAppStore.getState().drawQuestion())
    const { quiz } = useAppStore.getState()
    const board = quiz.currentBoard!

    act(() => {
      useAppStore.getState().setUserCbetFreq(String(board.cbetFreq))
      useAppStore.getState().setUserBetSize(String(board.betSize))
      useAppStore.getState().submitAnswer()
    })

    const updated = useAppStore.getState().quiz
    expect(updated.score).toBe(1)
    expect(updated.totalAnswered).toBe(1)
    expect(updated.isCorrect).toBe(true)
  })

  it('score does not increment on wrong answer', () => {
    act(() => useAppStore.getState().drawQuestion())
    const { quiz } = useAppStore.getState()
    const board = quiz.currentBoard!
    const wrongFreq = board.cbetFreq > 50 ? '0' : '100'

    act(() => {
      useAppStore.getState().setUserCbetFreq(wrongFreq)
      useAppStore.getState().setUserBetSize(String(board.betSize))
      useAppStore.getState().submitAnswer()
    })

    const updated = useAppStore.getState().quiz
    expect(updated.score).toBe(0)
    expect(updated.totalAnswered).toBe(1)
    expect(updated.isCorrect).toBe(false)
  })

  it('answer within ±10% is accepted as correct', () => {
    act(() => useAppStore.getState().drawQuestion())
    const { quiz } = useAppStore.getState()
    const board = quiz.currentBoard!
    const nearFreq = String(Math.min(100, board.cbetFreq + 9))

    act(() => {
      useAppStore.getState().setUserCbetFreq(nearFreq)
      useAppStore.getState().setUserBetSize(String(board.betSize))
      useAppStore.getState().submitAnswer()
    })

    expect(useAppStore.getState().quiz.isCorrect).toBe(true)
  })

  it('getDisplayBoards returns 54 boards with no filters', () => {
    const boards = useAppStore.getState().getDisplayBoards()
    expect(boards).toHaveLength(54)
  })

  it('switching to Nit profile reduces average cbetFreq', () => {
    const gtoBoardsAvg =
      useAppStore.getState().getDisplayBoards().reduce((s, b) => s + b.cbetFreq, 0) / 54

    act(() => useAppStore.getState().setProfile('Nit'))
    const nitBoardsAvg =
      useAppStore.getState().getDisplayBoards().reduce((s, b) => s + b.cbetFreq, 0) / 54

    expect(nitBoardsAvg).toBeLessThan(gtoBoardsAvg)
  })

  it('toggleWetnessFilter adds and removes filter', () => {
    expect(useAppStore.getState().wetnessFilter).toHaveLength(0)
    act(() => useAppStore.getState().toggleWetnessFilter('ドライ'))
    expect(useAppStore.getState().wetnessFilter).toContain('ドライ')
    act(() => useAppStore.getState().toggleWetnessFilter('ドライ'))
    expect(useAppStore.getState().wetnessFilter).not.toContain('ドライ')
  })

  it('toggleTextureFilter filters displayed boards', () => {
    act(() => useAppStore.getState().toggleTextureFilter('Monotone'))
    const boards = useAppStore.getState().getDisplayBoards()
    expect(boards).toHaveLength(9)
    boards.forEach((b) => expect(b.texture).toBe('Monotone'))
  })

  it('clearFilters resets all filters and shows 54 boards', () => {
    act(() => {
      useAppStore.getState().toggleWetnessFilter('ドライ')
      useAppStore.getState().toggleTextureFilter('Rainbow')
    })
    act(() => useAppStore.getState().clearFilters())
    expect(useAppStore.getState().getDisplayBoards()).toHaveLength(54)
  })

  it('weak spot mode toggle works', () => {
    expect(useAppStore.getState().quiz.weakSpotMode).toBe(false)
    act(() => useAppStore.getState().toggleWeakSpotMode())
    expect(useAppStore.getState().quiz.weakSpotMode).toBe(true)
  })
})
