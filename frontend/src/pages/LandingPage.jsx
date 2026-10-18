import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { auth } from '../utils/auth';
import { usePublicI18n } from '../utils/publicI18n';
import LangSwitcher from '../components/LangSwitcher';
import {
  ArrowRight, Globe, PenTool, Brain, Star, Volume2, BarChart3,
  ChevronDown, Sparkles, BookOpen, List, Mic, Trophy, Check,
  X, MessageSquare, Zap, Search, Headphones, Languages, Code
} from 'lucide-react';

// ponytail: 算法艺术背景 - Retro 波点 + 流动纹理（性能优化版）
// 优化点：移动端降密度（88px）+ 降帧率（30fps via 节流）+ 减少 gradient 数量
// 原版移动端主线程占用 5.2s（Style & Layout 2.8s），是 INP/LCP 主要瓶颈。
function AlgorithmicArtBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;
    let visible = true;
    let pageVisible = true;
    let lastDraw = 0;

    // ponytail: 移动端使用更大的间距 + 更低的帧率，减少 Style & Layout 占用
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const dotSpacing = isMobile ? 88 : 44;
    const gradientCount = isMobile ? 3 : 6;
    // 移动端节流到 ~30fps（每 33ms 一帧），桌面端保持 60fps
    const frameInterval = isMobile ? 33 : 16;

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

      for (let i = 0; i < gradientCount; i++) {
        const px = (Math.sin(i * 2.1 + time * 0.4) * 0.35 + 0.5) * w;
        const py = (Math.cos(i * 1.7 + time * 0.3) * 0.35 + 0.5) * h;
        const radius = 120 + Math.sin(i + time) * 40;
        const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
        gradient.addColorStop(0, `rgba(212, 168, 83, 0.06)`);
        gradient.addColorStop(1, `rgba(212, 168, 83, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      }
    };

    // ponytail: 节流到目标帧率，避免 60fps 全速跑导致主线程被占满
    const loop = (now) => {
      if (visible && pageVisible && (now - lastDraw >= frameInterval)) {
        draw();
        lastDraw = now;
      }
      animId = requestAnimationFrame(loop);
    };

    if (prefersReduced) {
      draw();
      return () => window.removeEventListener('resize', resize);
    }

    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    const onVis = () => { pageVisible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    // ponytail: 推迟到浏览器空闲再启动 rAF 循环，让出 LCP 窗口期（前 ~1s）给首屏文本绘制。
    const startLoop = () => { animId = requestAnimationFrame(loop); };
    const ric = window.requestIdleCallback;
    const idleId = ric
      ? ric(startLoop, { timeout: 1500 })
      : window.setTimeout(startLoop, 1200);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      if (ric) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden="true" />;
}

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

const makeFeatures = (t) => [
  { icon: Sparkles, title: t.lpFeat1Title, desc: t.lpFeat1Desc, color: '#D4A853' },
  { icon: Globe, title: t.lpFeat2Title, desc: t.lpFeat2Desc, color: '#8B7E5E' },
  { icon: List, title: t.lpFeat3Title, desc: t.lpFeat3Desc, color: '#524D3C' },
  { icon: Star, title: t.lpFeat4Title, desc: t.lpFeat4Desc, color: '#D4A853' },
  { icon: Volume2, title: t.lpFeat5Title, desc: t.lpFeat5Desc, color: '#8B7E5E' },
  { icon: Trophy, title: t.lpFeat6Title, desc: t.lpFeat6Desc, color: '#524D3C' },
];

const makeComparison = (t) => [
  { duo: t.lpComp1Duo, gua: t.lpComp1Gua },
  { duo: t.lpComp2Duo, gua: t.lpComp2Gua },
  { duo: t.lpComp3Duo, gua: t.lpComp3Gua },
  { duo: t.lpComp4Duo, gua: t.lpComp4Gua },
  { duo: t.lpComp5Duo, gua: t.lpComp5Gua },
];

const makePainPoints = (t) => [
  { icon: BookOpen, title: t.lpPain1Title, desc: t.lpPain1Desc },
  { icon: Search, title: t.lpPain2Title, desc: t.lpPain2Desc },
  { icon: Globe, title: t.lpPain3Title, desc: t.lpPain3Desc },
];

const makeExercises = (t) => [
  { phase: 1, title: t.lpEx1Title, desc: t.lpEx1Desc, demo: t.lpEx1Demo },
  { phase: 1, title: t.lpEx2Title, desc: t.lpEx2Desc, demo: t.lpEx2Demo },
  { phase: 1, title: t.lpEx3Title, desc: t.lpEx3Desc, demo: t.lpEx3Demo },
  { phase: 2, title: t.lpEx4Title, desc: t.lpEx4Desc, demo: t.lpEx4Demo },
  { phase: 2, title: t.lpEx5Title, desc: t.lpEx5Desc, demo: t.lpEx5Demo },
  { phase: 0, title: t.lpEx6Title, desc: t.lpEx6Desc, demo: t.lpEx6Demo },
];

const makeTargetUsers = (t) => [
  { icon: '🎓', title: t.lpUser1Title, scene: t.lpUser1Scene, desc: t.lpUser1Desc },
  { icon: '💼', title: t.lpUser2Title, scene: t.lpUser2Scene, desc: t.lpUser2Desc },
  { icon: '📖', title: t.lpUser3Title, scene: t.lpUser3Scene, desc: t.lpUser3Desc },
  { icon: '🌏', title: t.lpUser4Title, scene: t.lpUser4Scene, desc: t.lpUser4Desc },
];

const LANG_CLOUD = [
  { name: '中文', color: '#dc2626' }, { name: 'English', color: '#3b82f6' },
  { name: '日本語', color: '#dc2626' }, { name: '한국어', color: '#1d4ed8' },
  { name: 'Español', color: '#ef4444' }, { name: 'Français', color: '#6366f1' },
  { name: 'Deutsch', color: '#eab308' }, { name: 'Italiano', color: '#16a34a' },
  { name: 'Português', color: '#22c55e' }, { name: 'Русский', color: '#1d4ed8' },
  { name: 'ไทย', color: '#7c3aed' }, { name: 'Tiếng Việt', color: '#dc2626' },
  { name: 'العربية', color: '#16a34a' }, { name: 'हिन्दी', color: '#f97316' },
  { name: 'Türkçe', color: '#dc2626' }, { name: 'Suomi', color: '#1d4ed8' },
  { name: 'Magyar', color: '#16a34a' }, { name: 'বাংলা', color: '#f97316' },
  { name: 'Indonesia', color: '#ef4444' }, { name: 'Kiswahili', color: '#16a34a' },
  { name: 'Yue', color: '#dc2626' }, { name: 'Myanmar', color: '#eab308' },
  { name: 'עברית', color: '#2563eb' }, { name: 'தமிழ்', color: '#f97316' },
];

const makeModes = (t) => [
  {
    icon: PenTool, title: t.lpMode1Title, subtitle: t.lpMode1Subtitle,
    desc: t.lpMode1Desc,
    bg: '#d4a853',
  },
  {
    icon: Languages, title: t.lpMode2Title, subtitle: t.lpMode2Subtitle,
    desc: t.lpMode2Desc,
    bg: '#8b7e5e',
  },
  {
    icon: Zap, title: t.lpMode3Title, subtitle: t.lpMode3Subtitle,
    desc: t.lpMode3Desc,
    bg: '#524d3c',
  },
];

const makeSteps = (t) => [
  { num: '01', title: t.lpStep1Title, desc: t.lpStep1Desc, icon: PenTool },
  { num: '02', title: t.lpStep2Title, desc: t.lpStep2Desc, icon: BookOpen },
  { num: '03', title: t.lpStep3Title, desc: t.lpStep3Desc, icon: Mic },
  { num: '04', title: t.lpStep4Title, desc: t.lpStep4Desc, icon: Brain },
  { num: '05', title: t.lpStep5Title, desc: t.lpStep5Desc, icon: Trophy },
  { num: '06', title: t.lpStep6Title, desc: t.lpStep6Desc, icon: Star },
];

const makePlans = (t) => [
  {
    id: 'free', name: t.lpPlan1Name, price: '¥0', period: '', highlight: false,
    features: [t.lpPlan1F1, t.lpPlan1F2, t.lpPlan1F3],
    cta: t.lpPlan1Cta,
  },
  {
    id: 'basic', name: t.lpPlan2Name, price: '¥19', period: t.lpPeriodMonth, highlight: true,
    features: [t.lpPlan2F1, t.lpPlan2F2, t.lpPlan2F3, t.lpPlan2F4, t.lpPlan2F5],
    cta: t.lpPlan2Cta, disabled: true,
  },
  {
    id: 'pro', name: t.lpPlan3Name, price: '¥49', period: t.lpPeriodMonth, highlight: false,
    features: [t.lpPlan3F1, t.lpPlan3F2, t.lpPlan3F3, t.lpPlan3F4, t.lpPlan3F5],
    cta: t.lpPlan3Cta, disabled: true,
  },
];

const makeFaq = (t) => [
  { q: t.lpFaq1Q, a: t.lpFaq1A },
  { q: t.lpFaq2Q, a: t.lpFaq2A },
  { q: t.lpFaq3Q, a: t.lpFaq3A },
  { q: t.lpFaq4Q, a: t.lpFaq4A },
  { q: t.lpFaq5Q, a: t.lpFaq5A },
  { q: t.lpFaq6Q, a: t.lpFaq6A },
];

// ponytail: 原 fadeUp variants 已被 CSS .reveal 类替代，由 IntersectionObserver 触发
function SectionTitle({ children, sub }) {
  return (
    <div className="reveal text-center mb-14">
      <h2 className="text-3xl md:text-4xl font-bold text-[#3d3929] mb-3"
        style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
        {children}
      </h2>
      {sub && <p className="reveal text-[#8b7e5e]" style={{ transitionDelay: '100ms' }}>{sub}</p>}
    </div>
  );
}

export default function LandingPage() {
  const { lang, t, changeLang } = usePublicI18n();
  const [user, setUser] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const features = makeFeatures(t);
  const comparison = makeComparison(t);
  const painPoints = makePainPoints(t);
  const exercises = makeExercises(t);
  const targetUsers = makeTargetUsers(t);
  const modes = makeModes(t);
  const steps = makeSteps(t);
  const plans = makePlans(t);
  const faq = makeFaq(t);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ponytail: 单一 IntersectionObserver 处理所有 .reveal 元素的入场动画
  // 替代 framer-motion 的 whileInView，零 JS 动画运行时（仅类名切换）
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('reveal-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -80px 0px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#faf8f0] font-sans overflow-x-hidden">
      {/* 导航栏 */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#faf8f0]/95 backdrop-blur-md shadow-[0_1px_0_#d4c9a8]' : 'bg-transparent'
      }`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-2.5 group">
            <FrogLogo size={32} />
            <span className="text-lg font-bold text-[#3d3929] group-hover:text-[#d4a853] transition-colors"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              {t.title}
            </span>
          </button>
          <div className="flex items-center gap-3">
            <LangSwitcher lang={lang} onChange={changeLang} />
            <div className="hidden sm:flex items-center gap-6">
              <button onClick={() => scrollTo('modes')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">{t.lpNavModes}</button>
              <button onClick={() => scrollTo('exercises')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">{t.lpNavExercises}</button>
              <button onClick={() => scrollTo('comparison')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">{t.lpNavComparison}</button>
              <button onClick={() => scrollTo('features')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">{t.lpNavFeatures}</button>
              <button onClick={() => scrollTo('pricing')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">{t.lpNavPricing}</button>
              <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
                className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">GitHub</a>
              <a
                href={user ? '/learn' : '/login'}
                className="px-4 py-1.5 text-sm bg-[#3d3929] text-[#faf8f0] rounded hover:bg-[#524d3c] transition-colors">
                {user ? t.lpEnterLearn : t.lpLogin}
              </a>
            </div>
            {/* 手机汉堡按钮 */}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="sm:hidden w-10 h-10 flex items-center justify-center text-[#3d3929] hover:bg-[#d4c9a8]/40 rounded-md transition-colors"
              aria-label={t.lpMenu}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              )}
            </button>
          </div>
        </div>
        {/* 手机下拉菜单 */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="sm:hidden absolute top-16 left-0 right-0 bg-[#faf8f0] border-b-2 border-[#d4c9a8] shadow-retro-lg z-40 overflow-hidden"
          >
            <div className="flex flex-col px-6 py-4 gap-1">
              <button onClick={() => { scrollTo('modes'); setMobileMenuOpen(false); }} className="btn-ghost text-left">{t.lpNavModes}</button>
              <button onClick={() => { scrollTo('exercises'); setMobileMenuOpen(false); }} className="btn-ghost text-left">{t.lpNavExercises}</button>
              <button onClick={() => { scrollTo('comparison'); setMobileMenuOpen(false); }} className="btn-ghost text-left">{t.lpNavComparison}</button>
              <button onClick={() => { scrollTo('features'); setMobileMenuOpen(false); }} className="btn-ghost text-left">{t.lpNavFeatures}</button>
              <button onClick={() => { scrollTo('pricing'); setMobileMenuOpen(false); }} className="btn-ghost text-left">{t.lpNavPricing}</button>
              <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer" onClick={() => setMobileMenuOpen(false)} className="btn-ghost text-left">GitHub</a>
              <div className="border-t border-[#d4c9a8] my-1" />
              <a href={user ? '/learn' : '/login'} onClick={() => setMobileMenuOpen(false)} className="btn-primary block text-center">{user ? t.lpEnterLearn : t.lpLogin}</a>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero
          ponytail: 首屏文本使用原生 HTML + CSS 动画，无 framer-motion 依赖。
          LCP 元素（描述段落）首帧即绘制，H1/副标题用 CSS slide-up 错峰呈现。
          下方视口外区块使用 .reveal + IntersectionObserver，零 JS 动画运行时。 */}
      <section className="relative min-h-screen min-h-[100svh] flex items-center justify-center overflow-hidden pt-16">
        <AlgorithmicArtBackground />
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <div className="flex justify-center mb-8 hero-fade-in" style={{ animationDelay: '0ms' }}>
            <div className="relative">
              <FrogLogo size={100} />
              <div className="absolute -top-2 -right-2 hero-sparkle">
                <Sparkles className="w-6 h-6 text-[#d4a853]" />
              </div>
            </div>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold text-[#3d3929] mb-4 hero-fade-in"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif", letterSpacing: '-0.02em', animationDelay: '150ms' }}>
            {t.title}
          </h1>

          <p className="text-lg md:text-xl text-[#8b7e5e] mb-2 hero-fade-in"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif", animationDelay: '250ms' }}>
            {t.lpHeroTagline}
          </p>

          {/* LCP 元素：无动画，首帧即绘制，避免等待 framer-motion */}
          <p className="text-[#8b7e5e]/70 mb-10 max-w-lg mx-auto leading-relaxed">
            {t.lpHeroDesc1}<br />
            {t.lpHeroDesc2}
          </p>

          <div className="flex justify-center items-center hero-fade-in" style={{ animationDelay: '450ms' }}>
            <a href={user ? '/learn' : '/login'}
              className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg flex items-center gap-2 shadow-[2px_2px_0_#8b7e5e]">
              {user ? t.lpEnterLearn : t.lpStartFree}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          <div className="mt-16 hero-fade-in" style={{ animationDelay: '800ms' }}>
            <ChevronDown className="w-6 h-6 text-[#b5ae8e] mx-auto animate-bounce" />
          </div>
        </div>
      </section>

      {/* 痛点洞察 */}
      <section className="py-24 px-4 sm:px-6 bg-[#f0ead6]/30 relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.06 }} />
        <div className="max-w-6xl mx-auto relative">
          <SectionTitle sub={t.lpPainSub}>{t.lpPainTitle}</SectionTitle>
          <p className="reveal text-center text-[#8b7e5e] max-w-2xl mx-auto mb-12 leading-relaxed">
            {t.lpPainPara}
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={i} className="reveal reveal-hover bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 relative overflow-hidden" style={{ transitionDelay: `${i * 100}ms` }}>
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#c45c3c]" />
                  <div className="w-11 h-11 rounded flex items-center justify-center mb-4 bg-[#c45c3c]/10">
                    <Icon className="w-5 h-5 text-[#c45c3c]" />
                  </div>
                  <h3 className="text-lg font-bold text-[#3d3929] mb-2"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{p.title}</h3>
                  <p className="text-sm text-[#8b7e5e] leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 三种模式 - 解决方案 */}
      <section id="modes" className="py-24 px-4 sm:px-6 bg-[#faf8f0] relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub={t.lpModesSub}>
            {t.lpModesTitleA}<span className="text-[#d4a853]">{t.lpModesTitleB}</span>
          </SectionTitle>
          <div className="grid md:grid-cols-3 gap-6">
            {modes.map((m, i) => {
              const Icon = m.icon;
              return (
                <div key={i} className="reveal rounded-lg overflow-hidden border border-[#d4c9a8]" style={{ transitionDelay: `${i * 100}ms` }}>
                  <div className="px-6 py-4" style={{ backgroundColor: m.bg }}>
                    <Icon className="w-6 h-6 text-[#faf8f0] mb-2" />
                    <h3 className="text-xl font-bold text-[#faf8f0]"
                      style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{m.title}</h3>
                    <p className="text-sm text-[#faf8f0]/70">{m.subtitle}</p>
                  </div>
                  <div className="px-6 py-5 bg-[#faf8f0]">
                    <p className="text-sm text-[#524d3c] leading-relaxed">{m.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-24 px-4 sm:px-6 bg-[#f0ead6]/30 relative">
        <div className="max-w-5xl mx-auto">
          <SectionTitle sub={t.lpStepsSub}>
            {t.lpStepsTitleA}<span className="text-[#d4a853]">{t.lpStepsTitleB}</span>
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="reveal text-center relative" style={{ transitionDelay: `${i * 100}ms` }}>
                  <div className="w-14 h-14 mx-auto rounded-full bg-[#3d3929] text-[#faf8f0] flex items-center justify-center mb-3 shadow-[2px_2px_0_#d4a853]">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-[#b5ae8e] font-mono mb-1">{s.num}</div>
                  <h3 className="font-bold text-[#3d3929] text-sm mb-1"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{s.title}</h3>
                  <p className="text-xs text-[#8b7e5e]">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 练习体系 */}
      <section id="exercises" className="py-24 px-4 sm:px-6 bg-[#faf8f0] relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub={t.lpExSub}>{t.lpExTitle}</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {exercises.map((ex, i) => (
              <div key={i} className={`reveal reveal-hover rounded-lg p-6 hover:shadow-[2px_2px_0_#b5ae8e] transition-shadow ${
                  ex.phase === 0
                    ? 'bg-[#3d3929] text-[#faf8f0] border border-[#3d3929]'
                    : 'bg-[#faf8f0] border border-[#d4c9a8]'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}>
                {ex.phase > 0 ? (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wide mb-3 ${
                    ex.phase === 1
                      ? 'bg-[#8b7e5e]/10 text-[#8b7e5e] border border-[#8b7e5e]/20'
                      : 'bg-[#d4a853]/10 text-[#B8860B] border border-[#d4a853]/20'
                  }`}>
                    {ex.phase === 1 ? t.lpPhase1 : t.lpPhase2}
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wide mb-3 bg-[#d4a853]/20 text-[#d4a853] border border-[#d4a853]/30">
                    {t.lpPhaseFinal}
                  </span>
                )}
                <h3 className={`text-lg font-bold mb-2 ${
                  ex.phase === 0 ? 'text-[#faf8f0]' : 'text-[#3d3929]'
                }`} style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{ex.title}</h3>
                <p className={`text-sm leading-relaxed mb-3 ${
                  ex.phase === 0 ? 'text-[#b5ae8e]' : 'text-[#8b7e5e]'
                }`}>{ex.desc}</p>
                <div className={`rounded px-3 py-2 text-sm border-l-2 ${
                  ex.phase === 0
                    ? 'bg-[#faf8f0]/10 border-[#d4a853] text-[#d4a853]'
                    : 'bg-[#f0ead6] border-[#d4a853] text-[#8b7e5e]'
                }`}>
                  <code className={`px-1.5 py-0.5 rounded text-xs ${
                    ex.phase === 0
                      ? 'bg-[#d4a853]/20 text-[#d4a853]'
                      : 'bg-[#d4a853]/10 text-[#B8860B]'
                  }`}>{ex.demo}</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 对比多邻国 */}
      <section id="comparison" className="py-24 px-4 sm:px-6 bg-[#3d3929] text-[#faf8f0] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.03 }} />
        <div className="max-w-4xl mx-auto relative">
          <SectionTitle sub={t.lpCompSub}>
            <span className="text-[#faf8f0]">{t.lpCompTitleA}</span>
            <br className="md:hidden" />
            <span className="text-[#d4a853]"> {t.lpCompTitleB}</span>
          </SectionTitle>
          <div className="space-y-4">
            {comparison.map((row, i) => (
              <div key={i} className="reveal flex items-center gap-2 sm:gap-4 md:gap-8" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="flex-1 min-w-0 text-right">
                  <span className="text-[#b5ae8e] text-sm md:text-base line-through decoration-[#8b7e5e]/40">{row.duo}</span>
                </div>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#d4a853] flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-[#3d3929]" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[#faf8f0] text-sm md:text-base font-medium">{row.gua}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 特色功能 */}
      <section id="features" className="py-24 px-4 sm:px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.08 }} />
        <div className="max-w-6xl mx-auto relative">
          <SectionTitle sub={t.lpFeatSub}>{t.lpFeatTitle}</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f, i) => {
              const Icon = f.icon;
              return (
                <div key={i} className="reveal reveal-hover bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 hover:shadow-[2px_2px_0_#b5ae8e] transition-shadow" style={{ transitionDelay: `${i * 100}ms` }}>
                  <div className="w-10 h-10 rounded flex items-center justify-center mb-4"
                    style={{ backgroundColor: f.color + '18' }}>
                    <Icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-[#3d3929] mb-2"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{f.title}</h3>
                  <p className="text-sm text-[#8b7e5e] leading-relaxed">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 目标用户 */}
      <section id="users" className="py-24 px-4 sm:px-6 bg-[#f0ead6]/30 relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub={t.lpUsersSub}>{t.lpUsersTitle}</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {targetUsers.map((u, i) => (
              <div key={i} className="reveal reveal-hover bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 text-center" style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl bg-[#8b7e5e]/10 border-2 border-[#8b7e5e]/15">
                  {u.icon}
                </div>
                <h3 className="text-lg font-bold text-[#3d3929] mb-1"
                  style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{u.title}</h3>
                <p className="text-sm text-[#8b7e5e] font-medium mb-3">{u.scene}</p>
                <p className="text-sm text-[#524d3c] leading-relaxed">{u.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 语言云 */}
      <section className="py-16 px-4 sm:px-6 bg-[#3d3929] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.03 }} />
        <div className="max-w-4xl mx-auto relative text-center">
          <p className="reveal text-sm text-[#b5ae8e] mb-2">{t.lpLangCloudNote}</p>
          <p className="reveal text-xs text-[#b5ae8e]/60 mb-4" style={{ transitionDelay: '100ms' }}>{t.lpLangCloudSub}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {LANG_CLOUD.map((lang, i) => (
              <span key={i} className="reveal px-3 py-1 rounded text-xs font-semibold text-white tracking-wide hover:scale-110 transition-transform cursor-default"
                style={{ backgroundColor: lang.color, transitionDelay: `${i * 30}ms` }}>
                {lang.name}
              </span>
            ))}
            <span className="px-3 py-1 rounded text-xs font-semibold text-white bg-[#78716c]">120+ ...</span>
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section id="pricing" className="py-24 px-4 sm:px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.06 }} />
        <div className="max-w-5xl mx-auto relative">
          <SectionTitle sub={t.lpPricingSub}>{t.lpPricingTitle}</SectionTitle>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan, i) => (
              <div key={plan.id} className={`reveal bg-[#faf8f0] border rounded-lg p-7 relative ${
                  plan.highlight ? 'border-[#d4a853] shadow-[3px_3px_0_#d4a853]' : 'border-[#d4c9a8]'
                }`}
                style={{ transitionDelay: `${i * 100}ms` }}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#d4a853] text-[#3d3929] text-xs font-bold rounded-full">
                     {t.lpRecommended}
                  </div>
                )}
                <h3 className="text-xl font-bold text-[#3d3929] mb-1"
                  style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{plan.name}</h3>
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
                {plan.disabled ? (
                  <button disabled
                    className={`w-full py-2.5 rounded font-medium transition-all text-sm cursor-not-allowed ${
                      plan.highlight
                        ? 'bg-[#d4a853] text-[#3d3929] shadow-[2px_2px_0_#8b7e5e]'
                        : 'border border-[#d4c9a8] text-[#524d3c]'
                    } opacity-40`}>
                    {plan.cta}
                  </button>
                ) : (
                  <a href="/login"
                    className={`w-full py-2.5 rounded font-medium transition-all text-sm block text-center ${
                      plan.highlight
                        ? 'bg-[#d4a853] text-[#3d3929] hover:bg-[#c49a48] shadow-[2px_2px_0_#8b7e5e]'
                        : 'border border-[#d4c9a8] text-[#524d3c] hover:bg-[#f0ead6]'
                    }`}>
                    {plan.cta}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 bg-[#3d3929] text-[#faf8f0] text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.04 }} />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            {t.lpCtaTitle}
          </h2>
          <p className="text-[#b5ae8e] mb-2">
            {t.lpCtaDesc1}
          </p>
          <p className="text-[#b5ae8e]/70 text-sm mb-8">
            {t.lpCtaDesc2}
          </p>
          <a href={user ? '/learn' : '/login'}
            className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg inline-flex items-center gap-2 shadow-[2px_2px_0_#faf8f0/20]">
            {user ? t.lpEnterLearn : t.lpCtaStart}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </section>

      {/* FAQ：以问答形式覆盖长尾搜索意图（替代原关键词堆砌带） */}
      <section className="py-12 px-4 sm:px-6 bg-[#faf8f0] border-t border-[#d4c9a8]/50" aria-label={t.lpFaqTitle}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-[#3d3929] mb-8 text-center" style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            {t.lpFaqTitle}
          </h2>
          <div className="space-y-4">
            {faq.map((item, i) => (
              <details key={i} className="group bg-white/60 rounded-lg border border-[#d4c9a8]/60 overflow-hidden">
                <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none text-[#3d3929] font-medium hover:bg-[#f0ead6]/50 transition-colors">
                  <span>{item.q}</span>
                  <span className="text-[#8b7e5e] group-open:rotate-180 transition-transform">⌄</span>
                </summary>
                <p className="px-5 pb-4 text-sm text-[#8b7e5e] leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-8 px-4 sm:px-6 border-t border-[#d4c9a8] bg-[#faf8f0]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogLogo size={24} />
            <span className="font-bold text-[#3d3929]"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              {t.title}
            </span>
            <span className="text-xs text-[#b5ae8e]">{t.lpFooterDev}</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#8b7e5e]">
            <span>{t.lpFooterLlm}</span>
            <span>{t.lpFooterLicense}</span>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors">GitHub</a>
            <a href="https://github.com/rhouselyn/Gualingo/issues/new" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors">{t.lpFooterFeedback}</a>
            {/* 小红书 */}
            <a href="https://www.xiaohongshu.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center text-[#8b7e5e]" title="小红书" aria-label="小红书">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M22.405 9.879c.002.016.01.02.07.019h.725a.797.797 0 0 0 .78-.972.794.794 0 0 0-.884-.618.795.795 0 0 0-.692.794c0 .101-.002.666.001.777zm-11.509 4.808c-.203.001-1.353.004-1.685.003a2.528 2.528 0 0 1-.766-.126.025.025 0 0 0-.03.014L7.7 16.127a.025.025 0 0 0 .01.032c.111.06.336.124.495.124.66.01 1.32.002 1.981 0 .01 0 .02-.006.023-.015l.712-1.545a.025.025 0 0 0-.024-.036zM.477 9.91c-.071 0-.076.002-.076.01a.834.834 0 0 0-.01.08c-.027.397-.038.495-.234 3.06-.012.24-.034.389-.135.607-.026.057-.033.042.003.112.046.092.681 1.523.787 1.74.008.015.011.02.017.02.008 0 .033-.026.047-.044.147-.187.268-.391.371-.606.306-.635.44-1.325.486-1.706.014-.11.021-.22.03-.33l.204-2.616.022-.293c.003-.029 0-.033-.03-.034zm7.203 3.757a1.427 1.427 0 0 1-.135-.607c-.004-.084-.031-.39-.235-3.06a.443.443 0 0 0-.01-.082c-.004-.011-.052-.008-.076-.008h-1.48c-.03.001-.034.005-.03.034l.021.293c.076.982.153 1.964.233 2.946.05.4.186 1.085.487 1.706.103.215.223.419.37.606.015.018.037.051.048.049.02-.003.742-1.642.804-1.765.036-.07.03-.055.003-.112zm3.861-.913h-.872a.126.126 0 0 1-.116-.178l1.178-2.625a.025.025 0 0 0-.023-.035l-1.318-.003a.148.148 0 0 1-.135-.21l.876-1.954a.025.025 0 0 0-.023-.035h-1.56c-.01 0-.02.006-.024.015l-.926 2.068c-.085.169-.314.634-.399.938a.534.534 0 0 0-.02.191.46.46 0 0 0 .23.378.981.981 0 0 0 .46.119h.59c.041 0-.688 1.482-.834 1.972a.53.53 0 0 0-.023.172.465.465 0 0 0 .23.398c.15.092.342.12.475.12l1.66-.001c.01 0 .02-.006.023-.015l.575-1.28a.025.025 0 0 0-.024-.035zm-6.93-4.937H3.1a.032.032 0 0 0-.034.033c0 1.048-.01 2.795-.01 6.829 0 .288-.269.262-.28.262h-.74c-.04.001-.044.004-.04.047.001.037.465 1.064.555 1.263.01.02.03.033.051.033.157.003.767.009.938-.014.153-.02.3-.06.438-.132.3-.156.49-.419.595-.765.052-.172.075-.353.075-.533.002-2.33 0-4.66-.007-6.991a.032.032 0 0 0-.032-.032zm11.784 6.896c0-.014-.01-.021-.024-.022h-1.465c-.048-.001-.049-.002-.05-.049v-4.66c0-.072-.005-.07.07-.07h.863c.08 0 .075.004.075-.074V8.393c0-.082.006-.076-.08-.076h-3.5c-.064 0-.075-.006-.075.073v1.445c0 .083-.006.077.08.077h.854c.075 0 .07-.004.07.07v4.624c0 .095.008.084-.085.084-.37 0-1.11-.002-1.304 0-.048.001-.06.03-.06.03l-.697 1.519s-.014.025-.008.036c.006.01.013.008.058.008 1.748.003 3.495.002 5.243.002.03-.001.034-.006.035-.033v-1.539zm4.177-3.43c0 .013-.007.023-.02.024-.346.006-.692.004-1.037.004-.014-.002-.022-.01-.022-.024-.005-.434-.007-.869-.01-1.303 0-.072-.006-.071.07-.07l.733-.003c.041 0 .081.002.12.015.093.025.16.107.165.204.006.431.002 1.153.001 1.153zm2.67.244a1.953 1.953 0 0 0-.883-.222h-.18c-.04-.001-.04-.003-.042-.04V10.21c0-.132-.007-.263-.025-.394a1.823 1.823 0 0 0-.153-.53 1.533 1.533 0 0 0-.677-.71 2.167 2.167 0 0 0-1-.258c-.153-.003-.567 0-.72 0-.07 0-.068.004-.068-.065V7.76c0-.031-.01-.041-.046-.039H17.93s-.016 0-.023.007c-.006.006-.008.012-.008.023v.546c-.008.036-.057.015-.082.022h-.95c-.022.002-.028.008-.03.032v1.481c0 .09-.004.082.082.082h.913c.082 0 .072.128.072.128V11.19s.003.117-.06.117h-1.482c-.068 0-.06.082-.06.082v1.445s-.01.068.064.068h1.457c.082 0 .076-.006.076.079v3.225c0 .088-.007.081.082.081h1.43c.09 0 .082.007.082-.08v-3.27c0-.029.006-.035.033-.035l2.323-.003c.098 0 .191.02.28.061a.46.46 0 0 1 .274.407c.008.395.003.79.003 1.185 0 .259-.107.367-.33.367h-1.218c-.023.002-.029.008-.028.033.184.437.374.871.57 1.303a.045.045 0 0 0 .04.026c.17.005.34.002.51.003.15-.002.517.004.666-.01a2.03 2.03 0 0 0 .408-.075c.59-.18.975-.698.976-1.313v-1.981c0-.128-.01-.254-.034-.38 0 .078-.029-.641-.724-.998z"/></svg>
            </a>
            {/* 微信 */}
            <a href="https://weixin.qq.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center text-[#8b7e5e]" title="微信" aria-label="微信">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>
            </a>
            {/* QQ */}
            <a href="https://im.qq.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center text-[#8b7e5e]" title="QQ" aria-label="QQ">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" role="img" aria-hidden="true"><path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673"/></svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
