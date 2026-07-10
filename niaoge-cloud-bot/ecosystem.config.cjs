/**
 * PM2 进程管理配置
 * 用法:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop ecosystem.config.cjs
 *   pm2 restart ecosystem.config.cjs
 *   pm2 logs niaoge-cloud-bot
 *   pm2 save          # 保存为开机自启
 *   pm2 startup       # 生成开机自启脚本
 */
module.exports = {
  apps: [
    {
      name: "niaoge-cloud-bot",
      script: "./server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3456,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./data/logs/err.log",
      out_file: "./data/logs/out.log",
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
