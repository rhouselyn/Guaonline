import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { User, Zap } from 'lucide-react';

export default function AccountMenu({ t }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const user = auth.getUser();
  const quota = auth.getQuota();

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
  const available = quota?.available ?? '?';
  const max = quota?.max;
  const isUnlimited = max === -1;
  const quotaText = isUnlimited ? '∞' : `${available}/${max}`;
  const isLow = !isUnlimited && typeof available === 'number' && available <= 10;

  // 已登录：圆圈里显示首字母，无外边框
  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-2">
        {/* 额度显示 */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium transition-colors ${
            isLow
              ? 'bg-rust-50 text-rust-500 border border-rust-200'
              : 'bg-amber-50 text-amber-600 border border-amber-200'
          }`}
          title="剩余额度"
        >
          <Zap className="w-3 h-3" />
          {quotaText}
        </button>

        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          {(user.name || user.email)[0].toUpperCase()}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-parchment-50 border-2 border-aged-200 rounded-sm shadow-retro z-50">
          <div className="px-4 py-3 border-b border-aged-200">
            <p className="text-sm font-medium text-ink-800">{user.email}</p>
            <p className="text-xs text-amber-600 mt-0.5">{tierLabel[user.tier] || user.tier}</p>
          </div>
          {/* 额度详情 */}
          {!isUnlimited && quota && (
            <div className="px-4 py-2.5 border-b border-aged-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ink-500">剩余额度</span>
                <span className={`text-xs font-bold ${isLow ? 'text-rust-500' : 'text-amber-600'}`}>
                  {available} / {max}
                </span>
              </div>
              <div className="w-full h-1.5 bg-parchment-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isLow ? 'bg-rust-400' : 'bg-amber-400'}`}
                  style={{ width: `${max > 0 ? Math.max(0, (available / max) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[10px] text-ink-400 mt-1">每日恢复 10 句</p>
            </div>
          )}
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
