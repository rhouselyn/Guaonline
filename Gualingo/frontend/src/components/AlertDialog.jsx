import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, X } from 'lucide-react'

function AlertDialog({ open, title, message, onClose, t }) {
  const closeRef = useRef(null)

  useEffect(() => {
    if (open) {
      closeRef.current?.focus()
      const handleEsc = (e) => { if (e.key === 'Escape') onClose() }
      window.addEventListener('keydown', handleEsc)
      return () => window.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#3d3929]/20 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="relative bg-[#faf8f0] border-2 border-[#d4c9a8] rounded-md shadow-[4px_4px_0_#8b7e5e] max-w-sm w-full mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
            <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
            <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
            <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />

            <div className="flex items-start gap-3 p-5 relative z-10">
              <div className="shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-[#d4a853]" />
              </div>
              <div className="flex-1 min-w-0">
                {title && (
                  <h3 className="text-sm font-semibold text-[#3d3929] mb-1" style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{title}</h3>
                )}
                <p className="text-sm text-[#524d3c] leading-relaxed">{message}</p>
              </div>
              <button
                ref={closeRef}
                onClick={onClose}
                className="shrink-0 p-1 text-[#8b7e5e] hover:text-[#3d3929] transition-colors rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="border-t border-[#d4c9a8] px-5 py-3 flex justify-end relative z-10">
              <button
                onClick={onClose}
                className="bg-[#d4a853] text-[#3d3929] font-semibold rounded-md shadow-[2px_2px_0_#8b7e5e] hover:shadow-[1px_1px_0_#8b7e5e] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] px-4 py-1.5 text-sm transition-all"
              >
                {t?.ok || '确定'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default AlertDialog
