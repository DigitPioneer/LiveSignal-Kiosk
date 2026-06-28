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
  const card    = document.getElementById("slide-card");
  const titleEl = document.getElementById("slide-title");
  const bodyEl  = document.getElementById("slide-body");

  if (!card) return;

  // Fade out → swap content → fade in
  card.classList.add("fade-out");

  setTimeout(() => {
    const slide   = slides[idx] || {};
    const imageEl = document.getElementById("slide-image");

    if (titleEl) titleEl.textContent = slide.title || "";
    if (bodyEl)  bodyEl.textContent  = (slide.body || "").trimEnd();

    if (imageEl) {
      if (slide.image) {
        imageEl.src          = "/" + slide.image.replace(/^\/+/, "");
        imageEl.alt          = slide.title || "";
        imageEl.style.display = "block";
      } else {
        imageEl.style.display = "none";
        imageEl.src           = "";
      }
    }

    // Update dots
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
  currentSlide = 0;
  showSlide(0);
  slideTimer = setInterval(() => {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
  }, slideDuration);
}

// ── State polling ─────────────────────────────────────────────────────────────

async function pollState() {
  const state = await fetchJSON("/api/state", { status: "waiting" });

  if (state.status === "live" && kioskStatus !== "live") {
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
  const iframe   = document.getElementById("live-iframe");
  const liveView = document.getElementById("live-view");
  const waitView = document.getElementById("waiting-view");

  if (iframe) iframe.src = "";   // stop the video

  liveView.classList.add("hidden");
  waitView.classList.remove("hidden");
  resumeSlides();
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
