#!/usr/bin/env node

const http = require('http');
const crypto = require('crypto');

// 配置
const baseUrl = process.env.TEST_URL || 'http://localhost:3000';
const testShop = process.env.TEST_SHOP || 'test-shop.myshopify.com';

console.log('🧪 开始测试 Shopify 应用路由...\n');

/**
 * 发送HTTP请求的辅助函数
 */
function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: body
                });
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(data);
        }

        req.end();
    });
}

/**
 * 生成webhook签名
 */
function generateWebhookSignature(data, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(data, 'utf8');
    return hmac.digest('base64');
}

/**
 * 测试健康检查端点
 */
async function testHealthCheck() {
    console.log('1. 测试健康检查端点 /health');

    try {
        const url = new URL('/health', baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'GET'
        };

        const response = await makeRequest(options);

        if (response.statusCode === 200) {
            console.log('   ✅ 健康检查端点正常');
            console.log('   📊 响应:', JSON.parse(response.body).status);
        } else {
            console.log(`   ❌ 健康检查失败，状态码: ${response.statusCode}`);
        }
    } catch (error) {
        console.log('   ❌ 健康检查请求失败:', error.message);
    }

    console.log('');
}

/**
 * 测试OAuth开始端点
 */
async function testOAuthStart() {
    console.log('2. 测试OAuth开始端点 /auth/shopify');

    try {
        const url = new URL(`/auth/shopify?shop=${testShop}`, baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET'
        };

        const response = await makeRequest(options);

        if (response.statusCode === 302 || response.statusCode === 301) {
            console.log('   ✅ OAuth重定向端点正常');
            console.log('   🔗 重定向到:', response.headers.location);
        } else {
            console.log(`   ❌ OAuth端点异常，状态码: ${response.statusCode}`);
            console.log('   📄 响应:', response.body);
        }
    } catch (error) {
        console.log('   ❌ OAuth请求失败:', error.message);
    }

    console.log('');
}

/**
 * 测试OAuth回调端点
 */
async function testOAuthCallback() {
    console.log('3. 测试OAuth回调端点 /auth/shopify/callback');

    try {
        const url = new URL(`/auth/shopify/callback?shop=${testShop}&code=test_code&state=test_state`, baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET'
        };

        const response = await makeRequest(options);

        console.log(`   📍 回调端点状态码: ${response.statusCode}`);
        if (response.statusCode === 400 || response.statusCode === 401) {
            console.log('   ✅ 回调端点存在（认证失败是预期的）');
        } else {
            console.log('   📄 响应:', response.body.substring(0, 200) + '...');
        }
    } catch (error) {
        console.log('   ❌ 回调请求失败:', error.message);
    }

    console.log('');
}

/**
 * 测试webhook端点
 */
async function testWebhookEndpoint() {
    console.log('4. 测试Webhook端点 /api/webhooks/app/uninstalled');

    try {
        const webhookData = JSON.stringify({
            shop_domain: testShop,
            shop_id: 12345
        });

        const secret = process.env.SHOPIFY_API_SECRET || 'test_secret';
        const signature = generateWebhookSignature(webhookData, secret);

        const url = new URL('/api/webhooks/app/uninstalled', baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(webhookData),
                'X-Shopify-Hmac-Sha256': signature,
                'X-Shopify-Shop-Domain': testShop
            }
        };

        const response = await makeRequest(options, webhookData);

        if (response.statusCode === 200) {
            console.log('   ✅ Webhook端点正常');
            console.log('   📊 响应:', JSON.parse(response.body));
        } else if (response.statusCode === 401) {
            console.log('   ⚠️  Webhook端点存在但签名验证失败（这是正常的）');
        } else {
            console.log(`   ❌ Webhook异常，状态码: ${response.statusCode}`);
            console.log('   📄 响应:', response.body);
        }
    } catch (error) {
        console.log('   ❌ Webhook请求失败:', error.message);
    }

    console.log('');
}

/**
 * 测试webhook测试端点（仅开发环境）
 */
async function testWebhookTestEndpoint() {
    console.log('5. 测试Webhook测试端点 /api/webhooks/test（仅开发环境）');

    try {
        const testData = JSON.stringify({
            test: true,
            message: 'This is a test webhook'
        });

        const url = new URL('/api/webhooks/test', baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(testData)
            }
        };

        const response = await makeRequest(options, testData);

        if (response.statusCode === 200) {
            console.log('   ✅ Webhook测试端点正常');
            console.log('   📊 响应:', JSON.parse(response.body));
        } else if (response.statusCode === 404) {
            console.log('   ℹ️  测试端点不存在（生产环境中是正常的）');
        } else {
            console.log(`   ❌ 测试端点异常，状态码: ${response.statusCode}`);
        }
    } catch (error) {
        console.log('   ❌ 测试端点请求失败:', error.message);
    }

    console.log('');
}

/**
 * 运行所有测试
 */
async function runTests() {
    console.log(`🎯 测试目标: ${baseUrl}`);
    console.log(`🏪 测试商店: ${testShop}\n`);

    await testHealthCheck();
    await testOAuthStart();
    await testOAuthCallback();
    await testWebhookEndpoint();
    await testWebhookTestEndpoint();

    console.log('✨ 路由测试完成！');
    console.log('\n📋 测试总结:');
    console.log('   - /health: 健康检查端点');
    console.log('   - /auth/shopify: OAuth开始端点');
    console.log('   - /auth/shopify/callback: OAuth回调端点');
    console.log('   - /api/webhooks/app/uninstalled: 应用卸载webhook');
    console.log('   - /api/webhooks/test: 测试webhook（仅开发环境）');

    console.log('\n🔧 使用说明:');
    console.log('   环境变量:');
    console.log('   - TEST_URL: 测试的应用URL（默认: http://localhost:3000）');
    console.log('   - TEST_SHOP: 测试的商店域名（默认: test-shop.myshopify.com）');
    console.log('   - SHOPIFY_API_SECRET: Shopify API密钥（用于webhook签名）');
}

// 运行测试
runTests().catch(console.error); 