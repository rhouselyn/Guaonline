
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

function PhaseProgressStep({ units, currentUnit, phaseNumber, onUnitClick, onBack, loading, t }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-3xl mx-auto dotted-bg relative"
    >
      <motion.button
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="retro-btn btn-ghost flex items-center gap-2 px-4 py-2 mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        {t.back}
      </motion.button>

      <div className="text-center mb-8">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-3xl font-bold font-serif text-ink-800 mb-4"
        >
          {phaseNumber === 1 ? t.phase1 : t.phase2}
        </motion.h2>
        <p className="text-lg text-ink-600">
          {t.selectTokens}
        </p>
        <div className="retro-divider" />
      </div>

      {loading ? (
        <div className="text-center py-16">
          <p className="text-lg text-ink-600">{t.loading}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 retro-corners">
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
                className={`w-full p-6 rounded-sm transition-all ${unit.completed ? 'retro-card bg-olive-50 border-olive-200' : index === currentUnit ? 'retro-card-highlight hover:shadow-retro-sm' : 'retro-card bg-parchment-100 cursor-not-allowed opacity-50'}`}
              >
                <h3 className="text-xl font-bold font-serif text-ink-800 mb-2">
                  {t.unit} {unit.unit_id + 1}
                </h3>
                <p className="text-ink-600">{unit.sentences_count} sentences</p>
                <div className="mt-4 text-sm font-bold">
                  {unit.completed ? (
                    <span className="retro-badge-olive">{t.completed}</span>
                  ) : index === currentUnit ? (
                    <span className="retro-badge-amber">{t.startLearning}</span>
                  ) : (
                    <span className="retro-badge-ink">{t.notStarted}</span>
                  )}
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
