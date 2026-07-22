@echo off
chcp 936 >nul 2>&1
setlocal enabledelayedexpansion
title niaoge-cloud-bot - PM2 Manager
set APP_NAME=niaoge-cloud-bot
set APP_DIR=%~dp0
set APP_FILE=server.js

:MENU
cls
echo ========================================
echo   niaoge-cloud-bot - PM2 Manager
echo ========================================
echo.
echo   1. Start Service
echo   2. Stop Service
echo   3. Restart Service
echo   4. View Status
echo   5. View Logs
echo   6. Setup Auto-start (run once)
echo   7. Delete Service
echo   0. Exit
echo.
set "choice="
set /p "choice=Select: "

if "%choice%"=="1" goto START
if "%choice%"=="2" goto STOP
if "%choice%"=="3" goto RESTART
if "%choice%"=="4" goto STATUS
if "%choice%"=="5" goto LOGS
if "%choice%"=="6" goto STARTUP
if "%choice%"=="7" goto DELETE
if "%choice%"=="0" goto END
goto MENU

:START
cls
echo [Start Service]
cd /d "%APP_DIR%"

echo Checking Node.js ...
node --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo https://nodejs.org/
  pause
  goto MENU
)

echo Checking PM2 ...
call pm2 --version >nul 2>&1
if errorlevel 1 (
  echo [INFO] PM2 not found, installing ...
  call npm install -g pm2
)

if not exist "node_modules" (
  echo [INFO] node_modules not found, running npm install ...
  call npm install
)

if not exist "dist-vue\index.html" (
  echo [INFO] dist-vue not found, building frontend ...
  cd frontend
  call npm install
  call npm run build
  cd "%APP_DIR%"
)

echo [INFO] Starting service ...
call pm2 start "%APP_FILE%" --name %APP_NAME% 2>nul
if errorlevel 1 call pm2 restart %APP_NAME%
echo.
echo [OK] Open http://YOUR_SERVER_IP:3456
echo.
pause
goto MENU

:STOP
cls
echo [Stop Service]
call pm2 stop %APP_NAME%
if errorlevel 1 echo [ERROR] Failed to stop.
echo.
pause
goto MENU

:RESTART
cls
echo [Restart Service]
call pm2 restart %APP_NAME%
if errorlevel 1 echo [ERROR] Failed to restart.
echo.
pause
goto MENU

:STATUS
cls
echo [Service Status]
call pm2 list
echo.
call pm2 show %APP_NAME% 2>nul
if errorlevel 1 echo Service not found.
echo.
pause
goto MENU

:LOGS
cls
echo [Live Logs] Press Ctrl+C to exit, return to menu
echo.
call pm2 logs %APP_NAME% --lines 50
goto MENU

:STARTUP
cls
echo [Setup Auto-start]
echo.
echo Installing pm2-windows-startup ...
call npm install -g pm2-windows-startup
echo.
echo Registering auto-start service ...
call pm2-startup install
echo.
echo Saving process list ...
call pm2 save
echo.
echo [OK] Auto-start setup done!
echo.
pause
goto MENU

:DELETE
cls
echo [Delete Service]
set "confirm="
set /p "confirm=Delete %APP_NAME% ? (y/n): "
if /i not "%confirm%"=="y" goto MENU
call pm2 delete %APP_NAME%
call pm2 save
echo.
echo Service deleted.
echo.
pause
goto MENU

:END
exit /b
