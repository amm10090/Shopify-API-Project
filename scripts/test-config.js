#!/usr/bin/env node

const http = require('http');
const https = require('https');

// 测试配置
const tests = [
    {
        name: '后端健康检查',
        url: 'http://localhost:3000/health',
        expected: 'ok'
    },
    {
        name: '前端开发服务器',
        url: 'http://localhost:5173',
        expected: 'html'
    },
    {
        name: 'HTTPS代理 - API请求',
        url: 'https://localhost:8443/health',
        expected: 'ok',
        https: true
    },
    {
        name: 'HTTPS代理 - 前端请求',
        url: 'https://localhost:8443/',
        expected: 'html',
        https: true
    }
];

// 忽略自签名证书错误
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

function testEndpoint(test) {
    return new Promise((resolve) => {
        const client = test.https ? https : http;
        
        const req = client.get(test.url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const success = test.expected === 'html' 
                    ? data.includes('<html') || data.includes('<!DOCTYPE html')
                    : data.includes(test.expected);
                
                resolve({
                    name: test.name,
                    success,
                    status: res.statusCode,
                    data: data.substring(0, 200) + (data.length > 200 ? '...' : '')
                });
            });
        });
        
        req.on('error', (err) => {
            resolve({
                name: test.name,
                success: false,
                error: err.message
            });
        });
        
        req.setTimeout(5000, () => {
            req.destroy();
            resolve({
                name: test.name,
                success: false,
                error: 'Timeout'
            });
        });
    });
}

async function runTests() {
    console.log('🧪 测试应用配置...\n');
    
    for (const test of tests) {
        const result = await testEndpoint(test);
        const status = result.success ? '✅' : '❌';
        
        console.log(`${status} ${result.name}`);
        if (result.error) {
            console.log(`   错误: ${result.error}`);
        } else {
            console.log(`   状态: ${result.status}`);
            if (!result.success) {
                console.log(`   响应: ${result.data}`);
            }
        }
        console.log('');
    }
    
    console.log('测试完成！');
}

runTests().catch(console.error);