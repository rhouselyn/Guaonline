# ============================================================
# Gualingo Windows 部署脚本
#
# 流程：git pull → 构建前端 → 部署静态文件 → 更新后端依赖 → 平滑重启
#
# 平滑重启策略：
#   先 reload 实例 2 (端口 8002)，等待就绪后再 reload 实例 1 (端口 8001)。
#   Nginx 的 proxy_next_upstream 会自动将请求转发到可用实例，实现零停机。
#
# 手动执行：
#   powershell -ExecutionPolicy Bypass -File C:\gualingo\deploy\deploy.ps1
#
# GitHub Actions 自动调用：无需参数，使用默认值。
# ============================================================

param(
    [string]$ProjectDir   = "C:\gualingo",
    [string]$NginxHtmlDir = "C:\nginx\html\gualingo",
    [string]$PythonVenv   = "$ProjectDir\backend\.venv"
)

$ErrorActionPreference = "Stop"

# ── 辅助函数：等待端口就绪 ────────────────────────────
function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds = 30)
    $startTime = Get-Date
    while ((Get-Date) - $startTime -lt [TimeSpan]::FromSeconds($TimeoutSeconds)) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect("127.0.0.1", $Port)
            $tcp.Close()
            return $true
        } catch {
            Start-Sleep -Milliseconds 500
        }
    }
    return $false
}

Write-Host "========== Gualingo 部署开始 ==========" -ForegroundColor Cyan

# ── 1. 拉取最新代码 ──────────────────────────────────
Write-Host "[1/5] 拉取最新代码..." -ForegroundColor Yellow
Set-Location $ProjectDir
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "git pull 失败，请检查是否有未提交的本地修改" -ForegroundColor Red
    exit 1
}

# ── 2. 构建前端 ──────────────────────────────────────
Write-Host "[2/5] 构建前端..." -ForegroundColor Yellow
Set-Location "$ProjectDir\frontend"
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "npm install 失败" -ForegroundColor Red; exit 1 }
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "npm run build 失败" -ForegroundColor Red; exit 1 }

# ── 3. 部署前端静态文件到 Nginx ──────────────────────
Write-Host "[3/5] 部署前端静态文件..." -ForegroundColor Yellow
if (-not (Test-Path $NginxHtmlDir)) {
    New-Item -ItemType Directory -Path $NginxHtmlDir -Force | Out-Null
}
# 清空旧文件（保留目录本身）
Get-ChildItem -Path $NginxHtmlDir -Recurse -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
# 复制新构建产物
Copy-Item -Path "$ProjectDir\frontend\dist\*" -Destination $NginxHtmlDir -Recurse -Force
Write-Host "  前端文件已部署到 $NginxHtmlDir" -ForegroundColor Green

# ── 4. 更新后端 Python 依赖 ──────────────────────────
Write-Host "[4/5] 更新后端依赖..." -ForegroundColor Yellow
Set-Location "$ProjectDir\backend"

# 创建虚拟环境（如果不存在）
if (-not (Test-Path "$PythonVenv\Scripts\python.exe")) {
    Write-Host "  创建 Python 虚拟环境..." -ForegroundColor Gray
    python -m venv $PythonVenv
    if ($LASTEXITCODE -ne 0) { Write-Host "创建 venv 失败" -ForegroundColor Red; exit 1 }
}

# 安装/更新依赖
& "$PythonVenv\Scripts\pip.exe" install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Host "pip install 失败" -ForegroundColor Red; exit 1 }

# ── 5. 平滑重启 PM2 实例 ─────────────────────────────
Write-Host "[5/5] 平滑重启后端..." -ForegroundColor Yellow
Set-Location $ProjectDir

# 检查 PM2 实例是否已存在
$pm2List = pm2 jlist 2>$null
$runningApps = @()
if ($pm2List) {
    try {
        $runningApps = ($pm2List | ConvertFrom-Json) | Where-Object { $_.name -like "gualingo-*" }
    } catch {}
}

if (-not $runningApps -or $runningApps.Count -eq 0) {
    # ── 首次启动 ──
    Write-Host "  首次启动 PM2 实例..." -ForegroundColor Gray
    pm2 start ecosystem.config.cjs
    pm2 save
    Write-Host "  等待实例启动..." -ForegroundColor Gray
    Wait-ForPort -Port 8001 -TimeoutSeconds 30 | Out-Null
    Wait-ForPort -Port 8002 -TimeoutSeconds 30 | Out-Null
    Write-Host "========== 部署完成（首次启动）==========" -ForegroundColor Cyan
    exit 0
}

# ── 零停机 reload：先重启实例 2，就绪后再重启实例 1 ──

Write-Host "  [1/2] 重启 gualingo-2 (端口 8002)..." -ForegroundColor Gray
pm2 reload gualingo-2 --update-env
if (-not (Wait-ForPort -Port 8002 -TimeoutSeconds 30)) {
    Write-Host "  警告：gualingo-2 在 30 秒内未就绪，请检查 pm2 logs gualingo-2" -ForegroundColor Red
} else {
    Write-Host "  gualingo-2 已就绪" -ForegroundColor Green
}

Write-Host "  [2/2] 重启 gualingo-1 (端口 8001)..." -ForegroundColor Gray
pm2 reload gualingo-1 --update-env
if (-not (Wait-ForPort -Port 8001 -TimeoutSeconds 30)) {
    Write-Host "  警告：gualingo-1 在 30 秒内未就绪，请检查 pm2 logs gualingo-1" -ForegroundColor Red
} else {
    Write-Host "  gualingo-1 已就绪" -ForegroundColor Green
}

pm2 save
Write-Host "========== 部署完成 ==========" -ForegroundColor Cyan
