import { L as LayeredGridCell, a as LayeredGridMode, C as CameraState, b as LayeredGridData, c as LayeredGridControlledState } from '../types-AbvTUJEF.js';
export { A as ActionCameraEvent, d as ActionGotoEvent, e as ActionLayerEvent, f as ActionModeEvent, g as ActionSelectEvent, h as CameraChangeIntent, i as CellAsset, j as CellAssetKind, k as CellCoord, l as CellRef, m as CellSelectIntent, D as DrawOverlayCell, n as DrawOverlayEvent, o as LayerChangeIntent, p as LayeredGridExternalEvent, q as LayeredGridGeometry, r as LayeredGridIntentContext, s as LayeredGridLayer, t as LayeredGridSelectionState, u as LayeredGridVersion, v as LayeredGridVisualConfig, w as LayeredGridZoomConfig, M as ModeChangeIntent } from '../types-AbvTUJEF.js';

declare function cellKey(row: number, col: number): string;
declare function generateCellId(layerId: string, row: number, col: number): string;
declare function resolveCellId(layerId: string, cell: Pick<LayeredGridCell, "cellId" | "row" | "col">): string;
declare function resolveCellVisualId(cell: Pick<LayeredGridCell, "visualId" | "label" | "row" | "col">): string;

type NormalizeGridOptions = {
    strictVersion?: boolean;
    clampOutOfBoundsCells?: boolean;
};
type InitialControlledStateOptions = {
    activeLayerId?: string;
    mode?: LayeredGridMode;
    camera?: Partial<CameraState>;
};
declare function normalizeLayeredGridData(input: LayeredGridData, options?: NormalizeGridOptions): LayeredGridData;
declare function createInitialControlledState(data: LayeredGridData, options?: InitialControlledStateOptions): LayeredGridControlledState;
declare function findCellInLayer(data: LayeredGridData, layerId: string, row: number, col: number): LayeredGridCell | null;

export { CameraState, type InitialControlledStateOptions, LayeredGridCell, LayeredGridControlledState, LayeredGridData, LayeredGridMode, type NormalizeGridOptions, cellKey, createInitialControlledState, findCellInLayer, generateCellId, normalizeLayeredGridData, resolveCellId, resolveCellVisualId };
