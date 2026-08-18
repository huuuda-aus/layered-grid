import { useEffect, useMemo, useRef, useState } from "react";
import { LayeredGrid } from "../../src/react";
import { cellKey, createInitialControlledState, normalizeLayeredGridData, resolveCellId } from "../../src/core";
import type {
  CameraChangeIntent,
  CellSelectIntent,
  LayerChangeIntent,
  LayeredGridControlledState,
  LayeredGridData,
  LayeredGridExternalEvent,
  ModeChangeIntent,
} from "../../src/core";
import type { LayeredGridExternalEventSource } from "../../src/react/types";
import { GRID_VISUAL_CONFIG } from "./gridTheme";
import { GRID_EFFECTS_CONFIG } from "./gridEffects";

type EventListener = (event: LayeredGridExternalEvent) => void;

const TINT_PRESETS = [
  { label: "None", value: "transparent" },
  { label: "Cool Cyan", value: "rgba(75, 227, 194, 0.08)" },
  { label: "Amber CRT", value: "rgba(255, 166, 64, 0.12)" },
  { label: "Matrix Green", value: "rgba(96, 255, 128, 0.1)" },
  { label: "Violet Haze", value: "rgba(174, 119, 255, 0.1)" },
  { label: "Blood Red", value: "rgba(255, 76, 76, 0.09)" },
] as const;

class DemoEventBus implements LayeredGridExternalEventSource {
  private listeners = new Set<EventListener>();
  private revision = 1;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: Omit<LayeredGridExternalEvent, "revision" | "timestamp">): void {
    const enriched = {
      ...event,
      revision: this.revision++,
      timestamp: Date.now(),
    } as LayeredGridExternalEvent;

    for (const listener of this.listeners) {
      listener(enriched);
    }
  }
}

