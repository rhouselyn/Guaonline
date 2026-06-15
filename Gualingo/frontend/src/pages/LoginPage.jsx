import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { ArrowLeft } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-parchment-50 px-4">
      <div className="w-full max-w-md bg-parchment-50 border-2 border-aged-200 rounded-sm p-8 shadow-retro relative">
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4 p-1.5 text-ink-400 hover:text-ink-600 hover:bg-parchment-200/60 rounded-sm transition-colors"
          title="返回首页"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex justify-center mb-6">
          <svg width="48" height="48" viewBox="0 0 100 100" fill="none">
            <ellipse cx="50" cy="58" rx="38" ry="32" fill="#B5AE8E" />
            <ellipse cx="50" cy="55" rx="34" ry="28" fill="#D8D4BF" />
            <circle cx="34" cy="38" r="16" fill="#B5AE8E" />
            <circle cx="66" cy="38" r="16" fill="#B5AE8E" />
            <circle cx="34" cy="38" r="13" fill="#fff" />
            <circle cx="66" cy="38" r="13" fill="#fff" />
            <circle cx="36" cy="37" r="6" fill="#524D3C" />
            <circle cx="68" cy="37" r="6" fill="#524D3C" />
            <circle cx="38" cy="35" r="2" fill="#fff" />
            <circle cx="70" cy="35" r="2" fill="#fff" />
            <ellipse cx="50" cy="62" rx="18" ry="8" fill="#E8C985" />
            <path d="M38 60 Q50 70 62 60" stroke="#524D3C" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        </div>

        <h2 className="text-2xl font-serif text-ink-800 text-center mb-6">
          {isRegister ? '注册呱邻国' : '登录呱邻国'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-sm text-ink-600 mb-1">昵称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-aged-200 rounded-sm bg-white focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-ink-600 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-aged-200 rounded-sm bg-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm text-ink-600 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-aged-200 rounded-sm bg-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-amber-500 text-white font-medium rounded-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink-500">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-amber-600 hover:text-amber-700 ml-1"
          >
            {isRegister ? '登录' : '注册'}
          </button>
        </p>

        <div className="mt-6 pt-4 border-t border-aged-200">
          <p className="text-center text-xs text-ink-400 mb-2">
            也可以跳过登录，直接使用自己的 API Key
          </p>
          <button
            onClick={() => navigate('/learn')}
            className="w-full py-2 border border-aged-200 text-ink-600 rounded-sm hover:bg-parchment-100 transition-colors text-sm"
          >
            跳过，直接使用
          </button>
        </div>
      </div>
    </div>
  );
}
