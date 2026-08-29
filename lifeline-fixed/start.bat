@echo off
setlocal
cd /d "%~dp0"
title Life-Line Server
if not exist data mkdir data

where py >nul 2>nul
if %errorlevel%==0 (
    py -3 server.py --logfile data\server.log %*
) else (
    python server.py --logfile data\server.log %*
)

echo.
echo [Life-Line] The server has stopped. Read any error above.
echo [Life-Line] Full log: data\server.log
pause
