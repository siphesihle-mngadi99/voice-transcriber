import socket
import sys
import uvicorn
from voice_transcriber.config import HOST, PORT


def get_local_ip() -> str:
    """Finds the local network IP of this machine for mobile / Wi-Fi sharing."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Doesn't need to be reachable, triggers OS to select the active interface IP
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def print_banner():
    local_ip = get_local_ip()
    print("=" * 65)
    print("🎙️  VoiceScribe: Local-First Audio Transcriber & Note Synthesizer")
    print("=" * 65)
    print(f" ▸ Local Access:     http://localhost:{PORT}")
    print(f" ▸ Mobile / Wi-Fi:   http://{local_ip}:{PORT}")
    print("=" * 65)
    print(" 💡 To share with friends anywhere over the Internet (Zero-Cost):")
    print(f"    cloudflared tunnel --url http://localhost:{PORT}")
    print("=" * 65)
    print(" Press Ctrl+C to stop the server.\n")


def main():
    print_banner()
    uvicorn.run(
        "voice_transcriber.api.routes:app",
        host=HOST,
        port=PORT,
        log_level="info",
    )


if __name__ == "__main__":
    main()
