#!/bin/bash

# 验证脚本 - 多层验证确保改动不破坏功能
# 使用方法: ./scripts/verify.sh

set -e  # 遇到错误立即退出

echo "🔍 Stealth Chat 验证脚本"
echo "========================================"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 进入服务器目录
cd "$(dirname "$0")/../server" || exit 1

# Level 1: 代码语法检查
echo ""
echo "📝 Level 1: 代码语法检查..."
if node --check src/index.js && node --check src/socket.js && node --check src/db.js; then
    echo -e "${GREEN}✅ Level 1 通过${NC}"
else
    echo -e "${RED}❌ Level 1 失败: 代码语法错误${NC}"
    exit 1
fi

# Level 2: 单元测试
echo ""
echo "🧪 Level 2: 运行单元测试..."
if npm run test; then
    echo -e "${GREEN}✅ Level 2 通过${NC}"
else
    echo -e "${RED}❌ Level 2 失败: 单元测试失败${NC}"
    exit 1
fi

# Level 3: 本地服务启动测试
echo ""
echo "🚀 Level 3: 本地服务启动测试..."

# 检查端口是否被占用
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  端口 3000 已被占用,跳过服务启动测试${NC}"
else
    # 启动服务
    npm start &
    SERVER_PID=$!
    
    # 等待服务启动
    echo "等待服务启动..."
    sleep 3
    
    # 测试健康检查端点
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Level 3 通过${NC}"
    else
        echo -e "${RED}❌ Level 3 失败: 健康检查端点无响应${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    
    # 停止服务
    kill $SERVER_PID 2>/dev/null || true
    sleep 1
fi

# 总结
echo ""
echo "========================================"
echo -e "${GREEN}🎉 所有验证通过!${NC}"
echo "可以安全地部署或提交代码"
echo "========================================"
