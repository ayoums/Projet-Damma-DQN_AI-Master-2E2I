@echo off
title Moroccan Dama — Local Server
color 0A
echo.
echo  ========================================
echo   MOROCCAN DAMA  Starting local server
echo  ========================================
echo.
echo  Keep this window open while playing!
echo  Press Ctrl+C to stop the server.
echo.

:: Open browser after 2 seconds (server needs a moment to start)
start /b cmd /c "timeout /t 2 >nul && start http://localhost:8000"

:: Try python first, then python3
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo  Server running at http://localhost:8000
    python -m http.server 8000
    goto end
)

python3 --version >nul 2>&1
if %errorlevel% == 0 (
    echo  Server running at http://localhost:8000
    python3 -m http.server 8000
    goto end
)

:: Neither found
echo.
echo  ERROR: Python not found!
echo  Please install Python from https://python.org
echo  Make sure to tick "Add Python to PATH" during install.
echo.

:end
pause
