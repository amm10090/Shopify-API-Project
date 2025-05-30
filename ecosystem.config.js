module.exports = {
    apps: [{
        name: 'shopify-app',
        script: 'dist/server/index.js',
        cwd: process.cwd(),
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        env_production: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/pm2-combined.log',
        time: true,
        max_restarts: 10,
        min_uptime: '10s',
        exec_mode: 'fork',
        kill_timeout: 5000,
        listen_timeout: 10000,
        shutdown_with_message: true,
        env_file: '.env',
        restart_delay: 4000,
        pmx: true,
        merge_logs: true,
        ignore_watch: ['node_modules', 'logs', '.git', 'dist']
    }]
}; 