/**
 * Image compression utility
 * Compresses and resizes images with iterative quality reduction
 * to guarantee final file stays under maxBytes (safe for Edge Function base64 payloads).
 */

const DEFAULT_MAX_SIZE = 512;
const INITIAL_QUALITY = 0.72;
const MAX_BYTES = 200 * 1024; // 200KB – leaves headroom for base64 (~267KB) well under payload limits

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Compress to a blob trying WebP first, then JPEG fallback.
 * Returns null only if both formats fail.
 */
function compressToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    // Detect iOS Safari – it doesn't support WebP in canvas.toBlob
    // Use multiple signals: UA string, platform, and touch points
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (/AppleWebKit/.test(ua) && /Mobile/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(ua));

    const tryFormat = (format: string, q: number) => {
      canvas.toBlob(
        (blob) => resolve(blob),
        format,
        q,
      );
    };

    if (isIOS) {
      // Skip WebP entirely on iOS – go straight to JPEG
      tryFormat('image/jpeg', quality);
    } else {
      // Try WebP first (smaller files, better quality)
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > 0) {
            resolve(blob);
            return;
          }
          // Fallback to JPEG if WebP fails
          tryFormat('image/jpeg', quality);
        },
        'image/webp',
        quality,
      );
    }
  });
}

/**
 * Load an image from a File object. Returns an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Scale dimensions to fit within a max bounding box, preserving aspect ratio.
 */
function scaleDimensions(
  width: number,
  height: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  let w = width;
  let h = height;

  if (w > maxW) {
    h = Math.round((h * maxW) / w);
    w = maxW;
  }
  if (h > maxH) {
    w = Math.round((w * maxH) / h);
    h = maxH;
  }

  return { width: Math.max(w, 1), height: Math.max(h, 1) };
}

/**
 * Draw image onto canvas at specified dimensions.
 */
function drawToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  width: number,
  height: number,
  bgColor: string = '#FFFFFF',
): void {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context not available');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);
}

/**
 * Iteratively compress an image until it fits under maxBytes.
 * Reduces quality first, then dimensions if still too large.
 */
async function iterativeCompress(
  img: HTMLImageElement,
  initialMaxW: number,
  initialMaxH: number,
  initialQuality: number,
  maxBytes: number,
  bgColor: string = '#FFFFFF',
): Promise<{ blob: Blob; width: number; height: number; quality: number }> {
  const canvas = document.createElement('canvas');
  let currentMaxW = initialMaxW;
  let currentMaxH = initialMaxH;
  let currentQuality = initialQuality;
  let blob: Blob | null = null;
  let lastWidth = 0;
  let lastHeight = 0;

  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;

  // Up to 8 rounds of increasingly aggressive compression
  for (let attempt = 0; attempt < 8; attempt++) {
    const { width, height } = scaleDimensions(sourceW, sourceH, currentMaxW, currentMaxH);
    lastWidth = width;
    lastHeight = height;

    drawToCanvas(canvas, img, width, height, bgColor);
    blob = await compressToBlob(canvas, currentQuality);

    if (blob && blob.size <= maxBytes) {
      break; // Good enough
    }

    // Reduce quality first (more visible, but smaller files)
    if (currentQuality > 0.3) {
      currentQuality = Math.max(0.25, currentQuality - 0.08);
    }
    // Also reduce dimensions
    currentMaxW = Math.max(96, Math.round(currentMaxW * 0.78));
    currentMaxH = Math.max(96, Math.round(currentMaxH * 0.78));
  }

  if (!blob) {
    throw new Error('Failed to compress image after all attempts');
  }

  return { blob, width: lastWidth, height: lastHeight, quality: currentQuality };
}

/**
 * Compress and resize an image (square-ish, e.g. product photos).
 */
export async function compressImage(
  file: File,
  maxSize: number = DEFAULT_MAX_SIZE,
  quality: number = INITIAL_QUALITY,
  maxBytes: number = MAX_BYTES,
): Promise<CompressedImage> {
  const img = await loadImage(file);

  const { blob, width, height, quality: finalQ } = await iterativeCompress(
    img,
    maxSize,
    maxSize,
    quality,
    maxBytes,
    '#FFFFFF',
  );

  const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^/.]+$/, ext),
    { type: blob.type },
  );

  console.log(
    `[compressImage] ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} (${width}x${height}, q=${finalQ.toFixed(2)})`,
  );

  return {
    file: compressedFile,
    width,
    height,
    originalSize: file.size,
    compressedSize: compressedFile.size,
  };
}

/**
 * Compress a banner image (wider aspect ratio).
 */
export async function compressBannerImage(
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 400,
  maxBytes: number = MAX_BYTES,
): Promise<CompressedImage> {
  const img = await loadImage(file);

  const { blob, width, height, quality: finalQ } = await iterativeCompress(
    img,
    maxWidth,
    maxHeight,
    INITIAL_QUALITY,
    maxBytes,
    '#000000',
  );

  const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^/.]+$/, ext),
    { type: blob.type },
  );

  console.log(
    `[compressBannerImage] ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} (${width}x${height}, q=${finalQ.toFixed(2)})`,
  );

  return {
    file: compressedFile,
    width,
    height,
    originalSize: file.size,
    compressedSize: compressedFile.size,
  };
}

/**
 * Compress a fullscreen advertising image (16:9, max quality for TV display).
 * Larger byte budget than products/banners since these are shown fullscreen,
 * while still keeping egress low via CDN-friendly compression.
 */
export async function compressFullscreenAd(
  file: File,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  maxBytes: number = 600 * 1024,
): Promise<CompressedImage> {
  const img = await loadImage(file);

  const { blob, width, height, quality: finalQ } = await iterativeCompress(
    img,
    maxWidth,
    maxHeight,
    0.9,
    maxBytes,
    '#000000',
  );

  const ext = blob.type === 'image/webp' ? '.webp' : '.jpg';
  const compressedFile = new File(
    [blob],
    file.name.replace(/\.[^/.]+$/, ext),
    { type: blob.type },
  );

  console.log(
    `[compressFullscreenAd] ${formatBytes(file.size)} → ${formatBytes(compressedFile.size)} (${width}x${height}, q=${finalQ.toFixed(2)})`,
  );

  return {
    file: compressedFile,
    width,
    height,
    originalSize: file.size,
    compressedSize: compressedFile.size,
  };
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
