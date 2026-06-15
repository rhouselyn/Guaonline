import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { motion } from 'framer-motion';

function FrogMascot({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="120" rx="70" ry="60" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <ellipse cx="100" cy="115" rx="62" ry="52" fill="#3d6354" />
      <circle cx="70" cy="75" r="28" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <circle cx="130" cy="75" r="28" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <circle cx="70" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="130" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="73" cy="73" r="10" fill="#5c2e0a" />
      <circle cx="133" cy="73" r="10" fill="#5c2e0a" />
      <circle cx="76" cy="70" r="3" fill="#f5e6d3" />
      <circle cx="136" cy="70" r="3" fill="#f5e6d3" />
      <ellipse cx="100" cy="128" rx="30" ry="14" fill="#d4a373" stroke="#8b4513" strokeWidth="2" />
      <path d="M78 125 Q100 140 122 125" stroke="#5c2e0a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="55" cy="105" r="8" fill="#c94c4c" opacity="0.3" />
      <circle cx="145" cy="105" r="8" fill="#c94c4c" opacity="0.3" />
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
    <div className="min-h-screen bg-[#f5e6d3] font-serif text-[#5c2e0a] flex items-center justify-center px-4">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeInOut' }}
        className="w-full max-w-md border-2 border-[#8b4513] bg-[#f5e6d3] p-8 md:p-10"
      >
        <div className="flex justify-center mb-6">
          <FrogMascot size={64} />
        </div>

        <h2 className="font-serif uppercase tracking-widest text-2xl md:text-3xl text-center mb-6 text-[#5c2e0a]">
          {isRegister ? '注册呱邻国' : '登录呱邻国'}
        </h2>

        {error && (
          <div className="mb-4 p-3 border-2 border-[#c94c4c] bg-[#c94c4c]/10 text-[#c94c4c] font-serif text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block font-serif uppercase tracking-widest text-xs text-[#8b4513]/60 mb-1">昵称</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 md:px-4 md:py-3 border-2 border-[#8b4513] bg-transparent text-[#8b4513] font-serif focus:outline-none focus:bg-[#8b4513]/5 transition-colors duration-700"
              />
            </div>
          )}

          <div>
            <label className="block font-serif uppercase tracking-widest text-xs text-[#8b4513]/60 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 md:px-4 md:py-3 border-2 border-[#8b4513] bg-transparent text-[#8b4513] font-serif focus:outline-none focus:bg-[#8b4513]/5 transition-colors duration-700"
            />
          </div>

          <div>
            <label className="block font-serif uppercase tracking-widest text-xs text-[#8b4513]/60 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 md:px-4 md:py-3 border-2 border-[#8b4513] bg-transparent text-[#8b4513] font-serif focus:outline-none focus:bg-[#8b4513]/5 transition-colors duration-700"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full font-serif uppercase tracking-widest text-sm md:text-base py-3 bg-[#8b4513] text-[#f5e6d3] border-2 border-[#8b4513] hover:bg-[#5c2e0a] transition-colors duration-700 disabled:opacity-50"
          >
            {loading ? '...' : (isRegister ? '注册' : '登录')}
          </button>
        </form>

        <p className="mt-4 text-center font-serif text-sm text-[#8b4513]/60">
          {isRegister ? '已有账号？' : '没有账号？'}
          <button
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-[#c94c4c] hover:text-[#a33c3c] transition-colors duration-700 ml-1"
          >
            {isRegister ? '登录' : '注册'}
          </button>
        </p>

        <div className="mt-6 pt-4 border-t-2 border-[#8b4513]/20">
          <p className="text-center font-serif text-xs text-[#8b4513]/40 mb-3">
            也可以跳过登录，直接使用自己的 API Key
          </p>
          <button
            onClick={() => navigate('/learn')}
            className="w-full font-serif uppercase tracking-widest text-sm py-2.5 bg-transparent text-[#8b4513] border-2 border-[#8b4513] hover:bg-[#8b4513]/5 transition-colors duration-700"
          >
            跳过，直接使用
          </button>
        </div>
      </motion.div>
    </div>
  );
}
