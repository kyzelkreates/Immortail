import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

export default function PageHeader({ title, subtitle, showBack = false, actions }) {
  const navigate = useNavigate();
  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between px-5 pt-6 pb-4"
    >
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full glass-card flex items-center justify-center
                       text-immortail-soft hover:text-immortail-cream transition-colors shrink-0"
            aria-label="Go back"
          >
            ←
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-xl text-immortail-cream truncate">{title}</h1>
          {subtitle && <p className="text-xs text-immortail-soft mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </motion.header>
  );
}
