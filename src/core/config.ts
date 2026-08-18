import type {
  LayeredGridEffectsConfig,
  LayeredGridVisualConfig,
} from "./types";

export const DEFAULT_LAYERED_GRID_VISUAL_CONFIG: LayeredGridVisualConfig = {
  backgroundColor: "#262626",
  gridStrokeColor: "#ffffff",
  labelColor: "#ffffff",
  selectedCellStrokeColor: "#ffd400",
  activeLayerInkAlpha: 0.2,
  belowLayerInkDecayFactor: 0.5,
  aboveLayerInkAlpha: 0.2,
  minimumInkAlpha: 0.01,
  strokeWidthAtScale1: 1,
  labelFontPxAtScale1: 12,
  labelFontFamily: "sans-serif",
};

export const DEFAULT_LAYERED_GRID_EFFECTS_CONFIG: LayeredGridEffectsConfig = {
  deeperLayerOpacityFalloff: 0.35,
  previousLayerOpacity: 0.1,
  farLayerVisibilityCutoff: 0.02,
  normalModeLayerZStep: 480,
  cameraPerspective: 1100,
  transitionDurationMs: 350,
  transitionEpsilon: 0.001,
  transitionFocusLerp: 0.2,
  transitionModeLerp: 0.18,
};

export function resolveLayeredGridVisualConfig(
  visual?: Partial<LayeredGridVisualConfig>,
): LayeredGridVisualConfig {
  return {
    ...DEFAULT_LAYERED_GRID_VISUAL_CONFIG,
    ...visual,
  };
}

export function resolveLayeredGridEffectsConfig(
  effects?: Partial<LayeredGridEffectsConfig>,
): LayeredGridEffectsConfig {
  return {
    ...DEFAULT_LAYERED_GRID_EFFECTS_CONFIG,
    ...effects,
  };
}
