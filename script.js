const MAX_LAYERS = 5;
const CELL_BASE_SIZE = 126;
const DEFAULT_CELL_ASPECT_RATIO = 1;
const CELL_ASPECT_RATIO = 1.5;
const CELL_HEIGHT = CELL_BASE_SIZE;
const CELL_WIDTH = CELL_BASE_SIZE * CELL_ASPECT_RATIO;
const LAYER_Z_STEP = 480;
const LAYER_Y_STEP = 8;
const MIN_VISIBLE_CELLS = 6;
const MAX_VISIBLE_CELLS = 2;
const ZOOM_STEP_FACTOR = 1.14;
const PAN_PADDING_CELLS = 2;
const PAN_DRAG_THRESHOLD_PX = 3;
const BASE_ROTATION_X = 0;
const DEPTH_ROTATION_X = 80;
const DEPTH_MODE_LAYER_Z_STEP = 100;
const LAYER_TRANSITION_MS = 320;
const FAR_LAYER_VISIBILITY_CUTOFF = 0.02;

const gridData = [
  [
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 1],
  ],
  [
    [1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1, 0],
  ],
  [
    [0, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 0, 0],
  ],
  [
    [0, 0, 1, 1, 0, 0, 0],
    [0, 1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 0, 0, 0],
  ],
  [
    [0, 0, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
].slice(0, MAX_LAYERS);

const appState = {
  activeLayer: 0,
  isDepthMode: false,
  panX: 0,
  panY: 0,
  scale: 1,
  selectedCell: null,
  isPanning: false,
  panButton: null,
  panMoved: false,
  suppressClick: false,
  pointerStartX: 0,
  pointerStartY: 0,
  panStartX: 0,
  panStartY: 0,
  focusDepth: 0,
  minScale: 1,
  maxScale: 1,
  trackedCell: null,
  trackedLayer: null,
  layerElements: [],
  layerTransition: null,
  layerTransitionFrame: null,
};

const viewport = document.getElementById("viewport");
const scene = document.getElementById("scene");
const gridStack = document.getElementById("gridStack");
const depthToggle = document.getElementById("depthToggle");
const backToActiveButton = document.getElementById("backToActive");
const activeCellLabel = document.getElementById("activeCellLabel");
const statusLabel = document.getElementById("statusLabel");

const shape = resolveGridBounds(gridData);
setupDimensions();
renderLayers();
wireEvents();
refreshZoomBounds();
appState.scale = appState.minScale;
centerViewOnPoint(getActiveAnchorPoint());
refreshView();

window.layeredGrid = {
  goToCell,
  setDepthMode,
  setActiveLayer,
};

function resolveGridBounds(layers) {
  let maxRows = 0;
  let maxCols = 0;

  for (const layer of layers) {
    maxRows = Math.max(maxRows, layer.length);
    for (const row of layer) {
      maxCols = Math.max(maxCols, row.length);
    }
  }

  return { maxRows, maxCols };
}

function setupDimensions() {
  const width = shape.maxCols * CELL_WIDTH;
  const height = shape.maxRows * CELL_HEIGHT;

  scene.style.width = `${width}px`;
  scene.style.height = `${height}px`;
  gridStack.style.width = `${width}px`;
  gridStack.style.height = `${height}px`;
}

function renderLayers() {
  const fragment = document.createDocumentFragment();

  for (let layerIndex = 0; layerIndex < gridData.length; layerIndex += 1) {
    const layerData = gridData[layerIndex];
    const layer = document.createElement("ul");
    layer.className = "layer";
    layer.dataset.layerIndex = String(layerIndex);
    layer.dataset.depthLabel = `L${layerIndex + 1}`;
    layer.style.gridTemplateColumns = `repeat(${shape.maxCols}, ${CELL_WIDTH}px)`;
    layer.style.gridTemplateRows = `repeat(${shape.maxRows}, ${CELL_HEIGHT}px)`;

    for (let row = 0; row < shape.maxRows; row += 1) {
      for (let col = 0; col < shape.maxCols; col += 1) {
        const exists = Boolean(layerData[row] && layerData[row][col]);
        const cell = document.createElement("li");
        cell.className = exists ? "cell" : "cell is-void";
        cell.dataset.exists = String(exists);
        cell.dataset.layer = String(layerIndex);
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.textContent = exists ? `${String.fromCharCode(65 + row)}${col + 1}` : "";
        layer.appendChild(cell);
      }
    }

    fragment.appendChild(layer);
  }

  gridStack.replaceChildren(fragment);
  appState.layerElements = Array.from(gridStack.querySelectorAll(".layer"));
}

function wireEvents() {
  viewport.addEventListener("wheel", onWheelZoom, { passive: false });
  viewport.addEventListener("mousedown", onPanStart);
  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanEnd);
  window.addEventListener("keydown", onKeyNavigation);
  window.addEventListener("resize", onResize);

  gridStack.addEventListener("click", (event) => {
    if (appState.suppressClick) {
      appState.suppressClick = false;
      return;
    }

    if (appState.isDepthMode) {
      return;
    }

    const cell = event.target.closest(".cell");
    if (!cell || cell.dataset.exists !== "true") {
      return;
    }

    const layer = Number(cell.dataset.layer);
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);

    if (layer !== appState.activeLayer) {
      return;
    }

    appState.trackedCell = { row, col };
    appState.trackedLayer = layer;
    appState.selectedCell = { layer, row, col };
    refreshLayerVisuals();
    updateToolbarState();
  });

  depthToggle.addEventListener("click", () => {
    setDepthMode(!appState.isDepthMode);
  });

  backToActiveButton.addEventListener("click", () => {
    returnToTrackedCell();
  });
}

