// VoiceScribe — Inspiration Fest (GIF) / Gen-Z Neo-Brutalist Engine
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

  // Audio & Recording State
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

  // Zine Tabs
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

  // Boombox Transport Elements
  const audioPlayer = document.getElementById("audioPlayer");
  const playPauseBtn = document.getElementById("playPauseBtn");
  const playIcon = document.getElementById("playIcon");
  const skipBackBtn = document.getElementById("skipBackBtn");
  const skipForwardBtn = document.getElementById("skipForwardBtn");
  const audioScrubber = document.getElementById("audioScrubber");
  const currentTimeDisplay = document.getElementById("currentTimeDisplay");
  const totalTimeDisplay = document.getElementById("totalTimeDisplay");
  const speedCycleBtn = document.getElementById("speedCycleBtn");

  // Rename Modal
  const renameModal = document.getElementById("renameSpeakerModal");
  const speakerRenameInput = document.getElementById("speakerRenameInput");
  const saveRenameBtn = document.getElementById("saveRenameBtn");
  const cancelRenameBtn = document.getElementById("cancelRenameBtn");

  // Speaker Festival Stamps
  const SPEAKER_STAMPS = [
    { badge: "bg-[#CCFF00] text-black", border: "border-[#CCFF00]" },
    { badge: "bg-[#00F5D4] text-black", border: "border-[#00F5D4]" },
    { badge: "bg-[#FF1F6D] text-white", border: "border-[#FF1F6D]" },
    { badge: "bg-[#8B5CF6] text-white", border: "border-[#8B5CF6]" },
  ];

  // --- Initial Setup ---
  initSynthCanvas();
  loadRecordingsList();

  // --- Multi-Color Synth Waveform Canvas ---
  function initSynthCanvas() {
    const ctx = waveformCanvas.getContext("2d");
    let step = 0;

    function renderLoop() {
      if (isRecording) return; // Handled by live mic analyzer
      ctx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
      const w = waveformCanvas.width;
      const h = waveformCanvas.height;
      const bars = 40;
      const barW = (w / bars) - 3;

      const colors = ["#CCFF00", "#00F5D4", "#FF1F6D", "#8B5CF6"];

      for (let i = 0; i < bars; i++) {
        const factor = Math.sin((i / bars) * Math.PI * 3 + step);
        const isPlaying = audioPlayer && !audioPlayer.paused;
        const amplitude = isPlaying ? (factor * 0.5 + 0.5) * (h * 0.75) : (factor * 0.3 + 0.3) * (h * 0.35);
        const barH = Math.max(6, amplitude);
        const y = (h - barH) / 2;

        ctx.fillStyle = isPlaying ? colors[i % colors.length] : "#2A2D3C";
        ctx.fillRect(i * (barW + 3), y, barW, barH);
      }

      step += audioPlayer && !audioPlayer.paused ? 0.08 : 0.03;
      animationFrameId = requestAnimationFrame(renderLoop);
    }

    const dpr = window.devicePixelRatio || 1;
    waveformCanvas.width = waveformCanvas.offsetWidth * dpr;
    waveformCanvas.height = waveformCanvas.offsetHeight * dpr;
    ctx.scale(dpr, dpr);

    renderLoop();
  }

  // --- Model Pills Selection ---
  document.querySelectorAll(".model-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".model-pill").forEach((b) => {
        b.classList.remove("bg-[#CCFF00]", "text-black", "font-black");
        b.classList.add("text-neutral-400");
      });
      btn.classList.add("bg-[#CCFF00]", "text-black", "font-black");
      btn.classList.remove("text-neutral-400");
      selectedModel = btn.dataset.model;
    });
  });

  // --- File Drop & Select ---
  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-[#CCFF00]", "scale-[1.01]");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-[#CCFF00]", "scale-[1.01]");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-[#CCFF00]", "scale-[1.01]");
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
    canvasCaption.textContent = "STANDBY // READY FOR SIGNAL";
  });

  function handleFile(file) {
    selectedFile = file;
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    selectedFileName.textContent = `${file.name} [${mb} MB]`;
    selectedFileBanner.classList.remove("hidden");
    startTranscribeBtn.disabled = false;
    canvasCaption.textContent = `LOADED: ${file.name.toUpperCase()}`;
  }

  // --- Boombox Cassette Mic Recording with Live Analyser ---
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
          handleFile(recordedFile);
          micStream.getTracks().forEach((t) => t.stop());
          if (audioCtx) audioCtx.close();
        };

        mediaRecorder.start();
        isRecording = true;

        // Visual cassette REC state
        micLed.classList.add("bg-[#FF1F6D]", "rec-led");
        micInnerDot.classList.remove("rounded-full");
        micInnerDot.classList.add("rounded-sm");
        micLabel.textContent = "RECORDING NOW";
        canvasCaption.textContent = "LIVE AUDIO SPECTRUM CAPTURE";

        recordingTimer = setInterval(() => {
          recordingSeconds++;
          const m = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
          const s = String(recordingSeconds % 60).padStart(2, "0");
          micSubtext.textContent = `TAPE RUNNING: ${m}:${s} [TAP TO FINISH]`;
        }, 1000);

        renderLiveMicSpectrum();

      } catch (err) {
        alert("Mic permission required: " + err.message);
      }
    } else {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      isRecording = false;
      clearInterval(recordingTimer);

      micLed.classList.remove("bg-[#FF1F6D]", "rec-led");
      micInnerDot.classList.add("rounded-full");
      micInnerDot.classList.remove("rounded-sm");
      micLabel.textContent = "RECORD MEMO";
      micSubtext.textContent = "Direct mic capture for phones & laptops";

      initSynthCanvas();
    }
  });

  function renderLiveMicSpectrum() {
    if (!isRecording || !analyser) return;

    const ctx = waveformCanvas.getContext("2d");
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const w = waveformCanvas.width;
    const h = waveformCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const bars = bufferLength;
    const barW = (w / bars) - 2;
    const colors = ["#FF1F6D", "#CCFF00", "#00F5D4", "#8B5CF6"];

    for (let i = 0; i < bars; i++) {
      const val = dataArray[i] / 255.0;
      const barH = Math.max(4, val * h * 0.95);
      const y = (h - barH) / 2;

      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(i * (barW + 2), y, barW, barH);
    }

    requestAnimationFrame(renderLiveMicSpectrum);
  }

  // --- Execute Ingestion ---
  startTranscribeBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    startTranscribeBtn.disabled = true;
    progressContainer.classList.remove("hidden");
    progressBar.style.width = "5%";
    progressPercent.textContent = "5%";
    progressStatusText.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-[#CCFF00] animate-ping"></span> LAUNCHING LOCAL ENGINE...`;

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

  // --- SSE Progress Stream ---
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
          progressStatusText.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-[#CCFF00] animate-ping"></span> ${data.message.toUpperCase()}`;
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
          progressStatusText.innerHTML = `<span class="text-[#FF1F6D] font-bold">⚠️ ${data.message}</span>`;
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

      audioPlayer.src = `/api/audio/${recId}`;
      transcriptSection.classList.remove("hidden");

      renderZineTranscript(currentSegments);
      synthesizeCheatSheet(currentSegments);
      renderTalkRadar(currentSegments);

      if (window.lucide) lucide.createIcons();
    } catch (err) {
      console.error(err);
    }
  }

  // --- Tab 1: Render Zine Festival Dialogue ---
  function renderZineTranscript(segments) {
    transcriptFeed.innerHTML = "";
    if (!segments || segments.length === 0) {
      transcriptFeed.innerHTML = `<p class="text-xs font-mono text-neutral-400 italic p-4 text-center">No spoken signals captured.</p>`;
      return;
    }

    const speakerMap = buildSpeakerStampMap(segments);
    let lastSpeaker = null;
    let currentBlock = null;

    segments.forEach((seg, index) => {
      const speakerName = seg.speaker_name || seg.speaker || "Speaker 1";
      const speakerTag = seg.speaker || "Speaker 1";
      const stamp = speakerMap[speakerTag] || SPEAKER_STAMPS[0];

      if (speakerName !== lastSpeaker) {
        lastSpeaker = speakerName;
        currentBlock = document.createElement("div");
        currentBlock.className = `bg-[#13141A] border-2 border-white/15 rounded-xl p-5 space-y-2.5 shadow-[3px_3px_0px_#FFFFFF]`;

        const header = document.createElement("div");
        header.className = "flex items-center justify-between pb-2 border-b border-white/10";

        const speakerBadge = document.createElement("button");
        speakerBadge.className = `sticker ${stamp.badge} cursor-pointer hover:scale-105 transition flex items-center gap-1.5`;
        speakerBadge.title = "Tap to rename speaker";
        speakerBadge.innerHTML = `
          <span>${escapeHtml(speakerName.toUpperCase())}</span>
          <i data-lucide="edit-3" class="w-3 h-3 ml-0.5"></i>
        `;
        speakerBadge.addEventListener("click", () => openRenameModal(speakerTag, speakerName));

        header.appendChild(speakerBadge);
        currentBlock.appendChild(header);
        transcriptFeed.appendChild(currentBlock);
      }

      // Sentence Segment
      const segItem = document.createElement("div");
      segItem.id = `segment-${index}`;
      segItem.className = "zine-segment p-2.5 rounded-lg flex items-start gap-3 cursor-pointer";
      segItem.dataset.start = seg.start_time;
      segItem.dataset.end = seg.end_time;

      segItem.innerHTML = `
        <span class="font-mono text-[11px] text-[#CCFF00] font-bold shrink-0 pt-0.5 select-none">[${formatTime(seg.start_time)}]</span>
        <p class="text-sm font-space text-neutral-200 hover:text-white leading-relaxed select-text flex-1">${escapeHtml(seg.text)}</p>
      `;

      segItem.addEventListener("click", () => {
        if (window.getSelection().toString().length > 0) return;
        audioPlayer.currentTime = seg.start_time;
        audioPlayer.play();
        setPlaying(true);
      });

      currentBlock.appendChild(segItem);
    });

    if (window.lucide) lucide.createIcons();
  }

  // --- Tab 2: Synthesize Cheat Sheet & Action Items ---
  function synthesizeCheatSheet(segments) {
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
      actionItemsList.innerHTML = `<li class="text-neutral-500 font-mono text-xs italic">No explicit commitment triggers detected.</li>`;
    } else {
      actions.forEach((a) => {
        const li = document.createElement("li");
        li.className = "p-3 rounded-lg bg-[#181920] border border-white/10 flex items-start gap-3";
        li.innerHTML = `
          <span class="sticker bg-[#CCFF00] text-black shrink-0 text-[9px] mt-0.5">${formatTime(a.time)}</span>
          <div class="flex-1">
            <span class="font-mono font-bold text-xs text-[#00F5D4] uppercase">${escapeHtml(a.speaker)}:</span>
            <span class="text-neutral-200 ml-1 leading-relaxed">${escapeHtml(a.text)}</span>
          </div>
        `;
        actionItemsList.appendChild(li);
      });
    }

    Object.keys(timeline).forEach((key) => {
      const data = timeline[key];
      const div = document.createElement("div");
      div.className = "p-3.5 rounded-lg bg-[#181920] border border-white/10 space-y-1";
      div.innerHTML = `
        <div class="font-mono text-xs font-bold text-[#FF1F6D]">BLOCK @ ${formatTime(data.start)}</div>
        <p class="text-xs text-neutral-300 leading-relaxed">${escapeHtml(data.items.join(" "))}</p>
      `;
      outlineList.appendChild(div);
    });
  }

  // --- Tab 3: Talk-Time Radar Breakdown ---
  function renderTalkRadar(segments) {
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
    const palette = ["bg-[#CCFF00]", "bg-[#00F5D4]", "bg-[#FF1F6D]", "bg-[#8B5CF6]"];

    entries.forEach(([speaker, time], idx) => {
      const pct = totalTime > 0 ? ((time / totalTime) * 100).toFixed(1) : 0;
      const barColor = palette[idx % palette.length];

      const row = document.createElement("div");
      row.className = "p-3.5 rounded-lg bg-[#181920] border border-white/10 space-y-1.5";
      row.innerHTML = `
        <div class="flex items-center justify-between text-xs font-mono font-bold">
          <span class="text-white uppercase">${escapeHtml(speaker)}</span>
          <span class="text-[#CCFF00]">${formatTime(time)} // ${pct}%</span>
        </div>
        <div class="w-full h-3 bg-black border border-white/20 rounded p-0.5">
          <div class="h-full ${barColor} rounded transition-all duration-500" style="width: ${pct}%"></div>
        </div>
      `;
      speakerStatsFeed.appendChild(row);
    });
  }

  // --- Zine Tab Switcher ---
  tabTranscriptBtn.addEventListener("click", () => switchZineTab("transcript"));
  tabSummaryBtn.addEventListener("click", () => switchZineTab("summary"));
  tabAnalyticsBtn.addEventListener("click", () => switchZineTab("analytics"));

  function switchZineTab(tab) {
    [tabTranscriptBtn, tabSummaryBtn, tabAnalyticsBtn].forEach((b) => {
      b.classList.remove("bg-[#CCFF00]", "text-black", "border-black", "shadow-[2px_2px_0px_#FFFFFF]");
      b.classList.add("bg-black", "text-neutral-300", "border-white/20");
    });
    tabTranscriptView.classList.add("hidden");
    tabSummaryView.classList.add("hidden");
    tabAnalyticsView.classList.add("hidden");

    if (tab === "transcript") {
      tabTranscriptBtn.classList.add("bg-[#CCFF00]", "text-black", "border-black", "shadow-[2px_2px_0px_#FFFFFF]");
      tabTranscriptBtn.classList.remove("bg-black", "text-neutral-300", "border-white/20");
      tabTranscriptView.classList.remove("hidden");
    } else if (tab === "summary") {
      tabSummaryBtn.classList.add("bg-[#CCFF00]", "text-black", "border-black", "shadow-[2px_2px_0px_#FFFFFF]");
      tabSummaryBtn.classList.remove("bg-black", "text-neutral-300", "border-white/20");
      tabSummaryView.classList.remove("hidden");
    } else if (tab === "analytics") {
      tabAnalyticsBtn.classList.add("bg-[#CCFF00]", "text-black", "border-black", "shadow-[2px_2px_0px_#FFFFFF]");
      tabAnalyticsBtn.classList.remove("bg-black", "text-neutral-300", "border-white/20");
      tabAnalyticsView.classList.remove("hidden");
    }
  }

  // --- Boombox Controls ---
  playPauseBtn.addEventListener("click", () => {
    if (audioPlayer.paused) {
      audioPlayer.play();
      setPlaying(true);
    } else {
      audioPlayer.pause();
      setPlaying(false);
    }
  });

  function setPlaying(playing) {
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
        if (!el.classList.contains("active-segment")) {
          document.querySelectorAll(".active-segment").forEach((i) => i.classList.remove("active-segment"));
          el.classList.add("active-segment");
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
      copyTranscriptBtn.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 text-[#CCFF00]"></i> COPIED`;
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
        historyList.innerHTML = `<p class="text-xs font-mono text-neutral-400 italic p-3 text-center">NO SESSIONS IN VAULT</p>`;
        return;
      }

      list.forEach((item) => {
        const row = document.createElement("div");
        row.className = `p-3.5 rounded-xl bg-[#181920] border-2 border-white/10 hover:border-[#CCFF00] cursor-pointer transition flex items-center justify-between group ${
          item.id === currentRecordingId ? "border-[#CCFF00] bg-[#CCFF00]/10" : ""
        }`;

        row.innerHTML = `
          <div class="truncate flex-1 pr-2">
            <h4 class="text-xs font-mono font-bold text-white group-hover:text-[#CCFF00] truncate">${escapeHtml(item.title || item.filename)}</h4>
            <div class="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-1">
              <span>${item.duration ? formatTime(item.duration) : item.status}</span>
              <span>&bull;</span>
              <span>${item.created_at ? item.created_at.slice(0, 10) : ""}</span>
            </div>
          </div>
          <button class="delete-btn opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-[#FF1F6D] transition" title="Delete">
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
          if (confirm("Delete session from vault?")) {
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
        setTimeout(() => (copyShareBtn.textContent = "Share URL"), 2000);
      });
    });
  }

  // --- Helpers ---
  function buildSpeakerStampMap(segments) {
    const map = {};
    let idx = 0;
    segments.forEach((s) => {
      const tag = s.speaker || "Speaker 1";
      if (!map[tag]) {
        map[tag] = SPEAKER_STAMPS[idx % SPEAKER_STAMPS.length];
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
