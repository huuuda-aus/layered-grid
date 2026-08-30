import {
  CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CameraChangeIntent,
  CameraState,
  CellRef,
  LayeredGridEffectsConfig,
  LayeredGridExternalEvent,
  LayeredGridGeometry,
  LayeredGridIntentContext,
  LayeredGridVisualConfig,
  LayeredGridZoomConfig,
} from "../core/types";
import {
  resolveLayeredGridEffectsConfig,
  resolveLayeredGridVisualConfig,
} from "../core/config";
import { cellKey, resolveCellId, resolveCellVisualId } from "../core/id";
import type {
  CellRenderParams,
  GoToCellRequest,
  LayeredGridHandle,
  LayeredGridRendererProps,
  LayerVisual,
} from "./types";

const DEFAULT_GEOMETRY: LayeredGridGeometry = {
  cellBaseSize: 126,
  cellAspectRatio: 1,
  depthLayerDistance: 100,
  normalLayerDistance: 8,
  depthRotationX: 80,
};

const DEFAULT_ZOOM: LayeredGridZoomConfig = {
  minVisibleCells: 2,
  maxVisibleCells: 6,
  zoomStepFactor: 1.14,
  panPaddingCells: 2,
};

const DRAG_THRESHOLD_PX = 3;
const DOUBLE_CLICK_MS = 350;
const DOUBLE_CLICK_PX = 12;
const ARROW_PAN_DURATION_MS = 200;
const RECENTER_MIN_DURATION_MS = 180;
const RECENTER_MAX_DURATION_MS = 300;
const RECENTER_END_SNAP_PROGRESS = 0.88;

type ViewportSize = {
  width: number;
  height: number;
};

type AnimatedView = {
  focusDepth: number;
  modeBlend: number;
};

type CameraIntentReason = LayeredGridIntentContext["reason"];

function nowContext(reason: LayeredGridIntentContext["reason"]): LayeredGridIntentContext {
  return { reason, timestamp: Date.now() };
}

