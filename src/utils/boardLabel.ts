import type { Board } from '../data/boards'

/**
 * Returns a human-readable label for a board based on its
 * wetness and range advantage metadata.
 * Example: "ドライ / IP有利"
 */
export function getBoardLabel(board: Board): string {
  return `${board.wetness} / ${board.rangeAdv}`
}
