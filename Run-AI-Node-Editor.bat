@echo off
setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"
set "APP_PORT=5173"
set "ENGINE_PORT=8787"

echo =============================================
echo   Real-Wargame AI Node Editor Launcher
echo =============================================
echo.

echo [INFO] Zapusk vidimogo redaktora nod v novoy vkladke.
echo [INFO] Local AI engine schitaet otdelno ot brauzera: http://127.0.0.1:%ENGINE_PORT%/
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
echo [INFO] Proveryayu strukturu AI Node Editor...
call npm run editor:smoke
if !errorlevel! neq 0 (
    echo [OSHIBKA] Static smoke redaktora ne proshel.
    pause
    exit /b 1
)

echo.
echo [INFO] Ostanavlivayu starye processy na portah %ENGINE_PORT% i %APP_PORT%, esli est...
for %%p in (%ENGINE_PORT% %APP_PORT%) do (
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":%%p "') do (
        if not "%%a"=="0" (
            taskkill /f /pid %%a >nul 2>nul && echo [OK] Process s PID %%a na porte %%p ostanovlen.
        )
    )
)

echo [INFO] Zapuskayu local AI engine v novom okne...
start "Real-Wargame AI Engine" cmd /k "npm run engine:dev"

echo [INFO] Zapuskayu Vite dev-server v novom okne...
start "Real-Wargame Dev" cmd /c "npm run dev"

echo [INFO] Zhdu local AI engine...
set "WAIT_ENGINE=0"
:waitengine
if !WAIT_ENGINE! GEQ 25 (
    echo [OSHIBKA] Local AI engine ne zapustilsya za 25 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%ENGINE_PORT%/engine/health' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 (
    echo [OK] Local AI engine online.
    goto :waitappstart
)
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_ENGINE+=1
goto :waitengine

:waitappstart
echo [INFO] Zhdu Vite dev-server...
set "WAIT_APP=0"
:waitapp
if !WAIT_APP! GEQ 35 (
    echo [OSHIBKA] Vite dev-server ne zapustilsya za 35 sekund.
    pause
    exit /b 1
)
>nul 2>nul powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:%APP_PORT%/ai-node-editor.html' -UseBasicParsing -TimeoutSec 2; exit 0 } catch { exit 1 }"
if !errorlevel! equ 0 (
    echo [OK] AI Node Editor dostupen.
    goto :openbrowser
)
>nul 2>nul timeout /t 1 /nobreak
set /a WAIT_APP+=1
goto :waitapp

:openbrowser
echo [INFO] Otkryvayu redaktor nod v brauzere...
start http://127.0.0.1:%APP_PORT%/ai-node-editor.html

echo.
echo [GOTOVO] Redaktor nod zapushchen.
echo.
echo Chto proverit rukami:
echo 1. S leva est palitra FLOW / CONDITIONS / SCORES / QUERIES / ACTIONS.
echo 2. V centre vidny karty-nody i linii svyazey.
echo 3. Sprava inspector menyaetsya pri klike po node.
echo 4-5. Nazhmi knopku "Avtoproverka 4-5" vverhu redaktora.
echo      Vnizu dolzhno poyavitsya: "Punkt 4 OK" i "Punkt 5 OK".
echo.
echo Okna "Real-Wargame AI Engine" i "Real-Wargame Dev" ostavlyay otkrytymi, poka proveryaesh.
echo.
pause
exit /b 0