export const LayeredGrid = forwardRef<LayeredGridHandle, LayeredGridRendererProps>(
  function LayeredGrid(props, ref) {
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
      onLayerVisualsChange,
    } = props;

    // Stabilize prop callbacks via refs so they never invalidate inner useCallbacks.
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

    const viewportRef = useRef<HTMLDivElement | null>(null);
    const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

    const [viewportSize, setViewportSize] = useState<ViewportSize>({ width: 1, height: 1 });
    const [animatedView, setAnimatedView] = useState<AnimatedView>(() => ({
      focusDepth: Number.isFinite(state.camera.focusDepth) ? state.camera.focusDepth : 0,
      modeBlend: state.mode === "depth" ? 1 : 0,
    }));
    const [hoveredCell, setHoveredCell] = useState<CellRef | null>(null);
    const lastPointerClientPosRef = useRef<{ x: number; y: number } | null>(null);
    const [isPointerInteractionActive, setIsPointerInteractionActive] = useState(false);
    const [isMomentumActive, setIsMomentumActive] = useState(false);
    const [cameraTweenFrame, setCameraTweenFrame] = useState<CameraState | null>(null);
    const panSessionRef = useRef<{
      pointerId: number;
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
      lastClientX: number;
      lastClientY: number;
      lastTime: number;
      velocityX: number;
      velocityY: number;
      moved: boolean;
      selectedCellOnDown: CellRef | null;
      isDoubleClick: boolean;
    } | null>(null);
    const lastPointerDownInfoRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const processedExternalEventKeysRef = useRef<Set<string>>(new Set());
    const transitionFrameRef = useRef<number | null>(null);
    const animatedViewRef = useRef<AnimatedView>(animatedView);
    const transitionFromRef = useRef<AnimatedView>(animatedView);
    const transitionStartTimeRef = useRef<number | null>(null);
    const interactionCameraRef = useRef<CameraState>(state.camera);
    const committedCameraRef = useRef<CameraState>(state.camera);
    const pointerCameraFrameRef = useRef<number | null>(null);
    const momentumFrameRef = useRef<number | null>(null);
    const recenterCameraFrameRef = useRef<number | null>(null);
    const recenterCameraStartTimeRef = useRef<number | null>(null);
    const recenterCameraFromRef = useRef<CameraState>(state.camera);
    const recenterCameraToRef = useRef<CameraState>(state.camera);
    const recenterPendingCommitRef = useRef<CameraState | null>(null);
    const suppressSelectionRecenterKeyRef = useRef<string | null>(null);
    const lastSelectionKeyRef = useRef<string | null>(
      state.selection.selectedCell
        ? `${state.selection.selectedCell.layerId}:${state.selection.selectedCell.cellId}`
        : state.selection.trackedCell
          ? `${state.selection.trackedCell.layerId}:${state.selection.trackedCell.cellId}`
          : null,
    );
    const queuedPointerCameraRef = useRef<{
      camera: CameraState;
      reason: CameraIntentReason;
    } | null>(null);

    const mergedGeometry = useMemo<LayeredGridGeometry>(() => ({
      ...DEFAULT_GEOMETRY,
      ...geometry,
    }), [geometry]);

    const mergedZoom = useMemo<LayeredGridZoomConfig>(() => ({
      ...DEFAULT_ZOOM,
      ...zoom,
    }), [zoom]);

    const mergedVisual = useMemo<LayeredGridVisualConfig>(() => resolveLayeredGridVisualConfig(visual), [visual]);

    const mergedEffects = useMemo<LayeredGridEffectsConfig>(() => resolveLayeredGridEffectsConfig(effects), [effects]);

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
      const map = new Map<string, (typeof data.layers)[number]>();
      for (const layer of data.layers) {
        map.set(layer.layerId, layer);
      }
      return map;
    }, [data.layers]);

    const activeLayer = layerById.get(state.activeLayerId);
    const activeLayerIndex = useMemo(() => data.layers.findIndex((layer) => layer.layerId === state.activeLayerId), [
      data.layers,
      state.activeLayerId,
    ]);

    const effectiveCamera = cameraTweenFrame ?? state.camera;
    const clampedScale = clamp(effectiveCamera.scale, minScale, maxScale);
    const displayCamera = useMemo<CameraState>(() => ({
      ...effectiveCamera,
      scale: clampedScale,
    }), [clampedScale, effectiveCamera]);
    const targetFocusDepth = state.mode === "depth"
      ? Math.max(0, activeLayerIndex)
      : Number.isFinite(state.camera.focusDepth)
        ? state.camera.focusDepth
        : Math.max(0, activeLayerIndex);
    const targetModeBlend = state.mode === "depth" ? 1 : 0;
    const isTransitionActive =
      Math.abs(animatedView.focusDepth - targetFocusDepth) >= mergedEffects.transitionEpsilon ||
      Math.abs(animatedView.modeBlend - targetModeBlend) >= mergedEffects.transitionEpsilon;
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

    function startMomentum(velocityX: number, velocityY: number) {
      stopMomentum();

      const minSpeed = 0.015;
      if (Math.hypot(velocityX, velocityY) < minSpeed) {
        return;
      }

      setIsMomentumActive(true);
      let currentVelocityX = velocityX;
      let currentVelocityY = velocityY;
      let lastTime = performance.now();

      const tick = (now: number) => {
        const dt = Math.max(1, now - lastTime);
        lastTime = now;

        const friction = Math.pow(0.92, dt / 16.67);
        const camera = interactionCameraRef.current;
        const nextCamera: CameraState = {
          ...camera,
          panX: state.mode === "depth" ? camera.panX : camera.panX + currentVelocityX * dt,
          panY: camera.panY + currentVelocityY * dt,
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
      [data.layers.length, mergedGeometry.depthLayerDistance, mergedGeometry.normalLayerDistance],
    );

    // Every layer's cells, not just the active one — a consumer overlay
    // (e.g. a marker on a layer you're not currently looking at) needs to be
    // positionable anywhere, using that layer's own live transform below.
    // renderCellOverlay itself decides what (if anything) to actually draw
    // for a given cell, same as before; this just widens which cells it's
    // asked about.
    const overlayCells = useMemo<CellRenderParams[]>(() => {
      if (!renderCellOverlay) {
        return [];
      }

      const cells: CellRenderParams[] = [];
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
            isSelected:
              state.selection.selectedCell?.layerId === layer.layerId &&
              state.selection.selectedCell.cellId === cellId,
            isTracked:
              state.selection.trackedCell?.layerId === layer.layerId &&
              state.selection.trackedCell.cellId === cellId,
            isHovered:
              hoveredCell?.layerId === layer.layerId &&
              hoveredCell.cellId === cellId,
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
      renderCellOverlay,
    ]);

    const activeLayerVisual = useMemo(() => {
      if (activeLayerIndex < 0) {
        return {
          yOffset: 0,
          zOffset: 0,
          projectedScale: 1,
          opacity: 1,
          blur: 0,
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
        cameraPerspective: mergedEffects.cameraPerspective,
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
      mergedGeometry.normalLayerDistance,
    ]);

    // Same per-layer visual (yOffset/zOffset/projectedScale/opacity), but
    // for every layer, keyed by id — lets a cell overlay on a layer other
    // than the active one still be positioned correctly, and follow the
    // same live-animated tween (animatedView.focusDepth) driving the
    // active layer's own transition, instead of snapping or drifting out
    // of sync with it.
    const layerVisualById = useMemo(() => {
      const map = new Map<string, ReturnType<typeof resolveLayerVisual>>();
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
            cameraPerspective: mergedEffects.cameraPerspective,
          }),
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
      mergedGeometry.normalLayerDistance,
    ]);

    useEffect(() => {
      if (!onLayerVisualsChangeRef.current) {
        return;
      }
      const visuals: Record<string, LayerVisual> = {};
      layerVisualById.forEach((visual, layerId) => {
        visuals[layerId] = visual;
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
          modeBlend: targetModeBlend,
        };
        animatedViewRef.current = next;
        setAnimatedView(next);
        return;
      }

      const tick = (now: number) => {
        if (transitionStartTimeRef.current === null) {
          transitionStartTimeRef.current = now;
        }

        const elapsed = now - transitionStartTimeRef.current;
        const rawProgress = clamp(elapsed / mergedEffects.transitionDurationMs, 0, 1);
        const easedProgress = easeInOutCubic(rawProgress);
        const from = transitionFromRef.current;

        const nextFocus = lerp(from.focusDepth, targetFocusDepth, easedProgress);
        const nextBlend = lerp(from.modeBlend, targetModeBlend, easedProgress);

        const next: AnimatedView = {
          focusDepth: Math.abs(nextFocus - targetFocusDepth) < mergedEffects.transitionEpsilon
            ? targetFocusDepth
            : nextFocus,
          modeBlend: Math.abs(nextBlend - targetModeBlend) < mergedEffects.transitionEpsilon
            ? targetModeBlend
            : nextBlend,
        };

        animatedViewRef.current = next;
        setAnimatedView((prev) => (
          prev.focusDepth === next.focusDepth && prev.modeBlend === next.modeBlend ? prev : next
        ));

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
      targetModeBlend,
    ]);

    useImperativeHandle(ref, () => ({
      requestGoToCell(request: GoToCellRequest) {
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
          context,
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
          depthStackHeight,
        });

        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context,
        });

        if (request.select !== false) {
          onCellSelectIntentRef.current({
            layerId: layer.layerId,
            cell: {
              layerId: layer.layerId,
              row: request.row,
              col: request.col,
              cellId,
            },
            context,
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
            context,
          });
        }

        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: tracked.layerId,
          context,
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
          depthStackHeight,
        });

        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context,
        });

        onCellSelectIntentRef.current({
          layerId: tracked.layerId,
          cell: tracked,
          context,
        });
      },
      requestToggleDepthMode() {
        onModeChangeIntentRef.current({
          prevMode: state.mode,
          nextMode: state.mode === "depth" ? "normal" : "depth",
          context: nowContext("programmatic"),
        });
      },
      requestSetLayer(layerId: string) {
        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: layerId,
          context: nowContext("programmatic"),
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
          depthStackHeight,
        });

        onCameraChangeIntentRef.current({
          prevCamera: state.camera,
          nextCamera: centered,
          context: nowContext("programmatic"),
        });

        onLayerChangeIntentRef.current({
          prevLayerId: state.activeLayerId,
          nextLayerId: cell.layerId,
          context: nowContext("programmatic"),
        });
      },
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
      layerById,
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
        setViewportSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
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

        const visual = resolveLayerVisual({
          layerIndex,
          focusDepth: animatedView.focusDepth,
          modeBlend: animatedView.modeBlend,
          depthLayerDistance: mergedGeometry.depthLayerDistance,
          normalLayerDistance: mergedGeometry.normalLayerDistance,
          deeperLayerOpacityFalloff: mergedEffects.deeperLayerOpacityFalloff,
          previousLayerOpacity: mergedEffects.previousLayerOpacity,
          normalModeLayerZStep: mergedEffects.normalModeLayerZStep,
          cameraPerspective: mergedEffects.cameraPerspective,
        });

        if (visual.opacity <= mergedEffects.farLayerVisibilityCutoff) {
          continue;
        }

        drawLayer(baseCtx, {
          layer,
          camera: displayCamera,
          viewportSize,
          cellWidth,
          cellHeight,
          layerYOffset: visual.yOffset,
          layerZOffset: visual.zOffset,
          projectedScale: visual.projectedScale,
          opacity: visual.opacity,
          blur: shouldDisableBlur ? 0 : visual.blur,
          layerIndex,
          focusDepth: animatedView.focusDepth,
          selectedCell: state.selection.selectedCell,
          trackedCell: state.selection.trackedCell,
          visual: mergedVisual,
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
      viewportSize,
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
          visual: mergedVisual,
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
      viewportSize,
    ]);

    const handleExternalEventRef = useRef(handleExternalEvent);
    handleExternalEventRef.current = handleExternalEvent;

    function handleExternalEvent(event: LayeredGridExternalEvent) {
      switch (event.type) {
        case "action.layer": {
          onLayerChangeIntentRef.current({
            prevLayerId: state.activeLayerId,
            nextLayerId: event.payload.layerId,
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision,
            },
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
              revision: event.revision,
            },
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
              cellId: resolveCellId(layer.layerId, cell),
            },
            context: {
              reason: "external-action",
              timestamp: event.timestamp,
              revision: event.revision,
            },
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
              revision: event.revision,
            },
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
                cellId: resolveCellId(layer.layerId, cell),
              },
              context: {
                reason: "external-action",
                timestamp: event.timestamp,
                revision: event.revision,
              },
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
              revision: event.revision,
            },
          });
          break;
        }
        case "draw.overlay":
        default:
          break;
      }
    }

    const applyCameraIntent = useCallback((nextCamera: CameraChangeIntent["nextCamera"], reason: LayeredGridIntentContext["reason"]) => {
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
        depthStackHeight,
      });

      interactionCameraRef.current = bounded;

      if (reason === "pointer") {
        queuedPointerCameraRef.current = {
          camera: bounded,
          reason,
        };

        if (pointerCameraFrameRef.current === null) {
          pointerCameraFrameRef.current = requestAnimationFrame(() => {
            pointerCameraFrameRef.current = null;
            const queued = queuedPointerCameraRef.current;
            if (!queued) {
              return;
            }

            queuedPointerCameraRef.current = null;
            // Preserve focusDepth from the latest committed camera so a mid-flight
            // layer switch cannot overwrite state.camera.focusDepth.
            const nextCamera = {
              ...queued.camera,
              focusDepth: committedCameraRef.current.focusDepth,
            };
            onCameraChangeIntentRef.current({
              prevCamera: committedCameraRef.current,
              nextCamera,
              context: nowContext(queued.reason),
            });
            committedCameraRef.current = nextCamera;
          });
        }

        return;
      }

      queuedPointerCameraRef.current = null;
      onCameraChangeIntentRef.current({
        prevCamera: committedCameraRef.current,
        nextCamera: bounded,
        context: nowContext(reason),
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
      viewportSize.width,
    ]);

    const animateCameraIntent = useCallback((targetCamera: CameraState, reason: CameraIntentReason) => {
      stopRecenteringAnimation();

      const from = interactionCameraRef.current;
      const delta = Math.max(
        Math.abs(from.panX - targetCamera.panX),
        Math.abs(from.panY - targetCamera.panY),
        Math.abs(from.scale - targetCamera.scale),
        Math.abs(from.focusDepth - targetCamera.focusDepth),
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
        fallbackDurationMs: mergedEffects.transitionDurationMs,
      });
      recenterCameraStartTimeRef.current = performance.now() - 16.67;

      const tick = (now: number) => {
        const startTime = recenterCameraStartTimeRef.current ?? now;
        const elapsed = now - startTime;
        const rawProgress = clamp(elapsed / recenterDurationMs, 0, 1);
        const easedProgress = rawProgress >= RECENTER_END_SNAP_PROGRESS
          ? 1
          : easeOutCubic(rawProgress / RECENTER_END_SNAP_PROGRESS);
        const start = recenterCameraFromRef.current;
        const end = recenterCameraToRef.current;

        const bounded = clampCameraToBounds({
          camera: {
          panX: lerp(start.panX, end.panX, easedProgress),
          panY: lerp(start.panY, end.panY, easedProgress),
          scale: lerp(start.scale, end.scale, easedProgress),
          focusDepth: lerp(start.focusDepth, end.focusDepth, easedProgress),
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight,
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
            focusDepth: committedCameraRef.current.focusDepth,
          };
          onCameraChangeIntentRef.current({
            prevCamera: committedCameraRef.current,
            nextCamera: animateCommit,
            context: nowContext(reason),
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
      viewportSize.width,
    ]);

    const animateCameraIntentRef = useRef(animateCameraIntent);
    animateCameraIntentRef.current = animateCameraIntent;

    const animateSelectionZoomFromPointer = useCallback((args: {
      row: number;
      col: number;
      pointerClientX: number;
      pointerClientY: number;
      reason: CameraIntentReason;
    }) => {
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
          depthStackHeight,
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
        depthStackHeight,
      });

      if (Math.abs(targetScale - startScale) < mergedEffects.transitionEpsilon) {
        animateCameraIntent(targetCentered, args.reason);
        return;
      }

      const pointer = mapClientPointToViewport({
        clientX: args.pointerClientX,
        clientY: args.pointerClientY,
        viewport,
        viewportSize,
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
        fallbackDurationMs: mergedEffects.transitionDurationMs,
      });

      recenterCameraStartTimeRef.current = performance.now() - 16.67;

      const tick = (now: number) => {
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
            panY: pointerY / scale - clickWorldY,
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight,
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
          depthStackHeight,
        });

        const blended = clampCameraToBounds({
          camera: {
            ...from,
            scale,
            panX: lerp(clickAnchored.panX, centeredAtScale.panX, motionProgress),
            panY: lerp(clickAnchored.panY, centeredAtScale.panY, motionProgress),
            focusDepth: lerp(from.focusDepth, targetCentered.focusDepth, motionProgress),
          },
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          gridWidth: data.gridWidth,
          gridHeight: data.gridHeight,
          cellWidth,
          cellHeight,
          mode: state.mode,
          panPaddingCells: mergedZoom.panPaddingCells,
          depthStackHeight,
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
          focusDepth: committedCameraRef.current.focusDepth,
        };
        onCameraChangeIntentRef.current({
          prevCamera: committedCameraRef.current,
          nextCamera: zoomCommit,
          context: nowContext(args.reason),
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
      viewportSize.width,
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
        depthStackHeight,
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
      viewportSize.width,
    ]);

    const onWheel = useCallback((event: WheelEvent) => {
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
        viewportSize,
      });
      if (!pointer) {
        return;
      }
      const pointerX = state.mode === "depth" ? viewportSize.width / 2 : pointer.x;
      const pointerY = state.mode === "depth" ? viewportSize.height / 2 : pointer.y;

      const currentScale = clamp(camera.scale, minScale, maxScale);
      const factor = Math.exp(-event.deltaY * 0.0018);
      const nextScale = clamp(currentScale * factor, minScale, maxScale);

      if (Math.abs(nextScale - currentScale) < 0.0001) {
        return;
      }

      const selectedOnActiveLayer =
        state.selection.selectedCell &&
        state.selection.selectedCell.layerId === state.activeLayerId
          ? state.selection.selectedCell
          : null;

      const trackedOnActiveLayer =
        state.selection.trackedCell &&
        state.selection.trackedCell.layerId === state.activeLayerId
          ? state.selection.trackedCell
          : null;

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
          depthStackHeight,
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
        panY: nextPanY,
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
      cellWidth,
    ]);

    useEffect(() => {
      const overlay = overlayCanvasRef.current;
      if (!overlay) {
        return;
      }

      const handleWheel = (event: WheelEvent) => {
        onWheel(event);
      };

      overlay.addEventListener("wheel", handleWheel, { passive: false });
      return () => {
        overlay.removeEventListener("wheel", handleWheel);
      };
    }, [onWheel]);

    const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
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

      // A rapid second click near the same spot is treated as a double-click,
      // which is reserved for panning (drag-to-pan) rather than selection —
      // needed on devices without a middle-mouse/wheel-drag pan gesture.
      const lastDown = lastPointerDownInfoRef.current;
      const isDoubleClick =
        event.button === 0 &&
        !!lastDown &&
        now - lastDown.time <= DOUBLE_CLICK_MS &&
        Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) <= DOUBLE_CLICK_PX;
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
        isDoubleClick,
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
        layerVisual: activeLayerVisual,
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
          reason: "pointer",
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
        context: nowContext("pointer"),
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
      viewportSize,
    ]);

    const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
      if (lockCamera) {
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }

      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        updateHoveredCellFromPointer(event.clientX, event.clientY);
        return;
      }

      // Recover gracefully if pointer-up happened outside capture and session got stranded.
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
          panY,
        },
        "pointer",
      );
      setHoveredCell(null);
      // Note: updateHoveredCellFromPointer (called above in every early-return
      // branch) closes over activeLayer/displayCamera/activeLayerVisual/
      // cellWidth/cellHeight/viewportSize — all listed below even though this
      // function body doesn't reference them directly, otherwise this
      // callback goes stale (frozen at whichever layer was active when it was
      // last actually recreated) the moment none of the other deps change,
      // which is exactly what happens once panning is locked.
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
      viewportSize,
    ]);

    const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
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
        layerVisual: activeLayerVisual,
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
          depthStackHeight,
        });

        animateCameraIntent(centered, "programmatic");
      }
      lastSelectionKeyRef.current = `${hitCell.layerId}:${hitCell.cellId}`;

      onCellSelectIntentRef.current({
        layerId: hitCell.layerId,
        cell: hitCell,
        context: nowContext("pointer"),
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
      viewportSize,
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

    function updateHoveredCellFromPointer(clientX: number, clientY: number) {
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
        layerVisual: activeLayerVisual,
      });

      setHoveredCell((prev) => {
        if (
          prev?.layerId === nextHovered?.layerId &&
          prev?.cellId === nextHovered?.cellId
        ) {
          return prev;
        }

        return nextHovered;
      });
    }

    // Hover is normally recomputed on pointermove, but any non-pointer camera
    // move (keyboard pan, wheel zoom, programmatic recenter) shifts the grid
    // under a stationary cursor — without this, the hovered cell stays stuck
    // at its pre-pan position while its on-screen location moves, so the
    // highlighted cell drifts away from the actual cursor. Re-run the same
    // hit test against the last known pointer position once the move settles.
    // Deliberately keyed off the *committed* control state (state.camera),
    // not the per-frame animated displayCamera/activeLayerVisual — those tick
    // on every animation frame (pan tween, layer-switch transition) and
    // recomputing hover that often stacks a hit-test + setState on top of the
    // canvas redraw every frame, which is what was causing the pan animation
    // itself to visibly stutter.
    useEffect(() => {
      const pos = lastPointerClientPosRef.current;
      if (!pos || isPointerInteractionActive) {
        return;
      }
      updateHoveredCellFromPointer(pos.x, pos.y);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.camera, state.activeLayerId, state.mode]);

    const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
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
          context: nowContext("keyboard"),
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
          context: nowContext("keyboard"),
        });
      }

      // Arrow-key panning — the primary pan gesture for pointer/touch devices
      // without a middle-mouse/wheel-drag pan gesture. Disabled in depth mode,
      // matching drag-pan's own behavior there (horizontal pan is a no-op and
      // layer navigation already owns PageUp/PageDown in that mode).
      //
      // This deliberately does NOT interpolate camera state frame-by-frame
      // (that re-renders and redraws both canvases ~12 times over 200ms,
      // which is heavy with the CRT filter active and reads as choppy). The
      // real camera state jumps straight to its final value in one redraw;
      // the motion is faked with a CSS transform on the viewport element
      // rewound by the pixel delta and then transitioned back to identity —
      // that's a compositor-only animation, no JS or canvas work per frame.
      // Hover intentionally goes stale for the duration of the transition
      // (it resolves once the transform settles via the effect above).
      if (
        !lockCamera &&
        state.mode !== "depth" &&
        (event.code === "ArrowUp" ||
          event.code === "ArrowDown" ||
          event.code === "ArrowLeft" ||
          event.code === "ArrowRight")
      ) {
        event.preventDefault();
        stopMomentum();
        stopRecenteringAnimation();

        const el = viewportRef.current;
        if (el) {
          // Cancel any in-flight rewind so repeated key presses don't stack
          // transforms — each press starts from a fresh, settled baseline.
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
          depthStackHeight,
        });

        const screenDX = (target.panX - camera.panX) * camera.scale;
        const screenDY = (target.panY - camera.panY) * camera.scale;

        interactionCameraRef.current = target;
        committedCameraRef.current = target;
        onCameraChangeIntentRef.current({
          prevCamera: camera,
          nextCamera: target,
          context: nowContext("keyboard"),
        });

        if (el && (screenDX !== 0 || screenDY !== 0)) {
          el.style.transform = `translate(${-screenDX}px, ${-screenDY}px)`;
          // Force a reflow so the rewound position is actually applied
          // before the transition below kicks in — otherwise the browser
          // may coalesce both style writes into a single frame and skip
          // straight to the end state with no visible animation.
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
      viewportSize.width,
    ]);

    const viewportStyle = useMemo<CSSProperties>(
      () => ({
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 320,
        overflow: "hidden",
        background: mergedVisual.backgroundColor,
        outline: "none",
      }),
      [mergedVisual.backgroundColor],
    );

    const canvasStyle = useMemo<CSSProperties>(
      () => ({
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
      }),
      [],
    );

    const hudStyle = useMemo<CSSProperties>(
      () => ({
        position: "absolute",
        top: 8,
        left: 8,
        zIndex: 2,
        pointerEvents: "none",
      }),
      [],
    );

    return (
      <section className={className} style={{ position: "relative", ...style }}>
        <div style={hudStyle}>
          <div>Active cell: {state.selection.trackedCell ? `${state.selection.trackedCell.layerId}-${state.selection.trackedCell.cellId}` : "-"}</div>
          {renderToolbarExtras ? renderToolbarExtras(state) : null}
        </div>

        <div ref={viewportRef} style={viewportStyle} tabIndex={0} onKeyDown={onKeyDown}>
          <canvas ref={baseCanvasRef} style={canvasStyle} aria-label="Layered grid base canvas" />
          <canvas
            ref={overlayCanvasRef}
            style={canvasStyle}
            aria-label="Layered grid overlay canvas"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
          />

          {renderCellOverlay
            ? overlayCells.map((cell) => {
                const content = renderCellOverlay(cell);
                if (content == null) {
                  return null;
                }

                const visual = layerVisualById.get(cell.layerId) ?? activeLayerVisual;
                const left = (cell.col * cellWidth + effectiveCamera.panX) * clampedScale;
                const top = (cell.row * cellHeight + effectiveCamera.panY + visual.yOffset) * clampedScale;
                const baseWidth = cellWidth * clampedScale;
                const baseHeight = cellHeight * clampedScale;
                const centerX = viewportSize.width / 2;
                const centerY = viewportSize.height / 2;
                const width = baseWidth * visual.projectedScale;
                const height = baseHeight * visual.projectedScale;
                const projectedLeft = centerX + (left - centerX) * visual.projectedScale;
                const projectedTop = centerY + (top - centerY) * visual.projectedScale;
                return (
                  <div
                    key={cell.cellId}
                    style={{
                      position: "absolute",
                      pointerEvents: "none",
                      left: projectedLeft,
                      top: projectedTop,
                      width,
                      height,
                      opacity: visual.opacity,
                    }}
                  >
                    {content}
                  </div>
                );
              })
            : null}

          {activeLayer && renderLayerOverlay ? renderLayerOverlay(activeLayer.layerId) : null}
        </div>
      </section>
    );
  },
);

