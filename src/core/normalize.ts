import { cellKey, resolveCellId } from "./id";
import type {
  CameraState,
  LayeredGridCell,
  LayeredGridControlledState,
  LayeredGridData,
  LayeredGridLayer,
  LayeredGridMode,
} from "./types";

export type NormalizeGridOptions = {
  strictVersion?: boolean;
  clampOutOfBoundsCells?: boolean;
};

export type InitialControlledStateOptions = {
  activeLayerId?: string;
  mode?: LayeredGridMode;
  camera?: Partial<CameraState>;
};

export function normalizeLayeredGridData(
  input: LayeredGridData,
  options: NormalizeGridOptions = {},
): LayeredGridData {
  const strictVersion = options.strictVersion ?? true;
  const clampOutOfBoundsCells = options.clampOutOfBoundsCells ?? true;

  if (strictVersion && input.version !== 1) {
    throw new Error(`Unsupported LayeredGridData version: ${String(input.version)}`);
  }

  const gridWidth = Math.max(1, Math.floor(input.gridWidth));
  const gridHeight = Math.max(1, Math.floor(input.gridHeight));
  const maxLayers = typeof input.maxLayers === "number" ? Math.max(1, Math.floor(input.maxLayers)) : undefined;

  const layers = (maxLayers ? input.layers.slice(0, maxLayers) : input.layers).map((layer) =>
    normalizeLayer(layer, { gridWidth, gridHeight, clampOutOfBoundsCells }),
  );

  return {
    ...input,
    version: 1,
    gridWidth,
    gridHeight,
    maxLayers,
    layers,
  };
}

export function createInitialControlledState(
  data: LayeredGridData,
  options: InitialControlledStateOptions = {},
): LayeredGridControlledState {
  if (data.layers.length === 0) {
    throw new Error("LayeredGridData requires at least one layer");
  }

  const fallbackLayerId = data.layers[0]?.layerId;
  if (!fallbackLayerId) {
    throw new Error("First layer is missing layerId");
  }

  const requestedLayerId = options.activeLayerId;
  const activeLayerId =
    requestedLayerId && data.layers.some((layer) => layer.layerId === requestedLayerId)
      ? requestedLayerId
      : fallbackLayerId;

  const focusDepth = Math.max(0, data.layers.findIndex((layer) => layer.layerId === activeLayerId));

  return {
    activeLayerId,
    mode: options.mode ?? "normal",
    camera: {
      panX: options.camera?.panX ?? 0,
      panY: options.camera?.panY ?? 0,
      scale: options.camera?.scale ?? 1,
      focusDepth: options.camera?.focusDepth ?? focusDepth,
    },
    selection: {
      trackedCell: null,
      selectedCell: null,
    },
  };
}

export function findCellInLayer(
  data: LayeredGridData,
  layerId: string,
  row: number,
  col: number,
): LayeredGridCell | null {
  const layer = data.layers.find((candidate) => candidate.layerId === layerId);
  if (!layer) {
    return null;
  }

  return layer.cells[cellKey(row, col)] ?? null;
}

function normalizeLayer(
  layer: LayeredGridLayer,
  args: {
    gridWidth: number;
    gridHeight: number;
    clampOutOfBoundsCells: boolean;
  },
): LayeredGridLayer {
  const rows = Math.max(1, Math.floor(layer.rows || args.gridHeight));
  const cols = Math.max(1, Math.floor(layer.cols || args.gridWidth));

  const normalizedCells: Record<string, LayeredGridCell> = {};

  for (const cell of Object.values(layer.cells)) {
    const row = Math.floor(cell.row);
    const col = Math.floor(cell.col);

    if (args.clampOutOfBoundsCells) {
      if (row < 0 || col < 0 || row >= rows || col >= cols) {
        continue;
      }
    }

    const normalizedCell: LayeredGridCell = {
      ...cell,
      row,
      col,
      cellId: resolveCellId(layer.layerId, { ...cell, row, col }),
    };

    normalizedCells[cellKey(row, col)] = normalizedCell;
  }

  return {
    ...layer,
    rows,
    cols,
    cells: normalizedCells,
  };
}
