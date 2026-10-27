export declare const MAX_PANES = 16;
/** One glass panel in scene pixels, with how it looks this frame. */
export interface Pane {
    x: number;
    y: number;
    halfWidth: number;
    halfHeight: number;
    radius: number;
    bend: number;
    frost: number;
    rim: number;
    tint: [number, number, number, number];
    glow: number;
    shadow: number;
    chroma: number;
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
    drawGlass: (panes: Pane[], light: {
        x: number;
        y: number;
        present: number;
    }) => void;
    destroy: () => void;
}
/** A three-pass WebGL renderer: backdrop into a texture, a blurred copy for frost, then all glass panels at once. */
export declare function createGlassRenderer(canvas: HTMLCanvasElement): GlassRenderer;