function setupCanvas(canvas: HTMLCanvasElement, viewportSize: ViewportSize, widthPx: number, heightPx: number): void {
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

function drawLayer(
  ctx: CanvasRenderingContext2D,
  args: {
    layer: {
      layerId: string;
      cells: Record<string, { row: number; col: number; label?: string; visualId?: string; cellId?: string }>;
    };
    camera: { panX: number; panY: number; scale: number };
    viewportSize: ViewportSize;
    cellWidth: number;
    cellHeight: number;
    layerYOffset: number;
    layerZOffset: number;
    projectedScale: number;
    opacity: number;
    blur: number;
    layerIndex: number;
    focusDepth: number;
    selectedCell: CellRef | null;
    trackedCell: CellRef | null;
    visual: LayeredGridVisualConfig;
  },
): void {
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
    visual,
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

function drawOverlayLabels(
  ctx: CanvasRenderingContext2D,
  args: {
    layer: {
      layerId: string;
      cells: Record<string, { row: number; col: number; label?: string; visualId?: string; cellId?: string }>;
    };
    camera: { panX: number; panY: number; scale: number };
    viewportSize: ViewportSize;
    cellWidth: number;
    cellHeight: number;
    layerYOffset: number;
    layerZOffset: number;
    projectedScale: number;
    opacity: number;
    hoveredCell: CellRef | null;
    selectedCell: CellRef | null;
    trackedCell: CellRef | null;
    visual: LayeredGridVisualConfig;
  },
): void {
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
    visual,
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
        projectedScale,
      });
      if (hoverRect) {
        if (visual.hoverFillOpacity > 0) {
          ctx.fillStyle = visual.hoverFillColor;
          ctx.globalAlpha = opacity * visual.hoverFillOpacity;
          ctx.fillRect(hoverRect.x, hoverRect.y, hoverRect.w, hoverRect.h);
        }
        ctx.strokeStyle = visual.hoverFillColor;
        ctx.lineWidth = Math.max(0.5, visual.strokeWidthAtScale1 * camera.scale);
        ctx.globalAlpha = opacity;
        ctx.strokeRect(hoverRect.x, hoverRect.y, hoverRect.w, hoverRect.h);
      }
    }
  }

  if (!visual.showCellLabels) {
    ctx.restore();
    return;
  }

  const labelCells = collectLabelTargetCells({
    layer,
    hoveredCell,
    selectedCell,
    trackedCell,
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
      projectedScale,
    });

    if (!rect) {
      continue;
    }

    ctx.fillText(resolveCellVisualId(cell), rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  ctx.restore();
}

function applyTintToDrawnPixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tintColor: string,
): void {
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = tintColor;
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function collectLabelTargetCells(args: {
  layer: {
    layerId: string;
    cells: Record<string, { row: number; col: number; label?: string; visualId?: string; cellId?: string }>;
  };
  hoveredCell: CellRef | null;
  selectedCell: CellRef | null;
  trackedCell: CellRef | null;
}): Array<{ row: number; col: number; label?: string; visualId?: string; cellId?: string }> {
  const { layer, hoveredCell, selectedCell, trackedCell } = args;
  const keys = new Set<string>();
  const targets: Array<{ row: number; col: number; label?: string; visualId?: string; cellId?: string }> = [];

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

function findCellAtClientPoint(args: {
  clientX: number;
  clientY: number;
  viewport: HTMLDivElement | null;
  layer: { layerId: string; cells: Record<string, { row: number; col: number; cellId?: string }> } | undefined;
  camera: CameraState;
  viewportSize: ViewportSize;
  cellWidth: number;
  cellHeight: number;
  layerVisual: { yOffset: number; zOffset: number; projectedScale: number };
}): CellRef | null {
  const { clientX, clientY, viewport, layer, camera, viewportSize, cellWidth, cellHeight, layerVisual } = args;
  if (!viewport || !layer) {
    return null;
  }

  const local = mapClientPointToViewport({
    clientX,
    clientY,
    viewport,
    viewportSize,
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
      projectedScale: layerVisual.projectedScale,
    });

    if (!projected) {
      continue;
    }

    if (
      localX >= projected.x &&
      localX <= projected.x + projected.w &&
      localY >= projected.y &&
      localY <= projected.y + projected.h
    ) {
      return {
        layerId: layer.layerId,
        row: cell.row,
        col: cell.col,
        cellId: resolveCellId(layer.layerId, cell),
      };
    }
  }

  return null;
}

function mapClientPointToViewport(args: {
  clientX: number;
  clientY: number;
  viewport: HTMLDivElement;
  viewportSize: ViewportSize;
}): { x: number; y: number } | null {
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
    y: (clientY - rect.top) * scaleY,
  };
}