function onWheelZoom(event) {
  event.preventDefault();

  const direction = event.deltaY < 0 ? 1 : -1;

  if (appState.isDepthMode) {
    const nextDepthScale = clamp(
      appState.scale * (direction > 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR),
      appState.minScale,
      appState.maxScale,
    );

    if (Math.abs(nextDepthScale - appState.scale) < 0.0001) {
      return;
    }

    appState.scale = nextDepthScale;
    refreshSceneTransform();
    return;
  }

  const nextScale = clamp(
    appState.scale * (direction > 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR),
    appState.minScale,
    appState.maxScale,
  );

  if (Math.abs(nextScale - appState.scale) < 0.0001) {
    return;
  }

  appState.scale = nextScale;
  centerViewOnPoint(getActiveAnchorPoint());
  refreshSceneTransform();
}

function onKeyNavigation(event) {
  if (event.code === "PageDown") {
    event.preventDefault();
    setActiveLayer(appState.activeLayer + 1);
    return;
  }

  if (event.code === "PageUp") {
    event.preventDefault();
    setActiveLayer(appState.activeLayer - 1);
    return;
  }

  if (event.code === "KeyD") {
    setDepthMode(!appState.isDepthMode);
  }
}

function onPanStart(event) {
  if (event.button !== 0 && event.button !== 1) {
    return;
  }

  event.preventDefault();
  appState.isPanning = true;
  appState.panButton = event.button;
  appState.panMoved = false;
  appState.pointerStartX = event.clientX;
  appState.pointerStartY = event.clientY;
  appState.panStartX = event.clientX - appState.panX;
  appState.panStartY = event.clientY - appState.panY;
  viewport.classList.add("is-panning");
}

function onPanMove(event) {
  if (!appState.isPanning) {
    return;
  }

  const pointerDeltaX = event.clientX - appState.pointerStartX;
  const pointerDeltaY = event.clientY - appState.pointerStartY;

  if (!appState.panMoved) {
    const dragDistance = Math.hypot(pointerDeltaX, pointerDeltaY);
    if (dragDistance >= PAN_DRAG_THRESHOLD_PX) {
      appState.panMoved = true;
    }
  }

  if (appState.isDepthMode) {
    appState.panY = event.clientY - appState.panStartY;
  } else {
    appState.panX = event.clientX - appState.panStartX;
    appState.panY = event.clientY - appState.panStartY;
  }

  clampPanToBounds();
  refreshSceneTransform();
}

function onPanEnd() {
  if (!appState.isPanning) {
    return;
  }

  if (appState.panButton === 0 && appState.panMoved) {
    appState.suppressClick = true;
  }

  appState.isPanning = false;
  appState.panButton = null;
  appState.panMoved = false;
  viewport.classList.remove("is-panning");
}

function onResize() {
  refreshZoomBounds();

  if (appState.isDepthMode) {
    appState.scale = clamp(computeDepthFitScale(), appState.minScale, appState.maxScale);
  } else {
    appState.scale = clamp(appState.scale, appState.minScale, appState.maxScale);
    centerViewOnPoint(getActiveAnchorPoint());
  }

  refreshSceneTransform();
}

function setActiveLayer(nextLayer) {
  const bounded = clamp(nextLayer, 0, gridData.length - 1);
  if (bounded === appState.activeLayer) {
    return;
  }

  if (!appState.isDepthMode) {
    startLayerTransition(bounded);
    return;
  }

  appState.activeLayer = bounded;
  refreshView();
}

