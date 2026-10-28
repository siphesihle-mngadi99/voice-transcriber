@echo off
title VoiceScribe - Audio Transcriber and Note Synthesizer
cd /d "%~dp0"
echo ============================================================
echo  Starting VoiceScribe with Global Cloudflare Tunnel...
echo ============================================================
.\.venv\Scripts\python.exe run.py --share
pause
