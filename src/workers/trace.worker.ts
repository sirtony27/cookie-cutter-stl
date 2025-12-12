import { processImageData, type ProcessOptions } from '../core/image-processing';

self.onmessage = (e: MessageEvent) => {
    const { imageData, options, meta } = e.data as {
        imageData: ImageData;
        options: ProcessOptions;
        meta: { originalWidth: number; originalHeight: number };
    };

    try {
        const result = processImageData(imageData, options, meta);

        // Serialize result to avoid cloning issues with custom types if any
        // While structuredClone handles objects, THREE.Vector2 might lose prototype methods.
        // We will re-hydrate in the main thread.
        self.postMessage({ success: true, result });
    } catch (error) {
        self.postMessage({ success: false, error: (error as Error).message });
    }
};
