import wave
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Tuple
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from voice_transcriber.core.audio import get_ffmpeg_path


def load_audio_mono_16k(audio_path: Path) -> Tuple[np.ndarray, int]:
    """Loads a normalized 16kHz WAV file into an in-memory float32 numpy array.
    Runs instantaneously without spawning child processes.
    """
    try:
        with wave.open(str(audio_path), "rb") as wf:
            sr = wf.getframerate()
            nframes = wf.getnframes()
            data = np.frombuffer(wf.readframes(nframes), dtype=np.int16).astype(np.float32) / 32768.0
            return data, sr
    except Exception:
        # Fallback to FFmpeg stream decoding if wave fails
        ffmpeg_bin = get_ffmpeg_path()
        cmd = [
            ffmpeg_bin,
            "-nostdin",
            "-i", str(audio_path),
            "-f", "s16le",
            "-ac", "1",
            "-ar", "16000",
            "-",
        ]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode != 0 or not proc.stdout:
            return np.zeros(0, dtype=np.float32), 16000
        data = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
        return data, 16000


def compute_audio_features(raw: np.ndarray) -> np.ndarray:
    """Computes acoustic spectral and energy features on an in-memory audio slice."""
    if len(raw) < 160:
        return np.zeros(32, dtype=np.float32)

    # Compute FFT magnitude spectrum
    window = np.hanning(min(len(raw), 2048))
    signal_slice = raw[:len(window)] * window
    fft_vals = np.abs(np.fft.rfft(signal_slice))

    # Divide spectrum into 16 frequency bands (bark-scale approximation)
    bands = np.array_split(fft_vals, 16)
    band_energies = [float(np.mean(b)) if len(b) > 0 else 0.0 for b in bands]

    # Temporal dynamics: RMS energy, zero-crossing rate, spectral centroid
    rms = float(np.sqrt(np.mean(raw**2)))
    zcr = float(np.mean(np.abs(np.diff(np.sign(raw)))) / 2.0)
    spectral_centroid = float(np.sum(np.arange(len(fft_vals)) * fft_vals) / (np.sum(fft_vals) + 1e-9))

    # Feature vector normalized
    features = np.array(band_energies + [rms, zcr, spectral_centroid / 1000.0], dtype=np.float32)
    norm = np.linalg.norm(features)
    if norm > 1e-6:
        features = features / norm

    # Pad or truncate to fixed 32 dimensions
    padded = np.zeros(32, dtype=np.float32)
    padded[:min(len(features), 32)] = features[:32]
    return padded


def extract_segment_features(audio_path: Path, start: float, duration: float) -> np.ndarray:
    """Backwards-compatible feature extractor for single audio slices."""
    audio_data, sr = load_audio_mono_16k(audio_path)
    if len(audio_data) == 0:
        return np.zeros(32, dtype=np.float32)
    start_sample = int(max(0.0, start) * sr)
    end_sample = min(len(audio_data), int(max(0.0, start + duration) * sr))
    return compute_audio_features(audio_data[start_sample:end_sample])


def diarize_segments(
    audio_path: Path,
    segments: List[Dict[str, Any]],
    num_speakers: int = 0,
    distance_threshold: float = 0.45,
) -> List[Dict[str, Any]]:
    """Assigns speaker labels (Speaker 1, Speaker 2, ...) to transcribed segments
    using in-memory acoustic feature extraction and Agglomerative Clustering.
    """
    if not segments:
        return []

    if len(segments) == 1:
        segments[0]["speaker"] = "Speaker 1"
        return segments

    # Load audio file ONCE in memory instead of spawning hundreds of FFmpeg processes
    audio_data, sr = load_audio_mono_16k(audio_path)
    if len(audio_data) == 0:
        for seg in segments:
            seg["speaker"] = "Speaker 1"
        return segments

    features_list = []
    valid_indices = []

    for idx, seg in enumerate(segments):
        start = seg.get("start", 0.0)
        end = seg.get("end", 0.0)
        dur = max(0.2, end - start)

        start_sample = int(max(0.0, start) * sr)
        end_sample = min(len(audio_data), int(max(0.0, start + dur) * sr))
        raw_slice = audio_data[start_sample:end_sample]

        feat = compute_audio_features(raw_slice)
        if np.any(feat):
            features_list.append(feat)
            valid_indices.append(idx)

    if not features_list or len(features_list) < 2:
        for seg in segments:
            seg["speaker"] = "Speaker 1"
        return segments

    X = np.vstack(features_list)

    # Choose clustering mode: fixed k or automatic threshold distance
    if num_speakers and num_speakers > 1:
        n_clusters = min(num_speakers, len(X))
        clustering = AgglomerativeClustering(
            n_clusters=n_clusters,
            metric="cosine",
            linkage="average",
        )
    else:
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=distance_threshold,
            metric="cosine",
            linkage="average",
        )

    labels = clustering.fit_predict(X)

    # Map cluster index 0, 1, 2 to human-readable 'Speaker 1', 'Speaker 2', etc.
    label_map = {}
    speaker_counter = 1

    for label in labels:
        if label not in label_map:
            label_map[label] = f"Speaker {speaker_counter}"
            speaker_counter += 1

    # Default all to Speaker 1 first
    for seg in segments:
        seg["speaker"] = "Speaker 1"

    # Assign predicted labels to valid segments
    for idx_in_valid, orig_idx in enumerate(valid_indices):
        predicted_cluster = labels[idx_in_valid]
        segments[orig_idx]["speaker"] = label_map[predicted_cluster]

    return segments
