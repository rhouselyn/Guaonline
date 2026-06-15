import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X } from 'lucide-react'

function ConfirmDialog({ isOpen, title, message, confirmText, cancelText, onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onCancel}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#3d3929]/20 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 8 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="relative bg-[#faf8f0] border-2 border-[#d4c9a8] rounded-md shadow-[4px_4px_0_#8b7e5e] w-full max-w-sm overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
            <div className="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-[#d4a853] rounded-tl-md" />
            <div className="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-[#d4a853] rounded-tr-md" />
            <div className="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-[#d4a853] rounded-bl-md" />
            <div className="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-[#d4a853] rounded-br-md" />

            <button
              onClick={onCancel}
              className="absolute top-3.5 right-3.5 p-1 text-[#524d3c] hover:text-[#3d3929] rounded-md transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="px-6 pt-7 pb-2 text-center relative z-10">
              <div className="w-11 h-11 rounded-md bg-[#faf8f0] border-2 border-[#d4a853] flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-5 h-5 text-[#d4a853]" />
              </div>
              {title && (
                <h3 className="text-[15px] font-bold text-[#3d3929] mb-1.5" style={{ fontFamily: "'Noto Serif SC', 'Georgia', serif" }}>{title}</h3>
              )}
              {message && (
                <p className="text-[13px] text-[#524d3c] leading-relaxed">{message}</p>
              )}
            </div>

            <div className="px-5 py-4 flex gap-2.5 relative z-10">
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCancel}
                className="border-2 border-[#d4c9a8] text-[#524d3c] rounded-md hover:bg-[#f0ead6] shadow-[2px_2px_0_#d4c9a8] flex-1 py-2.5 text-[13px] font-bold transition-colors"
              >
                {cancelText || '继续练习'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={onConfirm}
                className="flex-1 py-2.5 text-[13px] font-bold text-white bg-rust-400 hover:bg-rust-500 rounded-md transition-colors"
              >
                {confirmText || '退出'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default ConfirmDialog
