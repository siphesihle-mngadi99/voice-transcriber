// VoiceScribe Client Application
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // State
  let currentRecordingId = null;
  let currentSegments = [];
  let eventSource = null;
  let selectedFile = null;
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let targetRenameTag = null;

  // DOM Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const selectedFileBanner = document.getElementById("selectedFileBanner");
  const selectedFileName = document.getElementById("selectedFileName");
  const startTranscribeBtn = document.getElementById("startTranscribeBtn");
  const modelSelect = document.getElementById("modelSelect");
  const diarizationToggle = document.getElementById("diarizationToggle");
  const micRecordBtn = document.getElementById("micRecordBtn");
  const micLabel = document.getElementById("micLabel");
  const micIcon = document.getElementById("micIcon");

  // Progress UI
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressStatusText = document.getElementById("progressStatusText");
  const liveTranscriptPreview = document.getElementById("liveTranscriptPreview");

  // Transcript & Player UI
  const transcriptSection = document.getElementById("transcriptSection");
  const currentTitle = document.getElementById("currentTitle");
  const currentDuration = document.getElementById("currentDuration");
  const segmentCount = document.getElementById("segmentCount");
  const audioPlayer = document.getElementById("audioPlayer");
  const transcriptFeed = document.getElementById("transcriptFeed");
  const searchInput = document.getElementById("searchInput");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
  const historyList = document.getElementById("historyList");
  const recordingCount = document.getElementById("recordingCount");

  // Export UI
  const exportMenuBtn = document.getElementById("exportMenuBtn");
  const exportDropdown = document.getElementById("exportDropdown");

  // Rename Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // --- Initial Load ---
  loadRecordingsList();

  // --- File Drop & Select Handling ---
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-indigo-500", "bg-slate-900/80");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-indigo-500", "bg-slate-900/80");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-indigo-500", "bg-slate-900/80");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    selectedFile = file;
    selectedFileName.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
    selectedFileBanner.classList.remove("hidden");
    startTranscribeBtn.disabled = false;
  }

  // --- Mobile / Browser Voice Memo Recording ---
  micRecordBtn.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const recordedFile = new File([audioBlob], `Voice_Memo_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`, { type: "audio/webm" });
          handleFileSelected(recordedFile);
          stream.getTracks().forEach((t) => t.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micLabel.textContent = "Recording... Tap to Stop";
        micRecordBtn.classList.add("bg-rose-500/30", "border-rose-500", "recording-pulse");
      } catch (err) {
        alert("Microphone access was denied or not available: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      micLabel.textContent = "Record Voice Memo";
      micRecordBtn.classList.remove("bg-rose-500/30", "border-rose-500", "recording-pulse");
    }
  });

  // --- Upload & Ingestion Execution ---
  startTranscribeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    startTranscribeBtn.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span> Uploading audio to server...`;

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("model_name", modelSelect.value);
    formData.append("enable_diarization", diarizationToggle.checked);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }

      const data = await res.json();
      currentRecordingId = data.recording_id;

      // Subscribe to live SSE events
      subscribeToProgress(currentRecordingId);
      loadRecordingsList();
    } catch (err) {
      alert("Error starting transcription: " + err.message);
      startTranscribeBtn.disabled = false;
      progressContainer.classList.add("hidden");
    }
  });

  // --- Real-time Progress Tracking (SSE) ---
  function subscribeToProgress(recId) {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`/api/recordings/${recId}/events`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const progress = Math.max(0, Math.min(100, data.progress || 0));

        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;

        if (data.message) {
          progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span> ${data.message}`;
          liveTranscriptPreview.textContent = data.message;
        }

        if (progress >= 100) {
          eventSource.close();
          setTimeout(() => {
            progressContainer.classList.add("hidden");
            loadRecordingDetails(recId);
            loadRecordingsList();
          }, 800);
        } else if (progress < 0) {
          eventSource.close();
          progressStatusText.innerHTML = `<span class="text-rose-400">⚠️ Transcription failed: ${data.message}</span>`;
          startTranscribeBtn.disabled = false;
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    eventSource.onerror = () => {
      // Re-poll details if connection closes
      setTimeout(() => loadRecordingDetails(recId), 1500);
    };
  }

  // --- Load Recording Details & Render Transcript ---
  async function loadRecordingDetails(recId) {
    currentRecordingId = recId;
    try {
      const res = await fetch(`/api/recordings/${recId}`);
      if (!res.ok) throw new Error("Could not load recording details");

      const data = await res.json();
      const rec = data.recording;
      currentSegments = data.segments || [];

      // Update header
      currentTitle.textContent = rec.title || rec.filename;
      currentDuration.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5"></i> ${formatTime(rec.duration || 0)}`;
      segmentCount.textContent = `${currentSegments.length} segments`;

      // Set audio source
      audioPlayer.src = `/api/audio/${recId}`;
      transcriptSection.classList.remove("hidden");

      // Render transcript
      renderTranscript(currentSegments);
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Render Interactive Clickable Transcript ---
  function renderTranscript(segments) {
    transcriptFeed.innerHTML = "";

    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-sm text-slate-400 italic">No spoken dialogue detected in this recording.</p>`;
      return;
    }

    let lastSpeaker = null;
    let currentBlock = null;

    segments.forEach((seg, index) => {
      const speakerName = seg.speaker_name || seg.speaker || "Speaker 1";
      const speakerTag = seg.speaker || "Speaker 1";

      // Group consecutive sentences from the same speaker
      if (speakerName !== lastSpeaker) {
        lastSpeaker = speakerName;
        currentBlock = document.createElement("div");
        currentBlock.className = "bg-slate-900/40 border border-slate-800/80 rounded-xl p-3.5 space-y-2";

        const speakerHeader = document.createElement("div");
        speakerHeader.className = "flex items-center justify-between";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 text-xs font-semibold transition group";
        speakerBadge.title = "Click to rename this speaker";
        speakerBadge.innerHTML = `
          <i data-lucide="user" class="w-3 h-3"></i>
          <span>${escapeHtml(speakerName)}</span>
          <i data-lucide="edit-2" class="w-2.5 h-2.5 opacity-60 group-hover:opacity-100"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        speakerHeader.appendChild(speakerBadge);
        currentBlock.appendChild(speakerHeader);
        transcriptFeed.appendChild(currentBlock);
      }

      // Sentence segment
      const segItem = document.createElement("div");
      segItem.id = `segment-${index}`;
      segItem.className = "transcript-segment group flex items-start gap-2.5 p-2 rounded-lg border border-transparent hover:border-slate-700/80 hover:bg-slate-800/40 cursor-pointer";
      segItem.dataset.start = seg.start_time;
      segItem.dataset.end = seg.end_time;

      segItem.innerHTML = `
        <button class="timestamp-pill shrink-0 font-mono text-[11px] text-slate-400 group-hover:text-indigo-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/80 transition" title="Play from ${formatTime(seg.start_time)}">
          ${formatTime(seg.start_time)}
        </button>
        <p class="text-sm text-slate-200 group-hover:text-white leading-relaxed flex-1 select-text">
          ${escapeHtml(seg.text)}
        </p>
      `;

      // Click to jump audio player
      segItem.addEventListener("click", (e) => {
        // Prevent accidental triggers when selecting text
        if (window.getSelection().toString().length > 0) return;
        audioPlayer.currentTime = seg.start_time;
        audioPlayer.play();
      });

      currentBlock.appendChild(segItem);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Audio Player Time Synchronization (Karaoke Highlight) ---
  audioPlayer.addEventListener("timeupdate", () => {
    const curTime = audioPlayer.currentTime;
    let foundActive = false;

    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (!el) return;

      if (!foundActive && curTime >= seg.start_time && curTime <= seg.end_time) {
        if (!el.classList.contains("active-segment")) {
          // Remove previous active
          document.querySelectorAll(".active-segment").forEach((item) => item.classList.remove("active-segment"));
          el.classList.add("active-segment");
          // Smooth scroll active into view
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        foundActive = true;
      }
    });
  });

  // --- Playback Speed Control ---
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = parseFloat(btn.dataset.speed);
      audioPlayer.playbackRate = speed;
      document.querySelectorAll(".speed-btn").forEach((b) => {
        b.classList.remove("text-indigo-400", "font-bold");
        b.classList.add("text-slate-400");
      });
      btn.classList.add("text-indigo-400", "font-bold");
      btn.classList.remove("text-slate-400");
    });
  });

  // --- Rename Speaker Modal ---
  function openRenameModal(tag, currentName) {
    targetRenameTag = tag;
    speakerRenameInput.value = currentName;
    renameModal.classList.remove("hidden");
    speakerRenameInput.focus();
  }

  cancelRenameBtn.addEventListener("click", () => {
    renameModal.classList.add("hidden");
  });

  saveRenameBtn.addEventListener("click", async () => {
    const newName = speakerRenameInput.value.trim();
    if (!newName || !currentRecordingId || !targetRenameTag) return;

    try {
      const res = await fetch(`/api/recordings/${currentRecordingId}/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speaker_tag: targetRenameTag,
          display_name: newName,
        }),
      });

      if (!res.ok) throw new Error("Failed to rename speaker");

      renameModal.classList.add("hidden");
      // Reload recording to refresh tags
      loadRecordingDetails(currentRecordingId);
    } catch (err) {
      alert("Error renaming speaker: " + err.message);
    }
  });

  // --- Search / Filter Transcript ---
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (!el) return;

      if (!query || seg.text.toLowerCase().includes(query)) {
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    });
  });

  // --- Copy Full Transcript ---
  copyTranscriptBtn.addEventListener("click", () => {
    if (!currentSegments || currentSegments.length === 0) return;
    const fullText = currentSegments
      .map((s) => `[${formatTime(s.start_time)}] ${s.speaker_name || s.speaker || "Speaker"}: ${s.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(fullText).then(() => {
      const originalText = copyTranscriptBtn.innerHTML;
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-4 h-4 text-emerald-400"></i> Copied!`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyTranscriptBtn.innerHTML = originalText;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    });
  });

  // --- Export Dropdown Handling ---
  exportMenuBtn.addEventListener("click", () => {
    exportDropdown.classList.toggle("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!exportMenuBtn.contains(e.target) && !exportDropdown.contains(e.target)) {
      exportDropdown.classList.add("hidden");
    }
  });

  document.querySelectorAll(".export-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fmt = btn.dataset.format;
      if (!currentRecordingId) return;
      window.open(`/api/recordings/${currentRecordingId}/export?format=${fmt}`, "_blank");
      exportDropdown.classList.add("hidden");
    });
  });

  // --- Load Past History Sidebar ---
  async function loadRecordingsList() {
    try {
      const res = await fetch("/api/recordings");
      if (!res.ok) return;
      const list = await res.json();

      recordingCount.textContent = list.length;
      historyList.innerHTML = "";

      if (list.length === 0) {
        historyList.innerHTML = `<p class="text-xs text-slate-500 italic p-2">No recordings yet.</p>`;
        return;
      }

      list.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = `p-2.5 rounded-xl border border-slate-800/80 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-900 cursor-pointer transition flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-indigo-500/50 bg-indigo-500/10" : ""
        }`;

        itemEl.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-semibold text-slate-200 group-hover:text-white truncate">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>•</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition" title="Delete">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;

        itemEl.addEventListener("click", (e) => {
          if (e.target.closest(".delete-btn")) return;
          loadRecordingDetails(item.id);
        });

        const delBtn = itemEl.querySelector(".delete-btn");
        delBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (confirm("Delete this recording?")) {
            await fetch(`/api/recordings/${item.id}`, { method: "DELETE" });
            if (currentRecordingId === item.id) {
              transcriptSection.classList.add("hidden");
              currentRecordingId = null;
            }
            loadRecordingsList();
          }
        });

        historyList.appendChild(itemEl);
      });

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Network Share Link Copy ---
  const copyShareBtn = document.getElementById("copyShareBtn");
  if (copyShareBtn) {
    copyShareBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.origin).then(() => {
        copyShareBtn.textContent = "Copied!";
        setTimeout(() => (copyShareBtn.textContent = "Copy Link"), 2000);
      });
    });
  }

  // --- Helper Functions ---
  function formatTime(seconds) {
    const s = Math.floor(seconds || 0);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }
});
