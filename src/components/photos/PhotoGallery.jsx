import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PhotoGallery({ photos, getPhotoURL, onDelete }) {
  const [selected, setSelected] = useState(null);
  const [urls, setUrls]         = useState({});

  // Build thumbnail URLs for visible photos
  useEffect(() => {
    const newUrls = {};
    photos.forEach(p => {
      newUrls[p.id] = getPhotoURL(p, true);
    });
    setUrls(newUrls);
  }, [photos, getPhotoURL]);

  if (photos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-5xl mb-3 opacity-40">📷</div>
        <p className="text-immortail-soft text-sm">No photos yet.<br />Upload some memories above.</p>
      </div>
    );
  }

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {photos.map((photo, i) => (
          <motion.div
            key={photo.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group"
            onClick={() => setSelected(photo)}
          >
            {urls[photo.id] ? (
              <img
                src={urls[photo.id]}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                <span className="text-2xl opacity-30">📷</span>
              </div>
            )}

            {/* Blur warning */}
            {photo.metadata?.isBlurry && (
              <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-yellow-500/80 flex items-center justify-center text-xs">
                ⚠
              </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </motion.div>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {selected && (
          <Lightbox
            photo={selected}
            getPhotoURL={getPhotoURL}
            onClose={() => setSelected(null)}
            onDelete={onDelete ? () => { onDelete(selected.id); setSelected(null); } : null}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ photo, getPhotoURL, onClose, onDelete }) {
  const url = getPhotoURL(photo, false);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="relative max-w-2xl w-full"
        onClick={e => e.stopPropagation()}
      >
        {url && (
          <img
            src={url}
            alt=""
            className="w-full rounded-2xl object-contain max-h-[70vh]"
          />
        )}

        {/* Info bar */}
        <div className="mt-3 flex items-center justify-between px-1">
          <div>
            <p className="text-immortail-soft text-xs">{photo.metadata?.name || 'Photo'}</p>
            {photo.metadata?.isBlurry && (
              <p className="text-yellow-400 text-xs mt-0.5">⚠ Slightly blurry — AI will deprioritise</p>
            )}
          </div>
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={onDelete}
                className="btn-danger text-xs px-3 py-1.5"
              >
                Delete
              </button>
            )}
            <button onClick={onClose} className="btn-ghost text-xs px-3 py-1.5">Close</button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
