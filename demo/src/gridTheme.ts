import type { LayeredGridVisualConfig } from "../../src/core";

export const GRID_VISUAL_CONFIG: Partial<LayeredGridVisualConfig> = {
  backgroundColor: "#1f1f1f",
  gridStrokeColor: "#ffffff",
  labelColor: "#ffffff",
  selectedCellStrokeColor: "#ffd400",
  activeLayerInkAlpha: 0.2,
  belowLayerInkDecayFactor: 0.5,
  aboveLayerInkAlpha: 0.2,
  minimumInkAlpha: 0.01,
  strokeWidthAtScale1: 1,
  labelFontPxAtScale1: 12,
  labelFontFamily: "IBM Plex Sans, sans-serif",
};
