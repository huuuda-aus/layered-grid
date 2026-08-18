import type { LayeredGridEffectsConfig } from "../../src/core";

export const GRID_EFFECTS_CONFIG: Partial<LayeredGridEffectsConfig> = {
  deeperLayerOpacityFalloff: 0.35,
  previousLayerOpacity: 0.1,
  farLayerVisibilityCutoff: 0.02,
  normalModeLayerZStep: 960,
  cameraPerspective: 1100,
  transitionDurationMs: 350,
  transitionEpsilon: 0.001,
  transitionFocusLerp: 0.2,
  transitionModeLerp: 0.18,
};
