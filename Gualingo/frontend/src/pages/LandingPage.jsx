import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Languages, Wand2, Star, Volume2, GraduationCap, ArrowRight, Github, ChevronRight } from 'lucide-react';

// 复古青蛙吉祥物 SVG — 暖色调
function FrogMascot({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="120" rx="70" ry="60" fill="#B5AE8E" stroke="#8b4513" strokeWidth="3" />
      <ellipse cx="100" cy="115" rx="62" ry="52" fill="#D8D4BF" />
      <circle cx="70" cy="75" r="28" fill="#B5AE8E" stroke="#8b4513" strokeWidth="3" />
      <circle cx="130" cy="75" r="28" fill="#B5AE8E" stroke="#8b4513" strokeWidth="3" />
      <circle cx="70" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="130" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="73" cy="73" r="10" fill="#524D3C" />
      <circle cx="133" cy="73" r="10" fill="#524D3C" />
      <circle cx="76" cy="70" r="3" fill="#f5e6d3" />
      <circle cx="136" cy="70" r="3" fill="#f5e6d3" />
      <ellipse cx="100" cy="128" rx="30" ry="14" fill="#E8C985" stroke="#8b4513" strokeWidth="2" />
      <path d="M78 125 Q100 140 122 125" stroke="#524D3C" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="55" cy="105" r="10" fill="#D08E7D" opacity="0.4" />
      <circle cx="145" cy="105" r="10" fill="#D08E7D" opacity="0.4" />
    </svg>
  );
}

// 纸纹背景
function PaperTexture() {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.04 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        opacity: 0.5,
      }}
    />
  );
}

