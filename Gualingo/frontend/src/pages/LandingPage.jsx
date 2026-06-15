import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/auth';
import { translations } from '../utils/translations';

// 算法艺术背景组件 - Retro Vintage 风格的流动纹理
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

    // ponytail: 简易 Perlin 近似，暖色复古流动纹理
    const draw = () => {
      time += 0.003;
      const w = canvas.width;
      const h = canvas.height;

      // 底色
      ctx.fillStyle = '#faf8f0';
      ctx.fillRect(0, 0, w, h);

      // 流动纹理层
      const step = 40;
      for (let x = 0; x < w; x += step) {
        for (let y = 0; y < h; y += step) {
          const nx = x / w;
          const ny = y / h;
          const n1 = Math.sin(nx * 6 + time) * Math.cos(ny * 4 - time * 0.7);
          const n2 = Math.sin((nx + ny) * 3 + time * 0.5);
          const val = (n1 + n2) * 0.5 + 0.5;

          // 暖色调：琥珀、米色、淡棕
          const r = Math.floor(200 + val * 40);
          const g = Math.floor(180 + val * 30);
          const b = Math.floor(140 + val * 20);
          const alpha = 0.03 + val * 0.04;

          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
          ctx.fillRect(x, y, step, step);
        }
      }

      // 装饰性圆点
      for (let i = 0; i < 15; i++) {
        const px = (Math.sin(i * 1.7 + time * 0.3) * 0.5 + 0.5) * w;
        const py = (Math.cos(i * 2.3 + time * 0.2) * 0.5 + 0.5) * h;
        const size = 60 + Math.sin(i + time) * 20;
        const alpha = 0.015 + Math.sin(i * 0.5 + time) * 0.008;

        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212, 168, 83, ${alpha})`;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ opacity: 0.7 }}
    />
  );
}

// SVG 青蛙 Logo
function FrogLogo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
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

const FEATURES = [
  {
    icon: '🌐',
    title: '任意语言互学',
    desc: '不限语言对，中文学日语、英文学法语、韩文学西班牙语……AI 自动识别，自由搭配。',
  },
  {
    icon: '✍️',
    title: '三种输入模式',
    desc: '直接粘贴文本、翻译后学习、或让 AI 生成学习内容。你的素材你做主。',
  },
  {
    icon: '🧠',
    title: 'AI 生成练习',
    desc: '选词填空、翻译还原、听力理解、句子翻译——5 种题型，全自动生成。',
  },
  {
    icon: '⭐',
    title: '收藏单词',
    desc: '一键收藏生词，跨文本收藏夹随时复习，重点词汇不再遗漏。',
  },
  {
    icon: '🔊',
    title: '语音朗读',
    desc: 'Edge TTS 高质量语音，点击即读，听力和发音同步练习。',
  },
  {
    icon: '📊',
    title: '分阶段学习',
    desc: '阶段一学单词，阶段二练句子，错题自动回顾，科学掌握每一段文本。',
  },
];

const STEPS = [
  { num: '1', title: '输入文本', desc: '粘贴、翻译或让 AI 生成' },
  { num: '2', title: 'AI 分句翻译', desc: '自动提取词汇和释义' },
  { num: '3', title: '学单词', desc: '选择、听力、翻译多题型' },
  { num: '4', title: '练句子', desc: '填空、还原、错题回顾' },
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
  },
  {
    id: 'pro',
    name: '专业版',
    price: '¥49',
    period: '/月',
    features: ['无限 API 额度', 'AI 口语对话', '学习分析', '优先支持', '所有基础版功能'],
    cta: '即将推出',
    disabled: true,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    auth.fetchUser().then(u => { if (u) setUser(u); }).catch(() => {});
  }, []);

  const t = translations.zh;

  return (
    <div className="min-h-screen bg-parchment-50 font-sans">
      {/* Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <AlgorithmicArtBackground />
        <div className="relative z-10 text-center px-4 max-w-3xl mx-auto">
          <div className="flex justify-center mb-6">
            <FrogLogo size={80} />
          </div>
          <h1 className="text-5xl md:text-6xl font-serif text-ink-800 mb-4">呱邻国</h1>
          <p className="text-xl md:text-2xl text-ink-600 mb-2 font-serif">
            完全由 AI 驱动的沉浸式语言学习
          </p>
          <p className="text-ink-500 mb-10">
            输入任意文本，AI 自动生成词汇表、分句翻译和多种练习题。任何语言 → 任何语言。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate(user ? '/learn' : '/login')}
              className="px-8 py-3 bg-amber-500 text-white font-medium rounded-sm hover:bg-amber-600 transition-colors text-lg shadow-retro"
            >
              {user ? '进入学习' : '开始学习'}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-8 py-3 border-2 border-aged-200 text-ink-600 font-medium rounded-sm hover:bg-parchment-100 transition-colors text-lg"
            >
              登录
            </button>
          </div>
          <p className="mt-6 text-sm text-ink-400">
            也可以跳过登录，直接使用自己的 API Key
          </p>
        </div>
      </section>

      {/* 功能展示 */}
      <section className="py-20 px-4 bg-parchment-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-serif text-ink-800 text-center mb-4">核心功能</h2>
          <p className="text-center text-ink-500 mb-12">从输入到掌握，AI 覆盖全流程</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="bg-parchment-50 border-2 border-aged-200 rounded-sm p-6 hover:shadow-retro transition-shadow"
              >
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="text-lg font-serif text-ink-800 mb-2">{f.title}</h3>
                <p className="text-sm text-ink-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 使用流程 */}
      <section className="py-20 px-4 bg-parchment-100/50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-serif text-ink-800 text-center mb-12">使用流程</h2>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {STEPS.map((s, i) => (
              <div key={i} className="flex flex-col items-center text-center flex-1">
                <div className="w-14 h-14 rounded-full bg-amber-500 text-white flex items-center justify-center text-xl font-bold mb-3">
                  {s.num}
                </div>
                <h3 className="font-serif text-ink-800 mb-1">{s.title}</h3>
                <p className="text-sm text-ink-500">{s.desc}</p>
                {i < STEPS.length - 1 && (
                  <div className="hidden md:block text-2xl text-aged-300 mt-3">→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 定价 */}
      <section className="py-20 px-4 bg-parchment-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-serif text-ink-800 text-center mb-4">选择适合你的方案</h2>
          <p className="text-center text-ink-500 mb-12">免费开始，随时升级</p>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`bg-parchment-50 border-2 rounded-sm p-6 ${
                  plan.highlight ? 'border-amber-500 shadow-retro' : 'border-aged-200'
                }`}
              >
                <h3 className="text-xl font-serif text-ink-800 mb-1">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-ink-800">{plan.price}</span>
                  <span className="text-ink-500">{plan.period}</span>
                </div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map((f, i) => (
                    <li key={i} className="text-sm text-ink-600 flex items-start gap-2">
                      <span className="text-amber-500 mt-0.5">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => !plan.disabled && navigate(plan.current ? '/login' : '/login')}
                  disabled={plan.disabled}
                  className={`w-full py-2.5 rounded-sm font-medium transition-colors ${
                    plan.highlight
                      ? 'bg-amber-500 text-white hover:bg-amber-600'
                      : 'border border-aged-200 text-ink-600 hover:bg-parchment-100'
                  } disabled:opacity-50`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t-2 border-aged-200 bg-parchment-50">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FrogLogo size={28} />
            <span className="font-serif text-ink-700">呱邻国 Gualingo</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-ink-500">
            <a
              href="https://github.com/rhouselyn/Gualingo"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-amber-600 transition-colors"
            >
              GitHub
            </a>
            <span>AGPL v3</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
