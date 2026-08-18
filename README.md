# @huuuda-aus/layered-grid

Layered game grid renderer for React + TypeScript.

This package provides a controlled layered-grid component with a canvas renderer, depth and normal viewing modes, external event ingestion, and configurable styling and effects.

## Status

Current implementation includes:
- controlled React renderer
- canvas-based grid drawing
- layer switching
- normal/depth presentation
- pointer selection
- pan and zoom interactions
- external event stream support
- external visual/effects configuration
- demo host for local testing

Current implementation does not yet include:
- sprite or atlas rendering
- rich overlay draw event rendering
- full production docs for every field and reducer pattern

## Package Exports

- `@huuuda-aus/layered-grid/react`
- `@huuuda-aus/layered-grid/core`

## Install

```bash
npm install @huuuda-aus/layered-grid react react-dom
```

Peer requirements:
- `react >= 18`
- `react-dom >= 18`

## Architecture

The renderer is fully controlled.

That means:
- your host application owns the authoritative grid state
- the component emits intents
- your host applies those intents and re-renders with updated state

The component does not mutate authoritative game state internally.

## React Usage

```tsx
import { useMemo, useState } from "react";
import { LayeredGrid } from "@huuuda-aus/layered-grid/react";
import {
	createInitialControlledState,
	normalizeLayeredGridData,
	resolveLayeredGridEffectsConfig,
	resolveLayeredGridVisualConfig,
} from "@huuuda-aus/layered-grid/core";

const rawData = {
	version: 1,
	gridWidth: 7,
	gridHeight: 6,
	layers: [
		{
			layerId: "layer-1",
			rows: 6,
			cols: 7,
			cells: {
				"0:0": { row: 0, col: 0, label: "A1" },
				"0:1": { row: 0, col: 1, label: "A2" },
			},
		},
	],
};

export function Example() {
	const data = useMemo(() => normalizeLayeredGridData(rawData), []);
	const [state, setState] = useState(() => createInitialControlledState(data));

	const visual = useMemo(
		() => resolveLayeredGridVisualConfig({
			backgroundColor: "#1f1f1f",
			gridStrokeColor: "#ffffff",
			labelColor: "#ffffff",
		}),
		[],
	);

	const effects = useMemo(
		() => resolveLayeredGridEffectsConfig({
			cameraPerspective: 1100,
			deeperLayerOpacityFalloff: 0.35,
		}),
		[],
	);

	return (
		<LayeredGrid
			data={data}
			state={state}
			visual={visual}
			effects={effects}
			onLayerChangeIntent={(intent) => {
				const nextLayerIndex = data.layers.findIndex(
					(layer) => layer.layerId === intent.nextLayerId,
				);

				setState((prev) => ({
					...prev,
					activeLayerId: intent.nextLayerId,
					camera: {
						...prev.camera,
						focusDepth: Math.max(0, nextLayerIndex),
					},
				}));
			}}
			onModeChangeIntent={(intent) => {
				setState((prev) => ({
					...prev,
					mode: intent.nextMode,
				}));
			}}
			onCellSelectIntent={(intent) => {
				setState((prev) => ({
					...prev,
					selection: {
						trackedCell: intent.cell,
						selectedCell: intent.cell,
					},
				}));
			}}
			onCameraChangeIntent={(intent) => {
				setState((prev) => ({
					...prev,
					camera: intent.nextCamera,
				}));
			}}
		/>
	);
}
```

## Data Model

Core data types live in `@huuuda-aus/layered-grid/core`.

Main shapes:
- `LayeredGridData`
- `LayeredGridLayer`
- `LayeredGridCell`
- `LayeredGridControlledState`

Important rules:
- `version` must currently be `1`
- layers are sparse maps of cells keyed by `row:col`
- `cellId` is optional in input and can be generated
- `visualId` or `label` can provide player-facing cell text

Minimal shape:

```ts
type LayeredGridData = {
	version: 1;
	gridWidth: number;
	gridHeight: number;
	layers: Array<{
		layerId: string;
		rows: number;
		cols: number;
		cells: Record<string, {
			row: number;
			col: number;
			cellId?: string;
			visualId?: string;
			label?: string;
		}>;
	}>;
};
```

## Controlled State

The controlled state shape is:

```ts
type LayeredGridControlledState = {
	activeLayerId: string;
	mode: "normal" | "depth";
	camera: {
		panX: number;
		panY: number;
		scale: number;
		focusDepth: number;
	};
	selection: {
		trackedCell: CellRef | null;
		selectedCell: CellRef | null;
	};
};
```

## Renderer Props

Main props:
- `data`
- `state`
- `geometry`
- `zoom`
- `visual`
- `effects`
- `externalEventSource`
- `externalEvents`
- `onLayerChangeIntent`
- `onModeChangeIntent`
- `onCellSelectIntent`
- `onCameraChangeIntent`
- `renderCellOverlay`
- `renderLayerOverlay`
- `renderToolbarExtras`

## Intents

The component emits these host-handled intents:
- `LayerChangeIntent`
- `ModeChangeIntent`
- `CellSelectIntent`
- `CameraChangeIntent`

