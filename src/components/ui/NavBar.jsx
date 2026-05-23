import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ROUTES } from '../../core/constants.js';
import { useApp } from '../../core/AppContext.jsx';

const NAV_ITEMS = [
  { to: ROUTES.IMMORTAIL,  icon: '🐾', label: 'My Dog'   },
  { to: ROUTES.MEMORIES,   icon: '🖼️', label: 'Memories' },
  { to: ROUTES.SOUNDS,     icon: '🎵', label: 'Sounds'   },
  { to: ROUTES.VIDEOS,     icon: '🎬', label: 'Videos'   },
  { to: ROUTES.SETTINGS,   icon: '⚙️', label: 'Settings' },
];

export default function NavBar() {
  const { profile } = useApp();
  const navigate    = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 safe-bottom">
      <div className="glass-card mx-2 mb-2 rounded-2xl px-2 py-2">
        <div className="flex items-center justify-around">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all duration-200 min-w-0 ${
                  isActive
                    ? 'bg-immortail-gold/15 text-immortail-gold'
                    : 'text-immortail-soft hover:text-immortail-cream'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <motion.span
                    className="text-xl leading-none"
                    animate={isActive ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    {item.icon}
                  </motion.span>
                  <span className="text-[10px] font-medium truncate">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-1 w-1 h-1 bg-immortail-gold rounded-full"
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
