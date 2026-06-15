import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { motion } from 'framer-motion';

function FrogMascot({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="120" rx="70" ry="60" fill="#39FF14" stroke="#000" strokeWidth="4" />
      <ellipse cx="100" cy="115" rx="62" ry="52" fill="#5CFF41" />
      <circle cx="70" cy="75" r="28" fill="#39FF14" stroke="#000" strokeWidth="4" />
      <circle cx="130" cy="75" r="28" fill="#39FF14" stroke="#000" strokeWidth="4" />
      <circle cx="70" cy="75" r="22" fill="#FFF" stroke="#000" strokeWidth="2" />
      <circle cx="130" cy="75" r="22" fill="#FFF" stroke="#000" strokeWidth="2" />
      <circle cx="73" cy="73" r="10" fill="#000" />
      <circle cx="133" cy="73" r="10" fill="#000" />
      <circle cx="76" cy="70" r="3" fill="#FFF" />
      <circle cx="136" cy="70" r="3" fill="#FFF" />
      <ellipse cx="100" cy="128" rx="30" ry="14" fill="#FFD700" stroke="#000" strokeWidth="3" />
      <path d="M78 125 Q100 140 122 125" stroke="#000" strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="55" cy="105" r="10" fill="#FF69B4" opacity="0.5" />
      <circle cx="145" cy="105" r="10" fill="#FF69B4" opacity="0.5" />
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
    <div className="min-h-screen bg-pop-cream font-pop text-black flex items-center justify-center px-4">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md bg-white border-4 border-black shadow-pop-xl p-8"
      >
        <div className="flex justify-center mb-6">
          <div className="animate-float">
            <FrogMascot size={72} />
          </div>
        </div>

        <h2 className="font-display text-3xl md:text-4xl text-center tracking-wider mb-6">
          {isRegister ? '注册呱邻国' : '登录呱邻国'}
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-pop-red/10 border-4 border-pop-red text-pop-red font-bold text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block font-display text-sm tracking-wider mb-1">昵称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border-4 border-black font-pop font-bold focus:outline-none focus:border-pop-red transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block font-display text-sm tracking-wider mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 border-4 border-black font-pop font-bold focus:outline-none focus:border-pop-red transition-colors"
            />
          </div>

          <div>
            <label className="block font-display text-sm tracking-wider mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 border-4 border-black font-pop font-bold focus:outline-none focus:border-pop-red transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-display text-xl py-3 bg-pop-red text-white border-4 border-black shadow-pop-lg hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all tracking-wider disabled:opacity-50"
          >
            {loading ? '...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>

        <p className="mt-4 text-center font-pop font-bold text-black/60">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-pop-red hover:underline ml-1"
          >
            {isRegister ? '登录' : '注册'}
          </button>
        </p>

        <div className="mt-6 pt-4 border-t-4 border-black">
          <p className="text-center font-pop font-bold text-xs text-black/40 mb-3">
            也可以跳过登录，直接使用自己的 API Key
          </p>
          <button
            onClick={() => navigate('/learn')}
            className="w-full font-display text-base py-2.5 bg-pop-yellow text-black border-4 border-black shadow-pop hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all tracking-wider"
          >
            跳过，直接使用
          </button>
        </div>
      </motion.div>
    </div>
  );
}
