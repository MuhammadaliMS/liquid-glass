export interface LoadedImage {
    source: TexImageSource;
    width: number;
    height: number;
}
/** Compute a centred cover crop that never stretches the image. */
export declare function getBackdropCrop(width: number, height: number, imageWidth: number, imageHeight: number): [number, number, number, number];
/** Load a backdrop image (CORS-enabled, so WebGL may sample it), releasing handlers on either outcome. */
export declare function loadImage(url: string, createImage?: () => HTMLImageElement): Promise<LoadedImage>;
