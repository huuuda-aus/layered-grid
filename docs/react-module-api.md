# @huuuda-aus/layered-grid API Blueprint

## Objectives
- React + TypeScript library
- Fully host-controlled state
- SSR-safe
- Canvas renderer first
- Supports generated programmatic IDs and user-facing visual IDs
- Supports external draw/action events

## Package Layout
- `@huuuda-aus/layered-grid/react`: React component + hooks + handle types
- `@huuuda-aus/layered-grid/core`: data types, IDs, pure helpers

## Controlled Data In
- `data: LayeredGridData`
- `state: LayeredGridControlledState`
- Optional configs: geometry, zoom, visual
- Optional `externalEvents` for draw/action stream

## Intents Out (Host-Controlled)
- `onLayerChangeIntent(intent)`
- `onModeChangeIntent(intent)`
- `onCellSelectIntent(intent)`
- `onCameraChangeIntent(intent)`

The component never mutates authoritative game state itself. It emits intents; host applies and re-renders.

## IDs
- Programmatic ID: stable `cellId` (generated if missing as `layerId:row:col`)
- Visual ID: `visualId` for player-facing label
- Fallback visual ID: chess-like (`A1`, `B3`, ...)

## External Event Stream
Supported envelope family:
- `draw.overlay`
- `action.select`
- `action.goto`
- `action.layer`
- `action.mode`
- `action.camera`

Each event supports `revision` and `timestamp` for realtime ordering.

## Canvas Renderer Recommendation
- Keep canvas draw loop separate from React reconciliation
- React controls state + lifecycle, canvas draws the frame
- Use sprite atlas keys in `CellAsset` payload
- Keep optional DOM debug layer for troubleshooting

## SSR Safety Rules
- No layout reads during server render
- No global browser object access during render path
- Attach pointer/keyboard listeners in effects
- Derive viewport-dependent values after mount
- Render deterministic HTML skeleton server-side

## MVP Capacity and Performance
- Target: 30x20 cells per layer, up to 5 layers
- Update cadence: around every 500ms
- Use immutable host updates + memoized selectors
- Keep blur usage conservative and skip near-invisible layer blur

## Next Implementation Step
1. Build package scaffolding (`tsup`, dual entry points)
2. Implement core helpers and schema guards
3. Implement React controlled component shell
4. Implement canvas renderer and event dispatch bridge
5. Add demo app and integration examples