Intent context includes:
- `reason`: `pointer | keyboard | programmatic | external-action`
- `timestamp`
- optional `revision`

## External Event Stream

Recommended live integration:

```ts
type LayeredGridExternalEventSource = {
	subscribe: (listener: (event: LayeredGridExternalEvent) => void) => () => void;
};
```

Use `externalEventSource` for realtime input.

Use `externalEvents` only for replay/testing snapshots.

Supported event types:
- `draw.overlay`
- `action.select`
- `action.goto`
- `action.layer`
- `action.mode`
- `action.camera`

All events support:
- `timestamp`
- optional `revision`

## Imperative Handle

The React entry exports `LayeredGridHandle`.

Available methods:
- `requestGoToCell(request)`
- `requestBackToTrackedCell()`
- `requestToggleDepthMode()`
- `requestSetLayer(layerId)`
- `requestCenterOnCell(cell)`

## Geometry Config

`geometry` lets you tune the grid’s physical layout:
- `cellBaseSize`
- `cellAspectRatio`
- `depthLayerDistance`
- `normalLayerDistance`
- `depthRotationX`

## Zoom Config

`zoom` lets you tune interaction bounds:
- `minVisibleCells`
- `maxVisibleCells`
- `zoomStepFactor`
- `panPaddingCells`

## Visual Config

`visual` is for styling and drawing attributes.

Supported keys:
- `backgroundColor`
- `gridStrokeColor`
- `labelColor`
- `selectedCellStrokeColor`
- `activeLayerInkAlpha`
- `belowLayerInkDecayFactor`
- `aboveLayerInkAlpha`
- `minimumInkAlpha`
- `strokeWidthAtScale1`
- `labelFontPxAtScale1`
- `labelFontFamily`

Example:

```ts
const visual = {
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
```

## Effects Config

`effects` is for transition, culling, and perspective behavior.

Supported keys:
- `deeperLayerOpacityFalloff`
- `previousLayerOpacity`
- `farLayerVisibilityCutoff`
- `normalModeLayerZStep`
- `cameraPerspective`
- `transitionEpsilon`
- `transitionFocusLerp`
- `transitionModeLerp`

Example:

```ts
const effects = {
	deeperLayerOpacityFalloff: 0.35,
	previousLayerOpacity: 0.1,
	farLayerVisibilityCutoff: 0.02,
	normalModeLayerZStep: 480,
	cameraPerspective: 1100,
	transitionEpsilon: 0.001,
	transitionFocusLerp: 0.2,
	transitionModeLerp: 0.18,
};
```

## Default And Merge Helpers

The core package exports shared defaults and merge helpers:

```ts
import {
	DEFAULT_LAYERED_GRID_VISUAL_CONFIG,
	DEFAULT_LAYERED_GRID_EFFECTS_CONFIG,
	resolveLayeredGridVisualConfig,
	resolveLayeredGridEffectsConfig,
} from "@huuuda-aus/layered-grid/core";
```

## Core Helpers

Available helpers in `@huuuda-aus/layered-grid/core`:
- `cellKey(row, col)`
- `generateCellId(layerId, row, col)`
- `resolveCellId(layerId, cell)`
- `resolveCellVisualId(cell)`
- `normalizeLayeredGridData(data, options)`
- `createInitialControlledState(data, options)`
- `findCellInLayer(data, layerId, row, col)`
- `resolveLayeredGridVisualConfig(visual)`
- `resolveLayeredGridEffectsConfig(effects)`

## Interaction Behavior

Current renderer behavior includes:
- left/middle drag panning
- wheel zoom
- selected-cell-centered zoom in normal mode
- vertical-only pan in depth mode
- PageUp/PageDown layer changes when focused
- click selection on active layer in normal mode
- animated transitions between normal/depth presentation
- perspective-based depth transition rendering

## SSR Notes

The component is intended to be SSR-safe.

Rules followed by current implementation:
- no browser global access in render path
- layout observation happens in effects
- pointer and keyboard logic attaches after mount

## Capacity And Performance Notes

Current target assumptions:
- around `30x20` cells per layer
- around `5` layers for MVP usage
- update cadence around `500ms`

Current implementation uses:
- canvas drawing for the grid
- sparse layer data
- culling of near-invisible layers
- conservative blur usage

## Demo

Local demo lives under `demo/`.

Commands:
- `npm run demo`
- `npm run demo:build`

Demo config examples:
- visual config: `demo/src/gridTheme.ts`
- effects config: `demo/src/gridEffects.ts`

## Development

Commands:
- `npm install`
- `npm run build`
- `npm run typecheck`
- `npm run demo`
- `npm run demo:build`

Build tooling:
- TypeScript
- tsup
- Vite demo app

## Current Limitations

- `draw.overlay` is typed but not yet rendered as a rich overlay system
- asset-based rendering is not implemented yet
- host-side reducer examples are still minimal
- README covers the public surface, but not every field is shown in a full game integration

## Additional Docs

Architecture notes live in `docs/react-module-api.md`.
