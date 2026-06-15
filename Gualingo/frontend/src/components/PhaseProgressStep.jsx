
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

function PhaseProgressStep({ units, currentUnit, phaseNumber, onUnitClick, onBack, loading, t }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto"
    >
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="btn-ghost flex items-center gap-2 px-4 py-2 mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </motion.button>

      <div className="text-center mb-8">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}
          className="text-3xl font-bold text-[#3d3929] mb-4"
        >
          {phaseNumber === 1 ? t.phase1 : t.phase2}
        </motion.h2>
        <p className="text-lg text-ink-600">
          {t.selectTokens}
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <p className="text-lg text-ink-600">{t.loading}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {units.map((unit, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                onClick={() => onUnitClick(unit.unit_id)}
                disabled={!unit.completed && index !== currentUnit}
                className={`w-full p-6 border-2 rounded-md transition-all relative ${unit.completed ? 'bg-[#faf8f0] border-[#d4c9a8] shadow-[2px_2px_0_#8b7e5e]' : index === currentUnit ? 'bg-[#faf8f0] border-[#d4a853] shadow-[2px_2px_0_#8b7e5e] hover:shadow-[2px_2px_0_#d4c9a8]' : 'bg-[#faf8f0] border-[#d4c9a8] shadow-[2px_2px_0_#d4c9a8] cursor-not-allowed opacity-50'}`}
              >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-md" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
                <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
                <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
                <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />
                <div className="relative">
                  <h3 style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }} className="text-xl font-bold text-[#3d3929] mb-2">
                    {t.unit} {unit.unit_id + 1}
                  </h3>
                  <p className="text-ink-600">{unit.sentences_count} sentences</p>
                  <div className="mt-4 text-sm font-bold">
                    {unit.completed ? (
                      <span className="text-[#d4a853]">{t.completed}</span>
                    ) : index === currentUnit ? (
                      <span className="text-[#d4a853]">{t.startLearning}</span>
                    ) : (
                      <span className="text-ink-400">{t.notStarted}</span>
                    )}
                  </div>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default PhaseProgressStep;
