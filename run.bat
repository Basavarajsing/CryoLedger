@echo off
title CryoLedger Runner
echo ==================================================
echo   CryoLedger Product Verification System
echo ==================================================
echo.

:: Navigate to batch file directory
cd /d "%~dp0"

echo [1/3] Checking NPM packages...
call npm install

echo.
echo [2/3] Launching index.html in main browser...
start http://localhost:5000/index.html

echo.
echo [3/3] Starting Express Server...
node server.js

echo.
echo Server stopped.
pause