function setDepthMode(enabled) {
  if (appState.isDepthMode === enabled) {
    return;
  }

  stopLayerTransition();
  appState.isDepthMode = enabled;
  viewport.classList.toggle("depth-mode", enabled);

  if (enabled) {
    appState.panX = 0;
    appState.scale = clamp(computeDepthFitScale(), appState.minScale, appState.maxScale);
  } else {
    appState.focusDepth = appState.activeLayer;
    refreshZoomBounds();
    appState.scale = clamp(appState.scale, appState.minScale, appState.maxScale);
    centerViewOnPoint(getActiveAnchorPoint());
  }

  refreshView();
}

function refreshView() {
  refreshLayerVisuals();
  refreshSceneTransform();
  updateToolbarState();
}

function updateToolbarState() {
  const trackedLayerId = typeof appState.trackedLayer === "number" ? appState.trackedLayer + 1 : "-";
  const trackedCellId = appState.trackedCell
    ? formatCellId(appState.trackedCell.row, appState.trackedCell.col)
    : "-";

  activeCellLabel.textContent = `Active cell: ${trackedLayerId}-${trackedCellId}`;
  statusLabel.textContent = `Active layer: ${appState.activeLayer + 1} / ${gridData.length}`;
  depthToggle.textContent = `Depth Check: ${appState.isDepthMode ? "On" : "Off"}`;
  depthToggle.setAttribute("aria-pressed", String(appState.isDepthMode));
  backToActiveButton.disabled = !canReturnToTrackedCell();
}

function refreshLayerVisuals() {
  const layers = appState.layerElements;
  const focusDepth = appState.isDepthMode ? appState.activeLayer : appState.focusDepth;

  for (const layer of layers) {
    const index = Number(layer.dataset.layerIndex);
    const zStep = appState.isDepthMode ? DEPTH_MODE_LAYER_Z_STEP : LAYER_Z_STEP;
    const zOffset = appState.isDepthMode
      ? -index * zStep
      : (focusDepth - index) * zStep;
    const yOffset = appState.isDepthMode ? index * LAYER_Y_STEP : 0;
    const distance = index - focusDepth;
    const isCurrent = index === appState.activeLayer && !appState.isDepthMode;
    const isBelow = distance > 0;

    layer.classList.remove("is-active", "is-below", "is-inactive-top");

    if (appState.isDepthMode) {
      layer.style.opacity = String(Math.max(0.2, 1 - index * 0.15));
      layer.style.filter = `blur(${index * 0.35}px)`;
      layer.style.transform = `translate3d(0, ${yOffset}px, ${zOffset}px)`;
      layer.style.pointerEvents = "none";
      setCellEnableState(layer, false);
      continue;
    }

    if (isCurrent) {
      layer.classList.add("is-active");
      layer.style.opacity = "1";
      layer.style.filter = "blur(0px)";
      layer.style.transform = `translate3d(0, ${yOffset}px, ${zOffset}px)`;
      layer.style.pointerEvents = "auto";
      setCellEnableState(layer, true);
    } else {
      const visual = computeNormalDepthVisual(distance);
      layer.classList.add(isBelow ? "is-below" : "is-inactive-top");

      if (visual.opacity <= FAR_LAYER_VISIBILITY_CUTOFF) {
        layer.style.opacity = "0";
        layer.style.filter = "blur(0px)";
      } else {
        layer.style.opacity = String(visual.opacity);
        layer.style.filter = `blur(${visual.blur}px)`;
      }

      layer.style.transform = `translate3d(0, ${yOffset}px, ${zOffset}px)`;
      layer.style.pointerEvents = "none";
      setCellEnableState(layer, false);
    }
  }

  paintSelection();
}

function startLayerTransition(toLayer) {
  stopLayerTransition();
  viewport.classList.add("is-layer-transitioning");
  const fromDepth = appState.focusDepth;
  const toDepth = toLayer;

  if (Math.abs(fromDepth - toDepth) < 0.001) {
    appState.focusDepth = toDepth;
    appState.activeLayer = toLayer;
    refreshView();
    return;
  }

  appState.activeLayer = toLayer;
  appState.layerTransition = {
    fromDepth,
    toDepth,
    startTime: performance.now(),
    duration: LAYER_TRANSITION_MS,
  };

  const tick = (now) => {
    if (!appState.layerTransition) {
      return;
    }

    const elapsed = now - appState.layerTransition.startTime;
    const rawProgress = clamp(elapsed / appState.layerTransition.duration, 0, 1);
    const eased = easeInOutCubic(rawProgress);
    appState.focusDepth = lerp(
      appState.layerTransition.fromDepth,
      appState.layerTransition.toDepth,
      eased,
    );
    refreshView();

    if (rawProgress < 1) {
      appState.layerTransitionFrame = requestAnimationFrame(tick);
      return;
    }

    appState.focusDepth = appState.layerTransition.toDepth;
    stopLayerTransition();
    refreshView();
  };

  appState.layerTransitionFrame = requestAnimationFrame(tick);
}

