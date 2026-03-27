import type { Board } from '../data/boards'
import { FrequencyGauge } from './FrequencyGauge'
import { BoardCards } from './Card'
import { getBoardLabel } from '../utils/boardLabel'

interface BoardCardProps {
  board: Board
  index: number
}

const BET_SIZE_COLORS: Record<number, string> = {
  25:  'bg-green-900 text-green-300',
  33:  'bg-blue-900 text-blue-300',
  75:  'bg-yellow-900 text-yellow-300',
  150: 'bg-red-900 text-red-300',
}

export function BoardCard({ board, index }: BoardCardProps) {
  const label = getBoardLabel(board)

  return (
    <div
      className="bg-gray-800 rounded-xl p-3 border border-gray-700 hover:border-gray-600 transition-colors"
      data-testid="board-card"
    >
      {/* Top row: index + cards + subtitle */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500 w-5 shrink-0">{index + 1}</span>
        <BoardCards board={board.cards} />
        <span className="text-xs text-gray-400 ml-1 truncate">{label}</span>
      </div>

      {/* Bottom row: gauge + size badge */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <FrequencyGauge cbetFreq={board.cbetFreq} checkFreq={board.checkFreq} />
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${BET_SIZE_COLORS[board.betSize] ?? 'bg-gray-700 text-gray-300'}`}
        >
          {board.betSize}%
        </span>
      </div>
    </div>
  )
}
