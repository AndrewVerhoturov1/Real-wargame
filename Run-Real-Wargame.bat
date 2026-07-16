@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

set "PORT=5173"
set "OPEN_BROWSER=1"

if "%~1"=="--no-browser" set "OPEN_BROWSER=0"

echo =============================================
echo   Real-Wargame Tactical Board Launcher
echo =============================================
echo.

:: ---- npm check ----
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [OSHIBKA] npm ne naiden. Ustanovite Node.js: https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] npm naiden.

:: ---- stop stale server process tree before dependency refresh ----
echo [INFO] Osvobozhdayu port %PORT% pred obnovleniem zavisimostey...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%PORT% "') do (
    if not "%%a"=="0" (
        taskkill /f /t /pid %%a >nul 2>nul && echo [OK] Process tree s PID %%a ostanovlen.
    )
)
>nul 2>nul timeout /t 1 /nobreak

:: ---- dependency consistency check ----
set "INSTALL_DEPENDENCIES=0"
if not exist "node_modules\" (
    set "INSTALL_DEPENDENCIES=1"
) else (
    call npm ls --depth=0 >nul 2>nul
    if !errorlevel! neq 0 set "INSTALL_DEPENDENCIES=1"
)

if "!INSTALL_DEPENDENCIES!"=="1" (
    echo [INFO] Zavisimosti otsutstvuyut ili ne sootvetstvuyut package-lock.json. Zapuskayu npm ci...
    call npm ci
    if !errorlevel! neq 0 (
        echo [OSHIBKA] npm ci ne udalsya.
        pause
        exit /b 1
    )
    echo [OK] npm ci zavershen.
) else (
    echo [OK] zavisimosti sootvetstvuyut package-lock.json.
)

:: ---- start dev server in new window ----
echo [INFO] Zapuskayu dev-server v novom okne...
start "Real-Wargame Dev" cmd /c "npm run dev"

:: ---- wait for server, then open browser ----
set "WAIT_COUNT=0"
:waitloop
if !WAIT_COUNT! GEQ 30 (
    echo [OSHIBKA] Server ne zapustilsya za 30 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%PORT%/' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 (
    echo [OK] Server zapushchen na http://127.0.0.1:%PORT%/
    if "!OPEN_BROWSER!"=="1" (
        echo [INFO] Otkryvayu brauzer...
        start http://127.0.0.1:%PORT%/
    )
    goto :done
)
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_COUNT+=1
goto :waitloop

:done
echo.
echo [GOTOVO] Okno servera mozhno zakryt cherez Ctrl+C v nem.
if "!OPEN_BROWSER!"=="1" (
    pause
)
exit /b 0
