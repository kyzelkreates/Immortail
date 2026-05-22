import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { MAX_PHOTOS_PER_DOG, MAX_PHOTO_SIZE_MB } from '../../core/constants.js';

export default function PhotoUploader({ onUpload, uploading, uploadProgress, count, error }) {
  const [dragActive, setDragActive] = useState(false);

  const onDrop = useCallback(acceptedFiles => {
    if (acceptedFiles.length) onUpload(acceptedFiles);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    multiple: true,
    maxSize: MAX_PHOTO_SIZE_MB * 1024 * 1024,
    disabled: uploading,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${isDragActive
            ? 'border-immortail-gold bg-immortail-gold/10'
            : 'border-white/15 hover:border-immortail-gold/40 hover:bg-white/5'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          {uploading ? (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-4xl mb-3">
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="inline-block"
                >
                  🐾
                </motion.span>
              </div>
              <p className="text-immortail-cream font-medium mb-2">Processing photos…</p>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden max-w-xs mx-auto">
                <motion.div
                  className="h-full bg-gradient-to-r from-immortail-gold to-immortail-gold-light rounded-full"
                  animate={{ width: `${uploadProgress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <p className="text-immortail-soft text-xs mt-2">{uploadProgress}% — Compressing locally…</p>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="text-5xl mb-4">{isDragActive ? '📂' : '📷'}</div>
              <p className="text-immortail-cream font-medium mb-1">
                {isDragActive ? 'Release to add photos' : 'Drop photos here'}
              </p>
              <p className="text-immortail-soft text-sm mb-4">or tap to browse your library</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs text-immortail-soft/60">
                <span>JPG · PNG · WebP · HEIC</span>
                <span>·</span>
                <span>Max {MAX_PHOTO_SIZE_MB}MB each</span>
                <span>·</span>
                <span>{count}/{MAX_PHOTOS_PER_DOG} uploaded</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red-400 text-sm text-center"
        >
          {error}
        </motion.p>
      )}
    </div>
  );
}
