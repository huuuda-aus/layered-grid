export type LayeredGridVersion = 1;

export type LayeredGridMode = "normal" | "depth";

export type CellCoord = {
  row: number;
  col: number;
};

export type CellRef = CellCoord & {
  layerId: string;
  cellId: string;
};

export type CameraState = {
  panX: number;
  panY: number;
  scale: number;
  focusDepth: number;
};

export type CellAssetKind = "sprite" | "image" | "shape" | "text" | "custom";

export type CellAsset = {
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

export type LayeredGridCell = {
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

export type LayeredGridLayer = {
  layerId: string;
  layerLabel?: string;
  rows: number;
  cols: number;
  // Sparse map: key is `${row}:${col}`
  cells: Record<string, LayeredGridCell>;
  meta?: Record<string, unknown>;
};

export type LayeredGridData = {
  version: LayeredGridVersion;
  layers: LayeredGridLayer[];
  gridWidth: number;
  gridHeight: number;
  maxLayers?: number;
  meta?: Record<string, unknown>;
};

export type LayeredGridGeometry = {
  cellBaseSize: number;
  cellAspectRatio: number;
  depthLayerDistance: number;
  normalLayerDistance: number;
  depthRotationX: number;
};

export type LayeredGridZoomConfig = {
  minVisibleCells: number;
  maxVisibleCells: number;
  zoomStepFactor: number;
  panPaddingCells: number;
};

export type LayeredGridVisualConfig = {
  // Canvas styling.
  backgroundColor: string;
  gridStrokeColor: string;
  labelColor: string;
  selectedCellStrokeColor: string;

  // Per-layer border/label alpha model.
  activeLayerInkAlpha: number;
  belowLayerInkDecayFactor: number;
  aboveLayerInkAlpha: number;
  minimumInkAlpha: number;

  // Drawing attributes.
  strokeWidthAtScale1: number;
  labelFontPxAtScale1: number;
  labelFontFamily: string;
};

export type LayeredGridEffectsConfig = {
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

export type LayeredGridSelectionState = {
  trackedCell: CellRef | null;
  selectedCell: CellRef | null;
};

export type LayeredGridControlledState = {
  activeLayerId: string;
  mode: LayeredGridMode;
  camera: CameraState;
  selection: LayeredGridSelectionState;
};

export type LayeredGridIntentContext = {
  reason: "pointer" | "keyboard" | "programmatic" | "external-action";
  timestamp: number;
  revision?: number;
};

export type LayerChangeIntent = {
  nextLayerId: string;
  prevLayerId: string;
  context: LayeredGridIntentContext;
};

export type ModeChangeIntent = {
  nextMode: LayeredGridMode;
  prevMode: LayeredGridMode;
  context: LayeredGridIntentContext;
};

export type CellSelectIntent = {
  cell: CellRef;
  layerId: string;
  context: LayeredGridIntentContext;
};

export type CameraChangeIntent = {
  nextCamera: CameraState;
  prevCamera: CameraState;
  context: LayeredGridIntentContext;
};

export type DrawOverlayCell = {
  layerId: string;
  row: number;
  col: number;
  kind: string;
  color?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

export type DrawOverlayEvent = {
  type: "draw.overlay";
  revision?: number;
  timestamp: number;
  payload: {
    overlays: DrawOverlayCell[];
  };
};

export type ActionSelectEvent = {
  type: "action.select";
  revision?: number;
  timestamp: number;
  payload: {
    layerId: string;
    row: number;
    col: number;
  };
};

export type ActionGotoEvent = {
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

export type ActionLayerEvent = {
  type: "action.layer";
  revision?: number;
  timestamp: number;
  payload: {
    layerId: string;
  };
};

export type ActionModeEvent = {
  type: "action.mode";
  revision?: number;
  timestamp: number;
  payload: {
    mode: LayeredGridMode;
  };
};

export type ActionCameraEvent = {
  type: "action.camera";
  revision?: number;
  timestamp: number;
  payload: Partial<CameraState>;
};

export type LayeredGridExternalEvent =
  | DrawOverlayEvent
  | ActionSelectEvent
  | ActionGotoEvent
  | ActionLayerEvent
  | ActionModeEvent
  | ActionCameraEvent;
