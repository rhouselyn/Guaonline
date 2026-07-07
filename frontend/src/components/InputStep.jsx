import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Search, X, ChevronDown, ChevronRight, ArrowRight, PenLine, Languages, Wand2, Zap } from 'lucide-react'
import { useMediaQuery } from '../utils/useMediaQuery'
import { auth } from '../utils/auth'

const LANG_COLORS = {
  'en': '#3b82f6', 'fr': '#6366f1', 'pt': '#22c55e', 'de': '#eab308', 'ro': '#2563eb',
  'sv': '#0ea5e9', 'da': '#dc2626', 'bg': '#16a34a', 'ru': '#1d4ed8', 'cs': '#7c3aed',
  'el': '#0891b2', 'uk': '#f59e0b', 'es': '#ef4444', 'nl': '#f97316', 'sk': '#0284c7',
  'hr': '#dc2626', 'pl': '#dc2626', 'lt': '#65a30d', 'nb': '#dc2626', 'nn': '#dc2626',
  'fa': '#16a34a', 'sl': '#0ea5e9', 'gu': '#f97316', 'lv': '#8b5cf6', 'it': '#16a34a',
  'oc': '#ef4444', 'ne': '#2563eb', 'mr': '#f97316', 'be': '#dc2626', 'sr': '#7c3aed',
  'lb': '#0ea5e9', 'vec': '#16a34a', 'as': '#f97316', 'cy': '#16a34a', 'szl': '#dc2626',
  'ast': '#f97316', 'hne': '#f97316', 'awa': '#f97316', 'mai': '#f97316', 'bho': '#f97316',
  'sd': '#16a34a', 'ga': '#16a34a', 'fo': '#1d4ed8', 'hi': '#f97316', 'pa': '#f97316',
  'bn': '#16a34a', 'or': '#f97316', 'tg': '#ef4444', 'yi': '#1d4ed8', 'lmo': '#16a34a',
  'lij': '#16a34a', 'scn': '#ef4444', 'fur': '#16a34a', 'sc': '#ef4444', 'gl': '#0ea5e9',
  'ca': '#eab308', 'is': '#1d4ed8', 'sq': '#dc2626', 'li': '#f97316', 'prs': '#16a34a',
  'af': '#16a34a', 'mk': '#dc2626', 'si': '#7c3aed', 'ur': '#16a34a', 'mag': '#f97316',
  'bs': '#1d4ed8', 'hy': '#f97316',
  'zh': '#dc2626', 'zh-TW': '#dc2626', 'yue': '#dc2626', 'my': '#eab308',
  'ar': '#16a34a', 'ars': '#16a34a', 'apc': '#16a34a', 'arz': '#16a34a', 'ary': '#16a34a',
  'acm': '#16a34a', 'acq': '#16a34a', 'aeb': '#16a34a',
  'he': '#2563eb', 'mt': '#dc2626',
  'id': '#ef4444', 'ms': '#eab308', 'tl': '#2563eb', 'ceb': '#2563eb', 'jv': '#dc2626',
  'su': '#16a34a', 'min': '#16a34a', 'ban': '#eab308', 'bjn': '#16a34a', 'pag': '#2563eb',
  'ilo': '#2563eb', 'war': '#2563eb',
  'ta': '#f97316', 'te': '#16a34a', 'kn': '#dc2626', 'ml': '#dc2626',
  'tr': '#dc2626', 'az': '#0ea5e9', 'uz': '#0ea5e9', 'kk': '#0ea5e9', 'ba': '#16a34a', 'tt': '#16a34a',
  'th': '#7c3aed', 'lo': '#dc2626',
  'fi': '#1d4ed8', 'et': '#1d4ed8', 'hu': '#16a34a',
  'vi': '#dc2626', 'km': '#2563eb',
  'ja': '#dc2626', 'ko': '#1d4ed8', 'ka': '#ef4444', 'eu': '#dc2626', 'ht': '#2563eb',
  'pap': '#f97316', 'kea': '#0ea5e9', 'tpi': '#dc2626', 'sw': '#16a34a',
  'auto': '#78716c',
}

