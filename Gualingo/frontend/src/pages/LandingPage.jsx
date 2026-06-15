import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Languages, Wand2, Star, Volume2, GraduationCap, Github, ChevronRight } from 'lucide-react';

// 装饰分隔线
function OrnamentalDivider() {
  return (
    <div className="flex items-center justify-center gap-3 my-8 text-[#8b4513]/40">
      <div className="h-px flex-1 bg-[#8b4513]/20" />
      <span className="text-lg">✦</span>
      <div className="h-px flex-1 bg-[#8b4513]/20" />
    </div>
  );
}

// 青蛙吉祥物 SVG - 复古版
function FrogMascot({ size = 200 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="120" rx="70" ry="60" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <ellipse cx="100" cy="115" rx="62" ry="52" fill="#3d6554" />
      <circle cx="70" cy="75" r="28" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <circle cx="130" cy="75" r="28" fill="#2e4a3f" stroke="#8b4513" strokeWidth="3" />
      <circle cx="70" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="130" cy="75" r="22" fill="#f5e6d3" stroke="#8b4513" strokeWidth="2" />
      <circle cx="73" cy="73" r="10" fill="#8b4513" />
      <circle cx="133" cy="73" r="10" fill="#8b4513" />
      <circle cx="76" cy="70" r="3" fill="#f5e6d3" />
      <circle cx="136" cy="70" r="3" fill="#f5e6d3" />
      <ellipse cx="100" cy="128" rx="30" ry="14" fill="#d4a373" stroke="#8b4513" strokeWidth="2" />
      <path d="M78 125 Q100 140 122 125" stroke="#8b4513" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="55" cy="105" r="10" fill="#c94c4c" opacity="0.35" />
      <circle cx="145" cy="105" r="10" fill="#c94c4c" opacity="0.35" />
    </svg>
  );
}

