import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../utils/auth';
import { ArrowLeft, Sparkles } from 'lucide-react';

// 复用着陆页的青蛙 Logo
function FrogLogo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <ellipse cx="100" cy="120" rx="70" ry="55" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3" />
      <ellipse cx="100" cy="115" rx="62" ry="48" fill="#D8D4BF" />
      <circle cx="68" cy="72" r="30" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3" />
      <circle cx="68" cy="72" r="24" fill="#FFF" stroke="#8B7E5E" strokeWidth="2" />
      <circle cx="72" cy="68" r="10" fill="#524D3C" />
      <circle cx="75" cy="65" r="3" fill="#FFF" />
      <circle cx="132" cy="72" r="30" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3" />
      <circle cx="132" cy="72" r="24" fill="#FFF" stroke="#8B7E5E" strokeWidth="2" />
      <circle cx="136" cy="68" r="10" fill="#524D3C" />
      <circle cx="139" cy="65" r="3" fill="#FFF" />
      <ellipse cx="100" cy="130" rx="32" ry="14" fill="#E8C985" stroke="#8B7E5E" strokeWidth="2" />
      <path d="M74 126 Q100 146 126 126" stroke="#524D3C" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="55" cy="110" rx="12" ry="8" fill="#D4A853" opacity="0.4" />
      <ellipse cx="145" cy="110" rx="12" ry="8" fill="#D4A853" opacity="0.4" />
    </svg>
  );
}

