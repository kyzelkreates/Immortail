import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../../core/AppContext.jsx';
import { InstallPrompt } from '../../core/storage.js';

export default function InstallBanner() {
  const { canInstall, triggerInstall } = useApp();
  const [dismissed, setDismissed] = useState(InstallPrompt.isDismissed());

  if (!canInstall || dismissed) return null;

  const handleInstall = async () => {
    const accepted = await triggerInstall();
    if (accepted) setDismissed(true);
  };

  const handleDismiss = () => {
    InstallPrompt.dismiss();
    setDismissed(true);
  };

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50 glass-card-warm mx-4 mt-4 p-4 flex items-center gap-3"
        >
          <span className="text-2xl">🐾</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-immortail-cream">Install Immortail™</p>
            <p className="text-xs text-immortail-soft truncate">Add to your home screen for the full experience</p>
          </div>
          <button onClick={handleInstall} className="btn-primary text-sm px-4 py-2 shrink-0">Install</button>
          <button onClick={handleDismiss} className="text-immortail-soft hover:text-immortail-cream transition-colors shrink-0 ml-1" aria-label="Dismiss">✕</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