function stopLayerTransition() {
  viewport.classList.remove("is-layer-transitioning");

  if (appState.layerTransitionFrame) {
    cancelAnimationFrame(appState.layerTransitionFrame);
    appState.layerTransitionFrame = null;
  }

  appState.layerTransition = null;
}

function setCellEnableState(layerElement, enabled) {
  const cells = layerElement.querySelectorAll(".cell");
  for (const cell of cells) {
    cell.dataset.enabled = String(enabled && cell.dataset.exists === "true");
  }
}

function paintSelection() {
  const selected = appState.selectedCell;
  const cells = gridStack.querySelectorAll(".cell");

  for (const cell of cells) {
    const isSelected =
      selected &&
      Number(cell.dataset.layer) === selected.layer &&
      Number(cell.dataset.row) === selected.row &&
      Number(cell.dataset.col) === selected.col;

    cell.classList.toggle("is-selected", Boolean(isSelected));
  }
}

function refreshSceneTransform() {
  clampPanToBounds();

  const rotation = appState.isDepthMode ? DEPTH_ROTATION_X : BASE_ROTATION_X;
  scene.style.transform =
    `translate(-50%, -50%) ` +
    `translate(${appState.panX}px, ${appState.panY}px) ` +
    `rotateX(${rotation}deg) scale(${appState.scale})`;
  gridStack.style.transform = "translateZ(0px)";
}

function hasCellAt(layer, row, col) {
  return Boolean(gridData[layer] && gridData[layer][row] && gridData[layer][row][col]);
}

function canReturnToTrackedCell() {
  if (!appState.trackedCell) {
    return false;
  }

  const layerToReturn = resolveTrackedCellLayer();
  if (layerToReturn === null) {
    return false;
  }

  return true;
}

function resolveTrackedCellLayer() {
  if (!appState.trackedCell) {
    return null;
  }

  const { row, col } = appState.trackedCell;

  if (
    typeof appState.trackedLayer === "number" &&
    hasCellAt(appState.trackedLayer, row, col)
  ) {
    return appState.trackedLayer;
  }

  if (hasCellAt(appState.activeLayer, row, col)) {
    return appState.activeLayer;
  }

  for (let layer = 0; layer < gridData.length; layer += 1) {
    if (hasCellAt(layer, row, col)) {
      return layer;
    }
  }

  return null;
}

function returnToTrackedCell() {
  const layer = resolveTrackedCellLayer();
  if (layer === null || !appState.trackedCell) {
    return false;
  }

  if (appState.isDepthMode) {
    setDepthMode(false);
  }

  const { row, col } = appState.trackedCell;
  return goToCell(layer, row, col);
}

function computeDepthFitScale() {
  const viewportRect = viewport.getBoundingClientRect();
  const sceneWidth = scene.clientWidth;
  const sceneHeight = scene.clientHeight + gridData.length * LAYER_Y_STEP;

  if (!viewportRect.width || !viewportRect.height || !sceneWidth || !sceneHeight) {
    return 0.85;
  }

  const widthRatio = (viewportRect.width * 0.82) / sceneWidth;
  const heightRatio = (viewportRect.height * 0.82) / sceneHeight;
  return clamp(Math.min(widthRatio, heightRatio), 0.4, 1);
}

function refreshZoomBounds() {
  appState.minScale = computeScaleForVisibleCells(MIN_VISIBLE_CELLS);
  appState.maxScale = computeScaleForVisibleCells(MAX_VISIBLE_CELLS);

  if (appState.minScale > appState.maxScale) {
    const swap = appState.minScale;
    appState.minScale = appState.maxScale;
    appState.maxScale = swap;
  }
}

function computeScaleForVisibleCells(cellCount) {
  const viewportRect = viewport.getBoundingClientRect();
  if (!viewportRect.width || !viewportRect.height || !cellCount) {
    return 1;
  }

  const scaleByWidth = (viewportRect.width * 0.92) / (CELL_WIDTH * cellCount);
  const scaleByHeight = (viewportRect.height * 0.92) / (CELL_HEIGHT * cellCount);
  return clamp(Math.min(scaleByWidth, scaleByHeight), 0.25, 12);
}

