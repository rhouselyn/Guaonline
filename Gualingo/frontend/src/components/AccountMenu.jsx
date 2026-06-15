import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { User } from 'lucide-react';

export default function AccountMenu({ t }) {
  const navigate = useNavigate();
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

  // 未登录：圆圈里显示人像图标，点击跳转登录
  if (!user) {
    return (
      <button
        onClick={() => navigate('/login')}
        className="w-8 h-8 rounded-full border-2 border-ink-300 flex items-center justify-center text-ink-400 hover:text-ink-600 hover:border-ink-500 transition-colors"
        title="登录"
      >
        <User className="w-4 h-4" />
      </button>
    );
  }

  const tierLabel = { free: t?.freeTier || '免费版', basic: t?.basicTier || '基础版', pro: t?.proTier || '专业版' };

  // 已登录：圆圈里显示首字母，无外边框
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-medium hover:bg-amber-600 transition-colors"
      >
        {(user.name || user.email)[0].toUpperCase()}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-parchment-50 border-2 border-aged-200 rounded-sm shadow-retro z-50">
          <div className="px-4 py-3 border-b border-aged-200">
            <p className="text-sm font-medium text-ink-800">{user.email}</p>
            <p className="text-xs text-amber-600 mt-0.5">{tierLabel[user.tier] || user.tier}</p>
          </div>
          <button
            onClick={() => { auth.logout(); setOpen(false); navigate('/'); }}
            className="w-full text-left px-4 py-2 text-sm text-ink-600 hover:bg-parchment-100 transition-colors"
          >
            {t?.logout || '退出登录'}
          </button>
        </div>
      )}
    </div>
  );
}
