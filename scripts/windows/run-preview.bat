@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  Real-wargame: запуск preview
echo ============================================
echo.

set "PREVIEW_DIR=D:\Codex+opencode_new\Proect_C_O\Real-wargame-preview"
set "LAUNCHER=Run-Real-Wargame.bat"

if not exist "%PREVIEW_DIR%" (
    echo Папка не найдена: %PREVIEW_DIR%
    echo.
    echo Сначала запустите setup-preview-folder.bat для создания папки.
    pause
    exit /b 1
)

if not exist "%PREVIEW_DIR%\%LAUNCHER%" (
    echo Файл %LAUNCHER% не найден в %PREVIEW_DIR%
    echo.
    echo Возможно, проект ещё не настроен для запуска или лаунчер не добавлен в репозиторий.
    echo Обратитесь к Codex за инструкциями.
    pause
    exit /b 1
)

echo Запускаю %LAUNCHER% из preview-папки...
echo.
cd /d "%PREVIEW_DIR%"
call "%LAUNCHER%"

echo.
echo ============================================
echo  Preview запущен. Проверьте результат.
echo  Если всё работает — скажите «ГОДИТСЯ» (GO).
echo  Если нужно доработать — скажите «ДОРАБОТАТЬ» (NO-GO).
echo ============================================
pause
exit /b 0
