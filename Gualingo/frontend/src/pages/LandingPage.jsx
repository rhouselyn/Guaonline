import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';

// SVG 青蛙 Logo
function FrogLogo({ size = 48, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="58" rx="38" ry="32" fill="#B5AE8E" />
      <ellipse cx="50" cy="55" rx="34" ry="28" fill="#D8D4BF" />
      <circle cx="34" cy="38" r="16" fill="#B5AE8E" />
      <circle cx="66" cy="38" r="16" fill="#B5AE8E" />
      <circle cx="34" cy="38" r="13" fill="#fff" />
      <circle cx="66" cy="38" r="13" fill="#fff" />
      <circle cx="36" cy="37" r="6" fill="#524D3C" />
      <circle cx="68" cy="37" r="6" fill="#524D3C" />
      <circle cx="38" cy="35" r="2" fill="#fff" />
      <circle cx="70" cy="35" r="2" fill="#fff" />
      <ellipse cx="50" cy="62" rx="18" ry="8" fill="#E8C985" />
      <path d="M38 60 Q50 70 62 60" stroke="#524D3C" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// 算法艺术背景
function AlgorithmicArtBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId, time = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const draw = () => {
      time += 0.002;
      const w = canvas.width, h = canvas.height;
      // 渐变底色
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#faf8f0');
      grad.addColorStop(0.5, '#f5f0e0');
      grad.addColorStop(1, '#faf8f0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // 流动纹理
      const step = 50;
      for (let x = 0; x < w; x += step) {
        for (let y = 0; y < h; y += step) {
          const nx = x / w, ny = y / h;
          const n = Math.sin(nx * 4 + time) * Math.cos(ny * 3 - time * 0.5) * 0.5 + 0.5;
          ctx.fillStyle = `rgba(212, 168, 83, ${0.015 + n * 0.025})`;
          ctx.fillRect(x, y, step, step);
        }
      }
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ opacity: 0.6 }} />;
}

const FEATURES = [
  { icon: '🤖', title: 'AI 自动生成', desc: '粘贴任何文本，AI 自动检测语言、分句翻译、提取词汇，为你量身定制学习内容。' },
  { icon: '🌐', title: '任意语言互学', desc: '支持 120+ 种语言 TTS 朗读，AI 自动检测语种，不再受限于平台资源。' },
  { icon: '📖', title: '完整词汇表', desc: '自动生成完整词汇表，支持字母索引、搜索、逐词详情，随时查阅每个单词。' },
  { icon: '🔊', title: '语音朗读', desc: '基于 Edge TTS 高质量语音，单词和句子都能朗读，常速/慢速自由切换。' },
  { icon: '📊', title: '两阶段学习', desc: '阶段一词汇认知，阶段二综合训练，循序渐进掌握每个知识点。' },
  { icon: '⭐', title: '星级评价 + 错题回顾', desc: '每个单元完成后获得星级评价，答错的题自动进入错题回顾。' },
];

const COMPARISONS = [
  { other: '没有单词表，复习无门', us: '自动生成完整词汇表' },
  { other: '做题时想查其它单词', us: '学习过程中随时打开单词表' },
  { other: '学了也很难用上', us: '你提供什么素材就学什么' },
  { other: '小众语种不支持', us: '支持任意语言互学，120+ TTS' },
  { other: '无法深入理解一篇文章', us: 'AI 分句翻译，彻底吃透' },
];

const MODES = [
  { icon: '📝', title: '直接输入', subtitle: '我有素材，想直接学', desc: '粘贴一篇文章、一首歌词、一段新闻——任何外语文本丢进来，AI 自动检测语言、分句翻译、提取词汇。' },
  { icon: '🔄', title: '自动翻译', subtitle: '我想用母语素材来学外语', desc: '输入你母语的文本，AI 翻译成你想学的语言，然后基于翻译后的文本生成词汇和练习。' },
  { icon: '✨', title: '自由生成', subtitle: '我没有素材，帮我生成', desc: '告诉 AI 你想学什么主题，AI 自动生成目标语言的文本，然后开始学习。没有素材也能学。' },
];

const PHASE1 = [
  { icon: '🔤', title: '单词选择', desc: '四选一，看单词选释义' },
  { icon: '📝', title: '句子翻译', desc: '看源语言句子，拼出翻译' },
  { icon: '👂', title: '听力理解', desc: '听句子，拼出听到的内容' },
];
const PHASE2 = [
  { icon: '🧩', title: '遮蔽填空', desc: '句子中挖空关键词，选择正确答案' },
  { icon: '🔄', title: '翻译重组', desc: '看母语翻译，还原原句' },
];

const STEPS = [
  { num: '01', title: '输入文本', desc: '粘贴外语文本、翻译母语文本、或让 AI 生成' },
  { num: '02', title: '浏览字典', desc: '查看分句翻译和词汇释义，随时查阅任意单词' },
  { num: '03', title: '阶段一', desc: '单词选择、句子翻译、听力理解' },
  { num: '04', title: '阶段二', desc: '遮蔽填空、翻译重组' },
  { num: '05', title: '错题回顾', desc: '答错的题自动收集，强化练习直到掌握' },
];

const PLANS = [
  { id: 'free', name: '免费版', price: '¥0', period: '', features: ['自带 API Key', '本地存储', '基础学习功能', '多 Key 轮询', 'Web + 桌面端', '收藏单词'], cta: '免费开始', current: true },
  { id: 'basic', name: '基础版', price: '¥19', period: '/月', features: ['平台 API 额度（50次/月）', '云同步', 'SRS 间隔复习', '跨设备使用'], cta: '即将推出', highlight: true, disabled: true },
  { id: 'pro', name: '专业版', price: '¥49', period: '/月', features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'], cta: '即将推出', disabled: true },
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
    <div className="min-h-screen bg-parchment-50" style={{ fontFamily: "'Outfit', 'Noto Sans SC', system-ui, sans-serif" }}>
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-parchment-50/80 backdrop-blur-md border-b border-aged-200/50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <FrogLogo size={28} />
            <span className="font-bold text-ink-800 text-lg" style={{ fontFamily: "'Bangers', 'Noto Sans SC', cursive", letterSpacing: '0.5px' }}>呱邻国</span>
          </button>
          <div className="flex items-center gap-6">
            <button onClick={scrollToPricing} className="text-sm text-ink-500 hover:text-amber-600 transition-colors">定价</button>
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer" className="text-sm text-ink-500 hover:text-amber-600 transition-colors">GitHub</a>
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="px-4 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-md hover:bg-amber-600 transition-colors"
            >
              {user ? '进入学习' : '开始使用'}
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-14">
        <AlgorithmicArtBackground />
        <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
          <div className="flex justify-center mb-5">
            <FrogLogo size={72} />
          </div>
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase mb-3">AI 驱动 · 全新体验</p>
          <h1 className="text-5xl md:text-7xl font-bold text-ink-800 mb-5" style={{ fontFamily: "'Bangers', 'Noto Sans SC', cursive", letterSpacing: '1px' }}>
            学语言<br className="md:hidden" />做自己!
          </h1>
          <p className="text-lg md:text-xl text-ink-600 max-w-2xl mx-auto mb-4 leading-relaxed">
            粘贴任何文本，AI 自动生成词汇表、分句翻译和多种练习题。
          </p>
          <p className="text-ink-500 mb-10">
            任何语言 → 任何语言，你的素材你做主。
          </p>
          <button
            onClick={() => navigate(user ? '/learn' : '/login')}
            className="px-10 py-3.5 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-all text-lg shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5"
          >
            呱！开冲！
          </button>
        </div>
      </section>

      {/* 特色功能 */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase text-center mb-2">特色功能</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 text-center mb-2">多邻国做不到的</h2>
          <p className="text-center text-ink-500 text-lg mb-14">呱邻国做到了</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div key={i} className="bg-white border border-aged-200/60 rounded-xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="text-lg font-bold text-ink-800 mb-2">{f.title}</h3>
                <p className="text-sm text-ink-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 为什么选择 */}
      <section className="py-24 px-6 bg-ink-800 text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-14">为什么选择呱邻国？</h2>
          <div className="space-y-4">
            {COMPARISONS.map((c, i) => (
              <div key={i} className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 rounded-lg p-5 border border-white/10">
                  <p className="text-xs text-white/40 mb-1">多邻国</p>
                  <p className="text-white/70 text-sm">{c.other}</p>
                </div>
                <div className="bg-amber-500/20 rounded-lg p-5 border border-amber-500/30">
                  <p className="text-xs text-amber-400 mb-1">呱邻国</p>
                  <p className="text-white text-sm font-medium">{c.us}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 三种模式 */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase text-center mb-2">三种模式</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 text-center mb-2">你的素材你做主</h2>
          <div className="grid md:grid-cols-3 gap-8 mt-14">
            {MODES.map((m, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl mb-4">{m.icon}</div>
                <h3 className="text-xl font-bold text-ink-800 mb-1">{m.title}</h3>
                <p className="text-amber-600 text-sm font-medium mb-3">{m.subtitle}</p>
                <p className="text-sm text-ink-500 leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 学习体系 */}
      <section className="py-24 px-6 bg-parchment-100/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase text-center mb-2">学习体系</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 text-center mb-14">两阶段 + 错题回顾</h2>

          <div className="grid md:grid-cols-2 gap-10 mb-10">
            {/* 阶段一 */}
            <div className="bg-white rounded-xl border border-aged-200/60 p-6">
              <h3 className="text-lg font-bold text-ink-800 mb-5">阶段一 · 词汇认知</h3>
              <div className="space-y-4">
                {PHASE1.map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="font-medium text-ink-700 text-sm">{p.title}</p>
                      <p className="text-xs text-ink-400">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* 阶段二 */}
            <div className="bg-white rounded-xl border border-aged-200/60 p-6">
              <h3 className="text-lg font-bold text-ink-800 mb-5">阶段二 · 综合训练</h3>
              <div className="space-y-4">
                {PHASE2.map((p, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-xl">{p.icon}</span>
                    <div>
                      <p className="font-medium text-ink-700 text-sm">{p.title}</p>
                      <p className="text-xs text-ink-400">{p.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 错题回顾 */}
          <div className="bg-amber-50 rounded-xl border border-amber-200/60 p-6 text-center">
            <h3 className="text-lg font-bold text-amber-800 mb-2">错题回顾</h3>
            <p className="text-sm text-amber-700">答错的题自动收集，强化练习直到掌握为止</p>
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase text-center mb-2">使用流程</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 text-center mb-14">五步搞定</h2>
          <div className="space-y-6">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold shrink-0">
                  {s.num}
                </div>
                <div className="pt-1">
                  <h3 className="font-bold text-ink-800 mb-0.5">{s.title}</h3>
                  <p className="text-sm text-ink-500">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section ref={pricingRef} className="py-24 px-6 bg-parchment-100/50">
        <div className="max-w-5xl mx-auto">
          <p className="text-amber-600 text-sm font-medium tracking-widest uppercase text-center mb-2">定价</p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 text-center mb-2">选择适合你的方案</h2>
          <p className="text-center text-ink-500 mb-14">免费开始，随时升级</p>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`bg-white rounded-xl p-6 ${
                  plan.highlight ? 'border-2 border-amber-500 shadow-lg shadow-amber-500/10' : 'border border-aged-200/60'
                }`}
              >
                <h3 className="text-xl font-bold text-ink-800 mb-1">{plan.name}</h3>
                <div className="mb-5">
                  <span className="text-4xl font-bold text-ink-800">{plan.price}</span>
                  <span className="text-ink-400">{plan.period}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm text-ink-600 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate('/login')}
                  disabled={plan.disabled}
                  className={`w-full py-2.5 rounded-lg font-medium transition-colors ${
                    plan.highlight
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'border border-aged-200 text-ink-600 hover:bg-parchment-50'
                  } disabled:opacity-50`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-ink-800 mb-4">准备好了吗？</h2>
          <p className="text-ink-500 mb-3">只需一个 API Key，无需数据库，纯 LLM 能力驱动一切。</p>
          <p className="text-ink-400 mb-10">任何语言 → 任何语言，你的素材你做主。</p>
          <button
            onClick={() => navigate(user ? '/learn' : '/login')}
            className="px-10 py-3.5 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 transition-all text-lg shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5"
          >
            呱！开冲！
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-aged-200/50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogLogo size={24} />
            <span className="font-bold text-ink-700" style={{ fontFamily: "'Bangers', cursive" }}>呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-400">
            <a href="https://github.com/rhouselyn/Gualingo" target="_blank" rel="noopener noreferrer" className="hover:text-amber-600 transition-colors">GitHub</a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
