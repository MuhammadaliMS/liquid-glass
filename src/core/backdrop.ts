export interface LoadedImage {
  source: TexImageSource;
  width: number;
  height: number;
}

/** Compute a centred cover crop that never stretches the image. */
export function getBackdropCrop(width: number, height: number, imageWidth: number, imageHeight: number): [number, number, number, number] {
  if (![width, height, imageWidth, imageHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError('Backdrop dimensions must be finite and positive.');
  }
  const aspect = width / height;
  const imageAspect = imageWidth / imageHeight;
  const scaleX = Math.min(1, aspect / imageAspect);
  const scaleY = Math.min(1, imageAspect / aspect);
  return [scaleX, scaleY, (1 - scaleX) / 2, (1 - scaleY) / 2];
}

/** Load a backdrop image (CORS-enabled, so WebGL may sample it), releasing handlers on either outcome. */
export function loadImage(url: string, createImage: () => HTMLImageElement = () => new Image()): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = createImage();
    image.decoding = 'async';
    // WebGL can only sample cross-origin images served with CORS headers.
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      image.onload = null;
      image.onerror = null;
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error('The backdrop image has invalid image dimensions.'));
        return;
      }
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      image.onload = null;
      image.onerror = null;
      reject(new Error('The backdrop image could not load; the procedural scene remains available.'));
    };
    image.src = url;
  });
}
