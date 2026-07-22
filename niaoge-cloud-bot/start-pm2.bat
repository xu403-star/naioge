@echo off
chcp 936 > nul
title niaoge-cloud-bot PM2

cd /d "%~dp0"

echo ========================================
echo  niaoge-cloud-bot PM2 start script
echo ========================================
echo.

node --version > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo [INFO] https://nodejs.org/
  pause
  exit /b 1
)

pm2 --version > nul 2>&1
if errorlevel 1 (
  echo [INFO] PM2 not found, installing...
  call npm install -g pm2
  if errorlevel 1 (
    echo [ERROR] PM2 install failed
    pause
    exit /b 1
  )
)

if not exist "node_modules" (
  echo [INFO] node_modules not found, running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
  )
)

if not exist "dist-vue\index.html" (
  echo [INFO] dist-vue not found, building frontend...
  cd frontend
  call npm install
  call npm run build
  cd ..
)

echo [INFO] Starting PM2 service...
pm2 start ecosystem.config.cjs --update-env
if errorlevel 1 (
  echo [ERROR] PM2 start failed
  pause
  exit /b 1
)

echo [INFO] Saving PM2 config...
pm2 save

echo.
echo [OK] Service is running in background
echo [INFO] Open http://YOUR_SERVER_IP:3456
echo [INFO] Commands: pm2 status / pm2 logs / pm2 stop all
echo.
pause
