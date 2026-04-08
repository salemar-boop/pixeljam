(function () {
  "use strict";

  var STORAGE_KEY = "memoryJam_v1";
  var prompts = window.MEMORY_JAM_PROMPTS || [];

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var data = JSON.parse(raw);
      if (!data.jars || !Array.isArray(data.jars)) return defaultState();
      return data;
    } catch (e) {
      return defaultState();
    }
  }

  function defaultState() {
    return {
      jars: [],
      activeJarId: null,
      lastPromptDay: null,
    };
  }

  function saveState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast("Could not save — storage may be full.");
    }
  }

  function uid() {
    return "j_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
  }

  function photoId() {
    return "p_" + Math.random().toString(36).slice(2, 10);
  }

  /** Day-of-year 1–366 for local calendar */
  function dayOfYear(d) {
    var start = new Date(d.getFullYear(), 0, 0);
    var diff = d - start;
    return Math.floor(diff / 86400000);
  }

  function todayPrompt() {
    var d = new Date();
    var idx = (dayOfYear(d) - 1) % Math.max(prompts.length, 1);
    return prompts[idx] || "Take a photo of something that feels like today.";
  }

  function formatToday() {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  function formatMemoryDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function totalPhotoCount(state) {
    return state.jars.reduce(function (n, j) {
      return n + (j.photos ? j.photos.length : 0);
    }, 0);
  }

  function setFooter(html, show) {
    if (!appFooter) return;
    if (show) {
      appFooter.hidden = false;
      appFooter.innerHTML = html;
    } else {
      appFooter.hidden = true;
      appFooter.textContent = "";
    }
  }

  function closeMemoryModal() {
    modalMemory.hidden = true;
    modalMemoryImg.src = "";
    if (modalMemoryDate) {
      modalMemoryDate.textContent = "";
      modalMemoryDate.hidden = true;
    }
  }

  var mainEl = document.getElementById("main");
  var modalMemory = document.getElementById("modal-memory");
  var modalMemoryImg = document.getElementById("modal-memory-img");
  var modalMemoryCaption = document.getElementById("modal-memory-caption");
  var modalMemoryDate = document.getElementById("modal-memory-date");
  var modalMemoryClose = document.getElementById("modal-memory-close");
  var appFooter = document.getElementById("app-footer");
  var modalNewJar = document.getElementById("modal-new-jar");
  var newJarName = document.getElementById("new-jar-name");
  var newJarCancel = document.getElementById("new-jar-cancel");
  var newJarSave = document.getElementById("new-jar-save");
  var cameraInput = document.getElementById("camera-input");

  var pendingCapture = null; // { jarId } or null for daily default jar

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 2600);
  }

  function getOrCreateDefaultJar(state) {
    var def = state.jars.find(function (j) {
      return j.name === "Daily memories";
    });
    if (def) return def;
    def = {
      id: uid(),
      name: "Daily memories",
      createdAt: Date.now(),
      photos: [],
    };
    state.jars.unshift(def);
    if (!state.activeJarId) state.activeJarId = def.id;
    return def;
  }

  function placeholderPhotoData(label, c1, c2) {
    var safe = (label || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    var svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='480' height='480' viewBox='0 0 480 480'>" +
      "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
      "<stop offset='0%' stop-color='" + c1 + "'/><stop offset='100%' stop-color='" + c2 + "'/></linearGradient></defs>" +
      "<rect width='480' height='480' fill='url(%23g)'/>" +
      "<rect x='46' y='46' width='388' height='388' rx='26' fill='none' stroke='rgba(255,255,255,0.35)' stroke-width='8'/>" +
      "<text x='240' y='250' font-size='34' fill='white' text-anchor='middle' font-family='monospace'>" + safe + "</text>" +
      "</svg>";
    return "data:image/svg+xml;utf8," + svg;
  }

  function ensureDemoSharedJars(state) {
    var demos = [
      {
        id: "shared_nova",
        name: "Midnight Walks",
        ownerName: "Nova",
        ownerHandle: "@nova.pix",
        ownerAvatar: "🌙",
        photos: [
          { caption: "Neon corner", dataUrl: placeholderPhotoData("Neon Corner", "#1d4ed8", "#7c3aed") },
          { caption: "Rain on glass", dataUrl: placeholderPhotoData("Rain Glass", "#0369a1", "#0f172a") },
        ],
      },
      {
        id: "shared_milo",
        name: "Late Snacks Club",
        ownerName: "Milo",
        ownerHandle: "@milo.night",
        ownerAvatar: "🍜",
        photos: [
          { caption: "Corner ramen", dataUrl: placeholderPhotoData("Ramen", "#7c2d12", "#ea580c") },
          { caption: "Window booth", dataUrl: placeholderPhotoData("Booth", "#1f2937", "#0ea5e9") },
        ],
      },
      {
        id: "shared_lumi",
        name: "City Glow",
        ownerName: "Lumi",
        ownerHandle: "@lumi.stars",
        ownerAvatar: "✨",
        photos: [
          { caption: "Bridge lights", dataUrl: placeholderPhotoData("Bridge", "#0f172a", "#22d3ee") },
          { caption: "Purple skyline", dataUrl: placeholderPhotoData("Skyline", "#312e81", "#a78bfa") },
        ],
      },
    ];

    demos.forEach(function (d) {
      var existing = findJar(state, d.id);
      if (existing) return;
      state.jars.push({
        id: d.id,
        name: d.name,
        createdAt: Date.now(),
        isShared: true,
        ownerName: d.ownerName,
        ownerHandle: d.ownerHandle,
        ownerAvatar: d.ownerAvatar,
        photos: d.photos.map(function (p) {
          return {
            id: photoId(),
            dataUrl: p.dataUrl,
            caption: p.caption,
            createdAt: Date.now(),
          };
        }),
      });
    });
  }

  function findJar(state, id) {
    return state.jars.find(function (j) {
      return j.id === id;
    });
  }

  function jarPageUrl(id) {
    return "jar.html?id=" + encodeURIComponent(id);
  }

  function jarSvg() {
    /* Rounded-square jar — neon nightlife jam + cool metal lid */
    return (
      '<svg class="jar-svg" viewBox="0 0 100 118" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      "<defs>" +
      '<linearGradient id="mj-jam" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" stop-color="#22d3ee"/>' +
      '<stop offset="40%" stop-color="#a78bfa"/>' +
      '<stop offset="100%" stop-color="#7c3aed"/>' +
      "</linearGradient>" +
      '<linearGradient id="mj-lid" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" stop-color="#64748b"/>' +
      '<stop offset="50%" stop-color="#94a3b8"/>' +
      '<stop offset="100%" stop-color="#475569"/>' +
      "</linearGradient>" +
      '<linearGradient id="mj-shine" x1="0%" y1="0%" x2="100%" y2="20%">' +
      '<stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="40%" stop-color="#e0f2fe" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>' +
      "</linearGradient>" +
      "</defs>" +
      '<rect x="22" y="10" width="56" height="18" rx="5" ry="5" fill="url(#mj-lid)" stroke="#1e3a5f" stroke-width="2"/>' +
      '<rect x="28" y="13" width="22" height="4" rx="2" fill="#ffffff" opacity="0.15"/>' +
      '<rect x="26" y="28" width="48" height="10" rx="3" ry="3" fill="#334155" stroke="#1e3a5f" stroke-width="2"/>' +
      '<rect x="14" y="38" width="72" height="70" rx="18" ry="18" fill="url(#mj-jam)" stroke="#1e3a5f" stroke-width="2"/>' +
      '<rect x="22" y="42" width="56" height="7" rx="3" fill="#f472b6" opacity="0.35"/>' +
      '<rect x="14" y="38" width="72" height="70" rx="18" ry="18" fill="url(#mj-shine)"/>' +
      '<g fill="#fef3c7" opacity="0.85">' +
      '<rect x="68" y="54" width="2" height="2"/>' +
      '<rect x="70" y="52" width="2" height="6"/>' +
      '<rect x="66" y="56" width="10" height="2"/>' +
      "</g>" +
      '<g fill="#a5f3fc" opacity="0.55">' +
      '<rect x="26" y="88" width="2" height="2"/>' +
      '<rect x="28" y="86" width="2" height="6"/>' +
      '<rect x="24" y="90" width="10" height="2"/>' +
      "</g>" +
      "</svg>"
    );
  }

  function renderHome() {
    var state = loadState();
    getOrCreateDefaultJar(state);
    ensureDemoSharedJars(state);
    saveState(state);

    var memories = totalPhotoCount(state);
    var jarCount = state.jars.length;

    setFooter(
      "Memory Jam · starlight & snapshots · shake the jar for a random glow-memory",
      true
    );

    var html = "";
    html += '<div class="home-grid">';
    html += '<div class="home-hero">';
    html += '<h2 class="home-hero-kicker">Welcome home</h2>';
    html += '<div class="home-stats">';
    html += '<span class="home-stat"><strong>' + memories + "</strong> memor" + (memories === 1 ? "y" : "ies") + " saved</span>";
    html += '<span class="home-stat"><strong>' + jarCount + "</strong> " + (jarCount === 1 ? "jar" : "jars") + "</span>";
    html += "</div>";
    html += "</div>";
    html += '<div class="prompt-card">';
    html += '<p class="prompt-date">' + escapeHtml(formatToday()) + "</p>";
    html += '<p class="prompt-box" style="min-height:3.5rem;margin:0">Today\'s prompt<br/><strong>' + escapeHtml(todayPrompt()) + "</strong></p>";
    html += '<div class="btn-row">';
    html +=
      '<button type="button" class="btn primary" id="btn-capture-prompt">Capture for Daily jar</button>';
    html += "</div>";
    html +=
      '<p class="jar-hint">Saves to <em>Daily memories</em>. Open <a href="jars.html">My jars</a> to use a different jar or start a new one.</p>';
    html += "</div>";

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.65rem">Where to next</p>';
    html += '<div class="quick-links">';
    html += '<a class="btn secondary" href="jars.html">My jars — create &amp; open</a>';
    html += '<a class="btn ghost" href="shared.html">Shared jars</a>';
    html += "</div>";
    html += "</div>";
    html += '<div class="jar-preview-wrap" id="home-jar-tease">';
    html += jarSvg();
    html += "</div>";
    html += '<p class="jar-hint">Open any jar, tap <strong>Shake jar</strong>, and a random photo will float up — like catching a firefly memory from a neon jar.</p>';
    html += "</div>";

    mainEl.innerHTML = html;

    document.getElementById("btn-capture-prompt").addEventListener("click", function () {
      var s = loadState();
      var jar = getOrCreateDefaultJar(s);
      saveState(s);
      openCamera(jar.id);
    });
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function renderJars() {
    setFooter("", false);
    var state = loadState();
    getOrCreateDefaultJar(state);
    ensureDemoSharedJars(state);
    saveState(state);

    var html = "";
    html += '<h2 class="screen-title">My jars</h2>';
    html += '<div class="btn-row" style="margin-bottom:1rem">';
    html += '<button type="button" class="btn primary" id="btn-new-jar">New jar</button>';
    html += "</div>";

    var personalJars = state.jars.filter(function (j) {
      return !j.isShared;
    });

    if (personalJars.length === 0) {
      html += '<p class="empty-state">No jars yet. Create one!</p>';
    } else {
      html += '<ul class="jar-list">';
      personalJars.forEach(function (j) {
        html += "<li>";
        html += '<a href="' + jarPageUrl(j.id) + '">';
        html += escapeHtml(j.name);
        html += '<div class="jar-meta">' + j.photos.length + " memor" + (j.photos.length === 1 ? "y" : "ies") + "</div>";
        html += "</a></li>";
      });
      html += "</ul>";
    }

    mainEl.innerHTML = html;

    document.getElementById("btn-new-jar").addEventListener("click", function () {
      newJarName.value = "";
      modalNewJar.hidden = false;
      setTimeout(function () {
        newJarName.focus();
      }, 50);
    });
  }

  function renderJar(jarId) {
    setFooter("", false);
    var state = loadState();
    ensureDemoSharedJars(state);
    var jar = findJar(state, jarId);
    if (!jar) {
      mainEl.innerHTML =
        '<h2 class="screen-title">Jar not found</h2><p class="empty-state"><a href="jars.html">Back to jars</a></p>';
      document.title = "Memory Jam — Jar";
      return;
    }

    state.activeJarId = jar.id;
    saveState(state);
    document.title = jar.name + " — Memory Jam";

    var html = "";
    html += '<h2 class="screen-title">' + escapeHtml(jar.name) + "</h2>";
    if (jar.isShared) {
      html +=
        '<p class="jar-hint" style="margin:0 0 0.5rem">Shared by <strong>' +
        escapeHtml(jar.ownerName || "Friend") +
        "</strong> " +
        escapeHtml(jar.ownerHandle || "") +
        "</p>";
    }
    html += '<div class="jar-preview-wrap" id="jar-shake-zone">';
    html += jarSvg();
    html += "</div>";
    html += '<div class="btn-row" style="justify-content:center">';
    html += '<button type="button" class="btn primary" id="btn-shake">Shake jar</button>';
    html += "</div>";
    html += '<p class="jar-hint">Give it a shake — a random photo from this jar will drift up like fruit in jam.</p>';

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.5rem"><strong>Today\'s prompt:</strong> ' + escapeHtml(todayPrompt()) + "</p>";
    html += '<div class="btn-row">';
    html += '<button type="button" class="btn primary" id="btn-add-jar">Add today\'s photo here</button>';
    html += '<button type="button" class="btn ghost" id="btn-clear-jar">Clear jar</button>';
    html += "</div>";
    html += "</div>";

    if (jar.photos.length > 0) {
      html += '<div class="card"><p class="prompt-box" style="margin:0 0 0.5rem">Inside the jar</p>';
      html += '<div class="thumb-grid">';
      jar.photos.forEach(function (p) {
        html += '<img src="' + escapeHtml(p.dataUrl) + '" alt="" data-photo-id="' + escapeHtml(p.id) + '" />';
      });
      html += "</div></div>";
    } else {
      html += '<p class="empty-state">No photos yet — add one from today\'s prompt.</p>';
    }

    if (!jar.isShared) {
      html += '<div class="card">';
      html += '<p class="prompt-box" style="margin:0 0 0.5rem">Share this jar</p>';
      html += '<p class="jar-hint" style="text-align:left;margin:0 0 0.5rem">Share this memory jar with friends by sending them a link to this page.</p>';
      html += '<div class="btn-row">';
      html += '<button type="button" class="btn ghost" id="btn-copy-share">Copy share text</button>';
      html += "</div>";
      html += "</div>";
    }

    mainEl.innerHTML = html;

    var shakeZone = document.getElementById("jar-shake-zone");

    function doShake() {
      if (!jar.photos.length) {
        toast("Add some memories first!");
        return;
      }
      shakeZone.classList.remove("shaking");
      void shakeZone.offsetWidth;
      shakeZone.classList.add("shaking");
      window.setTimeout(function () {
        if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
        var pick = jar.photos[Math.floor(Math.random() * jar.photos.length)];
        modalMemoryImg.src = pick.dataUrl;
        modalMemoryImg.alt = "Memory";
        var cap = pick.caption || pick.addedLabel || "";
        modalMemoryCaption.textContent = cap || "A quiet moment, saved.";
        if (modalMemoryDate && pick.createdAt) {
          modalMemoryDate.textContent = formatMemoryDate(pick.createdAt);
          modalMemoryDate.hidden = false;
        } else if (modalMemoryDate) {
          modalMemoryDate.hidden = true;
        }
        modalMemory.hidden = false;
      }, 480);
    }

    document.getElementById("btn-shake").addEventListener("click", doShake);

    document.getElementById("btn-add-jar").addEventListener("click", function () {
      openCamera(jar.id);
    });

    document.getElementById("btn-clear-jar").addEventListener("click", function () {
      var ok = window.confirm("Clear all photos from this jar?");
      if (!ok) return;
      var s = loadState();
      var target = findJar(s, jar.id);
      if (!target) return;
      target.photos = [];
      saveState(s);
      toast("Jar cleared.");
      renderJar(jar.id);
    });

    if (!jar.isShared) {
      document.getElementById("btn-copy-share").addEventListener("click", function () {
        var text =
          "Memory Jam — shared jar \"" +
          jar.name +
          "\"\n\nOpen this link:\n" +
          window.location.href +
          "\n\nPreview: " +
          jar.photos.length +
          " photos.\n";
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(
            function () {
              toast("Share blurb copied.");
            },
            function () {
              toast("Could not copy — copy the page URL manually.");
            }
          );
        } else {
          toast("Clipboard not available — copy the page URL manually.");
        }
      });
    }
  }

  function renderShared() {
    setFooter("", false);
    var state = loadState();
    ensureDemoSharedJars(state);
    saveState(state);
    var shared = state.jars.filter(function (j) {
      return !!j.isShared;
    });

    var html = "";
    html += '<h2 class="screen-title">Shared jars</h2>';
    html += '<p class="jar-hint" style="text-align:left;margin:0 0 1rem">Browse memory jars shared by people in the Memory Jam neighborhood.</p>';
    html += '<div class="shared-grid">';
    shared.forEach(function (j) {
      html += '<article class="card shared-card">';
      html += '<p class="shared-profile"><span class="shared-avatar">' + escapeHtml(j.ownerAvatar || "👤") + "</span>";
      html += '<strong>' + escapeHtml(j.ownerName || "Friend") + "</strong> ";
      html += '<span>' + escapeHtml(j.ownerHandle || "@friend") + "</span></p>";
      html += '<p class="prompt-box" style="min-height:0;margin:0 0 0.5rem">' + escapeHtml(j.name) + "</p>";
      html += '<p class="jar-meta">' + j.photos.length + " shared memories</p>";
      html += '<div class="btn-row"><a class="btn secondary" href="' + jarPageUrl(j.id) + '">Open shared jar</a></div>';
      html += "</article>";
    });
    html += "</div>";
    mainEl.innerHTML = html;
  }

  function openCamera(jarId) {
    pendingCapture = { jarId: jarId };
    cameraInput.value = "";
    cameraInput.click();
  }

  cameraInput.addEventListener("change", function () {
    var f = cameraInput.files && cameraInput.files[0];
    if (!pendingCapture) return;
    if (!f) {
      pendingCapture = null;
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result;
      var state = loadState();
      var jar = findJar(state, pendingCapture.jarId);
      if (!jar) {
        pendingCapture = null;
        return;
      }
      var label = formatToday() + " — " + todayPrompt();
      jar.photos.push({
        id: photoId(),
        dataUrl: dataUrl,
        caption: "",
        addedLabel: label,
        createdAt: Date.now(),
      });
      saveState(state);
      pendingCapture = null;
      toast("Saved to " + jar.name + "!");
      var page = document.body.getAttribute("data-page");
      if (page === "jar") {
        renderJar(jar.id);
      } else {
        window.location.href = jarPageUrl(jar.id);
      }
    };
    reader.readAsDataURL(f);
  });

  modalMemoryClose.addEventListener("click", closeMemoryModal);
  modalMemory.addEventListener("click", function (e) {
    if (e.target === modalMemory) closeMemoryModal();
  });

  function closeNewJarModal() {
    if (modalNewJar) modalNewJar.hidden = true;
  }

  newJarCancel.addEventListener("click", closeNewJarModal);
  newJarSave.addEventListener("click", function () {
    var name = (newJarName.value || "").trim() || "Untitled jar";
    var state = loadState();
    var j = {
      id: uid(),
      name: name,
      createdAt: Date.now(),
      photos: [],
    };
    state.jars.unshift(j);
    saveState(state);
    closeNewJarModal();
    toast("Jar created!");
    window.location.href = jarPageUrl(j.id);
  });

  if (modalNewJar) {
    modalNewJar.addEventListener("click", function (e) {
      if (e.target === modalNewJar) closeNewJarModal();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeNewJarModal();
    closeMemoryModal();
  });

  function initPage() {
    closeNewJarModal();
    var page = document.body.getAttribute("data-page") || "home";
    if (page === "home") {
      renderHome();
      document.title = "Memory Jam — Home";
      return;
    }
    if (page === "jars") {
      renderJars();
      document.title = "Memory Jam — My jars";
      return;
    }
    if (page === "shared") {
      renderShared();
      document.title = "Memory Jam — Shared jars";
      return;
    }
    if (page === "jar") {
      var params = new URLSearchParams(window.location.search);
      var jarId = params.get("id");
      if (!jarId) {
        mainEl.innerHTML =
          '<h2 class="screen-title">No jar selected</h2><p class="empty-state"><a href="jars.html">Open My jars</a></p>';
        document.title = "Memory Jam — Jar";
        return;
      }
      renderJar(jarId);
      return;
    }
    renderHome();
  }

  initPage();
})();
