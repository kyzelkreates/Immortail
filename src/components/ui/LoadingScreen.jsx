import { motion } from 'framer-motion';

export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div className="fixed inset-0 bg-immortail-deep flex flex-col items-center justify-center z-50">
      <motion.div
        animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="text-5xl mb-6"
      >
        🐾
      </motion.div>
      <h1 className="font-display text-2xl text-immortail-gold mb-2">Immortail™</h1>
      <p className="text-immortail-soft text-sm tracking-widest uppercase">{message}</p>
    </div>
  );
}
