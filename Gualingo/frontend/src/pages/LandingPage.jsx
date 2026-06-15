import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, Languages, Wand2, Star, Volume2, GraduationCap, ArrowRight, Github, ChevronRight, Scroll } from 'lucide-react';

// 纸张纹理背景组件
function PaperTexture({ opacity = 0.06 }) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 ${opacity} 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        opacity: 1,
      }}
    />
  );
}

// 装饰性分隔线
function DecorativeDivider() {
  return (
    <div className="flex items-center justify-center gap-4 my-8">
      <div className="h-px w-16 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
      <Scroll className="w-5 h-5 text-amber-500" strokeWidth={1.5} />
      <div className="h-px w-16 bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
    </div>
  );
}

// 复古青蛙吉祥物 SVG
function FrogMascot({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="58" rx="38" ry="32" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <ellipse cx="50" cy="55" rx="34" ry="28" fill="#B5AE8E" />
      <circle cx="34" cy="38" r="16" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <circle cx="66" cy="38" r="16" fill="#8E866A" stroke="#524635" strokeWidth="2" />
      <circle cx="34" cy="38" r="13" fill="#F5ECD7" stroke="#524635" strokeWidth="1.5" />
      <circle cx="66" cy="38" r="13" fill="#F5ECD7" stroke="#524635" strokeWidth="1.5" />
      <circle cx="36" cy="37" r="5" fill="#3B3225" />
      <circle cx="68" cy="37" r="5" fill="#3B3225" />
      <circle cx="38" cy="35" r="1.5" fill="#F5ECD7" />
      <circle cx="70" cy="35" r="1.5" fill="#F5ECD7" />
      <ellipse cx="50" cy="62" rx="18" ry="8" fill="#D4A854" stroke="#524635" strokeWidth="1.5" />
      <path d="M38 60 Q50 68 62 60" stroke="#524635" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="52" r="4" fill="#D08E7D" opacity="0.4" />
      <circle cx="58" cy="52" r="4" fill="#D08E7D" opacity="0.4" />
    </svg>
  );
}

// 装饰性图标背景
function FeatureIcon({ icon: Icon, color }) {
  return (
    <div
      className="w-12 h-12 flex items-center justify-center border-2 border-amber-400 rounded-sm"
      style={{ backgroundColor: `${color}20` }}
    >
      <Icon className="w-6 h-6" style={{ color }} strokeWidth={1.5} />
    </div>
  );
}