function projectCellRect(args: {
  row: number;
  col: number;
  camera: { panX: number; panY: number; scale: number };
  viewportSize: ViewportSize;
  cellWidth: number;
  cellHeight: number;
  layerYOffset: number;
  layerZOffset: number;
  projectedScale: number;
}): { x: number; y: number; w: number; h: number } | null {
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

function resolveLayerVisual(args: {
  layerIndex: number;
  focusDepth: number;
  modeBlend: number;
  depthLayerDistance: number;
  normalLayerDistance: number;
  deeperLayerOpacityFalloff: number;
  previousLayerOpacity: number;
  normalModeLayerZStep: number;
  cameraPerspective: number;
}): { yOffset: number; zOffset: number; projectedScale: number; opacity: number; blur: number } {
  const {
    layerIndex,
    focusDepth,
    modeBlend,
    depthLayerDistance,
    normalLayerDistance,
    deeperLayerOpacityFalloff,
    previousLayerOpacity,
    normalModeLayerZStep,
    cameraPerspective,
  } = args;
  const delta = layerIndex - Math.max(0, focusDepth);

  const normal = computeNormalDepthVisual(delta, deeperLayerOpacityFalloff, previousLayerOpacity);
  const normalZ = (Math.max(0, focusDepth) - layerIndex) * normalModeLayerZStep;
  const depth = {
    yOffset: layerIndex * normalLayerDistance,
    zOffset: -layerIndex * depthLayerDistance,
    opacity: Math.max(0.2, 1 - layerIndex * 0.15),
    blur: Math.max(0, layerIndex * 0.35),
  };

  const t = clamp(modeBlend, 0, 1);
  const zOffset = lerp(normalZ, depth.zOffset, t);
  return {
    yOffset: lerp(0, depth.yOffset, t),
    zOffset,
    projectedScale: computePerspectiveScale(zOffset, cameraPerspective),
    opacity: lerp(normal.opacity, depth.opacity, t),
    blur: lerp(normal.blur, depth.blur, t),
  };
}

function computeNormalDepthVisual(
  distance: number,
  deeperLayerOpacityFalloff: number,
  previousLayerOpacity: number,
): { opacity: number; blur: number } {
  if (distance >= 0) {
    return {
      opacity: clamp(1 - distance * deeperLayerOpacityFalloff, 0, 1),
      blur: Math.max(0, distance * 1.5),
    };
  }

  const behind = Math.abs(distance);

  if (behind <= 1) {
    // Linear, not eased — an ease-in curve here keeps the outgoing layer
    // near-full opacity for most of the transition then drops it almost
    // entirely in the final stretch, which reads as an abrupt disappearance
    // rather than a fade.
    return {
      opacity: clamp(1 - (1 - previousLayerOpacity) * behind, 0, 1),
      blur: lerp(0, 2.4, behind),
    };
  }

  return {
    opacity: clamp(previousLayerOpacity - (behind - 1) * previousLayerOpacity, 0, 1),
    blur: 2.4 + (behind - 1) * 1.2,
  };
}

function isDuplicateExternalEvent(event: LayeredGridExternalEvent, seen: Set<string>): boolean {
  const key = event.revision != null
    ? `rev:${event.revision}`
    : `evt:${event.type}:${event.timestamp}:${JSON.stringify(event.payload)}`;

  if (seen.has(key)) {
    return true;
  }

  seen.add(key);

  if (seen.size > 4000) {
    const next = new Set(Array.from(seen).slice(-2000));
    seen.clear();
    for (const item of next) {
      seen.add(item);
    }
  }

  return false;
}

function centerCameraOnCell(args: {
  row: number;
  col: number;
  current: CameraChangeIntent["nextCamera"];
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  cellWidth: number;
  cellHeight: number;
  gridWidth: number;
  gridHeight: number;
  mode: "normal" | "depth";
  panPaddingCells: number;
  depthStackHeight: number;
}): CameraChangeIntent["nextCamera"] {
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
    depthStackHeight,
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
      panY,
    },
    viewportWidth,
    viewportHeight,
    gridWidth,
    gridHeight,
    cellWidth,
    cellHeight,
    mode,
    panPaddingCells,
    depthStackHeight,
  });
}

