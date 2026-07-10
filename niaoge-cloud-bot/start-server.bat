@echo off
chcp 65001 > nul
title niaoge-cloud-bot

cd /d "%~dp0"

echo ========================================
echo  niaoge-cloud-bot server
echo ========================================
echo.

node --version > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js and add it to PATH.
  echo [INFO] Download: https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Dependencies not found, running npm install...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting server, logs also written to start-server.log ...
echo.

node server.js >> start-server.log 2>&1

if errorlevel 1 (
  echo.
  echo [ERROR] Server exited unexpectedly. Check start-server.log.
  type start-server.log
  pause
)
