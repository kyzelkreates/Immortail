/**
 * Immortail™ — Local image processing utilities
 * All compression/thumbnail generation runs in-browser, zero external uploads.
 */
import { COMPRESSED_MAX_SIZE, JPEG_QUALITY, THUMBNAIL_SIZE } from '../core/constants.js';

/**
 * Compress an image File/Blob to a max dimension, returning a Blob.
 */
export async function compressImage(file, maxDimension = COMPRESSED_MAX_SIZE, quality = JPEG_QUALITY) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width <= maxDimension && height <= maxDimension) {
        // Already small enough — just re-encode to normalise format
      } else if (width > height) {
        height = Math.round(height * maxDimension / width);
        width  = maxDimension;
      } else {
        width  = Math.round(width * maxDimension / height);
        height = maxDimension;
      }

      const canvas  = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(resolve, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Generate a square thumbnail Blob from a File/Blob.
 */
export async function generateThumbnail(file, size = THUMBNAIL_SIZE) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const min = Math.min(width, height);
      const sx  = (width  - min) / 2;
      const sy  = (height - min) / 2;

      const canvas  = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      canvas.toBlob(resolve, 'image/jpeg', 0.75);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Read a blob as a data URL (for display).
 */
export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Create an object URL from a blob (caller must revoke when done).
 */
export function blobToObjectURL(blob) {
  return URL.createObjectURL(blob);
}

/**
 * Detect if a blob is blurry using Laplacian variance (canvas-based, no AI).
 * Returns a score: lower = blurrier. Threshold ~100.
 */
export async function blurScore(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const SIZE = 200;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = SIZE;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

      // Convert to greyscale and apply discrete Laplacian
      let variance = 0;
      let mean = 0;
      const grey = new Float32Array(SIZE * SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) {
        grey[i] = 0.299 * data[i*4] + 0.587 * data[i*4+1] + 0.114 * data[i*4+2];
        mean += grey[i];
      }
      mean /= grey.length;
      for (let y = 1; y < SIZE - 1; y++) {
        for (let x = 1; x < SIZE - 1; x++) {
          const lap =
            grey[(y-1)*SIZE + x] + grey[(y+1)*SIZE + x] +
            grey[y*SIZE + (x-1)] + grey[y*SIZE + (x+1)] -
            4 * grey[y*SIZE + x];
          variance += lap * lap;
        }
      }
      resolve(variance / ((SIZE-2)*(SIZE-2)));
    };
    img.onerror = () => resolve(999);
    img.src = url;
  });
}

/**
 * Validate that a file is an acceptable image.
 */
export function validateImageFile(file, maxMB = 20) {
  const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i)) {
    return 'Please upload a JPG, PNG, or WebP image.';
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `Image must be under ${maxMB}MB.`;
  }
  return null;
}

/**
 * Validate audio file.
 */
export function validateAudioFile(file, maxMB = 50) {
  const ACCEPTED = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/aac', 'audio/flac'];
  if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|webm|m4a|aac|flac)$/i)) {
    return 'Please upload an MP3, WAV, OGG, or M4A audio file.';
  }
  if (file.size > maxMB * 1024 * 1024) {
    return `Audio must be under ${maxMB}MB.`;
  }
  return null;
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes) {
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
