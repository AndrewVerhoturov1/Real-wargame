@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  Real-wargame: обновление preview-папки
echo ============================================
echo.

set "PREVIEW_DIR=D:\Codex+opencode_new\Proect_C_O\Real-wargame-preview"
set "BRANCH=real-wargame-preview"

if not exist "%PREVIEW_DIR%" (
    echo Папка не найдена: %PREVIEW_DIR%
    echo.
    echo Сначала запустите setup-preview-folder.bat для создания папки.
    pause
    exit /b 1
)

if not exist "%PREVIEW_DIR%\.git" (
    echo Папка не является git-репозиторием.
    echo Пожалуйста, удалите или переименуйте её, затем запустите setup-preview-folder.bat.
    pause
    exit /b 1
)

cd /d "%PREVIEW_DIR%"

echo Текущая ветка:
git branch --show-current

echo.
echo Получаю обновления из GitHub...
git fetch origin %BRANCH% 2>nul

echo.
echo Обновляю локальную ветку (только fast-forward)...
git checkout %BRANCH% 2>nul
if errorlevel 1 (
    echo ВНИМАНИЕ: не удалось переключиться на ветку %BRANCH%.
    pause
    exit /b 1
)

git pull origin %BRANCH% --ff-only 2>nul
if errorlevel 1 (
    echo.
    echo Не удалось выполнить fast-forward pull.
    echo Это может быть из-за локальных изменений.
    echo.
    echo Варианты:
    echo 1. Сделайте commit локальных изменений
    echo 2. Отложите их через git stash
    echo 3. Если проблема в конфликте — обратитесь к Codex
    echo.
    echo Локальные изменения НЕ удалены.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Preview-папка обновлена.
echo  Ветка: %BRANCH%
echo  Путь: %PREVIEW_DIR%
echo ============================================
pause
exit /b 0
