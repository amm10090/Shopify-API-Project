-- 创建用户
CREATE USER shopify_user WITH PASSWORD 'NBn6oCtXeC@7u3v';

-- 创建数据库
CREATE DATABASE shopify_app OWNER shopify_user;

-- 授予用户必要的权限
GRANT ALL PRIVILEGES ON DATABASE shopify_app TO shopify_user;

-- 连接到新数据库并授予schema权限
\c shopify_app
GRANT ALL ON SCHEMA public TO shopify_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO shopify_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO shopify_user;

-- 确保未来创建的表也有权限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO shopify_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO shopify_user;