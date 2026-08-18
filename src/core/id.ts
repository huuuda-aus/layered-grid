import type { LayeredGridCell } from "./types";

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function generateCellId(layerId: string, row: number, col: number): string {
  return `${layerId}:${row}:${col}`;
}

export function resolveCellId(layerId: string, cell: Pick<LayeredGridCell, "cellId" | "row" | "col">): string {
  return cell.cellId ?? generateCellId(layerId, cell.row, cell.col);
}

export function resolveCellVisualId(
  cell: Pick<LayeredGridCell, "visualId" | "label" | "row" | "col">,
): string {
  if (cell.visualId) {
    return cell.visualId;
  }

  if (cell.label) {
    return cell.label;
  }

  return `${String.fromCharCode(65 + cell.row)}${cell.col + 1}`;
}
