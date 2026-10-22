// VoiceScribe — Danstheater AYA Theatrical Brutalist Stage Engine
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }

  // --- 1. Initialize Lenis Smooth Scroll ---
  let lenisInstance = null;
  if (window.Lenis) {
    try {
      lenisInstance = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      function raf(time) {
        lenisInstance.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    } catch (e) {
      console.warn("Lenis initialization skipped", e);
    }
  }

  // --- 2. State Management ---
  let currentRecordingId = null;
  let currentSegments = [];
  let eventSource = null;
  let selectedFile = null;
  let selectedModel = "base";
  let targetRenameTag = null;
  let wavesurfer = null;

  // Recording State
  let mediaRecorder = null;
  let audioChunks = [];
  let isRecording = false;
  let recordingTimer = null;
  let recordingSeconds = 0;
  let micStream = null;
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
  let currentSpeedIdx = 0;

  // DOM Elements - Navigation & Sharing
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
  const micLed = document.getElementById("micLed");
  const micLabel = document.getElementById("micLabel");
  const micSubtext = document.getElementById("micSubtext");
  const diarizationToggle = document.getElementById("diarizationToggle");
  const startTranscribeBtn = document.getElementById("startTranscribeBtn");

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
  const waveformTimeDisplay = document.getElementById("waveformTimeDisplay");

  // Screenplay Tabs
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

  // Floating Console Elements
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipForwardBtn = document.getElementById("skipForwardBtn");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");
  const speedCycleBtn = document.getElementById("speedCycleBtn");

  // Rename Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // Theatrical Stage Lighting Performer Badges
  const PERFORMER_PALETTES = [
    { badge: "text-blue-400 border-blue-500/40 bg-blue-500/10", dot: "bg-blue-400" },
    { badge: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", dot: "bg-emerald-400" },
    { badge: "text-rose-400 border-rose-500/40 bg-rose-500/10", dot: "bg-rose-400" },
    { badge: "text-purple-400 border-purple-500/40 bg-purple-500/10", dot: "bg-purple-400" },
  ];

  // --- Initial Load ---
  loadRecordingsList();

  // --- 3. WaveSurfer.js Real Waveform Initialization ---
  function initWaveSurfer(audioUrl) {
    if (wavesurfer) {
      try {
        wavesurfer.destroy();
      } catch (e) {
        console.warn(e);
      }
    }

    const container = document.getElementById("waveformContainer");
    container.innerHTML = "";

    wavesurfer = WaveSurfer.create({
      container: container,
      waveColor: "#27272A",
      progressColor: "#2563EB",
      cursorColor: "#FF2D55",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      height: 72,
      normalize: true,
      url: audioUrl,
    });

    wavesurfer.on("ready", () => {
      const duration = wavesurfer.getDuration();
      totalTimeDisplay.textContent = formatTime(duration);
      waveformTimeDisplay.textContent = `00:00 / ${formatTime(duration)}`;
    });

    wavesurfer.on("timeupdate", (currentTime) => {
      currentTimeDisplay.textContent = formatTime(currentTime);
      waveformTimeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(wavesurfer.getDuration())}`;

      // Karaoke line sync
      let foundActive = false;
      currentSegments.forEach((seg, idx) => {
        const el = document.getElementById(`segment-${idx}`);
        if (!el) return;

        if (!foundActive && currentTime >= seg.start_time && currentTime <= seg.end_time) {
          if (!el.classList.contains("active-line")) {
            document.querySelectorAll(".active-line").forEach((i) => i.classList.remove("active-line"));
            el.classList.add("active-line");
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          foundActive = true;
        }
      });
    });

    wavesurfer.on("play", () => setPlayState(true));
    wavesurfer.on("pause", () => setPlayState(false));
    wavesurfer.on("finish", () => setPlayState(false));
  }

  // --- Model Engine Selection ---
  document.querySelectorAll(".model-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".model-pill").forEach((b) => {
        b.classList.remove("bg-[#2563EB]", "text-white");
        b.classList.add("text-neutral-400");
      });
      btn.classList.add("bg-[#2563EB]", "text-white");
      btn.classList.remove("text-neutral-400");
      selectedModel = btn.dataset.model;
    });
  });

  // --- Drag & Drop Audio File ---
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
      handleFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  });

  clearFileBtn.addEventListener("click", () => {
    selectedFile = null;
    selectedFileBanner.classList.add("hidden");
    startTranscribeBtn.disabled = true;
    fileInput.value = "";
  });

  function handleFile(file) {
    selectedFile = file;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    selectedFileName.textContent = `${file.name} [${mb} MB]`;
    selectedFileBanner.classList.remove("hidden");
    startTranscribeBtn.disabled = false;
  }

  // --- Voice Memo Mic Recording (Theatrical Stage Red LED) ---
  micRecordCard.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          handleFile(recordedFile);
          micStream.getTracks().forEach((t) => t.stop());
        };

        mediaRecorder.start();
        isRecording = true;

        micLed.classList.add("bg-rose-500", "animate-ping");
        micRecordBtn.classList.add("stage-rec-pulse");
        micInnerDot.classList.remove("rounded-full");
        micInnerDot.classList.add("rounded-sm");
        micLabel.textContent = "RECORDING NOW";

        recordingTimer = setInterval(() => {
          recordingSeconds++;
          const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
          const s = String(recordingSeconds % 60).padStart(2, "0");
          micSubtext.textContent = `LIVE CAPTURE: ${m}:${s} [TAP TO FINISH]`;
        }, 1000);

      } catch (err) {
        alert("Mic permission required: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      clearInterval(recordingTimer);

      micLed.classList.remove("bg-rose-500", "animate-ping");
      micRecordBtn.classList.remove("stage-rec-pulse");
      micInnerDot.classList.add("rounded-full");
      micInnerDot.classList.remove("rounded-sm");
      micLabel.textContent = "CAPTURE VOICE MEMO";
      micSubtext.textContent = "Direct microphone input for phones & PC";
    }
  });

  // --- Start Transcription Upload ---
  startTranscribeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    startTranscribeBtn.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span> INGESTING AUDIO STREAM...`;

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
        throw new Error(err.detail || "Upload error");
      }

      const data = await res.json();
      currentRecordingId = data.recording_id;

      subscribeToEvents(currentRecordingId);
      loadRecordingsList();
    } catch (err) {
      alert("Error: " + err.message);
      startTranscribeBtn.disabled = false;
      progressContainer.classList.add("hidden");
    }
  });

  // --- SSE Real-time Progress ---
  function subscribeToEvents(recId) {
    if (eventSource) eventSource.close();
    eventSource = new EventSource(`/api/recordings/${recId}/events`);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        const progress = Math.max(0, Math.min(100, data.progress || 0));

        progressBar.style.width = `${progress}%`;
        progressPercent.textContent = `${Math.round(progress)}%`;

        if (data.message) {
          progressStatusText.innerHTML = `<span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span> ${data.message.toUpperCase()}`;
          liveTranscriptPreview.textContent = `> ${data.message}`;
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
          progressStatusText.innerHTML = `<span class="text-rose-400 font-bold">⚠️ ${data.message}</span>`;
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
      if (!res.ok) throw new Error("Could not load session");

      const data = await res.json();
      const rec = data.recording;
      currentSegments = data.segments || [];

      currentTitle.textContent = rec.title || rec.filename;
      currentDuration.textContent = formatTime(rec.duration || 0);
      totalTimeDisplay.textContent = formatTime(rec.duration || 0);
      segmentCount.textContent = `${currentSegments.length} segments`;

      // Initialize WaveSurfer
      initWaveSurfer(`/api/audio/${recId}`);
      transcriptSection.classList.remove("hidden");

      renderScreenplay(currentSegments);
      synthesizeStageNotes(currentSegments);
      renderDialogueRadar(currentSegments);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Tab 1: Render Screenplay Script Dialogue ---
  function renderScreenplay(segments) {
    transcriptFeed.innerHTML = "";
    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-xs font-mono text-neutral-400 italic p-4 text-center">NO DIALOGUE SIGNALS RECORDED ON STAGE.</p>`;
      return;
    }

    const performerMap = buildPerformerMap(segments);
    let lastSpeaker = null;
    let currentBlock = null;

    segments.forEach((seg, index) => {
      const speakerName = seg.speaker_name || seg.speaker || "Speaker 1";
      const speakerTag = seg.speaker || "Speaker 1";
      const palette = performerMap[speakerTag] || PERFORMER_PALETTES[0];

      if (speakerName !== lastSpeaker) {
        lastSpeaker = speakerName;
        currentBlock = document.createElement("div");
        currentBlock.className = `bg-[#0B0C0F] border border-white/10 rounded-xl p-5 space-y-2.5`;

        const header = document.createElement("div");
        header.className = "flex items-center justify-between pb-2 border-b border-white/10";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = `backstage-pass ${palette.badge} cursor-pointer hover:border-white transition flex items-center gap-2`;
        speakerBadge.title = "Tap to rename performer";

        speakerBadge.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full ${palette.dot}"></span>
          <span class="font-stage font-bold">${escapeHtml(speakerName.toUpperCase())}</span>
          <i data-lucide="edit-3" class="w-3 h-3 opacity-60"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        header.appendChild(speakerBadge);
        currentBlock.appendChild(header);
        transcriptFeed.appendChild(currentBlock);
      }

      // Screenplay Line
      const lineItem = document.createElement("div");
      lineItem.id = `segment-${index}`;
      lineItem.className = "script-line p-2.5 rounded-lg flex items-start gap-3 cursor-pointer";
      lineItem.dataset.start = seg.start_time;
      lineItem.dataset.end = seg.end_time;

      lineItem.innerHTML = `
        <span class="font-mono text-[11px] text-blue-400 font-bold shrink-0 pt-0.5 select-none">[${formatTime(seg.start_time)}]</span>
        <p class="text-sm font-body text-neutral-200 hover:text-white leading-relaxed select-text flex-1 font-light">${escapeHtml(seg.text)}</p>
      `;

      lineItem.addEventListener("click", () => {
        if (window.getSelection().toString().length > 0) return;
        if (wavesurfer) {
          wavesurfer.setTime(seg.start_time);
          wavesurfer.play();
          setPlayState(true);
        }
      });

      currentBlock.appendChild(lineItem);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Tab 2: Synthesize Stage Notes & Commitments ---
  function synthesizeStageNotes(segments) {
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
      actionItemsList.innerHTML = `<li class="text-neutral-500 font-mono text-xs italic">No explicit commitments detected in script.</li>`;
    } else {
      actions.forEach((a) => {
        const li = document.createElement("li");
        li.className = "p-3 rounded-lg bg-[#111216] border border-white/10 flex items-start gap-3";
        li.innerHTML = `
          <span class="backstage-pass text-blue-400 border-blue-500/30 text-[9px] mt-0.5">${formatTime(a.time)}</span>
          <div class="flex-1">
            <span class="font-mono font-bold text-xs text-white uppercase">${escapeHtml(a.speaker)}:</span>
            <span class="text-neutral-200 ml-1 leading-relaxed">${escapeHtml(a.text)}</span>
          </div>
        `;
        actionItemsList.appendChild(li);
      });
    }

    Object.keys(timeline).forEach((key) => {
      const data = timeline[key];
      const div = document.createElement("div");
      div.className = "p-3.5 rounded-lg bg-[#111216] border border-white/10 space-y-1";
      div.innerHTML = `
        <div class="font-mono text-xs font-bold text-emerald-400">ACT SCENE @ ${formatTime(data.start)}</div>
        <p class="text-xs text-neutral-300 leading-relaxed font-light">${escapeHtml(data.items.join(" "))}</p>
      `;
      outlineList.appendChild(div);
    });
  }

  // --- Tab 3: Dialogue Radar Breakdown ---
  function renderDialogueRadar(segments) {
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
    const palette = ["bg-blue-600", "bg-emerald-500", "bg-rose-500", "bg-purple-500"];

    entries.forEach(([speaker, time], idx) => {
      const pct = totalTime > 0 ? ((time / totalTime) * 100).toFixed(1) : 0;
      const barColor = palette[idx % palette.length];

      const row = document.createElement("div");
      row.className = "p-3.5 rounded-lg bg-[#111216] border border-white/10 space-y-1.5";
      row.innerHTML = `
        <div class="flex items-center justify-between text-xs font-mono font-bold">
          <span class="text-white uppercase">${escapeHtml(speaker)}</span>
          <span class="text-blue-400">${formatTime(time)} // ${pct}%</span>
        </div>
        <div class="w-full h-2 bg-black border border-white/20 rounded-full overflow-hidden">
          <div class="h-full ${barColor} rounded-full transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      speakerStatsFeed.appendChild(row);
    });
  }

  // --- Screenplay Tab Switching ---
  tabTranscriptBtn.addEventListener("click", () => switchStageTab("transcript"));
  tabSummaryBtn.addEventListener("click", () => switchStageTab("summary"));
  tabAnalyticsBtn.addEventListener("click", () => switchStageTab("analytics"));

  function switchStageTab(tab) {
    [tabTranscriptBtn, tabSummaryBtn, tabAnalyticsBtn].forEach((b) => {
      b.classList.remove("bg-[#2563EB]", "text-white", "border-blue-400");
      b.classList.add("bg-black", "text-neutral-400", "border-white/15");
    });
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("bg-[#2563EB]", "text-white", "border-blue-400");
      tabTranscriptBtn.classList.remove("bg-black", "text-neutral-400", "border-white/15");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("bg-[#2563EB]", "text-white", "border-blue-400");
      tabSummaryBtn.classList.remove("bg-black", "text-neutral-400", "border-white/15");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("bg-[#2563EB]", "text-white", "border-blue-400");
      tabAnalyticsBtn.classList.remove("bg-black", "text-neutral-400", "border-white/15");
      tabAnalyticsView.classList.remove("hidden");
    }
  }

  // --- Transport Controls (WaveSurfer-Linked) ---
  playPauseBtn.addEventListener("click", () => {
    if (wavesurfer) wavesurfer.playPause();
  });

  function setPlayState(playing) {
    playIcon.setAttribute("data-lucide", playing ? "pause" : "play");
    if (window.lucide) lucide.createIcons();
  }

  skipBackBtn.addEventListener("click", () => {
    if (wavesurfer) wavesurfer.skip(-10);
  });

  skipForwardBtn.addEventListener("click", () => {
    if (wavesurfer) wavesurfer.skip(10);
  });

  speedCycleBtn.addEventListener("click", () => {
    currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
    const speed = speeds[currentSpeedIdx];
    if (wavesurfer) wavesurfer.setPlaybackRate(speed);
    speedCycleBtn.textContent = `${speed}×`;
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (wavesurfer) wavesurfer.playPause();
    }
  });

  // --- Rename Modal ---
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
      .map((s) => `[${formatTime(s.start_time)}] ${s.speaker_name || s.speaker || "Performer"}: ${s.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(full).then(() => {
      const original = copyTranscriptBtn.innerHTML;
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-blue-400"></i> COPIED`;
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

  // --- Vault Drawer ---
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
        historyList.innerHTML = `<p class="text-xs font-mono text-neutral-500 italic p-3 text-center">NO ARCHIVED SESSIONS</p>`;
        return;
      }

      list.forEach((item) => {
        const row = document.createElement("div");
        row.className = `p-3.5 rounded-xl bg-[#111216] border border-white/10 hover:border-blue-500/60 cursor-pointer transition flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-blue-500 bg-blue-500/10" : ""
        }`;

        row.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-stage font-bold text-white group-hover:text-blue-400 truncate uppercase">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-1">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>&bull;</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-400 transition" title="Delete">
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
          if (confirm("Delete session from archive?")) {
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

  // --- Share URL ---
  if (copyShareBtn) {
    copyShareBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(window.location.origin).then(() => {
        copyShareBtn.textContent = "COPIED!";
        setTimeout(() => (copyShareBtn.textContent = "Share Link"), 2000);
      });
    });
  }

  // --- Helpers ---
  function buildPerformerMap(segments) {
    const map = {};
    let idx = 0;
    segments.forEach((s) => {
      const tag = s.speaker || "Speaker 1";
      if (!map[tag]) {
        map[tag] = PERFORMER_PALETTES[idx % PERFORMER_PALETTES.length];
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
