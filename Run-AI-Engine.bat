@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "PORT=8787"

echo =============================================
echo   Real-Wargame Local AI Engine Launcher
echo =============================================
echo.

echo [INFO] Zapusk headless local AI engine na http://127.0.0.1:%PORT%/
echo [INFO] Dlya avtomaticheskoy proverki mozhno zapustit Run-AI-Engine-Smoke.bat
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [OSHIBKA] npm ne naiden. Ustanovite Node.js: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] npm naiden.

if not exist "node_modules\" (
    echo [INFO] node_modules ne naideno. Zapuskayu npm install...
    call npm install
    if !errorlevel! neq 0 (
        echo [OSHIBKA] npm install ne udalsya.
        pause
        exit /b 1
    )
    echo [OK] npm install zavershen.
) else (
    echo [OK] node_modules naideno.
)

echo [INFO] Proveryayu port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%PORT% "') do (
    if not "%%a"=="0" (
        taskkill /f /pid %%a >nul 2>nul && echo [OK] Process s PID %%a na porte %PORT% ostanovlen.
    )
)

echo [INFO] Zapuskayu local AI engine v novom okne...
start "Real-Wargame AI Engine" cmd /k "npm run engine:dev"

set "WAIT_COUNT=0"
:waitloop
if !WAIT_COUNT! GEQ 20 (
    echo [OSHIBKA] Local AI engine ne zapustilsya za 20 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/engine/health' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 (
    echo [OK] Local AI engine zapushchen.
    echo [INFO] Otkryvayu health endpoint v brauzere...
    start http://127.0.0.1:%PORT%/engine/health
    goto :done
)
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_COUNT+=1
goto :waitloop

:done
echo.
echo Chto proverit rukami:
echo 1. V brauzere dolzhen otkrytsya JSON s ok=true.
echo 2. V JSON dolzhno byt browserDoesHeavyAi=false.
echo 3. V JSON dolzhny byt endpointy /engine/health, /ai/graph/validate, /ai/graph/evaluate-once.
echo 4. Okno "Real-Wargame AI Engine" ostavlyay otkrytym, poka nuzhen engine.
echo.
pause
exit /b 0
