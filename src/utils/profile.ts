import type { Board } from '../data/boards'

export type ProfileName = 'GTO' | 'Fish' | 'CallingStation' | 'Maniac' | 'Nit'

export interface Profile {
  name: ProfileName
  label: string
  description: string
  // Adjustments applied to GTO frequencies (percentage points)
  foldAdj: number
  checkAdj: number
  callAdj: number
  betAdj: number
}

export const PROFILES: Profile[] = [
  {
    name: 'GTO',
    label: 'GTO',
    description: '標準GTO戦略',
    foldAdj: 0,
    checkAdj: 0,
    callAdj: 0,
    betAdj: 0,
  },
  {
    name: 'Fish',
    label: 'Fish',
    description: 'Check -6% / Call +4%',
    foldAdj: 0,
    checkAdj: -6,
    callAdj: +4,
    betAdj: 0,
  },
  {
    name: 'CallingStation',
    label: 'Calling Station',
    description: 'Check +2% / Call +6% / Bet -3%',
    foldAdj: 0,
    checkAdj: +2,
    callAdj: +6,
    betAdj: -3,
  },
  {
    name: 'Maniac',
    label: 'Maniac',
    description: 'Fold -6% / Call +3% / Bet +6%',
    foldAdj: -6,
    checkAdj: 0,
    callAdj: +3,
    betAdj: +6,
  },
  {
    name: 'Nit',
    label: 'Nit',
    description: 'Fold +7% / Check +2% / Bet -3%',
    foldAdj: +7,
    checkAdj: +2,
    callAdj: 0,
    betAdj: -3,
  },
]

export function getProfile(name: ProfileName): Profile {
  return PROFILES.find((p) => p.name === name) ?? PROFILES[0]
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, Math.round(val)))
}

export function applyProfile(board: Board, profile: Profile): Board {
  if (profile.name === 'GTO') return board

  // betAdj affects cbetFreq (C-bet is a form of betting)
  const rawCbet = board.cbetFreq + profile.betAdj + profile.checkAdj * -1
  const cbetFreq = clamp(rawCbet)
  const checkFreq = 100 - cbetFreq

  return {
    ...board,
    cbetFreq,
    checkFreq,
  }
}

export function applyProfileToBoards(
  boards: Board[],
  profile: Profile,
): Board[] {
  return boards.map((b) => applyProfile(b, profile))
}
