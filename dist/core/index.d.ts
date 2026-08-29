import { L as LayeredGridCell, a as LayeredGridMode, C as CameraState, b as LayeredGridData, c as LayeredGridControlledState, d as LayeredGridEffectsConfig, e as LayeredGridVisualConfig } from '../types-BZ-lL9W2.js';
export { A as ActionCameraEvent, f as ActionGotoEvent, g as ActionLayerEvent, h as ActionModeEvent, i as ActionSelectEvent, j as CameraChangeIntent, k as CellAsset, l as CellAssetKind, m as CellCoord, n as CellRef, o as CellSelectIntent, D as DrawOverlayCell, p as DrawOverlayEvent, q as LayerChangeIntent, r as LayeredGridExternalEvent, s as LayeredGridGeometry, t as LayeredGridIntentContext, u as LayeredGridLayer, v as LayeredGridSelectionState, w as LayeredGridVersion, x as LayeredGridZoomConfig, M as ModeChangeIntent } from '../types-BZ-lL9W2.js';

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

declare const DEFAULT_LAYERED_GRID_VISUAL_CONFIG: LayeredGridVisualConfig;
declare const DEFAULT_LAYERED_GRID_EFFECTS_CONFIG: LayeredGridEffectsConfig;
declare function resolveLayeredGridVisualConfig(visual?: Partial<LayeredGridVisualConfig>): LayeredGridVisualConfig;
declare function resolveLayeredGridEffectsConfig(effects?: Partial<LayeredGridEffectsConfig>): LayeredGridEffectsConfig;

export { CameraState, DEFAULT_LAYERED_GRID_EFFECTS_CONFIG, DEFAULT_LAYERED_GRID_VISUAL_CONFIG, type InitialControlledStateOptions, LayeredGridCell, LayeredGridControlledState, LayeredGridData, LayeredGridEffectsConfig, LayeredGridMode, LayeredGridVisualConfig, type NormalizeGridOptions, cellKey, createInitialControlledState, findCellInLayer, generateCellId, normalizeLayeredGridData, resolveCellId, resolveCellVisualId, resolveLayeredGridEffectsConfig, resolveLayeredGridVisualConfig };
