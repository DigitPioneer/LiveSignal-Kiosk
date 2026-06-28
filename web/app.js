/**
 * LiveSignal Kiosk — browser-side controller
 *
 * On load:
 *   1. Fetches /api/config and applies theme + church name
 *   2. Fetches /api/slides and starts rotating them
 *   3. Polls /api/state every 30 s; switches between waiting and live views
 */

"use strict";

// ── State ────────────────────────────────────────────────────────────────────

let slides          = [];
let currentSlide    = 0;
let slideTimer      = null;
let slideDuration   = 8000;   // ms; overridden by config
let kioskStatus     = "waiting";

// ── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  const config = await fetchJSON("/api/config", {});
  slides        = await fetchJSON("/api/slides", []);

  applyTheme(config);
  applyChurchName(config);
  applyClockVisibility(config);

  slideDuration = (config.slide_duration_seconds || 8) * 1000;

  initWizard();
  startClock();
  startSlides();

  // Initial state check, then poll every 30 s
  await pollState();
  setInterval(pollState, 30_000);
}

// ── Config helpers ────────────────────────────────────────────────────────────

function applyTheme(config) {
  const root = document.documentElement.style;
  if (config.background_color) root.setProperty("--bg",     config.background_color);
  if (config.accent_color)     root.setProperty("--accent", config.accent_color);
  if (config.text_color)       root.setProperty("--text",   config.text_color);
}

function applyChurchName(config) {
  const el = document.getElementById("church-name");
  if (el && config.church_name) el.textContent = config.church_name;
}

function applyClockVisibility(config) {
  if (config.show_clock === false) {
    const el = document.getElementById("clock-block");
    if (el) el.style.display = "none";
  }
}

// ── Clock ─────────────────────────────────────────────────────────────────────

function startClock() {
  const timeEl = document.getElementById("clock-time");
  const dateEl = document.getElementById("clock-date");

  function tick() {
    const now = new Date();
    if (timeEl) {
      timeEl.textContent = now.toLocaleTimeString("en-US", {
        hour:   "numeric",
        minute: "2-digit",
        hour12: true,
      });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-US", {
        weekday: "long",
        month:   "long",
        day:     "numeric",
      });
    }
  }

  tick();
  setInterval(tick, 1_000);
}

// ── Slides ────────────────────────────────────────────────────────────────────

function startSlides() {
  if (slides.length === 0) {
    const titleEl = document.getElementById("slide-title");
    const bodyEl  = document.getElementById("slide-body");
    if (titleEl) titleEl.textContent = "Welcome!";
    if (bodyEl)  bodyEl.textContent  = "";
    return;
  }

  buildDots();
  showSlide(0);

  slideTimer = setInterval(() => {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
  }, slideDuration);
}

function buildDots() {
  const container = document.getElementById("slide-dots");
  if (!container) return;
  container.innerHTML = slides
    .map((_, i) => `<span class="dot${i === 0 ? " active" : ""}" data-i="${i}"></span>`)
    .join("");
}

function showSlide(idx) {
  const card     = document.getElementById("slide-card");
  const titleEl  = document.getElementById("slide-title");
  const bodyEl   = document.getElementById("slide-body");
  const waitView = document.getElementById("waiting-view");

  if (!card) return;

  card.classList.add("fade-out");

  setTimeout(() => {
    const slide    = slides[idx] || {};
    const imageEl  = document.getElementById("slide-image");
    const isFullscreen = slide.fullscreen === true;

    // Fullscreen mode: hide header, clock, dots; image fills screen
    waitView.classList.toggle("slide-fullscreen", isFullscreen);

    // Title — hide when empty or fullscreen
    if (titleEl) {
      const hasTitle = !isFullscreen && slide.title;
      titleEl.textContent   = hasTitle ? slide.title : "";
      titleEl.style.display = hasTitle ? "" : "none";
    }

    // Body — hide when empty or fullscreen
    if (bodyEl) {
      const hasBody = !isFullscreen && slide.body;
      bodyEl.textContent   = hasBody ? slide.body.trimEnd() : "";
      bodyEl.style.display = hasBody ? "" : "none";
    }

    if (imageEl) {
      if (slide.image) {
        imageEl.src           = "/" + slide.image.replace(/^\/+/, "");
        imageEl.alt           = slide.title || "";
        imageEl.style.display = "block";
      } else {
        imageEl.style.display = "none";
        imageEl.src           = "";
      }
    }

    document.querySelectorAll(".dot").forEach((d, i) =>
      d.classList.toggle("active", i === idx)
    );

    card.classList.remove("fade-out");
  }, 400);
}

function stopSlides() {
  if (slideTimer !== null) {
    clearInterval(slideTimer);
    slideTimer = null;
  }
}

