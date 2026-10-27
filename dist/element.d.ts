/**
 * <liquid-glass>: a scene for liquid glass. It draws a backdrop (the animated aurora, an image or a
 * video) and renders every descendant marked with the `glass` attribute as a piece of curved glass
 * at that element's own position, size and border-radius. Your markup and CSS stay in charge of
 * the layout; the glass follows it, every frame.
 */
export declare class LiquidGlassElement extends HTMLElement {
    static observedAttributes: string[];
    private readonly canvas;
    private readonly fallback;
    private renderer;
    private readonly states;
    private readonly colorProbe;
    private readonly colorCache;
    private readonly motionQuery;
    private events;
    private resizeObserver;
    private visibility;
    private mutations;
    private video;
    private animatedScene;
    private sceneDirty;
    private stylesDirty;
    private onScreen;
    private frameId;
    private frameCount;
    private lastFrame;
    private time;
    private width;
    private height;
    private lastSignature;
    private backdropRequest;
    private readonly pointer;
    private readonly light;
    constructor();
    /** 'aurora' (default), or the URL of an image or video to refract. */
    get backdrop(): string;
    set backdrop(value: string);
    /** The glass elements this scene renders (at most 16). */
    get panes(): HTMLElement[];
    connectedCallback(): void;
    disconnectedCallback(): void;
    attributeChangedCallback(name: string, previous: string | null, next: string | null): void;
    private applyBackdrop;
    private applyDim;
    private auroraColors;
    private resolveColor;
    private readLook;
    private state;
    private movePointer;
    private press;
    private dragMove;
    private release;
    private resize;
    private start;
    private stop;
    private frame;
}
declare global {
    interface HTMLElementTagNameMap {
        'liquid-glass': LiquidGlassElement;
    }
}
