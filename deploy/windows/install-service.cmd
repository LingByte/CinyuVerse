@echo off
setlocal
if "%~1"=="" (
  echo Usage: install-service.cmd path\to\cinyuverse-server.exe
  exit /b 2
)
set "DATA=%PROGRAMDATA%\Cinyuverse"
set "WEB=%~dp1web"
mkdir "%DATA%" 2>nul
nssm install CinyuverseServer "%~1"
nssm set CinyuverseServer AppDirectory "%~dp1"
nssm set CinyuverseServer AppEnvironmentExtra CINYUVERSE_DATA_DIR="%DATA%" CINYUVERSE_STATIC_ROOT="%WEB%" CINYUVERSE_SERVER_LISTEN=127.0.0.1:17891
nssm set CinyuverseServer Start SERVICE_AUTO_START
nssm start CinyuverseServer
endlocal
