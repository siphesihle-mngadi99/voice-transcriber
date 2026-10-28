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
  let recordStartTime = 0;
  let micStream = null;
  const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
  let currentSpeedIdx = 0;

  // Live Audio Reactive Visualizer State
  let audioCtx = null;
  let analyser = null;
  let visualizerSource = null;
  let visualizerAnimFrame = null;
  let visualizerIdlePhase = 0;

  // DOM Elements - Navigation & Sharing
  const historyToggleBtn = document.getElementById("historyToggleBtn");
  const historyDrawer = document.getElementById("historyDrawer");
  const historyDrawerBackdrop = document.getElementById("historyDrawerBackdrop");
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
  const micPrecisionTimer = document.getElementById("micPrecisionTimer");
  const visualizerCanvas = document.getElementById("liveAudioVisualizer");
  const diarizeOffBtn = document.getElementById("diarizeOffBtn");
  const diarizeOnBtn = document.getElementById("diarizeOnBtn");
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
  const backToUploadBtn = document.getElementById("backToUploadBtn");
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
  const speakerStatsFeed = document.getElementById("speakerStatsFeed");

  // Executive Brief Elements
  const briefProviderName = document.getElementById("briefProviderName");
  const briefStatusTag = document.getElementById("briefStatusTag");
  const downloadPdfBriefBtn = document.getElementById("downloadPdfBriefBtn");
  const openLlmSettingsBtn = document.getElementById("openLlmSettingsBtn");
  const generateBriefBtn = document.getElementById("generateBriefBtn");
  const generateBriefBtnText = document.getElementById("generateBriefBtnText");
  const generateBriefIcon = document.getElementById("generateBriefIcon");
  const briefPromptContainer = document.getElementById("briefPromptContainer");
  const briefPromptIcon = document.getElementById("briefPromptIcon");
  const briefPromptTitle = document.getElementById("briefPromptTitle");
  const briefPromptDesc = document.getElementById("briefPromptDesc");
  const briefLoadingContainer = document.getElementById("briefLoadingContainer");
  const briefContentContainer = document.getElementById("briefContentContainer");
  const triggerGenerateBtn = document.getElementById("triggerGenerateBtn");
  const briefMetricBar = document.getElementById("briefMetricBar");
  const briefLeadBox = document.getElementById("briefLeadBox");
  const briefLeadText = document.getElementById("briefLeadText");
  const briefOverviewNarrative = document.getElementById("briefOverviewNarrative");
  const feedbackCountBadge = document.getElementById("feedbackCountBadge");
  const briefFeedbackList = document.getElementById("briefFeedbackList");
  const ideasCountBadge = document.getElementById("ideasCountBadge");
  const briefIdeasList = document.getElementById("briefIdeasList");
  const actionItemsCountBadge = document.getElementById("actionItemsCountBadge");
  const briefActionItemsList = document.getElementById("briefActionItemsList");
  const chaptersCountBadge = document.getElementById("chaptersCountBadge");
  const briefChaptersList = document.getElementById("briefChaptersList");

  // LLM Config Modal Elements
  const llmConfigModal = document.getElementById("llmConfigModal");
  const closeLlmConfigBtn = document.getElementById("closeLlmConfigBtn");
  const cancelLlmConfigBtn = document.getElementById("cancelLlmConfigBtn");
  const saveLlmConfigBtn = document.getElementById("saveLlmConfigBtn");
  const llmProviderSelect = document.getElementById("llmProviderSelect");
  const llmApiKeyInput = document.getElementById("llmApiKeyInput");
  const getApiKeyLink = document.getElementById("getApiKeyLink");
  const apiKeyGroup = document.getElementById("apiKeyGroup");
  const ollamaGroup = document.getElementById("ollamaGroup");
  const ollamaHostInput = document.getElementById("ollamaHostInput");
  const ollamaStatusText = document.getElementById("ollamaStatusText");
  const llmConfigSavedMsg = document.getElementById("llmConfigSavedMsg");

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

  // --- Studio Oscilloscope & Live Audio VU Visualizer Engine ---
  function initVisualizerCanvas() {
    if (!visualizerCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = visualizerCanvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : 280;
    const h = rect.height > 0 ? rect.height : 32;
    visualizerCanvas.width = Math.floor(w * dpr);
    visualizerCanvas.height = Math.floor(h * dpr);
  }

  function drawIdleOscilloscope() {
    if (isRecording) return;
    if (!visualizerCanvas) return;
    const ctx = visualizerCanvas.getContext("2d");
    if (!ctx) return;

    const w = visualizerCanvas.width;
    const h = visualizerCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle dark ink oscilloscope baseline
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, window.devicePixelRatio || 1);
    ctx.strokeStyle = "rgba(25, 23, 23, 0.45)";
    const midY = h / 2;

    for (let x = 0; x < w; x += 2) {
      const env = Math.sin((x / w) * Math.PI);
      const y = midY + Math.sin(x * 0.035 + visualizerIdlePhase) * (h * 0.22) * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    visualizerIdlePhase += 0.05;
    visualizerAnimFrame = requestAnimationFrame(drawIdleOscilloscope);
  }

  function startLiveVisualizer(stream) {
    if (visualizerAnimFrame) cancelAnimationFrame(visualizerAnimFrame);
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      audioCtx = new AudioCtx();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // 32 frequency bins
      analyser.smoothingTimeConstant = 0.72;
      visualizerSource = audioCtx.createMediaStreamSource(stream);
      visualizerSource.connect(analyser);

      const bufferLen = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLen);
      const ctx = visualizerCanvas.getContext("2d");

      function renderLiveFrame() {
        if (!isRecording) return;
        visualizerAnimFrame = requestAnimationFrame(renderLiveFrame);

        analyser.getByteFrequencyData(freqData);
        const w = visualizerCanvas.width;
        const h = visualizerCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const barCount = 26;
        const gap = 3 * (window.devicePixelRatio || 1);
        const barWidth = Math.max(2, (w - (barCount - 1) * gap) / barCount);

        for (let i = 0; i < barCount; i++) {
          const binIdx = Math.floor((i / barCount) * (bufferLen * 0.85));
          const val = freqData[binIdx] || 0;
          const pct = val / 255;
          const barHeight = Math.max(4, pct * (h - 4));
          const x = i * (barWidth + gap);
          const y = h - barHeight;

          // Apple / AYA Flame Red with Acid Lime high-energy peaks
          ctx.fillStyle = pct > 0.65 ? "#e4fc51" : "#ff2f11";
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      }

      renderLiveFrame();
    } catch (err) {
      console.warn("Live visualizer error", err);
    }
  }

  function stopLiveVisualizer() {
    if (visualizerAnimFrame) cancelAnimationFrame(visualizerAnimFrame);
    if (audioCtx) {
      try { audioCtx.close(); } catch(e) {}
      audioCtx = null;
    }
    analyser = null;
    visualizerSource = null;
    drawIdleOscilloscope();
  }

  // Initialize visualizer on load & on window resize
  initVisualizerCanvas();
  drawIdleOscilloscope();
  window.addEventListener("resize", () => {
    initVisualizerCanvas();
    if (!isRecording) drawIdleOscilloscope();
  });

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

  // --- Speaker Diarization Segmented Buttons ---
  if (diarizeOffBtn && diarizeOnBtn && diarizationToggle) {
    diarizeOffBtn.addEventListener("click", () => {
      diarizationToggle.checked = false;
      diarizeOffBtn.classList.add("bg-[#191717]", "text-white", "shadow-[1px_1px_0px_#191717]");
      diarizeOffBtn.classList.remove("bg-transparent", "text-[#191717]");
      diarizeOnBtn.classList.remove("bg-[#ff2f11]", "text-white", "shadow-[1px_1px_0px_#191717]");
      diarizeOnBtn.classList.add("bg-transparent", "text-[#191717]");
    });

    diarizeOnBtn.addEventListener("click", () => {
      diarizationToggle.checked = true;
      diarizeOnBtn.classList.add("bg-[#ff2f11]", "text-white", "shadow-[1px_1px_0px_#191717]");
      diarizeOnBtn.classList.remove("bg-transparent", "text-[#191717]");
      diarizeOffBtn.classList.remove("bg-[#191717]", "text-white", "shadow-[1px_1px_0px_#191717]");
      diarizeOffBtn.classList.add("bg-transparent", "text-[#191717]");
    });
  }

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

  // --- Voice Memo Mic Recording with Real-Time VU Visualizer ---
  micRecordCard.addEventListener("click", async () => {
    if (!isRecording) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(micStream);
        audioChunks = [];
        recordStartTime = Date.now();

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

        micRecordCard.classList.add("mic-recording-active");
        micLed.classList.remove("bg-[#191717]/40");
        micLed.classList.add("bg-[#ff2f11]", "animate-ping");
        micRecordBtn.classList.add("aya-rec-pulse");
        micInnerDot.classList.remove("rounded-full");
        micInnerDot.classList.add("rounded-none");
        micLabel.textContent = "RECORDING NOW";

        // Start live frequency VU visualizer
        startLiveVisualizer(micStream);

        // High-precision digital studio clock (tenths of second)
        recordingTimer = setInterval(() => {
          const elapsed = Date.now() - recordStartTime;
          const m = String(Math.floor(elapsed / 60000)).padStart(2, "0");
          const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
          const tenth = Math.floor((elapsed % 1000) / 100);
          if (micPrecisionTimer) micPrecisionTimer.textContent = `${m}:${s}.${tenth}`;
          micSubtext.textContent = `LIVE CAPTURE: ${m}:${s} [TAP TO FINISH]`;
        }, 100);

      } catch (err) {
        alert("Mic permission required: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      clearInterval(recordingTimer);

      micRecordCard.classList.remove("mic-recording-active");
      micLed.classList.add("bg-[#191717]/40");
      micLed.classList.remove("bg-[#ff2f11]", "animate-ping");
      micRecordBtn.classList.remove("aya-rec-pulse");
      micInnerDot.classList.add("rounded-full");
      micInnerDot.classList.remove("rounded-none");
      micLabel.textContent = "RECORD MEMO";
      micSubtext.textContent = "Direct microphone input";
      if (micPrecisionTimer) micPrecisionTimer.textContent = "00:00.0";

      // Return visualizer to resting heartbeat pulse
      stopLiveVisualizer();
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
      // Don't blindly jump into details if transcription is still running in background
      fetch(`/api/recordings/${recId}`)
        .then((res) => res.json())
        .then((data) => {
          const rec = data.recording;
          if (rec && rec.status === "completed") {
            if (eventSource) eventSource.close();
            progressContainer.classList.add("hidden");
            loadRecordingDetails(recId);
            loadRecordingsList();
          } else if (rec && rec.status === "failed") {
            if (eventSource) eventSource.close();
            progressStatusText.innerHTML = `<span class="text-[#ff2f11] font-bold">⚠️ ${rec.error_message || "Transcription failed"}</span>`;
            startTranscribeBtn.disabled = false;
          } else {
            // Still transcribing on server: retry SSE stream in 3 seconds
            setTimeout(() => {
              if (currentRecordingId === recId && (!eventSource || eventSource.readyState === EventSource.CLOSED)) {
                subscribeToEvents(recId);
              }
            }, 3000);
          }
        })
        .catch(() => {});
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
      transcriptSection.scrollIntoView({ behavior: "smooth", block: "start" });

      renderScreenplay(currentSegments);
      renderDialogueRadar(currentSegments);

      // Render Executive Brief if already synthesized, otherwise prompt to generate
      if (data.summary && data.summary.overview) {
        renderExecutiveBrief(data.summary);
      } else {
        renderUnsummarizedState();
      }

      // Default active tab to Executive Brief (Tab 1)
      switchStageTab("summary");

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Back to New Transcription Button ---
  if (backToUploadBtn) {
    backToUploadBtn.addEventListener("click", () => {
      if (wavesurfer) {
        try { wavesurfer.pause(); } catch(e) {}
      }
      transcriptSection.classList.add("hidden");
      audioDock.classList.add("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
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
        currentBlock.className = "aya-tile p-4 sm:p-5 space-y-2.5 shadow-[3px_3px_0px_#191717]";

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

  // --- Tab 1: Executive Brief & Structured Notes ---
  function renderExecutiveBrief(summary) {
    if (!summary) return;
    briefPromptContainer.classList.add("hidden");
    briefLoadingContainer.classList.add("hidden");
    briefContentContainer.classList.remove("hidden");

    if (briefProviderName) briefProviderName.textContent = summary.provider_name || "AI BRIEF";
    if (briefStatusTag) briefStatusTag.textContent = "SYNTHESIZED";

    const feedbackItems = summary.feedback || summary.takeaways || [];
    const ideas = summary.ideas || [];
    const actions = summary.action_items || [];
    const chapters = summary.chapters || [];

    // --- Dynamic Metric Ribbon ---
    if (briefMetricBar) {
      const durationStr = currentDuration ? currentDuration.textContent : "";
      briefMetricBar.innerHTML = `
        ${durationStr ? `<span class="aya-badge-black text-[10px] font-mono font-bold flex items-center gap-1.5 px-2 py-0.5"><i data-lucide="clock" class="w-3 h-3 text-[#ff2f11]"></i>${escapeHtml(durationStr)}</span>` : ""}
        <span class="aya-badge-red text-[10px] font-mono font-black px-2 py-0.5">${feedbackItems.length} TAKEAWAYS</span>
        <span class="aya-badge-yellow text-[10px] font-mono font-black px-2 py-0.5">${ideas.length} PROPOSALS</span>
        <span class="aya-badge-black text-[10px] font-mono font-black px-2 py-0.5 border border-[#191717]">${actions.length} TASKS</span>
        <span class="aya-badge-white text-[10px] font-mono font-black px-2 py-0.5 border border-[#191717]">${chapters.length} CHAPTERS</span>
      `;
    }

    // --- 1. Executive Overview Breakdown ---
    const rawOverview = (summary.overview || "").trim();
    if (briefLeadText && briefOverviewNarrative) {
      if (!rawOverview) {
        if (briefLeadBox) briefLeadBox.classList.add("hidden");
        briefOverviewNarrative.innerHTML = `<p class="italic text-[#191717]/60 font-mono text-xs">NO OVERVIEW NARRATIVE AVAILABLE.</p>`;
      } else {
        if (briefLeadBox) briefLeadBox.classList.remove("hidden");

        // Split paragraphs or intelligent sentence breakdown
        let paragraphs = rawOverview.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        let lead = "";
        let bodyParagraphs = [];

        if (paragraphs.length >= 2) {
          lead = paragraphs[0];
          bodyParagraphs = paragraphs.slice(1);
        } else {
          // Single large paragraph: extract lead sentence(s) for the hero consensus box
          const sentenceMatches = rawOverview.match(/[^.!?]+[.!?]+(\s+|$)/g);
          if (sentenceMatches && sentenceMatches.length >= 3) {
            lead = sentenceMatches.slice(0, 2).join(" ").trim();
            const rest = sentenceMatches.slice(2).join(" ").trim();
            // Split rest into two balanced narrative paragraphs if long
            const restSentences = rest.match(/[^.!?]+[.!?]+(\s+|$)/g) || [rest];
            if (restSentences.length >= 3) {
              const mid = Math.ceil(restSentences.length / 2);
              bodyParagraphs = [
                restSentences.slice(0, mid).join(" ").trim(),
                restSentences.slice(mid).join(" ").trim()
              ];
            } else {
              bodyParagraphs = [rest];
            }
          } else {
            lead = rawOverview;
            bodyParagraphs = [];
          }
        }

        briefLeadText.textContent = lead;

        briefOverviewNarrative.innerHTML = "";
        if (bodyParagraphs.length === 0) {
          const p = document.createElement("p");
          p.className = "text-xs font-mono text-[#191717]/60 italic";
          p.textContent = "Full strategic synthesis captured in the consensus box above.";
          briefOverviewNarrative.appendChild(p);
        } else {
          bodyParagraphs.forEach((para) => {
            const p = document.createElement("p");
            p.className = "text-[#191717] leading-relaxed sm:leading-loose text-sm sm:text-base font-body bg-white/70 p-4 border border-[#191717]/20 shadow-[2px_2px_0px_#191717]/10";
            p.textContent = para;
            briefOverviewNarrative.appendChild(p);
          });
        }
      }
    }

    // --- 2. Key Takeaways & Feedback ---
    if (feedbackCountBadge) feedbackCountBadge.textContent = `${feedbackItems.length} ITEMS`;
    if (briefFeedbackList) {
      briefFeedbackList.innerHTML = "";
      if (feedbackItems.length === 0) {
        briefFeedbackList.innerHTML = `<div class="text-xs font-mono text-[#191717]/60 italic p-4 bg-white border border-[#191717]/20">NO SPECIFIC FEEDBACK OR CRITIQUE RECORDED.</div>`;
      } else {
        feedbackItems.forEach((item, idx) => {
          const point = item.point || item.text || (typeof item === "string" ? item : JSON.stringify(item));
          const ctx = item.context || item.speaker || "";
          
          const tsMatch = ctx.match(/\b\d{1,2}:\d{2}\b/);
          const ts = tsMatch ? tsMatch[0] : "";

          const card = document.createElement("div");
          card.className = "p-4 sm:p-5 bg-white border-2 border-[#191717] border-l-[6px] border-l-[#ff2f11] shadow-[3px_3px_0px_#191717] flex flex-col sm:flex-row sm:items-start justify-between gap-3.5 hover:shadow-[5px_5px_0px_#191717] transition";
          
          card.innerHTML = `
            <div class="flex items-start gap-3 flex-1 min-w-0">
              <span class="aya-badge-black text-[10px] font-mono font-black shrink-0 mt-0.5 px-2 py-0.5">
                ${String(idx + 1).padStart(2, '0')}
              </span>
              <div class="space-y-1.5 flex-1 min-w-0">
                <p class="font-stage font-bold text-sm sm:text-base text-[#191717] leading-snug">${escapeHtml(point)}</p>
                ${ctx ? `<div class="flex items-center gap-1.5 text-xs font-mono text-[#191717]/70 font-semibold pt-0.5"><i data-lucide="user" class="w-3.5 h-3.5 text-[#ff2f11] shrink-0"></i><span>${escapeHtml(ctx)}</span></div>` : ""}
              </div>
            </div>
            ${ts ? `<button class="jump-time-btn aya-btn-yellow py-1 px-2.5 text-xs font-mono font-black flex items-center gap-1 shrink-0 self-start sm:self-center shadow-[2px_2px_0px_#191717]" data-time="${escapeHtml(ts)}" title="Play audio from ${escapeHtml(ts)}"><i data-lucide="play" class="w-3 h-3 fill-black"></i><span>[${escapeHtml(ts)}]</span></button>` : ""}
          `;

          if (ts) {
            const btn = card.querySelector(".jump-time-btn");
            if (btn) {
              btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const sec = parseTimeStringToSeconds(ts);
                if (wavesurfer) {
                  wavesurfer.setTime(sec);
                  wavesurfer.play();
                  setPlayState(true);
                }
              });
            }
          }

          briefFeedbackList.appendChild(card);
        });
      }
    }

    // --- 3. Ideas & Brainstormed Concepts ---
    if (ideasCountBadge) ideasCountBadge.textContent = `${ideas.length} PROPOSALS`;
    if (briefIdeasList) {
      briefIdeasList.innerHTML = "";
      if (ideas.length === 0) {
        briefIdeasList.innerHTML = `<div class="text-xs font-mono text-[#191717]/60 italic p-4 bg-white border border-[#191717]/20 col-span-2">NO NEW CONCEPTS OR PROPOSALS RECORDED.</div>`;
      } else {
        ideas.forEach((idea, idx) => {
          const title = idea.title || idea.name || "Proposed Concept";
          const desc = idea.description || idea.desc || (typeof idea === "string" ? idea : "");
          const card = document.createElement("div");
          card.className = "p-5 bg-white border-2 border-[#191717] shadow-[3px_3px_0px_#191717] flex flex-col justify-between space-y-3 hover:translate-y-[-2px] hover:shadow-[5px_5px_0px_#191717] transition";
          card.innerHTML = `
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2 border-b border-[#191717]/10 pb-2">
                <span class="aya-badge-yellow text-[10px] font-mono font-black uppercase px-2 py-0.5">PROPOSAL ${String(idx + 1).padStart(2, '0')}</span>
                <i data-lucide="sparkles" class="w-3.5 h-3.5 text-[#ff2f11]"></i>
              </div>
              <h4 class="font-stage font-black text-sm sm:text-base text-[#191717] uppercase tracking-tight">${escapeHtml(title)}</h4>
              <p class="text-xs sm:text-sm text-[#191717]/85 font-body leading-relaxed">${escapeHtml(desc)}</p>
            </div>
          `;
          briefIdeasList.appendChild(card);
        });
      }
    }

    // --- 4. Action Items & Next Steps ---
    if (actionItemsCountBadge) actionItemsCountBadge.textContent = `${actions.length} TASKS`;
    if (briefActionItemsList) {
      briefActionItemsList.innerHTML = "";
      if (actions.length === 0) {
        briefActionItemsList.innerHTML = `<div class="text-xs font-mono text-[#191717]/60 italic p-4 bg-white border border-[#191717]/20">NO ACTION ITEMS DETECTED.</div>`;
      } else {
        actions.forEach((act) => {
          const task = act.task || act.description || (typeof act === "string" ? act : "");
          const owner = act.owner || act.assignee || "Unassigned";
          const ts = act.timestamp || "";
          const item = document.createElement("div");
          item.className = "p-4 sm:p-5 bg-white border-2 border-[#191717] shadow-[3px_3px_0px_#191717] flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 hover:border-[#ff2f11] hover:shadow-[5px_5px_0px_#191717] transition";

          item.innerHTML = `
            <div class="flex items-start gap-3.5 flex-1 min-w-0">
              <div class="w-6 h-6 bg-[#faf6ed] border-2 border-[#191717] flex items-center justify-center shrink-0 mt-0.5 text-[#ff2f11]">
                <i data-lucide="check" class="w-3.5 h-3.5 stroke-[3]"></i>
              </div>
              <div class="space-y-1.5 flex-1 min-w-0">
                <span class="text-sm sm:text-base font-stage font-bold text-[#191717] leading-snug block">${escapeHtml(task)}</span>
                <div class="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span class="aya-badge-black text-[10px] font-bold uppercase px-2 py-0.5">OWNER: ${escapeHtml(owner)}</span>
                </div>
              </div>
            </div>
            ${ts ? `<button class="jump-time-btn aya-btn-red py-1.5 px-3 text-xs font-mono font-black flex items-center gap-1.5 shrink-0 self-start sm:self-auto shadow-[2px_2px_0px_#191717]" data-time="${escapeHtml(ts)}" title="Play audio from ${escapeHtml(ts)}"><i data-lucide="play" class="w-3 h-3 fill-white"></i><span>[${escapeHtml(ts)}]</span></button>` : ""}
          `;

          if (ts) {
            const btn = item.querySelector(".jump-time-btn");
            if (btn) {
              btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const sec = parseTimeStringToSeconds(ts);
                if (wavesurfer) {
                  wavesurfer.setTime(sec);
                  wavesurfer.play();
                  setPlayState(true);
                }
              });
            }
          }

          briefActionItemsList.appendChild(item);
        });
      }
    }

    // --- 5. Discussion Chapters & Timeline ---
    if (chaptersCountBadge) chaptersCountBadge.textContent = `${chapters.length} CHAPTERS`;
    if (briefChaptersList) {
      briefChaptersList.innerHTML = "";
      if (chapters.length === 0) {
        briefChaptersList.innerHTML = `<div class="text-xs font-mono text-[#191717]/60 italic p-4 bg-white border border-[#191717]/20">NO CHAPTER MARKERS DETECTED.</div>`;
      } else {
        chapters.forEach((ch) => {
          const title = ch.title || "Chapter";
          const sum = ch.summary || "";
          const startSec = ch.start_time || 0;
          const row = document.createElement("div");
          row.className = "p-3.5 sm:p-4 bg-white border-2 border-[#191717] flex items-center justify-between gap-3 shadow-[2px_2px_0px_#191717] cursor-pointer hover:bg-[#e4fc51] hover:border-[#191717] transition group";
          row.innerHTML = `
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center gap-2">
                <span class="font-stage font-black text-xs sm:text-sm text-[#191717] uppercase group-hover:text-black">${escapeHtml(title)}</span>
              </div>
              ${sum ? `<p class="text-xs font-body text-[#191717]/80 line-clamp-2">${escapeHtml(sum)}</p>` : ""}
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="aya-badge-red text-[11px] font-mono font-bold px-2 py-0.5">${formatTime(startSec)}</span>
              <div class="w-7 h-7 bg-[#191717] text-white flex items-center justify-center group-hover:bg-[#ff2f11] transition">
                <i data-lucide="play" class="w-3 h-3 fill-current ml-0.5"></i>
              </div>
            </div>
          `;
          row.addEventListener("click", () => {
            if (wavesurfer) {
              wavesurfer.setTime(startSec);
              wavesurfer.play();
              setPlayState(true);
            }
          });
          briefChaptersList.appendChild(row);
        });
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderUnsummarizedState() {
    briefContentContainer.classList.add("hidden");
    briefLoadingContainer.classList.add("hidden");
    briefPromptContainer.classList.remove("hidden");

    if (!currentSegments || currentSegments.length === 0) {
      if (briefPromptIcon) briefPromptIcon.innerHTML = `<i data-lucide="clock" class="w-6 h-6"></i>`;
      if (briefPromptTitle) briefPromptTitle.textContent = "TRANSCRIPTION REQUIRED";
      if (briefPromptDesc) briefPromptDesc.textContent = "This recording has 0 transcript segments. Please allow the audio transcription to finish before synthesizing an Executive Brief.";
      if (triggerGenerateBtn) {
        triggerGenerateBtn.disabled = true;
        triggerGenerateBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      if (generateBriefBtn) {
        generateBriefBtn.disabled = true;
        generateBriefBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      if (briefStatusTag) briefStatusTag.textContent = "AWAITING TRANSCRIPT";
    } else {
      if (briefPromptIcon) briefPromptIcon.innerHTML = `<i data-lucide="sparkles" class="w-6 h-6"></i>`;
      if (briefPromptTitle) briefPromptTitle.textContent = "GENERATE EXECUTIVE BRIEF";
      if (briefPromptDesc) briefPromptDesc.textContent = "Synthesize key takeaways, constructive feedback, creative ideas, and timestamped action items using your embedded Groq engine.";
      if (triggerGenerateBtn) {
        triggerGenerateBtn.disabled = false;
        triggerGenerateBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
      if (generateBriefBtn) {
        generateBriefBtn.disabled = false;
        generateBriefBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
      if (briefStatusTag) briefStatusTag.textContent = "READY";
    }
    if (window.lucide) lucide.createIcons();
  }

  function parseTimeStringToSeconds(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(":").map(Number);
    if (parts.length === 3) {
      return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    } else if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    }
    return Number(timeStr) || 0;
  }

  // --- Executive Brief Generation Trigger ---
  async function generateExecutiveBrief() {
    if (!currentRecordingId) return;

    if (!currentSegments || currentSegments.length === 0) {
      alert("Cannot generate brief: No transcript segments exist for this recording yet. Please wait for audio transcription to complete.");
      return;
    }

    briefPromptContainer.classList.add("hidden");
    briefContentContainer.classList.add("hidden");
    briefLoadingContainer.classList.remove("hidden");
    generateBriefIcon.classList.add("animate-spin");
    generateBriefBtnText.textContent = "GENERATING...";
    briefStatusTag.textContent = "PROCESSING";

    try {
      const res = await fetch(`/api/recordings/${currentRecordingId}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to generate brief");
      }

      if (data.status === "needs_config") {
        openLlmConfigModal();
        renderUnsummarizedState();
        return;
      }

      renderExecutiveBrief(data);
    } catch (err) {
      alert("AI Brief Error: " + err.message);
      renderUnsummarizedState();
    } finally {
      generateBriefIcon.classList.remove("animate-spin");
      generateBriefBtnText.textContent = "REGENERATE";
      briefLoadingContainer.classList.add("hidden");
    }
  }

  generateBriefBtn.addEventListener("click", generateExecutiveBrief);
  if (triggerGenerateBtn) triggerGenerateBtn.addEventListener("click", generateExecutiveBrief);

  // --- LLM Settings Modal Handlers ---
  function openLlmConfigModal() {
    llmConfigModal.classList.remove("hidden");
    fetchLlmStatus();
  }

  function closeLlmConfigModal() {
    llmConfigModal.classList.add("hidden");
    llmConfigSavedMsg.classList.add("hidden");
  }

  if (openLlmSettingsBtn) openLlmSettingsBtn.addEventListener("click", openLlmConfigModal);
  if (closeLlmConfigBtn) closeLlmConfigBtn.addEventListener("click", closeLlmConfigModal);
  if (cancelLlmConfigBtn) cancelLlmConfigBtn.addEventListener("click", closeLlmConfigModal);

  async function fetchLlmStatus() {
    try {
      const res = await fetch("/api/llm/status");
      if (!res.ok) return;
      const data = await res.json();

      llmProviderSelect.value = data.active_provider || "auto";
      updateProviderFields(llmProviderSelect.value);

      if (data.ollama_connected) {
        const models = (data.ollama_models || []).join(", ") || "llama3.2";
        ollamaStatusText.textContent = `Connected (Models: ${models})`;
        ollamaConnectionStatus.className = "p-2.5 bg-[#e4fc51] border border-[#191717] text-[10px] text-[#191717] font-bold flex items-center gap-2";
      } else {
        ollamaStatusText.textContent = "Ollama not running (Start Ollama on PC to use)";
        ollamaConnectionStatus.className = "p-2.5 bg-[#faf6ed] border border-[#191717] text-[10px] text-[#ff2f11] font-bold flex items-center gap-2";
      }
    } catch (e) {
      console.warn(e);
    }
  }

  llmProviderSelect.addEventListener("change", (e) => {
    updateProviderFields(e.target.value);
  });

  function updateProviderFields(provider) {
    if (provider === "ollama") {
      apiKeyGroup.classList.add("hidden");
      ollamaGroup.classList.remove("hidden");
    } else {
      apiKeyGroup.classList.remove("hidden");
      ollamaGroup.classList.add("hidden");
      if (provider === "gemini") {
        getApiKeyLink.href = "https://aistudio.google.com/app/apikey";
        getApiKeyLink.textContent = "Get Free Gemini Key";
        llmApiKeyInput.placeholder = "Paste Gemini API key (AIza...)";
      } else {
        getApiKeyLink.href = "https://console.groq.com/keys";
        getApiKeyLink.textContent = "Get Free Groq Key";
        llmApiKeyInput.placeholder = "Paste Groq API key (gsk_...)";
      }
    }
  }

  saveLlmConfigBtn.addEventListener("click", async () => {
    const provider = llmProviderSelect.value;
    const key = llmApiKeyInput.value.trim();
    const ollamaHost = ollamaHostInput.value.trim();

    const payload = { provider };
    if (key) {
      if (provider === "gemini" || key.startsWith("AIza")) {
        payload.gemini_api_key = key;
      } else {
        payload.groq_api_key = key;
      }
    }
    if (ollamaHost) {
      payload.ollama_host = ollamaHost;
    }

    try {
      const res = await fetch("/api/llm/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      llmConfigSavedMsg.classList.remove("hidden");
      setTimeout(() => {
        closeLlmConfigModal();
      }, 1000);
    } catch (err) {
      alert("Error: " + err.message);
    }
  });

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
      b.classList.add("bg-[#faf6ed]", "text-[#191717]");
    });
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabTranscriptBtn.classList.remove("bg-[#faf6ed]", "text-[#191717]");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabSummaryBtn.classList.remove("bg-[#faf6ed]", "text-[#191717]");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("bg-[#ff2f11]", "text-white");
      tabAnalyticsBtn.classList.remove("bg-[#faf6ed]", "text-[#191717]");
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
    if (e.key === "Escape") {
      closeArchiveDrawer();
      if (renameModal) renameModal.classList.add("hidden");
      if (exportDropdown) exportDropdown.classList.add("hidden");
    }
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

  if (downloadPdfBriefBtn) {
    downloadPdfBriefBtn.addEventListener("click", () => {
      if (!currentRecordingId) return;
      window.open(`/api/recordings/${currentRecordingId}/export?format=pdf`, "_blank");
    });
  }

  // --- Vault Drawer (With Back button & Backdrop) ---
  function openArchiveDrawer() {
    historyDrawer.classList.remove("translate-x-full");
    if (historyDrawerBackdrop) historyDrawerBackdrop.classList.remove("hidden");
  }

  function closeArchiveDrawer() {
    historyDrawer.classList.add("translate-x-full");
    if (historyDrawerBackdrop) historyDrawerBackdrop.classList.add("hidden");
  }

  historyToggleBtn.addEventListener("click", openArchiveDrawer);
  closeDrawerBtn.addEventListener("click", closeArchiveDrawer);
  if (historyDrawerBackdrop) historyDrawerBackdrop.addEventListener("click", closeArchiveDrawer);

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
          closeArchiveDrawer();
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