const FEATURES = [
  { icon: Languages, title: '任意语言互学', desc: '支持 120+ 种语言 TTS 朗读，AI 自动检测语种，不再受限于平台资源。', color: '#A06E28' },
  { icon: Wand2, title: 'AI 自动生成', desc: '粘贴任何文本，AI 自动检测语言、分句翻译、提取词汇，为你量身定制学习内容。', color: '#6E6650' },
  { icon: BookOpen, title: '完整词汇表', desc: '自动生成完整词汇表，支持字母索引、搜索、逐词详情，随时查阅每个单词。', color: '#9E4533' },
  { icon: Star, title: '收藏单词', desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。', color: '#A06E28' },
  { icon: Volume2, title: '语音朗读', desc: 'Edge TTS 高质量语音，单词和句子都能朗读，常速/慢速自由切换。', color: '#6E6650' },
  { icon: GraduationCap, title: '两阶段学习', desc: '阶段一词汇认知，阶段二综合训练，错题自动回顾，循序渐进掌握每个知识点。', color: '#9E4533' },
];

const COMPARES = [
  { other: '没有单词表，复习无门', us: '自动生成完整词汇表' },
  { other: '做题时想查其它单词', us: '学习过程中随时打开单词表' },
  { other: '学了也很难用上', us: '你提供什么素材就学什么' },
  { other: '小众语种不支持', us: '支持任意语言互学，120+ TTS' },
  { other: '无法深入理解一篇文章', us: 'AI 分句翻译，彻底吃透' },
];

const MODES = [
  { title: '直接输入', subtitle: '我有素材，想直接学', desc: '粘贴一篇文章、一首歌词、一段新闻——任何外语文本丢进来，AI 自动检测语言、分句翻译、提取词汇。' },
  { title: '自动翻译', subtitle: '我想用母语素材来学外语', desc: '输入你母语的文本，AI 翻译成你想学的语言，然后基于翻译后的文本生成词汇和练习。' },
  { title: '自由生成', subtitle: '我没有素材，帮我生成', desc: '告诉 AI 你想学什么主题，AI 自动生成目标语言的文本，然后开始学习。没有素材也能学。' },
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
const fadeUp = { initial: { y: 30, opacity: 0 }, whileInView: { y: 0, opacity: 1 }, viewport: { once: true } };
const stagger = (i) => ({ ...fadeUp, transition: { delay: i * 0.1 } });

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-parchment-50 font-body text-ink-700 relative">
      <PaperTexture opacity={0.08} />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-parchment-100/95 border-b-2 border-aged-200 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FrogMascot size={32} />
            <span className="font-display text-xl text-ink-800">呱邻国</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="p-1.5 text-ink-500 hover:text-amber-500 transition-colors">
              <Github className="w-4 h-4" strokeWidth={1.5} />
            </a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="font-body text-sm px-4 py-1.5 bg-amber-300 text-ink-800 border-2 border-amber-400 hover:bg-amber-400 transition-colors rounded-sm"
            >
              {user ? '进入学习' : '登录'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center pt-14 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-parchment-100 via-parchment-50 to-parchment-100" />
        <PaperTexture opacity={0.06} />
        
        <div className="relative z-10 max-w-5xl mx-auto px-4 py-16">
          <div className="text-center">
            <motion.div {...fadeUp} transition={{ delay: 0 }} className="mb-6">
              <span className="inline-block font-body text-xs tracking-widest text-ink-500 bg-parchment-200 px-4 py-1.5 border border-aged-200 rounded-sm">
                AI 驱动 · 沉浸式语言学习
              </span>
            </motion.div>

            <motion.div {...fadeUp} transition={{ delay: 0.1 }} className="mb-4">
              <FrogMascot size={100} />
            </motion.div>

            <motion.h1 {...fadeUp} transition={{ delay: 0.15 }}
              className="font-display text-5xl md:text-6xl text-ink-800 mb-2"
            >
              呱邻国
            </motion.h1>
            <motion.p {...fadeUp} transition={{ delay: 0.2 }}
              className="font-display text-2xl md:text-3xl text-amber-500 mb-6"
            >
              Gualingo
            </motion.p>

            <motion.p {...fadeUp} transition={{ delay: 0.25 }}
              className="font-body text-lg text-ink-600 mb-2 max-w-2xl mx-auto"
            >
              粘贴任何文本，AI 自动生成词汇表、分句翻译和多种练习题。
            </motion.p>
            <motion.p {...fadeUp} transition={{ delay: 0.3 }}
              className="font-body text-base text-ink-500 mb-10 max-w-xl mx-auto"
            >
              任何语言 → 任何语言，你的素材你做主。
            </motion.p>

            <motion.div {...fadeUp} transition={{ delay: 0.35 }} className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate(user ? '/learn' : '/login')}
                className="font-body text-base px-8 py-3 bg-amber-400 text-ink-800 border-2 border-amber-500 hover:bg-amber-500 transition-all rounded-sm shadow-retro"
              >
                开始学习 <ArrowRight className="inline-block w-4 h-4 ml-1" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => navigate('/login')}
                className="font-body text-base px-8 py-3 bg-transparent text-ink-600 border-2 border-aged-300 hover:border-amber-400 hover:text-amber-600 transition-all rounded-sm"
              >
                登录
              </button>
            </motion.div>
          </div>
        </div>

        {/* 装饰角落元素 */}
        <div className="absolute bottom-8 left-8 opacity-20">
          <Scroll className="w-8 h-8 text-amber-500" strokeWidth={1} />
        </div>
        <div className="absolute bottom-8 right-8 opacity-20">
          <Scroll className="w-8 h-8 text-amber-500" strokeWidth={1} />
        </div>
      </section>

      {/* Features */}
      <section className="relative py-16 bg-parchment-100/50">
        <PaperTexture opacity={0.04} />
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mb-2">核心功能</h2>
            <p className="font-body text-ink-500">从输入到掌握，AI 覆盖全流程</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <motion.div key={i} {...stagger(i)}
                className="bg-parchment-50 border-2 border-aged-200 rounded-sm p-5 hover:border-amber-400 hover:shadow-warm transition-all"
              >
                <div className="mb-3">
                  <FeatureIcon icon={f.icon} color={f.color} />
                </div>
                <h3 className="font-display text-lg text-ink-800 mb-2">{f.title}</h3>
                <p className="font-body text-sm text-ink-600 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Compare */}
      <section className="relative py-16 bg-olive-50">
        <PaperTexture opacity={0.04} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mb-2">为什么选择呱邻国？</h2>
          </motion.div>

          <div className="space-y-3">
            {COMPARES.map((c, i) => (
              <motion.div key={i} {...stagger(i)} className="flex flex-col md:flex-row gap-3">
                <div className="flex-1 bg-parchment-50/80 border-2 border-aged-200 p-4 rounded-sm">
                  <p className="font-body text-xs text-ink-400 mb-1">多邻国</p>
                  <p className="font-body text-sm text-ink-600">{c.other}</p>
                </div>
                <div className="flex-1 bg-amber-50 border-2 border-amber-300 p-4 rounded-sm">
                  <p className="font-body text-xs text-amber-600 mb-1">呱邻国</p>
                  <p className="font-body text-sm text-ink-700 font-medium">{c.us}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Modes */}
      <section className="relative py-16 bg-parchment-50">
        <PaperTexture opacity={0.06} />
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <span className="font-body text-xs tracking-widest text-ink-500 bg-amber-100 px-4 py-1 border border-amber-300 rounded-sm">
              三种模式
            </span>
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mt-2">你的素材你做主</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {MODES.map((m, i) => (
              <motion.div key={i} {...stagger(i)}
                className="bg-parchment-100 border-2 border-aged-200 rounded-sm overflow-hidden hover:border-amber-400 transition-all"
              >
                <div className="h-1 bg-amber-400" />
                <div className="p-5">
                  <h3 className="font-display text-xl text-ink-800 mb-1">{m.title}</h3>
                  <p className="font-body text-xs text-ink-400 mb-3">{m.subtitle}</p>
                  <p className="font-body text-sm text-ink-600">{m.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning System */}
      <section className="relative py-16 bg-olive-50/50">
        <PaperTexture opacity={0.04} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <span className="font-body text-xs tracking-widest text-ink-500 bg-olive-200 px-4 py-1 border border-olive-300 rounded-sm">
              学习体系
            </span>
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mt-2">两阶段 + 错题回顾</h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <motion.div {...stagger(0)} className="bg-parchment-50 border-2 border-aged-200 p-5 rounded-sm">
              <h3 className="font-display text-lg text-amber-600 mb-3">阶段一 · 词汇认知</h3>
              <ul className="space-y-2 font-body text-sm text-ink-600">
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-amber-500" strokeWidth={1.5} /> 单词选择 — 四选一，看单词选释义</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-amber-500" strokeWidth={1.5} /> 句子翻译 — 看源语言句子，拼出翻译</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-amber-500" strokeWidth={1.5} /> 听力理解 — 听句子，拼出听到的内容</li>
              </ul>
            </motion.div>
            <motion.div {...stagger(1)} className="bg-parchment-50 border-2 border-aged-200 p-5 rounded-sm">
              <h3 className="font-display text-lg text-olive-500 mb-3">阶段二 · 综合训练</h3>
              <ul className="space-y-2 font-body text-sm text-ink-600">
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-olive-400" strokeWidth={1.5} /> 遮蔽填空 — 句子中挖空关键词，选择正确答案</li>
                <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-olive-400" strokeWidth={1.5} /> 翻译重组 — 看母语翻译，还原原句</li>
              </ul>
            </motion.div>
          </div>

          <motion.div {...stagger(2)} className="bg-amber-100 border-2 border-amber-300 p-5 rounded-sm text-center">
            <h3 className="font-display text-lg text-amber-700 mb-1">错题回顾</h3>
            <p className="font-body text-sm text-ink-600">答错的题自动收集，强化练习直到掌握为止</p>
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="relative py-16 bg-parchment-100">
        <PaperTexture opacity={0.06} />
        <div className="relative z-10 max-w-4xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <span className="font-body text-xs tracking-widest text-ink-500 bg-parchment-200 px-4 py-1 border border-aged-200 rounded-sm">
              使用流程
            </span>
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mt-2">五步搞定</h2>
          </motion.div>

          <div className="relative">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-aged-300 -translate-x-1/2" />

            {STEPS.map((s, i) => (
              <motion.div key={i} {...stagger(i)}
                className={`flex items-center gap-4 mb-6 flex-col md:flex-row ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
              >
                <div className={`flex-1 ${i % 2 === 1 ? 'md:text-left' : 'md:text-right'}`}>
                  <div className="bg-parchment-50 border-2 border-aged-200 p-4 rounded-sm inline-block text-left">
                    <span className="font-display text-2xl text-amber-500">{s.num}</span>
                    <h3 className="font-display text-base text-ink-800">{s.title}</h3>
                    <p className="font-body text-xs text-ink-500">{s.desc}</p>
                  </div>
                </div>
                <div className="hidden md:flex w-8 h-8 border-2 border-amber-400 items-center justify-center shrink-0 rounded-full bg-amber-100">
                  <span className="font-display text-xs text-amber-600">{s.num}</span>
                </div>
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="relative py-16 bg-parchment-50">
        <PaperTexture opacity={0.06} />
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <motion.div {...fadeUp} className="text-center mb-8">
            <h2 className="font-display text-3xl md:text-4xl text-ink-800 mb-2">选择适合你的方案</h2>
            <p className="font-body text-ink-500">免费开始，随时升级</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <motion.div key={plan.id} {...stagger(i)}
                className={`bg-parchment-100 border-2 rounded-sm p-5 ${
                  plan.highlight 
                    ? 'border-amber-400 bg-amber-50/50' 
                    : 'border-aged-200 hover:border-amber-300'
                } transition-all`}
              >
                <h3 className="font-display text-xl text-ink-800 mb-1">{plan.name}</h3>
                <div className="mb-4">
                  <span className="font-display text-3xl text-amber-600">{plan.price}</span>
                  <span className="font-body text-sm text-ink-500">{plan.period || ''}</span>
                </div>
                <ul className="space-y-1.5 mb-5">
                  {plan.features.map((f, j) => (
                    <li key={j} className="font-body text-xs text-ink-600 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full font-body text-sm py-2 rounded-sm transition-all ${
                    plan.highlight
                      ? 'bg-amber-400 text-ink-800 border-2 border-amber-500 hover:bg-amber-500'
                      : 'bg-transparent text-ink-600 border-2 border-aged-300 hover:border-amber-400 hover:text-amber-600'
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
      <section className="relative py-16 bg-amber-100">
        <PaperTexture opacity={0.04} />
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <motion.h2 {...fadeUp} className="font-display text-3xl md:text-4xl text-ink-800 mb-3">准备好了吗？</motion.h2>
          <motion.p {...fadeUp} className="font-body text-ink-600 mb-2">
            只需一个 API Key，无需数据库，纯 LLM 能力驱动一切。
          </motion.p>
          <motion.p {...fadeUp} className="font-body text-ink-500 mb-6">
            任何语言 → 任何语言，你的素材你做主。
          </motion.p>
          <motion.button {...fadeUp}
            onClick={() => navigate(user ? '/learn' : '/login')}
            className="font-body text-base px-8 py-3 bg-amber-400 text-ink-800 border-2 border-amber-500 hover:bg-amber-500 transition-all rounded-sm shadow-retro"
          >
            开始学习 <ArrowRight className="inline-block w-4 h-4 ml-1" strokeWidth={1.5} />
          </motion.button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-8 bg-ink-800 text-parchment-100">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogMascot size={24} />
            <span className="font-display text-lg">呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-4 font-body text-xs text-parchment-200">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer"
              className="hover:text-amber-300 transition-colors flex items-center gap-1">
              <Github className="w-3 h-3" strokeWidth={1.5} /> GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
