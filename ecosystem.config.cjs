/**
 * PM2 进程管理配置 - Gualingo 后端
 *
 * 运行两个 uvicorn 实例（端口 8001 / 8002），
 * 配合 Nginx 负载均衡实现零停机更新：
 *   部署时先 reload 实例 2，确认就绪后再 reload 实例 1，
 *   Nginx 会自动将流量转发到可用实例。
 *
 * 使用方法：
 *   cd C:\gualingo
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup        （按提示执行返回的命令，实现开机自启）
 */

// Python 解释器路径：优先使用虚拟环境
// 如果没有 venv，改为 'python' 或系统 Python 完整路径
const PYTHON = process.env.PYTHON_PATH || './backend/.venv/Scripts/python.exe';

module.exports = {
  apps: [
    {
      name: 'gualingo-1',
      script: 'main.py',
      interpreter: PYTHON,
      cwd: './backend',
      env: {
        PYTHONUNBUFFERED: '1',
        HOST: '127.0.0.1',
        PORT: '8001',
      },
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: 'gualingo-2',
      script: 'main.py',
      interpreter: PYTHON,
      cwd: './backend',
      env: {
        PYTHONUNBUFFERED: '1',
        HOST: '127.0.0.1',
        PORT: '8002',
      },
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
