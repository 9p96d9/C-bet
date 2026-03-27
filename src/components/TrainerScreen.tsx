import { useEffect } from 'react'
import { useAppStore } from '../store'
import { BoardCards } from './Card'
import { getBoardLabel } from '../utils/boardLabel'

const BET_SIZES = [25, 33, 75, 150] as const

export function TrainerScreen() {
  const quiz             = useAppStore((s) => s.quiz)
  const drawQuestion     = useAppStore((s) => s.drawQuestion)
  const submitAnswer     = useAppStore((s) => s.submitAnswer)
  const setUserCbetFreq  = useAppStore((s) => s.setUserCbetFreq)
  const setUserBetSize   = useAppStore((s) => s.setUserBetSize)
  const toggleWeakSpotMode = useAppStore((s) => s.toggleWeakSpotMode)

  // Draw initial question on mount
  useEffect(() => {
    if (!quiz.currentBoard) {
      drawQuestion()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const accuracy =
    quiz.totalAnswered > 0
      ? Math.round((quiz.score / quiz.totalAnswered) * 100)
      : 0

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Header / Score */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">C-bet トレーナー</h2>
          <p className="text-sm text-gray-400">GTO値を入力して回答しよう（全54ボードから出題）</p>
        </div>
        <div className="text-right" data-testid="score-display">
          <div className="text-2xl font-bold text-blue-400">
            {quiz.score}/{quiz.totalAnswered}
          </div>
          <div className="text-xs text-gray-400">正解率 {accuracy}%</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Weak spot mode toggle */}
        <button
          onClick={toggleWeakSpotMode}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
            quiz.weakSpotMode
              ? 'bg-orange-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          data-testid="weak-spot-toggle"
        >
          {quiz.weakSpotMode ? '🎯 苦手モード ON' : '苦手スポットモード'}
        </button>
      </div>

      {/* Quiz card */}
      {quiz.currentBoard ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          {/* Board display */}
          <div className="bg-gray-900 p-6 flex flex-col items-center gap-3">
            <div className="text-xs text-gray-500 uppercase tracking-wide">
              フロップ
            </div>
            <div className="flex items-center gap-2">
              <BoardCards board={quiz.currentBoard.cards} />
            </div>
            <div className="text-xs text-gray-400">
              {getBoardLabel(quiz.currentBoard)}
            </div>
          </div>

          {/* Input area */}
          <div className="p-4 space-y-4">
            {/* C-bet frequency input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                C-bet 頻度 (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={quiz.userCbetFreq}
                onChange={(e) => setUserCbetFreq(e.target.value)}
                disabled={quiz.answered}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                placeholder="0〜100 を入力"
                data-testid="cbet-freq-input"
              />
            </div>

            {/* Bet size selector */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                推奨ベットサイズ
              </label>
              <div className="grid grid-cols-4 gap-2" data-testid="bet-size-selector">
                {BET_SIZES.map((size) => (
                  <button
                    key={size}
                    onClick={() => setUserBetSize(String(size))}
                    disabled={quiz.answered}
                    className={`py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 ${
                      quiz.userBetSize === String(size)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    data-testid={`size-btn-${size}`}
                  >
                    {size}%
                  </button>
                ))}
              </div>
            </div>

            {/* Submit / Next buttons */}
            {!quiz.answered ? (
              <button
                onClick={submitAnswer}
                disabled={!quiz.userCbetFreq || !quiz.userBetSize}
                className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                data-testid="submit-btn"
              >
                判定する
              </button>
            ) : (
              <button
                onClick={drawQuestion}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-all"
                data-testid="next-btn"
              >
                次の問題へ →
              </button>
            )}
          </div>

          {/* Feedback */}
          {quiz.answered && (
            <div
              className={`p-4 border-t ${
                quiz.isCorrect
                  ? 'bg-green-900/30 border-green-700'
                  : 'bg-red-900/30 border-red-700'
              }`}
              data-testid="feedback"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{quiz.isCorrect ? '✅' : '❌'}</span>
                <span
                  className={`font-bold text-lg ${quiz.isCorrect ? 'text-green-400' : 'text-red-400'}`}
                >
                  {quiz.isCorrect ? '正解！' : '不正解'}
                </span>
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <p>
                  正解 C-bet頻度:{' '}
                  <span className="text-white font-semibold">
                    {quiz.currentBoard.cbetFreq}%
                  </span>
                  {' '}（±10%以内で正解）
                </p>
                <p>
                  正解サイズ:{' '}
                  <span className="text-white font-semibold">
                    {quiz.currentBoard.betSize}%
                  </span>
                </p>
                <p>
                  あなたの回答: {quiz.userCbetFreq}% / {quiz.userBetSize ? `${quiz.userBetSize}%` : '未選択'}
                </p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl p-8 text-center text-gray-400">
          Loading...
        </div>
      )}
    </div>
  )
}
