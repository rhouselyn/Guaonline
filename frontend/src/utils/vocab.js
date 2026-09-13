const CJK_RANGES = [
  [0x4e00, 0x9fff],
  [0x3040, 0x309f],
  [0x30a0, 0x30ff],
  [0xac00, 0xd7af],
]

function isCJK(char) {
  const code = char.charCodeAt(0)
  return CJK_RANGES.some(([start, end]) => code >= start && code <= end)
}

function hasCJK(text) {
  if (!text) return false
  return [...text].some(c => isCJK(c))
}

// 字母索引键：CJK 词按音标（拼音/罗马字）首字母，NFD 折叠去掉声调符（ā→A）
function groupLetter(w, ipa) {
  w = w || ''
  if (hasCJK(w)) {
    const cleaned = (ipa || '').replace(/^[\/\[]+/, '').trim()
    if (cleaned) return cleaned.normalize('NFD')[0].toUpperCase()
    return w[0]
  }
  if (w.length > 0) return w[0].normalize('NFD')[0].toUpperCase()
  return '#'
}

function getGroupKey(word) {
  return groupLetter(word.word, word.ipa)
}

function groupVocab(vocab) {
  const groups = {}
  vocab.forEach(word => {
    const key = getGroupKey(word)
    if (!groups[key]) groups[key] = []
    groups[key].push(word)
  })
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

export { getGroupKey, groupLetter, groupVocab, hasCJK }
