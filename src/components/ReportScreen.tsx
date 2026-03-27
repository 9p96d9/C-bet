import { useAppStore } from '../store'
import { ProfileSwitcher } from './ProfileSwitcher'
import { BoardCard } from './BoardCard'
import {
  WETNESS_VALUES,
  RANGE_ADV_VALUES,
  TEXTURE_VALUES,
} from '../data/boards'
import type { Wetness, RangeAdv, Texture } from '../data/boards'

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

export function ReportScreen() {
  const activeProfile    = useAppStore((s) => s.activeProfile)
  const wetnessFilter    = useAppStore((s) => s.wetnessFilter)
  const rangeAdvFilter   = useAppStore((s) => s.rangeAdvFilter)
  const textureFilter    = useAppStore((s) => s.textureFilter)
  const toggleWetness    = useAppStore((s) => s.toggleWetnessFilter)
  const toggleRangeAdv   = useAppStore((s) => s.toggleRangeAdvFilter)
  const toggleTexture    = useAppStore((s) => s.toggleTextureFilter)
  const clearFilters     = useAppStore((s) => s.clearFilters)
  const getDisplayBoards = useAppStore((s) => s.getDisplayBoards)

  const displayBoards  = getDisplayBoards()
  const hasActiveFilter =
    wetnessFilter.length > 0 || rangeAdvFilter.length > 0 || textureFilter.length > 0

  return (
    <div className="space-y-4">
      {/* Profile switcher */}
      <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm text-gray-400 font-medium">プロファイル:</span>
          <ProfileSwitcher />
        </div>
        {activeProfile !== 'GTO' && (
          <p className="text-xs text-yellow-400">
            ⚡ エクスプロイト調整適用中 — 数値はGTOベースラインから補正されています
          </p>
        )}
      </div>

      {/* Filter panel */}
      <div
        className="bg-gray-800 rounded-xl p-4 border border-gray-700 space-y-3"
        data-testid="filter-panel"
      >
        {/* Wetness */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 w-20 shrink-0">ウェット度</span>
          {WETNESS_VALUES.map((w) => (
            <FilterChip
              key={w}
              label={w}
              active={wetnessFilter.includes(w as Wetness)}
              onClick={() => toggleWetness(w as Wetness)}
            />
          ))}
        </div>

        {/* Range advantage */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 w-20 shrink-0">レンジ有利</span>
          {RANGE_ADV_VALUES.map((r) => (
            <FilterChip
              key={r}
              label={r}
              active={rangeAdvFilter.includes(r as RangeAdv)}
              onClick={() => toggleRangeAdv(r as RangeAdv)}
            />
          ))}
        </div>

        {/* Texture */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500 w-20 shrink-0">テクスチャ</span>
          {TEXTURE_VALUES.map((t) => (
            <FilterChip
              key={t}
              label={t}
              active={textureFilter.includes(t as Texture)}
              onClick={() => toggleTexture(t as Texture)}
            />
          ))}
        </div>

        {/* Clear button */}
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-white underline"
            data-testid="clear-filters-btn"
          >
            フィルターをリセット
          </button>
        )}
      </div>

      {/* Board count */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">C-bet レポート</h2>
        <span className="text-sm text-gray-400" data-testid="board-count">
          {displayBoards.length} / 54 ボード
        </span>
      </div>

      {/* Board grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
        data-testid="board-grid"
      >
        {displayBoards.map((board, i) => (
          <BoardCard key={board.id} board={board} index={i} />
        ))}
      </div>

      {displayBoards.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          フィルター条件に一致するボードがありません
        </div>
      )}
    </div>
  )
}