function clampCameraToBounds(args: {
  camera: CameraChangeIntent["nextCamera"];
  viewportWidth: number;
  viewportHeight: number;
  gridWidth: number;
  gridHeight: number;
  cellWidth: number;
  cellHeight: number;
  mode: "normal" | "depth";
  panPaddingCells: number;
  depthStackHeight: number;
}): CameraChangeIntent["nextCamera"] {
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
    depthStackHeight,
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
    panY: clamp(camera.panY, minPanY, maxPanY),
  };
}

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function computeRecenterDurationMs(args: {
  from: CameraState;
  to: CameraState;
  scale: number;
  fallbackDurationMs: number;
}): number {
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
    1,
  );

  const distanceDuration = lerp(RECENTER_MIN_DURATION_MS, RECENTER_MAX_DURATION_MS, t);
  const configured = clamp(fallbackDurationMs * 0.72, RECENTER_MIN_DURATION_MS, RECENTER_MAX_DURATION_MS);
  return lerp(configured, distanceDuration, 0.55);
}

function computePerspectiveScale(zOffset: number, cameraPerspective: number): number {
  const denom = cameraPerspective - zOffset;
  if (Math.abs(denom) < 1) {
    return zOffset > 0 ? 2.2 : 0.3;
  }

  const projected = cameraPerspective / denom;
  return clamp(projected, 0.3, 2.2);
}

