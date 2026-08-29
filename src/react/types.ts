import type {
  CameraChangeIntent,
  CellRef,
  CellSelectIntent,
  LayerChangeIntent,
  LayeredGridControlledState,
  LayeredGridData,
  LayeredGridEffectsConfig,
  LayeredGridExternalEvent,
  LayeredGridGeometry,
  LayeredGridVisualConfig,
  LayeredGridZoomConfig,
  ModeChangeIntent,
} from "../core/types";
import type React from "react";

export type LayeredGridExternalEventSource = {
  subscribe: (listener: (event: LayeredGridExternalEvent) => void) => () => void;
};

export type CellRenderParams = {
  layerId: string;
  row: number;
  col: number;
  cellId: string;
  visualId: string;
  isActiveLayer: boolean;
  isSelected: boolean;
  isTracked: boolean;
  isHovered: boolean;
};

export type LayeredGridRendererProps = {
  data: LayeredGridData;
  state: LayeredGridControlledState;
  geometry?: Partial<LayeredGridGeometry>;
  zoom?: Partial<LayeredGridZoomConfig>;
  visual?: Partial<LayeredGridVisualConfig>;
  effects?: Partial<LayeredGridEffectsConfig>;
  // Recommended for realtime systems.
  externalEventSource?: LayeredGridExternalEventSource;
  // Optional replay/testing path.
  externalEvents?: LayeredGridExternalEvent[];

  onLayerChangeIntent: (intent: LayerChangeIntent) => void;
  onModeChangeIntent: (intent: ModeChangeIntent) => void;
  onCellSelectIntent: (intent: CellSelectIntent) => void;
  onCameraChangeIntent: (intent: CameraChangeIntent) => void;

  // When true, disables every camera-moving interaction (wheel zoom, drag
  // pan, arrow-key pan, click-to-recenter/zoom, and the auto-recenter that
  // normally follows selection changes). Cell selection and layer switching
  // (tabs, PageUp/PageDown) still work — only the camera itself is frozen at
  // whatever `state.camera` holds. Intended for a fixed, fully-visible board
  // view where there is nothing to pan or zoom to.
  lockCamera?: boolean;

  renderCellOverlay?: (params: CellRenderParams) => React.ReactNode;
  renderLayerOverlay?: (layerId: string) => React.ReactNode;
  renderToolbarExtras?: (state: LayeredGridControlledState) => React.ReactNode;

  className?: string;
  style?: React.CSSProperties;
};

export type GoToCellRequest = {
  layerId: string;
  row: number;
  col: number;
  select?: boolean;
};

export type LayeredGridHandle = {
  requestGoToCell: (request: GoToCellRequest) => void;
  requestBackToTrackedCell: () => void;
  requestToggleDepthMode: () => void;
  requestSetLayer: (layerId: string) => void;
  requestCenterOnCell: (cell: CellRef) => void;
};
