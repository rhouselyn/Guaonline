import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { motion } from 'framer-motion';

function FrogMascot({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="58" rx="38" ry="32" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <ellipse cx="50" cy="55" rx="34" ry="28" fill="#B5AE8E" />
      <circle cx="34" cy="38" r="16" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <circle cx="66" cy="38" r="16" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <circle cx="34" cy="38" r="13" fill="#F5ECD7" stroke="#524635" strokeWidth="1.5" />
      <circle cx="66" cy="38" r="13" fill="#F5ECD7" stroke="#524635" strokeWidth="1.5" />
      <circle cx="36" cy="37" r="5" fill="#3B3225" />
      <circle cx="68" cy="37" r="5" fill="#3B3225" />
      <circle cx="38" cy="35" r="1.5" fill="#F5ECD7" />
      <circle cx="70" cy="35" r="1.5" fill="#F5ECD7" />
      <ellipse cx="50" cy="62" rx="18" ry="8" fill="#D4A854" stroke="#524635" strokeWidth="1.5" />
      <path d="M38 60 Q50 68 62 60" stroke="#524635" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="52" r="4" fill="#D08E7D" opacity="0.4" />
      <circle cx="58" cy="52" r="4" fill="#D08E7D" opacity="0.4" />
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await auth.register(email, password, name);
      } else {
        await auth.login(email, password);
      }
      navigate('/learn');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(detail || (isRegister ? '注册失败' : '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-parchment-50 font-body text-ink-700 flex items-center justify-center px-4 relative">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.06 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 w-full max-w-md bg-parchment-100 border-2 border-aged-200 rounded-sm p-8 shadow-warm"
      >
        <div className="flex justify-center mb-6">
          <FrogMascot size={72} />
        </div>

        <h2 className="font-display text-2xl md:text-3xl text-center text-ink-800 mb-6">
          {isRegister ? '注册呱邻国' : '登录呱邻国'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-rust-50 border-2 border-rust-300 text-rust-500 font-body text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block font-body text-sm text-ink-600 mb-1">昵称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-parchment-50 border-2 border-aged-200 rounded-sm font-body text-sm focus:outline-none focus:border-amber-400 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block font-body text-sm text-ink-600 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-parchment-50 border-2 border-aged-200 rounded-sm font-body text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div>
            <label className="block font-body text-sm text-ink-600 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 bg-parchment-50 border-2 border-aged-200 rounded-sm font-body text-sm focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-body text-base py-2.5 bg-amber-400 text-ink-800 border-2 border-amber-500 hover:bg-amber-500 transition-colors rounded-sm disabled:opacity-50"
          >
            {loading ? '...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>

        <p className="mt-4 text-center font-body text-sm text-ink-500">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-amber-600 hover:text-amber-700 ml-1"
          >
            {isRegister ? '登录' : '注册'}
          </button>
        </p>

        <div className="mt-6 pt-4 border-t-2 border-aged-200">
          <p className="text-center font-body text-xs text-ink-400 mb-3">
            也可以跳过登录，直接使用自己的 API Key
          </p>
          <button
            onClick={() => navigate('/learn')}
            className="w-full font-body text-sm py-2 bg-transparent text-ink-600 border-2 border-aged-300 hover:border-amber-400 hover:text-amber-600 transition-colors rounded-sm"
          >
            跳过，直接使用
          </button>
        </div>
      </motion.div>
    </div>
  );
}