function LangIcon({ langCode, size = 'md' }) {
  const color = LANG_COLORS[langCode] || (() => {
    let hash = 0
    const code = langCode || ''
    for (let i = 0; i < code.length; i++) {
      hash = code.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = ((hash % 360) + 360) % 360
    return `hsl(${hue}, 55%, 45%)`
  })()
  const isAuto = langCode === 'auto'
  const code = isAuto ? 'AUTO' : langCode === 'zh-TW' ? 'TW' : langCode.substring(0, 2).toUpperCase()
  const sizeClasses = size === 'sm' ? 'w-5 h-5 text-[8px]' : size === 'lg' ? 'w-8 h-8 text-xs' : 'w-7 h-7 text-[10px]'
  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm font-bold text-white leading-none ${sizeClasses}`}
      style={{ backgroundColor: color }}
    >
      {code}
    </span>
  )
}

const LANGUAGES = [
  // ── 印欧语系 Indo-European ──
  { value: 'en', native: 'English', en: 'English', zh: '英语', family: 'indo-european', flag: '🇬🇧' },
  { value: 'fr', native: 'Français', en: 'French', zh: '法语', family: 'indo-european', flag: '🇫🇷' },
  { value: 'pt', native: 'Português', en: 'Portuguese', zh: '葡萄牙语', family: 'indo-european', flag: '🇵🇹' },
  { value: 'de', native: 'Deutsch', en: 'German', zh: '德语', family: 'indo-european', flag: '🇩🇪' },
  { value: 'ro', native: 'Română', en: 'Romanian', zh: '罗马尼亚语', family: 'indo-european', flag: '🇷🇴' },
  { value: 'sv', native: 'Svenska', en: 'Swedish', zh: '瑞典语', family: 'indo-european', flag: '🇸🇪' },
  { value: 'da', native: 'Dansk', en: 'Danish', zh: '丹麦语', family: 'indo-european', flag: '🇩🇰' },
  { value: 'bg', native: 'Български', en: 'Bulgarian', zh: '保加利亚语', family: 'indo-european', flag: '🇧🇬' },
  { value: 'ru', native: 'Русский', en: 'Russian', zh: '俄语', family: 'indo-european', flag: '🇷🇺' },
  { value: 'cs', native: 'Čeština', en: 'Czech', zh: '捷克语', family: 'indo-european', flag: '🇨🇿' },
  { value: 'el', native: 'Ελληνικά', en: 'Greek', zh: '希腊语', family: 'indo-european', flag: '🇬🇷' },
  { value: 'uk', native: 'Українська', en: 'Ukrainian', zh: '乌克兰语', family: 'indo-european', flag: '🇺🇦' },
  { value: 'es', native: 'Español', en: 'Spanish', zh: '西班牙语', family: 'indo-european', flag: '🇪🇸' },
  { value: 'nl', native: 'Nederlands', en: 'Dutch', zh: '荷兰语', family: 'indo-european', flag: '🇳🇱' },
  { value: 'sk', native: 'Slovenčina', en: 'Slovak', zh: '斯洛伐克语', family: 'indo-european', flag: '🇸🇰' },
  { value: 'hr', native: 'Hrvatski', en: 'Croatian', zh: '克罗地亚语', family: 'indo-european', flag: '🇭🇷' },
  { value: 'pl', native: 'Polski', en: 'Polish', zh: '波兰语', family: 'indo-european', flag: '🇵🇱' },
  { value: 'lt', native: 'Lietuvių', en: 'Lithuanian', zh: '立陶宛语', family: 'indo-european', flag: '🇱🇹' },
  { value: 'nb', native: 'Norsk Bokmål', en: 'Norwegian Bokmål', zh: '挪威语（博克马尔语）', family: 'indo-european', flag: '🇳🇴' },
  { value: 'nn', native: 'Norsk Nynorsk', en: 'Norwegian Nynorsk', zh: '挪威尼诺斯克语', family: 'indo-european', flag: '🇳🇴' },
  { value: 'fa', native: 'فارسی', en: 'Persian', zh: '波斯语', family: 'indo-european', flag: '🇮🇷' },
  { value: 'sl', native: 'Slovenščina', en: 'Slovenian', zh: '斯洛文尼亚语', family: 'indo-european', flag: '🇸🇮' },
  { value: 'gu', native: 'ગુજરાતી', en: 'Gujarati', zh: '古吉拉特语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'lv', native: 'Latviešu', en: 'Latvian', zh: '拉脱维亚语', family: 'indo-european', flag: '🇱🇻' },
  { value: 'it', native: 'Italiano', en: 'Italian', zh: '意大利语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'oc', native: 'Occitan', en: 'Occitan', zh: '奥克语', family: 'indo-european', flag: '🇫🇷' },
  { value: 'ne', native: 'नेपाली', en: 'Nepali', zh: '尼泊尔语', family: 'indo-european', flag: '🇳🇵' },
  { value: 'mr', native: 'मराठी', en: 'Marathi', zh: '马拉地语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'be', native: 'Беларуская', en: 'Belarusian', zh: '白俄罗斯语', family: 'indo-european', flag: '🇧🇾' },
  { value: 'sr', native: 'Српски', en: 'Serbian', zh: '塞尔维亚语', family: 'indo-european', flag: '🇷🇸' },
  { value: 'lb', native: 'Lëtzebuergesch', en: 'Luxembourgish', zh: '卢森堡语', family: 'indo-european', flag: '🇱🇺' },
  { value: 'vec', native: 'Vèneto', en: 'Venetian', zh: '威尼斯语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'as', native: 'অসমীয়া', en: 'Assamese', zh: '阿萨姆语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'cy', native: 'Cymraeg', en: 'Welsh', zh: '威尔士语', family: 'indo-european', flag: '🇬🇧' },
  { value: 'szl', native: 'Ślōnski', en: 'Silesian', zh: '西里西亚语', family: 'indo-european', flag: '🇵🇱' },
  { value: 'ast', native: 'Asturianu', en: 'Asturian', zh: '阿斯图里亚语', family: 'indo-european', flag: '🇪🇸' },
  { value: 'hne', native: 'छत्तीसगढ़ी', en: 'Chhattisgarhi', zh: '恰蒂斯加尔语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'awa', native: 'अवधी', en: 'Awadhi', zh: '阿瓦德语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'mai', native: 'मैथिली', en: 'Maithili', zh: '迈蒂利语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bho', native: 'भोजपुरी', en: 'Bhojpuri', zh: '博杰普尔语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'sd', native: 'سنڌي', en: 'Sindhi', zh: '信德语', family: 'indo-european', flag: '🇵🇰' },
  { value: 'ga', native: 'Gaeilge', en: 'Irish', zh: '爱尔兰语', family: 'indo-european', flag: '🇮🇪' },
  { value: 'fo', native: 'Føroyskt', en: 'Faroese', zh: '法罗语', family: 'indo-european', flag: '🇫🇴' },
  { value: 'hi', native: 'हिन्दी', en: 'Hindi', zh: '印地语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'pa', native: 'ਪੰਜਾਬੀ', en: 'Punjabi', zh: '旁遮普语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bn', native: 'বাংলা', en: 'Bengali', zh: '孟加拉语', family: 'indo-european', flag: '🇧🇩' },
  { value: 'or', native: 'ଓଡ଼ିଆ', en: 'Odia', zh: '奥里亚语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'tg', native: 'Тоҷикӣ', en: 'Tajik', zh: '塔吉克语', family: 'indo-european', flag: '🇹🇯' },
  { value: 'yi', native: 'ייִדיש', en: 'Yiddish (Eastern)', zh: '东意第绪语', family: 'indo-european', flag: '🇮🇱' },
  { value: 'lmo', native: 'Lombard', en: 'Lombard', zh: '伦巴第语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'lij', native: 'Lìgure', en: 'Ligurian', zh: '利古里亚语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'scn', native: 'Sicilianu', en: 'Sicilian', zh: '西西里语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'fur', native: 'Furlan', en: 'Friulian', zh: '弗留利语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'sc', native: 'Sardu', en: 'Sardinian', zh: '撒丁岛语', family: 'indo-european', flag: '🇮🇹' },
  { value: 'gl', native: 'Galego', en: 'Galician', zh: '加利西亚语', family: 'indo-european', flag: '🇪🇸' },
  { value: 'ca', native: 'Català', en: 'Catalan', zh: '加泰罗尼亚语', family: 'indo-european', flag: '🇪🇸' },
  { value: 'is', native: 'Íslenska', en: 'Icelandic', zh: '冰岛语', family: 'indo-european', flag: '🇮🇸' },
  { value: 'als', native: 'Toskërisht', en: 'Tosk', zh: '托斯克语', family: 'indo-european', flag: '🇦🇱' },
  { value: 'sq', native: 'Shqip', en: 'Albanian', zh: '阿尔巴尼亚语', family: 'indo-european', flag: '🇦🇱' },
  { value: 'li', native: 'Limburgs', en: 'Limburgish', zh: '林堡语', family: 'indo-european', flag: '🇳🇱' },
  { value: 'prs', native: 'دری', en: 'Dari', zh: '达里语', family: 'indo-european', flag: '🇦🇫' },
  { value: 'af', native: 'Afrikaans', en: 'Afrikaans', zh: '南非荷兰语', family: 'indo-european', flag: '🇿🇦' },
  { value: 'mk', native: 'Македонски', en: 'Macedonian', zh: '马其顿语', family: 'indo-european', flag: '🇲🇰' },
  { value: 'si', native: 'සිංහල', en: 'Sinhala', zh: '僧伽罗语', family: 'indo-european', flag: '🇱🇰' },
  { value: 'ur', native: 'اردو', en: 'Urdu', zh: '乌尔都语', family: 'indo-european', flag: '🇵🇰' },
  { value: 'mag', native: 'मगही', en: 'Magahi', zh: '马加希语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bs', native: 'Bosanski', en: 'Bosnian', zh: '波斯尼亚语', family: 'indo-european', flag: '🇧🇦' },
  { value: 'hy', native: 'Հայերեն', en: 'Armenian', zh: '亚美尼亚语', family: 'indo-european', flag: '🇦🇲' },
  { value: 'ltg', native: 'latgalīšu', en: 'Latgalian', zh: '拉特加利亚语', family: 'indo-european', flag: '🇱🇻' },
  { value: 'gd', native: 'Gàidhlig', en: 'Scottish Gaelic', zh: '苏格兰盖尔语', family: 'indo-european', flag: '🇬🇧' },
  { value: 'ckb', native: 'کوردی ناوەندی', en: 'Central Kurdish', zh: '中库尔德语', family: 'indo-european', flag: '🇮🇶' },
  { value: 'kmr', native: 'Kurmancî', en: 'Northern Kurdish', zh: '北库尔德语', family: 'indo-european', flag: '🇹🇷' },
  { value: 'pbt', native: 'پښتو', en: 'Southern Pashto', zh: '南普什图语', family: 'indo-european', flag: '🇦🇫' },
  { value: 'sa', native: 'संस्कृतम्', en: 'Sanskrit', zh: '梵语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'dnd', native: 'ढूंढाड़ी', en: 'Dhundari', zh: '敦达里语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'mwr', native: 'मारवाड़ी', en: 'Marwari', zh: '马尔瓦里语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'ahr', native: 'अहिराणी', en: 'Ahirani', zh: '阿希拉尼语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bfy', native: 'बाघेली', en: 'Bagheli', zh: '巴盖利语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bgq', native: 'बागड़ी', en: 'Bagri', zh: '巴格里语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bns', native: 'बुंदेली', en: 'Bundeli', zh: '本德利语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'bra', native: 'ब्रज भाषा', en: 'Braj', zh: '布拉吉语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'kfy', native: 'कुमाऊंनी', en: 'Kumaoni', zh: '库马翁语', family: 'indo-european', flag: '🇮🇳' },
  { value: 'ks', native: 'कॉशुर', en: 'Kashmiri', zh: '克什米尔语', family: 'indo-european', flag: '🇮🇳' },

  // ── 汉藏语系 Sino-Tibetan ──
  { value: 'zh', native: '简体中文', en: 'Chinese (Simplified)', zh: '简体中文', family: 'sino-tibetan', flag: '🇨🇳' },
  { value: 'zh-TW', native: '繁體中文', en: 'Chinese (Traditional)', zh: '繁体中文', family: 'sino-tibetan', flag: '🇹🇼' },
  { value: 'yue', native: '粵語', en: 'Cantonese', zh: '粤语', family: 'sino-tibetan', flag: '🇭🇰' },
  { value: 'my', native: 'မြန်မာ', en: 'Burmese', zh: '缅甸语', family: 'sino-tibetan', flag: '🇲🇲' },
  { value: 'bo', native: 'བོད་སྐད', en: 'Tibetan', zh: '藏语', family: 'sino-tibetan', flag: '🇨🇳' },
  { value: 'mni', native: 'ꯃꯩꯇꯩꯂꯣꯟ', en: 'Meitei', zh: '梅泰语', family: 'sino-tibetan', flag: '🇮🇳' },

  // ── 亚非语系 Afro-Asiatic ──
  { value: 'ar', native: 'العربية', en: 'Arabic (Standard)', zh: '阿拉伯语（标准语）', family: 'afro-asiatic', flag: '🇸🇦' },
  { value: 'ars', native: 'نجدي', en: 'Arabic (Najdi)', zh: '阿拉伯语（内志语）', family: 'afro-asiatic', flag: '🇸🇦' },
  { value: 'apc', native: 'شامي', en: 'Arabic (Levantine)', zh: '阿拉伯语（黎凡特语）', family: 'afro-asiatic', flag: '🇱🇧' },
  { value: 'arz', native: 'مصري', en: 'Arabic (Egyptian)', zh: '阿拉伯语（埃及语）', family: 'afro-asiatic', flag: '🇪🇬' },
  { value: 'ary', native: 'الدارجة', en: 'Arabic (Moroccan)', zh: '阿拉伯语（摩洛哥语）', family: 'afro-asiatic', flag: '🇲🇦' },
  { value: 'acm', native: 'العراقية', en: 'Arabic (Mesopotamian)', zh: '阿拉伯语（美索不达米亚语）', family: 'afro-asiatic', flag: '🇮🇶' },
  { value: 'acq', native: 'يمني', en: "Arabic (Ta'izzi-Adeni)", zh: '阿拉伯语（塔伊兹-阿德尼语）', family: 'afro-asiatic', flag: '🇾🇪' },
  { value: 'aeb', native: 'تونسي', en: 'Arabic (Tunisian)', zh: '阿拉伯语（突尼斯语）', family: 'afro-asiatic', flag: '🇹🇳' },
  { value: 'afb', native: 'خليجي', en: 'Arabic (Gulf)', zh: '阿拉伯语（海湾语）', family: 'afro-asiatic', flag: '🇦🇪' },
  { value: 'arq', native: 'جزائري', en: 'Arabic (Algerian)', zh: '阿拉伯语（阿尔及利亚语）', family: 'afro-asiatic', flag: '🇩🇿' },
  { value: 'apd', native: 'سوداني', en: 'Arabic (Sudanese)', zh: '阿拉伯语（苏丹语）', family: 'afro-asiatic', flag: '🇸🇩' },
  { value: 'ayl', native: 'ليبي', en: 'Arabic (Libyan)', zh: '阿拉伯语（利比亚语）', family: 'afro-asiatic', flag: '🇱🇾' },
  { value: 'he', native: 'עברית', en: 'Hebrew', zh: '希伯来语', family: 'afro-asiatic', flag: '🇮🇱' },
  { value: 'mt', native: 'Malti', en: 'Maltese', zh: '马耳他语', family: 'afro-asiatic', flag: '🇲🇹' },
  { value: 'am', native: 'አማርኛ', en: 'Amharic', zh: '阿姆哈拉语', family: 'afro-asiatic', flag: '🇪🇹' },
  { value: 'ti', native: 'ትግርኛ', en: 'Tigrinya', zh: '提格里尼亚语', family: 'afro-asiatic', flag: '🇪🇷' },
  { value: 'kab', native: 'ⵜⴰⵇⴱⴰⵢⵍⵉⵜ', en: 'Kabyle', zh: '卡比尔语', family: 'afro-asiatic', flag: '🇩🇿' },
  { value: 'so', native: 'Soomaali', en: 'Somali', zh: '索马里语', family: 'afro-asiatic', flag: '🇸🇴' },
  { value: 'gaz', native: 'Afaan Oromoo', en: 'West Central Oromo', zh: '西中奥罗莫语', family: 'afro-asiatic', flag: '🇪🇹' },
  { value: 'ha', native: 'Hausa', en: 'Hausa', zh: '豪萨语', family: 'afro-asiatic', flag: '🇳🇬' },

  // ── 南岛语系 Austronesian ──
  { value: 'id', native: 'Bahasa Indonesia', en: 'Indonesian', zh: '印度尼西亚语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'ms', native: 'Bahasa Melayu', en: 'Malay', zh: '马来语', family: 'austronesian', flag: '🇲🇾' },
  { value: 'tl', native: 'Tagalog', en: 'Tagalog', zh: '他加禄语', family: 'austronesian', flag: '🇵🇭' },
  { value: 'ceb', native: 'Cebuano', en: 'Cebuano', zh: '宿务语', family: 'austronesian', flag: '🇵🇭' },
  { value: 'jv', native: 'Basa Jawa', en: 'Javanese', zh: '爪哇语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'su', native: 'Basa Sunda', en: 'Sundanese', zh: '巽他语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'min', native: 'Baso Minangkabau', en: 'Minangkabau', zh: '米南加保语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'ban', native: 'Basa Bali', en: 'Balinese', zh: '巴厘岛语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'bjn', native: 'Bahasa Banjar', en: 'Banjar', zh: '班加语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'pag', native: 'Pangasinan', en: 'Pangasinan', zh: '邦阿西楠语', family: 'austronesian', flag: '🇵🇭' },
  { value: 'ilo', native: 'Ilokano', en: 'Ilokano', zh: '伊洛科语', family: 'austronesian', flag: '🇵🇭' },
  { value: 'war', native: 'Waray', en: 'Waray (Philippines)', zh: '瓦雷语（菲律宾）', family: 'austronesian', flag: '🇵🇭' },
  { value: 'plt', native: 'Malagasy', en: 'Plateau Malagasy', zh: '高原马达加斯加语', family: 'austronesian', flag: '🇲🇬' },
  { value: 'mg', native: 'Malagasy', en: 'Malagasy', zh: '马达加斯加语', family: 'austronesian', flag: '🇲🇬' },
  { value: 'bug', native: 'Basa Ugi', en: 'Buginese', zh: '布吉语', family: 'austronesian', flag: '🇮🇩' },
  { value: 'mi', native: 'Te Reo Māori', en: 'Maori', zh: '毛利语', family: 'austronesian', flag: '🇳🇿' },
  { value: 'sm', native: 'Gagana Sāmoa', en: 'Samoan', zh: '萨摩亚语', family: 'austronesian', flag: '🇼🇸' },
  { value: 'haw', native: 'ʻŌlelo Hawaiʻi', en: 'Hawaiian', zh: '夏威夷语', family: 'austronesian', flag: '🇺🇸' },
  { value: 'fj', native: 'Vosa Vakaviti', en: 'Fijian', zh: '斐济语', family: 'austronesian', flag: '🇫🇯' },

  // ── 德拉威语 Dravidian ──
  { value: 'ta', native: 'தமிழ்', en: 'Tamil', zh: '泰米尔语', family: 'dravidian', flag: '🇮🇳' },
  { value: 'te', native: 'తెలుగు', en: 'Telugu', zh: '泰卢固语', family: 'dravidian', flag: '🇮🇳' },
  { value: 'kn', native: 'ಕನ್ನಡ', en: 'Kannada', zh: '卡纳达语', family: 'dravidian', flag: '🇮🇳' },
  { value: 'ml', native: 'മലയാളം', en: 'Malayalam', zh: '马拉雅拉姆语', family: 'dravidian', flag: '🇮🇳' },

  // ── 突厥语系 Turkic ──
  { value: 'tr', native: 'Türkçe', en: 'Turkish', zh: '土耳其语', family: 'turkic', flag: '🇹🇷' },
  { value: 'az', native: 'Azərbaycan', en: 'North Azerbaijani', zh: '北阿塞拜疆语', family: 'turkic', flag: '🇦🇿' },
  { value: 'uz', native: 'Oʻzbek', en: 'North Uzbek', zh: '北乌兹别克语', family: 'turkic', flag: '🇺🇿' },
  { value: 'kk', native: 'Қазақ', en: 'Kazakh', zh: '哈萨克语', family: 'turkic', flag: '🇰🇿' },
  { value: 'ba', native: 'Башҡорт', en: 'Bashkir', zh: '巴什基尔语', family: 'turkic', flag: '🇷🇺' },
  { value: 'tt', native: 'Татар', en: 'Tatar', zh: '鞑靼语', family: 'turkic', flag: '🇷🇺' },
  { value: 'crh', native: 'Qırımtatarca', en: 'Crimean Tatar', zh: '克里米亚鞑靼语', family: 'turkic', flag: '🇺🇦' },
  { value: 'ky', native: 'Кыргызча', en: 'Kyrgyz', zh: '吉尔吉斯语', family: 'turkic', flag: '🇰🇬' },
  { value: 'tk', native: 'Türkmen', en: 'Turkmen', zh: '土库曼语', family: 'turkic', flag: '🇹🇲' },
  { value: 'ug', native: 'ئۇيغۇر', en: 'Uyghur', zh: '维吾尔语', family: 'turkic', flag: '🇨🇳' },

  // ── 壮侗语系 Tai-Kadai ──
  { value: 'th', native: 'ไทย', en: 'Thai', zh: '泰语', family: 'tai-kadai', flag: '🇹🇭' },
  { value: 'lo', native: 'ລາວ', en: 'Lao', zh: '老挝语', family: 'tai-kadai', flag: '🇱🇦' },
  { value: 'shn', native: 'ၵႂၢမ်းတႆး', en: 'Shan', zh: '掸语', family: 'tai-kadai', flag: '🇲🇲' },

  // ── 乌拉尔语系 Uralic ──
  { value: 'fi', native: 'Suomi', en: 'Finnish', zh: '芬兰语', family: 'uralic', flag: '🇫🇮' },
  { value: 'et', native: 'Eesti', en: 'Estonian', zh: '爱沙尼亚语', family: 'uralic', flag: '🇪🇪' },
  { value: 'hu', native: 'Magyar', en: 'Hungarian', zh: '匈牙利语', family: 'uralic', flag: '🇭🇺' },
  { value: 'mhr', native: 'олык марий', en: 'Eastern Meadow Mari', zh: '草原马里语', family: 'uralic', flag: '🇷🇺' },

  // ── 南亚语系 Austroasiatic ──
  { value: 'vi', native: 'Tiếng Việt', en: 'Vietnamese', zh: '越南语', family: 'austroasiatic', flag: '🇻🇳' },
  { value: 'km', native: 'ភាសាខ្មែរ', en: 'Khmer', zh: '高棉语', family: 'austroasiatic', flag: '🇰🇭' },

  // ── 尼日尔-刚果语系 Niger-Congo ──
  { value: 'yo', native: 'Èdè Yorùbá', en: 'Yoruba', zh: '约鲁巴语', family: 'niger-congo', flag: '🇳🇬' },
  { value: 'ee', native: 'Eʋegbe', en: 'Ewe', zh: '埃维语', family: 'niger-congo', flag: '🇬🇭' },
  { value: 'rw', native: 'Kinyarwanda', en: 'Kinyarwanda', zh: '卢旺达语', family: 'niger-congo', flag: '🇷🇼' },
  { value: 'ln', native: 'Lingála', en: 'Lingala', zh: '林加拉语', family: 'niger-congo', flag: '🇨🇩' },
  { value: 'nso', native: 'Sepedi', en: 'Northern Sotho', zh: '北索托语', family: 'niger-congo', flag: '🇿🇦' },
  { value: 'ny', native: 'Chichewa', en: 'Nyanja', zh: '尼扬贾语', family: 'niger-congo', flag: '🇲🇼' },
  { value: 'sn', native: 'chiShona', en: 'Shona', zh: '绍纳语', family: 'niger-congo', flag: '🇿🇼' },
  { value: 'st', native: 'Sesotho', en: 'Southern Sotho', zh: '南索托语', family: 'niger-congo', flag: '🇱🇸' },
  { value: 'tn', native: 'Setswana', en: 'Tswana', zh: '茨瓦纳语', family: 'niger-congo', flag: '🇧🇼' },
  { value: 'xh', native: 'isiXhosa', en: 'Xhosa', zh: '科萨语', family: 'niger-congo', flag: '🇿🇦' },
  { value: 'zu', native: 'isiZulu', en: 'Zulu', zh: '祖鲁语', family: 'niger-congo', flag: '🇿🇦' },
  { value: 'lg', native: 'Luganda', en: 'Luganda', zh: '卢干达语', family: 'niger-congo', flag: '🇺🇬' },
  { value: 'ss', native: 'siSwati', en: 'Swati', zh: '斯瓦蒂语', family: 'niger-congo', flag: '🇸🇿' },
  { value: 'ts', native: 'Xitsonga', en: 'Tsonga', zh: '聪加语', family: 'niger-congo', flag: '🇲🇿' },
  { value: 'tum', native: 'chiTumbuka', en: 'Tumbuka', zh: '通布卡语', family: 'niger-congo', flag: '🇲🇼' },
  { value: 've', native: 'Tshivenḓa', en: 'Venda', zh: '文达语', family: 'niger-congo', flag: '🇿🇦' },
  { value: 'cjk', native: 'Cokwe', en: 'Chokwe', zh: '乔奎语', family: 'niger-congo', flag: '🇦🇴' },
  { value: 'lua', native: 'Tshiluba', en: 'Luba-Kasai', zh: '卢巴-卡赛语', family: 'niger-congo', flag: '🇨🇩' },
  { value: 'rn', native: 'Ikirundi', en: 'Kirundi', zh: '隆迪语', family: 'niger-congo', flag: '🇧🇮' },
  { value: 'kmb', native: 'Kimbundu', en: 'Kimbundu', zh: '姆本杜语', family: 'niger-congo', flag: '🇦🇴' },
  { value: 'ki', native: 'Gĩkũyũ', en: 'Kikuyu', zh: '基库尤语', family: 'niger-congo', flag: '🇰🇪' },
  { value: 'kg', native: 'Kikongo', en: 'Kongo', zh: '刚果语', family: 'niger-congo', flag: '🇨🇩' },
  { value: 'fuv', native: 'Fulfulde', en: 'Nigerian Fulfulde', zh: '尼日利亚富拉语', family: 'niger-congo', flag: '🇳🇬' },
  { value: 'wo', native: 'Wolof', en: 'Wolof', zh: '沃洛夫语', family: 'niger-congo', flag: '🇸🇳' },
  { value: 'fon', native: 'Fɔngbè', en: 'Fon', zh: '丰语', family: 'niger-congo', flag: '🇧🇯' },
  { value: 'kbp', native: 'Kabɩyɩ', en: 'Kabiye', zh: '卡比耶语', family: 'niger-congo', flag: '🇹🇬' },
  { value: 'mos', native: 'Mõoré', en: 'Mossi', zh: '莫西语', family: 'niger-congo', flag: '🇧🇫' },
  { value: 'ak', native: 'Akan', en: 'Akan', zh: '阿坎语', family: 'niger-congo', flag: '🇬🇭' },
  { value: 'tw', native: 'Twi', en: 'Twi', zh: '特维语', family: 'niger-congo', flag: '🇬🇭' },
  { value: 'bm', native: 'Bamanankan', en: 'Bambara', zh: '班巴拉语', family: 'niger-congo', flag: '🇲🇱' },
  { value: 'ig', native: 'Asụsụ Igbo', en: 'Igbo', zh: '伊博语', family: 'niger-congo', flag: '🇳🇬' },

  // ── 其他 Other ──
  { value: 'ja', native: '日本語', en: 'Japanese', zh: '日语', family: 'other', flag: '🇯🇵' },
  { value: 'ko', native: '한국어', en: 'Korean', zh: '韩语', family: 'other', flag: '🇰🇷' },
  { value: 'ka', native: 'ქართული', en: 'Georgian', zh: '格鲁吉亚语', family: 'other', flag: '🇬🇪' },
  { value: 'eu', native: 'Euskara', en: 'Basque', zh: '巴斯克语', family: 'other', flag: '🇪🇸' },
  { value: 'ht', native: 'Kreyòl Ayisyen', en: 'Haitian Creole', zh: '海地语', family: 'other', flag: '🇭🇹' },
  { value: 'pap', native: 'Papiamentu', en: 'Papiamento', zh: '帕皮阿门托语', family: 'other', flag: '🇦🇼' },
  { value: 'kea', native: 'Kabuverdianu', en: 'Kabuverdianu', zh: '卡布维尔迪亚努语', family: 'other', flag: '🇨🇻' },
  { value: 'tpi', native: 'Tok Pisin', en: 'Tok Pisin', zh: '托克皮辛语', family: 'other', flag: '🇵🇬' },
  { value: 'sw', native: 'Kiswahili', en: 'Swahili', zh: '斯瓦希里语', family: 'other', flag: '🇰🇪' },
  { value: 'ayr', native: 'Aymar aru', en: 'Central Aymara', zh: '中部艾马拉语', family: 'other', flag: '🇧🇴' },
  { value: 'tcy', native: 'ತುಳು ಬಾಸೆ', en: 'Tulu', zh: '图卢语', family: 'other', flag: '🇮🇳' },
  { value: 'nag', native: 'Naga', en: 'Nagamese', zh: '那加语', family: 'other', flag: '🇮🇳' },
  { value: 'pcm', native: 'Naijá', en: 'Nigerian Pidgin', zh: '尼日利亚皮钦语', family: 'other', flag: '🇳🇬' },
  { value: 'mfe', native: 'Morisyen', en: 'Mauritian Creole', zh: '毛里求斯克里奥尔语', family: 'other', flag: '🇲🇺' },
  { value: 'sg', native: 'Sängö', en: 'Sango', zh: '桑戈语', family: 'other', flag: '🇨🇫' },
  { value: 'quy', native: 'Runa Simi', en: 'Ayacucho Quechua', zh: '阿亚库乔克丘亚语', family: 'other', flag: '🇵🇪' },
  { value: 'khk', native: 'Монгол хэл', en: 'Halh Mongolian', zh: '喀尔喀蒙古语', family: 'other', flag: '🇲🇳' },
  { value: 'dik', native: 'Thuɔŋjäŋ', en: 'Southwestern Dinka', zh: '西南丁卡语', family: 'other', flag: '🇸🇸' },
  { value: 'nus', native: 'Naath', en: 'Nuer', zh: '努埃尔语', family: 'other', flag: '🇸🇸' },
  { value: 'gn', native: "Avañe'ẽ", en: 'Guarani', zh: '瓜拉尼语', family: 'other', flag: '🇵🇾' },
]

// 顶端常用语言（显示在「最近使用」下方）
const COMMON_LANGUAGES = ['zh', 'en', 'yue', 'fr', 'de']

const FAMILIES = {
  'sino-tibetan': 'Sino-Tibetan',
  'indo-european': 'Indo-European',
  'afro-asiatic': 'Afro-Asiatic',
  'austronesian': 'Austronesian',
  'dravidian': 'Dravidian',
  'turkic': 'Turkic',
  'tai-kadai': 'Tai-Kadai',
  'uralic': 'Uralic',
  'austroasiatic': 'Austroasiatic',
  'niger-congo': 'Niger-Congo',
  'other': 'Other',
}

const FAMILY_ORDER = [
  'sino-tibetan',
  'indo-european',
  'afro-asiatic',
  'austronesian',
  'dravidian',
  'turkic',
  'tai-kadai',
  'uralic',
  'austroasiatic',
  'niger-congo',
  'other',
]

function LanguageSelector({ value, onChange, uiLang, inputMode, recentLanguages, compact, t }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState({})
  const containerRef = useRef(null)
  const searchRef = useRef(null)

  const showAuto = inputMode === 'direct'
  const isAuto = value === 'auto'
  const recentLimit = showAuto ? 5 : 5

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    const handleEscape = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus()
  }, [open])

  const selectedLang = isAuto ? null : LANGUAGES.find((l) => l.value === value)

  const getLabel = (lang) => uiLang === 'zh' ? lang.zh : lang.en

  const getSecondary = (lang) => {
    const primary = getLabel(lang)
    return lang.native !== primary ? lang.native : null
  }

  const recentLangs = (recentLanguages || [])
    .filter(code => code !== 'auto')
    .map(code => LANGUAGES.find(l => l.value === code))
    .filter(Boolean)
    .slice(0, recentLimit)

  // 顶端常用语言：排除已在「最近使用」中出现的，避免重复
  const recentCodes = new Set((recentLanguages || []).filter(c => c !== 'auto'))
  const commonLangs = COMMON_LANGUAGES
    .map(code => LANGUAGES.find(l => l.value === code))
    .filter(Boolean)
    .filter(l => !recentCodes.has(l.value))

  const filteredLanguages = LANGUAGES.filter((l) => {
    if (!search) return true
    const s = search.toLowerCase()
    return l.native.toLowerCase().includes(s) || l.en.toLowerCase().includes(s) || l.zh.includes(search) || l.value.toLowerCase().includes(s)
  })

  const groupedLanguages = FAMILY_ORDER.reduce((acc, family) => {
    const langs = filteredLanguages.filter((l) => l.family === family)
    if (langs.length > 0) acc[family] = langs
    return acc
  }, {})

  const toggleFamily = (family) => setCollapsed((prev) => ({ ...prev, [family]: !prev[family] }))

  const handleSelect = (langValue) => {
    onChange(langValue)
    setOpen(false)
    setSearch('')
  }

  const autoLabel = t.autoDetect || '自动检测'

  const currentLabel = isAuto ? autoLabel : selectedLang ? getLabel(selectedLang) : value
  const nativeLabel = isAuto ? null : selectedLang ? selectedLang.native : null

  return (
    <div ref={containerRef} className="relative">
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-base font-bold text-ink-700 hover:text-ink-900 transition-colors"
        >
          <span className="leading-none">
            {isAuto ? <LangIcon langCode="auto" size="md" /> : <LangIcon langCode={value} size="md" />}
          </span>
          <span className="text-ink-800">{currentLabel}</span>
          {nativeLabel && nativeLabel !== currentLabel && (
            <span className="text-xs text-ink-400">[{nativeLabel}]</span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 text-aged-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-sm border-2 transition-all duration-200 text-left group ${
            open
              ? 'border-amber-200 bg-amber-50 shadow-[0_0_0_3px_rgba(245,158,11,0.06)]'
              : 'border-aged-200 bg-parchment-100 hover:border-aged-300 hover:shadow-retro-sm'
          }`}
        >
          {isAuto ? (
            <span className="leading-none"><LangIcon langCode="auto" size="md" /></span>
          ) : (
            <span className="leading-none"><LangIcon langCode={value} size="md" /></span>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm font-bold text-ink-800">
              {isAuto ? autoLabel : selectedLang ? getLabel(selectedLang) : value}
            </span>
            {!isAuto && selectedLang && getSecondary(selectedLang) && (
              <span className="text-xs text-ink-400 ml-2">{getSecondary(selectedLang)}</span>
            )}
            {isAuto && (
              <span className="text-xs text-ink-400 ml-2">
                <Zap className="w-3 h-3 inline -mt-0.5" />
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-aged-300 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-50 mt-2 bg-parchment-50 rounded-sm border-2 border-aged-200 shadow-xl shadow-ink-900/8 overflow-hidden ${compact ? 'left-0 w-72' : 'w-full'}`}
          >
            <div className="p-3 border-b border-parchment-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.searchLanguages || '搜索语言...'}
                  className="w-full pl-9 pr-8 py-2 rounded-sm bg-parchment-50 border-2 border-parchment-100 text-sm text-ink-700 placeholder-ink-400 focus:outline-none focus:border-amber-300 focus:bg-parchment-50 transition-colors"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-aged-200 transition-colors">
                    <X className="w-3.5 h-3.5 text-ink-400" />
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-72 overflow-y-auto overscroll-contain">
              {!search && (showAuto || recentLangs.length > 0) && (
                <div className="border-b border-parchment-100">
                  {showAuto && (
                    <button
                      type="button"
                      onClick={() => handleSelect('auto')}
                      className={`w-full flex items-center gap-2.5 px-5 py-2 text-sm transition-colors ${
                        isAuto ? 'bg-amber-50 text-amber-500' : 'text-ink-600 hover:bg-parchment-50'
                      }`}
                    >
                      <LangIcon langCode="auto" size="sm" />
                      <span className={isAuto ? 'font-bold' : ''}>{autoLabel}</span>
                      <span className="text-xs text-ink-400">
                        <Zap className="w-3 h-3 inline -mt-0.5" />
                      </span>
                    </button>
                  )}
                  {recentLangs.map((lang) => (
                    <button
                      key={`recent-${lang.value}`}
                      type="button"
                      onClick={() => handleSelect(lang.value)}
                      className={`w-full flex items-center gap-2.5 px-5 py-1.5 text-sm transition-colors ${
                        value === lang.value ? 'bg-amber-50 text-amber-500' : 'text-ink-600 hover:bg-parchment-50'
                      }`}
                    >
                      <LangIcon langCode={lang.value} size="sm" />
                      <span className={value === lang.value ? 'font-bold' : ''}>{getLabel(lang)}</span>
                      {getSecondary(lang) && <span className="text-xs text-ink-400">{getSecondary(lang)}</span>}
                    </button>
                  ))}
                </div>
              )}

              {!search && commonLangs.length > 0 && (
                <div className="border-b border-parchment-100">
                  <div className="px-5 pt-2 pb-1 text-[11px] font-bold text-ink-500 uppercase tracking-wider">
                    {t.commonLanguages || '常用语言'}
                  </div>
                  {commonLangs.map((lang) => (
                    <button
                      key={`common-${lang.value}`}
                      type="button"
                      onClick={() => handleSelect(lang.value)}
                      className={`w-full flex items-center gap-2.5 px-5 py-1.5 text-sm transition-colors ${
                        value === lang.value ? 'bg-amber-50 text-amber-500' : 'text-ink-600 hover:bg-parchment-50'
                      }`}
                    >
                      <LangIcon langCode={lang.value} size="sm" />
                      <span className={value === lang.value ? 'font-bold' : ''}>{getLabel(lang)}</span>
                      {getSecondary(lang) && <span className="text-xs text-ink-400">{getSecondary(lang)}</span>}
                    </button>
                  ))}
                </div>
              )}

              {Object.keys(groupedLanguages).length === 0 && (
                <div className="py-8 text-center text-sm text-ink-400">
                  {t.noLanguagesFound || '未找到语言'}
                </div>
              )}
              {FAMILY_ORDER.map((family) => {
                const langs = groupedLanguages[family]
                if (!langs) return null
                const isCollapsed = !search && collapsed[family]
                return (
                  <div key={family}>
                    <button
                      type="button"
                      onClick={() => toggleFamily(family)}
                      className="w-full flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-ink-500 uppercase tracking-wider hover:bg-parchment-50 transition-colors"
                    >
                      {isCollapsed ? <ChevronRight className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
                      <span>{FAMILIES[family]}</span>
                      <span className="text-aged-300 font-normal normal-case tracking-normal">{langs.length}</span>
                    </button>
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden"
                        >
                          {langs.map((lang) => (
                            <button
                              key={lang.value}
                              type="button"
                              onClick={() => handleSelect(lang.value)}
                              className={`w-full flex items-center gap-2.5 px-5 py-1.5 text-sm transition-colors ${
                                value === lang.value ? 'bg-amber-50 text-amber-500' : 'text-ink-600 hover:bg-parchment-50'
                              }`}
                            >
                              <LangIcon langCode={lang.value} size="sm" />
                              <span className={value === lang.value ? 'font-bold' : ''}>{getLabel(lang)}</span>
                              {getSecondary(lang) && <span className="text-xs text-ink-400">{getSecondary(lang)}</span>}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function FrogLogo({ size = 40 }) {
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
  )
}

const MODES = [
  { key: 'direct', icon: PenLine, color: 'amber' },
  { key: 'translate', icon: Languages, color: 'blue' },
  { key: 'generate', icon: Wand2, color: 'violet' },
]

function ModeSelector({ mode, setMode, t }) {
  return (
    <div className="flex gap-0.5">
      {MODES.map(({ key, icon: Icon, color }) => {
        const isActive = mode === key
        const labelMap = { direct: t.modeDirect, translate: t.modeTranslate, generate: t.modeGenerate }
        return (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-sm text-xs font-bold transition-all duration-200 ${
              isActive ? 'bg-parchment-200/80 text-ink-700' : 'text-ink-400 hover:text-ink-500 hover:bg-parchment-100'
            }`}
          >
            <Icon className="w-3 h-3" />
            <span>{labelMap[key]}</span>
          </button>
        )
      })}
    </div>
  )
}

