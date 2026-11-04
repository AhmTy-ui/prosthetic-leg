@echo off
rem Double-click to start the dashboard (backend + web app), then open http://localhost:5173
cd /d "%~dp0"
if not exist node_modules call npm.cmd install
start "" http://localhost:5173
npm.cmd run dev
pause
