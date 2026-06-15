import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { User, Zap, Settings, LogOut, ChevronUp } from 'lucide-react';

export default function AccountMenu({ t, onOpenSettings }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState(() => auth.getQuota());
  const menuRef = useRef(null);

  useEffect(() => {
    const refresh = () => {
      const q = auth.getQuota();
      if (q) setQuota(q);
    };
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) {
      auth.fetchUser().then(() => setQuota(auth.getQuota())).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const user = auth.getUser();

  // 未登录
  if (!user) {
    return (
      <div className="fixed bottom-4 left-4 z-50">
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-ink-400 hover:text-ink-600 hover:bg-parchment-200/60 transition-colors"
        >
          <div className="w-8 h-8 rounded-full border-2 border-ink-300 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </button>
      </div>
    );
  }

  const available = quota?.available ?? 0;
  const max = quota?.max ?? 100;
  const isUnlimited = max === -1;
  const quotaText = isUnlimited ? '∞' : `${available}`;
  const isLow = !isUnlimited && typeof available === 'number' && available <= 10;

  return (
    <div className="fixed bottom-4 left-4 z-50" ref={menuRef}>
      {/* 底部栏：头像 + 昵称 + 额度 */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-parchment-200/60 transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-medium">
          {(user.name || user.email)[0].toUpperCase()}
        </div>
        <span className="text-xs text-ink-600 max-w-20 truncate">{user.name || user.email.split('@')[0]}</span>
        <div className="flex items-center gap-0.5 ml-auto">
          <Zap className={`w-3 h-3 ${isLow ? 'text-rust-500' : 'text-amber-500'}`} />
          <span className={`text-xs font-medium ${isLow ? 'text-rust-500' : 'text-amber-600'}`}>{quotaText}</span>
        </div>
        <ChevronUp className={`w-3 h-3 text-ink-400 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      {/* 展开菜单 */}
      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-48 bg-parchment-50 border-2 border-aged-200 rounded-sm shadow-retro">
          {/* 额度详情 */}
          {!isUnlimited && (
            <div className="px-3 py-2 border-b border-aged-200">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-ink-500">剩余额度</span>
                <span className={`text-xs font-bold ${isLow ? 'text-rust-500' : 'text-amber-600'}`}>
                  {available} / {max}
                </span>
              </div>
              <div className="w-full h-1 bg-parchment-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isLow ? 'bg-rust-400' : 'bg-amber-400'}`}
                  style={{ width: `${max > 0 ? Math.max(0, (available / max) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[9px] text-ink-400 mt-0.5">每日恢复 10 句，上限 100 句</p>
            </div>
          )}
          <button
            onClick={() => { setOpen(false); onOpenSettings?.(); }}
            className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-parchment-100 transition-colors flex items-center gap-2"
          >
            <Settings className="w-3.5 h-3.5" />
            {t?.settings || '设置'}
          </button>
          <button
            onClick={() => { auth.logout(); setOpen(false); navigate('/'); }}
            className="w-full text-left px-3 py-2 text-xs text-ink-600 hover:bg-parchment-100 transition-colors flex items-center gap-2"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t?.logout || '退出登录'}
          </button>
        </div>
      )}
    </div>
  );
}
