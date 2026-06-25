import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { auth } from '../utils/auth';
import {
  ArrowRight, Globe, PenTool, Brain, Star, Volume2, BarChart3,
  ChevronDown, Sparkles, BookOpen, List, Mic, Trophy, Check,
  X, MessageSquare, Zap, Search, Headphones, Languages, Code
} from 'lucide-react';

// 算法艺术背景 - Retro 波点 + 流动纹理（性能优化：不可见/后台时暂停，降低密度）
function AlgorithmicArtBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 尊重“减少动态效果”偏好，直接静态绘制一帧
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;
    let visible = true;
    let pageVisible = true;

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

      // 加大间距，减少绘制点数量，降低主线程负载（INP）
      const dotSpacing = 44;
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
    };

    const loop = () => {
      if (visible && pageVisible) draw();
      animId = requestAnimationFrame(loop);
    };

    // 仅绘制一帧用于降级场景
    if (prefersReduced) {
      draw();
      return () => window.removeEventListener('resize', resize);
    }

    // 视口外暂停（节省主线程）
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);
    // 标签页隐藏时暂停
    const onVis = () => { pageVisible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    loop();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
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

const FEATURES = [
  { icon: Sparkles, title: '自动生成内容', desc: '粘贴英语新闻、日语歌词、法语文章——任何文本丢进来，AI 自动检测语言、分句翻译、提取词汇，省去手动整理的麻烦。', color: '#D4A853' },
  { icon: Globe, title: '任意语言互学', desc: '英语、日语、法语、德语、泰语、越南语……120+ 种语言 TTS 朗读，小语种也能学，不受平台资源限制。', color: '#8B7E5E' },
  { icon: List, title: '完整词汇表', desc: '自动生成词汇表，支持字母索引、搜索、逐词详情，随时查阅。比手动抄单词本高效 10 倍。', color: '#524D3C' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#D4A853' },
  { icon: Volume2, title: '语音朗读', desc: '基于 Edge TTS，单词和句子都能朗读，常速/慢速自由切换。练听力、练发音一步到位。', color: '#8B7E5E' },
  { icon: Trophy, title: '星级评价', desc: '每个单元完成后获得星级评价，答错的题自动进入错题回顾。像游戏一样有成就感。', color: '#524D3C' },
];

const COMPARISON = [
  { duo: '没有单词表，复习无门', gua: '自动生成完整词汇表' },
  { duo: '做题时想查其它单词', gua: '学习过程中随时打开单词表' },
  { duo: '学了也很难用上', gua: '你提供什么素材就学什么' },
  { duo: '小众语种不支持', gua: '英语日语法语德语泰语越南语都能学' },
  { duo: '无法深入理解一篇文章', gua: '分句翻译，彻底吃透阅读理解' },
];

const PAIN_POINTS = [
  { icon: BookOpen, title: '课程内容千篇一律', desc: '市面上的 App 用统一教材教所有人，你被迫学跟自己无关的对话场景，学了忘、忘了学。留学备考想练真题阅读？中学英语想精读课文？固定课程帮不了你。' },
  { icon: Search, title: '生词脱离上下文', desc: '单独背单词没有语境，记住的只是翻译对照，真到阅读理解和写作时还是不会用。英语阅读理解丢分，往往就是生词没吃透。' },
  { icon: Globe, title: '小语种资源匮乏', desc: '想学泰语、越南语、阿拉伯语？法语 DELF、德语德福备考？主流 App 要么不支持，要么内容极少。' },
];

const EXERCISES = [
  { phase: 1, title: '单词选择题', desc: '看到目标语言单词，从四个母语释义中选出正确答案。答对后展开完整单词卡：释义、词形变化、例句、记忆辅助。', demo: 'abandon → 废弃 / 采纳 / 伴随 / 仰慕 ✓' },
  { phase: 1, title: '句子翻译排序', desc: '将打乱的母语翻译片段拖拽排列成正确顺序，训练对句子结构和语义的理解。', demo: '他 / 放弃了 / 这个 / 计划 → 拖拽排序' },
  { phase: 1, title: '听力理解', desc: '听朗读句子，从四个翻译选项中选出正确含义。可随时点击重听。', demo: '🔊 He abandoned the plan. → 选出正确翻译' },
  { phase: 2, title: '遮蔽填空', desc: '原文中随机遮蔽若干单词，从候选词池中选出正确单词填入空位。同一句子多次出现，每次遮蔽不同位置。', demo: 'He ___ the plan. → 候选：abandon / adopted / ...' },
  { phase: 2, title: '翻译重组', desc: '看到原文句子，将打乱的母语翻译片段重新排列成正确顺序。需要自己理解原文并组织翻译。', demo: '原文：He abandoned the plan. → 重组翻译片段' },
  { phase: 0, title: '错题回顾 + 星级评价', desc: '答错的题自动收集，强化练习直到掌握。每个单元根据错误数量给出 0-3 星评价。', demo: '⭐⭐⭐ 满星通过 / ❌ 错题自动进入复习' },
];

const TARGET_USERS = [
  { icon: '🎓', title: '留学备考 & 语言学习者', scene: '雅思托福 / 日语N1N2 / 法语DELF', desc: '厌倦了固定教材？粘贴真题阅读、留学文书、播客文本，立刻生成专属练习。比刷题更高效，比背单词更深入。' },
  { icon: '💼', title: '职场人士', scene: '外企沟通 / 专业阅读', desc: '把英文邮件、德语行业报告、法语商务文档变成学习材料，学到的就是用得上的。' },
  { icon: '📖', title: '中学生 & 家长', scene: '英语阅读理解 / 课文精读', desc: '粘贴英语课文或阅读理解原文，自动生成词汇表和练习题。生词在语境中记忆，阅读理解不再丢分。' },
  { icon: '🌏', title: '小语种爱好者', scene: '旅行 / 文化探索', desc: '100+ 种语言支持，泰语、越南语、阿拉伯语、韩语……主流 App 忽略的语言，这里都能学。' },
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

const MODES = [
  {
    icon: PenTool, title: '直接输入', subtitle: '我有素材，想直接学',
    desc: '粘贴一篇 BBC 英语新闻、一首日语歌词、一段法语课文——任何外语文本丢进来，自动检测语言、分句翻译、提取词汇。',
    bg: '#d4a853',
  },
  {
    icon: Languages, title: '自动翻译', subtitle: '我想用母语素材来学外语',
    desc: '输入中文，自动翻译成英语、日语、法语等目标语言，然后基于翻译后的文本生成词汇和练习。留学文书也能这样练。',
    bg: '#8b7e5e',
  },
  {
    icon: Zap, title: '自由生成', subtitle: '我没有素材，帮我生成',
    desc: '告诉它你想学什么主题——"日语旅行对话""德语商务邮件""法语日常会话"——自动生成目标语言文本，然后开始学习。',
    bg: '#524d3c',
  },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴外语文本、翻译母语文本、或让系统生成', icon: PenTool },
  { num: '02', title: '浏览字典', desc: '查看分句翻译和词汇释义，随时查阅任意单词', icon: BookOpen },
  { num: '03', title: '阶段一练习', desc: '单词选择、句子翻译、听力理解', icon: Mic },
  { num: '04', title: '阶段二练习', desc: '遮蔽填空、翻译重组', icon: Brain },
  { num: '05', title: '错题回顾', desc: '答错的题自动收集，强化练习直到掌握', icon: Trophy },
  { num: '06', title: '收藏单词', desc: '一键收藏生词，方便重点复习', icon: Star },
];

const PLANS = [
  {
    id: 'free', name: '免费版', price: '¥0', period: '', highlight: false,
    features: ['免费 200 句额度', '每日恢复 50 句（上限 200）', '基础学习功能'],
    cta: '免费开始',
  },
  {
    id: 'basic', name: '基础版', price: '¥19', period: '/月', highlight: true,
    features: ['2000 句/月', '更优模型', '云同步', 'SRS 间隔复习', '跨设备使用'],
    cta: '即将推出', disabled: true,
  },
  {
    id: 'pro', name: '专业版', price: '¥49', period: '/月', highlight: false,
    features: ['无限 API 额度', '口语对话', '学习分析', '优先支持', '所有基础版功能'],
    cta: '即将推出', disabled: true,
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.1 } }),
};

function SectionTitle({ children, sub }) {
  return (
    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}
      className="text-center mb-14">
      <motion.h2 variants={fadeUp}
        className="text-3xl md:text-4xl font-bold text-[#3d3929] mb-3"
        style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
        {children}
      </motion.h2>
      {sub && <motion.p variants={fadeUp} custom={1} className="text-[#8b7e5e]">{sub}</motion.p>}
    </motion.div>
  );
}

