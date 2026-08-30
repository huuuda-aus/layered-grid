import { forwardRef, useRef, useState, useMemo, useCallback, useEffect, useImperativeHandle } from 'react';
import { jsxs, jsx } from 'react/jsx-runtime';

// src/react/LayeredGrid.tsx

// src/core/config.ts
var DEFAULT_LAYERED_GRID_VISUAL_CONFIG = {
  backgroundColor: "#262626",
  globalTintColor: "transparent",
  gridStrokeColor: "#ffffff",
  labelColor: "#ffffff",
  selectedCellStrokeColor: "#ffd400",
  activeLayerInkAlpha: 0.2,
  belowLayerInkDecayFactor: 0.5,
  aboveLayerInkAlpha: 0.2,
  minimumInkAlpha: 0.01,
  strokeWidthAtScale1: 1,
  labelFontPxAtScale1: 12,
  labelFontFamily: "sans-serif"
};
var DEFAULT_LAYERED_GRID_EFFECTS_CONFIG = {
  deeperLayerOpacityFalloff: 0.35,
  previousLayerOpacity: 0.1,
  farLayerVisibilityCutoff: 0.02,
  normalModeLayerZStep: 480,
  cameraPerspective: 1100,
  transitionDurationMs: 350,
  transitionEpsilon: 1e-3,
  transitionFocusLerp: 0.2,
  transitionModeLerp: 0.18
};
function resolveLayeredGridVisualConfig(visual) {
  return {
    ...DEFAULT_LAYERED_GRID_VISUAL_CONFIG,
    ...visual
  };
}
function resolveLayeredGridEffectsConfig(effects) {
  return {
    ...DEFAULT_LAYERED_GRID_EFFECTS_CONFIG,
    ...effects
  };
}

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
var DEFAULT_GEOMETRY = {
  cellBaseSize: 126,
  cellAspectRatio: 1,
  depthLayerDistance: 100,
  normalLayerDistance: 8,
  depthRotationX: 80
};
var DEFAULT_ZOOM = {
  minVisibleCells: 2,
  maxVisibleCells: 6,
  zoomStepFactor: 1.14,
  panPaddingCells: 2
};
var DRAG_THRESHOLD_PX = 3;
var DOUBLE_CLICK_MS = 350;
var DOUBLE_CLICK_PX = 12;
var ARROW_PAN_DURATION_MS = 200;
var RECENTER_MIN_DURATION_MS = 180;
var RECENTER_MAX_DURATION_MS = 300;
var RECENTER_END_SNAP_PROGRESS = 0.88;
function nowContext(reason) {
  return { reason, timestamp: Date.now() };
}
var LayeredGrid = forwardRef(
  function LayeredGrid2(props, ref) {
    const {
      data,
      state,
      geometry,
      zoom,
      visual,
      effects,
      className,
      style,
      externalEventSource,
      externalEvents,
      onLayerChangeIntent,
      onModeChangeIntent,
      onCellSelectIntent,
      onCameraChangeIntent,
      lockCamera = false,
      renderCellOverlay,
      renderLayerOverlay,
      renderToolbarExtras,
      onLayerVisualsChange
    } = props;
    const onCameraChangeIntentRef = useRef(onCameraChangeIntent);
    onCameraChangeIntentRef.current = onCameraChangeIntent;
    const onLayerVisualsChangeRef = useRef(onLayerVisualsChange);
    onLayerVisualsChangeRef.current = onLayerVisualsChange;
    const onLayerChangeIntentRef = useRef(onLayerChangeIntent);
    onLayerChangeIntentRef.current = onLayerChangeIntent;
    const onModeChangeIntentRef = useRef(onModeChangeIntent);
    onModeChangeIntentRef.current = onModeChangeIntent;
    const onCellSelectIntentRef = useRef(onCellSelectIntent);
    onCellSelectIntentRef.current = onCellSelectIntent;
    const viewportRef = useRef(null);
    const baseCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
    const [animatedView, setAnimatedView] = useState(() => ({
      focusDepth: Number.isFinite(state.camera.focusDepth) ? state.camera.focusDepth : 0,
      modeBlend: state.mode === "depth" ? 1 : 0
    }));
    const [hoveredCell, setHoveredCell] = useState(null);
    const lastPointerClientPosRef = useRef(null);
    const [isPointerInteractionActive, setIsPointerInteractionActive] = useState(false);
    const [isMomentumActive, setIsMomentumActive] = useState(false);
    const [cameraTweenFrame, setCameraTweenFrame] = useState(null);
    const panSessionRef = useRef(null);
    const lastPointerDownInfoRef = useRef(null);
    const processedExternalEventKeysRef = useRef(/* @__PURE__ */ new Set());
    const transitionFrameRef = useRef(null);
    const animatedViewRef = useRef(animatedView);
    const transitionFromRef = useRef(animatedView);
    const transitionStartTimeRef = useRef(null);
    const interactionCameraRef = useRef(state.camera);
    const committedCameraRef = useRef(state.camera);
    const pointerCameraFrameRef = useRef(null);
    const momentumFrameRef = useRef(null);
    const recenterCameraFrameRef = useRef(null);
    const recenterCameraStartTimeRef = useRef(null);
    const recenterCameraFromRef = useRef(state.camera);
    const recenterCameraToRef = useRef(state.camera);
    const recenterPendingCommitRef = useRef(null);
    const suppressSelectionRecenterKeyRef = useRef(null);
    const lastSelectionKeyRef = useRef(
      state.selection.selectedCell ? `${state.selection.selectedCell.layerId}:${state.selection.selectedCell.cellId}` : state.selection.trackedCell ? `${state.selection.trackedCell.layerId}:${state.selection.trackedCell.cellId}` : null
    );
    const queuedPointerCameraRef = useRef(null);
    const mergedGeometry = useMemo(() => ({
      ...DEFAULT_GEOMETRY,
      ...geometry
    }), [geometry]);
    const mergedZoom = useMemo(() => ({
      ...DEFAULT_ZOOM,
      ...zoom
    }), [zoom]);
    const mergedVisual = useMemo(() => resolveLayeredGridVisualConfig(visual), [visual]);
    const mergedEffects = useMemo(() => resolveLayeredGridEffectsConfig(effects), [effects]);
    const cellHeight = mergedGeometry.cellBaseSize;
    const cellWidth = mergedGeometry.cellBaseSize * mergedGeometry.cellAspectRatio;
    const minScale = useMemo(() => {
      const gridCols = Math.max(1, data.gridWidth);
      const fitWidth = viewportSize.width / (gridCols * cellWidth);
      return Math.max(0.05, fitWidth * (gridCols / Math.max(1, mergedZoom.maxVisibleCells)));
    }, [cellWidth, data.gridWidth, mergedZoom.maxVisibleCells, viewportSize.width]);
    const maxScale = useMemo(() => {
      const gridCols = Math.max(1, data.gridWidth);
      const fitWidth = viewportSize.width / (gridCols * cellWidth);
      return Math.max(minScale, fitWidth * (gridCols / Math.max(1, mergedZoom.minVisibleCells)));
    }, [cellWidth, data.gridWidth, mergedZoom.minVisibleCells, minScale, viewportSize.width]);
    const layerById = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      for (const layer of data.layers) {
        map.set(layer.layerId, layer);
      }
      return map;
    }, [data.layers]);
    const activeLayer = layerById.get(state.activeLayerId);
    const activeLayerIndex = useMemo(() => data.layers.findIndex((layer) => layer.layerId === state.activeLayerId), [
      data.layers,
      state.activeLayerId
    ]);
    const effectiveCamera = cameraTweenFrame ?? state.camera;
    const clampedScale = clamp(effectiveCamera.scale, minScale, maxScale);
    const displayCamera = useMemo(() => ({
      ...effectiveCamera,
      scale: clampedScale
    }), [clampedScale, effectiveCamera]);
    const targetFocusDepth = state.mode === "depth" ? Math.max(0, activeLayerIndex) : Number.isFinite(state.camera.focusDepth) ? state.camera.focusDepth : Math.max(0, activeLayerIndex);
    const targetModeBlend = state.mode === "depth" ? 1 : 0;
    const isTransitionActive = Math.abs(animatedView.focusDepth - targetFocusDepth) >= mergedEffects.transitionEpsilon || Math.abs(animatedView.modeBlend - targetModeBlend) >= mergedEffects.transitionEpsilon;
    const shouldDisableBlur = isPointerInteractionActive || isMomentumActive || isTransitionActive;
    const stopMomentum = useCallback(() => {
      if (momentumFrameRef.current !== null) {
        cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
      }
      setIsMomentumActive(false);
    }, []);
    const stopRecenteringAnimation = useCallback(() => {
      if (recenterCameraFrameRef.current !== null) {
        cancelAnimationFrame(recenterCameraFrameRef.current);
        recenterCameraFrameRef.current = null;
      }
      recenterCameraStartTimeRef.current = null;
      recenterPendingCommitRef.current = null;
      setCameraTweenFrame(null);
    }, []);
    function startMomentum(velocityX, velocityY) {
      stopMomentum();
      const minSpeed = 0.015;
      if (Math.hypot(velocityX, velocityY) < minSpeed) {
        return;
      }
      setIsMomentumActive(true);
      let currentVelocityX = velocityX;
      let currentVelocityY = velocityY;
      let lastTime = performance.now();
      const tick = (now) => {
        const dt = Math.max(1, now - lastTime);
        lastTime = now;
        const friction = Math.pow(0.92, dt / 16.67);
        const camera = interactionCameraRef.current;
        const nextCamera = {
          ...camera,
          panX: state.mode === "depth" ? camera.panX : camera.panX + currentVelocityX * dt,
          panY: camera.panY + currentVelocityY * dt
        };
        applyCameraIntent(nextCamera, "pointer");
        currentVelocityX *= friction;
        currentVelocityY *= friction;
        if (Math.hypot(currentVelocityX, currentVelocityY) < minSpeed) {
          momentumFrameRef.current = null;
          setIsMomentumActive(false);
          return;
        }
        momentumFrameRef.current = requestAnimationFrame(tick);
      };
      momentumFrameRef.current = requestAnimationFrame(tick);
    }
    useEffect(() => {
      animatedViewRef.current = animatedView;
    }, [animatedView]);
    useEffect(() => {
      interactionCameraRef.current = state.camera;
      committedCameraRef.current = state.camera;
      const pending = recenterPendingCommitRef.current;
      if (!pending) {
        return;
      }
      if (isCameraClose(state.camera, pending, mergedEffects.transitionEpsilon)) {
        recenterPendingCommitRef.current = null;
        setCameraTweenFrame(null);
      }
    }, [mergedEffects.transitionEpsilon, state.camera]);
    useEffect(() => {
      return () => {
        if (pointerCameraFrameRef.current !== null) {
          cancelAnimationFrame(pointerCameraFrameRef.current);
          pointerCameraFrameRef.current = null;
        }
        if (momentumFrameRef.current !== null) {
          cancelAnimationFrame(momentumFrameRef.current);
          momentumFrameRef.current = null;
        }
        if (recenterCameraFrameRef.current !== null) {
          cancelAnimationFrame(recenterCameraFrameRef.current);
          recenterCameraFrameRef.current = null;
        }
        recenterCameraStartTimeRef.current = null;
      };
    }, []);
    const depthStackHeight = useMemo(
      () => Math.max(0, data.layers.length - 1) * (mergedGeometry.depthLayerDistance + mergedGeometry.normalLayerDistance),
      [data.layers.length, mergedGeometry.depthLayerDistance, mergedGeometry.normalLayerDistance]
    );
    const overlayCells = useMemo(() => {
      if (!renderCellOverlay) {
        return [];
      }
      const cells = [];
      for (const layer of data.layers) {
        for (const cell of Object.values(layer.cells)) {
          const cellId = resolveCellId(layer.layerId, cell);
          cells.push({
            layerId: layer.layerId,
            row: cell.row,
            col: cell.col,
            cellId,
            visualId: resolveCellVisualId(cell),
            isActiveLayer: layer.layerId === state.activeLayerId,
            isSelected: state.selection.selectedCell?.layerId === layer.layerId && state.selection.selectedCell.cellId === cellId,
            isTracked: state.selection.trackedCell?.layerId === layer.layerId && state.selection.trackedCell.cellId === cellId,
            isHovered: hoveredCell?.layerId === layer.layerId && hoveredCell.cellId === cellId
          });
        }
      }
      return cells;
    }, [
      data.layers,
      state.activeLayerId,
      hoveredCell,
      state.selection.selectedCell,
      state.selection.trackedCell,
      renderCellOverlay
    ]);
    const activeLayerVisual = useMemo(() => {
      if (activeLayerIndex < 0) {
        return {
          yOffset: 0,
          zOffset: 0,
          projectedScale: 1,
          opacity: 1,
          blur: 0
        };
      }
      return resolveLayerVisual({
        layerIndex: activeLayerIndex,
        focusDepth: animatedView.focusDepth,
        modeBlend: animatedView.modeBlend,
        depthLayerDistance: mergedGeometry.depthLayerDistance,
        normalLayerDistance: mergedGeometry.normalLayerDistance,
        deeperLayerOpacityFalloff: mergedEffects.deeperLayerOpacityFalloff,
        previousLayerOpacity: mergedEffects.previousLayerOpacity,
        normalModeLayerZStep: mergedEffects.normalModeLayerZStep,
        cameraPerspective: mergedEffects.cameraPerspective
      });
    }, [
      activeLayerIndex,
      animatedView.focusDepth,
      animatedView.modeBlend,
      mergedEffects.cameraPerspective,
      mergedEffects.deeperLayerOpacityFalloff,
      mergedEffects.normalModeLayerZStep,
      mergedEffects.previousLayerOpacity,
      mergedGeometry.depthLayerDistance,
      mergedGeometry.normalLayerDistance
    ]);
    const layerVisualById = useMemo(() => {
      const map = /* @__PURE__ */ new Map();
      data.layers.forEach((layer, layerIndex) => {
        map.set(
          layer.layerId,
          resolveLayerVisual({
            layerIndex,
            focusDepth: animatedView.focusDepth,
            modeBlend: animatedView.modeBlend,
            depthLayerDistance: mergedGeometry.depthLayerDistance,
            normalLayerDistance: mergedGeometry.normalLayerDistance,
            deeperLayerOpacityFalloff: mergedEffects.deeperLayerOpacityFalloff,
            previousLayerOpacity: mergedEffects.previousLayerOpacity,
            normalModeLayerZStep: mergedEffects.normalModeLayerZStep,
            cameraPerspective: mergedEffects.cameraPerspective
          })
        );
      });
      return map;
    }, [
      data.layers,
      animatedView.focusDepth,
      animatedView.modeBlend,
      mergedEffects.cameraPerspective,
      mergedEffects.deeperLayerOpacityFalloff,
      mergedEffects.normalModeLayerZStep,
      mergedEffects.previousLayerOpacity,
      mergedGeometry.depthLayerDistance,
      mergedGeometry.normalLayerDistance
    ]);
    useEffect(() => {
      if (!onLayerVisualsChangeRef.current) {
        return;
      }
      const visuals = {};
      layerVisualById.forEach((visual2, layerId) => {
        visuals[layerId] = visual2;
      });
      onLayerVisualsChangeRef.current(visuals);
    }, [layerVisualById]);
    useEffect(() => {
      if (transitionFrameRef.current !== null) {
        cancelAnimationFrame(transitionFrameRef.current);
        transitionFrameRef.current = null;
      }
      transitionFromRef.current = animatedViewRef.current;
      transitionStartTimeRef.current = null;
      if (mergedEffects.transitionDurationMs <= 0) {
        const next = {
          focusDepth: targetFocusDepth,
          modeBlend: targetModeBlend
        };
        animatedViewRef.current = next;
        setAnimatedView(next);
        return;
      }
      const tick = (now) => {
        if (transitionStartTimeRef.current === null) {
          transitionStartTimeRef.current = now;
        }
        const elapsed = now - transitionStartTimeRef.current;
        const rawProgress = clamp(elapsed / mergedEffects.transitionDurationMs, 0, 1);
        const easedProgress = easeInOutCubic(rawProgress);
        const from = transitionFromRef.current;
        const nextFocus = lerp(from.focusDepth, targetFocusDepth, easedProgress);
        const nextBlend = lerp(from.modeBlend, targetModeBlend, easedProgress);
        const next = {
          focusDepth: Math.abs(nextFocus - targetFocusDepth) < mergedEffects.transitionEpsilon ? targetFocusDepth : nextFocus,
          modeBlend: Math.abs(nextBlend - targetModeBlend) < mergedEffects.transitionEpsilon ? targetModeBlend : nextBlend
        };
        animatedViewRef.current = next;
        setAnimatedView((prev) => prev.focusDepth === next.focusDepth && prev.modeBlend === next.modeBlend ? prev : next);
        if (rawProgress < 1) {
          transitionFrameRef.current = requestAnimationFrame(tick);
        } else {
          transitionFrameRef.current = null;
        }
      };
      transitionFrameRef.current = requestAnimationFrame(tick);
      return () => {
        if (transitionFrameRef.current !== null) {
          cancelAnimationFrame(transitionFrameRef.current);
          transitionFrameRef.current = null;
        }
      };
    }, [
      mergedEffects.transitionDurationMs,
      mergedEffects.transitionEpsilon,
      targetFocusDepth,
      targetModeBlend
    ]);
    useImperativeHandle(ref, () => ({
      requestGoToCell(request) {
        const layer = layerById.get(request.layerId);
        if (!layer) {
          return;
        }
        const key = cellKey(request.row, request.col);
        const cell = layer.cells[key];
        if (!cell) {
          return;
        }
        const cellId = resolveCellId(layer.layerId, cell);
        const context = nowContext("programmatic");
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: request.layerId,
          context
        });
        const centered = centerCameraOnCell({
          row: request.row,
          col: request.col,
          current: state.camera,
          scale: clampedScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context
        });
        if (request.select !== false) {
          onCellSelectIntentRef.current({
            layerId: layer.layerId,
            cell: {
              layerId: layer.layerId,
              row: request.row,
              col: request.col,
              cellId
            },
            context
          });
        }
      },
      requestBackToTrackedCell() {
        const tracked = state.selection.trackedCell;
        if (!tracked) {
          return;
        }
        const context = nowContext("programmatic");
        if (state.mode === "depth") {
          onModeChangeIntentRef.current({
            prevMode: state.mode,
            nextMode: "normal",
            context
          });
        }
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: tracked.layerId,
          context
        });
        const centered = centerCameraOnCell({
          row: tracked.row,
          col: tracked.col,
          current: state.camera,
          scale: clampedScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: "normal",
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context
        });
        onCellSelectIntentRef.current({
          layerId: tracked.layerId,
          cell: tracked,
          context
        });
      },
      requestToggleDepthMode() {
        onModeChangeIntentRef.current({
          prevMode: state.mode,
          nextMode: state.mode === "depth" ? "normal" : "depth",
          context: nowContext("programmatic")
        });
      },
      requestSetLayer(layerId) {
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: layerId,
          context: nowContext("programmatic")
        });
      },
      requestCenterOnCell(cell) {
        const centered = centerCameraOnCell({
          row: cell.row,
          col: cell.col,
          current: state.camera,
          scale: clampedScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context: nowContext("programmatic")
        });
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: cell.layerId,
          context: nowContext("programmatic")
        });
      }
    }), [
      state.activeLayerId,
      state.camera,
      state.mode,
      state.selection.trackedCell,
      clampedScale,
      viewportSize.width,
      viewportSize.height,
      cellWidth,
      cellHeight,
      data.gridWidth,
      data.gridHeight,
      mergedZoom.panPaddingCells,
      depthStackHeight,
      layerById
    ]);
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const update = () => {
        const rect = viewport.getBoundingClientRect();
        const w = Math.max(1, rect.width);
        const h = Math.max(1, rect.height);
        setViewportSize((prev) => prev.width === w && prev.height === h ? prev : { width: w, height: h });
      };
      update();
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(() => update());
        observer.observe(viewport);
        return () => observer.disconnect();
      }
      const handleWindowResize = () => update();
      window.addEventListener("resize", handleWindowResize);
      return () => {
        window.removeEventListener("resize", handleWindowResize);
      };
    }, []);
    useEffect(() => {
      if (!externalEvents || externalEvents.length === 0) {
        return;
      }
      for (const event of externalEvents) {
        if (isDuplicateExternalEvent(event, processedExternalEventKeysRef.current)) {
          continue;
        }
        handleExternalEventRef.current(event);
      }
    }, [externalEvents]);
    useEffect(() => {
      if (!externalEventSource) {
        return;
      }
      return externalEventSource.subscribe((event) => {
        if (isDuplicateExternalEvent(event, processedExternalEventKeysRef.current)) {
          return;
        }
        handleExternalEventRef.current(event);
      });
    }, [externalEventSource]);
    useEffect(() => {
      const base = baseCanvasRef.current;
      if (!base) {
        return;
      }
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const widthPx = Math.max(1, Math.floor(viewportSize.width * dpr));
      const heightPx = Math.max(1, Math.floor(viewportSize.height * dpr));
      setupCanvas(base, viewportSize, widthPx, heightPx);
      const baseCtx = base.getContext("2d");
      if (!baseCtx) {
        return;
      }
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.clearRect(0, 0, viewportSize.width, viewportSize.height);
      for (let layerIndex = 0; layerIndex < data.layers.length; layerIndex += 1) {
        const layer = data.layers[layerIndex];
        if (!layer) {
          continue;
        }
        const visual2 = resolveLayerVisual({
          layerIndex,
          focusDepth: animatedView.focusDepth,
          modeBlend: animatedView.modeBlend,
          depthLayerDistance: mergedGeometry.depthLayerDistance,
          normalLayerDistance: mergedGeometry.normalLayerDistance,
          deeperLayerOpacityFalloff: mergedEffects.deeperLayerOpacityFalloff,
          previousLayerOpacity: mergedEffects.previousLayerOpacity,
          normalModeLayerZStep: mergedEffects.normalModeLayerZStep,
          cameraPerspective: mergedEffects.cameraPerspective
        });
        if (visual2.opacity <= mergedEffects.farLayerVisibilityCutoff) {
          continue;
        }
        drawLayer(baseCtx, {
          layer,
          camera: displayCamera,
          viewportSize,
          cellWidth,
          cellHeight,
          layerYOffset: visual2.yOffset,
          layerZOffset: visual2.zOffset,
          projectedScale: visual2.projectedScale,
          opacity: visual2.opacity,
          blur: shouldDisableBlur ? 0 : visual2.blur,
          layerIndex,
          focusDepth: animatedView.focusDepth,
          selectedCell: state.selection.selectedCell,
          trackedCell: state.selection.trackedCell,
          visual: mergedVisual
        });
      }
      if (mergedVisual.globalTintColor !== "transparent") {
        applyTintToDrawnPixels(baseCtx, viewportSize.width, viewportSize.height, mergedVisual.globalTintColor);
      }
    }, [
      animatedView.focusDepth,
      animatedView.modeBlend,
      cellHeight,
      cellWidth,
      displayCamera,
      data.layers,
      mergedEffects.cameraPerspective,
      mergedEffects.deeperLayerOpacityFalloff,
      mergedEffects.farLayerVisibilityCutoff,
      mergedEffects.normalModeLayerZStep,
      mergedEffects.previousLayerOpacity,
      mergedGeometry.depthLayerDistance,
      mergedGeometry.normalLayerDistance,
      mergedVisual,
      shouldDisableBlur,
      state.activeLayerId,
      state.mode,
      state.selection.selectedCell,
      state.selection.trackedCell,
      viewportSize
    ]);
    useEffect(() => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const widthPx = Math.max(1, Math.floor(viewportSize.width * dpr));
      const heightPx = Math.max(1, Math.floor(viewportSize.height * dpr));
      setupCanvas(overlay, viewportSize, widthPx, heightPx);
      const overlayCtx = overlay.getContext("2d");
      if (!overlayCtx) {
        return;
      }
      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlayCtx.clearRect(0, 0, viewportSize.width, viewportSize.height);
      if (activeLayer) {
        drawOverlayLabels(overlayCtx, {
          layer: activeLayer,
          camera: displayCamera,
          viewportSize,
          cellWidth,
          cellHeight,
          layerYOffset: activeLayerVisual.yOffset,
          layerZOffset: activeLayerVisual.zOffset,
          projectedScale: activeLayerVisual.projectedScale,
          opacity: activeLayerVisual.opacity,
          hoveredCell,
          selectedCell: state.selection.selectedCell,
          trackedCell: state.selection.trackedCell,
          visual: mergedVisual
        });
      }
      if (mergedVisual.globalTintColor !== "transparent") {
        applyTintToDrawnPixels(overlayCtx, viewportSize.width, viewportSize.height, mergedVisual.globalTintColor);
      }
    }, [
      activeLayer,
      activeLayerVisual.opacity,
      activeLayerVisual.projectedScale,
      activeLayerVisual.yOffset,
      activeLayerVisual.zOffset,
      cellHeight,
      cellWidth,
      displayCamera,
      hoveredCell,
      mergedVisual,
      state.selection.selectedCell,
      state.selection.trackedCell,
      viewportSize
    ]);
    const handleExternalEventRef = useRef(handleExternalEvent);
    handleExternalEventRef.current = handleExternalEvent;
    function handleExternalEvent(event) {
      switch (event.type) {
        case "action.layer": {
          onLayerChangeIntentRef.current({
            prevLayerId: state.activeLayerId,
            nextLayerId: event.payload.layerId,
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision
            }
          });
          break;
        }
        case "action.mode": {
          onModeChangeIntentRef.current({
            prevMode: state.mode,
            nextMode: event.payload.mode,
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision
            }
          });
          break;
        }
        case "action.select": {
          const layer = layerById.get(event.payload.layerId);
          if (!layer) {
            break;
          }
          const key = cellKey(event.payload.row, event.payload.col);
          const cell = layer.cells[key];
          if (!cell) {
            break;
          }
          onCellSelectIntentRef.current({
            layerId: layer.layerId,
            cell: {
              layerId: layer.layerId,
              row: event.payload.row,
              col: event.payload.col,
              cellId: resolveCellId(layer.layerId, cell)
            },
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision
            }
          });
          break;
        }
        case "action.goto": {
          onLayerChangeIntentRef.current({
            prevLayerId: state.activeLayerId,
            nextLayerId: event.payload.layerId,
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision
            }
          });
          if (event.payload.select) {
            const layer = layerById.get(event.payload.layerId);
            if (!layer) {
              break;
            }
            const key = cellKey(event.payload.row, event.payload.col);
            const cell = layer.cells[key];
            if (!cell) {
              break;
            }
            onCellSelectIntentRef.current({
              layerId: layer.layerId,
              cell: {
                layerId: layer.layerId,
                row: event.payload.row,
                col: event.payload.col,
                cellId: resolveCellId(layer.layerId, cell)
              },
              context: {
                reason: "external-action",
                timestamp: event.timestamp,
                revision: event.revision
              }
            });
          }
          break;
        }
        case "action.camera": {
          onCameraChangeIntentRef.current({
            prevCamera: state.camera,
            nextCamera: { ...state.camera, ...event.payload },
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision
            }
          });
          break;
        }
      }
    }
    const applyCameraIntent = useCallback((nextCamera, reason) => {
      const bounded = clampCameraToBounds({
        camera: nextCamera,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        gridWidth: data.gridWidth,
        gridHeight: data.gridHeight,
        cellWidth,
        cellHeight,
        mode: state.mode,
        panPaddingCells: mergedZoom.panPaddingCells,
        depthStackHeight
      });
      interactionCameraRef.current = bounded;
      if (reason === "pointer") {
        queuedPointerCameraRef.current = {
          camera: bounded,
          reason
        };
        if (pointerCameraFrameRef.current === null) {
          pointerCameraFrameRef.current = requestAnimationFrame(() => {
            pointerCameraFrameRef.current = null;
            const queued = queuedPointerCameraRef.current;
            if (!queued) {
              return;
            }
            queuedPointerCameraRef.current = null;
            const nextCamera2 = {
              ...queued.camera,
              focusDepth: committedCameraRef.current.focusDepth
            };
            onCameraChangeIntentRef.current({
              prevCamera: committedCameraRef.current,
              nextCamera: nextCamera2,
              context: nowContext(queued.reason)
            });
            committedCameraRef.current = nextCamera2;
          });
        }
        return;
      }
      queuedPointerCameraRef.current = null;
      onCameraChangeIntentRef.current({
        prevCamera: committedCameraRef.current,
        nextCamera: bounded,
        context: nowContext(reason)
      });
      committedCameraRef.current = bounded;
    }, [
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      mergedZoom.panPaddingCells,
      state.mode,
      viewportSize.height,
      viewportSize.width
    ]);
    const animateCameraIntent = useCallback((targetCamera, reason) => {
      stopRecenteringAnimation();
      const from = interactionCameraRef.current;
      const delta = Math.max(
        Math.abs(from.panX - targetCamera.panX),
        Math.abs(from.panY - targetCamera.panY),
        Math.abs(from.scale - targetCamera.scale),
        Math.abs(from.focusDepth - targetCamera.focusDepth)
      );
      if (delta < mergedEffects.transitionEpsilon || mergedEffects.transitionDurationMs <= 0) {
        applyCameraIntent(targetCamera, reason);
        return;
      }
      recenterCameraFromRef.current = from;
      recenterCameraToRef.current = targetCamera;
      const recenterDurationMs = computeRecenterDurationMs({
        from,
        to: targetCamera,
        scale: clamp(from.scale, minScale, maxScale),
        fallbackDurationMs: mergedEffects.transitionDurationMs
      });
      recenterCameraStartTimeRef.current = performance.now() - 16.67;
      const tick = (now) => {
        const startTime = recenterCameraStartTimeRef.current ?? now;
        const elapsed = now - startTime;
        const rawProgress = clamp(elapsed / recenterDurationMs, 0, 1);
        const easedProgress = rawProgress >= RECENTER_END_SNAP_PROGRESS ? 1 : easeOutCubic(rawProgress / RECENTER_END_SNAP_PROGRESS);
        const start = recenterCameraFromRef.current;
        const end = recenterCameraToRef.current;
        const bounded = clampCameraToBounds({
          camera: {
            panX: lerp(start.panX, end.panX, easedProgress),
            panY: lerp(start.panY, end.panY, easedProgress),
            scale: lerp(start.scale, end.scale, easedProgress),
            focusDepth: lerp(start.focusDepth, end.focusDepth, easedProgress)
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        interactionCameraRef.current = bounded;
        setCameraTweenFrame(bounded);
        if (rawProgress < 1) {
          recenterCameraFrameRef.current = requestAnimationFrame(tick);
        } else {
          queuedPointerCameraRef.current = null;
          recenterPendingCommitRef.current = bounded;
          const animateCommit = {
            ...bounded,
            focusDepth: committedCameraRef.current.focusDepth
          };
          onCameraChangeIntentRef.current({
            prevCamera: committedCameraRef.current,
            nextCamera: animateCommit,
            context: nowContext(reason)
          });
          committedCameraRef.current = animateCommit;
          interactionCameraRef.current = animateCommit;
          recenterCameraStartTimeRef.current = null;
          recenterCameraFrameRef.current = null;
        }
      };
      tick(performance.now());
    }, [
      applyCameraIntent,
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      mergedEffects.transitionDurationMs,
      mergedEffects.transitionEpsilon,
      mergedZoom.panPaddingCells,
      minScale,
      state.mode,
      stopRecenteringAnimation,
      viewportSize.height,
      viewportSize.width
    ]);
    const animateCameraIntentRef = useRef(animateCameraIntent);
    animateCameraIntentRef.current = animateCameraIntent;
    const animateSelectionZoomFromPointer = useCallback((args) => {
      const viewport = viewportRef.current;
      if (!viewport) {
        const centered = centerCameraOnCell({
          row: args.row,
          col: args.col,
          current: interactionCameraRef.current,
          scale: maxScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        animateCameraIntent(centered, args.reason);
        return;
      }
      stopRecenteringAnimation();
      const from = interactionCameraRef.current;
      const startScale = clamp(from.scale, minScale, maxScale);
      const targetScale = maxScale;
      const targetCentered = centerCameraOnCell({
        row: args.row,
        col: args.col,
        current: from,
        scale: targetScale,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        cellWidth,
        cellHeight,
        gridWidth: data.gridWidth,
        gridHeight: data.gridHeight,
        mode: state.mode,
        panPaddingCells: mergedZoom.panPaddingCells,
        depthStackHeight
      });
      if (Math.abs(targetScale - startScale) < mergedEffects.transitionEpsilon) {
        animateCameraIntent(targetCentered, args.reason);
        return;
      }
      const pointer = mapClientPointToViewport({
        clientX: args.pointerClientX,
        clientY: args.pointerClientY,
        viewport,
        viewportSize
      });
      if (!pointer) {
        animateCameraIntent(targetCentered, args.reason);
        return;
      }
      const pointerX = pointer.x;
      const pointerY = pointer.y;
      const clickWorldX = pointerX / startScale - from.panX;
      const clickWorldY = pointerY / startScale - from.panY;
      const recenterDurationMs = computeRecenterDurationMs({
        from,
        to: targetCentered,
        scale: startScale,
        fallbackDurationMs: mergedEffects.transitionDurationMs
      });
      recenterCameraStartTimeRef.current = performance.now() - 16.67;
      const tick = (now) => {
        const startTime = recenterCameraStartTimeRef.current ?? now;
        const elapsed = now - startTime;
        const rawProgress = clamp(elapsed / recenterDurationMs, 0, 1);
        const motionProgress = easeInOutCubic(rawProgress);
        const scale = lerp(startScale, targetScale, motionProgress);
        const clickAnchored = clampCameraToBounds({
          camera: {
            ...from,
            scale,
            panX: pointerX / scale - clickWorldX,
            panY: pointerY / scale - clickWorldY
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        const centeredAtScale = centerCameraOnCell({
          row: args.row,
          col: args.col,
          current: from,
          scale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        const blended = clampCameraToBounds({
          camera: {
            ...from,
            scale,
            panX: lerp(clickAnchored.panX, centeredAtScale.panX, motionProgress),
            panY: lerp(clickAnchored.panY, centeredAtScale.panY, motionProgress),
            focusDepth: lerp(from.focusDepth, targetCentered.focusDepth, motionProgress)
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        interactionCameraRef.current = blended;
        setCameraTweenFrame(blended);
        if (rawProgress < 1) {
          recenterCameraFrameRef.current = requestAnimationFrame(tick);
          return;
        }
        queuedPointerCameraRef.current = null;
        recenterPendingCommitRef.current = blended;
        const zoomCommit = {
          ...blended,
          focusDepth: committedCameraRef.current.focusDepth
        };
        onCameraChangeIntentRef.current({
          prevCamera: committedCameraRef.current,
          nextCamera: zoomCommit,
          context: nowContext(args.reason)
        });
        committedCameraRef.current = zoomCommit;
        interactionCameraRef.current = zoomCommit;
        recenterCameraStartTimeRef.current = null;
        recenterCameraFrameRef.current = null;
      };
      tick(performance.now());
    }, [
      animateCameraIntent,
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      maxScale,
      mergedEffects.transitionDurationMs,
      mergedEffects.transitionEpsilon,
      mergedZoom.panPaddingCells,
      minScale,
      state.mode,
      stopRecenteringAnimation,
      viewportSize.height,
      viewportSize.width
    ]);
    useEffect(() => {
      if (lockCamera) {
        return;
      }
      const anchor = state.selection.selectedCell ?? state.selection.trackedCell;
      const selectionKey = anchor ? `${anchor.layerId}:${anchor.cellId}` : null;
      if (!anchor || !selectionKey) {
        lastSelectionKeyRef.current = selectionKey;
        suppressSelectionRecenterKeyRef.current = null;
        return;
      }
      if (selectionKey === suppressSelectionRecenterKeyRef.current) {
        suppressSelectionRecenterKeyRef.current = null;
        lastSelectionKeyRef.current = selectionKey;
        return;
      }
      if (selectionKey === lastSelectionKeyRef.current) {
        return;
      }
      if (isPointerInteractionActive) {
        return;
      }
      if (anchor.layerId !== state.activeLayerId) {
        lastSelectionKeyRef.current = selectionKey;
        return;
      }
      lastSelectionKeyRef.current = selectionKey;
      if (momentumFrameRef.current !== null) {
        cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
        setIsMomentumActive(false);
      }
      const centered = centerCameraOnCell({
        row: anchor.row,
        col: anchor.col,
        current: interactionCameraRef.current,
        scale: maxScale,
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        cellWidth,
        cellHeight,
        gridWidth: data.gridWidth,
        gridHeight: data.gridHeight,
        mode: state.mode,
        panPaddingCells: mergedZoom.panPaddingCells,
        depthStackHeight
      });
      animateCameraIntentRef.current(centered, "programmatic");
    }, [
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      isPointerInteractionActive,
      lockCamera,
      maxScale,
      mergedZoom.panPaddingCells,
      state.activeLayerId,
      state.mode,
      state.selection.selectedCell,
      state.selection.trackedCell,
      viewportSize.height,
      viewportSize.width
    ]);
    const onWheel = useCallback((event) => {
      event.preventDefault();
      if (lockCamera) {
        return;
      }
      stopRecenteringAnimation();
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const camera = interactionCameraRef.current;
      const pointer = mapClientPointToViewport({
        clientX: event.clientX,
        clientY: event.clientY,
        viewport,
        viewportSize
      });
      if (!pointer) {
        return;
      }
      const pointerX = state.mode === "depth" ? viewportSize.width / 2 : pointer.x;
      const pointerY = state.mode === "depth" ? viewportSize.height / 2 : pointer.y;
      const currentScale = clamp(camera.scale, minScale, maxScale);
      const factor = Math.exp(-event.deltaY * 18e-4);
      const nextScale = clamp(currentScale * factor, minScale, maxScale);
      if (Math.abs(nextScale - currentScale) < 1e-4) {
        return;
      }
      const selectedOnActiveLayer = state.selection.selectedCell && state.selection.selectedCell.layerId === state.activeLayerId ? state.selection.selectedCell : null;
      const trackedOnActiveLayer = state.selection.trackedCell && state.selection.trackedCell.layerId === state.activeLayerId ? state.selection.trackedCell : null;
      const anchorCell = selectedOnActiveLayer ?? trackedOnActiveLayer;
      if (state.mode === "normal" && anchorCell) {
        const centered = centerCameraOnCell({
          row: anchorCell.row,
          col: anchorCell.col,
          current: camera,
          scale: nextScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        applyCameraIntent(centered, "pointer");
        return;
      }
      const worldX = pointerX / currentScale - camera.panX;
      const worldY = pointerY / currentScale - camera.panY;
      const nextPanX = pointerX / nextScale - worldX;
      const nextPanY = pointerY / nextScale - worldY;
      applyCameraIntent({
        ...camera,
        scale: nextScale,
        panX: nextPanX,
        panY: nextPanY
      }, "pointer");
    }, [
      applyCameraIntent,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      lockCamera,
      maxScale,
      mergedZoom.panPaddingCells,
      minScale,
      state.activeLayerId,
      state.mode,
      state.selection.selectedCell,
      state.selection.trackedCell,
      stopRecenteringAnimation,
      viewportSize.height,
      viewportSize.width,
      cellHeight,
      cellWidth
    ]);
    useEffect(() => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }
      const handleWheel = (event) => {
        onWheel(event);
      };
      overlay.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        overlay.removeEventListener("wheel", handleWheel);
      };
    }, [onWheel]);
    const onPointerDown = useCallback((event) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      stopMomentum();
      stopRecenteringAnimation();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      setIsPointerInteractionActive(true);
      const camera = interactionCameraRef.current;
      const now = performance.now();
      const lastDown = lastPointerDownInfoRef.current;
      const isDoubleClick = event.button === 0 && !!lastDown && now - lastDown.time <= DOUBLE_CLICK_MS && Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) <= DOUBLE_CLICK_PX;
      lastPointerDownInfoRef.current = { time: now, x: event.clientX, y: event.clientY };
      panSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: camera.panX,
        startPanY: camera.panY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        lastTime: now,
        velocityX: 0,
        velocityY: 0,
        moved: false,
        selectedCellOnDown: null,
        isDoubleClick
      };
      if (event.button !== 0 || state.mode === "depth" || isDoubleClick) {
        return;
      }
      const hitCell = findCellAtClientPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: viewportRef.current,
        layer: activeLayer,
        camera: displayCamera,
        viewportSize,
        cellWidth,
        cellHeight,
        layerVisual: activeLayerVisual
      });
      if (!hitCell) {
        return;
      }
      if (!lockCamera) {
        animateSelectionZoomFromPointer({
          row: hitCell.row,
          col: hitCell.col,
          pointerClientX: event.clientX,
          pointerClientY: event.clientY,
          reason: "pointer"
        });
      }
      const selectedKey = `${hitCell.layerId}:${hitCell.cellId}`;
      lastSelectionKeyRef.current = selectedKey;
      suppressSelectionRecenterKeyRef.current = selectedKey;
      if (panSessionRef.current && panSessionRef.current.pointerId === event.pointerId) {
        panSessionRef.current.selectedCellOnDown = hitCell;
      }
      onCellSelectIntentRef.current({
        layerId: hitCell.layerId,
        cell: hitCell,
        context: nowContext("pointer")
      });
      setHoveredCell(hitCell);
    }, [
      activeLayer,
      activeLayerVisual,
      animateSelectionZoomFromPointer,
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      lockCamera,
      maxScale,
      mergedZoom.panPaddingCells,
      state.mode,
      stopMomentum,
      stopRecenteringAnimation,
      displayCamera,
      viewportSize
    ]);
    const onPointerMove = useCallback((event) => {
      if (lockCamera) {
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }
      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }
      if (event.buttons === 0) {
        panSessionRef.current = null;
        setIsPointerInteractionActive(false);
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        session.moved = true;
        stopRecenteringAnimation();
      }
      if (!session.moved) {
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }
      const panX = state.mode === "depth" ? session.startPanX : session.startPanX + dx / clampedScale;
      const panY = session.startPanY + dy / clampedScale;
      const now = performance.now();
      const dt = Math.max(1, now - session.lastTime);
      const deltaPanX = state.mode === "depth" ? 0 : (event.clientX - session.lastClientX) / clampedScale;
      const deltaPanY = (event.clientY - session.lastClientY) / clampedScale;
      session.velocityX = deltaPanX / dt;
      session.velocityY = deltaPanY / dt;
      session.lastClientX = event.clientX;
      session.lastClientY = event.clientY;
      session.lastTime = now;
      applyCameraIntent(
        {
          ...interactionCameraRef.current,
          panX,
          panY
        },
        "pointer"
      );
      setHoveredCell(null);
    }, [
      activeLayer,
      activeLayerVisual,
      applyCameraIntent,
      cellHeight,
      cellWidth,
      clampedScale,
      displayCamera,
      lockCamera,
      state.mode,
      stopRecenteringAnimation,
      viewportSize
    ]);
    const onPointerUp = useCallback((event) => {
      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      panSessionRef.current = null;
      setIsPointerInteractionActive(false);
      if (session.moved) {
        setHoveredCell(null);
        startMomentum(session.velocityX, session.velocityY);
        return;
      }
      if (session.isDoubleClick) {
        return;
      }
      if (session.selectedCellOnDown) {
        setHoveredCell(session.selectedCellOnDown);
        return;
      }
      if (state.mode === "depth") {
        return;
      }
      const hitCell = findCellAtClientPoint({
        clientX: event.clientX,
        clientY: event.clientY,
        viewport: viewportRef.current,
        layer: activeLayer,
        camera: displayCamera,
        viewportSize,
        cellWidth,
        cellHeight,
        layerVisual: activeLayerVisual
      });
      if (!hitCell) {
        return;
      }
      if (!lockCamera) {
        const centered = centerCameraOnCell({
          row: hitCell.row,
          col: hitCell.col,
          current: interactionCameraRef.current,
          scale: maxScale,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          cellWidth,
          cellHeight,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        animateCameraIntent(centered, "programmatic");
      }
      lastSelectionKeyRef.current = `${hitCell.layerId}:${hitCell.cellId}`;
      onCellSelectIntentRef.current({
        layerId: hitCell.layerId,
        cell: hitCell,
        context: nowContext("pointer")
      });
      setHoveredCell(hitCell);
    }, [
      activeLayer,
      activeLayerVisual,
      animateCameraIntent,
      cellHeight,
      cellWidth,
      clampedScale,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      lockCamera,
      mergedZoom.panPaddingCells,
      startMomentum,
      state.mode,
      displayCamera,
      viewportSize
    ]);
    const onPointerLeave = useCallback(() => {
      panSessionRef.current = null;
      setIsPointerInteractionActive(false);
      setHoveredCell(null);
      lastPointerClientPosRef.current = null;
    }, []);
    const onPointerCancel = useCallback(() => {
      panSessionRef.current = null;
      setIsPointerInteractionActive(false);
      setHoveredCell(null);
      lastPointerClientPosRef.current = null;
    }, []);
    function updateHoveredCellFromPointer(clientX, clientY) {
      lastPointerClientPosRef.current = { x: clientX, y: clientY };
      if (state.mode === "depth") {
        setHoveredCell(null);
        return;
      }
      const nextHovered = findCellAtClientPoint({
        clientX,
        clientY,
        viewport: viewportRef.current,
        layer: activeLayer,
        camera: displayCamera,
        viewportSize,
        cellWidth,
        cellHeight,
        layerVisual: activeLayerVisual
      });
      setHoveredCell((prev) => {
        if (prev?.layerId === nextHovered?.layerId && prev?.cellId === nextHovered?.cellId) {
          return prev;
        }
        return nextHovered;
      });
    }
    useEffect(() => {
      const pos = lastPointerClientPosRef.current;
      if (!pos || isPointerInteractionActive) {
        return;
      }
      updateHoveredCellFromPointer(pos.x, pos.y);
    }, [state.camera, state.activeLayerId, state.mode]);
    const onKeyDown = useCallback((event) => {
      if (event.code === "PageDown") {
        event.preventDefault();
        const nextIndex = Math.min(data.layers.length - 1, activeLayerIndex + 1);
        const nextLayer = data.layers[nextIndex];
        if (!nextLayer || nextLayer.layerId === state.activeLayerId) {
          return;
        }
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: nextLayer.layerId,
          context: nowContext("keyboard")
        });
      }
      if (event.code === "PageUp") {
        event.preventDefault();
        const nextIndex = Math.max(0, activeLayerIndex - 1);
        const nextLayer = data.layers[nextIndex];
        if (!nextLayer || nextLayer.layerId === state.activeLayerId) {
          return;
        }
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: nextLayer.layerId,
          context: nowContext("keyboard")
        });
      }
      if (!lockCamera && state.mode !== "depth" && (event.code === "ArrowUp" || event.code === "ArrowDown" || event.code === "ArrowLeft" || event.code === "ArrowRight")) {
        event.preventDefault();
        stopMomentum();
        stopRecenteringAnimation();
        const el = viewportRef.current;
        if (el) {
          el.style.transition = "none";
          el.style.transform = "none";
        }
        const camera = interactionCameraRef.current;
        const dPanX = event.code === "ArrowLeft" ? cellWidth : event.code === "ArrowRight" ? -cellWidth : 0;
        const dPanY = event.code === "ArrowUp" ? cellHeight : event.code === "ArrowDown" ? -cellHeight : 0;
        const target = clampCameraToBounds({
          camera: { ...camera, panX: camera.panX + dPanX, panY: camera.panY + dPanY },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight
        });
        const screenDX = (target.panX - camera.panX) * camera.scale;
        const screenDY = (target.panY - camera.panY) * camera.scale;
        interactionCameraRef.current = target;
        committedCameraRef.current = target;
        onCameraChangeIntentRef.current({
          prevCamera: camera,
          nextCamera: target,
          context: nowContext("keyboard")
        });
        if (el && (screenDX !== 0 || screenDY !== 0)) {
          el.style.transform = `translate(${-screenDX}px, ${-screenDY}px)`;
          void el.offsetHeight;
          requestAnimationFrame(() => {
            el.style.transition = `transform ${ARROW_PAN_DURATION_MS}ms linear`;
            el.style.transform = "translate(0px, 0px)";
          });
        }
      }
    }, [
      activeLayerIndex,
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      data.layers,
      depthStackHeight,
      lockCamera,
      mergedZoom.panPaddingCells,
      state.activeLayerId,
      state.mode,
      stopMomentum,
      stopRecenteringAnimation,
      viewportSize.height,
      viewportSize.width
    ]);
    const viewportStyle = useMemo(
      () => ({
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 320,
        overflow: "hidden",
        background: mergedVisual.backgroundColor,
        outline: "none"
      }),
      [mergedVisual.backgroundColor]
    );
    const canvasStyle = useMemo(
      () => ({
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%"
      }),
      []
    );
    const hudStyle = useMemo(
      () => ({
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 2,
        pointerEvents: "none"
      }),
      []
    );
    return /* @__PURE__ */ jsxs("section", { className, style: { position: "relative", ...style }, children: [
      /* @__PURE__ */ jsxs("div", { style: hudStyle, children: [
        /* @__PURE__ */ jsxs("div", { children: [
          "Active cell: ",
          state.selection.trackedCell ? `${state.selection.trackedCell.layerId}-${state.selection.trackedCell.cellId}` : "-"
        ] }),
        renderToolbarExtras ? renderToolbarExtras(state) : null
      ] }),
      /* @__PURE__ */ jsxs("div", { ref: viewportRef, style: viewportStyle, tabIndex: 0, onKeyDown, children: [
        /* @__PURE__ */ jsx("canvas", { ref: baseCanvasRef, style: canvasStyle, "aria-label": "Layered grid base canvas" }),
        /* @__PURE__ */ jsx(
          "canvas",
          {
            ref: overlayCanvasRef,
            style: canvasStyle,
            "aria-label": "Layered grid overlay canvas",
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerLeave,
            onPointerCancel,
            onLostPointerCapture: onPointerCancel
          }
        ),
        renderCellOverlay ? overlayCells.map((cell) => {
          const content = renderCellOverlay(cell);
          if (content == null) {
            return null;
          }
          const visual2 = layerVisualById.get(cell.layerId) ?? activeLayerVisual;
          const left = (cell.col * cellWidth + effectiveCamera.panX) * clampedScale;
          const top = (cell.row * cellHeight + effectiveCamera.panY + visual2.yOffset) * clampedScale;
          const baseWidth = cellWidth * clampedScale;
          const baseHeight = cellHeight * clampedScale;
          const centerX = viewportSize.width / 2;
          const centerY = viewportSize.height / 2;
          const width = baseWidth * visual2.projectedScale;
          const height = baseHeight * visual2.projectedScale;
          const projectedLeft = centerX + (left - centerX) * visual2.projectedScale;
          const projectedTop = centerY + (top - centerY) * visual2.projectedScale;
          return /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                position: "absolute",
                pointerEvents: "none",
                left: projectedLeft,
                top: projectedTop,
                width,
                height,
                opacity: visual2.opacity
              },
              children: content
            },
            cell.cellId
          );
        }) : null,
        activeLayer && renderLayerOverlay ? renderLayerOverlay(activeLayer.layerId) : null
      ] })
    ] });
  }
);
function setupCanvas(canvas, viewportSize, widthPx, heightPx) {
  if (canvas.width !== widthPx) {
    canvas.width = widthPx;
  }
  if (canvas.height !== heightPx) {
    canvas.height = heightPx;
  }
  if (canvas.style.width !== `${viewportSize.width}px`) {
    canvas.style.width = `${viewportSize.width}px`;
  }
  if (canvas.style.height !== `${viewportSize.height}px`) {
    canvas.style.height = `${viewportSize.height}px`;
  }
}
function drawLayer(ctx, args) {
  const {
    layer,
    camera,
    viewportSize,
    cellWidth,
    cellHeight,
    layerYOffset,
    layerZOffset,
    projectedScale,
    opacity,
    blur,
    layerIndex,
    focusDepth,
    selectedCell,
    trackedCell,
    visual
  } = args;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = blur > 0.01 ? `blur(${blur}px)` : "none";
  const centerX = viewportSize.width / 2;
  const centerY = viewportSize.height / 2;
  const layerShiftY = layerYOffset * camera.scale;
  const zPush = layerZOffset * 0.02;
  for (const cell of Object.values(layer.cells)) {
    const baseX = (cell.col * cellWidth + camera.panX) * camera.scale;
    const baseY = (cell.row * cellHeight + camera.panY) * camera.scale + layerShiftY + zPush;
    const x = centerX + (baseX - centerX) * projectedScale;
    const y = centerY + (baseY - centerY) * projectedScale;
    const w = cellWidth * camera.scale * projectedScale;
    const h = cellHeight * camera.scale * projectedScale;
    if (x + w < 0 || y + h < 0 || x > viewportSize.width || y > viewportSize.height) {
      continue;
    }
    const cellId = resolveCellId(layer.layerId, cell);
    const isSelected = selectedCell?.layerId === layer.layerId && selectedCell.cellId === cellId;
    const isTracked = trackedCell?.layerId === layer.layerId && trackedCell.cellId === cellId;
    const inkAlpha = computeLayerInkAlpha(layerIndex, focusDepth, visual);
    ctx.lineWidth = Math.max(0.5, visual.strokeWidthAtScale1 * camera.scale);
    ctx.strokeStyle = isSelected || isTracked ? visual.selectedCellStrokeColor : visual.gridStrokeColor;
    ctx.globalAlpha = isSelected || isTracked ? opacity : opacity * inkAlpha;
    ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();
}
function drawOverlayLabels(ctx, args) {
  const {
    layer,
    camera,
    viewportSize,
    cellWidth,
    cellHeight,
    layerYOffset,
    layerZOffset,
    projectedScale,
    opacity,
    hoveredCell,
    selectedCell,
    trackedCell,
    visual
  } = args;
  ctx.save();
  if (hoveredCell && hoveredCell.layerId === layer.layerId) {
    const hoverKey = cellKey(hoveredCell.row, hoveredCell.col);
    const hoverData = layer.cells[hoverKey];
    if (hoverData) {
      const hoverRect = projectCellRect({
        row: hoverData.row,
        col: hoverData.col,
        camera,
        viewportSize,
        cellWidth,
        cellHeight,
        layerYOffset,
        layerZOffset,
        projectedScale
      });
      if (hoverRect) {
        ctx.strokeStyle = "#4be3c2";
        ctx.lineWidth = Math.max(0.5, visual.strokeWidthAtScale1 * camera.scale);
        ctx.globalAlpha = opacity;
        ctx.strokeRect(hoverRect.x, hoverRect.y, hoverRect.w, hoverRect.h);
      }
    }
  }
  const labelCells = collectLabelTargetCells({
    layer,
    hoveredCell,
    selectedCell,
    trackedCell
  });
  if (labelCells.length === 0) {
    ctx.restore();
    return;
  }
  ctx.fillStyle = visual.labelColor;
  ctx.globalAlpha = opacity * visual.activeLayerInkAlpha;
  ctx.font = `${Math.max(10, Math.round(visual.labelFontPxAtScale1 * camera.scale))}px ${visual.labelFontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const cell of labelCells) {
    const rect = projectCellRect({
      row: cell.row,
      col: cell.col,
      camera,
      viewportSize,
      cellWidth,
      cellHeight,
      layerYOffset,
      layerZOffset,
      projectedScale
    });
    if (!rect) {
      continue;
    }
    ctx.fillText(resolveCellVisualId(cell), rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
  ctx.restore();
}
function applyTintToDrawnPixels(ctx, width, height, tintColor) {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = tintColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
function collectLabelTargetCells(args) {
  const { layer, hoveredCell, selectedCell, trackedCell } = args;
  const keys = /* @__PURE__ */ new Set();
  const targets = [];
  for (const ref of [hoveredCell, selectedCell, trackedCell]) {
    if (!ref || ref.layerId !== layer.layerId) {
      continue;
    }
    const key = cellKey(ref.row, ref.col);
    if (keys.has(key)) {
      continue;
    }
    const cell = layer.cells[key];
    if (!cell) {
      continue;
    }
    keys.add(key);
    targets.push(cell);
  }
  return targets;
}
function findCellAtClientPoint(args) {
  const { clientX, clientY, viewport, layer, camera, viewportSize, cellWidth, cellHeight, layerVisual } = args;
  if (!viewport || !layer) {
    return null;
  }
  const local = mapClientPointToViewport({
    clientX,
    clientY,
    viewport,
    viewportSize
  });
  if (!local) {
    return null;
  }
  const localX = local.x;
  const localY = local.y;
  for (const cell of Object.values(layer.cells)) {
    const projected = projectCellRect({
      row: cell.row,
      col: cell.col,
      camera,
      viewportSize,
      cellWidth,
      cellHeight,
      layerYOffset: layerVisual.yOffset,
      layerZOffset: layerVisual.zOffset,
      projectedScale: layerVisual.projectedScale
    });
    if (!projected) {
      continue;
    }
    if (localX >= projected.x && localX <= projected.x + projected.w && localY >= projected.y && localY <= projected.y + projected.h) {
      return {
        layerId: layer.layerId,
        row: cell.row,
        col: cell.col,
        cellId: resolveCellId(layer.layerId, cell)
      };
    }
  }
  return null;
}
function mapClientPointToViewport(args) {
  const { clientX, clientY, viewport, viewportSize } = args;
  const rect = viewport.getBoundingClientRect();
  const rectWidth = Math.max(1, rect.width);
  const rectHeight = Math.max(1, rect.height);
  if (!Number.isFinite(rectWidth) || !Number.isFinite(rectHeight)) {
    return null;
  }
  const scaleX = viewportSize.width / rectWidth;
  const scaleY = viewportSize.height / rectHeight;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}
function projectCellRect(args) {
  const { row, col, camera, viewportSize, cellWidth, cellHeight, layerYOffset, layerZOffset, projectedScale } = args;
  const centerX = viewportSize.width / 2;
  const centerY = viewportSize.height / 2;
  const layerShiftY = layerYOffset * camera.scale;
  const zPush = layerZOffset * 0.02;
  const baseX = (col * cellWidth + camera.panX) * camera.scale;
  const baseY = (row * cellHeight + camera.panY) * camera.scale + layerShiftY + zPush;
  const x = centerX + (baseX - centerX) * projectedScale;
  const y = centerY + (baseY - centerY) * projectedScale;
  const w = cellWidth * camera.scale * projectedScale;
  const h = cellHeight * camera.scale * projectedScale;
  if (x + w < 0 || y + h < 0 || x > viewportSize.width || y > viewportSize.height) {
    return null;
  }
  return { x, y, w, h };
}
function resolveLayerVisual(args) {
  const {
    layerIndex,
    focusDepth,
    modeBlend,
    depthLayerDistance,
    normalLayerDistance,
    deeperLayerOpacityFalloff,
    previousLayerOpacity,
    normalModeLayerZStep,
    cameraPerspective
  } = args;
  const delta = layerIndex - Math.max(0, focusDepth);
  const normal = computeNormalDepthVisual(delta, deeperLayerOpacityFalloff, previousLayerOpacity);
  const normalZ = (Math.max(0, focusDepth) - layerIndex) * normalModeLayerZStep;
  const depth = {
    yOffset: layerIndex * normalLayerDistance,
    zOffset: -layerIndex * depthLayerDistance,
    opacity: Math.max(0.2, 1 - layerIndex * 0.15),
    blur: Math.max(0, layerIndex * 0.35)
  };
  const t = clamp(modeBlend, 0, 1);
  const zOffset = lerp(normalZ, depth.zOffset, t);
  return {
    yOffset: lerp(0, depth.yOffset, t),
    zOffset,
    projectedScale: computePerspectiveScale(zOffset, cameraPerspective),
    opacity: lerp(normal.opacity, depth.opacity, t),
    blur: lerp(normal.blur, depth.blur, t)
  };
}
function computeNormalDepthVisual(distance, deeperLayerOpacityFalloff, previousLayerOpacity) {
  if (distance >= 0) {
    return {
      opacity: clamp(1 - distance * deeperLayerOpacityFalloff, 0, 1),
      blur: Math.max(0, distance * 1.5)
    };
  }
  const behind = Math.abs(distance);
  if (behind <= 1) {
    return {
      opacity: clamp(1 - (1 - previousLayerOpacity) * behind, 0, 1),
      blur: lerp(0, 2.4, behind)
    };
  }
  return {
    opacity: clamp(previousLayerOpacity - (behind - 1) * previousLayerOpacity, 0, 1),
    blur: 2.4 + (behind - 1) * 1.2
  };
}
function isDuplicateExternalEvent(event, seen) {
  const key = event.revision != null ? `rev:${event.revision}` : `evt:${event.type}:${event.timestamp}:${JSON.stringify(event.payload)}`;
  if (seen.has(key)) {
    return true;
  }
  seen.add(key);
  if (seen.size > 4e3) {
    const next = new Set(Array.from(seen).slice(-2e3));
    seen.clear();
    for (const item of next) {
      seen.add(item);
    }
  }
  return false;
}
function centerCameraOnCell(args) {
  const {
    row,
    col,
    current,
    scale,
    viewportWidth,
    viewportHeight,
    cellWidth,
    cellHeight,
    gridWidth,
    gridHeight,
    mode,
    panPaddingCells,
    depthStackHeight
  } = args;
  const cellCenterX = col * cellWidth + cellWidth / 2;
  const cellCenterY = row * cellHeight + cellHeight / 2;
  const panX = viewportWidth / (2 * scale) - cellCenterX;
  const panY = viewportHeight / (2 * scale) - cellCenterY;
  return clampCameraToBounds({
    camera: {
      ...current,
      scale,
      panX,
      panY
    },
    viewportWidth,
    viewportHeight,
    gridWidth,
    gridHeight,
    cellWidth,
    cellHeight,
    mode,
    panPaddingCells,
    depthStackHeight
  });
}
function clampCameraToBounds(args) {
  const {
    camera,
    viewportWidth,
    viewportHeight,
    gridWidth,
    gridHeight,
    cellWidth,
    cellHeight,
    mode,
    panPaddingCells,
    depthStackHeight
  } = args;
  if (viewportWidth <= 0 || viewportHeight <= 0 || camera.scale <= 0) {
    return camera;
  }
  const sceneWidth = Math.max(1, gridWidth * cellWidth);
  const sceneHeight = Math.max(1, gridHeight * cellHeight);
  const padX = panPaddingCells * cellWidth;
  const padY = panPaddingCells * cellHeight;
  const minWorldX = -padX;
  const maxWorldX = sceneWidth + padX;
  const minWorldY = -padY;
  const maxWorldY = sceneHeight + padY + (mode === "depth" ? depthStackHeight : 0);
  const minPanX = -maxWorldX;
  const maxPanX = viewportWidth / camera.scale - minWorldX;
  const minPanY = -maxWorldY;
  const maxPanY = viewportHeight / camera.scale - minWorldY;
  return {
    ...camera,
    panX: mode === "depth" ? 0 : clamp(camera.panX, minPanX, maxPanX),
    panY: clamp(camera.panY, minPanY, maxPanY)
  };
}
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function easeOutCubic(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}
function computeRecenterDurationMs(args) {
  const { from, to, scale, fallbackDurationMs } = args;
  const dxPx = (to.panX - from.panX) * scale;
  const dyPx = (to.panY - from.panY) * scale;
  const panDistancePx = Math.hypot(dxPx, dyPx);
  const zoomDistancePx = Math.abs(to.scale - from.scale) * 280;
  const focusDistancePx = Math.abs(to.focusDepth - from.focusDepth) * 120;
  const compositeDistancePx = panDistancePx + zoomDistancePx + focusDistancePx;
  const t = clamp(
    compositeDistancePx / 900,
    0,
    1
  );
  const distanceDuration = lerp(RECENTER_MIN_DURATION_MS, RECENTER_MAX_DURATION_MS, t);
  const configured = clamp(fallbackDurationMs * 0.72, RECENTER_MIN_DURATION_MS, RECENTER_MAX_DURATION_MS);
  return lerp(configured, distanceDuration, 0.55);
}
function computePerspectiveScale(zOffset, cameraPerspective) {
  const denom = cameraPerspective - zOffset;
  if (Math.abs(denom) < 1) {
    return zOffset > 0 ? 2.2 : 0.3;
  }
  const projected = cameraPerspective / denom;
  return clamp(projected, 0.3, 2.2);
}
function computeLayerInkAlpha(layerIndex, focusDepth, visual) {
  const base = visual.activeLayerInkAlpha;
  if (focusDepth < 0) {
    return clamp(base, visual.minimumInkAlpha, 1);
  }
  const distance = layerIndex - focusDepth;
  if (distance <= 0) {
    const t = clamp(Math.abs(distance), 0, 1);
    return clamp(lerp(base, visual.aboveLayerInkAlpha, t), visual.minimumInkAlpha, 1);
  }
  return clamp(
    base * Math.pow(visual.belowLayerInkDecayFactor, distance),
    visual.minimumInkAlpha,
    1
  );
}
function lerp(start, end, t) {
  return start + (end - start) * t;
}
function isCameraClose(a, b, epsilon) {
  return Math.abs(a.panX - b.panX) <= epsilon && Math.abs(a.panY - b.panY) <= epsilon && Math.abs(a.scale - b.scale) <= epsilon && Math.abs(a.focusDepth - b.focusDepth) <= epsilon;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export { LayeredGrid };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map