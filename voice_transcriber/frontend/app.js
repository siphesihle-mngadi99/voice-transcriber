// VoiceScribe — Apple Product & Voice Memos Edition
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // State
  let currentRecordingId = null;
  let currentSegments = [];
  let eventSource = null;
  let selectedFile = null;
  let selectedModel = "base";
  let targetRenameTag = null;
  let isDraggingScrubber = false;

  // Audio & Mic State
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingTimer = null;
  let recordingSeconds = 0;
  let audioCtx = null;
  let analyser = null;
  let micStream = null;
  let animationFrameId = null;
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
  let currentSpeedIdx = 0;

  // DOM Elements - Navigation & Library
  const historyToggleBtn = document.getElementById("historyToggleBtn");
  const historyDrawer = document.getElementById("historyDrawer");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const historyList = document.getElementById("historyList");
  const recordingCountBadge = document.getElementById("recordingCountBadge");
  const copyShareBtn = document.getElementById("copyShareBtn");

  // Ingestion Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const selectedFileBanner = document.getElementById("selectedFileBanner");
  const selectedFileName = document.getElementById("selectedFileName");
  const clearFileBtn = document.getElementById("clearFileBtn");
  const micRecordCard = document.getElementById("micRecordCard");
  const micRecordBtn = document.getElementById("micRecordBtn");
  const micInnerDot = document.getElementById("micInnerDot");
  const micLabel = document.getElementById("micLabel");
  const micSubtext = document.getElementById("micSubtext");
  const diarizationToggle = document.getElementById("diarizationToggle");
  const startTranscribeBtn = document.getElementById("startTranscribeBtn");
  const waveformCanvas = document.getElementById("waveformCanvas");
  const canvasCaption = document.getElementById("canvasCaption");

  // Progress Elements
  const progressContainer = document.getElementById("progressContainer");
  const progressBar = document.getElementById("progressBar");
  const progressPercent = document.getElementById("progressPercent");
  const progressStatusText = document.getElementById("progressStatusText");
  const liveTranscriptPreview = document.getElementById("liveTranscriptPreview");

  // Workspace Elements
  const transcriptSection = document.getElementById("transcriptSection");
  const currentTitle = document.getElementById("currentTitle");
  const currentDuration = document.getElementById("currentDuration");
  const segmentCount = document.getElementById("segmentCount");
  const searchInput = document.getElementById("searchInput");
  const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
  const exportMenuBtn = document.getElementById("exportMenuBtn");
  const exportDropdown = document.getElementById("exportDropdown");

  // Tabs
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

  // Floating Player Elements
  const audioPlayer = document.getElementById("audioPlayer");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipForwardBtn = document.getElementById("skipForwardBtn");
  const audioScrubber = document.getElementById("audioScrubber");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");
  const speedCycleBtn = document.getElementById("speedCycleBtn");

  // Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // Speaker Color Palettes (Apple Pastel Neon)
  const SPEAKER_COLORS = [
    { badge: "bg-blue-500/15 text-blue-400 border-blue-500/30", dot: "bg-blue-500" },
    { badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-500" },
    { badge: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-500" },
    { badge: "bg-purple-500/15 text-purple-400 border-purple-500/30", dot: "bg-purple-500" },
  ];

  // --- Initial Canvas Waveform Setup ---
  initWaveformCanvas();
  loadRecordingsList();

  function initWaveformCanvas() {
    const ctx = waveformCanvas.getContext("2d");
    let phase = 0;

    function drawIdle() {
      if (isRecording) return; // Managed by mic analyser
      ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
      const width = waveformCanvas.width;
      const height = waveformCanvas.height;
      const bars = 48;
      const barWidth = width / bars - 2;

      for (let i = 0; i < bars; i++) {
        // Subtle sine wave idle pulse
        const sinVal = Math.sin((i / bars) * Math.PI * 2 + phase);
        const barHeight = Math.max(4, (sinVal * 0.5 + 0.5) * (height * 0.45));
        const y = (height - barHeight) / 2;

        ctx.fillStyle = audioPlayer && !audioPlayer.paused ? "#FF9F0A" : "rgba(255, 255, 255, 0.15)";
        ctx.beginPath();
        ctx.roundRect(i * (barWidth + 2), y, barWidth, barHeight, 2);
        ctx.fill();
      }

      phase += audioPlayer && !audioPlayer.paused ? 0.08 : 0.02;
      animationFrameId = requestAnimationFrame(drawIdle);
    }

    // Set canvas dimensions to device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    waveformCanvas.width = waveformCanvas.offsetWidth * dpr;
    waveformCanvas.height = waveformCanvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    drawIdle();
  }

  // --- Segmented Model Controls ---
  document.querySelectorAll("[data-model]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-model]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedModel = btn.dataset.model;
    });
  });

  // --- File Drop & Select Handling ---
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-blue-500", "scale-[1.01]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-blue-500", "scale-[1.01]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-blue-500", "scale-[1.01]");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  clearFileBtn.addEventListener("click", () => {
    selectedFile = null;
    selectedFileBanner.classList.add("hidden");
    startTranscribeBtn.disabled = true;
    fileInput.value = "";
    canvasCaption.textContent = "Ready for audio input";
  });

  function handleFileSelected(file) {
    selectedFile = file;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    selectedFileName.textContent = `${file.name} (${mb} MB)`;
    selectedFileBanner.classList.remove("hidden");
    startTranscribeBtn.disabled = false;
    canvasCaption.textContent = `Loaded: ${file.name}`;
  }

  // --- Apple Voice Memos Mic Recording with Live Analyser ---
  micRecordCard.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;

        const source = audioCtx.createMediaStreamSource(micStream);
        source.connect(analyser);

        mediaRecorder = new MediaRecorder(micStream);
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
          micStream.getTracks().forEach((t) => t.stop());
          if (audioCtx) audioCtx.close();
        };

        mediaRecorder.start();
        isRecording = true;

        // Apple Voice Memos morph into Stop square
        micRecordBtn.classList.add("record-pulse-ring", "border-red-500");
        micInnerDot.classList.remove("rounded-full");
        micInnerDot.classList.add("rounded-md", "w-5", "h-5");
        micLabel.textContent = "Recording Memo...";
        canvasCaption.textContent = "Capturing microphone audio...";

        recordingTimer = setInterval(() => {
          recordingSeconds++;
          const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
          const s = String(recordingSeconds % 60).padStart(2, "0");
          micSubtext.textContent = `${m}:${s} • Tap to Finish`;
        }, 1000);

        // Real-time canvas frequency visualization
        drawLiveMicFrequencies();

      } catch (err) {
        alert("Microphone permission required: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      clearInterval(recordingTimer);

      micRecordBtn.classList.remove("record-pulse-ring");
      micInnerDot.classList.add("rounded-full");
      micInnerDot.classList.remove("rounded-md", "w-5", "h-5");
      micLabel.textContent = "Record Voice Memo";
      micSubtext.textContent = "Tap to capture from microphone";

      // Reset to idle waveform
      initWaveformCanvas();
    }
  });

  function drawLiveMicFrequencies() {
    if (!isRecording || !analyser) return;

    const ctx = waveformCanvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const width = waveformCanvas.width;
    const height = waveformCanvas.height;
    ctx.clearRect(0, 0, width, height);

    const bars = bufferLength;
    const barWidth = width / bars - 2;

    for (let i = 0; i < bars; i++) {
      const val = dataArray[i] / 255.0;
      const barHeight = Math.max(4, val * height * 0.9);
      const y = (height - barHeight) / 2;

      ctx.fillStyle = "#FF453A"; // Apple Voice Memos red
      ctx.beginPath();
      ctx.roundRect(i * (barWidth + 2), y, barWidth, barHeight, 2);
      ctx.fill();
    }

    requestAnimationFrame(drawLiveMicFrequencies);
  }

  // --- Start Transcription Upload ---
  startTranscribeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    startTranscribeBtn.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span> Ingesting audio stream...`;

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("model_name", selectedModel);
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
      alert("Error: " + err.message);
      startTranscribeBtn.disabled = false;
      progressContainer.classList.add("hidden");
    }
  });

  // --- Real-time Progress (SSE) ---
  function subscribeToProgress(recId) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/recordings/${recId}/events`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const progress = Math.max(0, Math.min(100, data.progress || 0));

        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;

        if (data.message) {
          progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span> ${data.message}`;
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
          progressStatusText.innerHTML = `<span class="text-red-400 font-semibold">⚠️ ${data.message}</span>`;
          startTranscribeBtn.disabled = false;
        }
      } catch (err) {
        console.error(err);
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
      if (!res.ok) throw new Error("Could not load recording");

      const data = await res.json();
      const rec = data.recording;
      currentSegments = data.segments || [];

      currentTitle.textContent = rec.title || rec.filename;
      currentDuration.textContent = formatTime(rec.duration || 0);
      totalTimeDisplay.textContent = formatTime(rec.duration || 0);
      segmentCount.textContent = `${currentSegments.length} segments`;

      audioPlayer.src = `/api/audio/${recId}`;
      transcriptSection.classList.remove("hidden");

      renderTranscript(currentSegments);
      synthesizeSummary(currentSegments);
      renderSpeakerAnalytics(currentSegments);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Render Transcript with Apple Dialogue Bubbles ---
  function renderTranscript(segments) {
    transcriptFeed.innerHTML = "";
    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-xs font-mono text-neutral-500 italic p-4 text-center">No spoken dialogue detected.</p>`;
      return;
    }

    const speakerColorMap = buildSpeakerColorMap(segments);
    let lastSpeaker = null;
    let currentBubble = null;

    segments.forEach((seg, index) => {
      const speakerName = seg.speaker_name || seg.speaker || "Speaker 1";
      const speakerTag = seg.speaker || "Speaker 1";
      const color = speakerColorMap[speakerTag] || SPEAKER_COLORS[0];

      if (speakerName !== lastSpeaker) {
        lastSpeaker = speakerName;
        currentBubble = document.createElement("div");
        currentBubble.className = "dialogue-card p-4 sm:p-5 space-y-2";

        const header = document.createElement("div");
        header.className = "flex items-center justify-between pb-2 border-b border-white/5";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = `flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition apple-press ${color.badge}`;
        speakerBadge.title = "Click to rename this speaker";

        const initials = speakerName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
        speakerBadge.innerHTML = `
          <span class="w-2 h-2 rounded-full ${color.dot}"></span>
          <span>${escapeHtml(speakerName)}</span>
          <i data-lucide="edit-2" class="w-3 h-3 opacity-60"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        header.appendChild(speakerBadge);
        currentBubble.appendChild(header);
        transcriptFeed.appendChild(currentBubble);
      }

      // Sentence element
      const sentenceItem = document.createElement("div");
      sentenceItem.id = `segment-${index}`;
      sentenceItem.className = "transcript-sentence flex items-start gap-3";
      sentenceItem.dataset.start = seg.start_time;
      sentenceItem.dataset.end = seg.end_time;

      sentenceItem.innerHTML = `
        <span class="shrink-0 font-mono text-[11px] text-neutral-500 hover:text-blue-400 pt-0.5 select-none">${formatTime(seg.start_time)}</span>
        <p class="text-sm text-neutral-200 hover:text-white leading-relaxed select-text flex-1">${escapeHtml(seg.text)}</p>
      `;

      sentenceItem.addEventListener("click", () => {
        if (window.getSelection().toString().length > 0) return;
        audioPlayer.currentTime = seg.start_time;
        audioPlayer.play();
        setPlayState(true);
      });

      currentBubble.appendChild(sentenceItem);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Synthesize Executive Notes ---
  function synthesizeSummary(segments) {
    actionItemsList.innerHTML = "";
    outlineList.innerHTML = "";

    if (!segments || segments.length === 0) return;

    const keywords = ["action", "todo", "need to", "will", "deadline", "by next", "agreed", "plan", "deliverable", "follow up"];
    const actions = [];
    const timeline = {};

    segments.forEach((seg) => {
      const lower = seg.text.toLowerCase();
      const speaker = seg.speaker_name || seg.speaker || "Speaker";

      if (keywords.some((k) => lower.includes(k)) && actions.length < 8 && seg.text.length > 20) {
        actions.push({ text: seg.text, speaker: speaker, time: seg.start_time });
      }

      const block = Math.floor(seg.start_time / 300);
      if (!timeline[block]) timeline[block] = { start: seg.start_time, items: [] };
      if (timeline[block].items.length < 2 && seg.text.length > 30) {
        timeline[block].items.push(seg.text);
      }
    });

    if (actions.length === 0) {
      actionItemsList.innerHTML = `<li class="text-neutral-500 font-mono text-xs italic">No explicit action keywords detected.</li>`;
    } else {
      actions.forEach((a) => {
        const li = document.createElement("li");
        li.className = "flex items-start gap-2.5 p-3 rounded-xl bg-white/[0.02] border border-white/5";
        li.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0"></span>
          <div class="flex-1">
            <span class="font-mono text-[11px] text-blue-400 font-medium">[${formatTime(a.time)}] ${escapeHtml(a.speaker)}:</span>
            <span class="text-neutral-200 ml-1 leading-relaxed">${escapeHtml(a.text)}</span>
          </div>
        `;
        actionItemsList.appendChild(li);
      });
    }

    Object.keys(timeline).forEach((key) => {
      const data = timeline[key];
      const div = document.createElement("div");
      div.className = "p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1";
      div.innerHTML = `
        <div class="font-mono text-xs font-semibold text-emerald-400">Chapter @ ${formatTime(data.start)}</div>
        <p class="text-xs text-neutral-300 leading-relaxed">${escapeHtml(data.items.join(" "))}</p>
      `;
      outlineList.appendChild(div);
    });
  }

  // --- Speaker Analytics Breakdown ---
  function renderSpeakerAnalytics(segments) {
    speakerStatsFeed.innerHTML = "";
    if (!segments || segments.length === 0) return;

    const stats = {};
    let totalTime = 0;

    segments.forEach((seg) => {
      const speaker = seg.speaker_name || seg.speaker || "Speaker 1";
      const dur = Math.max(0.5, (seg.end_time || 0) - (seg.start_time || 0));
      stats[speaker] = (stats[speaker] || 0) + dur;
      totalTime += dur;
    });

    const entries = Object.entries(stats).sort((a, b) => b[1] - a[1]);
    const palette = ["bg-blue-500", "bg-emerald-400", "bg-amber-400", "bg-purple-400"];

    entries.forEach(([speaker, time], idx) => {
      const pct = totalTime > 0 ? ((time / totalTime) * 100).toFixed(1) : 0;
      const barColor = palette[idx % palette.length];

      const row = document.createElement("div");
      row.className = "space-y-1.5 p-3 rounded-xl bg-white/[0.02] border border-white/5";
      row.innerHTML = `
        <div class="flex items-center justify-between text-xs font-mono">
          <span class="font-semibold text-white">${escapeHtml(speaker)}</span>
          <span class="text-neutral-400">${formatTime(time)} (${pct}%)</span>
        </div>
        <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      speakerStatsFeed.appendChild(row);
    });
  }

  // --- Segmented Tab Navigation ---
  tabTranscriptBtn.addEventListener("click", () => switchTab("transcript"));
  tabSummaryBtn.addEventListener("click", () => switchTab("summary"));
  tabAnalyticsBtn.addEventListener("click", () => switchTab("analytics"));

  function switchTab(tab) {
    [tabTranscriptBtn, tabSummaryBtn, tabAnalyticsBtn].forEach((b) => b.classList.remove("active"));
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("active");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("active");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("active");
      tabAnalyticsView.classList.remove("hidden");
    }
  }

  // --- Floating Apple Player Controls ---
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      audioPlayer.play();
      setPlayState(true);
    } else {
      audioPlayer.pause();
      setPlayState(false);
    }
  });

  function setPlayState(playing) {
    playIcon.setAttribute("data-lucide", playing ? "pause" : "play");
    if (window.lucide) lucide.createIcons();
  }

  skipBackBtn.addEventListener("click", () => {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
  });

  skipForwardBtn.addEventListener("click", () => {
    audioPlayer.currentTime = Math.min(audioPlayer.duration || 0, audioPlayer.currentTime + 10);
  });

  speedCycleBtn.addEventListener("click", () => {
    currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
    const speed = speeds[currentSpeedIdx];
    audioPlayer.playbackRate = speed;
    speedCycleBtn.textContent = `${speed}×`;
  });

  audioPlayer.addEventListener("timeupdate", () => {
    const cur = audioPlayer.currentTime;
    currentTimeDisplay.textContent = formatTime(cur);

    if (!isDraggingScrubber && audioPlayer.duration) {
      audioScrubber.value = (cur / audioPlayer.duration) * 100;
    }

    // Active sentence highlight
    let found = false;
    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (!el) return;

      if (!found && cur >= seg.start_time && cur <= seg.end_time) {
        if (!el.classList.contains("active-sentence")) {
          document.querySelectorAll(".active-sentence").forEach((i) => i.classList.remove("active-sentence"));
          el.classList.add("active-sentence");
          el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        found = true;
      }
    });
  });

  audioScrubber.addEventListener("input", () => isDraggingScrubber = true);
  audioScrubber.addEventListener("change", () => {
    if (audioPlayer.duration) {
      audioPlayer.currentTime = (audioScrubber.value / 100) * audioPlayer.duration;
    }
    isDraggingScrubber = false;
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      playPauseBtn.click();
    }
  });

  // --- Speaker Rename Modal ---
  function openRenameModal(tag, name) {
    targetRenameTag = tag;
    speakerRenameInput.value = name;
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

  // --- Search & Copy ---
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    currentSegments.forEach((seg, idx) => {
      const el = document.getElementById(`segment-${idx}`);
      if (el) el.style.display = !q || seg.text.toLowerCase().includes(q) ? "" : "none";
    });
  });

  copyTranscriptBtn.addEventListener("click", () => {
    if (!currentSegments || currentSegments.length === 0) return;
    const full = currentSegments
      .map((s) => `[${formatTime(s.start_time)}] ${s.speaker_name || s.speaker || "Speaker"}: ${s.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(full).then(() => {
      const original = copyTranscriptBtn.innerHTML;
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-emerald-400"></i> Copied`;
      if (window.lucide) lucide.createIcons();
      setTimeout(() => {
        copyTranscriptBtn.innerHTML = original;
        if (window.lucide) lucide.createIcons();
      }, 2000);
    });
  });

  // --- Export Menu ---
  exportMenuBtn.addEventListener("click", () => exportDropdown.classList.toggle("hidden"));
  document.addEventListener("click", (e) => {
    if (!exportMenuBtn.contains(e.target) && !exportDropdown.contains(e.target)) {
      exportDropdown.classList.add("hidden");
    }
  });

  document.querySelectorAll(".export-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!currentRecordingId) return;
      window.open(`/api/recordings/${currentRecordingId}/export?format=${btn.dataset.format}`, "_blank");
      exportDropdown.classList.add("hidden");
    });
  });

  // --- Drawer ---
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
        historyList.innerHTML = `<p class="text-xs font-mono text-neutral-500 italic p-3 text-center">No archives found.</p>`;
        return;
      }

      list.forEach((item) => {
        const row = document.createElement("div");
        row.className = `p-3.5 rounded-2xl apple-card cursor-pointer transition flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-blue-500/50 bg-blue-500/10" : ""
        }`;

        row.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-semibold text-white truncate">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] font-mono text-neutral-500 mt-1">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>•</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-red-400 apple-press transition" title="Delete">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        `;

        row.addEventListener("click", (e) => {
          if (e.target.closest(".delete-btn")) return;
          loadRecordingDetails(item.id);
          historyDrawer.classList.add("translate-x-full");
        });

        const delBtn = row.querySelector(".delete-btn");
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

        historyList.appendChild(row);
      });

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Copy Share Link ---
  if (copyShareBtn) {
    copyShareBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.origin).then(() => {
        copyShareBtn.textContent = "Copied!";
        setTimeout(() => (copyShareBtn.textContent = "Copy Link"), 2000);
      });
    });
  }

  // --- Helpers ---
  function buildSpeakerColorMap(segments) {
    const map = {};
    let idx = 0;
    segments.forEach((s) => {
      const tag = s.speaker || "Speaker 1";
      if (!map[tag]) {
        map[tag] = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
        idx++;
      }
    });
    return map;
  }

  function formatTime(sec) {
    const s = Math.floor(sec || 0);
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
