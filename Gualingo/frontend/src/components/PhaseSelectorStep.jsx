
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

function PhaseSelectorStep({ phases, currentFileId, onPhaseSelect, onBack, loading, t }) {
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
          {t.selectPhase}
        </motion.h2>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <p className="text-lg text-ink-600">{t.loading}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {phases.map((phase, index) => (
            <motion.div
              key={phase.phase_number}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <button
                onClick={() => onPhaseSelect(phase.phase_number)}
                className="w-full p-6 border-2 border-[#d4c9a8] bg-[#faf8f0] hover:border-[#d4a853] hover:shadow-[2px_2px_0_#d4c9a8] rounded-md shadow-[2px_2px_0_#8b7e5e] transition-all relative"
              >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none rounded-md" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
                <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
                <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
                <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />
                <div className="relative">
                  <h3 style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }} className="text-xl font-bold text-[#3d3929] mb-2">
                    {phase.phase_number === 1 ? t.phase1 : t.phase2}
                  </h3>
                  <p className="text-ink-600 mb-2">{phase.units_count} {t.unit}s</p>
                  <div className="text-sm font-bold">
                    {phase.progress.current_unit > 0 ? (
                      <span className="text-[#d4a853]">
                        已完成 {phase.progress.current_unit}/{phase.units_count} {t.unit}s
                      </span>
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

export default PhaseSelectorStep;
