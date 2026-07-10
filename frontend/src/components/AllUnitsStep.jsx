import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lock, Star, Headphones, Loader2, Home, BookOpen, PenTool, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useMediaQuery } from '../utils/useMediaQuery';

const UNITS_PER_PAGE = 30;

function AllUnitsStep({
  phase1Units,
  phase2Units,
  currentPhase1Unit,
  currentPhase2Unit,
  onPhase1UnitClick,
  onPhase2UnitClick,
  onBack,
  onHome,
  loading,
  t,
  unitStarCounts,
  skipListening,
  onSkipListeningChange,
  onlyNewWords,
  onOnlyNewWordsChange,
  generatingUnits,
  fileTitle,
  currentFileId,
  lastActiveTab,
  onTabChange
}) {
  const [activeTab, setActiveTab] = useState(lastActiveTab || 0);
  const [phase1Page, setPhase1Page] = useState(0);
  const [phase2Page, setPhase2Page] = useState(0);
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const touchState = useRef({ x: 0, y: 0, t: 0, scrolling: false });

  const switchTab = (idx) => {
    setActiveTab(idx);
    onTabChange?.(idx);
  };

  useEffect(() => {
    if (lastActiveTab !== undefined && lastActiveTab !== null) {
      setActiveTab(lastActiveTab);
    }
  }, [lastActiveTab]);

  useEffect(() => {
    if (currentPhase1Unit > 0 && phase1Units?.length > 0) {
      const targetPage = Math.floor(currentPhase1Unit / UNITS_PER_PAGE);
      setPhase1Page(targetPage);
    }
  }, []);

  useEffect(() => {
    if (currentPhase2Unit > 0 && phase2Units?.length > 0) {
      const targetPage = Math.floor(currentPhase2Unit / UNITS_PER_PAGE);
      setPhase2Page(targetPage);
    }
  }, []);

  const handleTabChange = (index) => {
    setActiveTab(index);
    onTabChange?.(index);
  };

  const isPhase1Unlocked = (index) => {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!phase1Units[i]?.completed) return false;
    }
    return true;
  };

  const isPhase2Unlocked = (index) => {
    if (index === 0) return true;
    for (let i = 0; i < index; i++) {
      if (!phase2Units[i]?.completed) return false;
    }
    return true;
  };

  const phase1Completed = phase1Units?.filter(u => u.completed).length || 0;
  const phase2Completed = phase2Units?.filter(u => u.completed).length || 0;
  const phase1Total = phase1Units?.length || 0;
  const phase2Total = phase2Units?.length || 0;

  const tabs = [
    { key: 'phase1', label: t.phase1, icon: BookOpen, completed: phase1Completed, total: phase1Total },
    { key: 'phase2', label: t.phase2, icon: PenTool, completed: phase2Completed, total: phase2Total }
  ];

  const renderUnitCard = (unit, index, onClick, keyPrefix, isUnlocked, phaseNumber) => {
    const isCompleted = unit.completed;
    const isGenerating = phaseNumber === 1 && generatingUnits?.has(index);
    const isLocked = !isUnlocked && !isCompleted;
    const isCurrent = (phaseNumber === 1 && index === currentPhase1Unit) || (phaseNumber === 2 && index === currentPhase2Unit);
    const starKey = `${phaseNumber}-${index}`;
    const starCount = unitStarCounts?.[starKey];

    return (
      <motion.button
        key={`${keyPrefix}-unit-${index}`}
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        whileHover={!isLocked ? { y: -2, transition: { duration: 0.15 } } : {}}
        whileTap={!isLocked ? { scale: 0.97 } : {}}
        onClick={isLocked ? undefined : onClick}
        disabled={isLocked}
        className={`relative flex flex-col items-center justify-center rounded-sm transition-all duration-200 ${
          isCompleted
            ? 'bg-olive-50 border-olive-200/50 hover:bg-olive-50'
            : isLocked
            ? 'bg-parchment-100 border-aged-200/30 cursor-not-allowed'
            : isCurrent
            ? 'bg-amber-50 border-amber-300/70 shadow-retro-sm'
            : 'bg-amber-50/40 border-amber-200/40 hover:border-amber-300/60'
        }`}
        style={{ width: '5rem', height: '5rem' }}
      >
        {isLocked ? (
          <Lock className="w-3.5 h-3.5 text-aged-300" />
        ) : isCompleted ? (
          <>
            <span className="text-base font-bold text-olive-600">{index + 1}</span>
            {typeof starCount === 'number' && (
              <div className="flex items-center justify-center gap-px mt-0.5">
                {[0, 1, 2].map((i) => (
                  <Star
                    key={i}
                    className={`w-3 h-3 ${
                      i < starCount
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-aged-300 fill-aged-300'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <span className={`text-base font-bold text-amber-500`}>{index + 1}</span>
            {isGenerating ? (
              <Loader2 className="w-3 h-3 animate-spin text-amber-300 mt-0.5" />
            ) : (
              <div className={`w-4 h-[2px] rounded-none mt-0.5 ${isCurrent ? 'bg-amber-400' : 'bg-amber-300/60'}`} />
            )}
          </>
        )}
      </motion.button>
    );
  };

  const renderPhaseContent = (phaseNumber) => {
    const units = phaseNumber === 1 ? phase1Units : phase2Units;
    const currentUnit = phaseNumber === 1 ? currentPhase1Unit : currentPhase2Unit;
    const onClick = phaseNumber === 1 ? onPhase1UnitClick : onPhase2UnitClick;
    const keyPrefix = phaseNumber === 1 ? 'phase1' : 'phase2';
    const isUnlockedFn = phaseNumber === 1 ? isPhase1Unlocked : isPhase2Unlocked;
    const completed = phaseNumber === 1 ? phase1Completed : phase2Completed;
    const total = phaseNumber === 1 ? phase1Total : phase2Total;
    const progress = total > 0 ? (completed / total) * 100 : 0;

    const currentPage = phaseNumber === 1 ? phase1Page : phase2Page;
    const setCurrentPage = phaseNumber === 1 ? setPhase1Page : setPhase2Page;
    const totalPages = Math.ceil(total / UNITS_PER_PAGE);
    const startIdx = currentPage * UNITS_PER_PAGE;
    const endIdx = Math.min(startIdx + UNITS_PER_PAGE, total);
    const pageUnits = units?.slice(startIdx, endIdx) || [];

    if (!units || units.length === 0 || (phaseNumber === 2 && units.length === 1 && units[0]?.no_eligible_sentences)) {
      return (
        <div className="py-12 text-center">
          <p className="text-xs text-ink-400">{t.noPracticeContent || '暂无可练习内容'}</p>
        </div>
      );
    }

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-ink-400 tabular-nums">{completed}<span className="text-aged-300">/{total}</span></span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-1 text-ink-400 hover:text-ink-600 disabled:text-aged-300 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] text-ink-400 tabular-nums min-w-[60px] text-center">
                {currentPage + 1}/{totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="p-1 text-ink-400 hover:text-ink-600 disabled:text-aged-300 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="w-full h-1.5 bg-parchment-100 rounded-none overflow-hidden mb-5">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-none ${
              phaseNumber === 1 ? 'bg-olive-400' : 'bg-blue-400'
            }`}
          />
        </div>

        <div className="grid gap-2.5 justify-center grid-cols-[repeat(auto-fill,5rem)]">
          {pageUnits.map((unit, pageIdx) => {
            const globalIdx = startIdx + pageIdx;
            return renderUnitCard(
              unit,
              globalIdx,
              () => onClick(globalIdx),
              keyPrefix,
              isUnlockedFn(globalIdx),
              phaseNumber
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="w-full h-full flex flex-col"
      onTouchStart={(e) => {
        if (isDesktop) return
        const t = e.touches[0]
        touchState.current = { x: t.clientX, y: t.clientY, t: Date.now(), scrolling: false }
      }}
      onTouchEnd={(e) => {
        if (isDesktop || touchState.current.scrolling) return
        const t = e.changedTouches[0]
        const dx = t.clientX - touchState.current.x
        const dy = t.clientY - touchState.current.y
        const dt = Date.now() - touchState.current.t
        if (Math.abs(dx) < Math.abs(dy) * 1.5) return
        const isSwipe = Math.abs(dx) > 40 || (dt > 0 && Math.abs(dx) / dt > 0.3)
        if (!isSwipe) return
        const targetIdx = dx < 0 ? Math.min(1, activeTab + 1) : Math.max(0, activeTab - 1)
        if (targetIdx === activeTab) return
        touchState.current.scrolling = true
        switchTab(targetIdx)
        setTimeout(() => { touchState.current.scrolling = false }, 350)
      }}
    >
      <div className="flex items-center gap-1 sm:gap-2 mb-6">
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            onClick={onBack}
            className="btn-ghost p-2 hidden md:flex"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        {fileTitle && (
          <span className="text-base font-bold text-ink-500 truncate min-w-0 flex-1 text-left px-2">
            {fileTitle}
          </span>
        )}

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <label className="flex items-center gap-1.5 cursor-pointer select-none group">
            <span className="text-xs text-ink-400 group-hover:text-ink-600 transition-colors flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {t.onlyNewWords || '只学新词'}
            </span>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={onlyNewWords || false}
                onChange={(e) => onOnlyNewWordsChange?.(e.target.checked)}
                className="sr-only peer"
              />
              <div className="toggle-warm-off peer-checked:bg-amber-400 peer-focus:outline-none" />
              <div className="absolute left-[2px] top-[3px] toggle-warm-dot peer-checked:translate-x-4" />
            </div>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none group">
            <span className="text-xs text-ink-400 group-hover:text-ink-600 transition-colors flex items-center gap-1">
              <Headphones className="w-3 h-3" />
              {t.skipListening || '跳过听力'}
            </span>
            <div className="relative inline-flex items-center">
              <input
                type="checkbox"
                checked={skipListening || false}
                onChange={(e) => onSkipListeningChange?.(e.target.checked)}
                className="sr-only peer"
              />
              <div className="toggle-warm-off peer-checked:bg-amber-400 peer-focus:outline-none" />
              <div className="absolute left-[2px] top-[3px] toggle-warm-dot peer-checked:translate-x-4" />
            </div>
          </label>
        </div>

        <button
          onClick={onHome}
          className="btn-ghost p-2 hidden md:flex"
          title={t.backToHome || '返回主页'}
        >
          <Home className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col min-h-0">
        <div className="mb-6 text-center hidden md:block">
          <h2 className="text-xl font-bold font-display text-ink-800">
            {tabs[activeTab].label}
          </h2>
          <p className="text-xs text-ink-400 mt-1">{t.completeUnitsInOrder || '按顺序完成单元，解锁下一单元'}</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            <p className="text-xs text-ink-400">{t.loading}</p>
          </div>
        ) : (
          <div className="bg-parchment-50 rounded-md shadow-retro overflow-hidden flex-1 flex flex-col min-h-0">
            <div className="bg-parchment-100/70 backdrop-blur-md border-b border-aged-200/60 px-3 pt-2.5">
              <div className="flex gap-1 relative">
                <motion.div
                  className="absolute top-0 bottom-0 bg-parchment-50 rounded-t-xl shadow-retro-sm"
                  style={{ width: 'calc(50% - 4px)' }}
                  animate={{ left: activeTab === 0 ? '2px' : 'calc(50% + 2px)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
                {tabs.map((tab, i) => {
                  const isActive = activeTab === i;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => handleTabChange(i)}
                      className="relative z-10 flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-[13px] font-bold"
                    >
                      <div className={`flex items-center gap-1.5 transition-colors duration-300 ${
                        isActive ? 'text-ink-700' : 'text-ink-400 hover:text-ink-500'
                      }`}>
                        <span>{tab.label}</span>
                        {tab.total > 0 && (
                          <span className={`ml-0.5 text-[10px] px-1.5 py-0.5 rounded-none transition-colors duration-300 ${
                            isActive ? 'bg-parchment-100 text-ink-500' : 'text-ink-400'
                          }`}>
                            {tab.completed}/{tab.total}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 pb-5 pt-4 flex-1 overflow-y-auto min-h-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  {renderPhaseContent(activeTab + 1)}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default AllUnitsStep;
