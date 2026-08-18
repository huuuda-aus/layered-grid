import * as React from 'react';
import React__default from 'react';
import { b as LayeredGridData, c as LayeredGridControlledState, q as LayeredGridGeometry, w as LayeredGridZoomConfig, v as LayeredGridVisualConfig, p as LayeredGridExternalEvent, o as LayerChangeIntent, M as ModeChangeIntent, m as CellSelectIntent, h as CameraChangeIntent, l as CellRef } from '../types-AbvTUJEF.js';

type LayeredGridExternalEventSource = {
    subscribe: (listener: (event: LayeredGridExternalEvent) => void) => () => void;
};
type CellRenderParams = {
    layerId: string;
    row: number;
    col: number;
    cellId: string;
    visualId: string;
    isActiveLayer: boolean;
    isSelected: boolean;
    isTracked: boolean;
    isHovered: boolean;
};
type LayeredGridRendererProps = {
    data: LayeredGridData;
    state: LayeredGridControlledState;
    geometry?: Partial<LayeredGridGeometry>;
    zoom?: Partial<LayeredGridZoomConfig>;
    visual?: Partial<LayeredGridVisualConfig>;
    externalEventSource?: LayeredGridExternalEventSource;
    externalEvents?: LayeredGridExternalEvent[];
    onLayerChangeIntent: (intent: LayerChangeIntent) => void;
    onModeChangeIntent: (intent: ModeChangeIntent) => void;
    onCellSelectIntent: (intent: CellSelectIntent) => void;
    onCameraChangeIntent: (intent: CameraChangeIntent) => void;
    renderCellOverlay?: (params: CellRenderParams) => React__default.ReactNode;
    renderLayerOverlay?: (layerId: string) => React__default.ReactNode;
    renderToolbarExtras?: (state: LayeredGridControlledState) => React__default.ReactNode;
    className?: string;
    style?: React__default.CSSProperties;
};
type GoToCellRequest = {
    layerId: string;
    row: number;
    col: number;
    select?: boolean;
};
type LayeredGridHandle = {
    requestGoToCell: (request: GoToCellRequest) => void;
    requestBackToTrackedCell: () => void;
    requestToggleDepthMode: () => void;
    requestSetLayer: (layerId: string) => void;
    requestCenterOnCell: (cell: CellRef) => void;
};

declare const LayeredGrid: React.ForwardRefExoticComponent<LayeredGridRendererProps & React.RefAttributes<LayeredGridHandle>>;

export { type CellRenderParams, type GoToCellRequest, LayeredGrid, type LayeredGridHandle, type LayeredGridRendererProps };
