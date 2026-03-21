// PM2 Configuration for Meteora AI LP Trading System

module.exports = {
  apps: [
    {
      name: 'meteora-ai-lp',
      script: './dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      
      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Logging
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Process management
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Health check
      health_check_grace_period: 30000,
      
      // Advanced
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // Cron restart (optional - daily at 3 AM)
      // cron_restart: '0 3 * * *',
    },
    
    // Worker process for heavy computations (optional)
    {
      name: 'meteora-ai-worker',
      script: './dist/workers/aiWorker.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      
      env: {
        NODE_ENV: 'production'
      },
      
      autorestart: true,
      max_restarts: 5,
    },
    
    // Telegram webhook handler (optional separate process)
    {
      name: 'meteora-telegram',
      script: './dist/telegram/webhookServer.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      
      autorestart: true,
      max_restarts: 10,
    }
  ],
  
  // Deployment configuration
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-vps-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:yourusername/meteora-ai-lp.git',
      path: '/home/deploy/meteora-ai-lp',
      
      'pre-deploy': 'git fetch --all',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      
      // Environment setup
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
