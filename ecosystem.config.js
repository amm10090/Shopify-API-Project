module.exports = {
    apps: [{
        name: 'shopify-app',
        script: 'dist/server/index.js',
        cwd: '/root/Shopify-API-Project',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PORT: 3000,
            NODE_PATH: './node_modules'
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000,
            NODE_PATH: './node_modules'
        },
        node_args: ['-r', 'module-alias/register'],
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,
        max_restarts: 10,
        min_uptime: '10s',
        exec_mode: 'fork'
    }]
}; 