export function App() {
  const data = useMemo(() => normalizeLayeredGridData(makeDemoData()), []);
  const [state, setState] = useState<LayeredGridControlledState>(() => createInitialControlledState(data));
  const [logLines, setLogLines] = useState<string[]>([]);
  const [autoStream, setAutoStream] = useState(false);
  const [shaderMode, setShaderMode] = useState<"off" | "tv" | "crt">("crt");
  const [selectedTint, setSelectedTint] = useState<string>(GRID_VISUAL_CONFIG.globalTintColor ?? "transparent");

  const eventBusRef = useRef(new DemoEventBus());
  const timerRef = useRef<number | null>(null);

  const pushLog = (line: string) => {
    setLogLines((prev) => [line, ...prev].slice(0, 10));
  };

  const onLayerChangeIntent = (intent: LayerChangeIntent) => {
    const nextLayerIndex = Math.max(0, data.layers.findIndex((layer) => layer.layerId === intent.nextLayerId));
    setState((prev) => ({
      ...prev,
      activeLayerId: intent.nextLayerId,
      camera: {
        ...prev.camera,
        focusDepth: nextLayerIndex,
      },
    }));
    pushLog(`layer -> ${intent.nextLayerId} (${intent.context.reason})`);
  };

  const onModeChangeIntent = (intent: ModeChangeIntent) => {
    setState((prev) => ({ ...prev, mode: intent.nextMode }));
    pushLog(`mode -> ${intent.nextMode} (${intent.context.reason})`);
  };

  const onCellSelectIntent = (intent: CellSelectIntent) => {
    setState((prev) => ({
      ...prev,
      selection: {
        trackedCell: intent.cell,
        selectedCell: intent.cell,
      },
    }));
    pushLog(`select -> ${intent.cell.layerId}/${intent.cell.cellId}`);
  };

  const onCameraChangeIntent = (intent: CameraChangeIntent) => {
    setState((prev) => ({ ...prev, camera: intent.nextCamera }));
  };

  const goToRandomCell = () => {
    const layer = data.layers[Math.floor(Math.random() * data.layers.length)];
    const values = Object.values(layer.cells);
    if (values.length === 0) {
      return;
    }
    const chosen = values[Math.floor(Math.random() * values.length)];
    eventBusRef.current.emit({
      type: "action.goto",
      payload: {
        layerId: layer.layerId,
        row: chosen.row,
        col: chosen.col,
        select: true,
      },
    });
  };

  const triggerModeToggle = () => {
    eventBusRef.current.emit({
      type: "action.mode",
      payload: {
        mode: state.mode === "depth" ? "normal" : "depth",
      },
    });
  };

  const startStopStream = () => {
    if (autoStream) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      timerRef.current = null;
      setAutoStream(false);
      pushLog("stream -> stopped");
      return;
    }

    timerRef.current = window.setInterval(() => {
      goToRandomCell();
    }, 500);
    setAutoStream(true);
    pushLog("stream -> 500ms");
  };

  const cycleShaderMode = () => {
    setShaderMode((prev) => {
      if (prev === "off") {
        return "tv";
      }
      if (prev === "tv") {
        return "crt";
      }
      return "off";
    });
  };

  const visualConfig = useMemo(() => ({
    ...GRID_VISUAL_CONFIG,
    globalTintColor: selectedTint,
  }), [selectedTint]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="demo-page">
      <header className="hero">
        <h1>Layered Grid Controlled Demo</h1>
        <p>
          Host controls state, component emits intents, and external actions stream through
          <strong> externalEventSource</strong>.
        </p>
      </header>

      <div className="toolbar">
        <button onClick={goToRandomCell}>External: Random GoTo</button>
        <button onClick={triggerModeToggle}>External: Toggle Mode</button>
        <button onClick={startStopStream}>{autoStream ? "Stop 500ms Stream" : "Start 500ms Stream"}</button>
        <button onClick={cycleShaderMode}>
          Shader: {shaderMode.toUpperCase()} (cycle)
        </button>
        <label className="toolbar-field" htmlFor="tint-select">
          Tint
          <select
            id="tint-select"
            value={selectedTint}
            onChange={(event) => setSelectedTint(event.target.value)}
          >
            {TINT_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="layout">
        <section className={`grid-shell${shaderMode !== "off" ? " tv-mode" : ""}${shaderMode === "crt" ? " tv-mode-crt" : ""}`}>
          <LayeredGrid
            data={data}
            state={state}
            externalEventSource={eventBusRef.current}
            visual={visualConfig}
            effects={GRID_EFFECTS_CONFIG}
            zoom={{
              minVisibleCells: 2,
              maxVisibleCells: 20,
            }}
            geometry={{
              cellBaseSize: 52,
              cellAspectRatio: 1.5,
              depthLayerDistance: 200,
              normalLayerDistance: 8,
            }}
            onLayerChangeIntent={onLayerChangeIntent}
            onModeChangeIntent={onModeChangeIntent}
            onCellSelectIntent={onCellSelectIntent}
            onCameraChangeIntent={onCameraChangeIntent}
            renderToolbarExtras={(gridState) => (
              <span className="chip">mode: {gridState.mode}</span>
            )}
          />
        </section>

        <aside className="panel">
          <h2>State</h2>
          <pre>{JSON.stringify(state, null, 2)}</pre>
          <h2>Recent Intents</h2>
          <ul>
            {logLines.map((line, index) => (
              <li key={`${line}-${index}`}>{line}</li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function makeDemoData(): LayeredGridData {
  const rows = 20;
  const cols = 30;
  const layers = 3;

  const firstLayerMatrix = createDemoLayerMatrix(rows, cols);
  const gridData = Array.from({ length: layers }, () =>
    firstLayerMatrix.map((row) => [...row]),
  );

  return {
    version: 1,
    gridWidth: cols,
    gridHeight: rows,
    layers: gridData.map((matrix, layerIndex) => {
      const layerId = `layer-${layerIndex + 1}`;
      const cells: LayeredGridData["layers"][number]["cells"] = {};

      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (!matrix[row]?.[col]) {
            continue;
          }

          const key = cellKey(row, col);
          const visualId = `${String.fromCharCode(65 + row)}${col + 1}`;
          cells[key] = {
            row,
            col,
            walkable: true,
            label: visualId,
            visualId,
            cellId: resolveCellId(layerId, { row, col }),
          };
        }
      }

      return {
        layerId,
        layerLabel: `L${layerIndex + 1}`,
        rows,
        cols,
        cells,
      };
    }),
  };
}

function createDemoLayerMatrix(rows: number, cols: number): number[][] {
  const matrix = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      const topBand = row >= 2 && row <= 5 && col >= 3 && col <= 26;
      const middleBand = row >= 6 && row <= 13 && col >= 1 && col <= 28;
      const lowerBand = row >= 14 && row <= 17 && col >= 5 && col <= 24;

      const carveUpperLeft = row >= 2 && row <= 4 && col >= 3 && col <= 6;
      const carveUpperRight = row >= 2 && row <= 4 && col >= 23 && col <= 26;
      const carveLowerLeft = row >= 14 && row <= 17 && col >= 5 && col <= 8;
      const carveLowerRight = row >= 14 && row <= 17 && col >= 21 && col <= 24;
      const carveCenter = row >= 8 && row <= 11 && col >= 12 && col <= 17;

      const bridgeLeft = row >= 7 && row <= 12 && col >= 4 && col <= 7;
      const bridgeRight = row >= 7 && row <= 12 && col >= 22 && col <= 25;
      const spine = row >= 5 && row <= 15 && col >= 13 && col <= 16;

      const filled = topBand || middleBand || lowerBand || bridgeLeft || bridgeRight || spine;
      const carved = carveUpperLeft || carveUpperRight || carveLowerLeft || carveLowerRight || carveCenter;

      return filled && !carved ? 1 : 0;
    }),
  );

  return matrix;
}
