/**
 * Immortail™ — Photo library hook
 * Manages photo upload, compression, thumbnail generation, and retrieval.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Photos } from '../core/storage.js';
import { compressImage, generateThumbnail, validateImageFile, blurScore, blobToObjectURL } from '../utils/imageUtils.js';
import { MAX_PHOTOS_PER_DOG } from '../core/constants.js';

export function usePhotoLibrary(profileId) {
  const [photos, setPhotos]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError]         = useState(null);
  const urlCache = useRef(new Map()); // id → objectURL

  // ─── Load photos ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profileId) { setLoading(false); return; }
    setLoading(true);
    try {
      const list = await Photos.listByProfile(profileId);
      setPhotos(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    load();
    return () => {
      // Revoke all object URLs on unmount
      urlCache.current.forEach(u => URL.revokeObjectURL(u));
      urlCache.current.clear();
    };
  }, [load]);

  // ─── Get display URL for a photo ──────────────────────────────────────────
  const getPhotoURL = useCallback((photo, useThumbnail = false) => {
    if (!photo) return null;
    const key   = `${photo.id}:${useThumbnail ? 'thumb' : 'full'}`;
    const blob  = useThumbnail ? (photo.thumbnail || photo.blob) : photo.blob;
    if (!blob) return null;
    if (!urlCache.current.has(key)) {
      urlCache.current.set(key, blobToObjectURL(blob));
    }
    return urlCache.current.get(key);
  }, []);

  // ─── Upload photos ────────────────────────────────────────────────────────
  const uploadPhotos = useCallback(async (files) => {
    if (!profileId) return [];
    if (photos.length + files.length > MAX_PHOTOS_PER_DOG) {
      setError(`Maximum ${MAX_PHOTOS_PER_DOG} photos allowed.`);
      return [];
    }

    setUploading(true);
    setUploadProgress(0);
    setError(null);
    const added = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validationError = validateImageFile(file);
      if (validationError) { setError(validationError); continue; }

      try {
        // Compress & thumbnail in parallel
        const [compressed, thumbnail] = await Promise.all([
          compressImage(file),
          generateThumbnail(file),
        ]);

        // Blur detection
        const score   = await blurScore(compressed);
        const isBlurry = score < 80;

        const record = await Photos.add(profileId, {
          file,
          blob:      compressed,
          thumbnail,
          metadata:  {
            name:     file.name,
            type:     file.type,
            size:     file.size,
            blurScore: score,
            isBlurry
          }
        });

        added.push(record);
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (e) {
        console.error('[Photos] Upload failed:', e);
        setError(`Failed to process ${file.name}`);
      }
    }

    await load();
    setUploading(false);
    return added;
  }, [profileId, photos.length, load]);

  // ─── Delete photo ─────────────────────────────────────────────────────────
  const deletePhoto = useCallback(async (id) => {
    // Revoke cached URLs
    [`${id}:full`, `${id}:thumb`].forEach(k => {
      if (urlCache.current.has(k)) {
        URL.revokeObjectURL(urlCache.current.get(k));
        urlCache.current.delete(k);
      }
    });
    await Photos.delete(id);
    setPhotos(prev => prev.filter(p => p.id !== id));
  }, []);

  // ─── Mark analysed ────────────────────────────────────────────────────────
  const markAnalysed = useCallback(async (id, result) => {
    await Photos.update(id, { analysed: true, analysisResult: result });
    setPhotos(prev => prev.map(p => p.id === id ? { ...p, analysed: true, analysisResult: result } : p));
  }, []);

  return {
    photos,
    loading,
    uploading,
    uploadProgress,
    error,
    setError,
    uploadPhotos,
    deletePhoto,
    getPhotoURL,
    markAnalysed,
    refresh: load,
    count: photos.length,
    clearPhotos: photos.filter(p => !p.metadata?.isBlurry),
  };
}