function resumeSlides() {
  // Resume from the slide that was showing when the stream started
  showSlide(currentSlide);
  slideTimer = setInterval(() => {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
  }, slideDuration);
}

// ── State polling ─────────────────────────────────────────────────────────────

async function pollState() {
  const state = await fetchJSON("/api/state", { status: "waiting" });

  if (state.status === "setup" && kioskStatus !== "setup") {
    goSetup(state.setup || {});
    kioskStatus = "setup";
  } else if (state.status === "live" && kioskStatus !== "live") {
    goLive(state.video_id);
    kioskStatus = "live";
  } else if (state.status === "waiting" && kioskStatus !== "waiting") {
    goWaiting();
    kioskStatus = "waiting";
  }
}

function goLive(videoId) {
  const embedUrl =
    `https://www.youtube.com/embed/${videoId}` +
    `?autoplay=1&controls=1&rel=0&modestbranding=1`;

  const iframe   = document.getElementById("live-iframe");
  const liveView = document.getElementById("live-view");
  const waitView = document.getElementById("waiting-view");

  if (iframe) iframe.src = embedUrl;

  stopSlides();
  waitView.classList.add("hidden");
  liveView.classList.remove("hidden");
}

function goWaiting() {
  const iframe     = document.getElementById("live-iframe");
  const liveView   = document.getElementById("live-view");
  const waitView   = document.getElementById("waiting-view");
  const setupView  = document.getElementById("setup-view");

  if (iframe) iframe.src = "";   // stop the video

  liveView.classList.add("hidden");
  setupView.classList.add("hidden");
  waitView.classList.remove("hidden");
  resumeSlides();
}

