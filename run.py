import socket
import sys
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
import uvicorn
from voice_transcriber.config import HOST, PORT

# Add cloudflared directory to PATH if not already there
CLOUDFLARED_DIR = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "cloudflared"
if CLOUDFLARED_DIR.exists() and str(CLOUDFLARED_DIR) not in os.environ.get("PATH", ""):
    os.environ["PATH"] += f";{CLOUDFLARED_DIR}"


def get_local_ip() -> str:
    """Finds the local network IP of this machine for mobile / Wi-Fi sharing."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def start_tunnel_thread(port: int, on_url_found):
    """Spawns cloudflared tunnel in the background and searches for the public HTTPS link."""
    cloudflared_bin = shutil.which("cloudflared")
    if not cloudflared_bin:
        fallback = CLOUDFLARED_DIR / "cloudflared.exe"
        if fallback.exists():
            cloudflared_bin = str(fallback)

    if not cloudflared_bin:
        print("\n [!] cloudflared executable not found. Running locally only.")
        return None

    cmd = [cloudflared_bin, "tunnel", "--url", f"http://localhost:{port}"]
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    def monitor():
        url_regex = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
        for line in proc.stdout:
            match = url_regex.search(line)
            if match:
                on_url_found(match.group(0))
                break

    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    return proc


def print_banner(public_url=None):
    local_ip = get_local_ip()
    print("\n" + "=" * 68)
    print("🎙️  VoiceScribe: Local-First Audio Transcriber & Note Synthesizer")
    print("=" * 68)
    print(f" ▸ Laptop (Local):      http://localhost:{PORT}")
    print(f" ▸ Home/Office Wi-Fi:   http://{local_ip}:{PORT}")
    if public_url:
        print(f" ▸ Global Public URL:   {public_url}  <-- [SHARE THIS!]")
        print("   (Works anywhere on 4G/5G mobile phones without Wi-Fi)")
    else:
        print(" 💡 To generate a global public link for friends:")
        print("    Run: python run.py --share")
    print("=" * 68)
    print(" Press Ctrl+C to stop the server.\n")


def main():
    share_mode = "--share" in sys.argv or "-s" in sys.argv
    tunnel_proc = None

    if share_mode:
        print(" Starting Cloudflare Tunnel... please wait a few seconds...")
        public_url_container = []

        def on_url(url):
            public_url_container.append(url)
            print_banner(public_url=url)

        tunnel_proc = start_tunnel_thread(PORT, on_url)

        # Give the tunnel up to 4 seconds to output the initial link
        for _ in range(20):
            if public_url_container:
                break
            time.sleep(0.2)

        if not public_url_container:
            print_banner()
    else:
        print_banner()

    try:
        uvicorn.run(
            "voice_transcriber.api.routes:app",
            host=HOST,
            port=PORT,
            log_level="warning",
        )
    finally:
        if tunnel_proc:
            print("\nShutting down Cloudflare Tunnel...")
            tunnel_proc.terminate()


if __name__ == "__main__":
    main()
