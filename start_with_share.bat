@echo off
title VoiceScribe - Local Audio Transcriber
cd /d "%~dp0"
echo Starting VoiceScribe with Global Cloudflare Tunnel...
.\.venv\Scripts\python.exe run.py --share
pause
