@echo off
chcp 65001 >nul
title 苹果小镇 - 服务中（关掉这个窗口就停止服务）
cd /d "%~dp0"

echo ============================================
echo   苹果小镇 Apple Town
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 没找到 Node.js，请先安装：https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [提示] 没有找到 .env，正在从 .env.example 复制一份...
  copy /y ".env.example" ".env" >nul
  echo [提示] 想接真模型的话，双击「填写Key.bat」把 DeepSeek Key 粘进去。
  echo        不填也能玩，居民会用预置台词回答（演示模式）。
  echo.
)

echo 正在启动服务，起来之后会自动打开浏览器...
echo （这个窗口不要关，关了服务就停了）
echo.

REM --open 让服务在「真的开始监听之后」再打开浏览器，
REM 避免浏览器抢在服务前面打开、撞上"拒绝连接"
node server.js --open

echo.
echo 服务已停止。
pause
