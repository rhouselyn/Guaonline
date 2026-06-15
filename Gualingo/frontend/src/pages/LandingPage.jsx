import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { auth } from '../utils/auth';
import { ArrowRight, BookOpen, Brain, Globe, Languages, Mic, PenTool, Sparkles, Trophy, Volume2, Zap, Star, ChevronDown } from 'lucide-react';

// 霓虹绿青蛙 Logo（与 Guapage 一致）
function FrogLogo({ size = 120, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <ellipse cx="100" cy="120" rx="70" ry="55" fill="#39FF14" stroke="#000" strokeWidth="6" />
      <ellipse cx="100" cy="115" rx="62" ry="48" fill="#5CFF41" />
      <circle cx="68" cy="72" r="30" fill="#39FF14" stroke="#000" strokeWidth="6" />
      <circle cx="68" cy="72" r="24" fill="#FFF" stroke="#000" strokeWidth="4" />
      <circle cx="72" cy="68" r="10" fill="#000" />
      <circle cx="75" cy="65" r="3" fill="#FFF" />
      <circle cx="132" cy="72" r="30" fill="#39FF14" stroke="#000" strokeWidth="6" />
      <circle cx="132" cy="72" r="24" fill="#FFF" stroke="#000" strokeWidth="4" />
      <circle cx="136" cy="68" r="10" fill="#000" />
      <circle cx="139" cy="65" r="3" fill="#FFF" />
      <ellipse cx="100" cy="130" rx="32" ry="14" fill="#FFD700" stroke="#000" strokeWidth="4" />
      <path d="M74 126 Q100 146 126 126" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="55" cy="110" rx="12" ry="8" fill="#FF69B4" opacity="0.6" />
      <ellipse cx="145" cy="110" rx="12" ry="8" fill="#FF69B4" opacity="0.6" />
    </svg>
  );
}

// 圆点背景
function DotPattern({ color = '#FF69B4', opacity = 0.08 }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `radial-gradient(circle, ${color} 1px, transparent 1px)`,
        backgroundSize: '12px 12px',
        opacity,
      }}
    />
  );
}

// 星星装饰
function StarDecor({ x, y, size = 40, color = '#FFD700', delay = 0 }) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: x, top: y }}
      initial={{ scale: 0, rotate: 0 }}
      animate={{ scale: [0, 1.2, 1], rotate: [0, 180, 360] }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    </motion.div>
  );
}

