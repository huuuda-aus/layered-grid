type LayeredGridVersion = 1;
type LayeredGridMode = "normal" | "depth";
type CellCoord = {
    row: number;
    col: number;
};
type CellRef = CellCoord & {
    layerId: string;
    cellId: string;
};
type CameraState = {
    panX: number;
    panY: number;
    scale: number;
    focusDepth: number;
};
type CellAssetKind = "sprite" | "image" | "shape" | "text" | "custom";
type CellAsset = {
    kind: CellAssetKind;
    key: string;
    src?: string;
    atlasKey?: string;
    frame?: string;
    tint?: string;
    zIndex?: number;
    opacity?: number;
    meta?: Record<string, unknown>;
};
type LayeredGridCell = {
    row: number;
    col: number;
    walkable?: boolean;
    blocked?: boolean;
    cellId?: string;
    visualId?: string;
    label?: string;
    assets?: CellAsset[];
    data?: Record<string, unknown>;
};
type LayeredGridLayer = {
    layerId: string;
    layerLabel?: string;
    rows: number;
    cols: number;
    cells: Record<string, LayeredGridCell>;
    meta?: Record<string, unknown>;
};
type LayeredGridData = {
    version: LayeredGridVersion;
    layers: LayeredGridLayer[];
    gridWidth: number;
    gridHeight: number;
    maxLayers?: number;
    meta?: Record<string, unknown>;
};
type LayeredGridGeometry = {
    cellBaseSize: number;
    cellAspectRatio: number;
    depthLayerDistance: number;
    normalLayerDistance: number;
    depthRotationX: number;
};
type LayeredGridZoomConfig = {
    minVisibleCells: number;
    maxVisibleCells: number;
    zoomStepFactor: number;
    panPaddingCells: number;
};
type LayeredGridVisualConfig = {
    backgroundColor: string;
    globalTintColor: string;
    gridStrokeColor: string;
    labelColor: string;
    selectedCellStrokeColor: string;
    showCellLabels: boolean;
    hoverFillColor: string;
    hoverFillOpacity: number;
    activeLayerInkAlpha: number;
    belowLayerInkDecayFactor: number;
    aboveLayerInkAlpha: number;
    minimumInkAlpha: number;
    strokeWidthAtScale1: number;
    labelFontPxAtScale1: number;
    labelFontFamily: string;
};
type LayeredGridEffectsConfig = {
    deeperLayerOpacityFalloff: number;
    previousLayerOpacity: number;
    farLayerVisibilityCutoff: number;
    normalModeLayerZStep: number;
    cameraPerspective: number;
    transitionDurationMs: number;
    transitionEpsilon: number;
    transitionFocusLerp: number;
    transitionModeLerp: number;
};
type LayeredGridSelectionState = {
    trackedCell: CellRef | null;
    selectedCell: CellRef | null;
};
type LayeredGridControlledState = {
    activeLayerId: string;
    mode: LayeredGridMode;
    camera: CameraState;
    selection: LayeredGridSelectionState;
};
type LayeredGridIntentContext = {
    reason: "pointer" | "keyboard" | "programmatic" | "external-action";
    timestamp: number;
    revision?: number;
};
type LayerChangeIntent = {
    nextLayerId: string;
    prevLayerId: string;
    context: LayeredGridIntentContext;
};
type ModeChangeIntent = {
    nextMode: LayeredGridMode;
    prevMode: LayeredGridMode;
    context: LayeredGridIntentContext;
};
type CellSelectIntent = {
    cell: CellRef;
    layerId: string;
    context: LayeredGridIntentContext;
};
type CameraChangeIntent = {
    nextCamera: CameraState;
    prevCamera: CameraState;
    context: LayeredGridIntentContext;
};
type DrawOverlayCell = {
    layerId: string;
    row: number;
    col: number;
    kind: string;
    color?: string;
    text?: string;
    meta?: Record<string, unknown>;
};
type DrawOverlayEvent = {
    type: "draw.overlay";
    revision?: number;
    timestamp: number;
    payload: {
        overlays: DrawOverlayCell[];
    };
};
type ActionSelectEvent = {
    type: "action.select";
    revision?: number;
    timestamp: number;
    payload: {
        layerId: string;
        row: number;
        col: number;
    };
};
type ActionGotoEvent = {
    type: "action.goto";
    revision?: number;
    timestamp: number;
    payload: {
        layerId: string;
        row: number;
        col: number;
        select?: boolean;
    };
};
type ActionLayerEvent = {
    type: "action.layer";
    revision?: number;
    timestamp: number;
    payload: {
        layerId: string;
    };
};
type ActionModeEvent = {
    type: "action.mode";
    revision?: number;
    timestamp: number;
    payload: {
        mode: LayeredGridMode;
    };
};
type ActionCameraEvent = {
    type: "action.camera";
    revision?: number;
    timestamp: number;
    payload: Partial<CameraState>;
};
type LayeredGridExternalEvent = DrawOverlayEvent | ActionSelectEvent | ActionGotoEvent | ActionLayerEvent | ActionModeEvent | ActionCameraEvent;

export type { ActionCameraEvent as A, CameraState as C, DrawOverlayCell as D, LayeredGridCell as L, ModeChangeIntent as M, LayeredGridMode as a, LayeredGridData as b, LayeredGridControlledState as c, LayeredGridEffectsConfig as d, LayeredGridVisualConfig as e, ActionGotoEvent as f, ActionLayerEvent as g, ActionModeEvent as h, ActionSelectEvent as i, CameraChangeIntent as j, CellAsset as k, CellAssetKind as l, CellCoord as m, CellRef as n, CellSelectIntent as o, DrawOverlayEvent as p, LayerChangeIntent as q, LayeredGridExternalEvent as r, LayeredGridGeometry as s, LayeredGridIntentContext as t, LayeredGridLayer as u, LayeredGridSelectionState as v, LayeredGridVersion as w, LayeredGridZoomConfig as x };
