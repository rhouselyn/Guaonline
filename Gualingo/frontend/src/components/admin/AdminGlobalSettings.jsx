import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminGlobalSettings() {
  const [settings, setSettings] = useState(null)
  const [interval, setInterval_] = useState(1.0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    adminApi.getGlobalSettings().then(data => {
      setSettings(data)
      setInterval_(data.request_interval || 1.0)
    })
  }, [])

  const save = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <div className="text-[#e8d5b7]">加载中...</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">全局设置</h2>

      <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">请求间隔（秒）</label>
            <p className="text-[#e8d5b7]/40 text-xs mb-2">所有用户每次 API 请求之间的等待时间</p>
            <div className="flex items-center gap-3">
              <input type="range" min={0.1} max={20} step={0.1} value={interval}
                onChange={e => setInterval_(Number(e.target.value))}
                className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-12 text-right">{interval.toFixed(1)}s</span>
            </div>
            <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
              <span>0.1s</span><span>20s</span>
            </div>
          </div>

          <button onClick={save} className="w-full py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">
            保存
          </button>

          {saved && <p className="text-green-400 text-sm text-center">已保存</p>}
        </div>
      </div>
    </div>
  )
}
