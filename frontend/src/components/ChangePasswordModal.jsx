import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { KeyRound, X, Loader2, Check, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { auth } from '../utils/auth'

// ponytail: 修改密码弹窗，移动端/桌面端共用。
// 校验当前密码 → 提交后端 /api/auth/change-password → 成功后自动关闭。
export default function ChangePasswordModal({ isOpen, onClose, t }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const reset = () => {
    setCurrent(''); setNext(''); setConfirm('')
    setShowCurrent(false); setShowNext(false); setShowConfirm(false)
    setLoading(false); setError(''); setSuccess(false)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!current) return setError(t.enterCurrentPassword || '请输入当前密码')
    if (!next) return setError(t.enterNewPassword || '请输入新密码')
    if (next.length < 6) return setError(t.passwordTooShort || '新密码至少 6 位')
    if (!confirm) return setError(t.enterConfirmPassword || '请再次输入新密码')
    if (next !== confirm) return setError(t.passwordMismatch || '两次输入的新密码不一致')

    setLoading(true)
    try {
      await auth.changePassword(current, next)
      setSuccess(true)
      setTimeout(handleClose, 1200)
    } catch (err) {
      const detail = err?.response?.data?.detail || ''
      if (detail.includes('当前密码')) setError(t.currentPasswordError || '当前密码错误')
      else if (detail.includes('6')) setError(t.passwordTooShort || '新密码至少 6 位')
      else setError(detail || (t.currentPasswordError || '当前密码错误'))
    } finally {
      setLoading(false)
    }
  }

  const inputCls = "w-full px-3 py-2.5 pr-10 text-sm bg-parchment-50 border-2 border-aged-200 rounded-sm focus:outline-none focus:border-amber-400 transition-colors text-ink-700"

  const renderField = (label, value, setValue, show, setShow, placeholder) => (
    <div>
      <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
        {label}
      </label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 transition-colors"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-ink-800/40 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="bg-parchment-50 border-0 sm:border-2 border-aged-200 rounded-none sm:rounded-md shadow-retro-xl w-full h-full sm:h-auto sm:w-[420px] max-h-full overflow-y-auto flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-aged-200/80 bg-parchment-50/60 shrink-0">
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4 text-ink-500" />
                <h2 className="font-display text-sm font-bold text-ink-800">{t.changePassword || '修改密码'}</h2>
              </div>
              <button
                onClick={handleClose}
                className="btn-ghost p-1 text-ink-400 hover:text-ink-600 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {success ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <Check className="w-6 h-6 text-amber-600" />
                </div>
                <p className="text-sm font-medium text-ink-700">{t.passwordChanged || '密码修改成功'}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 flex flex-col px-5 py-5 gap-4">
                {renderField(t.currentPassword || '当前密码', current, setCurrent, showCurrent, setShowCurrent, t.enterCurrentPassword || '请输入当前密码')}
                {renderField(t.newPassword || '新密码', next, setNext, showNext, setShowNext, t.enterNewPassword || '请输入新密码')}
                {renderField(t.confirmPassword || '确认新密码', confirm, setConfirm, showConfirm, setShowConfirm, t.enterConfirmPassword || '请再次输入新密码')}

                {error && (
                  <div className="flex items-center gap-1.5 text-xs text-rust-500">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 py-2.5 rounded-sm border-2 border-aged-200 text-sm font-medium text-ink-500 hover:bg-parchment-100 transition-colors"
                  >
                    {t.cancel || '取消'}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-sm bg-amber-500 text-white text-sm font-bold shadow-retro hover:bg-amber-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    {t.confirm || '确定'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
