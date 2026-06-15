import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Languages, Wand2, Star, Volume2, GraduationCap, ArrowRight, Github, ChevronRight } from 'lucide-react';

// 装饰点阵背景
function DotPattern({ color = '#FF69B4', opacity = 0.05 }) {
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

// 青蛙吉祥物 SVG
function FrogMascot({ size = 200 }) {
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

// 星星装饰
function StarDeco({ x, y, delay = 0 }) {
  return (
    <motion.div
      className="absolute text-pop-yellow text-2xl"
      style={{ left: x, top: y }}
      initial={{ scale: 0, rotate: 0 }}
      animate={{ scale: [0, 1.2, 1], rotate: [0, 180, 360] }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
    >
      ★
    </motion.div>
  );
}

const FEATURES = [
  { icon: Languages, title: '任意语言互学', desc: '支持 120+ 种语言 TTS 朗读，AI 自动检测语种，不再受限于平台资源。', color: '#FF006E' },
  { icon: Wand2, title: 'AI 自动生成', desc: '粘贴任何文本，AI 自动检测语言、分句翻译、提取词汇，为你量身定制学习内容。', color: '#FFD700' },
  { icon: BookOpen, title: '完整词汇表', desc: '自动生成完整词汇表，支持字母索引、搜索、逐词详情，随时查阅每个单词。', color: '#00BFFF' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#39FF14' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，单词和句子都能朗读，常速/慢速自由切换。', color: '#FF69B4' },
  { icon: GraduationCap, title: '两阶段学习', desc: '阶段一词汇认知，阶段二综合训练，错题自动回顾，循序渐进掌握每个知识点。', color: '#FFD700' },
];

const COMPARES = [
  { other: '没有单词表，复习无门', us: '自动生成完整词汇表' },
  { other: '做题时想查其它单词', us: '学习过程中随时打开单词表' },
  { other: '学了也很难用上', us: '你提供什么素材就学什么' },
  { other: '小众语种不支持', us: '支持任意语言互学，120+ TTS' },
  { other: '无法深入理解一篇文章', us: 'AI 分句翻译，彻底吃透' },
];

const MODES = [
  { title: '直接输入', subtitle: '我有素材，想直接学', desc: '粘贴一篇文章、一首歌词、一段新闻——任何外语文本丢进来，AI 自动检测语言、分句翻译、提取词汇。', color: '#FF006E' },
  { title: '自动翻译', subtitle: '我想用母语素材来学外语', desc: '输入你母语的文本，AI 翻译成你想学的语言，然后基于翻译后的文本生成词汇和练习。', color: '#00BFFF' },
  { title: '自由生成', subtitle: '我没有素材，帮我生成', desc: '告诉 AI 你想学什么主题，AI 自动生成目标语言的文本，然后开始学习。没有素材也能学。', color: '#39FF14' },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴外语文本、翻译母语文本、或让 AI 生成' },
  { num: '02', title: '浏览字典', desc: '查看分句翻译和词汇释义，随时查阅任意单词' },
  { num: '03', title: '阶段一', desc: '单词选择、句子翻译、听力理解' },
  { num: '04', title: '阶段二', desc: '遮蔽填空、翻译重组' },
  { num: '05', title: '错题回顾', desc: '答错的题自动收集，强化练习直到掌握' },
];

const PLANS = [
  { id: 'free', name: '免费版', price: '¥0', features: ['自带 API Key', '本地存储', '基础学习功能', '多 Key 轮询', 'Web + 桌面端'], cta: '免费开始', highlight: false },
  { id: 'basic', name: '基础版', price: '¥19', period: '/月', features: ['平台 API 额度（50次/月）', '云同步', 'SRS 间隔复习', '跨设备使用'], cta: '即将推出', highlight: true, disabled: true },
  { id: 'pro', name: '专业版', price: '¥49', period: '/月', features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'], cta: '即将推出', highlight: false, disabled: true },
];

// 动画变体
const fadeUp = { initial: { y: 40, opacity: 0 }, whileInView: { y: 0, opacity: 1 }, viewport: { once: true } };
const stagger = (i) => ({ ...fadeUp, transition: { delay: i * 0.1 } });

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-pop-cream font-pop text-black">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white border-b-4 border-black">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FrogMascot size={36} />
            <span className="font-display text-2xl tracking-wider">呱邻国</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="p-2 border-4 border-black shadow-pop-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all">
              <Github className="w-5 h-5" strokeWidth={3} />
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-display text-lg px-6 py-2 bg-pop-red text-white border-4 border-black shadow-pop hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all tracking-wider"
            >
              {user ? '开冲' : '登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen bg-pop-yellow flex items-center pt-16 overflow-hidden">
        <DotPattern color="#000" opacity={0.04} />
        <StarDeco x="10%" y="20%" delay={0.2} />
        <StarDeco x="85%" y="15%" delay={0.4} />
        <StarDeco x="75%" y="70%" delay={0.6} />
        <StarDeco x="15%" y="75%" delay={0.8} />

        <div className="relative z-10 max-w-7xl mx-auto px-4 py-20 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <motion.div {...fadeUp} transition={{ delay: 0 }}>
              <span className="font-display text-sm md:text-base bg-pop-cream text-black px-4 py-2 border-4 border-black shadow-pop-sm tracking-widest inline-block mb-6">
                AI 驱动 · 全新体验
              </span>
            </motion.div>
            <motion.h1 {...fadeUp} transition={{ delay: 0.1 }}
              className="font-display text-6xl md:text-8xl tracking-wider mb-4"
            >
              学语言
            </motion.h1>
            <motion.h1 {...fadeUp} transition={{ delay: 0.15 }}
              className="font-display text-6xl md:text-8xl tracking-wider mb-6"
              style={{ color: '#FF006E' }}
            >
              做自己!
            </motion.h1>
            <motion.p {...fadeUp} transition={{ delay: 0.2 }}
              className="font-pop font-bold text-lg md:text-xl text-black/80 mb-2 max-w-lg"
            >
              粘贴任何文本，AI 自动生成词汇表、分句翻译和多种练习题。
            </motion.p>
            <motion.p {...fadeUp} transition={{ delay: 0.25 }}
              className="font-pop font-bold text-base md:text-lg text-black/60 mb-8 max-w-lg"
            >
              任何语言 → 任何语言，你的素材你做主。
            </motion.p>
            <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
              <button
                onClick={() => navigate(user ? '/learn' : '/login')}
                className="font-display text-xl md:text-2xl px-8 py-4 bg-pop-red text-white border-4 border-black shadow-pop-lg hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all tracking-wider"
              >
                呱！开冲！ →
              </button>
            </motion.div>
          </div>
          <motion.div
            className="flex-1 flex justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.3 }}
          >
            <div className="animate-float">
              <FrogMascot size={280} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-20 bg-pop-cream border-y-4 border-black">
        <DotPattern color="#FF006E" opacity={0.03} />
        <div className="relative z-10 max-w-6xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-display text-sm md:text-base bg-pop-yellow text-black px-4 py-2 border-4 border-black shadow-pop-sm tracking-widest inline-block">
              特色功能
            </span>
          </motion.div>
          <motion.h2 {...stagger(0)} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-4">
            多邻国做不到的
          </motion.h2>
          <motion.p {...stagger(1)} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-12" style={{ color: '#FF006E' }}>
            呱邻国做到了
          </motion.p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} {...stagger(i)}
                className="bg-white border-4 border-black shadow-pop-lg p-6 hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all group"
              >
                <div
                  className="w-14 h-14 flex items-center justify-center border-4 border-black shadow-pop-sm mb-4 group-hover:shadow-none group-hover:translate-x-[2px] group-hover:translate-y-[2px] transition-all"
                  style={{ backgroundColor: f.color }}
                >
                  <f.icon className="w-7 h-7 text-black" strokeWidth={3} />
                </div>
                <h3 className="font-display text-xl md:text-2xl mb-2 tracking-wide uppercase">{f.title}</h3>
                <p className="font-pop font-bold text-sm md:text-base text-black/70">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="relative py-20 border-y-4 border-black" style={{ backgroundColor: '#00BFFF' }}>
        <DotPattern color="#000" opacity={0.05} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-12">
            为什么选择呱邻国？
          </motion.h2>
          <div className="space-y-4">
            {COMPARES.map((c, i) => (
              <motion.div key={i} {...stagger(i)} className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white/30 border-4 border-black p-4 shadow-pop">
                  <p className="font-pop font-bold text-black/50 text-sm mb-1">多邻国</p>
                  <p className="font-pop font-bold">{c.other}</p>
                </div>
                <div className="flex-1 bg-pop-yellow border-4 border-black p-4 shadow-pop">
                  <p className="font-pop font-bold text-black/50 text-sm mb-1">呱邻国</p>
                  <p className="font-pop font-bold">{c.us}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Modes */}
      <section className="relative py-20 bg-pop-cream border-y-4 border-black">
        <DotPattern color="#BF5FFF" opacity={0.03} />
        <div className="relative z-10 max-w-6xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-display text-sm md:text-base bg-pop-blue text-black px-4 py-2 border-4 border-black shadow-pop-sm tracking-widest inline-block">
              三种模式
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-12">
            你的素材你做主
          </motion.h2>
          <div className="grid md:grid-cols-3 gap-6">
            {MODES.map((m, i) => (
              <motion.div key={i} {...stagger(i)}
                className="bg-white border-4 border-black shadow-pop-lg overflow-hidden hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all"
              >
                <div className="h-3" style={{ backgroundColor: m.color }} />
                <div className="p-6">
                  <h3 className="font-display text-2xl md:text-3xl tracking-wider mb-1">{m.title}</h3>
                  <p className="font-pop font-bold text-sm text-black/50 mb-3">{m.subtitle}</p>
                  <p className="font-pop font-bold text-sm text-black/70">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning System */}
      <section className="relative py-20 bg-pop-cream border-y-4 border-black">
        <DotPattern color="#FFD700" opacity={0.03} />
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-display text-sm md:text-base bg-pop-green text-black px-4 py-2 border-4 border-black shadow-pop-sm tracking-widest inline-block">
              学习体系
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-12">
            两阶段 + 错题回顾
          </motion.h2>

          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <motion.div {...stagger(0)} className="bg-white border-4 border-black shadow-pop p-6">
              <h3 className="font-display text-2xl tracking-wider mb-4" style={{ color: '#FF006E' }}>
                阶段一 · 词汇认知
              </h3>
              <ul className="space-y-2 font-pop font-bold text-sm text-black/70">
                <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4" style={{ color: '#FF006E' }} /> 单词选择 — 四选一，看单词选释义</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4" style={{ color: '#FF006E' }} /> 句子翻译 — 看源语言句子，拼出翻译</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4" style={{ color: '#FF006E' }} /> 听力理解 — 听句子，拼出听到的内容</li>
              </ul>
            </motion.div>
            <motion.div {...stagger(1)} className="bg-white border-4 border-black shadow-pop p-6">
              <h3 className="font-display text-2xl tracking-wider mb-4" style={{ color: '#00BFFF' }}>
                阶段二 · 综合训练
              </h3>
              <ul className="space-y-2 font-pop font-bold text-sm text-black/70">
                <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4" style={{ color: '#00BFFF' }} /> 遮蔽填空 — 句子中挖空关键词，选择正确答案</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-4 h-4" style={{ color: '#00BFFF' }} /> 翻译重组 — 看母语翻译，还原原句</li>
              </ul>
            </motion.div>
          </div>

          <motion.div {...stagger(2)} className="bg-pop-yellow border-4 border-black shadow-pop p-6 text-center">
            <h3 className="font-display text-2xl tracking-wider mb-2">错题回顾</h3>
            <p className="font-pop font-bold text-black/70">答错的题自动收集，强化练习直到掌握为止</p>
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="relative py-20 bg-white border-y-4 border-black">
        <DotPattern color="#00BFFF" opacity={0.03} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-display text-sm md:text-base bg-pop-red text-white px-4 py-2 border-4 border-black shadow-pop-sm tracking-widest inline-block">
              使用流程
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-12">
            五步搞定
          </motion.h2>

          <div className="relative">
            {/* Timeline line */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-1 bg-black -translate-x-1/2" />

            {STEPS.map((s, i) => (
              <motion.div key={i} {...stagger(i)}
                className={`flex items-center gap-6 mb-8 flex-col md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className={`flex-1 ${i % 2 === 1 ? 'md:text-left' : 'md:text-right'}`}>
                  <div className="bg-pop-cream border-4 border-black p-5 shadow-pop inline-block text-left">
                    <span className="font-display text-3xl md:text-4xl" style={{ color: '#FF006E' }}>{s.num}</span>
                    <h3 className="font-display text-xl md:text-2xl tracking-wider">{s.title}</h3>
                    <p className="font-pop font-bold text-sm text-black/70">{s.desc}</p>
                  </div>
                </div>
                <div className="hidden md:flex w-12 h-12 border-4 border-black items-center justify-center shrink-0 shadow-pop-sm" style={{ backgroundColor: '#FF006E' }}>
                  <span className="font-display text-white text-sm">{s.num}</span>
                </div>
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative py-20 bg-pop-cream border-y-4 border-black">
        <DotPattern color="#FFD700" opacity={0.03} />
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-5xl text-center tracking-wider mb-4">
            选择适合你的方案
          </motion.h2>
          <motion.p {...fadeUp} className="font-pop font-bold text-center text-black/60 mb-12">
            免费开始，随时升级
          </motion.p>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.id} {...stagger(i)}
                className={`bg-white border-4 border-black shadow-pop-lg p-6 hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all ${plan.highlight ? 'ring-4 ring-pop-yellow' : ''}`}
              >
                <h3 className="font-display text-2xl md:text-3xl tracking-wider mb-1">{plan.name}</h3>
                <div className="mb-4">
                  <span className="font-display text-4xl md:text-5xl">{plan.price}</span>
                  <span className="font-pop font-bold text-black/50">{plan.period || ''}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="font-pop font-bold text-sm text-black/70 flex items-start gap-2">
                      <span style={{ color: '#FF006E' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full font-display text-lg py-3 border-4 border-black tracking-wider transition-all ${
                    plan.highlight
                      ? 'bg-pop-red text-white shadow-pop hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px]'
                      : 'bg-pop-cream text-black shadow-pop-sm hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]'
                  } disabled:opacity-50`}
                >
                  {plan.cta}
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 border-y-4 border-black" style={{ backgroundColor: '#FF006E' }}>
        <DotPattern color="#FFF" opacity={0.05} />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.h2 {...fadeUp} className="font-display text-4xl md:text-6xl text-white tracking-wider mb-4">
            准备好了吗？
          </motion.h2>
          <motion.p {...fadeUp} className="font-pop font-bold text-white/80 mb-2">
            只需一个 API Key，无需数据库，纯 LLM 能力驱动一切。
          </motion.p>
          <motion.p {...fadeUp} className="font-pop font-bold text-white/60 mb-8">
            任何语言 → 任何语言，你的素材你做主。
          </motion.p>
          <motion.div {...fadeUp}>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-display text-xl md:text-2xl px-8 py-4 bg-pop-yellow text-black border-4 border-black shadow-pop-lg hover:shadow-none hover:translate-x-[6px] hover:translate-y-[6px] transition-all tracking-wider"
            >
              呱！开冲！ →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white py-8 px-4 border-t-4 border-black">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogMascot size={28} />
            <span className="font-display text-xl tracking-wider">呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-6 font-pop font-bold text-sm text-white/60">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-pop-yellow transition-colors flex items-center gap-1">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