// 背景波点动画
function DotBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;
    // 移动端使用更大的点距 + 更低的帧率，减少节点数与主线程占用
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const sp = isMobile ? 56 : 28;
    const frameInterval = 1000 / (isMobile ? 30 : 60);
    let lastDraw = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      time += 0.001;
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = '#faf8f0';
      ctx.fillRect(0, 0, w, h);
      for (let x = sp / 2; x < w; x += sp) {
        for (let y = sp / 2; y < h; y += sp) {
          const d = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          const wave = Math.sin(d * 0.006 - time * 1.5) * 0.5 + 0.5;
          ctx.beginPath();
          ctx.arc(x, y, 1 + wave * 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 160, 120, ${0.05 + wave * 0.05})`;
          ctx.fill();
        }
      }
    };
    // 节流到目标帧率，移动端 ~30fps，桌面端 60fps
    const animate = (now) => {
      if (now - lastDraw >= frameInterval) {
        draw();
        lastDraw = now;
      }
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // ponytail: switch=1 表示从"切换账号"进入，此时原会话仍保留，返回应回到原账号学习页而非首页
  const isSwitching = searchParams.get('switch') === '1';
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
        navigate('/learn');
      } else if (email === 'admin@mail.com') {
        // Admin 登录走专用端点
        const { adminApi } = await import('../utils/adminApi');
        const tokens = await adminApi.login(email, password);
        auth.setTokens(tokens);
        auth.setUser({ role: 'admin', email: 'admin@mail.com' });
        window.location.href = '/admin';
      } else {
        await auth.login(email, password);
        navigate('/learn');
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError(err.response?.data?.detail || '账号已被封禁');
      } else {
        const detail = err.response?.data?.detail;
        setError(detail || (isRegister ? '注册失败' : '登录失败'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <DotBackground />

      <div className="relative z-10 w-full max-w-md mx-4">
        {/* 主卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="bg-[#faf8f0]/90 backdrop-blur-sm border-2 border-[#d4c9a8] rounded-lg p-5 sm:p-8 shadow-[4px_4px_0_#b5ae8e] relative"
        >
          {/* 返回按钮：切换账号模式下原会话仍在，返回学习页；否则回首页 */}
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4 }}
            onClick={() => navigate(isSwitching && auth.isLoggedIn() ? '/learn' : '/')}
            className="absolute top-4 left-4 p-1.5 text-[#8b7e5e] hover:text-[#3d3929] hover:bg-[#f0ead6] rounded transition-colors"
            title={isSwitching ? '返回' : '返回首页'}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>
          {/* 装饰角标 */}
          <div className="absolute -top-px -left-px w-6 h-6 border-t-2 border-l-2 border-[#d4a853] rounded-tl-lg" />
          <div className="absolute -top-px -right-px w-6 h-6 border-t-2 border-r-2 border-[#d4a853] rounded-tr-lg" />
          <div className="absolute -bottom-px -left-px w-6 h-6 border-b-2 border-l-2 border-[#d4a853] rounded-bl-lg" />
          <div className="absolute -bottom-px -right-px w-6 h-6 border-b-2 border-r-2 border-[#d4a853] rounded-br-lg" />

          {/* Logo + 标题 */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="flex justify-center mb-4 relative"
            >
              <FrogLogo size={64} />
              <motion.div
                className="absolute -top-1 -right-1"
                animate={{ rotate: [0, 12, -12, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 4 }}
              >
                <Sparkles className="w-5 h-5 text-[#d4a853]" />
              </motion.div>
            </motion.div>
            <h1 className="text-2xl font-bold text-[#3d3929]"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              {isRegister ? '加入呱邻国' : '欢迎回来'}
            </h1>
            <p className="text-sm text-[#8b7e5e] mt-1">
              {isRegister ? '创建账号，开始你的语言学习之旅' : '登录你的账号，继续学习'}
            </p>
          </div>

          {/* 错误提示 */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 p-3 bg-red-50/80 border border-red-200 text-red-700 text-sm rounded"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 表单 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <label className="block text-xs font-medium text-[#8b7e5e] mb-1.5 tracking-wide uppercase">昵称</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="你希望被怎么称呼？"
                  className="w-full px-3.5 py-2.5 border border-[#d4c9a8] rounded bg-white/80 text-[#3d3929] placeholder-[#b5ae8e] focus:outline-none focus:border-[#d4a853] focus:shadow-[0_0_0_1px_#d4a853] transition-all text-sm"
                />
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#8b7e5e] mb-1.5 tracking-wide uppercase">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                className="w-full px-3.5 py-2.5 border border-[#d4c9a8] rounded bg-white/80 text-[#3d3929] placeholder-[#b5ae8e] focus:outline-none focus:border-[#d4a853] focus:shadow-[0_0_0_1px_#d4a853] transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8b7e5e] mb-1.5 tracking-wide uppercase">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="至少 6 位"
                className="w-full px-3.5 py-2.5 border border-[#d4c9a8] rounded bg-white/80 text-[#3d3929] placeholder-[#b5ae8e] focus:outline-none focus:border-[#d4a853] focus:shadow-[0_0_0_1px_#d4a853] transition-all text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] disabled:opacity-50 transition-all shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] text-sm"
            >
              {loading ? '...' : (isRegister ? '创建账号' : '登录')}
            </button>
          </form>

          {/* 切换登录/注册 */}
          <p className="mt-5 text-center text-sm text-[#8b7e5e]">
            {isRegister ? '已有账号？' : '还没有账号？'}
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); }}
              className="text-[#d4a853] hover:text-[#c49a48] ml-1 font-medium transition-colors"
            >
              {isRegister ? '登录' : '注册一个'}
            </button>
          </p>

          {/* 分隔线 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#d4c9a8]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#faf8f0] px-3 text-xs text-[#b5ae8e]">或者</span>
            </div>
          </div>

          {/* OAuth 登录 */}
          <div className="space-y-3">
            <a
              href="/api/auth/oauth/google"
              className="w-full py-2.5 border border-[#d4c9a8] text-[#524d3c] rounded hover:bg-[#f0ead6] transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              使用 Google 登录
            </a>
            <a
              href="/api/auth/oauth/github"
              className="w-full py-2.5 border border-[#d4c9a8] text-[#524d3c] rounded hover:bg-[#f0ead6] transition-colors text-sm flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              使用 GitHub 登录
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
