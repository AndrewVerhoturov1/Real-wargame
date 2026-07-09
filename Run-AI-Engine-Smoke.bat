@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo =============================================
echo   Real-Wargame Local AI Engine Smoke
echo =============================================
echo.

echo [INFO] Eto proverka etapa 2: local headless AI engine.
echo [INFO] Brauzer ne schitaet tyazhelyy AI. Engine zapuskaetsya otdelnym Node.js processom.
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

echo.
echo [INFO] Zapuskayu npm run engine:smoke...
call npm run engine:smoke
if !errorlevel! neq 0 (
    echo.
    echo [OSHIBKA] Smoke-proverka local AI engine ne proshla.
    echo [INFO] Skopiruy tekst iz etogo okna i prishli ego v chat.
    pause
    exit /b 1
)

echo.
echo [GOTOVO] Smoke-proverka proshla.
echo [INFO] Otchety zapisany v artifacts\ai-engine\
if exist "artifacts\ai-engine\" (
    start "" "artifacts\ai-engine\"
)
echo.
echo Chto proverit rukami:
echo 1. V okne vyshe dolzhny byt stroki [OK] /engine/health, validate, evaluate-once.
echo 2. V papke artifacts\ai-engine dolzhny byt 01-health.json, 02-validation.json, 03-evaluate-once.json.
echo 3. V 03-evaluate-once.json dolzhno byt selectedBranchNodeId = critical_survival i command.type = move_to.
echo.
pause
exit /b 0
