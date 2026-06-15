import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Loader2, CheckCircle2, XCircle, ChevronRight, BookOpen, Volume2, Languages } from 'lucide-react'
import { speakText } from '../utils/speech'

function SentenceQuizStep({ quizData, onNextQuestion, onBack, onComplete, loading, t, onOpenVocabList, sourceLang, onAnswer, skipListening, reviewMode, reviewIndex, wrongItemsCount }) {
  const [selectedIndices, setSelectedIndices] = useState([])
  const [isChecked, setIsChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  const stepInUnit = reviewMode ? (reviewIndex + 1) : ((quizData?.step_in_unit ?? 0) + 1)
  const listeningCountInUnit = quizData?.listening_count_in_unit ?? 0
  const rawTotalItemsInUnit = quizData?.total_items_in_unit ?? 0
  const totalItemsInUnit = reviewMode ? (wrongItemsCount ?? 0) : (skipListening ? rawTotalItemsInUnit - listeningCountInUnit : rawTotalItemsInUnit)
  const maxWords = quizData?.correct_tokens?.length ?? 0

  const autoSpeak = useCallback(() => {
    if (quizData?.original_sentence) {
      setTimeout(() => speakText(quizData.original_sentence, sourceLang), 300)
    }
  }, [quizData?.original_sentence, sourceLang])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [quizData?.original_sentence])

  useEffect(() => {
    autoSpeak()
  }, [autoSpeak])

  if (!quizData) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl mx-auto"
      >
        <div className="text-center py-16">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-ink-400" />
          <p className="text-lg text-ink-600">{t.loading}</p>
        </div>
      </motion.div>
    )
  }

  const stripPunctuation = (str) => typeof str === 'string' ? str.replace(/[，。、；：！？,.:;!?]/g, '') : str
  const displayToken = (token) => typeof token === 'string' ? token.replace(/[，。、；：！？,.:;!?]/g, '') : token

  const handleTokenClick = (tokenIndex) => {
    if (isChecked) return
    const pos = selectedIndices.indexOf(tokenIndex)
    if (pos > -1) {
      setSelectedIndices([...selectedIndices.slice(0, pos), ...selectedIndices.slice(pos + 1)])
    } else {
      setSelectedIndices([...selectedIndices, tokenIndex])
    }
  }

  const handleSelectedClick = (pos) => {
    if (isChecked) return
    setSelectedIndices([...selectedIndices.slice(0, pos), ...selectedIndices.slice(pos + 1)])
  }

  const handleCheckAnswer = () => {
    const userTokens = selectedIndices.map(i => stripPunctuation(quizData.tokens[i]))
    const correctTokens = quizData.correct_tokens.map(t => stripPunctuation(t))
    const isCorrectAnswer = JSON.stringify(userTokens) === JSON.stringify(correctTokens)
    setIsCorrect(isCorrectAnswer)
    setIsChecked(true)
    if (onAnswer) onAnswer(isCorrectAnswer)
  }

  const handleNextQuestion = () => {
    onNextQuestion()
  }

  const selectedTokens = selectedIndices.map(i => quizData.tokens[i])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto"
    >
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <motion.button
            onClick={onBack}
            className="flex items-center gap-2 btn-ghost"
            whileHover={{ scale: 1.05, x: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <ArrowLeft className="w-4 h-4" />
            {t.back}
          </motion.button>
        </div>
        <div className="flex items-center gap-3">
          {totalItemsInUnit > 0 && (
            <span className="text-sm text-ink-500 font-medium">{(t.stepProgress || '第 {0} / {1} 题').replace('{0}', stepInUnit).replace('{1}', totalItemsInUnit)}</span>
          )}
          {onOpenVocabList && (
            <motion.button
              onClick={onOpenVocabList}
              className="flex items-center gap-2 btn-ghost"
              whileHover={{ scale: 1.05, x: 2 }}
              whileTap={{ scale: 0.95 }}
            >
              <BookOpen className="w-4 h-4" />
              {t.vocabList || '单词表'}
            </motion.button>
          )}
        </div>
      </div>

      <div className="bg-[#faf8f0] border-2 border-[#d4c9a8] rounded-md p-8 shadow-[2px_2px_0_#8b7e5e] relative">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-md" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
        <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
        <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
        <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />
        <div className="relative z-10">
          <div className="text-center mb-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#d4a853]/10 text-[#d4a853] rounded-md text-sm font-medium mb-4"
              style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}
            >
              <Languages className="w-4 h-4" />
              {t.translationQuiz || '翻译题'}
            </motion.div>
            <div className="flex items-center justify-center gap-2">
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-lg text-[#3d3929]"
                style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}
              >
                {quizData.original_sentence}
              </motion.p>
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={(e) => { e.stopPropagation(); speakText(quizData.original_sentence, sourceLang) }}
                className="p-2 text-[#d4a853] hover:text-[#d4a853] hover:bg-[#d4a853]/10 rounded-md transition-colors"
              >
                <Volume2 className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          <div className="mb-8">
            <div className="p-4 border-2 border-dashed border-[#d4c9a8] rounded-md flex flex-wrap gap-2 bg-[#faf8f0]/50 relative">
              <div className="flex flex-wrap gap-2 invisible" aria-hidden="true">
                {quizData.correct_tokens.map((_, i) => (
                  <span key={`ph-${i}`} className="px-4 py-2 rounded-md text-sm font-medium">{quizData.correct_tokens[i]}</span>
                ))}
              </div>
              <div className="absolute inset-0 p-4 flex flex-wrap gap-2 items-start content-start">
                {selectedTokens.length === 0 && (
                  <span className="italic text-ink-400 pointer-events-none">{t.selectTokensHint}</span>
                )}
                <AnimatePresence mode="popLayout">
                  {selectedTokens.map((token, pos) => {
                    const isTokenCorrect = pos < quizData.correct_tokens.length &&
                      stripPunctuation(token) === stripPunctuation(quizData.correct_tokens[pos])
                    return (
                      <motion.div
                        key={`sel-${selectedIndices[pos]}`}
                        layout
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0 }}
                        transition={{ layout: { type: 'spring', stiffness: 500, damping: 35 }, opacity: { duration: 0.15 }, scale: { duration: 0.15 } }}
                        onClick={() => handleSelectedClick(pos)}
                        className={`px-4 py-2 rounded-md text-sm font-bold cursor-pointer select-none ${
                          isChecked
                            ? isCorrect
                              ? 'border-[#d4a853] bg-[#d4a853]/10 text-[#3d3929] border-2'
                              : isTokenCorrect
                                ? 'border-[#d4a853] bg-[#d4a853]/10 text-[#3d3929] border-2'
                                : 'bg-rust-50 text-rust-500 border-2 border-rust-300'
                            : 'bg-[#d4a853] text-[#3d3929] hover:bg-[#c49a48] border-2 border-[#d4a853]'
                        }`}
                      >
                        {displayToken(token)}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <div className="flex flex-wrap gap-3">
              {quizData.tokens.map((token, index) => {
                const isSelected = selectedIndices.includes(index)
                return (
                  <motion.button
                    key={`opt-${index}`}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: isSelected ? 0 : 1, scale: isSelected ? 0 : 1 }}
                    transition={{ duration: 0.15 }}
                    onClick={() => handleTokenClick(index)}
                    disabled={isSelected || isChecked}
                    className={`px-4 py-2 rounded-md text-sm font-bold select-none ${
                      isSelected
                        ? 'pointer-events-none invisible'
                        : isChecked
                          ? 'pointer-events-none text-[#524d3c] opacity-50 border-2 border-[#d4c9a8]'
                          : 'border-2 border-[#d4c9a8] text-[#524d3c] hover:border-[#d4a853] hover:bg-[#faf8f0]'
                    }`}
                  >
                    {displayToken(token)}
                  </motion.button>
                )
              })}
            </div>
          </div>

          {isChecked && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`p-5 rounded-md mb-6 ${isCorrect ? 'bg-[#d4a853]/10 border-2 border-[#d4a853]' : 'bg-rust-50 border-2 border-rust-200'}`}
            >
              <div className="flex items-center gap-3 mb-2">
                {isCorrect ? <CheckCircle2 className="w-6 h-6 text-[#d4a853]" /> : <XCircle className="w-6 h-6 text-rust-500" />}
                <span className={`font-bold text-lg ${isCorrect ? 'text-[#d4a853]' : 'text-rust-500'}`} style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{isCorrect ? t.correct : t.incorrect}</span>
              </div>
              {!isCorrect && (
                <p className="text-ink-600 font-medium">
                  {t.correctAnswer || '正确答案'}：{quizData.correct_translation || (quizData.correct_tokens ? quizData.correct_tokens.join('') : '')}
                </p>
              )}
            </motion.div>
          )}

          <div className="flex gap-4">
            {!isChecked && (
              <motion.button
                whileHover={{ scale: 1.03, y: -3, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' }}
                whileTap={{ scale: 0.97, y: 0 }}
                onClick={handleCheckAnswer}
                disabled={selectedIndices.length === 0}
                className="flex-1 py-4 bg-[#d4a853] text-[#3d3929] font-semibold rounded-md shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {t.checkAnswer}
              </motion.button>
            )}
            {isChecked && (
              <motion.button
                whileHover={{ scale: 1.03, y: -3, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' }}
                whileTap={{ scale: 0.97, y: 0 }}
                onClick={handleNextQuestion}
                disabled={loading}
                className="flex-1 py-4 bg-[#d4a853] text-[#3d3929] font-semibold rounded-md shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t.loading}
                  </>
                ) : (
                  <>
                    {t.continueLearning || '继续学习'}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default SentenceQuizStep
