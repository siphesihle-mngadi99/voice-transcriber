// VoiceScribe — Clean Audio Transcriber (Aya Brutalist Engine)
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

  // Embedded Transport Controls
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipForwardBtn = document.getElementById("skipForwardBtn");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");
  const speedCycleBtn = document.getElementById("speedCycleBtn");

  // Floating Console Elements (Dock)
  const audioDock = document.getElementById("audioDock");
  const dockPlayPauseBtn = document.getElementById("dockPlayPauseBtn");
  const dockPlayIcon = document.getElementById("dockPlayIcon");
  const dockSkipBackBtn = document.getElementById("dockSkipBackBtn");
  const dockSkipForwardBtn = document.getElementById("dockSkipForwardBtn");
  const dockCurrentTimeDisplay = document.getElementById("dockCurrentTimeDisplay");
  const dockTotalTimeDisplay = document.getElementById("dockTotalTimeDisplay");
  const dockSpeedCycleBtn = document.getElementById("dockSpeedCycleBtn");

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

  // Rename Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // AYA Poster Speaker Badges
  const PERFORMER_PALETTES = [
    { badge: "bg-[#ff2f11] text-white border-2 border-[#191717] shadow-[2px_2px_0px_#191717]", dot: "bg-white" },
    { badge: "bg-[#e4fc51] text-[#191717] border-2 border-[#191717] shadow-[2px_2px_0px_#191717]", dot: "bg-[#191717]" },
    { badge: "bg-[#1b4cf4] text-white border-2 border-[#191717] shadow-[2px_2px_0px_#191717]", dot: "bg-white" },
    { badge: "bg-[#191717] text-white border-2 border-[#191717] shadow-[2px_2px_0px_#ff2f11]", dot: "bg-[#e4fc51]" },
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
      waveColor: "#c5bca5",
      progressColor: "#ff2f11",
      cursorColor: "#191717",
      cursorWidth: 2,
      barWidth: 2,
      barGap: 2,
      barRadius: 0,
      height: 68,
      normalize: true,
      url: audioUrl,
    });

    wavesurfer.on("ready", () => {
      const duration = wavesurfer.getDuration();
      totalTimeDisplay.textContent = formatTime(duration);
      if (dockTotalTimeDisplay) dockTotalTimeDisplay.textContent = formatTime(duration);
      waveformTimeDisplay.textContent = `00:00 / ${formatTime(duration)}`;
    });

    wavesurfer.on("timeupdate", (currentTime) => {
      currentTimeDisplay.textContent = formatTime(currentTime);
      if (dockCurrentTimeDisplay) dockCurrentTimeDisplay.textContent = formatTime(currentTime);
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
        b.classList.remove("bg-[#ff2f11]", "text-white", "shadow-[1px_1px_0px_#191717]");
        b.classList.add("bg-transparent", "text-[#191717]");
      });
      btn.classList.add("bg-[#ff2f11]", "text-white", "shadow-[1px_1px_0px_#191717]");
      btn.classList.remove("bg-transparent", "text-[#191717]");
      selectedModel = btn.dataset.model;
    });
  });

  // --- Drag & Drop Audio File ---
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-[#ff2f11]", "bg-[#faf6ed]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-[#ff2f11]", "bg-[#faf6ed]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-[#ff2f11]", "bg-[#faf6ed]");
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

  // --- Voice Memo Mic Recording ---
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

        micLed.classList.remove("bg-[#191717]/40");
        micLed.classList.add("bg-[#ff2f11]", "animate-ping");
        micRecordBtn.classList.add("aya-rec-pulse");
        micInnerDot.classList.remove("rounded-full");
        micInnerDot.classList.add("rounded-none");
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

      micLed.classList.add("bg-[#191717]/40");
      micLed.classList.remove("bg-[#ff2f11]", "animate-ping");
      micRecordBtn.classList.remove("aya-rec-pulse");
      micInnerDot.classList.add("rounded-full");
      micInnerDot.classList.remove("rounded-none");
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
    progressStatusText.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-[#ff2f11] animate-ping"></span> PROCESSING AUDIO...`;

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
          progressStatusText.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-[#ff2f11] animate-ping"></span> ${data.message.toUpperCase()}`;
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
          progressStatusText.innerHTML = `<span class="text-[#ff2f11] font-bold">⚠️ ${data.message}</span>`;
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
      if (dockTotalTimeDisplay) dockTotalTimeDisplay.textContent = formatTime(rec.duration || 0);
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

  // --- Tab 1: Render Script Dialogue ---
  function renderScreenplay(segments) {
    transcriptFeed.innerHTML = "";
    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-xs font-mono text-[#191717]/60 italic p-4 text-center">NO TRANSCRIPTION DATA AVAILABLE.</p>`;
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
        currentBlock.className = `bg-[#fffdfd] border-2 border-[#191717] p-5 space-y-2.5 shadow-[3px_3px_0px_#191717]`;

        const header = document.createElement("div");
        header.className = "flex items-center justify-between pb-2 border-b-2 border-[#191717]/15";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = `aya-badge ${palette.badge} cursor-pointer transition flex items-center gap-2`;
        speakerBadge.title = "Tap to rename speaker";

        speakerBadge.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full ${palette.dot}"></span>
          <span class="font-stage font-black text-xs">${escapeHtml(speakerName.toUpperCase())}</span>
          <i data-lucide="edit-3" class="w-3 h-3 opacity-80"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        header.appendChild(speakerBadge);
        currentBlock.appendChild(header);
        transcriptFeed.appendChild(currentBlock);
      }

      // Line item
      const lineItem = document.createElement("div");
      lineItem.id = `segment-${index}`;
      lineItem.className = "script-line p-2.5 flex items-start gap-3 cursor-pointer";
      lineItem.dataset.start = seg.start_time;
      lineItem.dataset.end = seg.end_time;

      lineItem.innerHTML = `
        <span class="font-mono text-[11px] text-[#ff2f11] font-black shrink-0 pt-0.5 select-none">[${formatTime(seg.start_time)}]</span>
        <p class="text-sm font-body text-[#191717] leading-relaxed select-text flex-1">${escapeHtml(seg.text)}</p>
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

  // --- Tab 2: Extract Action Items & Notes ---
  function synthesizeStageNotes(segments) {
    actionItemsList.innerHTML = "";
    outlineList.innerHTML = "";
    if (!segments || segments.length === 0) return;

    const keywords = ["action", "todo", "need to", "will", "deadline", "by next", "agreed", "plan", "deliverable", "follow up", "important"];
    const actions = [];
    const timeline = {};

    segments.forEach((seg) => {
      const lower = seg.text.toLowerCase();
      if (keywords.some((kw) => lower.includes(kw))) {
        actions.push({
          speaker: seg.speaker_name || seg.speaker || "Speaker",
          text: seg.text,
          time: seg.start_time,
        });
      }

      // 60-second clusters
      const bucket = Math.floor(seg.start_time / 60);
      if (!timeline[bucket]) {
        timeline[bucket] = {
          start: bucket * 60,
          items: [],
        };
      }
      if (timeline[bucket].items.length < 2) {
        timeline[bucket].items.push(seg.text);
      }
    });

    if (actions.length === 0) {
      actionItemsList.innerHTML = `<li class="text-xs font-mono text-[#191717]/60 italic p-2">NO ACTION ITEMS DETECTED.</li>`;
    } else {
      actions.forEach((a) => {
        const li = document.createElement("li");
        li.className = "p-3 bg-[#faf6ed] border-2 border-[#191717] flex items-start gap-3 shadow-[2px_2px_0px_#191717]";
        li.innerHTML = `
          <span class="aya-badge-red text-[9px] mt-0.5 shrink-0">${formatTime(a.time)}</span>
          <div class="flex-1">
            <span class="font-mono font-black text-xs text-[#191717] uppercase">${escapeHtml(a.speaker)}:</span>
            <span class="text-[#191717] ml-1 leading-relaxed font-medium">${escapeHtml(a.text)}</span>
          </div>
        `;
        actionItemsList.appendChild(li);
      });
    }

    Object.keys(timeline).forEach((key) => {
      const data = timeline[key];
      const div = document.createElement("div");
      div.className = "p-3.5 bg-[#faf6ed] border-2 border-[#191717] space-y-1 shadow-[2px_2px_0px_#191717]";
      div.innerHTML = `
        <div class="font-mono text-xs font-black text-[#ff2f11]">SECTION @ ${formatTime(data.start)}</div>
        <p class="text-xs text-[#191717] leading-relaxed font-medium">${escapeHtml(data.items.join(" "))}</p>
      `;
      outlineList.appendChild(div);
    });
  }

  // --- Tab 3: Speaker Breakdown ---
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
    const palette = ["bg-[#ff2f11]", "bg-[#e4fc51]", "bg-[#1b4cf4]", "bg-[#191717]"];

    entries.forEach(([speaker, time], idx) => {
      const pct = totalTime > 0 ? ((time / totalTime) * 100).toFixed(1) : 0;
      const barColor = palette[idx % palette.length];

      const row = document.createElement("div");
      row.className = "p-3.5 bg-[#faf6ed] border-2 border-[#191717] space-y-1.5 shadow-[2px_2px_0px_#191717]";
      row.innerHTML = `
        <div class="flex items-center justify-between text-xs font-mono font-bold">
          <span class="text-[#191717] uppercase font-black">${escapeHtml(speaker)}</span>
          <span class="text-[#ff2f11] font-black">${formatTime(time)} // ${pct}%</span>
        </div>
        <div class="w-full h-3 bg-[#e6dfcc] border-2 border-[#191717] overflow-hidden">
          <div class="h-full ${barColor} transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      speakerStatsFeed.appendChild(row);
    });
  }

  // --- Tab Switching ---
  tabTranscriptBtn.addEventListener("click", () => switchStageTab("transcript"));
  tabSummaryBtn.addEventListener("click", () => switchStageTab("summary"));
  tabAnalyticsBtn.addEventListener("click", () => switchStageTab("analytics"));

  function switchStageTab(tab) {
    [tabTranscriptBtn, tabSummaryBtn, tabAnalyticsBtn].forEach((b) => {
      b.classList.remove("bg-[#ff2f11]", "text-white");
      b.classList.add("bg-[#fffdfd]", "text-[#191717]");
    });
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabTranscriptBtn.classList.remove("bg-[#fffdfd]", "text-[#191717]");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabSummaryBtn.classList.remove("bg-[#fffdfd]", "text-[#191717]");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabAnalyticsBtn.classList.remove("bg-[#fffdfd]", "text-[#191717]");
      tabAnalyticsView.classList.remove("hidden");
    }
  }

  // --- Transport Controls ---
  function togglePlayPause() {
    if (wavesurfer) wavesurfer.playPause();
  }

  playPauseBtn.addEventListener("click", togglePlayPause);
  if (dockPlayPauseBtn) dockPlayPauseBtn.addEventListener("click", togglePlayPause);

  function setPlayState(playing) {
    playIcon.setAttribute("data-lucide", playing ? "pause" : "play");
    if (dockPlayIcon) dockPlayIcon.setAttribute("data-lucide", playing ? "pause" : "play");
    if (window.lucide) lucide.createIcons();
  }

  function handleSkip(sec) {
    if (wavesurfer) wavesurfer.skip(sec);
  }

  skipBackBtn.addEventListener("click", () => handleSkip(-10));
  if (dockSkipBackBtn) dockSkipBackBtn.addEventListener("click", () => handleSkip(-10));

  skipForwardBtn.addEventListener("click", () => handleSkip(10));
  if (dockSkipForwardBtn) dockSkipForwardBtn.addEventListener("click", () => handleSkip(10));

  function cycleSpeed() {
    currentSpeedIdx = (currentSpeedIdx + 1) % speeds.length;
    const speed = speeds[currentSpeedIdx];
    if (wavesurfer) wavesurfer.setPlaybackRate(speed);
    speedCycleBtn.textContent = `${speed}×`;
    if (dockSpeedCycleBtn) dockSpeedCycleBtn.textContent = `${speed}×`;
  }

  speedCycleBtn.addEventListener("click", cycleSpeed);
  if (dockSpeedCycleBtn) dockSpeedCycleBtn.addEventListener("click", cycleSpeed);

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      togglePlayPause();
    }
  });

  // --- Show Floating Dock ONLY when scrolled past embedded player ---
  window.addEventListener("scroll", () => {
    if (!transcriptSection.classList.contains("hidden") && wavesurfer) {
      const rect = transcriptSection.getBoundingClientRect();
      if (rect.top < -80 && rect.bottom > 250) {
        audioDock.classList.remove("hidden");
      } else {
        audioDock.classList.add("hidden");
      }
    } else {
      audioDock.classList.add("hidden");
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
      .map((s) => `[${formatTime(s.start_time)}] ${s.speaker_name || s.speaker || "Speaker"}: ${s.text}`)
      .join("\n\n");

    navigator.clipboard.writeText(full).then(() => {
      const original = copyTranscriptBtn.innerHTML;
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-[#ff2f11]"></i> COPIED`;
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
        historyList.innerHTML = `<p class="text-xs font-mono text-[#191717]/60 italic p-3 text-center">NO ARCHIVED RECORDINGS</p>`;
        return;
      }

      list.forEach((item) => {
        const row = document.createElement("div");
        row.className = `p-3.5 bg-[#fffdfd] border-2 border-[#191717] hover:bg-[#e4fc51] cursor-pointer transition-all shadow-[2px_2px_0px_#191717] flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-[#ff2f11] bg-[#faf6ed]" : ""
        }`;

        row.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-stage font-black text-[#191717] group-hover:text-[#ff2f11] truncate uppercase">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] font-mono text-[#191717]/70 font-bold mt-1">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>&bull;</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-60 group-hover:opacity-100 p-1 text-[#191717] hover:text-[#ff2f11] transition" title="Delete">
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
          if (confirm("Delete recording from archive?")) {
            await fetch(`/api/recordings/${item.id}`, { method: "DELETE" });
            if (currentRecordingId === item.id) {
              transcriptSection.classList.add("hidden");
              audioDock.classList.add("hidden");
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
        copyShareBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-[#ff2f11]"></i> <span>COPIED</span>`;
        if (window.lucide) lucide.createIcons();
        setTimeout(() => {
          copyShareBtn.innerHTML = `<i data-lucide="share-2" class="w-3.5 h-3.5"></i> <span>SHARE</span>`;
          if (window.lucide) lucide.createIcons();
        }, 2000);
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
