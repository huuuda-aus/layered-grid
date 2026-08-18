'use strict';

// src/core/id.ts
function cellKey(row, col) {
  return `${row}:${col}`;
}
function generateCellId(layerId, row, col) {
  return `${layerId}:${row}:${col}`;
}
function resolveCellId(layerId, cell) {
  return cell.cellId ?? generateCellId(layerId, cell.row, cell.col);
}
function resolveCellVisualId(cell) {
  if (cell.visualId) {
    return cell.visualId;
  }
  if (cell.label) {
    return cell.label;
  }
  return `${String.fromCharCode(65 + cell.row)}${cell.col + 1}`;
}

// src/core/normalize.ts
function normalizeLayeredGridData(input, options = {}) {
  const strictVersion = options.strictVersion ?? true;
  const clampOutOfBoundsCells = options.clampOutOfBoundsCells ?? true;
  if (strictVersion && input.version !== 1) {
    throw new Error(`Unsupported LayeredGridData version: ${String(input.version)}`);
  }
  const gridWidth = Math.max(1, Math.floor(input.gridWidth));
  const gridHeight = Math.max(1, Math.floor(input.gridHeight));
  const maxLayers = typeof input.maxLayers === "number" ? Math.max(1, Math.floor(input.maxLayers)) : void 0;
  const layers = (maxLayers ? input.layers.slice(0, maxLayers) : input.layers).map(
    (layer) => normalizeLayer(layer, { gridWidth, gridHeight, clampOutOfBoundsCells })
  );
  return {
    ...input,
    version: 1,
    gridWidth,
    gridHeight,
    maxLayers,
    layers
  };
}
function createInitialControlledState(data, options = {}) {
  if (data.layers.length === 0) {
    throw new Error("LayeredGridData requires at least one layer");
  }
  const fallbackLayerId = data.layers[0]?.layerId;
  if (!fallbackLayerId) {
    throw new Error("First layer is missing layerId");
  }
  const requestedLayerId = options.activeLayerId;
  const activeLayerId = requestedLayerId && data.layers.some((layer) => layer.layerId === requestedLayerId) ? requestedLayerId : fallbackLayerId;
  const focusDepth = Math.max(0, data.layers.findIndex((layer) => layer.layerId === activeLayerId));
  return {
    activeLayerId,
    mode: options.mode ?? "normal",
    camera: {
      panX: options.camera?.panX ?? 0,
      panY: options.camera?.panY ?? 0,
      scale: options.camera?.scale ?? 1,
      focusDepth: options.camera?.focusDepth ?? focusDepth
    },
    selection: {
      trackedCell: null,
      selectedCell: null
    }
  };
}
function findCellInLayer(data, layerId, row, col) {
  const layer = data.layers.find((candidate) => candidate.layerId === layerId);
  if (!layer) {
    return null;
  }
  return layer.cells[cellKey(row, col)] ?? null;
}
function normalizeLayer(layer, args) {
  const rows = Math.max(1, Math.floor(layer.rows || args.gridHeight));
  const cols = Math.max(1, Math.floor(layer.cols || args.gridWidth));
  const normalizedCells = {};
  for (const cell of Object.values(layer.cells)) {
    const row = Math.floor(cell.row);
    const col = Math.floor(cell.col);
    if (args.clampOutOfBoundsCells) {
      if (row < 0 || col < 0 || row >= rows || col >= cols) {
        continue;
      }
    }
    const normalizedCell = {
      ...cell,
      row,
      col,
      cellId: resolveCellId(layer.layerId, { ...cell, row, col })
    };
    normalizedCells[cellKey(row, col)] = normalizedCell;
  }
  return {
    ...layer,
    rows,
    cols,
    cells: normalizedCells
  };
}

exports.cellKey = cellKey;
exports.createInitialControlledState = createInitialControlledState;
exports.findCellInLayer = findCellInLayer;
exports.generateCellId = generateCellId;
exports.normalizeLayeredGridData = normalizeLayeredGridData;
exports.resolveCellId = resolveCellId;
exports.resolveCellVisualId = resolveCellVisualId;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map