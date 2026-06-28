"use strict";

// ── Auth ──────────────────────────────────────────────────────────────────────

let authHeader = sessionStorage.getItem("ls_auth") || "";

function makeAuthHeader(pin) {
  return "Basic " + btoa("admin:" + pin);
}

async function tryLogin(pin) {
  const h = makeAuthHeader(pin);
  const res = await fetch("/admin/api/status", { headers: { Authorization: h } });
  if (res.ok) {
    authHeader = h;
    sessionStorage.setItem("ls_auth", h);
    return true;
  }
  return false;
}

function logout() {
  authHeader = "";
  sessionStorage.removeItem("ls_auth");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
}

// ── API helper ────────────────────────────────────────────────────────────────

async function api(method, path, body, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opts = {
      method,
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      signal: ctrl.signal,
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(path, opts);
    clearTimeout(timer);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
  document.querySelectorAll(".nav-btn, .mnav-btn").forEach(b => b.classList.remove("active"));

  document.getElementById("page-" + name).classList.remove("hidden");
  document.querySelectorAll(`[data-page="${name}"]`).forEach(b => b.classList.add("active"));

  if (name === "status")   loadStatus();
  if (name === "settings") loadSettings();
  if (name === "slides")   loadSlides();
  if (name === "wifi")     loadWifiStatus();
  if (name === "system")   loadSystemInfo();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

let toastTimer = null;

function toast(msg, type = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast" + (type ? " " + type : "");
  el.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ── Status ────────────────────────────────────────────────────────────────────

async function loadStatus() {
  try {
    const data = await api("GET", "/admin/api/status");

    const kioskDot   = document.getElementById("kiosk-dot");
    const kioskLabel = document.getElementById("kiosk-label");
    if (data.kiosk.status === "live") {
      kioskDot.className = "status-dot green";
      kioskLabel.textContent = "Live — streaming now";
    } else {
      kioskDot.className = "status-dot yellow";
      kioskLabel.textContent = "Waiting (not live)";
    }

    const svcDot   = document.getElementById("service-dot");
    const svcLabel = document.getElementById("service-label");
    if (data.service === "active") {
      svcDot.className = "status-dot green";
      svcLabel.textContent = "Running";
    } else {
      svcDot.className = "status-dot red";
      svcLabel.textContent = data.service || "Unknown";
    }

    document.getElementById("network-info").innerHTML =
      `<div>IP: <strong>${data.ip || "unknown"}</strong></div>`;

    const ip = data.ip || location.hostname;

  } catch (err) {
    toast("Could not load status: " + err.message, "error");
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────

let _fullConfig = {};

async function loadSettings() {
  try {
    _fullConfig = await api("GET", "/admin/api/config");
    const f  = document.getElementById("settings-form");
    const ch = _fullConfig.channel || {};
    const di = _fullConfig.display || {};
    const ad = _fullConfig.admin   || {};

    f.live_url.value        = ch.live_url || "";
    f.check_interval.value  = ch.check_interval_seconds || 60;
    f.church_name.value     = di.church_name || "";
    f.show_clock.checked    = di.show_clock !== false;
    f.slide_duration.value  = di.slide_duration_seconds || 8;
    f.admin_pin.value       = ad.pin || "";

    setColorField(f, "background_color", di.background_color || "#0d1117");
    setColorField(f, "accent_color",     di.accent_color     || "#4a90d9");
    setColorField(f, "text_color",       di.text_color       || "#ffffff");
  } catch (err) {
    toast("Could not load settings: " + err.message, "error");
  }
}

function setColorField(form, name, value) {
  form[name].value     = value;
  form[name + "_hex"].value = value;
}

function getColorValue(form, name) {
  const hex = form[name + "_hex"].value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : form[name].value;
}

async function saveSettings(e) {
  e.preventDefault();
  const f  = document.getElementById("settings-form");
  const btn = f.querySelector("[type=submit]");
  btn.disabled = true;
  btn.textContent = "Saving…";

  const updated = {
    ..._fullConfig,
    channel: {
      ...(_fullConfig.channel || {}),
      live_url:                f.live_url.value.trim(),
      check_interval_seconds:  parseInt(f.check_interval.value) || 60,
    },
    display: {
      ...(_fullConfig.display || {}),
      church_name:             f.church_name.value.trim(),
      show_clock:              f.show_clock.checked,
      slide_duration_seconds:  parseInt(f.slide_duration.value) || 8,
      background_color:        getColorValue(f, "background_color"),
      accent_color:            getColorValue(f, "accent_color"),
      text_color:              getColorValue(f, "text_color"),
    },
    admin: {
      ...(_fullConfig.admin || {}),
      pin: f.admin_pin.value || "changeme",
    },
  };

  try {
    await api("POST", "/admin/api/config", updated);
    _fullConfig = updated;
    toast("Settings saved. Restart the service to apply.", "success");
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Settings";
  }
}

// Sync hex text ↔ color picker
function wireColorSync(form, name) {
  form[name].addEventListener("input", () => {
    form[name + "_hex"].value = form[name].value;
  });
  form[name + "_hex"].addEventListener("input", () => {
    const v = form[name + "_hex"].value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) form[name].value = v;
  });
}

// ── Slides ────────────────────────────────────────────────────────────────────

let _slides      = [];
let _editIdx     = null; // null = new slide, number = editing existing

async function loadSlides() {
  try {
    _slides = await api("GET", "/admin/api/slides");
    renderSlides();
  } catch (err) {
    toast("Could not load slides: " + err.message, "error");
  }
}

function renderSlides() {
  const container = document.getElementById("slides-list");
  if (_slides.length === 0) {
    container.innerHTML = '<p class="muted">No slides yet. Click "+ Add Slide" to create one.</p>';
    return;
  }
  container.innerHTML = _slides.map((slide, i) => `
    <div class="slide-item">
      <span class="slide-num">#${i + 1}</span>
      <div class="slide-preview">
        <div class="slide-preview-title">${slide.fullscreen ? "⛶ Full Screen Image" : esc(slide.title || "(no title)")}</div>
        ${slide.body  ? `<div class="slide-preview-body">${esc(firstLine(slide.body))}</div>` : ""}
        ${slide.image ? `<div class="slide-has-img">📷 ${esc(slide.image)}</div>` : ""}
      </div>
      <div class="slide-actions">
        <button class="icon-btn" title="Move up"   onclick="moveSlide(${i},-1)">↑</button>
        <button class="icon-btn" title="Move down" onclick="moveSlide(${i}, 1)">↓</button>
        <button class="icon-btn" title="Edit"      onclick="openSlideModal(${i})">✏</button>
        <button class="icon-btn del" title="Delete" onclick="deleteSlide(${i})">✕</button>
      </div>
    </div>
  `).join("");
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstLine(str) {
  return (str || "").split("\n")[0].trim();
}

function openSlideModal(idx) {
  _editIdx = idx === undefined ? null : idx;
  const slide = idx === undefined ? {} : (_slides[idx] || {});

  document.getElementById("modal-title").textContent = idx === undefined ? "New Slide" : "Edit Slide";
  document.getElementById("slide-title-input").value = slide.title || "";
  document.getElementById("slide-body-input").value  = slide.body  || "";
  document.getElementById("slide-image-input").value = slide.image || "";

  const fsCheck = document.getElementById("slide-fullscreen-input");
  fsCheck.checked = slide.fullscreen === true;
  document.getElementById("slide-text-fields").style.display = fsCheck.checked ? "none" : "";

  const preview = document.getElementById("slide-image-preview");
  const img     = document.getElementById("preview-img");
  if (slide.image) {
    img.src = "/" + slide.image.replace(/^\/+/, "");
    preview.classList.remove("hidden");
  } else {
    img.src = "";
    preview.classList.add("hidden");
  }

  document.getElementById("slide-modal").classList.remove("hidden");
  if (!fsCheck.checked) document.getElementById("slide-title-input").focus();
}

function closeSlideModal() {
  document.getElementById("slide-modal").classList.add("hidden");
  document.getElementById("slide-image-file").value = "";
}

async function saveSlideModal() {
  const fullscreen = document.getElementById("slide-fullscreen-input").checked;
  const slide = {
    title:      fullscreen ? undefined : (document.getElementById("slide-title-input").value.trim() || undefined),
    body:       fullscreen ? undefined : (document.getElementById("slide-body-input").value.trimEnd() || undefined),
    image:      document.getElementById("slide-image-input").value.trim() || undefined,
    fullscreen: fullscreen || undefined,
  };
  if (!fullscreen && !slide.title) { toast("Title is required for non-fullscreen slides", "error"); return; }
  if (!slide.title)     delete slide.title;
  if (!slide.body)      delete slide.body;
  if (!slide.image)     delete slide.image;
  if (!slide.fullscreen) delete slide.fullscreen;

  if (_editIdx === null) {
    _slides.push(slide);
  } else {
    _slides[_editIdx] = slide;
  }

  await persistSlides();
  closeSlideModal();
}

function moveSlide(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= _slides.length) return;
  [_slides[idx], _slides[target]] = [_slides[target], _slides[idx]];
  renderSlides();
  persistSlides();
}

async function deleteSlide(idx) {
  if (!confirm(`Delete slide "${_slides[idx]?.title}"?`)) return;
  _slides.splice(idx, 1);
  renderSlides();
  await persistSlides();
}

async function persistSlides() {
  try {
    await api("POST", "/admin/api/slides", _slides);
    renderSlides();
    toast("Slides saved.", "success");
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  }
}

async function handleImageUpload(file) {
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    toast("Image must be under 5 MB", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = async (e) => {
    const b64 = e.target.result; // data:image/jpeg;base64,...
    try {
      const result = await api("POST", "/admin/api/assets/upload", {
        filename: file.name,
        data: b64,
      });
      if (result.ok) {
        document.getElementById("slide-image-input").value = result.path;
        const img = document.getElementById("preview-img");
        img.src = "/" + result.path;
        document.getElementById("slide-image-preview").classList.remove("hidden");
        toast("Image uploaded.", "success");
      } else {
        toast("Upload failed: " + (result.error || "unknown"), "error");
      }
    } catch (err) {
      toast("Upload failed: " + err.message, "error");
    }
  };
  reader.readAsDataURL(file);
}

// ── WiFi ──────────────────────────────────────────────────────────────────────

async function loadWifiStatus() {
  try {
    const data = await api("GET", "/admin/api/wifi/status");
    const el   = document.getElementById("wifi-current");
    if (data.connected && data.connections.length > 0) {
      const c = data.connections[0];
      el.innerHTML = `
        <div class="status-row">
          <span class="status-dot green"></span>
          <span><strong>${esc(c.name)}</strong> on ${esc(c.device)}</span>
        </div>
        <div style="margin-top:0.4rem; color:var(--muted); font-size:0.9em">IP: ${esc(data.ip)}</div>
      `;
    } else {
      el.innerHTML = '<div class="status-row"><span class="status-dot red"></span> Not connected</div>';
    }
  } catch (err) {
    document.getElementById("wifi-current").textContent = "Could not load WiFi status.";
  }
}

async function scanWifi() {
  const btn  = document.getElementById("wifi-scan-btn");
  const list = document.getElementById("wifi-list");
  btn.disabled = true;
  btn.textContent = "Scanning…";
  list.innerHTML = '<p class="muted">Scanning, please wait…</p>';

  try {
    const networks = await api("GET", "/admin/api/wifi/scan", undefined, 30000);
    if (!networks.length) {
      list.innerHTML = '<p class="muted">No networks found.</p>';
    } else {
      list.innerHTML = networks.map(n => `
        <div class="wifi-network${n.in_use ? " in-use" : ""}" onclick="selectNetwork('${esc(n.ssid)}')">
          <span class="wifi-ssid">${esc(n.ssid)}</span>
          <span class="wifi-bars">${signalBars(n.signal)}</span>
          <span class="wifi-meta">${esc(n.security)}${n.in_use ? " · Connected" : ""}</span>
        </div>
      `).join("");
    }
  } catch (err) {
    list.innerHTML = `<p class="error-msg">Scan failed: ${esc(err.message)}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Scan for Networks";
  }
}

function signalBars(signal) {
  if (signal >= 75) return "▂▄▆█";
  if (signal >= 50) return "▂▄▆_";
  if (signal >= 25) return "▂▄__";
  return "▂___";
}

function selectNetwork(ssid) {
  document.getElementById("wifi-ssid").value = ssid;
  document.getElementById("wifi-password").focus();
}

async function connectWifi() {
  const ssid = document.getElementById("wifi-ssid").value.trim();
  const pass = document.getElementById("wifi-password").value;
  const msg  = document.getElementById("wifi-connect-msg");
  const btn  = document.getElementById("wifi-connect-btn");

  if (!ssid) { toast("Enter a network name", "error"); return; }

  btn.disabled = true;
  btn.textContent = "Connecting…";
  msg.className = "msg hidden";

  try {
    const result = await api("POST", "/admin/api/wifi/connect", { ssid, password: pass }, 40000);
    msg.textContent  = result.message || (result.ok ? "Connected!" : "Failed");
    msg.className    = "msg " + (result.ok ? "success" : "error");
    msg.classList.remove("hidden");
    if (result.ok) {
      await loadWifiStatus();
      document.getElementById("wifi-password").value = "";
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className   = "msg error";
    msg.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Connect";
  }
}

// ── System ────────────────────────────────────────────────────────────────────

async function loadSystemInfo() {
  try {
    const data = await api("GET", "/admin/api/status");
    const ip   = data.ip || location.hostname;
    document.getElementById("admin-url").textContent = `http://${ip}:8081/admin`;
    // kiosk display is localhost-only; no URL to show
  } catch (_) {}
}

async function restartService() {
  if (!confirm("Restart the backend service? The kiosk display stays running but may briefly show stale state.")) return;
  const btn = document.getElementById("restart-btn");
  btn.disabled = true;
  btn.textContent = "Restarting…";

  try {
    await api("POST", "/admin/api/system/restart");
  } catch (_) {
    // The server kills the connection when it restarts — a fetch error here
    // is normal and expected. Fall through to polling below.
  }

  // Poll until the backend is back up (up to 30 s)
  btn.textContent = "Waiting for restart…";
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const res = await fetch("/admin/api/status");
      if (res.ok) {
        toast("Service restarted successfully.", "success");
        await loadStatus();
        btn.disabled = false;
        btn.textContent = "Restart Service";
        return;
      }
    } catch (_) { /* still coming back up */ }
  }

  toast("Restart timed out — check the Pi manually.", "error");
  btn.disabled = false;
  btn.textContent = "Restart Service";
}

async function rebootSystem() {
  if (!confirm("Reboot the Raspberry Pi? It will be offline for about 60 seconds.")) return;
  try {
    await api("POST", "/admin/api/system/reboot");
    toast("Rebooting… reconnect in about 60 s.", "success");
  } catch (_) {}
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  // Wire navigation
  document.querySelectorAll(".nav-btn, .mnav-btn").forEach(btn => {
    btn.addEventListener("click", () => showPage(btn.dataset.page));
  });

  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("refresh-status-btn").addEventListener("click", loadStatus);

  // Login form
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = document.getElementById("pin-input").value;
    const ok  = await tryLogin(pin);
    if (ok) {
      document.getElementById("login-screen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      showPage("status");
    } else {
      document.getElementById("login-error").classList.remove("hidden");
    }
  });

  // Settings form
  document.getElementById("settings-form").addEventListener("submit", saveSettings);
  const sf = document.getElementById("settings-form");
  ["background_color", "accent_color", "text_color"].forEach(n => wireColorSync(sf, n));

  // Slides
  document.getElementById("add-slide-btn").addEventListener("click", () => openSlideModal());
  document.getElementById("modal-cancel-btn").addEventListener("click", closeSlideModal);
  document.getElementById("modal-save-btn").addEventListener("click", saveSlideModal);
  document.querySelector(".modal-backdrop").addEventListener("click", closeSlideModal);
  document.getElementById("slide-fullscreen-input").addEventListener("change", (e) => {
    document.getElementById("slide-text-fields").style.display = e.target.checked ? "none" : "";
  });

  document.getElementById("slide-image-file").addEventListener("change", (e) => {
    handleImageUpload(e.target.files[0]);
  });

  document.getElementById("remove-image-btn").addEventListener("click", () => {
    document.getElementById("slide-image-input").value = "";
    document.getElementById("preview-img").src = "";
    document.getElementById("slide-image-preview").classList.add("hidden");
  });

  document.getElementById("slide-image-input").addEventListener("input", (e) => {
    const val = e.target.value.trim();
    const img = document.getElementById("preview-img");
    const preview = document.getElementById("slide-image-preview");
    if (val) {
      img.src = "/" + val.replace(/^\/+/, "");
      preview.classList.remove("hidden");
    } else {
      img.src = "";
      preview.classList.add("hidden");
    }
  });

  // WiFi
  document.getElementById("wifi-scan-btn").addEventListener("click", scanWifi);
  document.getElementById("wifi-connect-btn").addEventListener("click", connectWifi);

  // System
  document.getElementById("restart-btn").addEventListener("click", restartService);
  document.getElementById("reboot-btn").addEventListener("click", rebootSystem);

  // Auto-login if session exists
  if (authHeader) {
    const ok = await tryLogin("").catch(() => false);
    // tryLogin with empty pin won't work; check stored header directly
    try {
      const res = await fetch("/admin/api/status", { headers: { Authorization: authHeader } });
      if (res.ok) {
        document.getElementById("login-screen").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        showPage("status");
        return;
      }
    } catch (_) {}
    authHeader = "";
    sessionStorage.removeItem("ls_auth");
  }
}

document.addEventListener("DOMContentLoaded", init);
