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

echo [INFO] Osvobozhdayu porty i proektnye protsessy...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(%LAB_MANAGER_PORT%,%ENGINE_PORT%,%APP_PORT%); foreach($p in $ports){$c=Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue; foreach($x in $c){$ownerPid=$x.OwningProcess; if($ownerPid -and $ownerPid -ne 0){Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 400}}}; $project=[Regex]::Escape((Get-Location).Path); $all=Get-CimInstance Win32_Process -ErrorAction SilentlyContinue; foreach($proc in $all){if($proc.Name -in @('node.exe','esbuild.exe') -and $proc.CommandLine -and $proc.CommandLine -match $project){Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue}}" >nul 2>nul
>nul 2>nul timeout /t 1 /nobreak

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
        echo [INFO] npm ci ne smog udalit zablokirovannyy modul. Probuyu npm install bez polnoy ochistki...
        call npm install
        if !errorlevel! neq 0 (
            echo [OSHIBKA] Ne udalos vosstanovit zavisimosti ni cherez npm ci, ni cherez npm install.
            pause
            exit /b 1
        )
    )
)

call npm run editor:smoke >nul 2>nul
if !errorlevel! neq 0 (
    echo [OSHIBKA] Static smoke ne proshel. Zapusti Run-AI-Node-Editor.bat dlya podrobnogo loga.
    pause
    exit /b 1
)

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
