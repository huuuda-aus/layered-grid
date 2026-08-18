import { forwardRef, useRef, useState, useMemo, useImperativeHandle, useEffect, useCallback } from 'react';
import { jsxs, jsx } from 'react/jsx-runtime';

// src/react/LayeredGrid.tsx

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
var FAR_LAYER_VISIBILITY_CUTOFF = 0.02;
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
      className,
      style,
      externalEventSource,
      externalEvents,
      onLayerChangeIntent,
      onModeChangeIntent,
      onCellSelectIntent,
      onCameraChangeIntent,
      renderCellOverlay,
      renderLayerOverlay,
      renderToolbarExtras
    } = props;
    const viewportRef = useRef(null);
    const baseCanvasRef = useRef(null);
    const overlayCanvasRef = useRef(null);
    const hitCanvasRef = useRef(null);
    const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
    const panSessionRef = useRef(null);
    const hitRefLookup = useRef([]);
    const processedExternalEventKeysRef = useRef(/* @__PURE__ */ new Set());
    const mergedGeometry = useMemo(() => ({
      ...DEFAULT_GEOMETRY,
      ...geometry
    }), [geometry]);
    const mergedZoom = useMemo(() => ({
      ...DEFAULT_ZOOM,
      ...zoom
    }), [zoom]);
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
    const clampedScale = clamp(state.camera.scale, minScale, maxScale);
    const depthStackHeight = useMemo(
      () => Math.max(0, data.layers.length - 1) * (mergedGeometry.depthLayerDistance + mergedGeometry.normalLayerDistance),
      [data.layers.length, mergedGeometry.depthLayerDistance, mergedGeometry.normalLayerDistance]
    );
    const overlayCells = useMemo(() => {
      if (!activeLayer) {
        return [];
      }
      return Object.values(activeLayer.cells).map((cell) => {
        const cellId = resolveCellId(activeLayer.layerId, cell);
        return {
          layerId: activeLayer.layerId,
          row: cell.row,
          col: cell.col,
          cellId,
          visualId: resolveCellVisualId(cell),
          isActiveLayer: true,
          isSelected: state.selection.selectedCell?.layerId === activeLayer.layerId && state.selection.selectedCell.cellId === cellId,
          isTracked: state.selection.trackedCell?.layerId === activeLayer.layerId && state.selection.trackedCell.cellId === cellId,
          isHovered: false
        };
      });
    }, [activeLayer, state.selection.selectedCell, state.selection.trackedCell]);
    const activeLayerYOffset = useMemo(() => {
      if (activeLayerIndex < 0) {
        return 0;
      }
      return resolveLayerVisual({
        mode: state.mode,
        layerIndex: activeLayerIndex,
        focusLayerIndex: state.mode === "depth" ? 0 : activeLayerIndex,
        depthLayerDistance: mergedGeometry.depthLayerDistance,
        normalLayerDistance: mergedGeometry.normalLayerDistance
      }).yOffset;
    }, [
      activeLayerIndex,
      mergedGeometry.depthLayerDistance,
      mergedGeometry.normalLayerDistance,
      state.mode
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
        onLayerChangeIntent({
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
        onCameraChangeIntent({
          prevCamera: state.camera,
          nextCamera: centered,
          context
        });
        if (request.select !== false) {
          onCellSelectIntent({
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
          onModeChangeIntent({
            prevMode: state.mode,
            nextMode: "normal",
            context
          });
        }
        onLayerChangeIntent({
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
        onCameraChangeIntent({
          prevCamera: state.camera,
          nextCamera: centered,
          context
        });
        onCellSelectIntent({
          layerId: tracked.layerId,
          cell: tracked,
          context
        });
      },
      requestToggleDepthMode() {
        onModeChangeIntent({
          prevMode: state.mode,
          nextMode: state.mode === "depth" ? "normal" : "depth",
          context: nowContext("programmatic")
        });
      },
      requestSetLayer(layerId) {
        onLayerChangeIntent({
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
        onCameraChangeIntent({
          prevCamera: state.camera,
          nextCamera: centered,
          context: nowContext("programmatic")
        });
        onLayerChangeIntent({
          prevLayerId: state.activeLayerId,
          nextLayerId: cell.layerId,
          context: nowContext("programmatic")
        });
      }
    }), [
      onCameraChangeIntent,
      onCellSelectIntent,
      onLayerChangeIntent,
      onModeChangeIntent,
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
      if (!viewport || typeof ResizeObserver === "undefined") {
        return;
      }
      const update = () => {
        const rect = viewport.getBoundingClientRect();
        setViewportSize({
          width: Math.max(1, Math.floor(rect.width)),
          height: Math.max(1, Math.floor(rect.height))
        });
      };
      update();
      const observer = new ResizeObserver(() => update());
      observer.observe(viewport);
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (!externalEvents || externalEvents.length === 0) {
        return;
      }
      for (const event of externalEvents) {
        if (isDuplicateExternalEvent(event, processedExternalEventKeysRef.current)) {
          continue;
        }
        handleExternalEvent(event);
      }
    }, [externalEvents, handleExternalEvent]);
    useEffect(() => {
      if (!externalEventSource) {
        return;
      }
      return externalEventSource.subscribe((event) => {
        if (isDuplicateExternalEvent(event, processedExternalEventKeysRef.current)) {
          return;
        }
        handleExternalEvent(event);
      });
    }, [externalEventSource, handleExternalEvent]);
    useEffect(() => {
      const base = baseCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      const hit = hitCanvasRef.current;
      if (!base || !overlay || !hit) {
        return;
      }
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const widthPx = Math.max(1, Math.floor(viewportSize.width * dpr));
      const heightPx = Math.max(1, Math.floor(viewportSize.height * dpr));
      setupCanvas(base, viewportSize, widthPx, heightPx);
      setupCanvas(overlay, viewportSize, widthPx, heightPx);
      setupCanvas(hit, viewportSize, widthPx, heightPx);
      const baseCtx = base.getContext("2d");
      const overlayCtx = overlay.getContext("2d");
      const hitCtx = hit.getContext("2d", { willReadFrequently: true });
      if (!baseCtx || !overlayCtx || !hitCtx) {
        return;
      }
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hitCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.clearRect(0, 0, viewportSize.width, viewportSize.height);
      overlayCtx.clearRect(0, 0, viewportSize.width, viewportSize.height);
      hitCtx.clearRect(0, 0, viewportSize.width, viewportSize.height);
      hitRefLookup.current = [];
      for (let layerIndex = 0; layerIndex < data.layers.length; layerIndex += 1) {
        const layer = data.layers[layerIndex];
        if (!layer) {
          continue;
        }
        const visual = resolveLayerVisual({
          mode: state.mode,
          layerIndex,
          focusLayerIndex: state.mode === "depth" ? 0 : activeLayerIndex,
          depthLayerDistance: mergedGeometry.depthLayerDistance,
          normalLayerDistance: mergedGeometry.normalLayerDistance
        });
        if (visual.opacity <= FAR_LAYER_VISIBILITY_CUTOFF) {
          continue;
        }
        drawLayer(baseCtx, {
          layer,
          camera: { ...state.camera, scale: clampedScale },
          viewportSize,
          cellWidth,
          cellHeight,
          layerYOffset: visual.yOffset,
          opacity: visual.opacity,
          activeLayerId: state.activeLayerId,
          selectedCell: state.selection.selectedCell,
          trackedCell: state.selection.trackedCell
        });
        if (state.mode !== "depth" && layer.layerId === state.activeLayerId) {
          drawLayerToHitMap(hitCtx, {
            layer,
            camera: { ...state.camera, scale: clampedScale },
            viewportSize,
            cellWidth,
            cellHeight,
            layerYOffset: visual.yOffset,
            hitRefLookup: hitRefLookup.current
          });
        }
      }
    }, [
      activeLayerIndex,
      cellHeight,
      cellWidth,
      clampedScale,
      data.layers,
      mergedGeometry.depthLayerDistance,
      mergedGeometry.normalLayerDistance,
      state.activeLayerId,
      state.camera,
      state.mode,
      state.selection.selectedCell,
      state.selection.trackedCell,
      viewportSize
    ]);
    function handleExternalEvent(event) {
      switch (event.type) {
        case "action.layer": {
          onLayerChangeIntent({
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
          onModeChangeIntent({
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
          onCellSelectIntent({
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
          onLayerChangeIntent({
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
            onCellSelectIntent({
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
          onCameraChangeIntent({
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
      onCameraChangeIntent({
        prevCamera: state.camera,
        nextCamera: bounded,
        context: nowContext(reason)
      });
    }, [
      cellHeight,
      cellWidth,
      data.gridHeight,
      data.gridWidth,
      depthStackHeight,
      mergedZoom.panPaddingCells,
      onCameraChangeIntent,
      state.camera,
      state.mode,
      viewportSize.height,
      viewportSize.width
    ]);
    const onWheel = useCallback((event) => {
      event.preventDefault();
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const pointerX = state.mode === "depth" ? rect.width / 2 : event.clientX - rect.left;
      const pointerY = state.mode === "depth" ? rect.height / 2 : event.clientY - rect.top;
      const zoomIn = event.deltaY < 0;
      const factor = zoomIn ? mergedZoom.zoomStepFactor : 1 / mergedZoom.zoomStepFactor;
      const currentScale = clampedScale;
      const nextScale = clamp(currentScale * factor, minScale, maxScale);
      if (Math.abs(nextScale - currentScale) < 1e-4) {
        return;
      }
      const worldX = pointerX / currentScale - state.camera.panX;
      const worldY = pointerY / currentScale - state.camera.panY;
      const nextPanX = pointerX / nextScale - worldX;
      const nextPanY = pointerY / nextScale - worldY;
      applyCameraIntent({
        ...state.camera,
        scale: nextScale,
        panX: nextPanX,
        panY: nextPanY
      }, "pointer");
    }, [
      applyCameraIntent,
      clampedScale,
      maxScale,
      mergedZoom.zoomStepFactor,
      minScale,
      state.camera,
      state.mode
    ]);
    const onPointerDown = useCallback((event) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      panSessionRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startPanX: state.camera.panX,
        startPanY: state.camera.panY,
        moved: false
      };
    }, [state.camera.panX, state.camera.panY]);
    const onPointerMove = useCallback((event) => {
      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      if (!session.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        session.moved = true;
      }
      if (!session.moved) {
        return;
      }
      const panX = state.mode === "depth" ? session.startPanX : session.startPanX + dx / clampedScale;
      const panY = session.startPanY + dy / clampedScale;
      applyCameraIntent(
        {
          ...state.camera,
          panX,
          panY
        },
        "pointer"
      );
    }, [applyCameraIntent, clampedScale, state.camera, state.mode]);
    const onPointerUp = useCallback((event) => {
      const session = panSessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }
      panSessionRef.current = null;
      if (session.moved) {
        return;
      }
      if (state.mode === "depth") {
        return;
      }
      const hitCanvas = hitCanvasRef.current;
      const viewport = viewportRef.current;
      if (!hitCanvas || !viewport) {
        return;
      }
      const rect = viewport.getBoundingClientRect();
      const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
      const px = Math.floor((event.clientX - rect.left) * dpr);
      const py = Math.floor((event.clientY - rect.top) * dpr);
      const hitCtx = hitCanvas.getContext("2d", { willReadFrequently: true });
      if (!hitCtx) {
        return;
      }
      const pixel = hitCtx.getImageData(px, py, 1, 1).data;
      const hitIndex = decodeHitColor(pixel[0], pixel[1], pixel[2]);
      if (hitIndex <= 0) {
        return;
      }
      const hitCell = hitRefLookup.current[hitIndex - 1];
      if (!hitCell) {
        return;
      }
      onCellSelectIntent({
        layerId: hitCell.layerId,
        cell: hitCell,
        context: nowContext("pointer")
      });
    }, [onCellSelectIntent, state.mode]);
    const onKeyDown = useCallback((event) => {
      if (event.code === "PageDown") {
        event.preventDefault();
        const nextIndex = Math.min(data.layers.length - 1, activeLayerIndex + 1);
        const nextLayer = data.layers[nextIndex];
        if (!nextLayer || nextLayer.layerId === state.activeLayerId) {
          return;
        }
        onLayerChangeIntent({
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
        onLayerChangeIntent({
          prevLayerId: state.activeLayerId,
          nextLayerId: nextLayer.layerId,
          context: nowContext("keyboard")
        });
      }
    }, [activeLayerIndex, data.layers, onLayerChangeIntent, state.activeLayerId]);
    const viewportStyle = useMemo(
      () => ({
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 320,
        overflow: "hidden",
        background: "#262626",
        outline: "none"
      }),
      []
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
    return /* @__PURE__ */ jsxs("section", { className, style, children: [
      /* @__PURE__ */ jsxs("div", { children: [
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
            onWheel,
            onPointerDown,
            onPointerMove,
            onPointerUp
          }
        ),
        /* @__PURE__ */ jsx("canvas", { ref: hitCanvasRef, "aria-label": "Layered grid hit-map canvas", hidden: true }),
        renderCellOverlay ? overlayCells.map((cell) => {
          const left = (cell.col * cellWidth + state.camera.panX) * clampedScale;
          const top = (cell.row * cellHeight + state.camera.panY + activeLayerYOffset) * clampedScale;
          const width = cellWidth * clampedScale;
          const height = cellHeight * clampedScale;
          return /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                position: "absolute",
                pointerEvents: "none",
                left,
                top,
                width,
                height
              },
              children: renderCellOverlay(cell)
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
    opacity,
    activeLayerId,
    selectedCell,
    trackedCell
  } = args;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(0, layerYOffset * camera.scale);
  for (const cell of Object.values(layer.cells)) {
    const x = (cell.col * cellWidth + camera.panX) * camera.scale;
    const y = (cell.row * cellHeight + camera.panY) * camera.scale;
    const w = cellWidth * camera.scale;
    const h = cellHeight * camera.scale;
    if (x + w < 0 || y + h < 0 || x > viewportSize.width || y > viewportSize.height) {
      continue;
    }
    const cellId = resolveCellId(layer.layerId, cell);
    const isSelected = selectedCell?.layerId === layer.layerId && selectedCell.cellId === cellId;
    const isTracked = trackedCell?.layerId === layer.layerId && trackedCell.cellId === cellId;
    const isActiveLayer = layer.layerId === activeLayerId;
    ctx.lineWidth = Math.max(1, Math.floor(camera.scale));
    ctx.strokeStyle = isSelected || isTracked ? "rgba(255, 212, 0, 1)" : isActiveLayer ? "rgba(255, 255, 255, 0.82)" : "rgba(255, 255, 255, 0.42)";
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.font = `${Math.max(10, Math.round(12 * camera.scale))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(resolveCellVisualId(cell), x + w / 2, y + h / 2);
  }
  ctx.restore();
}
function drawLayerToHitMap(ctx, args) {
  const { layer, camera, viewportSize, cellWidth, cellHeight, layerYOffset, hitRefLookup } = args;
  ctx.save();
  ctx.translate(0, layerYOffset * camera.scale);
  for (const cell of Object.values(layer.cells)) {
    const x = (cell.col * cellWidth + camera.panX) * camera.scale;
    const y = (cell.row * cellHeight + camera.panY) * camera.scale;
    const w = cellWidth * camera.scale;
    const h = cellHeight * camera.scale;
    if (x + w < 0 || y + h < 0 || x > viewportSize.width || y > viewportSize.height) {
      continue;
    }
    const cellId = resolveCellId(layer.layerId, cell);
    const nextIndex = hitRefLookup.length + 1;
    hitRefLookup.push({
      layerId: layer.layerId,
      row: cell.row,
      col: cell.col,
      cellId
    });
    const color = encodeHitColor(nextIndex);
    ctx.fillStyle = `rgb(${color.r}, ${color.g}, ${color.b})`;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
function resolveLayerVisual(args) {
  const { mode, layerIndex, focusLayerIndex, depthLayerDistance, normalLayerDistance } = args;
  const delta = layerIndex - Math.max(0, focusLayerIndex);
  if (mode === "depth") {
    const depthOpacity = Math.max(0.2, 1 - layerIndex * 0.15);
    return {
      yOffset: layerIndex * (normalLayerDistance + depthLayerDistance),
      opacity: depthOpacity
    };
  }
  if (delta === 0) {
    return { yOffset: 0, opacity: 1 };
  }
  const normal = computeNormalDepthVisual(delta);
  return {
    yOffset: 0,
    opacity: normal.opacity
  };
}
function computeNormalDepthVisual(distance) {
  if (distance >= 0) {
    return {
      opacity: clamp(1 - distance * 0.35, 0, 1)
    };
  }
  const behind = Math.abs(distance);
  if (behind <= 1) {
    return {
      opacity: clamp(1 - 0.9 * easeInCubic(behind), 0, 1)
    };
  }
  return {
    opacity: clamp(0.1 - (behind - 1) * 0.1, 0, 1)
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
function encodeHitColor(index) {
  return {
    r: index & 255,
    g: index >> 8 & 255,
    b: index >> 16 & 255
  };
}
function decodeHitColor(r, g, b) {
  return r + (g << 8) + (b << 16);
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
function easeInCubic(t) {
  return t * t * t;
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export { LayeredGrid };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map