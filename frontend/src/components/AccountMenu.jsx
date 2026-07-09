import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { User, Zap, Settings, KeyRound, RefreshCw, LogOut } from 'lucide-react';

// ponytail: 桌面端右上角账号菜单。设置不再单独展出，统一收进头像下拉菜单。
// 菜单项：设置 / 修改密码 / 切换账号 / 退出登录。
export default function AccountMenu({ t, onOpenSettings, onOpenChangePassword }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState(() => auth.getQuota());
  const menuRef = useRef(null);

  // 每次打开下拉菜单或组件挂载时刷新额度
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
      <button
        onClick={() => navigate('/login')}
        className="w-8 h-8 rounded-full border-2 border-ink-300 flex items-center justify-center text-ink-400 hover:text-ink-600 hover:border-ink-500 transition-colors"
        title="登录"
      >
        <User className="w-4 h-4" />
      </button>
    );
  }

  const available = quota?.available ?? 0;
  const max = quota?.tier_max ?? quota?.max ?? 200;
  const isUnlimited = max === -1;
  const isLow = !isUnlimited && typeof available === 'number' && available <= 10;

  // 额度恢复提示
  const refillInfo = isUnlimited
    ? (t?.unlimitedQuota || '无限额度')
    : user.tier === 'basic'
      ? (t?.monthlyQuotaInfo || '每月 {0} 句额度').replace('{0}', '2000')
      : (t?.dailyRefillInfo || '每日恢复 {0} 句，上限 {1} 句').replace('{0}', '50').replace('{1}', '200');

  const menuItem = (Icon, label, onClick, danger = false) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
        danger ? 'text-rust-500 hover:bg-rust-50' : 'text-ink-600 hover:bg-parchment-100'
      }`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      {label}
    </button>
  )

  return (
    <div className="relative" ref={menuRef}>
      <div className="flex items-center gap-2">
        {/* 额度：直接显示闪电图标+数字 */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1 text-xs font-medium transition-colors ${
            isLow ? 'text-rust-500' : 'text-amber-600'
          }`}
          title={t?.remainingQuota || '剩余额度'}
        >
          <Zap className="w-3.5 h-3.5" />
          {isUnlimited ? '∞' : available}
        </button>

        <button
          onClick={() => setOpen(!open)}
          className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-medium hover:bg-amber-600 transition-colors"
        >
          {(user.name || user.email)[0].toUpperCase()}
        </button>
      </div>

      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-parchment-50 border-2 border-aged-200 rounded-sm shadow-retro z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-aged-200">
            <p className="text-sm font-medium text-ink-800">{user.email}</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {{ free: t?.freeTier || '免费版', basic: t?.basicTier || '基础版', pro: t?.proTier || '专业版' }[user.tier] || user.tier}
            </p>
          </div>
          {/* 额度详情 */}
          {!isUnlimited && (
            <div className="px-4 py-2.5 border-b border-aged-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-ink-500">{t?.remainingQuota || '剩余额度'}</span>
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
              <p className="text-[10px] text-ink-400 mt-1">{refillInfo}</p>
            </div>
          )}
          {menuItem(Settings, t?.settings || '设置', () => onOpenSettings && onOpenSettings())}
          {menuItem(KeyRound, t?.changePassword || '修改密码', () => onOpenChangePassword && onOpenChangePassword())}
          {menuItem(RefreshCw, t?.switchAccount || '切换账号', () => { auth.logout(); navigate('/login'); })}
          <div className="border-t border-aged-200" />
          {menuItem(LogOut, t?.logout || '退出登录', () => { auth.logout(); navigate('/'); }, true)}
        </div>
      )}
    </div>
  );
}
