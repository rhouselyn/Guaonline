import { motion } from 'framer-motion'
import { ChevronRight, Trophy, Star, Sparkles, RotateCcw, X } from 'lucide-react'

function UnitCompleteStep({ unitNumber, totalUnits, phase, onContinue, onReview, errorCount, hasWrongItems, wrongItemsCount, t, onSkipReview }) {
  const starCount = Math.max(0, 3 - Math.floor(errorCount / 3))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto relative"
    >
      {hasWrongItems && onSkipReview && (
        <motion.button
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          onClick={onSkipReview}
          className="absolute -top-2 left-0 z-10 flex items-center gap-1.5 btn-ghost text-xs border-2 border-[#d4c9a8] hover:border-[#d4a853] backdrop-blur-sm"
        >
          <X className="w-3 h-3" />
          {t.skipReview || '不想复习了'}
        </motion.button>
      )}
      <div className="relative bg-[#faf8f0] border-2 border-[#d4c9a8] rounded-md p-12 shadow-[2px_2px_0_#8b7e5e] text-center">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-md" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
        <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
        <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
        <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
          className="w-24 h-24 bg-[#faf8f0] rounded-md border-4 border-[#d4a853] flex items-center justify-center mx-auto mb-8 relative z-10"
        >
          <Trophy className="w-12 h-12 text-[#d4a853]" />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-[#3d3929] mb-4 relative z-10"
          style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}
        >
          🎉 {t.unitComplete || '单元完成！'}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-lg text-[#524d3c] mb-2 relative z-10"
        >
          {phase === 1 ? (t.phase1 || '阶段一') : (t.phase2 || '阶段二')} · {(t.unitNumberFormat || '第 {0} 单元').replace('{0}', unitNumber + 1)}
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-base text-[#524d3c] mb-8 relative z-10"
        >
          {errorCount === 0
            ? (t.perfectScore || '太棒了！全部答对，完美表现！')
            : (t.errorsMade || '答错 {0} 题，再接再厉！').replace('{0}', errorCount)}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-center gap-2 mb-8 relative z-10"
        >
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 10, delay: 0.7 + i * 0.15 }}
            >
              <Star
                className={`w-8 h-8 transition-colors ${
                  i < starCount
                    ? 'text-[#d4a853] fill-[#d4a853]'
                    : 'text-aged-300 fill-aged-300'
                }`}
              />
            </motion.div>
          ))}
        </motion.div>

        {hasWrongItems && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="mb-8 p-4 bg-[#faf8f0] border-2 border-[#d4c9a8] rounded-md relative z-10"
          >
            <div className="flex items-center gap-2 justify-center mb-2">
              <RotateCcw className="w-4 h-4 text-[#d4a853]" />
              <span className="text-[#3d3929] font-medium">{t.wrongItemReview || '错题复习'}</span>
            </div>
            <p className="text-sm text-[#524d3c]">
              {(t.wrongItemsToReview || '你有 {0} 道错题需要复习').replace('{0}', wrongItemsCount ?? errorCount)}
            </p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex items-center justify-center gap-3 relative z-10"
        >
          <Sparkles className="w-5 h-5 text-[#d4a853]" />
          <span className="text-[#524d3c] text-sm">
            {unitNumber + 1 < totalUnits
              ? (t.moreUnitsToGo || '还有 {0} 个单元等你挑战').replace('{0}', totalUnits - unitNumber - 1)
              : (t.congratsAllUnits || '恭喜完成所有单元！')}
          </span>
          <Sparkles className="w-5 h-5 text-[#d4a853]" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="mt-10 flex items-center justify-center gap-4 relative z-10"
        >
          {hasWrongItems ? (
            <motion.button
              whileHover={{ scale: 1.03, y: -3 }}
              whileTap={{ scale: 0.97, y: 0 }}
              onClick={onReview}
              className="bg-[#d4a853] text-[#3d3929] font-semibold rounded-md shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] text-lg flex items-center justify-center gap-2 px-6 py-3"
            >
              <RotateCcw className="w-5 h-5" />
              {t.startWrongItemReview || '开始错题复习'}
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.03, y: -3 }}
              whileTap={{ scale: 0.97, y: 0 }}
              onClick={onContinue}
              className="bg-[#d4a853] text-[#3d3929] font-semibold rounded-md shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] text-lg flex items-center justify-center gap-2 px-6 py-3"
            >
              {t.continueLearning || '继续学习'}
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          )}
        </motion.div>
      </div>
    </motion.div>
  )
}

export default UnitCompleteStep