const FEATURES = [
  { icon: Globe, title: '任意语言互学', desc: '不限语言对，中文学日语、英文学法语、韩文学西班牙语……AI 自动识别，自由搭配。', color: '#39FF14' },
  { icon: PenTool, title: '三种输入模式', desc: '直接粘贴文本、翻译后学习、或让 AI 生成学习内容。你的素材你做主。', color: '#FF69B4' },
  { icon: Brain, title: 'AI 生成练习', desc: '选词填空、翻译还原、听力理解、句子翻译——5 种题型，全自动生成。', color: '#FFD700' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#00BFFF' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，点击即读，听力和发音同步练习。', color: '#FF6B35' },
  { icon: Trophy, title: '分阶段学习', desc: '阶段一学单词，阶段二练句子，错题自动回顾，科学掌握每一段文本。', color: '#9B59B6' },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴、翻译或让 AI 生成', icon: PenTool },
  { num: '02', title: 'AI 分句翻译', desc: '自动提取词汇和释义', icon: Languages },
  { num: '03', title: '学单词', desc: '选择、听力、翻译多题型', icon: BookOpen },
  { num: '04', title: '练句子', desc: '填空、还原、错题回顾', icon: Sparkles },
];

const PLANS = [
  {
    id: 'free',
    name: '免费版',
    price: '¥0',
    period: '',
    features: ['自带 API Key', '本地存储', '基础学习功能', '多 Key 轮询', 'Web + 桌面端'],
    cta: '免费开始',
    current: true,
    color: '#39FF14',
  },
  {
    id: 'basic',
    name: '基础版',
    price: '¥19',
    period: '/月',
    features: ['平台 API 额度（50次/月）', '云同步', 'SRS 间隔复习', '跨设备使用'],
    cta: '即将推出',
    highlight: true,
    disabled: true,
    color: '#FFD700',
  },
  {
    id: 'pro',
    name: '专业版',
    price: '¥49',
    period: '/月',
    features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'],
    cta: '即将推出',
    disabled: true,
    color: '#FF69B4',
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const pricingRef = useRef(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  const scrollToPricing = () => {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden" style={{ fontFamily: "'Outfit', 'Noto Sans SC', sans-serif" }}>
      {/* Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin />
      <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Outfit:wght@400;500;600;700;800;900&family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet" />

      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <FrogLogo size={36} />
            <span className="text-xl font-bold" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '1px' }}>GUALINGO</span>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={scrollToPricing} className="text-sm text-white/60 hover:text-white transition-colors">
              定价
            </button>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer" className="text-sm text-white/60 hover:text-white transition-colors">
              GitHub
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="px-4 py-1.5 text-sm font-semibold rounded-full transition-all"
              style={{ background: '#39FF14', color: '#000' }}
            >
              {user ? '进入学习' : '开始使用'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <DotPattern color="#39FF14" opacity={0.04} />
        <StarDecor x="10%" y="20%" size={30} color="#FFD700" delay={0} />
        <StarDecor x="85%" y="15%" size={24} color="#FF69B4" delay={0.2} />
        <StarDecor x="75%" y="75%" size={36} color="#39FF14" delay={0.4} />
        <StarDecor x="15%" y="70%" size={20} color="#00BFFF" delay={0.3} />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="flex justify-center mb-8"
          >
            <FrogLogo size={160} />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-6xl md:text-8xl font-black mb-4"
            style={{ fontFamily: "'Bangers', cursive", letterSpacing: '3px', color: '#39FF14' }}
          >
            呱邻国
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-xl md:text-2xl text-white/70 mb-4 font-medium"
          >
            完全由 AI 驱动的沉浸式语言学习
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-base text-white/40 mb-10 max-w-2xl mx-auto"
          >
            输入任意文本，AI 自动生成词汇表、分句翻译和多种练习题。任何语言 → 任何语言。
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="group px-8 py-4 text-lg font-bold rounded-full transition-all flex items-center gap-2"
              style={{ background: '#39FF14', color: '#000' }}
            >
              {user ? '进入学习' : '免费开始'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-4 text-lg font-medium rounded-full border border-white/20 text-white/80 hover:bg-white/10 transition-all"
            >
              登录
            </button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-6 text-sm text-white/30"
          >
            也可以跳过登录，直接使用自己的 API Key
          </motion.p>
        </div>

        {/* 底部渐变过渡 */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
      </section>

      {/* 功能展示 */}
      <section className="py-24 px-4 relative">
        <DotPattern color="#FF69B4" opacity={0.03} />
        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '2px' }}>
              核心功能
            </h2>
            <p className="text-white/50 text-lg">从输入到掌握，AI 覆盖全流程</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="group relative bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 hover:border-white/20 transition-all duration-300"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${f.color}20` }}
                  >
                    <Icon className="w-6 h-6" style={{ color: f.color }} />
                  </div>
                  <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                  <p className="text-sm text-white/50 leading-relaxed">{f.desc}</p>
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ boxShadow: `0 0 30px ${f.color}15` }}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-24 px-4 relative">
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '2px' }}>
              使用流程
            </h2>
            <p className="text-white/50 text-lg">四步开始你的语言学习之旅</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="text-center"
                >
                  <div className="relative mb-4">
                    <div
                      className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                      style={{ background: '#39FF1415', border: '1px solid #39FF1430' }}
                    >
                      <Icon className="w-7 h-7" style={{ color: '#39FF14' }} />
                    </div>
                    <span
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: '#39FF14', color: '#000' }}
                    >
                      {s.num}
                    </span>
                  </div>
                  <h3 className="font-bold mb-1">{s.title}</h3>
                  <p className="text-sm text-white/40">{s.desc}</p>
                  {i < STEPS.length - 1 && (
                    <div className="hidden md:flex justify-center mt-4">
                      <ArrowRight className="w-5 h-5 text-white/20" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section ref={pricingRef} className="py-24 px-4 relative">
        <DotPattern color="#FFD700" opacity={0.03} />
        <div className="max-w-5xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black mb-4" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '2px' }}>
              定价方案
            </h2>
            <p className="text-white/50 text-lg">免费开始，随时升级</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl p-8 transition-all ${
                  plan.highlight
                    ? 'bg-white/10 border-2'
                    : 'bg-white/5 border border-white/10'
                }`}
                style={plan.highlight ? { borderColor: plan.color } : {}}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 text-xs font-bold rounded-full"
                    style={{ background: plan.color, color: '#000' }}
                  >
                    推荐
                  </div>
                )}
                <h3 className="text-xl font-bold mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-white/40">{plan.period}</span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="text-sm text-white/60 flex items-start gap-2">
                      <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: plan.color }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full py-3 rounded-full font-semibold transition-all ${
                    plan.highlight
                      ? 'hover:opacity-90'
                      : 'border border-white/20 text-white/70 hover:bg-white/10'
                  } disabled:opacity-40`}
                  style={plan.highlight ? { background: plan.color, color: '#000' } : {}}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-4 relative">
        <div className="max-w-3xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="rounded-3xl p-12"
            style={{ background: 'linear-gradient(135deg, #39FF1410, #FF69B410)', border: '1px solid #39FF1430' }}
          >
            <FrogLogo size={80} className="mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-black mb-4" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '2px' }}>
              准备好开始了吗？
            </h2>
            <p className="text-white/50 mb-8">免费使用，无需信用卡。带上你的 API Key，立刻开始学习。</p>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="group px-10 py-4 text-lg font-bold rounded-full transition-all inline-flex items-center gap-2"
              style={{ background: '#39FF14', color: '#000' }}
            >
              {user ? '进入学习' : '免费开始'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FrogLogo size={28} />
            <span className="font-bold" style={{ fontFamily: "'Bangers', cursive", letterSpacing: '1px' }}>GUALINGO</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/40">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
