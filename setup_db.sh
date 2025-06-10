#!/bin/bash

echo "设置PostgreSQL数据库..."

# 检查PostgreSQL是否运行
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    echo "错误: PostgreSQL服务未运行。请启动PostgreSQL服务。"
    exit 1
fi

echo "PostgreSQL正在运行，开始创建数据库和用户..."

# 尝试使用不同的方法连接PostgreSQL
# 方法1: 使用peer认证（如果可用）
if sudo -u postgres psql -f setup_database.sql 2>/dev/null; then
    echo "✅ 数据库设置成功（使用postgres用户）"
    exit 0
fi

# 方法2: 尝试使用当前用户
if psql -h localhost -U $(whoami) -d postgres -f setup_database.sql 2>/dev/null; then
    echo "✅ 数据库设置成功（使用当前用户）"
    exit 0
fi

# 方法3: 手动创建（需要密码）
echo "自动设置失败，请手动运行以下命令："
echo ""
echo "1. 连接到PostgreSQL:"
echo "   sudo -u postgres psql"
echo ""
echo "2. 或者如果您有postgres密码:"
echo "   psql -h localhost -U postgres"
echo ""
echo "3. 然后执行以下SQL命令:"
echo ""
cat setup_database.sql
echo ""
echo "4. 退出psql: \\q"