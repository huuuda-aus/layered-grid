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

// The same yOffset/zOffset/projectedScale/opacity math driving how a layer
// itself is drawn (including the live tween mid-transition), keyed by
// layerId. Lets a consumer project a point on *any* layer — not just the
// active one — into the same screen space renderCellOverlay's wrapper uses,
// so e.g. a marker anchored to a layer you aren't currently looking at can
// still track that layer's true on-screen position, smoothly, through a
// layer-switch transition instead of only snapping at either end of it.
export type LayerVisual = {
  yOffset: number;
  zOffset: number;
  projectedScale: number;
  opacity: number;
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

  // Fired whenever any layer's visual transform changes — including every
  // frame of the ~350ms layer-switch transition tween, not just at rest.
  // Only wire this up if you need to project a point on a non-active layer
  // into screen space outside of renderCellOverlay's own wrapper (e.g. an
  // external SVG overlay); it re-renders the consumer that often.
  onLayerVisualsChange?: (visuals: Record<string, LayerVisual>) => void;

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
