import { useState, useRef, useEffect } from 'react';
import { auth } from '../utils/auth';

export default function AccountMenu({ t }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const user = auth.getUser();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const tierLabel = { free: t?.freeTier || '免费版', basic: t?.basicTier || '基础版', pro: t?.proTier || '专业版' };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-parchment-200/60 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-medium">
          {(user.name || user.email)[0].toUpperCase()}
        </div>
        <span className="text-sm text-ink-700 hidden sm:inline">{user.name || user.email}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-parchment-50 border-2 border-aged-200 rounded-sm shadow-retro z-50">
          <div className="px-4 py-3 border-b border-aged-200">
            <p className="text-sm font-medium text-ink-800">{user.email}</p>
            <p className="text-xs text-amber-600 mt-0.5">{tierLabel[user.tier] || user.tier}</p>
          </div>
          <button
            onClick={() => { auth.logout(); setOpen(false); window.location.href = '/'; }}
            className="w-full text-left px-4 py-2 text-sm text-ink-600 hover:bg-parchment-100 transition-colors"
          >
            {t?.logout || '退出登录'}
          </button>
        </div>
      )}
    </div>
  );
}