export default function LandingPage() {
  const [user, setUser] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
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
              呱邻国
            </span>
          </button>
          <div className="hidden sm:flex items-center gap-6">
            <button onClick={() => scrollTo('modes')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">模式</button>
            <button onClick={() => scrollTo('exercises')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">练习</button>
            <button onClick={() => scrollTo('comparison')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">对比</button>
            <button onClick={() => scrollTo('features')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">功能</button>
            <button onClick={() => scrollTo('pricing')} className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">定价</button>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="text-sm text-[#8b7e5e] hover:text-[#3d3929] transition-colors">GitHub</a>
            <a
              href={user ? '/learn' : '/login'}
              className="px-4 py-1.5 text-sm bg-[#3d3929] text-[#faf8f0] rounded hover:bg-[#524d3c] transition-colors">
              {user ? '进入学习' : '登录'}
            </a>
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
            className="flex justify-center mb-8">
            <div className="relative">
              <FrogLogo size={100} />
              <motion.div className="absolute -top-2 -right-2"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}>
                <Sparkles className="w-6 h-6 text-[#d4a853]" />
              </motion.div>
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-5xl md:text-7xl font-bold text-[#3d3929] mb-4"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif", letterSpacing: '-0.02em' }}>
            呱邻国
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg md:text-xl text-[#8b7e5e] mb-2"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            用你喜欢的文本学外语
          </motion.p>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="text-[#8b7e5e]/70 mb-10 max-w-lg mx-auto leading-relaxed">
            学英语、日语、法语、德语、小语种——粘贴任何文本，自动生成词汇表、分句翻译和练习题。<br />
            留学备考、阅读理解辅助、职场外语，你的素材你做主。
          </motion.p>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="flex justify-center items-center">
            <a href={user ? '/learn' : '/login'}
              className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg flex items-center gap-2 shadow-[2px_2px_0_#8b7e5e]">
              {user ? '进入学习' : '免费开始'}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }} className="mt-16">
            <ChevronDown className="w-6 h-6 text-[#b5ae8e] mx-auto animate-bounce" />
          </motion.div>
        </div>
      </section>

      {/* 痛点洞察 */}
      <section className="py-24 px-6 bg-[#f0ead6]/30 relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.06 }} />
        <div className="max-w-6xl mx-auto relative">
          <SectionTitle sub="传统语言学习的困境">学外语的素材，永远不够"自己"</SectionTitle>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} className="text-center text-[#8b7e5e] max-w-2xl mx-auto mb-12 leading-relaxed">
            传统语言 App 提供固定课程，但每个人的兴趣、职业、阅读习惯完全不同。你读的英语新闻、追的日剧台词、留学文书里的专业术语、中学英语课文——这些最贴近你生活的内容，标准化课程覆盖不了。
          </motion.p>
          <div className="grid md:grid-cols-3 gap-6">
            {PAIN_POINTS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                  variants={fadeUp} custom={i} whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#c45c3c]" />
                  <div className="w-11 h-11 rounded flex items-center justify-center mb-4 bg-[#c45c3c]/10">
                    <Icon className="w-5 h-5 text-[#c45c3c]" />
                  </div>
                  <h3 className="text-lg font-bold text-[#3d3929] mb-2"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{p.title}</h3>
                  <p className="text-sm text-[#8b7e5e] leading-relaxed">{p.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 三种模式 - 解决方案 */}
      <section id="modes" className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub="你的素材，你做主">
            三种<span className="text-[#d4a853]">模式</span>
          </SectionTitle>
          <div className="grid md:grid-cols-3 gap-6">
            {MODES.map((m, i) => {
              const Icon = m.icon;
              return (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  variants={fadeUp} custom={i}
                  className="rounded-lg overflow-hidden border border-[#d4c9a8]">
                  <div className="px-6 py-4" style={{ backgroundColor: m.bg }}>
                    <Icon className="w-6 h-6 text-[#faf8f0] mb-2" />
                    <h3 className="text-xl font-bold text-[#faf8f0]"
                      style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{m.title}</h3>
                    <p className="text-sm text-[#faf8f0]/70">{m.subtitle}</p>
                  </div>
                  <div className="px-6 py-5 bg-[#faf8f0]">
                    <p className="text-sm text-[#524d3c] leading-relaxed">{m.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-24 px-6 bg-[#f0ead6]/30 relative">
        <div className="max-w-5xl mx-auto">
          <SectionTitle sub="从输入到掌握，六步搞定">
            使用<span className="text-[#d4a853]">流程</span>
          </SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                  variants={fadeUp} custom={i} className="text-center relative">
                  <div className="w-14 h-14 mx-auto rounded-full bg-[#3d3929] text-[#faf8f0] flex items-center justify-center mb-3 shadow-[2px_2px_0_#d4a853]">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="text-xs text-[#b5ae8e] font-mono mb-1">{s.num}</div>
                  <h3 className="font-bold text-[#3d3929] text-sm mb-1"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{s.title}</h3>
                  <p className="text-xs text-[#8b7e5e]">{s.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 练习体系 */}
      <section id="exercises" className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub="从单词辨认到句子输出，阶梯式设计">六大题型，从认到用</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {EXERCISES.map((ex, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp} custom={i} whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className={`rounded-lg p-6 hover:shadow-[2px_2px_0_#b5ae8e] transition-shadow ${
                  ex.phase === 0
                    ? 'bg-[#3d3929] text-[#faf8f0] border border-[#3d3929]'
                    : 'bg-[#faf8f0] border border-[#d4c9a8]'
                }`}>
                {ex.phase > 0 ? (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wide mb-3 ${
                    ex.phase === 1
                      ? 'bg-[#8b7e5e]/10 text-[#8b7e5e] border border-[#8b7e5e]/20'
                      : 'bg-[#d4a853]/10 text-[#B8860B] border border-[#d4a853]/20'
                  }`}>
                    阶段{ex.phase === 1 ? '一' : '二'}
                  </span>
                ) : (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-bold tracking-wide mb-3 bg-[#d4a853]/20 text-[#d4a853] border border-[#d4a853]/30">
                    收尾
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 对比多邻国 */}
      <section id="comparison" className="py-24 px-6 bg-[#3d3929] text-[#faf8f0] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.03 }} />
        <div className="max-w-4xl mx-auto relative">
          <SectionTitle sub="多邻国做不到的，呱邻国做到了">
            <span className="text-[#faf8f0]">多邻国做不到的</span>
            <br className="md:hidden" />
            <span className="text-[#d4a853]"> 呱邻国做到了</span>
          </SectionTitle>
          <div className="space-y-4">
            {COMPARISON.map((row, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
                className="flex items-center gap-4 md:gap-8">
                <div className="flex-1 text-right">
                  <span className="text-[#b5ae8e] text-sm md:text-base line-through decoration-[#8b7e5e]/40">{row.duo}</span>
                </div>
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#d4a853] flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-[#3d3929]" />
                </div>
                <div className="flex-1">
                  <span className="text-[#faf8f0] text-sm md:text-base font-medium">{row.gua}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 特色功能 */}
      <section id="features" className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.08 }} />
        <div className="max-w-6xl mx-auto relative">
          <SectionTitle sub="从输入到掌握，覆盖全流程">特色功能</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                  variants={fadeUp} custom={i} whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 hover:shadow-[2px_2px_0_#b5ae8e] transition-shadow">
                  <div className="w-10 h-10 rounded flex items-center justify-center mb-4"
                    style={{ backgroundColor: f.color + '18' }}>
                    <Icon className="w-5 h-5" style={{ color: f.color }} />
                  </div>
                  <h3 className="text-lg font-bold text-[#3d3929] mb-2"
                    style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{f.title}</h3>
                  <p className="text-sm text-[#8b7e5e] leading-relaxed">{f.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 目标用户 */}
      <section id="users" className="py-24 px-6 bg-[#f0ead6]/30 relative">
        <div className="max-w-6xl mx-auto">
          <SectionTitle sub="留学备考、阅读理解辅助、职场外语、小语种学习">谁需要呱邻国？</SectionTitle>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {TARGET_USERS.map((u, i) => (
              <motion.div key={i} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-50px' }}
                variants={fadeUp} custom={i} whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className="bg-[#faf8f0] border border-[#d4c9a8] rounded-lg p-6 text-center">
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl bg-[#8b7e5e]/10 border-2 border-[#8b7e5e]/15">
                  {u.icon}
                </div>
                <h3 className="text-lg font-bold text-[#3d3929] mb-1"
                  style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{u.title}</h3>
                <p className="text-sm text-[#8b7e5e] font-medium mb-3">{u.scene}</p>
                <p className="text-sm text-[#524d3c] leading-relaxed">{u.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 语言云 */}
      <section className="py-16 px-6 bg-[#3d3929] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.03 }} />
        <div className="max-w-4xl mx-auto relative text-center">
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} className="text-sm text-[#b5ae8e] mb-2">英语、日语、法语、德语、小语种……</motion.p>
          <motion.p initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={fadeUp} className="text-xs text-[#b5ae8e]/60 mb-4">支持的语言（部分展示）</motion.p>
          <div className="flex flex-wrap justify-center gap-2">
            {LANG_CLOUD.map((lang, i) => (
              <motion.span key={i} initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
                className="px-3 py-1 rounded text-xs font-semibold text-white tracking-wide hover:scale-110 transition-transform cursor-default"
                style={{ backgroundColor: lang.color }}>
                {lang.name}
              </motion.span>
            ))}
            <span className="px-3 py-1 rounded text-xs font-semibold text-white bg-[#78716c]">100+ ...</span>
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section id="pricing" className="py-24 px-6 bg-[#faf8f0] relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #b5ae8e 1px, transparent 1px)', backgroundSize: '24px 24px', opacity: 0.06 }} />
        <div className="max-w-5xl mx-auto relative">
          <SectionTitle sub="免费开始，随时升级">选择适合你的方案</SectionTitle>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.id} initial="hidden" whileInView="visible" viewport={{ once: true }}
                variants={fadeUp} custom={i}
                className={`bg-[#faf8f0] border rounded-lg p-7 relative ${
                  plan.highlight ? 'border-[#d4a853] shadow-[3px_3px_0_#d4a853]' : 'border-[#d4c9a8]'
                }`}>
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[#d4a853] text-[#3d3929] text-xs font-bold rounded-full">
                    推荐
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
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#3d3929] text-[#faf8f0] text-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #faf8f0 1px, transparent 1px)', backgroundSize: '20px 20px', opacity: 0.04 }} />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold mb-4"
            style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            准备好了吗？
          </h2>
          <p className="text-[#b5ae8e] mb-2">
            学英语、日语、法语、德语、小语种，注册即可免费使用。
          </p>
          <p className="text-[#b5ae8e]/70 text-sm mb-8">
            留学备考 · 阅读理解辅助 · 职场外语 · 你的素材你做主
          </p>
          <a href={user ? '/learn' : '/login'}
            className="group px-8 py-3.5 bg-[#d4a853] text-[#3d3929] font-semibold rounded hover:bg-[#c49a48] transition-all text-lg inline-flex items-center gap-2 shadow-[2px_2px_0_#faf8f0/20]">
            {user ? '进入学习' : '立即开始'}
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </a>
        </div>
      </section>

      {/* SEO: 长尾关键词覆盖 */}
      <section className="py-12 px-6 bg-[#faf8f0] border-t border-[#d4c9a8]/50" aria-label="更多语言学习信息">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-lg font-bold text-[#3d3929] mb-4" style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
            适用于各种语言学习场景
          </h2>
          <p className="text-sm text-[#8b7e5e] leading-relaxed mb-3">
            呱邻国 Gualingo 适合学英语、学日语、学法语、学德语、学韩语、学西班牙语、学意大利语、学葡萄牙语、学俄语等主流语言，也支持学泰语、学越南语、学阿拉伯语、学印地语、学土耳其语、学芬兰语、学匈牙利语等小语种。
          </p>
          <p className="text-sm text-[#8b7e5e] leading-relaxed mb-3">
            无论你是留学备考（雅思、托福、日语N1N2、法语DELF、德语德福）、中学英语阅读理解辅助、职场外语提升，还是纯粹的语言爱好者，呱邻国都能把你的文本变成个性化学习材料。
          </p>
          <p className="text-xs text-[#b5ae8e]">
            AI外语学习 · 英语阅读理解练习 · 日语分句翻译 · 法语词汇表生成 · 德语听力练习 · 小语种学习工具 · 留学语言备考 · 中学英语辅助
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-8 px-6 border-t border-[#d4c9a8] bg-[#faf8f0]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogLogo size={24} />
            <span className="font-bold text-[#3d3929]"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              呱邻国 Gualingo
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-[#8b7e5e]">
            <span>兼容 LLM API</span>
            <span>AGPL v3 开源</span>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors">GitHub</a>
            {/* 小红书 */}
            <a href="https://www.xiaohongshu.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center" title="小红书">
              <img src="https://cdn.simpleicons.org/xiaohongshu/8b7e5e" alt="小红书" width="20" height="20" style={{ filter: 'grayscale(0.3)' }} />
            </a>
            {/* 微信 */}
            <a href="https://weixin.qq.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center" title="微信">
              <img src="https://cdn.simpleicons.org/wechat/8b7e5e" alt="微信" width="20" height="20" style={{ filter: 'grayscale(0.3)' }} />
            </a>
            {/* QQ */}
            <a href="https://im.qq.com" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#3d3929] transition-colors inline-flex items-center" title="QQ">
              <img src="https://cdn.simpleicons.org/tencentqq/8b7e5e" alt="QQ" width="20" height="20" style={{ filter: 'grayscale(0.3)' }} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
