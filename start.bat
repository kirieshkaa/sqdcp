@echo off
chcp 65001 >nul
title TBP Dashboard

echo ========================================
echo   TBP Dashboard
echo ========================================
echo.

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo [1/4] Installing Python deps...
cd /d "%BACKEND%"
pip install -r requirements.txt -q 2>nul
echo   OK

echo [2/4] Starting backend (Flask)...
start "TBP-Backend" /d "%BACKEND%" python run.py
echo   OK - http://localhost:8000

echo [3/4] Checking frontend deps...
cd /d "%FRONTEND%"
if not exist "node_modules" (
    call npm install --silent
)
echo   OK

echo [4/4] Starting frontend (Vite)...
start "TBP-Frontend" /d "%FRONTEND%" npm run dev
echo   OK - http://127.0.0.1:3000

echo.
echo ========================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://127.0.0.1:3000
echo.
echo   Test accounts: admin / manager / user1 / viewer
echo   Password: test123
echo.
echo   Close TBP-Backend and TBP-Frontend windows.
echo ========================================
echo.
pause
