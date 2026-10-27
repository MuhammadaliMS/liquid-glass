/** Constrain a value to an inclusive range. */
export declare function clamp(value: number, minimum: number, maximum: number): number;
/** Integrate a damped spring in small fixed steps so it behaves the same at any frame rate. */
export declare function stepSpring(value: number, velocity: number, target: number, deltaSeconds: number, stiffness?: number, damping?: number): [number, number];
/**
 * Turn a computed border-radius ("24px", "50%", "9999px", "12px 30px") into one corner radius
 * in px for a box of the given size, capped so it can never exceed a full pill.
 */
export declare function parseRadius(value: string, width: number, height: number): number;
/** Read a unitless number from a CSS custom property, falling back when it's missing or invalid. */
export declare function readNumber(value: string, fallback: number, minimum?: number, maximum?: number): number;
/** Parse the rgb()/rgba() string a browser returns for a computed colour into 0..1 channels. */
export declare function parseComputedColor(value: string): [number, number, number, number] | null;
/** Whether a backdrop URL points at a video the browser can loop. */
export declare function isVideo(url: string): boolean;
