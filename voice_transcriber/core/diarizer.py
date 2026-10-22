import subprocess
import shutil
from pathlib import Path
from typing import List, Dict, Any
import numpy as np
from sklearn.cluster import AgglomerativeClustering
from voice_transcriber.core.audio import get_ffmpeg_path


def extract_segment_features(audio_path: Path, start: float, duration: float) -> np.ndarray:
    """Extracts acoustic spectral and energy features for a specific audio slice
    using FFmpeg and numpy, running smoothly on CPU without external weights.
    """
    ffmpeg_bin = get_ffmpeg_path()
    # Extract 16kHz mono raw s16le PCM for the given window
    cmd = [
        ffmpeg_bin,
        "-nostdin",
        "-ss", str(max(0.0, start)),
        "-t", str(max(0.1, duration)),
        "-i", str(audio_path),
        "-f", "s16le",
        "-ac", "1",
        "-ar", "16000",
        "-",
    ]

    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not proc.stdout:
        return np.zeros(32, dtype=np.float32)

    raw = np.frombuffer(proc.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    if len(raw) < 160:
        return np.zeros(32, dtype=np.float32)

    # Compute FFT magnitude spectrum
    window = np.hanning(min(len(raw), 2048))
    signal_slice = raw[:len(window)] * window
    fft_vals = np.abs(np.fft.rfft(signal_slice))

    # Divide spectrum into 16 frequency bands (bark-scale approximation)
    bands = np.array_split(fft_vals, 16)
    band_energies = [np.mean(b) if len(b) > 0 else 0.0 for b in bands]

    # Temporal dynamics: RMS energy, zero-crossing rate, variance
    rms = np.sqrt(np.mean(raw**2))
    zcr = np.mean(np.abs(np.diff(np.sign(raw)))) / 2.0
    spectral_centroid = np.sum(np.arange(len(fft_vals)) * fft_vals) / (np.sum(fft_vals) + 1e-9)

    # Feature vector normalized
    features = np.array(band_energies + [rms, zcr, spectral_centroid / 1000.0], dtype=np.float32)
    norm = np.linalg.norm(features)
    if norm > 1e-6:
        features = features / norm

    # Pad or truncate to fixed 32 dimensions
    padded = np.zeros(32, dtype=np.float32)
    padded[:min(len(features), 32)] = features[:32]
    return padded


def diarize_segments(
    audio_path: Path,
    segments: List[Dict[str, Any]],
    num_speakers: int = 0,
    distance_threshold: float = 0.45,
) -> List[Dict[str, Any]]:
    """Assigns speaker labels (Speaker 1, Speaker 2, ...) to transcribed segments
    using acoustic feature extraction and Agglomerative Clustering.
    
    If num_speakers is 0, the number of speakers is automatically estimated
    using distance_threshold.
    """
    if not segments:
        return []

    if len(segments) == 1:
        segments[0]["speaker"] = "Speaker 1"
        return segments

    features_list = []
    valid_indices = []

    for idx, seg in enumerate(segments):
        start = seg.get("start", 0.0)
        end = seg.get("end", 0.0)
        dur = max(0.2, end - start)

        feat = extract_segment_features(audio_path, start, dur)
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
