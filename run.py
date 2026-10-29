import socket
import sys
import os
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from voice_transcriber.config import HOST, PORT

# Add cloudflared directory to PATH if not already there
CLOUDFLARED_DIR = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "cloudflared"
if CLOUDFLARED_DIR.exists() and str(CLOUDFLARED_DIR) not in os.environ.get("PATH", ""):
    os.environ["PATH"] += f";{CLOUDFLARED_DIR}"


def free_port(port: int):
    """Frees the port if an orphaned process is holding it from a previous run."""
    try:
        current_pid = os.getpid()
        if sys.platform == "win32":
            cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"'
            out = subprocess.check_output(cmd, shell=True, text=True).strip()
            if out:
                for p in out.splitlines():
                    p = p.strip()
                    if p.isdigit():
                        pid = int(p)
                        if pid != current_pid and pid != 0:
                            subprocess.run(f"taskkill /F /PID {pid}", shell=True, capture_output=True)
                time.sleep(0.5)
        else:
            cmd = f"lsof -t -i:{port}"
            out = subprocess.check_output(cmd, shell=True, text=True).strip()
            if out:
                for p in out.splitlines():
                    p = p.strip()
                    if p.isdigit():
                        pid = int(p)
                        if pid != current_pid and pid != 0:
                            subprocess.run(f"kill -9 {pid}", shell=True, capture_output=True)
                time.sleep(0.5)
    except Exception:
        pass


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


def start_ngrok_tunnel(port: int, authtoken: str, domain: Optional[str] = None) -> Optional[str]:
    """Starts an ngrok tunnel using pyngrok with optional permanent custom domain."""
    try:
        from pyngrok import ngrok
        ngrok.set_auth_token(authtoken.strip())
        options = {"proto": "http", "addr": port}
        if domain and domain.strip():
            clean_dom = domain.strip().replace("https://", "").replace("http://", "").rstrip("/")
            options["domain"] = clean_dom
        tunnel = ngrok.connect(**options)
        return str(tunnel.public_url).replace("http://", "https://")
    except Exception as e:
        print(f" [!] Ngrok tunnel initialization failed: {e}")
        return None


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
        found_url = False
        for line in proc.stdout:
            if not found_url:
                match = url_regex.search(line)
                if match:
                    on_url_found(match.group(0))
                    found_url = True

    t = threading.Thread(target=monitor, daemon=True)
    t.start()
    return proc


def print_banner(public_url=None):
    local_ip = get_local_ip()
    print("\n" + "=" * 68)
    print(" [VoiceScribe] Audio Transcriber & Note Synthesizer")
    print("=" * 68)
    print(f" > Laptop (Local):      http://localhost:{PORT}")
    print(f" > Home/Office Wi-Fi:   http://{local_ip}:{PORT}")
    if public_url:
        print(f" > Global Public URL:   {public_url}  <-- [SHARE THIS!]")
        print("   (Works anywhere on 4G/5G mobile phones without Wi-Fi)")
    else:
        print(" [!] To generate a global public link for mobile / remote access:")
        print("    Run: python run.py --share")
    print("=" * 68)
    print(" Press Ctrl+C to stop the server.\n")


def main():
    # Automatically clear stale connections on port 8000
    free_port(PORT)

    share_mode = "--share" in sys.argv or "-s" in sys.argv
    tunnel_proc = None
    ngrok_active = False

    ngrok_token = os.getenv("NGROK_AUTHTOKEN", "").strip()
    ngrok_domain = os.getenv("NGROK_DOMAIN", "").strip()

    if share_mode:
        if ngrok_token:
            print(" Starting Permanent Ngrok Tunnel...")
            public_url = start_ngrok_tunnel(PORT, ngrok_token, ngrok_domain)
            if public_url:
                ngrok_active = True
                print_banner(public_url=public_url)
            else:
                print(" [!] Falling back to Cloudflare Tunnel...")
                public_url_container = []

                def on_url(url):
                    public_url_container.append(url)
                    print_banner(public_url=url)

                tunnel_proc = start_tunnel_thread(PORT, on_url)
                for _ in range(20):
                    if public_url_container:
                        break
                    time.sleep(0.2)
                if not public_url_container:
                    print_banner()
        else:
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
            reload=True,
        )
    finally:
        if tunnel_proc:
            print("\nShutting down Cloudflare Tunnel...")
            tunnel_proc.terminate()
        if ngrok_active:
            try:
                from pyngrok import ngrok
                print("\nShutting down Ngrok Tunnel...")
                ngrok.kill()
            except Exception:
                pass


if __name__ == "__main__":
    main()
