module.exports = {
  apps: [{
    name: 'PalamOS-Dashboard',
    script: 'src/main.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'development',
      ELECTRON_IS_DEV: '1',
      DISPLAY: ':0' // Per a Linux amb X11
    },
    env_production: {
      NODE_ENV: 'production',
      ELECTRON_IS_DEV: '0',
      DISPLAY: ':0' // Per a Linux amb X11
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 8000
  }]
};
