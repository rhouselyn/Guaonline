// 语音合成 - 支持 Web Speech API 和 Edge TTS（后端 API）

const SPEECH_LANG_MAP = {
  'en': 'en-US',
  'fr': 'fr-FR',
  'pt': 'pt-BR',
  'de': 'de-DE',
  'ro': 'ro-RO',
  'sv': 'sv-SE',
  'da': 'da-DK',
  'bg': 'bg-BG',
  'ru': 'ru-RU',
  'cs': 'cs-CZ',
  'el': 'el-GR',
  'uk': 'uk-UA',
  'es': 'es-ES',
  'nl': 'nl-NL',
  'sk': 'sk-SK',
  'hr': 'hr-HR',
  'pl': 'pl-PL',
  'lt': 'lt-LT',
  'nb': 'nb-NO',
  'nn': 'nn-NO',
  'fa': 'fa-IR',
  'sl': 'sl-SI',
  'gu': 'gu-IN',
  'lv': 'lv-LV',
  'it': 'it-IT',
  'oc': 'oc-FR',
  'ne': 'ne-NP',
  'mr': 'mr-IN',
  'be': 'be-BY',
  'sr': 'sr-RS',
  'lb': 'lb-LU',
  'vec': 'it-IT',
  'as': 'as-IN',
  'cy': 'cy-GB',
  'szl': 'pl-PL',
  'ast': 'ast-ES',
  'hne': 'hi-IN',
  'awa': 'hi-IN',
  'mai': 'mai-IN',
  'bho': 'bho-IN',
  'sd': 'sd-PK',
  'ga': 'ga-IE',
  'fo': 'fo-FO',
  'hi': 'hi-IN',
  'pa': 'pa-IN',
  'bn': 'bn-IN',
  'or': 'or-IN',
  'tg': 'tg-TJ',
  'yi': 'yi-US',
  'lmo': 'it-IT',
  'lij': 'it-IT',
  'scn': 'it-IT',
  'fur': 'it-IT',
  'sc': 'sc-IT',
  'gl': 'gl-ES',
  'ca': 'ca-ES',
  'is': 'is-IS',
  'sq': 'sq-AL',
  'li': 'li-NL',
  'prs': 'fa-AF',
  'af': 'af-ZA',
  'mk': 'mk-MK',
  'si': 'si-LK',
  'ur': 'ur-PK',
  'mag': 'hi-IN',
  'bs': 'bs-BA',
  'hy': 'hy-AM',
  'zh': 'zh-CN',
  'zh-TW': 'zh-TW',
  'yue': 'zh-HK',
  'my': 'my-MM',
  'ar': 'ar-SA',
  'ars': 'ar-SA',
  'apc': 'ar-SY',
  'arz': 'ar-EG',
  'ary': 'ar-MA',
  'acm': 'ar-IQ',
  'acq': 'ar-YE',
  'aeb': 'ar-TN',
  'he': 'he-IL',
  'mt': 'mt-MT',
  'id': 'id-ID',
  'ms': 'ms-MY',
  'tl': 'tl-PH',
  'ceb': 'ceb-PH',
  'jv': 'jv-ID',
  'su': 'su-ID',
  'min': 'min-ID',
  'ban': 'ban-ID',
  'bjn': 'bjn-ID',
  'pag': 'pag-PH',
  'ilo': 'ilo-PH',
  'war': 'war-PH',
  'ta': 'ta-IN',
  'te': 'te-IN',
  'kn': 'kn-IN',
  'ml': 'ml-IN',
  'tr': 'tr-TR',
  'az': 'az-AZ',
  'uz': 'uz-UZ',
  'kk': 'kk-KZ',
  'ba': 'ba-RU',
  'tt': 'tt-RU',
  'th': 'th-TH',
  'lo': 'lo-LA',
  'fi': 'fi-FI',
  'et': 'et-EE',
  'hu': 'hu-HU',
  'vi': 'vi-VN',
  'km': 'km-KH',
  'ja': 'ja-JP',
  'ko': 'ko-KR',
  'ka': 'ka-GE',
  'eu': 'eu-ES',
  'ht': 'ht-HT',
  'pap': 'pap-AW',
  'kea': 'kea-CV',
  'tpi': 'tpi-PG',
  'sw': 'sw-KE',
}

// 当前播放状态
let currentAudio = null
let currentUtterance = null

function getTtsEngine() {
  try {
    const prefs = JSON.parse(localStorage.getItem('gualingo_preferences') || '{}')
    return prefs.tts_engine || 'edge'
  } catch {
    return 'edge'
  }
}

async function speakWithWebSpeech(text, sourceLang, slow = false) {
  if (!('speechSynthesis' in window)) {
    throw new Error('Web Speech API not supported')
  }
  return new Promise((resolve, reject) => {
    try {
      if (currentUtterance) {
        window.speechSynthesis.cancel()
      }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = SPEECH_LANG_MAP[sourceLang] || sourceLang
      u.rate = slow ? 0.7 : 1.0
      u.pitch = 1.0
      u.onend = () => resolve()
      u.onerror = (e) => reject(e)
      currentUtterance = u
      window.speechSynthesis.speak(u)
    } catch (e) {
      reject(e)
    }
  })
}

async function speakWithEdgeTTS(text, sourceLang, slow = false) {
  try {
    const lang = SPEECH_LANG_MAP[sourceLang] || sourceLang
    const url = `/api/tts/speak?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}&slow=${slow}`

    const response = await fetch(url)
    if (!response.ok) throw new Error(`TTS request failed: ${response.status}`)

    const reader = response.body.getReader()

    const mediaSource = new MediaSource()
    const audio = new Audio()
    audio.src = URL.createObjectURL(mediaSource)
    currentAudio = audio

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null
    }
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null
    }

    await new Promise((resolve, reject) => {
      mediaSource.addEventListener('sourceopen', resolve, { once: true })
      mediaSource.addEventListener('error', reject, { once: true })
    })

    const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg')
    let firstChunk = true

    sourceBuffer.addEventListener('updateend', async () => {
      try {
        const { value, done } = await reader.read()
        if (done) {
          mediaSource.endOfStream()
          return
        }
        sourceBuffer.appendBuffer(value)
      } catch (e) {
        console.warn('Edge TTS stream read error:', e)
        try { mediaSource.endOfStream() } catch (_) {}
      }
    })

    const { value, done } = await reader.read()
    if (done) {
      mediaSource.endOfStream()
      return
    }
    sourceBuffer.appendBuffer(value)

    await audio.play()
  } catch (e) {
    console.warn('Edge TTS error:', e)
    currentAudio = null
    throw e
  }
}

function warmupSpeech() {
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.getVoices()
    } catch (e) {}
  }
}

async function speakText(text, sourceLang = 'en', slow = false) {
  if (!text) return

  // 停止当前播放
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (currentUtterance && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
    currentUtterance = null
  }

  const engine = getTtsEngine()

  try {
    if (engine === 'webspeech') {
      await speakWithWebSpeech(text, sourceLang, slow)
    } else {
      await speakWithEdgeTTS(text, sourceLang, slow)
    }
  } catch (e) {
    // 如果首选引擎失败，尝试另一个
    if (engine === 'edge') {
      try {
        await speakWithWebSpeech(text, sourceLang, slow)
      } catch (_) {}
    }
  }
}

export { SPEECH_LANG_MAP as LANG_MAP, speakText, warmupSpeech, getTtsEngine }
