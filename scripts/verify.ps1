# 验证脚本 - Windows PowerShell 版本
# 使用方法: .\scripts\verify.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔍 Stealth Chat 验证脚本" -ForegroundColor Cyan
Write-Host "========================================"

# 进入服务器目录
Set-Location "$PSScriptRoot\..\server"

# Level 1: 代码语法检查
Write-Host ""
Write-Host "📝 Level 1: 代码语法检查..." -ForegroundColor Yellow

try {
    node --check src/index.js
    node --check src/socket.js
    node --check src/db.js
    Write-Host "✅ Level 1 通过" -ForegroundColor Green
} catch {
    Write-Host "❌ Level 1 失败: 代码语法错误" -ForegroundColor Red
    exit 1
}

# Level 2: 单元测试
Write-Host ""
Write-Host "🧪 Level 2: 运行单元测试..." -ForegroundColor Yellow

try {
    npm run test
    Write-Host "✅ Level 2 通过" -ForegroundColor Green
} catch {
    Write-Host "❌ Level 2 失败: 单元测试失败" -ForegroundColor Red
    exit 1
}

# Level 3: 本地服务启动测试
Write-Host ""
Write-Host "🚀 Level 3: 本地服务启动测试..." -ForegroundColor Yellow

# 检查端口是否被占用
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "⚠️  端口 3000 已被占用,跳过服务启动测试" -ForegroundColor Yellow
} else {
    # 启动服务
    $serverProcess = Start-Process -FilePath "node" -ArgumentList "src/index.js" -PassThru -NoNewWindow
    
    # 等待服务启动
    Write-Host "等待服务启动..."
    Start-Sleep -Seconds 3
    
    # 测试健康检查端点
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "✅ Level 3 通过" -ForegroundColor Green
        } else {
            throw "健康检查返回非 200 状态码"
        }
    } catch {
        Write-Host "❌ Level 3 失败: 健康检查端点无响应" -ForegroundColor Red
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }
    
    # 停止服务
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

# 总结
Write-Host ""
Write-Host "========================================"
Write-Host "🎉 所有验证通过!" -ForegroundColor Green
Write-Host "可以安全地部署或提交代码"
Write-Host "========================================"
