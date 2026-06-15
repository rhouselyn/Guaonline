import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { auth } from '../utils/auth';
import { ArrowRight, Globe, PenTool, Brain, Star, Volume2, BarChart3, ChevronDown, Sparkles, BookOpen } from 'lucide-react';

// 算法艺术背景 - Retro 波点 + 流动纹理
function AlgorithmicArtBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      time += 0.002;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = '#faf8f0';
      ctx.fillRect(0, 0, w, h);

      // 波点网格
      const dotSpacing = 32;
      for (let x = dotSpacing / 2; x < w; x += dotSpacing) {
        for (let y = dotSpacing / 2; y < h; y += dotSpacing) {
          const dist = Math.sqrt((x - w / 2) ** 2 + (y - h / 2) ** 2);
          const wave = Math.sin(dist * 0.008 - time * 2) * 0.5 + 0.5;
          const size = 1.5 + wave * 2;
          const alpha = 0.06 + wave * 0.06;

          ctx.beginPath();
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180, 160, 120, ${alpha})`;
          ctx.fill();
        }
      }

      // 漂浮光晕
      for (let i = 0; i < 6; i++) {
        const px = (Math.sin(i * 2.1 + time * 0.4) * 0.35 + 0.5) * w;
        const py = (Math.cos(i * 1.7 + time * 0.3) * 0.35 + 0.5) * h;
        const radius = 120 + Math.sin(i + time) * 40;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
        gradient.addColorStop(0, `rgba(212, 168, 83, 0.06)`);
        gradient.addColorStop(1, `rgba(212, 168, 83, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// SVG 青蛙 Logo - 更精致版本
function FrogLogo({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" className={className}>
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

const FEATURES = [
  { icon: Globe, title: '任意语言互学', desc: '不限语言对，中文学日语、英文学法语……AI 自动识别，自由搭配。', color: '#D4A853' },
  { icon: PenTool, title: '三种输入模式', desc: '直接粘贴文本、翻译后学习、或让 AI 生成学习内容。', color: '#8B7E5E' },
  { icon: Brain, title: 'AI 生成练习', desc: '选词填空、翻译还原、听力理解——5 种题型，全自动生成。', color: '#524D3C' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#D4A853' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，点击即读，听力和发音同步练习。', color: '#8B7E5E' },
  { icon: BarChart3, title: '分阶段学习', desc: '阶段一学单词，阶段二练句子，错题自动回顾。', color: '#524D3C' },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴、翻译或让 AI 生成', icon: PenTool },
  { num: '02', title: 'AI 分句翻译', desc: '自动提取词汇和释义', icon: Brain },
  { num: '03', title: '学单词', desc: '选择、听力、翻译多题型', icon: BookOpen },
  { num: '04', title: '练句子', desc: '填空、还原、错题回顾', icon: Sparkles },
];

const PLANS = [
  {
    id: 'free', name: '免费版', price: '¥0', period: '', highlight: false,
    features: ['自带 API Key', '本地存储', '基础学习功能', '多 Key 轮询', 'Web + 桌面端'],
    cta: '免费开始',
  },
  {
    id: 'basic', name: '基础版', price: '¥19', period: '/月', highlight: true,
    features: ['平台 API 额度（50次/月）', '云同步', 'SRS 间隔复习', '跨设备使用'],
    cta: '即将推出', disabled: true,
  },
  {
    id: 'pro', name: '专业版', price: '¥49', period: '/月', highlight: false,
    features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'],
    cta: '即将推出', disabled: true,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1 } }),
};

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#faf8f0] font-sans overflow-x-hidden">
      {/* 导航栏 */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#faf8f0]/95 backdrop-blur-md shadow-[0_1px_0_#d4c9a8]' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 group">
            <FrogLogo size={32} />
            <span className="text-lg font-bold text-[#3d3929] group-hover:text-[#d4a853] transition-colors"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              呱邻国
            </span>
          </button>
          <div className="flex items-center gap-6">
            <button onClick={scrollToPricing} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">
              定价
            </button>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">
              GitHub
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="px-4 py-1.5 text-sm bg-[#3d3929] text-[#faf8f0] rounded hover:bg-[#524d3c] transition-colors"
            >
              {user ? '进入学习' : '登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        <AlgorithmicArtBackground />
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex justify-center mb-8"
          >
            <div className="relative">
              <FrogLogo size={100} />
              <motion.div
                className="absolute -top-2 -right-2"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Sparkles className="w-6 h-6 text-[#d4a853]" />
              </motion.div>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-5xl md:text-7xl font-bold text-[#3d3929] mb-4"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif", letterSpacing: '-0.02em' }}
          >
            呱邻国
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl text-[#8b7e5e] mb-3"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}
          >
            完全由 AI 驱动的沉浸式语言学习
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-[#8b7e5e]/70 mb-10 max-w-lg mx-auto"
          >
            输入任意文本，AI 自动生成词汇表、分句翻译和多种练习题。任何语言 → 任何语言。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg flex items-center gap-2 shadow-[2px_2px_0_#8b7e5e]"
            >
              {user ? '进入学习' : '免费开始'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3.5 border-2 border-[#b5ae8e] text-[#524d3c] font-medium rounded hover:bg-[#f0ead6] transition-colors text-lg"
            >
              登录
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-6 text-xs text-[#8b7e5e]/50"
          >
            也可以跳过登录，直接使用自己的 API Key
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-16"
          >
            <ChevronDown className="w-6 h-6 text-[#b5ae8e] mx-auto animate-bounce" />
          </motion.div>
        </div>
      </section>

      {/* 功能展示 */}
      <section className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.08 }}
        />
        <div className="max-w-6xl mx-auto relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-[#3d3929] mb-3"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              核心功能
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-[#8b7e5e]">
              从输入到掌握，AI 覆盖全流程
            </motion.p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: '-50px' }}
                  variants={fadeUp}
                  custom={i}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 group hover:shadow-[2px_2px_0_#b5ae8e] transition-shadow"
                >
                  <div className="w-10 h-10 rounded flex items-center justify-center mb-4"
                    style={{ backgroundColor: f.color + '18' }}>
                    <Icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-[#3d3929] mb-2"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
                    {f.title}
                  </h3>
                  <p className="text-sm text-[#8b7e5e] leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-24 px-6 bg-[#f0ead6]/40 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-[#3d3929] mb-3"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              使用流程
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-[#8b7e5e]">
              四步从零到掌握
            </motion.p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  custom={i}
                  className="text-center relative"
                >
                  <div className="w-16 h-16 mx-auto rounded-full bg-[#3d3929] text-[#faf8f0] flex items-center justify-center mb-4 shadow-[2px_2px_0_#d4a853]">
                    <Icon className="w-7 h-7" />
                  </div>
                  <div className="text-xs text-[#b5ae8e] font-mono mb-1">{s.num}</div>
                  <h3 className="font-bold text-[#3d3929] mb-1"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
                    {s.title}
                  </h3>
                  <p className="text-xs text-[#8b7e5e]">{s.desc}</p>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-3 text-[#b5ae8e]">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section id="pricing" className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.06 }}
        />
        <div className="max-w-5xl mx-auto relative">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
            className="text-center mb-16"
          >
            <motion.h2 variants={fadeUp} className="text-3xl md:text-4xl font-bold text-[#3d3929] mb-3"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              选择适合你的方案
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-[#8b7e5e]">
              免费开始，随时升级
            </motion.p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className={`bg-[#faf8f0] border rounded-lg p-7 relative ${
                  plan.highlight
                    ? 'border-[#d4a853] shadow-[3px_3px_0_#d4a853]'
                    : 'border-[#d4c9a8]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#d4a853] text-[#3d3929] text-xs font-bold rounded-full">
                    推荐
                  </div>
                )}
                <h3 className="text-xl font-bold text-[#3d3929] mb-1"
                  style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
                  {plan.name}
                </h3>
                <div className="mb-5">
                  <span className="text-4xl font-bold text-[#3d3929]">{plan.price}</span>
                  <span className="text-[#8b7e5e] text-sm">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {plan.features.map((f, j) => (
                    <li key={j} className="text-sm text-[#524d3c] flex items-start gap-2">
                      <span className="text-[#d4a853] mt-0.5 flex-shrink-0">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full py-2.5 rounded font-medium transition-all text-sm ${
                    plan.highlight
                      ? 'bg-[#d4a853] text-[#3d3929] hover:bg-[#c49a48] shadow-[2px_2px_0_#8b7e5e]'
                      : 'border border-[#d4c9a8] text-[#524d3c] hover:bg-[#f0ead6]'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#3d3929] text-[#faf8f0] text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.04 }}
        />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            开始你的语言学习之旅
          </h2>
          <p className="text-[#b5ae8e] mb-8">
            免费使用，自带 API Key 即刻开始。120+ 种语言，无限可能。
          </p>
          <button
            onClick={() => navigate(user ? '/learn' : '/login')}
            className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg inline-flex items-center gap-2 shadow-[2px_2px_0_#faf8f0/20]"
          >
            {user ? '进入学习' : '免费开始'}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-[#d4c9a8] bg-[#faf8f0]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogLogo size={24} />
            <span className="font-bold text-[#3d3929]"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              呱邻国 Gualingo
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#8b7e5e]">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors">
              GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
