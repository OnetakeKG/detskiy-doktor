@echo off
rem Launches the game in a separate app window (Microsoft Edge app mode).
set "GAME=%~dp0index.html"
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app="file:///%GAME:\=/%" --window-size=1366,860
) else (
  start "" "%GAME%"
)