const FEATURES = [
  { icon: Languages, title: '任意语言互学', desc: '支持 120+ 种语言 TTS 朗读，AI 自动检测语种，不再受限于平台资源。', color: '#8b4513' },
  { icon: Wand2, title: 'AI 自动生成', desc: '粘贴任何文本，AI 自动检测语言、分句翻译、提取词汇，为你量身定制学习内容。', color: '#A06E28' },
  { icon: BookOpen, title: '完整词汇表', desc: '自动生成完整词汇表，支持字母索引、搜索、逐词详情，随时查阅每个单词。', color: '#6E6650' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#C08A3A' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，单词和句子都能朗读，常速/慢速自由切换。', color: '#7D5520' },
  { icon: GraduationCap, title: '两阶段学习', desc: '阶段一词汇认知，阶段二综合训练，错题自动回顾，循序渐进掌握每个知识点。', color: '#5C3E18' },
];

const COMPARES = [
  { other: '没有单词表，复习无门', us: '自动生成完整词汇表' },
  { other: '做题时想查其它单词', us: '学习过程中随时打开单词表' },
  { other: '学了也很难用上', us: '你提供什么素材就学什么' },
  { other: '小众语种不支持', us: '支持任意语言互学，120+ TTS' },
  { other: '无法深入理解一篇文章', us: 'AI 分句翻译，彻底吃透' },
];

const MODES = [
  { title: '直接输入', subtitle: '我有素材，想直接学', desc: '粘贴一篇文章、一首歌词、一段新闻——任何外语文本丢进来，AI 自动检测语言、分句翻译、提取词汇。', color: '#8b4513' },
  { title: '自动翻译', subtitle: '我想用母语素材来学外语', desc: '输入你母语的文本，AI 翻译成你想学的语言，然后基于翻译后的文本生成词汇和练习。', color: '#6E6650' },
  { title: '自由生成', subtitle: '我没有素材，帮我生成', desc: '告诉 AI 你想学什么主题，AI 自动生成目标语言的文本，然后开始学习。没有素材也能学。', color: '#5C3E18' },
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

const fadeUp = { initial: { y: 30, opacity: 0 }, whileInView: { y: 0, opacity: 1 }, viewport: { once: true } };
const stagger = (i) => ({ ...fadeUp, transition: { delay: i * 0.1 } });

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#f5e6d3] font-serif text-[#3B3225]">
      {/* Nav */}
      <nav className="bg-[#f5e6d3] border-b-2 border-[#8b4513] px-4 md:px-8 py-3 md:py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center gap-2">
            <FrogMascot size={32} />
            <span className="font-serif uppercase tracking-widest text-lg md:text-xl text-[#3B3225]">呱邻国</span>
          </a>
          <div className="flex items-center gap-4 md:gap-6">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="text-[#8b4513] hover:text-[#5C3E18] transition-colors duration-200">
              <Github className="w-5 h-5" />
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-serif uppercase tracking-widest transition-colors duration-200 bg-[#8b4513] text-[#f5e6d3] px-4 py-2 md:px-6 md:py-2.5 border-2 border-[#8b4513] hover:bg-[#5C3E18] hover:border-[#5C3E18] text-sm md:text-base active:opacity-75"
            >
              {user ? '进入学习' : '登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[60vh] md:min-h-[80vh] flex items-center px-4 md:px-8 py-14 md:py-24 bg-[#EDE0C8] border-b-2 border-[#8b4513]">
        <PaperTexture />
        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 text-center md:text-left">
            <motion.div {...fadeUp} transition={{ delay: 0 }}>
              <span className="font-serif uppercase tracking-widest text-sm md:text-base text-[#8b4513] inline-block mb-6 border-2 border-[#8b4513] px-4 py-2">
                AI 驱动 · 全新体验
              </span>
            </motion.div>
            <motion.h1 {...fadeUp} transition={{ delay: 0.1 }}
              className="font-serif uppercase tracking-widest text-4xl md:text-6xl lg:text-7xl leading-tight mb-4 md:mb-6 text-[#3B3225]"
            >
              学语言
            </motion.h1>
            <motion.h1 {...fadeUp} transition={{ delay: 0.15 }}
              className="font-serif uppercase tracking-widest text-4xl md:text-6xl lg:text-7xl leading-tight mb-4 md:mb-6 text-[#8b4513]"
            >
              做自己!
            </motion.h1>
            <motion.p {...fadeUp} transition={{ delay: 0.2 }}
              className="font-serif text-sm md:text-base md:text-lg text-[#524635] mb-2 max-w-lg"
            >
              粘贴任何文本，AI 自动生成词汇表、分句翻译和多种练习题。
            </motion.p>
            <motion.p {...fadeUp} transition={{ delay: 0.25 }}
              className="font-serif text-sm md:text-base text-[#8A7A66] mb-8 max-w-lg"
            >
              任何语言 → 任何语言，你的素材你做主。
            </motion.p>
            <motion.div {...fadeUp} transition={{ delay: 0.3 }}>
              <button
                onClick={() => navigate(user ? '/learn' : '/login')}
                className="font-serif uppercase tracking-widest transition-colors duration-200 bg-[#8b4513] text-[#f5e6d3] px-6 py-3 md:px-8 md:py-4 border-2 border-[#8b4513] shadow-[4px_4px_0px_0px_rgba(139,69,19,0.3)] md:shadow-[6px_6px_0px_0px_rgba(139,69,19,0.3)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-sm md:text-base active:opacity-75"
              >
                呱！开冲！ →
              </button>
            </motion.div>
          </div>
          <motion.div
            className="flex-1 flex justify-center"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <div className="animate-float-slow">
              <FrogMascot size={240} />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3]">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-widest text-sm md:text-base text-[#8b4513] inline-block border-2 border-[#8b4513] px-4 py-2">
              特色功能
            </span>
          </motion.div>
          <motion.h2 {...stagger(0)} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-3 text-[#3B3225]">
            多邻国做不到的
          </motion.h2>
          <motion.p {...stagger(1)} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-12 text-[#8b4513]">
            呱邻国做到了
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} {...stagger(i)}
                className="border-2 border-[#8b4513] bg-[#f5e6d3] font-serif p-6 md:p-8 shadow-[0_4px_8px_rgba(139,69,19,0.15)] hover:shadow-[0_4px_12px_rgba(139,69,19,0.2)] transition-colors duration-200"
              >
                <div
                  className="w-12 h-12 flex items-center justify-center border-2 border-[#8b4513] mb-4"
                  style={{ backgroundColor: f.color + '15' }}
                >
                  <f.icon className="w-6 h-6" style={{ color: f.color }} strokeWidth={2} />
                </div>
                <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-2 text-[#3B3225]">{f.title}</h3>
                <p className="font-serif text-sm md:text-base text-[#6B5D4B]">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#EDE0C8] border-y-2 border-[#8b4513]">
        <div className="max-w-4xl mx-auto">
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-12 text-[#3B3225]">
            为什么选择呱邻国？
          </motion.h2>
          <div className="space-y-4">
            {COMPARES.map((c, i) => (
              <motion.div key={i} {...stagger(i)} className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 border-2 border-[#8b4513] bg-[#f5e6d3] p-4 md:p-5 shadow-[0_2px_4px_rgba(139,69,19,0.1)]">
                  <p className="font-serif text-xs md:text-sm text-[#8A7A66] mb-1">多邻国</p>
                  <p className="font-serif text-sm md:text-base text-[#6B5D4B]">{c.other}</p>
                </div>
                <div className="flex-1 border-2 border-[#8b4513] bg-[#E8C985] p-4 md:p-5 shadow-[0_2px_4px_rgba(139,69,19,0.1)]">
                  <p className="font-serif text-xs md:text-sm text-[#5C3E18] mb-1">呱邻国</p>
                  <p className="font-serif text-sm md:text-base text-[#3B3225] font-bold">{c.us}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Modes */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3]">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-widest text-sm md:text-base text-[#8b4513] inline-block border-2 border-[#8b4513] px-4 py-2">
              三种模式
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-12 text-[#3B3225]">
            你的素材你做主
          </motion.h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {MODES.map((m, i) => (
              <motion.div key={i} {...stagger(i)}
                className="border-2 border-[#8b4513] bg-[#f5e6d3] font-serif overflow-hidden shadow-[0_4px_8px_rgba(139,69,19,0.15)] hover:shadow-[0_4px_12px_rgba(139,69,19,0.2)] transition-colors duration-200"
              >
                <div className="h-2" style={{ backgroundColor: m.color }} />
                <div className="p-6 md:p-8">
                  <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-1 text-[#3B3225]">{m.title}</h3>
                  <p className="font-serif text-xs md:text-sm text-[#8A7A66] mb-3">{m.subtitle}</p>
                  <p className="font-serif text-sm md:text-base text-[#6B5D4B]">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning System */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#EDE0C8] border-y-2 border-[#8b4513]">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-widest text-sm md:text-base text-[#8b4513] inline-block border-2 border-[#8b4513] px-4 py-2">
              学习体系
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-12 text-[#3B3225]">
            两阶段 + 错题回顾
          </motion.h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8">
            <motion.div {...stagger(0)} className="border-2 border-[#8b4513] bg-[#f5e6d3] font-serif p-6 md:p-8 shadow-[0_4px_8px_rgba(139,69,19,0.15)]">
              <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-4 text-[#8b4513]">
                阶段一 · 词汇认知
              </h3>
              <ul className="space-y-2 font-serif text-sm md:text-base text-[#6B5D4B]">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 text-[#8b4513]" /> 单词选择 — 四选一，看单词选释义</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 text-[#8b4513]" /> 句子翻译 — 看源语言句子，拼出翻译</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 text-[#8b4513]" /> 听力理解 — 听句子，拼出听到的内容</li>
              </ul>
            </motion.div>
            <motion.div {...stagger(1)} className="border-2 border-[#8b4513] bg-[#f5e6d3] font-serif p-6 md:p-8 shadow-[0_4px_8px_rgba(139,69,19,0.15)]">
              <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-4 text-[#6E6650]">
                阶段二 · 综合训练
              </h3>
              <ul className="space-y-2 font-serif text-sm md:text-base text-[#6B5D4B]">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 text-[#6E6650]" /> 遮蔽填空 — 句子中挖空关键词，选择正确答案</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 text-[#6E6650]" /> 翻译重组 — 看母语翻译，还原原句</li>
              </ul>
            </motion.div>
          </div>

          <motion.div {...stagger(2)} className="border-2 border-[#8b4513] bg-[#E8C985] font-serif p-6 md:p-8 text-center shadow-[0_4px_8px_rgba(139,69,19,0.15)]">
            <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-2 text-[#3B3225]">错题回顾</h3>
            <p className="font-serif text-sm md:text-base text-[#5C3E18]">答错的题自动收集，强化练习直到掌握为止</p>
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3]">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-widest text-sm md:text-base text-[#8b4513] inline-block border-2 border-[#8b4513] px-4 py-2">
              使用流程
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-12 text-[#3B3225]">
            五步搞定
          </motion.h2>

          <div className="relative">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#8b4513]/30 -translate-x-1/2" />

            {STEPS.map((s, i) => (
              <motion.div key={i} {...stagger(i)}
                className={`flex items-center gap-6 mb-8 flex-col md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className={`flex-1 ${i % 2 === 1 ? 'md:text-left' : 'md:text-right'}`}>
                  <div className="border-2 border-[#8b4513] bg-[#f5e6d3] font-serif p-5 md:p-6 shadow-[0_2px_4px_rgba(139,69,19,0.1)] inline-block text-left">
                    <span className="font-serif text-2xl md:text-3xl text-[#8b4513]">{s.num}</span>
                    <h3 className="font-serif uppercase tracking-widest text-base md:text-lg text-[#3B3225]">{s.title}</h3>
                    <p className="font-serif text-sm text-[#6B5D4B]">{s.desc}</p>
                  </div>
                </div>
                <div className="hidden md:flex w-10 h-10 border-2 border-[#8b4513] items-center justify-center shrink-0 bg-[#8b4513]">
                  <span className="font-serif text-[#f5e6d3] text-sm">{s.num}</span>
                </div>
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#EDE0C8] border-y-2 border-[#8b4513]">
        <div className="max-w-5xl mx-auto">
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-2xl md:text-4xl text-center mb-4 text-[#3B3225]">
            选择适合你的方案
          </motion.h2>
          <motion.p {...fadeUp} className="font-serif text-sm md:text-base text-center text-[#8A7A66] mb-12">
            免费开始，随时升级
          </motion.p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.id} {...stagger(i)}
                className={`border-2 border-[#8b4513] bg-[#f5e6d3] font-serif p-6 md:p-8 shadow-[0_4px_8px_rgba(139,69,19,0.15)] hover:shadow-[0_4px_12px_rgba(139,69,19,0.2)] transition-colors duration-200 ${plan.highlight ? 'border-[#C08A3A]' : ''}`}
              >
                <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl text-[#3B3225] mb-1">{plan.name}</h3>
                <div className="mb-4">
                  <span className="font-serif text-3xl md:text-4xl text-[#3B3225]">{plan.price}</span>
                  <span className="font-serif text-sm text-[#8A7A66]">{plan.period || ''}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="font-serif text-sm text-[#6B5D4B] flex items-start gap-2">
                      <span className="text-[#8b4513]">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full font-serif uppercase tracking-widest transition-colors duration-200 py-2.5 md:py-3 border-2 text-sm md:text-base active:opacity-75 ${
                    plan.highlight
                      ? 'bg-[#8b4513] text-[#f5e6d3] border-[#8b4513] hover:bg-[#5C3E18]'
                      : 'bg-transparent text-[#8b4513] border-[#8b4513] hover:bg-[#8b4513] hover:text-[#f5e6d3]'
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
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#8b4513] border-b-2 border-[#5C3E18]">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2 {...fadeUp} className="font-serif uppercase tracking-widest text-3xl md:text-5xl text-[#f5e6d3] mb-4">
            准备好了吗？
          </motion.h2>
          <motion.p {...fadeUp} className="font-serif text-sm md:text-base text-[#E8C985] mb-2">
            只需一个 API Key，无需数据库，纯 LLM 能力驱动一切。
          </motion.p>
          <motion.p {...fadeUp} className="font-serif text-sm md:text-base text-[#D8D4BF] mb-8">
            任何语言 → 任何语言，你的素材你做主。
          </motion.p>
          <motion.div {...fadeUp}>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-serif uppercase tracking-widest transition-colors duration-200 bg-[#E8C985] text-[#3B3225] px-6 py-3 md:px-8 md:py-4 border-2 border-[#3B3225] shadow-[4px_4px_0px_0px_rgba(59,50,37,0.4)] md:shadow-[6px_6px_0px_0px_rgba(59,50,37,0.4)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all text-sm md:text-base active:opacity-75"
            >
              呱！开冲！ →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#3B3225] text-[#D8D4BF] py-12 md:py-16 px-4 md:px-8 border-t-2 border-[#8b4513]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogMascot size={28} />
            <span className="font-serif uppercase tracking-widest text-lg text-[#E8C985]">呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-6 font-serif text-sm text-[#8A7A66]">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#E8C985] transition-colors duration-200 flex items-center gap-1">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
