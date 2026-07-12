@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ============================================
echo  OpenCode launcher: Real-wargame-preview
echo ============================================
echo.

call opencode.cmd
exit /b %ERRORLEVEL%