function goSetup(_info) {
  const liveView  = document.getElementById("live-view");
  const waitView  = document.getElementById("waiting-view");
  const setupView = document.getElementById("setup-view");

  stopSlides();
  liveView.classList.add("hidden");
  waitView.classList.add("hidden");
  setupView.classList.remove("hidden");

  wizardGotoStep(1);
  wizardScanNetworks();
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

const _wz = { selectedSSID: "", selectedSecurity: "", listenersReady: false };

function initWizard() {
  if (_wz.listenersReady) return;
  _wz.listenersReady = true;

  document.getElementById("wizard-scan-btn")
    ?.addEventListener("click", wizardScanNetworks);

  document.getElementById("wizard-change-net")
    ?.addEventListener("click", wizardBackToList);

  document.getElementById("wizard-show-pass-btn")
    ?.addEventListener("click", () => {
      const inp = document.getElementById("wizard-wifi-pass");
      const btn = document.getElementById("wizard-show-pass-btn");
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      if (btn) btn.textContent = inp.type === "password" ? "Show" : "Hide";
    });

  document.getElementById("wizard-connect-btn")
    ?.addEventListener("click", wizardConnect);

  document.getElementById("wizard-wifi-pass")
    ?.addEventListener("keydown", e => { if (e.key === "Enter") wizardConnect(); });

  document.getElementById("wizard-settings-save")
    ?.addEventListener("click", wizardSaveConfig);
}

function wizardGotoStep(step) {
  [1, 2, 3].forEach(n => {
    const ind   = document.getElementById(`wstep-ind-${n}`);
    const panel = document.getElementById(`wstep-${n}`);
    if (ind) {
      ind.classList.toggle("active", n === step);
      ind.classList.toggle("done",   n < step);
    }
    if (panel) panel.classList.toggle("hidden", n !== step);
  });
}

async function wizardScanNetworks() {
  const listEl = document.getElementById("wizard-net-list");
  if (!listEl) return;

  wizardBackToList();
  listEl.innerHTML = '<p class="wizard-scanning">Scanning for networks&#x2026;</p>';

  const networks = await fetchJSON("/setup/wifi/scan", []);

  if (networks.length === 0) {
    listEl.innerHTML = '<p class="wizard-scanning">No networks found. Check that WiFi is enabled and try scanning again.</p>';
    return;
  }

  listEl.innerHTML = networks.map(n => {
    const bars = wizardSignalBars(n.signal);
    const lock = n.security !== "Open" ? '<span class="wizard-net-lock">&#x1F512;</span>' : "";
    const badge = n.in_use ? '<span class="wizard-net-badge">Connected</span>' : "";
    return `<button class="wizard-net-item${n.in_use ? " in-use" : ""}"
                     data-ssid="${_escAttr(n.ssid)}"
                     data-security="${_escAttr(n.security)}"
                     type="button">
              <span class="wizard-net-signal">${bars}</span>
              <span class="wizard-net-ssid">${_escHtml(n.ssid)}</span>
              ${lock}${badge}
            </button>`;
  }).join("");

  listEl.querySelectorAll(".wizard-net-item").forEach(el => {
    el.addEventListener("click", () =>
      wizardPickNetwork(el.dataset.ssid, el.dataset.security)
    );
  });
}

function wizardSignalBars(signal) {
  const levels = ["▂", "▄", "▆", "█"];
  const lit = signal >= 75 ? 4 : signal >= 50 ? 3 : signal >= 25 ? 2 : 1;
  return levels.map((c, i) =>
    `<span style="opacity:${i < lit ? 0.9 : 0.2}">${c}</span>`
  ).join("");
}

function wizardPickNetwork(ssid, security) {
  _wz.selectedSSID     = ssid;
  _wz.selectedSecurity = security;

  const listEl   = document.getElementById("wizard-net-list");
  const formEl   = document.getElementById("wizard-pass-form");
  const ssidEl   = document.getElementById("wizard-selected-ssid");
  const passInp  = document.getElementById("wizard-wifi-pass");
  const errEl    = document.getElementById("wizard-wifi-error");
  const scanRow  = document.getElementById("wizard-scan-row");

  if (listEl)  listEl.classList.add("hidden");
  if (formEl)  formEl.classList.remove("hidden");
  if (ssidEl)  ssidEl.textContent = ssid;
  if (scanRow) scanRow.classList.add("hidden");
  if (errEl)   errEl.classList.add("hidden");

  if (passInp) {
    passInp.value       = "";
    passInp.type        = "password";
    passInp.placeholder = security === "Open" ? "(open network — no password needed)" : "Enter password";
    passInp.focus();
  }

  const showBtn = document.getElementById("wizard-show-pass-btn");
  if (showBtn) showBtn.textContent = "Show";
}

function wizardBackToList() {
  document.getElementById("wizard-pass-form") ?.classList.add("hidden");
  document.getElementById("wizard-net-list")  ?.classList.remove("hidden");
  document.getElementById("wizard-scan-row")  ?.classList.remove("hidden");
}

async function wizardConnect() {
  const passInp   = document.getElementById("wizard-wifi-pass");
  const connectBtn = document.getElementById("wizard-connect-btn");
  const errEl      = document.getElementById("wizard-wifi-error");

  if (errEl) errEl.classList.add("hidden");
  if (connectBtn) { connectBtn.disabled = true; connectBtn.textContent = "Connecting…"; }

  try {
    const res  = await fetch("/setup/wifi/connect", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ssid: _wz.selectedSSID, password: passInp?.value ?? "" }),
    });
    const data = await res.json();

    if (data.ok) {
      wizardGotoStep(2);
      document.getElementById("wizard-church-name")?.focus();
    } else {
      if (errEl) {
        errEl.textContent = data.message || "Connection failed — check the password and try again.";
        errEl.classList.remove("hidden");
      }
    }
  } catch {
    if (errEl) {
      errEl.textContent = "Could not reach the server. Try again.";
      errEl.classList.remove("hidden");
    }
  } finally {
    if (connectBtn) { connectBtn.disabled = false; connectBtn.textContent = "Connect"; }
  }
}

async function wizardSaveConfig() {
  const churchName = document.getElementById("wizard-church-name")?.value.trim() ?? "";
  const ytUrl      = document.getElementById("wizard-yt-url")?.value.trim()      ?? "";
  const pin        = document.getElementById("wizard-pin")?.value.trim()          ?? "";
  const saveBtn    = document.getElementById("wizard-settings-save");
  const errEl      = document.getElementById("wizard-config-error");

  if (errEl) errEl.classList.add("hidden");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Saving…"; }

  try {
    const res  = await fetch("/setup/config", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ church_name: churchName, live_url: ytUrl, admin_pin: pin }),
    });
    const data = await res.json();

    if (data.ok) {
      wizardGotoStep(3);
      const adminEl = document.getElementById("wizard-admin-url");
      if (adminEl) adminEl.textContent = `${window.location.hostname}:8081`;
      // Transition to kiosk after letting the installer read the done screen
      setTimeout(() => { goWaiting(); kioskStatus = "waiting"; }, 4000);
    } else {
      if (errEl) {
        errEl.textContent = data.message || "Could not save settings. Try again.";
        errEl.classList.remove("hidden");
      }
    }
  } catch {
    if (errEl) {
      errEl.textContent = "Could not reach the server. Try again.";
      errEl.classList.remove("hidden");
    }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "Finish Setup →"; }
  }
}

function _escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function _escAttr(s) {
  return s.replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

// ── Utility ───────────────────────────────────────────────────────────────────

async function fetchJSON(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