function computeLayerInkAlpha(
  layerIndex: number,
  focusDepth: number,
  visual: LayeredGridVisualConfig,
): number {
  const base = visual.activeLayerInkAlpha;
  if (focusDepth < 0) {
    return clamp(base, visual.minimumInkAlpha, 1);
  }

  // Driven by the continuous, animated focus depth (not the discrete active
  // layer index) so ink alpha fades in step with the layer-switch transition
  // instead of snapping the instant the active layer changes — otherwise a
  // bright active-layer alpha (e.g. 1) visibly jump-cuts to the dim
  // above/below value before any fade has a chance to play.
  const distance = layerIndex - focusDepth;

  if (distance <= 0) {
    const t = clamp(Math.abs(distance), 0, 1);
    return clamp(lerp(base, visual.aboveLayerInkAlpha, t), visual.minimumInkAlpha, 1);
  }

  return clamp(
    base * Math.pow(visual.belowLayerInkDecayFactor, distance),
    visual.minimumInkAlpha,
    1,
  );
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function isCameraClose(a: CameraState, b: CameraState, epsilon: number): boolean {
  return (
    Math.abs(a.panX - b.panX) <= epsilon &&
    Math.abs(a.panY - b.panY) <= epsilon &&
    Math.abs(a.scale - b.scale) <= epsilon &&
    Math.abs(a.focusDepth - b.focusDepth) <= epsilon
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