function getActiveAnchorPoint() {
  if (appState.trackedCell) {
    return {
      x: appState.trackedCell.col * CELL_WIDTH + CELL_WIDTH / 2,
      y: appState.trackedCell.row * CELL_HEIGHT + CELL_HEIGHT / 2,
    };
  }

  if (appState.selectedCell && appState.selectedCell.layer === appState.activeLayer) {
    return {
      x: appState.selectedCell.col * CELL_WIDTH + CELL_WIDTH / 2,
      y: appState.selectedCell.row * CELL_HEIGHT + CELL_HEIGHT / 2,
    };
  }

  const fallbackCell = gridStack.querySelector(
    `.cell[data-layer="${appState.activeLayer}"][data-exists="true"]`,
  );

  if (fallbackCell) {
    return {
      x: Number(fallbackCell.dataset.col) * CELL_WIDTH + CELL_WIDTH / 2,
      y: Number(fallbackCell.dataset.row) * CELL_HEIGHT + CELL_HEIGHT / 2,
    };
  }

  return {
    x: scene.clientWidth / 2,
    y: scene.clientHeight / 2,
  };
}

function centerViewOnPoint(point) {
  const offsetX = point.x - scene.clientWidth / 2;
  const offsetY = point.y - scene.clientHeight / 2;
  appState.panX = -offsetX * appState.scale;
  appState.panY = -offsetY * appState.scale;
  clampPanToBounds();
}

function clampPanToBounds() {
  const viewportRect = viewport.getBoundingClientRect();
  const sceneWidth = scene.clientWidth;
  const sceneHeight = scene.clientHeight;

  if (!viewportRect.width || !viewportRect.height || !sceneWidth || !sceneHeight) {
    return;
  }

  const depthStackHeight = (gridData.length - 1) * (DEPTH_MODE_LAYER_Z_STEP + LAYER_Y_STEP);
  const effectiveHeight = appState.isDepthMode ? sceneHeight + depthStackHeight : sceneHeight;
  const paddedHeight = effectiveHeight + 2 * CELL_HEIGHT * PAN_PADDING_CELLS;
  const paddedWidthWithPadding = sceneWidth + 2 * CELL_WIDTH * PAN_PADDING_CELLS;
  const maxPanX = Math.max(0, (paddedWidthWithPadding * appState.scale - viewportRect.width) / 2);
  const maxPanY = Math.max(0, (paddedHeight * appState.scale - viewportRect.height) / 2);

  appState.panX = appState.isDepthMode ? 0 : clamp(appState.panX, -maxPanX, maxPanX);
  appState.panY = clamp(appState.panY, -maxPanY, maxPanY);
}

function goToCell(layer, row, col, options = {}) {
  const targetLayer = clamp(layer, 0, gridData.length - 1);
  const targetExists = Boolean(gridData[targetLayer][row] && gridData[targetLayer][row][col]);

  if (!targetExists) {
    return false;
  }

  setActiveLayer(targetLayer);

  const target = gridStack.querySelector(
    `.cell[data-layer="${targetLayer}"][data-row="${row}"][data-col="${col}"]`,
  );

  if (!target) {
    return false;
  }

  appState.trackedCell = { row, col };
  appState.trackedLayer = targetLayer;

  if (!appState.isDepthMode && options.select !== false) {
    appState.selectedCell = { layer: targetLayer, row, col };
    paintSelection();
  }

  centerViewOnPoint({
    x: col * CELL_WIDTH + CELL_WIDTH / 2,
    y: row * CELL_HEIGHT + CELL_HEIGHT / 2,
  });
  refreshSceneTransform();
  updateToolbarState();

  return true;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function computeNormalDepthVisual(distance) {
  if (distance >= 0) {
    return {
      opacity: clamp(1 - distance * 0.35, 0, 1),
      blur: Math.max(0, distance * 1.5),
    };
  }

  const behind = Math.abs(distance);

  if (behind <= 1) {
    return {
      // Keep the outgoing layer visible while it moves through camera depth.
      opacity: clamp(1 - 0.9 * easeInCubic(behind), 0, 1),
      blur: lerp(0, 2.4, behind),
    };
  }

  return {
    opacity: clamp(0.1 - (behind - 1) * 0.1, 0, 1),
    blur: 2.4 + (behind - 1) * 1.2,
  };
}

function easeInCubic(t) {
  return t ** 3;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t ** 3 : 1 - ((-2 * t + 2) ** 3) / 2;
}

function formatCellId(row, col) {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}