const FEATURES = [
  { icon: Languages, title: '任意语言互学', desc: '支持 120+ 种语言 TTS 朗读，AI 自动检测语种，不再受限于平台资源。', accent: '#c94c4c' },
  { icon: Wand2, title: 'AI 自动生成', desc: '粘贴任何文本，AI 自动检测语言、分句翻译、提取词汇，为你量身定制学习内容。', accent: '#d4a373' },
  { icon: BookOpen, title: '完整词汇表', desc: '自动生成完整词汇表，支持字母索引、搜索、逐词详情，随时查阅每个单词。', accent: '#2e4a3f' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', accent: '#c94c4c' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，单词和句子都能朗读，常速/慢速自由切换。', accent: '#d4a373' },
  { icon: GraduationCap, title: '两阶段学习', desc: '阶段一词汇认知，阶段二综合训练，错题自动回顾，循序渐进掌握每个知识点。', accent: '#2e4a3f' },
];

const COMPARES = [
  { other: '没有单词表，复习无门', us: '自动生成完整词汇表' },
  { other: '做题时想查其它单词', us: '学习过程中随时打开单词表' },
  { other: '学了也很难用上', us: '你提供什么素材就学什么' },
  { other: '小众语种不支持', us: '支持任意语言互学，120+ TTS' },
  { other: '无法深入理解一篇文章', us: 'AI 分句翻译，彻底吃透' },
];

const MODES = [
  { title: '直接输入', subtitle: '我有素材，想直接学', desc: '粘贴一篇文章、一首歌词、一段新闻——任何外语文本丢进来，AI 自动检测语言、分句翻译、提取词汇。', accent: '#c94c4c' },
  { title: '自动翻译', subtitle: '我想用母语素材来学外语', desc: '输入你母语的文本，AI 翻译成你想学的语言，然后基于翻译后的文本生成词汇和练习。', accent: '#2e4a3f' },
  { title: '自由生成', subtitle: '我没有素材，帮我生成', desc: '告诉 AI 你想学什么主题，AI 自动生成目标语言的文本，然后开始学习。没有素材也能学。', accent: '#d4a373' },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴外语文本、翻译母语文本、或让 AI 生成' },
  { num: '02', title: '浏览字典', desc: '查看分句翻译和词汇释义，随时查阅任意单词' },
  { num: '03', title: '阶段一', desc: '单词选择、句子翻译、听力理解' },
  { num: '04', title: '阶段二', desc: '遮蔽填空、翻译重组' },
  { num: '05', title: '错题回顾', desc: '答错的题自动收集，强化练习直到掌握' },
];

const PLANS = [
  { id: 'free', name: '免费版', price: '¥0', features: ['自带 API Key', '本地存储', '基础学习功能', '多 Key 轮询', 'Web + 桌面端'], cta: '免费开始' },
  { id: 'basic', name: '基础版', price: '¥19', period: '/月', features: ['平台 API 额度（50次/月）', '云同步', 'SRS 间隔复习', '跨设备使用'], cta: '即将推出', highlight: true, disabled: true },
  { id: 'pro', name: '专业版', price: '¥49', period: '/月', features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'], cta: '即将推出', disabled: true },
];

// 慢速动画变体 - Retro Vintage: duration-700 ease-in-out
const fadeUp = {
  initial: { y: 30, opacity: 0 },
  whileInView: { y: 0, opacity: 1 },
  viewport: { once: true },
  transition: { duration: 0.7, ease: 'easeInOut' },
};
const stagger = (i) => ({ ...fadeUp, transition: { duration: 0.7, delay: i * 0.12, ease: 'easeInOut' } });

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[#f5e6d3] font-serif text-[#3d2b1f]">
      {/* Nav */}
      <nav className="bg-[#f5e6d3] border-b-2 md:border-b-4 border-[#8b4513] px-4 md:px-8 py-3 md:py-4 sticky top-0 z-50">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <a href="/" className="flex items-center gap-2 font-black text-xl md:text-2xl tracking-wider text-[#8b4513]">
            <FrogMascot size={32} />
            <span className="uppercase tracking-widest">呱邻国</span>
          </a>
          <div className="flex items-center gap-3 md:gap-6">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="p-2 border-2 border-[#8b4513] text-[#8b4513] hover:bg-[#8b4513] hover:text-[#f5e6d3] transition-colors duration-700">
              <Github className="w-5 h-5" strokeWidth={2.5} />
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-serif uppercase tracking-widest text-sm md:text-base px-4 py-2 md:px-6 md:py-2.5 bg-[#c94c4c] text-[#f5e6d3] border-2 border-[#8b4513] hover:bg-[#a33a3a] transition-colors duration-700"
            >
              {user ? '进入学习' : '登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-[80vh] md:min-h-screen flex items-center px-4 md:px-8 py-14 md:py-24 bg-[#2e4a3f] border-b-2 md:border-b-4 border-[#8b4513] overflow-hidden">
        {/* 纸纹背景 */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #d4a373 0.5px, transparent 0.5px)', backgroundSize: '16px 16px' }} />

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-16">
          <div className="flex-1 text-center md:text-left">
            <motion.div {...fadeUp}>
              <span className="font-serif uppercase tracking-[0.3em] text-xs md:text-sm text-[#d4a373] inline-block mb-6">
                Est. 2024 · AI 驱动 · 全新体验
              </span>
            </motion.div>
            <motion.h1 {...stagger(0)} className="font-black text-4xl md:text-6xl lg:text-8xl leading-tight tracking-tight text-[#f5e6d3] mb-4 md:mb-6">
              学语言
            </motion.h1>
            <motion.h1 {...stagger(1)} className="font-black text-4xl md:text-6xl lg:text-8xl leading-tight tracking-tight mb-6 md:mb-8" style={{ color: '#c94c4c' }}>
              做自己!
            </motion.h1>
            <motion.p {...stagger(2)} className="font-serif text-base md:text-xl text-[#d4a373] mb-2 max-w-lg leading-relaxed">
              粘贴任何文本，AI 自动生成词汇表、分句翻译和多种练习题。
            </motion.p>
            <motion.p {...stagger(3)} className="font-serif text-sm md:text-lg text-[#d4a373]/70 mb-8 md:mb-10 max-w-lg">
              任何语言 → 任何语言，你的素材你做主。
            </motion.p>
            <motion.div {...stagger(4)}>
              <button
                onClick={() => navigate(user ? '/learn' : '/login')}
                className="font-serif uppercase tracking-widest text-sm md:text-base px-6 py-3 md:px-8 md:py-4 bg-[#c94c4c] text-[#f5e6d3] border-2 md:border-4 border-[#8b4513] shadow-[4px_4px_0px_0px_rgba(139,69,19,1)] md:shadow-[8px_8px_0px_0px_rgba(139,69,19,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] md:hover:translate-x-[4px] md:hover:translate-y-[4px] transition-all duration-700"
              >
                呱！开冲！ →
              </button>
            </motion.div>
          </div>
          <motion.div
            className="flex-1 flex justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.5, ease: 'easeInOut' }}
          >
            <FrogMascot size={240} />
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3] border-b-2 border-[#8b4513]">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-[0.3em] text-xs md:text-sm text-[#8b4513]/60">
              特色功能
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-2 text-[#8b4513]">
            多邻国做不到的
          </motion.h2>
          <motion.p {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-4" style={{ color: '#c94c4c' }}>
            呱邻国做到了
          </motion.p>
          <OrnamentalDivider />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} {...stagger(i)}
                className="group bg-[#f5e6d3] border-2 border-[#8b4513] p-6 md:p-8 hover:bg-[#eedbc2] transition-colors duration-700 relative"
              >
                {/* 角落装饰 */}
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#8b4513]/30 group-hover:border-[#8b4513]/80 transition-colors duration-700" />
                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-[#8b4513]/30 group-hover:border-[#8b4513]/80 transition-colors duration-700" />
                <div
                  className="w-12 h-12 md:w-14 md:h-14 flex items-center justify-center border-2 border-[#8b4513] mb-4"
                  style={{ backgroundColor: f.accent + '20' }}
                >
                  <f.icon className="w-6 h-6 md:w-7 md:h-7" style={{ color: f.accent }} strokeWidth={2.5} />
                </div>
                <h3 className="font-serif uppercase tracking-widest text-lg md:text-xl mb-2 text-[#8b4513] group-hover:text-[#5c2e0a] transition-colors duration-700">{f.title}</h3>
                <p className="font-serif text-sm md:text-base text-[#8b4513]/70 leading-relaxed group-hover:text-[#8b4513] transition-colors duration-700">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#2e4a3f] border-b-2 border-[#8b4513]">
        <div className="max-w-4xl mx-auto">
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-4 text-[#f5e6d3]">
            为什么选择呱邻国？
          </motion.h2>
          <OrnamentalDivider />
          <div className="space-y-4">
            {COMPARES.map((c, i) => (
              <motion.div key={i} {...stagger(i)} className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-[#2e4a3f] border-2 border-[#d4a373]/30 p-4 md:p-5">
                  <p className="font-serif uppercase tracking-widest text-xs text-[#d4a373]/50 mb-1">多邻国</p>
                  <p className="font-serif text-sm md:text-base text-[#d4a373]/60">{c.other}</p>
                </div>
                <div className="flex-1 bg-[#d4a373]/15 border-2 border-[#d4a373] p-4 md:p-5">
                  <p className="font-serif uppercase tracking-widest text-xs text-[#d4a373] mb-1">呱邻国</p>
                  <p className="font-serif text-sm md:text-base text-[#f5e6d3] font-bold">{c.us}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Modes */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3] border-b-2 border-[#8b4513]">
        <div className="max-w-6xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-[0.3em] text-xs md:text-sm text-[#8b4513]/60">
              三种模式
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-4 text-[#8b4513]">
            你的素材你做主
          </motion.h2>
          <OrnamentalDivider />

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {MODES.map((m, i) => (
              <motion.div key={i} {...stagger(i)}
                className="group bg-[#f5e6d3] border-2 border-[#8b4513] overflow-hidden hover:bg-[#eedbc2] transition-colors duration-700 relative"
              >
                <div className="h-1.5" style={{ backgroundColor: m.accent }} />
                <div className="p-6 md:p-8">
                  {/* 角落装饰 */}
                  <div className="absolute top-3 right-3 w-3 h-3 border-t-2 border-r-2 border-[#8b4513]/30 group-hover:border-[#8b4513]/80 transition-colors duration-700" />
                  <h3 className="font-serif uppercase tracking-widest text-xl md:text-2xl mb-1 text-[#8b4513] group-hover:text-[#5c2e0a] transition-colors duration-700">{m.title}</h3>
                  <p className="font-serif text-xs md:text-sm text-[#8b4513]/50 mb-3">{m.subtitle}</p>
                  <p className="font-serif text-sm md:text-base text-[#8b4513]/70 leading-relaxed group-hover:text-[#8b4513] transition-colors duration-700">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning System */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3] border-b-2 border-[#8b4513]">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-[0.3em] text-xs md:text-sm text-[#8b4513]/60">
              学习体系
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-4 text-[#8b4513]">
            两阶段 + 错题回顾
          </motion.h2>
          <OrnamentalDivider />

          <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-6">
            <motion.div {...stagger(0)} className="group bg-[#f5e6d3] border-2 border-[#8b4513] p-6 md:p-8 hover:bg-[#eedbc2] transition-colors duration-700 relative">
              <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#c94c4c]/30 group-hover:border-[#c94c4c]/80 transition-colors duration-700" />
              <h3 className="font-serif uppercase tracking-widest text-xl md:text-2xl mb-4" style={{ color: '#c94c4c' }}>
                阶段一 · 词汇认知
              </h3>
              <ul className="space-y-2 font-serif text-sm md:text-base text-[#8b4513]/70">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#c94c4c' }} /> 单词选择 — 四选一，看单词选释义</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#c94c4c' }} /> 句子翻译 — 看源语言句子，拼出翻译</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#c94c4c' }} /> 听力理解 — 听句子，拼出听到的内容</li>
              </ul>
            </motion.div>
            <motion.div {...stagger(1)} className="group bg-[#f5e6d3] border-2 border-[#8b4513] p-6 md:p-8 hover:bg-[#eedbc2] transition-colors duration-700 relative">
              <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#2e4a3f]/30 group-hover:border-[#2e4a3f]/80 transition-colors duration-700" />
              <h3 className="font-serif uppercase tracking-widest text-xl md:text-2xl mb-4" style={{ color: '#2e4a3f' }}>
                阶段二 · 综合训练
              </h3>
              <ul className="space-y-2 font-serif text-sm md:text-base text-[#8b4513]/70">
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#2e4a3f' }} /> 遮蔽填空 — 句子中挖空关键词，选择正确答案</li>
                <li className="flex items-start gap-2"><ChevronRight className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#2e4a3f' }} /> 翻译重组 — 看母语翻译，还原原句</li>
              </ul>
            </motion.div>
          </div>

          <motion.div {...stagger(2)} className="group bg-[#d4a373]/20 border-2 border-[#d4a373] p-6 md:p-8 text-center hover:bg-[#d4a373]/30 transition-colors duration-700">
            <h3 className="font-serif uppercase tracking-widest text-xl md:text-2xl mb-2 text-[#8b4513]">错题回顾</h3>
            <p className="font-serif text-sm md:text-base text-[#8b4513]/70">答错的题自动收集，强化练习直到掌握为止</p>
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#2e4a3f] border-b-2 border-[#8b4513]">
        <div className="max-w-4xl mx-auto">
          <motion.div {...fadeUp} className="text-center mb-4">
            <span className="font-serif uppercase tracking-[0.3em] text-xs md:text-sm text-[#d4a373]/60">
              使用流程
            </span>
          </motion.div>
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-4 text-[#f5e6d3]">
            五步搞定
          </motion.h2>
          <div className="flex justify-center my-6">
            <div className="h-px w-24 bg-[#d4a373]/30" />
          </div>

          <div className="relative">
            {/* Timeline */}
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-[#8b4513]/30 -translate-x-1/2" />

            {STEPS.map((s, i) => (
              <motion.div key={i} {...stagger(i)}
                className={`flex items-center gap-6 mb-6 flex-col md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className={`flex-1 ${i % 2 === 1 ? 'md:text-left' : 'md:text-right'}`}>
                  <div className="group bg-[#2e4a3f] border-2 border-[#d4a373]/40 p-4 md:p-5 inline-block text-left hover:bg-[#2e4a3f]/80 hover:border-[#d4a373] transition-colors duration-700">
                    <span className="font-black text-2xl md:text-3xl" style={{ color: '#c94c4c' }}>{s.num}</span>
                    <h3 className="font-serif uppercase tracking-widest text-base md:text-lg text-[#f5e6d3]">{s.title}</h3>
                    <p className="font-serif text-xs md:text-sm text-[#d4a373]/70">{s.desc}</p>
                  </div>
                </div>
                <div className="hidden md:flex w-10 h-10 border-2 border-[#8b4513] items-center justify-center shrink-0 bg-[#c94c4c]">
                  <span className="font-serif text-[#f5e6d3] text-xs">{s.num}</span>
                </div>
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#f5e6d3] border-b-2 border-[#8b4513]">
        <div className="max-w-5xl mx-auto">
          <motion.h2 {...fadeUp} className="font-black text-2xl md:text-4xl lg:text-5xl text-center tracking-tight mb-2 text-[#8b4513]">
            选择适合你的方案
          </motion.h2>
          <motion.p {...fadeUp} className="font-serif text-center text-sm md:text-base text-[#8b4513]/60 mb-4">
            免费开始，随时升级
          </motion.p>
          <OrnamentalDivider />

          <div className="grid md:grid-cols-3 gap-4 md:gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.id} {...stagger(i)}
                className={`group bg-[#f5e6d3] border-2 border-[#8b4513] p-6 md:p-8 hover:bg-[#eedbc2] transition-colors duration-700 relative ${plan.highlight ? 'border-[#c94c4c]' : ''}`}
              >
                {plan.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#c94c4c] text-[#f5e6d3] font-serif uppercase tracking-widest text-xs px-3 py-1">推荐</div>}
                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-[#8b4513]/30 group-hover:border-[#8b4513]/80 transition-colors duration-700" />
                <h3 className="font-serif uppercase tracking-widest text-xl md:text-2xl mb-1 text-[#8b4513]">{plan.name}</h3>
                <div className="mb-4">
                  <span className="font-black text-3xl md:text-4xl text-[#8b4513]">{plan.price}</span>
                  <span className="font-serif text-[#8b4513]/50">{plan.period || ''}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, j) => (
                    <li key={j} className="font-serif text-sm text-[#8b4513]/70 flex items-start gap-2">
                      <span style={{ color: '#c94c4c' }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full font-serif uppercase tracking-widest text-sm py-2.5 md:py-3 border-2 border-[#8b4513] transition-colors duration-700 ${
                    plan.highlight
                      ? 'bg-[#c94c4c] text-[#f5e6d3] hover:bg-[#a33a3a]'
                      : 'bg-transparent text-[#8b4513] hover:bg-[#8b4513] hover:text-[#f5e6d3]'
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
      <section className="py-14 md:py-24 px-4 md:px-8 bg-[#c94c4c] border-b-2 border-[#8b4513]">
        <div className="max-w-3xl mx-auto text-center">
          <motion.h2 {...fadeUp} className="font-black text-3xl md:text-5xl lg:text-6xl tracking-tight text-[#f5e6d3] mb-4">
            准备好了吗？
          </motion.h2>
          <motion.p {...fadeUp} className="font-serif text-base md:text-lg text-[#f5e6d3]/80 mb-2">
            只需一个 API Key，无需数据库，纯 LLM 能力驱动一切。
          </motion.p>
          <motion.p {...fadeUp} className="font-serif text-sm md:text-base text-[#f5e6d3]/60 mb-8">
            任何语言 → 任何语言，你的素材你做主。
          </motion.p>
          <motion.div {...fadeUp}>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-serif uppercase tracking-widest text-sm md:text-base px-6 py-3 md:px-8 md:py-4 bg-[#d4a373] text-[#3d2b1f] border-2 md:border-4 border-[#8b4513] shadow-[4px_4px_0px_0px_rgba(139,69,19,1)] md:shadow-[8px_8px_0px_0px_rgba(139,69,19,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] md:hover:translate-x-[4px] md:hover:translate-y-[4px] transition-all duration-700"
            >
              呱！开冲！ →
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#3d2b1f] text-[#d4a373] py-10 md:py-14 px-4 md:px-8 border-t-2 border-[#8b4513]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogMascot size={28} />
            <span className="font-serif uppercase tracking-widest text-lg">呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-6 font-serif text-sm text-[#d4a373]/60">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-[#d4a373] transition-colors duration-700 flex items-center gap-1">
              <Github className="w-4 h-4" /> GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
