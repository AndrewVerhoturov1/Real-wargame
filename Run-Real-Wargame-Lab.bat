@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "APP_PORT=5173"
set "ENGINE_PORT=8787"
set "LAB_MANAGER_PORT=8799"
rem Legacy lab-launch.html is intentionally not opened: this launcher goes straight to the tactical game.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [OSHIBKA] npm ne naiden. Ustanovite Node.js: https://nodejs.org/
    pause
    exit /b 1
)

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [OSHIBKA] node ne naiden. Ustanovite Node.js: https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] node_modules ne naideno. Zapuskayu npm install...
    call npm install
    if !errorlevel! neq 0 (
        echo [OSHIBKA] npm install ne udalsya.
        pause
        exit /b 1
    )
)

call npm run editor:smoke >nul 2>nul
if !errorlevel! neq 0 (
    echo [OSHIBKA] Static smoke ne proshel. Zapusti Run-AI-Node-Editor.bat dlya podrobnogo loga.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(%LAB_MANAGER_PORT%,%ENGINE_PORT%,%APP_PORT%); foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue ^| ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }" >nul 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node' -ArgumentList 'scripts/real_wargame_lab_manager.mjs' -WorkingDirectory '%SCRIPT_DIR%' -WindowStyle Hidden" >nul 2>nul

set "WAIT_MANAGER=0"
:waitmanager
if !WAIT_MANAGER! GEQ 20 (
    echo [OSHIBKA] Lab manager ne zapustilsya za 20 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:%LAB_MANAGER_PORT%/lab/health' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 goto :waitapp
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_MANAGER+=1
goto :waitmanager

:waitapp
set "WAIT_APP=0"
:waitapploop
if !WAIT_APP! GEQ 35 (
    echo [OSHIBKA] Igra ne zapustilas za 35 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -NoProfile -Command "try { Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 goto :openbrowser
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_APP+=1
goto :waitapploop

:openbrowser
start "" "http://127.0.0.1:%APP_PORT%/"
exit /b 0
