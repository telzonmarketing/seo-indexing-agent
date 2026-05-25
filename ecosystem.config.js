/**
 * SEO OS — PM2 Ecosystem Config
 * Use this when running WITHOUT Docker (e.g. local dev or lightweight VPS).
 *
 * Start all:         pm2 start ecosystem.config.js
 * Start production:  pm2 start ecosystem.config.js --env production
 * Save process list: pm2 save
 * Auto-start on boot: pm2 startup  (then run the printed command)
 */

module.exports = {
  apps: [
    // ── FastAPI Backend ────────────────────────────────────────────────────
    {
      name: "seoos-api",
      cwd: "./backend",
      script: "uvicorn",
      args: "app.main:app --host 0.0.0.0 --port 8000 --workers 2",
      interpreter: "python3",
      env: {
        NODE_ENV: "development",
        PYTHONPATH: ".",
      },
      env_production: {
        NODE_ENV: "production",
        PYTHONPATH: ".",
      },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── Next.js Frontend ───────────────────────────────────────────────────
    {
      name: "seoos-frontend",
      cwd: "./frontend",
      script: "node_modules/.bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      watch: false,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 10,
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── Celery Worker (AI tasks + crawling) ────────────────────────────────
    {
      name: "seoos-worker",
      cwd: "./backend",
      script: "celery",
      args: "-A app.tasks.celery_app.celery worker --loglevel=info --concurrency=2 -Q celery,crawl,ai",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
      },
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      kill_timeout: 30000, // 30s graceful shutdown for in-flight tasks
      error_file: "./logs/worker-error.log",
      out_file: "./logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },

    // ── Celery Beat (scheduled tasks) ──────────────────────────────────────
    {
      name: "seoos-beat",
      cwd: "./backend",
      script: "celery",
      args: "-A app.tasks.celery_app.celery beat --loglevel=info",
      interpreter: "python3",
      env: {
        PYTHONPATH: ".",
      },
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 5,
      error_file: "./logs/beat-error.log",
      out_file: "./logs/beat-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
