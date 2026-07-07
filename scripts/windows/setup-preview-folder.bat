@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  Real-wargame: настройка preview-папки
echo ============================================
echo.

set "PREVIEW_DIR=D:\Codex+opencode_new\Proect_C_O\Real-wargame-preview"
set "BRANCH=real-wargame-preview"
set "REPO_URL=https://github.com/AndrewVerhoturov1/Real-wargame.git"

if not exist "%PREVIEW_DIR%" (
    echo Папка не найдена. Создаю клон из GitHub...
    git clone --branch %BRANCH% %REPO_URL% "%PREVIEW_DIR%"
    if errorlevel 1 (
        echo ОШИБКА: не удалось клонировать репозиторий.
        pause
        exit /b 1
    )
    echo Готово. Preview-папка создана и настроена на ветку %BRANCH%.
    pause
    exit /b 0
)

echo Папка существует. Проверяю, является ли она git-репозиторием...
if not exist "%PREVIEW_DIR%\.git" (
    echo Папка существует, но не содержит .git.
    echo.
    echo Чтобы не потерять ваши файлы, я не буду удалять папку.
    echo Пожалуйста, удалите или переименуйте её вручную, затем запустите скрипт снова.
    pause
    exit /b 1
)

echo Обновляю существующий репозиторий...
cd /d "%PREVIEW_DIR%"
echo Переключаюсь на ветку %BRANCH%...
git fetch origin %BRANCH% 2>nul
git checkout %BRANCH% 2>nul
if errorlevel 1 (
    echo ВНИМАНИЕ: не удалось переключиться на ветку %BRANCH%.
    echo Возможно, ветка не существует на удалённом репозитории.
    pause
    exit /b 1
)
git pull origin %BRANCH% --ff-only 2>nul
if errorlevel 1 (
    echo ВНИМАНИЕ: не удалось выполнить pull (возможно, есть локальные изменения).
    echo Локальные изменения сохранены. Выполните commit или stash вручную.
    pause
    exit /b 1
)

echo ============================================
echo  Preview-папка обновлена до последней версии %BRANCH%.
echo  Путь: %PREVIEW_DIR%
echo ============================================
pause
exit /b 0