function InputStep({ text, setText, sourceLang, setSourceLang, uiLang, loading, onProcess, t, inputMode, setInputMode, recentLanguages }) {
  const navigate = useNavigate()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  // ponytail: 复用 auth.getQuota() 显示额度（与 AccountMenu 同源），移动端在发送箭头左侧展示
  const [quota, setQuota] = useState(() => auth.getQuota())
  useEffect(() => {
    const refresh = () => { const q = auth.getQuota(); if (q) setQuota(q) }
    refresh()
    const interval = setInterval(refresh, 30000)
    return () => clearInterval(interval)
  }, [])
  // 记住直接输入模式的语言选择，默认 auto
  const directModeLangRef = useRef('auto')
  // 记住非直接输入模式（翻译/生成）的语言选择
  const nonDirectModeLangRef = useRef(null)

  // 当 recentLanguages 加载后，初始化 nonDirectModeLangRef
  // 排除母语（uiLang），因为翻译/生成模式的学习语言不应默认为母语
  useEffect(() => {
    if (!nonDirectModeLangRef.current && recentLanguages?.length) {
      const lastLang = recentLanguages.find(l => l !== 'auto' && l !== uiLang)
      if (lastLang) nonDirectModeLangRef.current = lastLang
    }
  }, [recentLanguages, uiLang])

  const handleSourceLangChange = (lang) => {
    setSourceLang(lang)
    if (inputMode === 'direct') {
      directModeLangRef.current = lang
    } else {
      nonDirectModeLangRef.current = lang
    }
  }

  const handleModeChange = (newMode) => {
    const prevMode = inputMode
    setInputMode(newMode)
    if (newMode === 'direct') {
      // 切到直接输入模式：恢复该模式记住的语言（可能是 auto）
      setSourceLang(directModeLangRef.current)
    } else if (prevMode === 'direct' && directModeLangRef.current === 'auto') {
      // 从直接输入（auto）切到翻译/生成：恢复之前非直接模式选的语言，或用最近语言（排除母语）
      const lang = nonDirectModeLangRef.current || (recentLanguages || []).find(l => l !== 'auto' && l !== uiLang) || 'en'
      setSourceLang(lang)
    } else if (prevMode === 'direct') {
      // 从直接输入（非auto）切到翻译/生成：保持当前选的语言
      // 同时更新 nonDirectModeLangRef 以便下次切换回来时使用
      nonDirectModeLangRef.current = directModeLangRef.current
    }
    // 翻译↔生成切换：语言不变
  }
  const getPlaceholder = () => {
    if (inputMode === 'translate') return t.modeTranslatePlaceholder
    if (inputMode === 'generate') return t.modeGeneratePlaceholder
    return t.modeDirectPlaceholder
  }

  const available = quota?.available ?? 0
  const max = quota?.tier_max ?? quota?.max ?? 200
  const isUnlimited = max === -1
  const isLow = !isUnlimited && typeof available === 'number' && available <= 10

  // ponytail: 移动端布局 — 顶栏(logo+标题 / 学习语言) + 搜索式输入框(额度在发送箭头左侧)
  if (!isDesktop) {
    return (
      <div className="flex flex-col w-full">
        <div className="flex items-center justify-between pt-3 px-4 gap-2">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2 cursor-pointer shrink-0"
            onClick={() => navigate('/')}
            title="返回首页"
          >
            <div className="w-9 h-9 bg-amber-400 rounded-md flex items-center justify-center shadow-retro border-2 border-amber-500">
              <FrogLogo size={22} />
            </div>
            <h1 className="text-xl font-display font-bold text-ink-800 leading-tight" style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              {t.title || '呱邻国'}
            </h1>
          </motion.div>
          <LanguageSelector compact value={sourceLang} onChange={handleSourceLangChange} uiLang={uiLang} inputMode={inputMode} recentLanguages={recentLanguages} t={t} />
        </div>

        <div className="w-full px-3 pt-3">
          <div className="relative bg-parchment-50 border-2 border-aged-200 rounded-md shadow-retro overflow-hidden">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400 z-10" />
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400 z-10" />
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400 z-10" />
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400 z-10" />
            <div className="border-b border-aged-200/60 px-3 pt-2 pb-0">
              <ModeSelector mode={inputMode} setMode={handleModeChange} t={t} />
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={getPlaceholder()}
              rows={4}
              className="w-full resize-none bg-transparent border-0 focus:ring-0 focus:outline-none px-4 py-3 text-sm text-ink-700 placeholder-ink-400 leading-relaxed"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <span className={`flex items-center gap-1 text-xs font-medium ${isLow ? 'text-rust-500' : 'text-amber-600'}`} title={t?.remainingQuota || '剩余额度'}>
                <Zap className="w-3 h-3" />
                {isUnlimited ? '∞' : `${available}/${max}`}
              </span>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onProcess}
                disabled={loading || !text.trim()}
                className={`p-2 rounded-sm transition-all duration-200 ${
                  loading || !text.trim()
                    ? 'bg-parchment-100 text-ink-400 cursor-not-allowed'
                    : 'bg-amber-500 text-white shadow-retro hover:bg-amber-500 hover:shadow-retro-lg'
                }`}
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ArrowRight className="w-4 h-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Top-left: language selector */}
      <div className="flex items-center gap-3 pt-3 px-4">
        <LanguageSelector compact value={sourceLang} onChange={handleSourceLangChange} uiLang={uiLang} inputMode={inputMode} recentLanguages={recentLanguages} t={t} />
      </div>

      {/* Center content - brand logo and tagline */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
        {/* 装饰性波点背景 */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex items-center gap-3 mb-3 cursor-pointer group relative"
          onClick={() => navigate('/')}
          title="返回首页"
        >
          <div className="w-16 h-16 bg-amber-400 rounded-md flex items-center justify-center shadow-retro border-2 border-amber-500 relative">
            <FrogLogo size={36} />
            {/* 角标装饰 */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-amber-600" />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-amber-600" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-amber-600" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-amber-600" />
          </div>
          <div>
            <h1 className="text-3xl font-display font-bold text-ink-800 leading-tight group-hover:text-amber-600 transition-colors"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>
              {t.title || '呱邻国'}
            </h1>
            <p className="text-sm text-ink-400 font-serif">{t.subtitle || 'Gualingo'}</p>
          </div>
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-sm text-ink-300 text-center max-w-md"
        >
          {t.tagline || '输入文本，开始你的语言学习之旅'}
        </motion.p>
      </div>

      {/* Bottom area - input box */}
      <div className="w-full max-w-2xl mx-auto pb-4 px-4">
        <div className="relative bg-parchment-50 border-2 border-aged-200 rounded-md shadow-retro overflow-hidden">
          {/* 角标装饰 */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-amber-400 z-10" />
          <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-amber-400 z-10" />
          <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-amber-400 z-10" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-amber-400 z-10" />
          {/* Mode tabs at top of input */}
          <div className="border-b border-aged-200/60 px-3 pt-2 pb-0">
            <ModeSelector mode={inputMode} setMode={handleModeChange} t={t} />
          </div>

          {/* Textarea area */}
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={getPlaceholder()}
              rows={4}
              className="w-full resize-none bg-transparent border-0 focus:ring-0 focus:outline-none px-4 py-3 text-sm text-ink-700 placeholder-ink-400 leading-relaxed"
            />

            {/* Submit button inside textarea, bottom-right */}
            <div className="flex items-center justify-end px-3 pb-3">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onProcess}
                disabled={loading || !text.trim()}
                className={`p-2 rounded-sm transition-all duration-200 ${
                  loading || !text.trim()
                    ? 'bg-parchment-100 text-ink-400 cursor-not-allowed'
                    : 'bg-amber-500 text-white shadow-retro hover:bg-amber-500 hover:shadow-retro-lg'
                }`}
              >
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.span key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </motion.span>
                  ) : (
                    <motion.span key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <ArrowRight className="w-4 h-4" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export { LangIcon, LANGUAGES, LANG_COLORS }
export default InputStep
