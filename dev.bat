@echo off
REM Batch file to manage Docker services for fictional-bassoon
REM Usage: dev.bat [command]

setlocal enabledelayedexpansion

set "COMPOSE_FILE=docker/docker-compose.yml"

REM If no argument provided, show help
if "%1"=="" (
    call :help
    exit /b 0
)

REM Route to appropriate command
if /i "%1"=="help" (
    call :help
) else if /i "%1"=="all" (
    call :build
) else if /i "%1"=="test" (
    call :test
) else if /i "%1"=="up" (
    call :up
) else if /i "%1"=="up-build" (
    call :up_build
) else if /i "%1"=="down" (
    call :down
) else if /i "%1"=="build" (
    call :build
) else if /i "%1"=="restart" (
    call :restart
) else if /i "%1"=="logs" (
    call :logs
) else if /i "%1"=="clean" (
    call :clean
) else if /i "%1"=="prune" (
    call :prune
) else (
    echo Unknown command: %1
    echo Run 'dev.bat help' for usage information.
    exit /b 1
)
exit /b 0

:help
echo Usage: dev.bat [command]
echo.
echo Commands:
echo   help          - Show this help message
echo   all           - Alias to build ^(default target^)
echo   test          - Run tests ^(placeholder^)
echo   up            - Start all services ^(detached^)
echo   up-build      - Rebuild and start all services ^(detached^)
echo   down          - Stop services and remove containers
echo   build         - Rebuild all images
echo   restart       - Restart all services
echo   logs          - Follow logs for all services
echo   clean         - Deep clean: stop services, remove volumes, and images
echo   prune         - System-wide Docker cleanup
goto :eof

:test
echo Test target placeholder - exits successfully
exit /b 0

:up
echo Starting services...
docker compose -f %COMPOSE_FILE% up -d
if errorlevel 1 exit /b 1
echo Services started successfully!
goto :eof

:up_build
echo Rebuilding and starting services...
docker compose -f %COMPOSE_FILE% up -d --build
if errorlevel 1 exit /b 1
echo Services rebuilt and started successfully!
goto :eof

:down
echo Stopping services...
docker compose -f %COMPOSE_FILE% down --remove-orphans
if errorlevel 1 exit /b 1
echo Services stopped successfully!
goto :eof

:build
echo Building images...
docker compose -f %COMPOSE_FILE% build
if errorlevel 1 exit /b 1
echo Images built successfully!
goto :eof

:restart
echo Restarting services...
docker compose -f %COMPOSE_FILE% restart
if errorlevel 1 exit /b 1
echo Services restarted successfully!
goto :eof

:logs
echo Following logs... ^(Press Ctrl+C to stop^)
docker compose -f %COMPOSE_FILE% logs -f
goto :eof

:clean
echo Deep cleaning: stopping services, removing volumes and images...
docker compose -f %COMPOSE_FILE% down -v --remove-orphans --rmi local
if errorlevel 1 exit /b 1
echo Clean completed successfully!
goto :eof

:prune
echo Running system-wide Docker cleanup...
docker system prune -f
docker image prune -f
echo Prune completed successfully!
goto :eof
