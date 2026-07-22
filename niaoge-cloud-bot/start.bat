@echo off
chcp 936 > nul
title niaoge-cloud-bot

cd /d "%~dp0"

echo ========================================
echo  niaoge-cloud-bot start script
echo ========================================
echo.

node --version > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo [INFO] https://nodejs.org/
  pause
  exit /b 1
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

echo [INFO] Starting server...
echo [INFO] Open http://YOUR_SERVER_IP:3456
echo.

node server.js

if errorlevel 1 (
  echo.
  echo [ERROR] Server exited unexpectedly.
  pause
)
