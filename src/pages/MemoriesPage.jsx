import { useState } from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../core/AppContext.jsx';
import { usePhotoLibrary } from '../hooks/usePhotoLibrary.js';
import PhotoUploader from '../components/photos/PhotoUploader.jsx';
import PhotoGallery  from '../components/photos/PhotoGallery.jsx';
import PageHeader    from '../components/ui/PageHeader.jsx';
import NavBar        from '../components/ui/NavBar.jsx';
import MemoryWriter  from '../components/memories/MemoryWriter.jsx';

const TABS = ['Photos', 'Written Memories'];

export default function MemoriesPage() {
  const { activeProfileId, profile } = useApp();
  const [activeTab, setActiveTab]    = useState(0);
  const lib = usePhotoLibrary(activeProfileId);

  return (
    <div className="min-h-screen bg-immortail-deep pb-28">
      <PageHeader
        title="Memories"
        subtitle={profile?.name ? `${profile.name}'s gallery` : undefined}
        showBack={false}
      />

      {/* Tabs */}
      <div className="px-5 mb-4">
        <div className="flex gap-1 glass-card p-1 rounded-xl">
          {TABS.map((tab, i) => (
            <button
              key={tab}
              onClick={() => setActiveTab(i)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === i
                  ? 'bg-immortail-gold/20 text-immortail-gold'
                  : 'text-immortail-soft hover:text-immortail-cream'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 space-y-5">
        {activeTab === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-5"
          >
            <PhotoUploader
              onUpload={lib.uploadPhotos}
              uploading={lib.uploading}
              uploadProgress={lib.uploadProgress}
              count={lib.count}
              error={lib.error}
            />

            {lib.loading ? (
              <div className="text-center py-8">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }} className="text-3xl inline-block">🐾</motion.span>
              </div>
            ) : (
              <>
                {lib.photos.some(p => p.metadata?.isBlurry) && (
                  <p className="text-yellow-400/70 text-xs px-1">
                    ⚠ Some photos appear blurry — the AI will prioritise clearer images.
                  </p>
                )}
                <PhotoGallery
                  photos={lib.photos}
                  getPhotoURL={lib.getPhotoURL}
                  onDelete={lib.deletePhoto}
                />
              </>
            )}
          </motion.div>
        )}

        {activeTab === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <MemoryWriter profileId={activeProfileId} />
          </motion.div>
        )}
      </div>

      <NavBar />
    </div>
  );
}
