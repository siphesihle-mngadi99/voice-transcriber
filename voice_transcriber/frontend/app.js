// VoiceScribe Studio Client Application (Superrb-Inspired Edition)
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
  let recordingTimer = null;
  let recordingSeconds = 0;
  let targetRenameTag = null;
  let isDraggingScrubber = false;

  // DOM Elements - Ingestion
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

  // Workspace Sections & Toolbar
  const transcriptSection = document.getElementById("transcriptSection");
  const currentTitle = document.getElementById("currentTitle");
  const currentDuration = document.getElementById("currentDuration");
  const segmentCount = document.getElementById("segmentCount");
  const searchInput = document.getElementById("searchInput");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
  const exportMenuBtn = document.getElementById("exportMenuBtn");
  const exportDropdown = document.getElementById("exportDropdown");

  // Smart Tabs
  const tabTranscriptBtn = document.getElementById("tabTranscriptBtn");
  const tabSummaryBtn = document.getElementById("tabSummaryBtn");
  const tabAnalyticsBtn = document.getElementById("tabAnalyticsBtn");
  const tabTranscriptView = document.getElementById("tabTranscriptView");
  const tabSummaryView = document.getElementById("tabSummaryView");
  const tabAnalyticsView = document.getElementById("tabAnalyticsView");
  const transcriptFeed = document.getElementById("transcriptFeed");
  const actionItemsList = document.getElementById("actionItemsList");
  const outlineList = document.getElementById("outlineList");
  const speakerStatsFeed = document.getElementById("speakerStatsFeed");

  // Custom Floating Audio Console
  const audioPlayer = document.getElementById("audioPlayer");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipForwardBtn = document.getElementById("skipForwardBtn");
  const audioScrubber = document.getElementById("audioScrubber");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");
  const dockTitle = document.getElementById("dockTitle");
  const muteBtn = document.getElementById("muteBtn");
  const volumeIcon = document.getElementById("volumeIcon");

  // Drawer & Library
  const historyToggleBtn = document.getElementById("historyToggleBtn");
  const historyDrawer = document.getElementById("historyDrawer");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const historyList = document.getElementById("historyList");
  const recordingCountBadge = document.getElementById("recordingCountBadge");

  // Rename Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // Speaker Palette Mapping
  const SPEAKER_THEMES = [
    { class: "speaker-cobalt", dot: "bg-blue-400" },
    { class: "speaker-emerald", dot: "bg-emerald-400" },
    { class: "speaker-amber", dot: "bg-amber-400" },
    { class: "speaker-rose", dot: "bg-rose-400" },
  ];

  // --- Initial Setup ---
  loadRecordingsList();

  // --- File Drop & Select Handling ---
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-blue-500", "bg-white/[0.04]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-blue-500", "bg-white/[0.04]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-blue-500", "bg-white/[0.04]");
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
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    selectedFileName.textContent = `${file.name} (${mb} MB)`;
    selectedFileBanner.classList.remove("hidden");
    startTranscribeBtn.disabled = false;
  }

  // --- Mobile & Studio Voice Memo Recording ---
  micRecordBtn.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        recordingSeconds = 0;

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          const recordedFile = new File(
            [audioBlob],
            `Memo_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.webm`,
            { type: "audio/webm" }
          );
          handleFileSelected(recordedFile);
          stream.getTracks().forEach((t) => t.stop());
        };

        mediaRecorder.start();
        isRecording = true;
        micRecordBtn.classList.add("bg-rose-500/25", "border-rose-500", "recording-ring");

        recordingTimer = setInterval(() => {
          recordingSeconds++;
          const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
          const s = String(recordingSeconds % 60).padStart(2, "0");
          micLabel.textContent = `Recording ${m}:${s} • Tap to Stop`;
        }, 1000);

      } catch (err) {
        alert("Microphone permission required: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      clearInterval(recordingTimer);
      micLabel.textContent = "Record Voice Memo";
      micRecordBtn.classList.remove("bg-rose-500/25", "border-rose-500", "recording-ring");
    }
  });

  // --- Execute Transcription Upload ---
  startTranscribeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    startTranscribeBtn.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span> Ingesting audio stream...`;

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

      subscribeToProgress(currentRecordingId);
      loadRecordingsList();
    } catch (err) {
      alert("Pipeline initialization error: " + err.message);
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
          progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span> ${data.message}`;
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
          progressStatusText.innerHTML = `<span class="text-rose-400 font-semibold">⚠️ ${data.message}</span>`;
          startTranscribeBtn.disabled = false;
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    eventSource.onerror = () => {
      setTimeout(() => loadRecordingDetails(recId), 1500);
    };
  }

  // --- Load Recording Details ---
  async function loadRecordingDetails(recId) {
    currentRecordingId = recId;
    try {
      const res = await fetch(`/api/recordings/${recId}`);
      if (!res.ok) throw new Error("Could not load recording details");

      const data = await res.json();
      const rec = data.recording;
      currentSegments = data.segments || [];

      // Update Header & Dock
      currentTitle.textContent = rec.title || rec.filename;
      dockTitle.textContent = rec.title || rec.filename;
      currentDuration.innerHTML = `<i data-lucide="clock" class="w-3.5 h-3.5 text-blue-400"></i> ${formatTime(rec.duration || 0)}`;
      totalTimeDisplay.textContent = formatTime(rec.duration || 0);
      segmentCount.textContent = `${currentSegments.length} segments`;

      // Set audio source
      audioPlayer.src = `/api/audio/${recId}`;
      transcriptSection.classList.remove("hidden");

      // Render tab views
      renderTranscript(currentSegments);
      synthesizeSummary(currentSegments);
      renderSpeakerAnalytics(currentSegments);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Tab 1: Render Interactive Dialogue Transcript ---
  function renderTranscript(segments) {
    transcriptFeed.innerHTML = "";

    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-sm font-mono text-slate-500 italic p-4">No speech detected in this recording.</p>`;
      return;
    }

    const speakerMap = buildSpeakerColorMap(segments);
    let lastSpeaker = null;
    let currentBlock = null;

    segments.forEach((seg, index) => {
      const speakerName = seg.speaker_name || seg.speaker || "Speaker 1";
      const speakerTag = seg.speaker || "Speaker 1";
      const theme = speakerMap[speakerTag] || SPEAKER_THEMES[0];

      // New block when speaker changes
      if (speakerName !== lastSpeaker) {
        lastSpeaker = speakerName;
        currentBlock = document.createElement("div");
        currentBlock.className = "editorial-card rounded-2xl p-4 sm:p-5 space-y-2.5";

        const speakerHeader = document.createElement("div");
        speakerHeader.className = "flex items-center justify-between pb-2 border-b border-white/[0.04]";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = `flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-semibold border transition group ${theme.class}`;
        speakerBadge.title = "Click to rename this speaker across the session";

        // Initials avatar
        const initials = speakerName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        speakerBadge.innerHTML = `
          <span class="w-5 h-5 rounded-lg bg-white/[0.1] flex items-center justify-center font-mono text-[10px] font-bold">${initials}</span>
          <span class="font-display">${escapeHtml(speakerName)}</span>
          <i data-lucide="edit-3" class="w-3 h-3 opacity-50 group-hover:opacity-100 transition"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        speakerHeader.appendChild(speakerBadge);
        currentBlock.appendChild(speakerHeader);
        transcriptFeed.appendChild(currentBlock);
      }

      // Sentence segment
      const segItem = document.createElement("div");
      segItem.id = `segment-${index}`;
      segItem.className = "transcript-segment group flex items-start gap-3 p-2.5 rounded-xl cursor-pointer";
      segItem.dataset.start = seg.start_time;
      segItem.dataset.end = seg.end_time;

      segItem.innerHTML = `
        <button class="shrink-0 font-mono text-[11px] text-slate-500 group-hover:text-blue-400 bg-white/[0.03] group-hover:bg-white/[0.08] px-2 py-0.5 rounded-md border border-white/[0.05] transition" title="Play from ${formatTime(seg.start_time)}">
          ${formatTime(seg.start_time)}
        </button>
        <p class="text-sm text-slate-300 group-hover:text-white leading-relaxed flex-1 select-text font-light">
          ${escapeHtml(seg.text)}
        </p>
      `;

      // Click sentence to jump audio player
      segItem.addEventListener("click", () => {
        if (window.getSelection().toString().length > 0) return;
        audioPlayer.currentTime = seg.start_time;
        audioPlayer.play();
        setPlayingState(true);
      });

      currentBlock.appendChild(segItem);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Tab 2: Synthesize Executive Summary & Action Items ---
  function synthesizeSummary(segments) {
    actionItemsList.innerHTML = "";
    outlineList.innerHTML = "";

    if (!segments || segments.length === 0) {
      actionItemsList.innerHTML = `<li class="text-slate-500 font-mono text-xs italic">No items to summarize.</li>`;
      return;
    }

    const actionKeywords = ["action", "todo", "to do", "need to", "will", "deadline", "by tomorrow", "next week", "follow up", "decided", "agreed", "plan"];
    const actionItems = [];
    const outlineMap = {};

    segments.forEach((seg) => {
      const textLower = seg.text.toLowerCase();
      const speaker = seg.speaker_name || seg.speaker || "Speaker";

      if (actionKeywords.some((k) => textLower.includes(k))) {
        if (seg.text.length > 20 && actionItems.length < 8) {
          actionItems.push({ text: seg.text, speaker: speaker, time: seg.start_time });
        }
      }

      // Group outline by approximate 5-minute blocks
      const blockIndex = Math.floor(seg.start_time / 300);
      if (!outlineMap[blockIndex]) {
        outlineMap[blockIndex] = { start: seg.start_time, topics: [] };
      }
      if (outlineMap[blockIndex].topics.length < 2 && seg.text.length > 30) {
        outlineMap[blockIndex].topics.push(seg.text);
      }
    });

    // Populate Action Items
    if (actionItems.length === 0) {
      actionItemsList.innerHTML = `<li class="text-slate-500 font-mono text-xs italic">No explicit action keywords detected in this recording.</li>`;
    } else {
      actionItems.forEach((item) => {
        const li = document.createElement("li");
        li.className = "flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]";
        li.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0"></span>
          <div class="flex-1">
            <span class="font-mono text-[11px] text-blue-400 font-semibold">[${formatTime(item.time)}] ${escapeHtml(item.speaker)}:</span>
            <span class="text-slate-200 ml-1 leading-relaxed">${escapeHtml(item.text)}</span>
          </div>
        `;
        actionItemsList.appendChild(li);
      });
    }

    // Populate Outline
    Object.keys(outlineMap).forEach((block) => {
      const data = outlineMap[block];
      const div = document.createElement("div");
      div.className = "p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] space-y-1.5";
      div.innerHTML = `
        <div class="font-mono text-xs font-semibold text-emerald-400">Section @ ${formatTime(data.start)}</div>
        <p class="text-xs text-slate-300 leading-relaxed">${escapeHtml(data.topics.join(" "))}</p>
      `;
      outlineList.appendChild(div);
    });
  }

  // --- Tab 3: Speaker Analytics (Talk Time Breakdown) ---
  function renderSpeakerAnalytics(segments) {
    speakerStatsFeed.innerHTML = "";
    if (!segments || segments.length === 0) return;

    const stats = {};
    let totalSpokenTime = 0;

    segments.forEach((seg) => {
      const speaker = seg.speaker_name || seg.speaker || "Speaker 1";
      const dur = Math.max(0.5, (seg.end_time || 0) - (seg.start_time || 0));
      stats[speaker] = (stats[speaker] || 0) + dur;
      totalSpokenTime += dur;
    });

    const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const palette = ["bg-blue-500", "bg-emerald-400", "bg-amber-400", "bg-rose-400"];

    entries.forEach(([speaker, time], idx) => {
      const pct = totalSpokenTime > 0 ? ((time / totalSpokenTime) * 100).toFixed(1) : 0;
      const barColor = palette[idx % palette.length];

      const row = document.createElement("div");
      row.className = "space-y-1.5 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05]";
      row.innerHTML = `
        <div class="flex items-center justify-between text-xs font-mono">
          <span class="font-display font-semibold text-white">${escapeHtml(speaker)}</span>
          <span class="text-slate-400">${formatTime(time)} (${pct}%)</span>
        </div>
        <div class="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
          <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      speakerStatsFeed.appendChild(row);
    });
  }

  // --- Tab Switching Logic ---
  tabTranscriptBtn.addEventListener("click", () => switchTab("transcript"));
  tabSummaryBtn.addEventListener("click", () => switchTab("summary"));
  tabAnalyticsBtn.addEventListener("click", () => switchTab("analytics"));

  function switchTab(tab) {
    [tabTranscriptBtn, tabSummaryBtn, tabAnalyticsBtn].forEach((b) => {
      b.classList.remove("border-blue-500", "text-white");
      b.classList.add("border-transparent", "text-slate-400");
    });
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("border-blue-500", "text-white");
      tabTranscriptBtn.classList.remove("border-transparent", "text-slate-400");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("border-blue-500", "text-white");
      tabSummaryBtn.classList.remove("border-transparent", "text-slate-400");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("border-blue-500", "text-white");
      tabAnalyticsBtn.classList.remove("border-transparent", "text-slate-400");
      tabAnalyticsView.classList.remove("hidden");
    }
  }

  // --- Audio Dock Controls ---
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      audioPlayer.play();
      setPlayingState(true);
    } else {
      audioPlayer.pause();
      setPlayingState(false);
    }
  });

  function setPlayingState(playing) {
    if (playing) {
      playIcon.setAttribute("data-lucide", "pause");
    } else {
      playIcon.setAttribute("data-lucide", "play");
    }
    if (window.lucide) lucide.createIcons();
  }

  skipBackBtn.addEventListener("click", () => {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
  });

  skipForwardBtn.addEventListener("click", () => {
    audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 10);
  });

  audioPlayer.addEventListener("timeupdate", () => {
    const curTime = audioPlayer.currentTime;
    currentTimeDisplay.textContent = formatTime(curTime);

    if (!isDraggingScrubber && audioPlayer.duration) {
      audioScrubber.value = (curTime / audioPlayer.duration) * 100;
    }

    // Follow-along karaoke highlight
    let foundActive = false;
    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (!el) return;

      if (!foundActive && curTime >= seg.start_time && curTime <= seg.end_time) {
        if (!el.classList.contains("active-segment")) {
          document.querySelectorAll(".active-segment").forEach((item) => item.classList.remove("active-segment"));
          el.classList.add("active-segment");
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        foundActive = true;
      }
    });
  });

  audioScrubber.addEventListener("input", () => {
    isDraggingScrubber = true;
  });

  audioScrubber.addEventListener("change", () => {
    if (audioPlayer.duration) {
      audioPlayer.currentTime = (audioScrubber.value / 100) * audioPlayer.duration;
    }
    isDraggingScrubber = false;
  });

  // Spacebar shortcut for play/pause
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      playPauseBtn.click();
    }
  });

  // Playback Speed
  document.querySelectorAll(".speed-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const speed = parseFloat(btn.dataset.speed);
      audioPlayer.playbackRate = speed;
      document.querySelectorAll(".speed-btn").forEach((b) => {
        b.classList.remove("text-blue-400", "font-bold");
        b.classList.add("text-slate-400");
      });
      btn.classList.add("text-blue-400", "font-bold");
      btn.classList.remove("text-slate-400");
    });
  });

  // Mute Toggle
  muteBtn.addEventListener("click", () => {
    audioPlayer.muted = !audioPlayer.muted;
    if (audioPlayer.muted) {
      volumeIcon.setAttribute("data-lucide", "volume-x");
    } else {
      volumeIcon.setAttribute("data-lucide", "volume-2");
    }
    if (window.lucide) lucide.createIcons();
  });

  // --- Speaker Rename Modal ---
  function openRenameModal(tag, currentName) {
    targetRenameTag = tag;
    speakerRenameInput.value = currentName;
    renameModal.classList.remove("hidden");
    speakerRenameInput.focus();
  }

  cancelRenameBtn.addEventListener("click", () => renameModal.classList.add("hidden"));

  saveRenameBtn.addEventListener("click", async () => {
    const newName = speakerRenameInput.value.trim();
    if (!newName || !currentRecordingId || !targetRenameTag) return;

    try {
      const res = await fetch(`/api/recordings/${currentRecordingId}/speakers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speaker_tag: targetRenameTag, display_name: newName }),
      });

      if (!res.ok) throw new Error("Rename failed");

      renameModal.classList.add("hidden");
      loadRecordingDetails(currentRecordingId);
    } catch (err) {
      alert("Error: " + err.message);
    }
  });

  // --- Search / Filter Dialogue ---
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (!el) return;
      el.style.display = !q || seg.text.toLowerCase().includes(q) ? "" : "none";
    });
  });

  // --- Copy Full Transcript ---
  copyTranscriptBtn.addEventListener("click", () => {
    if (!currentSegments || currentSegments.length === 0) return;
    const fullText = currentSegments
      .map((s) => `[${formatTime(s.start_time)}] ${s.speaker_name || s.speaker || "Speaker"}: ${s.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(fullText).then(() => {
      const prev = copyTranscriptBtn.innerHTML;
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> Copied`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyTranscriptBtn.innerHTML = prev;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    });
  });

  // --- Export Dropdown ---
  exportMenuBtn.addEventListener("click", () => exportDropdown.classList.toggle("hidden"));

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

  // --- Past Sessions Drawer ---
  historyToggleBtn.addEventListener("click", () => historyDrawer.classList.remove("translate-x-full"));
  closeDrawerBtn.addEventListener("click", () => historyDrawer.classList.add("translate-x-full"));

  async function loadRecordingsList() {
    try {
      const res = await fetch("/api/recordings");
      if (!res.ok) return;
      const list = await res.json();

      recordingCountBadge.textContent = list.length;
      historyList.innerHTML = "";

      if (list.length === 0) {
        historyList.innerHTML = `<p class="text-xs font-mono text-slate-500 italic p-3">No sessions archived yet.</p>`;
        return;
      }

      list.forEach((item) => {
        const itemEl = document.createElement("div");
        itemEl.className = `p-3 rounded-xl border border-white/[0.08] hover:border-white/[0.18] bg-white/[0.02] hover:bg-white/[0.05] cursor-pointer transition flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-blue-500/60 bg-blue-500/10" : ""
        }`;

        itemEl.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-display font-semibold text-slate-200 group-hover:text-white truncate">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] font-mono text-slate-500 mt-1">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>•</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition" title="Delete session">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;

        itemEl.addEventListener("click", (e) => {
          if (e.target.closest(".delete-btn")) return;
          loadRecordingDetails(item.id);
          historyDrawer.classList.add("translate-x-full");
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
  function buildSpeakerColorMap(segments) {
    const map = {};
    let idx = 0;
    segments.forEach((s) => {
      const tag = s.speaker || "Speaker 1";
      if (!map[tag]) {
        map[tag] = SPEAKER_THEMES[idx % SPEAKER_THEMES.length];
        idx++;
      }
    });
    return map;
  }

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
