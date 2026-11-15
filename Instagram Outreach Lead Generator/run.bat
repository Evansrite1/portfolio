@echo off
title IG Scout (keep this window open while the app runs)
cd /d "%~dp0"
where python >nul 2>nul || (echo Python is not installed. Install Python 3.10 or newer from python.org, then run this again. & pause & exit /b 1)
python -c "import flask, playwright, openpyxl, requests, bs4, reportlab" >nul 2>nul || (
  echo First run: installing the pieces the app needs...
  python -m pip install -q flask playwright openpyxl requests beautifulsoup4 reportlab
)
python app.py
echo.
echo The app has stopped.
pause
