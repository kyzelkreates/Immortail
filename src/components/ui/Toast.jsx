/**
 * Immortail™ — Toast notification system
 * Usage: import { useToast } from './Toast.jsx' then toast.success('Message')
 */
import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ToastContext = createContext(null);

let _id = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
  }, []);

  const toast = {
    success: (msg) => push(msg, 'success'),
    error:   (msg) => push(msg, 'error'),
    info:    (msg) => push(msg, 'info'),
    warn:    (msg) => push(msg, 'warn'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              className={`pointer-events-auto px-4 py-3 rounded-xl text-sm font-medium shadow-immortail
                max-w-xs backdrop-blur-sm border ${
                t.type === 'success' ? 'bg-green-900/80 border-green-700/50 text-green-200' :
                t.type === 'error'   ? 'bg-red-900/80 border-red-700/50 text-red-200' :
                t.type === 'warn'    ? 'bg-yellow-900/80 border-yellow-700/50 text-yellow-200' :
                'bg-immortail-slate/90 border-immortail-gold/30 text-immortail-cream'
              }`}
            >
              {t.type === 'success' && '✓ '}{t.type === 'error' && '✕ '}{t.type === 'warn' && '⚠ '}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
