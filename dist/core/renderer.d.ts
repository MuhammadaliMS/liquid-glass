export declare const MAX_PANES = 16;
/** One glass panel in scene pixels, with how it looks this frame. */
export interface Pane {
    x: number;
    y: number;
    halfWidth: number;
    halfHeight: number;
    radius: number;
    frost: number;
    chroma: number;
    pull: number;
    tint: [number, number, number, number];
    depth: number;
    rounding: number;
    dome: number;
    ior: number;
    lens: [number, number, number, number];
    glow: number;
    shadow: number;
    press: number;
}
export interface Sound {
    bands: ArrayLike<number>;
    level: number;
}
export interface GlassRenderer {
    resize: (width: number, height: number) => void;
    /** Use an image or a playing video as the backdrop; null switches to the aurora, 'wait' to the plain base colour. */
    setSource: (source: TexImageSource | null | 'wait', width?: number, height?: number) => void;
    setAurora: (colors: [number, number, number][], base: [number, number, number]) => void;
    /** Darken the backdrop, 0..1, so text over it stays readable. */
    setDim: (dim: number) => void;
    /** Redraw the backdrop (each frame for video or the aurora, once for a still image). */
    drawScene: (time: number) => void;
    /** How many panels this device can draw at once. */
    maxPanes: number;
    drawGlass: (panes: Pane[], light: {
        x: number;
        y: number;
    }, pointer: {
        x: number;
        y: number;
    }, sound: Sound) => void;
    destroy: () => void;
}
/** A three-pass WebGL renderer: backdrop into a texture, a blurred copy for frost, then all glass panels at once. */
export declare function createGlassRenderer(canvas: HTMLCanvasElement): GlassRenderer;
