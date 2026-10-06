@echo off
chcp 65001 >nul
cd /d "%~dp0"

if not exist ".env" copy /y ".env.example" ".env" >nul

echo 正在用记事本打开 .env ...
echo 把 DeepSeek Key 粘到 DEEPSEEK_API_KEY= 后面，保存关闭即可（不用重启服务）。
echo.
notepad .env
