import { create } from 'zustand'
import type { Board, BoardFilters, Wetness, RangeAdv, Texture } from '../data/boards'
import { getAllBoards, getFilteredBoards } from '../data/boards'
import type { ProfileName } from '../utils/profile'
import { getProfile, applyProfileToBoards } from '../utils/profile'

// ── Quiz state ────────────────────────────────────────────────────────────────
export interface QuizState {
  currentBoard: Board | null
  answered: boolean
  isCorrect: boolean | null
  userCbetFreq: string
  userBetSize: string          // stored as string e.g. "75"; compare with String(board.betSize)
  score: number
  totalAnswered: number
  weakSpots: Record<string, { correct: number; total: number }>
  weakSpotMode: boolean
}

// ── App state ─────────────────────────────────────────────────────────────────
export interface AppState {
  activeProfile: ProfileName

  // Report filters (empty array = show all)
  wetnessFilter: Wetness[]
  rangeAdvFilter: RangeAdv[]
  textureFilter: Texture[]

  // Trainer quiz
  quiz: QuizState

  // Actions
  setProfile: (p: ProfileName) => void
  toggleWetnessFilter: (w: Wetness) => void
  toggleRangeAdvFilter: (r: RangeAdv) => void
  toggleTextureFilter: (t: Texture) => void
  clearFilters: () => void
  drawQuestion: () => void
  submitAnswer: () => void
  setUserCbetFreq: (v: string) => void
  setUserBetSize: (v: string) => void
  toggleWeakSpotMode: () => void

  // Computed
  getDisplayBoards: () => Board[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickBoard(
  boards: Board[],
  weakSpots: Record<string, { correct: number; total: number }>,
  weakMode: boolean,
): Board {
  if (weakMode && Object.keys(weakSpots).length > 0) {
    const sorted = [...boards].sort((a, b) => {
      const aStats = weakSpots[String(a.id)]
      const bStats = weakSpots[String(b.id)]
      const aRate = aStats ? aStats.correct / aStats.total : 0.5
      const bRate = bStats ? bStats.correct / bStats.total : 0.5
      return aRate - bRate
    })
    const pool = sorted.slice(0, Math.min(10, sorted.length))
    return pool[Math.floor(Math.random() * pool.length)]
  }
  return boards[Math.floor(Math.random() * boards.length)]
}

function toggleInArray<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
}

// ── Initial state ─────────────────────────────────────────────────────────────
const initialQuiz: QuizState = {
  currentBoard: null,
  answered: false,
  isCorrect: null,
  userCbetFreq: '',
  userBetSize: '',
  score: 0,
  totalAnswered: 0,
  weakSpots: {},
  weakSpotMode: false,
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAppStore = create<AppState>((set, get) => ({
  activeProfile: 'GTO',
  wetnessFilter: [],
  rangeAdvFilter: [],
  textureFilter: [],
  quiz: initialQuiz,

  getDisplayBoards: () => {
    const { wetnessFilter, rangeAdvFilter, textureFilter, activeProfile } = get()
    const filters: BoardFilters = {
      wetness:  wetnessFilter.length  ? wetnessFilter  : undefined,
      rangeAdv: rangeAdvFilter.length ? rangeAdvFilter : undefined,
      texture:  textureFilter.length  ? textureFilter  : undefined,
    }
    const boards = getFilteredBoards(filters)
    const profile = getProfile(activeProfile)
    return applyProfileToBoards(boards, profile)
  },

  setProfile: (p) => set({ activeProfile: p }),

  toggleWetnessFilter: (w) =>
    set((s) => ({ wetnessFilter: toggleInArray(s.wetnessFilter, w) })),

  toggleRangeAdvFilter: (r) =>
    set((s) => ({ rangeAdvFilter: toggleInArray(s.rangeAdvFilter, r) })),

  toggleTextureFilter: (t) =>
    set((s) => ({ textureFilter: toggleInArray(s.textureFilter, t) })),

  clearFilters: () =>
    set({ wetnessFilter: [], rangeAdvFilter: [], textureFilter: [] }),

  drawQuestion: () => {
    const { activeProfile, quiz } = get()
    const rawBoards = getAllBoards()
    const profile = getProfile(activeProfile)
    const boards = applyProfileToBoards(rawBoards, profile)
    const board = pickBoard(boards, quiz.weakSpots, quiz.weakSpotMode)

    set({
      quiz: {
        ...quiz,
        currentBoard: board,
        answered: false,
        isCorrect: null,
        userCbetFreq: '',
        userBetSize: '',
      },
    })
  },

  submitAnswer: () => {
    const { quiz } = get()
    if (!quiz.currentBoard || quiz.answered) return

    const targetFreq = quiz.currentBoard.cbetFreq
    const targetSize = String(quiz.currentBoard.betSize)
    const userFreq = parseInt(quiz.userCbetFreq, 10)

    const freqCorrect = !isNaN(userFreq) && Math.abs(userFreq - targetFreq) <= 10
    const sizeCorrect = quiz.userBetSize === targetSize
    const isCorrect = freqCorrect && sizeCorrect

    const boardId = String(quiz.currentBoard.id)
    const prevStats = quiz.weakSpots[boardId] ?? { correct: 0, total: 0 }
    const updatedWeakSpots = {
      ...quiz.weakSpots,
      [boardId]: {
        correct: prevStats.correct + (isCorrect ? 1 : 0),
        total: prevStats.total + 1,
      },
    }

    set({
      quiz: {
        ...quiz,
        answered: true,
        isCorrect,
        score: quiz.score + (isCorrect ? 1 : 0),
        totalAnswered: quiz.totalAnswered + 1,
        weakSpots: updatedWeakSpots,
      },
    })
  },

  setUserCbetFreq: (v) =>
    set((s) => ({ quiz: { ...s.quiz, userCbetFreq: v } })),

  setUserBetSize: (v) =>
    set((s) => ({ quiz: { ...s.quiz, userBetSize: v } })),

  toggleWeakSpotMode: () =>
    set((s) => ({ quiz: { ...s.quiz, weakSpotMode: !s.quiz.weakSpotMode } })),
}))
