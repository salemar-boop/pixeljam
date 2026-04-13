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

  function saveState(state, quiet) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!quiet) {
        toast("Could not save — storage may be full.");
      }
      return false;
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
      return j.name === "Daily memories" || j.isDaily;
    });
    if (def) {
      if (!def.isDaily) def.isDaily = true;
      return def;
    }
    def = {
      id: uid(),
      name: "Daily memories",
      isDaily: true,
      createdAt: Date.now(),
      photos: [],
    };
    state.jars.unshift(def);
    if (!state.activeJarId) state.activeJarId = def.id;
    return def;
  }

  /** Real image URL (demo) or captured data URL */
  function photoSrc(p) {
    if (!p) return "";
    return p.remoteUrl || p.dataUrl || "";
  }

  function isDailyJar(jar) {
    return !!(jar && (jar.isDaily || (!jar.isShared && jar.name === "Daily memories")));
  }

  function ownerInitial(name) {
    if (!name || !String(name).length) return "?";
    return String(name).charAt(0).toUpperCase();
  }

  function photoIsSvgPlaceholder(p) {
    var u = p && (p.dataUrl || "");
    return u.indexOf("image/svg+xml") !== -1;
  }

  function upgradeLegacySharedPlaceholders(state) {
    var remoteSets = {
      shared_nova: [
        { caption: "City night", remoteUrl: "https://picsum.photos/seed/mj-nova-a/480/480" },
        { caption: "Neon street", remoteUrl: "https://picsum.photos/seed/mj-nova-b/480/480" },
      ],
      shared_milo: [
        { caption: "Warm meal", remoteUrl: "https://picsum.photos/seed/mj-milo-a/480/480" },
        { caption: "Cafe corner", remoteUrl: "https://picsum.photos/seed/mj-milo-b/480/480" },
      ],
      shared_lumi: [
        { caption: "Skyline glow", remoteUrl: "https://picsum.photos/seed/mj-lumi-a/480/480" },
        { caption: "Evening lights", remoteUrl: "https://picsum.photos/seed/mj-lumi-b/480/480" },
      ],
    };
    state.jars.forEach(function (j) {
      if (!j.isShared || !remoteSets[j.id] || !j.photos || !j.photos.length) return;
      var allSvg = j.photos.every(photoIsSvgPlaceholder);
      if (!allSvg) return;
      j.photos = remoteSets[j.id].map(function (p) {
        return {
          id: photoId(),
          remoteUrl: p.remoteUrl,
          caption: p.caption,
          createdAt: Date.now(),
        };
      });
    });
  }

  function ensureDemoSharedJars(state) {
    var demos = [
      {
        id: "shared_nova",
        name: "Midnight Walks",
        ownerName: "Nova",
        ownerHandle: "@nova.pix",
        photos: [
          { caption: "City night", remoteUrl: "https://picsum.photos/seed/mj-nova-a/480/480" },
          { caption: "Neon street", remoteUrl: "https://picsum.photos/seed/mj-nova-b/480/480" },
        ],
      },
      {
        id: "shared_milo",
        name: "Late Snacks Club",
        ownerName: "Milo",
        ownerHandle: "@milo.night",
        photos: [
          { caption: "Warm meal", remoteUrl: "https://picsum.photos/seed/mj-milo-a/480/480" },
          { caption: "Cafe corner", remoteUrl: "https://picsum.photos/seed/mj-milo-b/480/480" },
        ],
      },
      {
        id: "shared_lumi",
        name: "City Glow",
        ownerName: "Lumi",
        ownerHandle: "@lumi.stars",
        photos: [
          { caption: "Skyline glow", remoteUrl: "https://picsum.photos/seed/mj-lumi-a/480/480" },
          { caption: "Evening lights", remoteUrl: "https://picsum.photos/seed/mj-lumi-b/480/480" },
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
        photos: d.photos.map(function (p) {
          return {
            id: photoId(),
            remoteUrl: p.remoteUrl,
            caption: p.caption,
            createdAt: Date.now(),
          };
        }),
      });
    });
    upgradeLegacySharedPlaceholders(state);
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

    setFooter("", false);

    var html = "";
    html += '<div class="home-grid home-grid--compact">';
    html += '<div class="prompt-card home-prompt-card">';
    html += '<p class="prompt-date">' + escapeHtml(formatToday()) + "</p>";
    html += '<p class="home-prompt-label">Today\'s prompt</p>';
    html += "</div>";
    html += '<div class="prompt-card home-prompt-card">';
    html += '<p class="prompt-box prompt-box--tight">' + escapeHtml(todayPrompt()) + "</p>";
    html += '<div class="btn-row">';
    html +=
      '<button type="button" class="btn primary" id="btn-capture-prompt" data-burst="plus" data-burst-distance="34">Capture for Daily jar</button>';
    html += "</div>";
    html += "</div>";

    html += '<div class="card home-where-card">';
    html += '<p class="prompt-box prompt-box--tight" style="margin:0 0 0.65rem">Where to next</p>';
    html += '<div class="quick-links">';
    html +=
      '<a class="btn secondary" href="jars.html" data-burst="confetti" data-burst-duration="580">My jars — create &amp; open</a>';
    html +=
      '<a class="btn ghost" href="shared.html" data-burst="spark" data-burst-count="9" data-burst-distance="18">Shared jars</a>';
    html += "</div>";
    html += "</div>";
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
    html +=
      '<button type="button" class="btn primary" id="btn-new-jar" data-burst="heart" data-burst-color="#fbcfe8">New jar</button>';
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
        '<p class="jar-hint" style="margin:0 0 0.35rem">Started by <strong>' +
        escapeHtml(jar.ownerName || "Friend") +
        "</strong> " +
        escapeHtml(jar.ownerHandle || "") +
        "</p>";
    }
    html += '<div class="jar-preview-wrap" id="jar-shake-zone">';
    html += jarSvg();
    html += "</div>";
    html += '<div class="btn-row" style="justify-content:center">';
    html +=
      '<button type="button" class="btn primary" id="btn-shake" data-burst="ring" data-burst-duration="560">Shake jar</button>';
    html += "</div>";
    html += '<p class="jar-hint">Give it a shake — a random photo from this jar will drift up like fruit in jam.</p>';

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.5rem"><strong>Today\'s prompt:</strong> ' + escapeHtml(todayPrompt()) + "</p>";
    html += '<div class="btn-row">';
    if (jar.isShared) {
      html +=
        '<button type="button" class="btn primary" id="btn-add-jar" data-burst="plus" data-burst-count="12">Add photos</button>';
    } else {
      if (isDailyJar(jar)) {
        html +=
          '<button type="button" class="btn primary" id="btn-add-jar" data-burst="plus" data-burst-count="12">Add today\'s photos</button>';
      } else {
        html +=
          '<button type="button" class="btn primary" id="btn-add-jar" data-burst="plus" data-burst-count="12">Add photos</button>';
      }
      html +=
        '<button type="button" class="btn ghost" id="btn-clear-jar" data-burst="spark" data-burst-count="8" data-burst-distance="16">Clear jar</button>';
    }
    html += "</div>";
    html += "</div>";

    if (jar.photos.length > 0) {
      html += '<div class="card"><p class="prompt-box" style="margin:0 0 0.5rem">Inside the jar</p>';
      html += '<div class="thumb-grid">';
      jar.photos.forEach(function (p) {
        html +=
          '<img src="' +
          escapeHtml(photoSrc(p)) +
          '" alt="" data-photo-id="' +
          escapeHtml(p.id) +
          '" loading="lazy" />';
      });
      html += "</div></div>";
    } else {
      html += '<p class="empty-state">No photos yet — add photos to start this jar.</p>';
    }

    if (!jar.isShared) {
      html += '<div class="card">';
      html += '<p class="prompt-box" style="margin:0 0 0.5rem">Share this jar</p>';
      html += '<p class="jar-hint" style="text-align:left;margin:0 0 0.5rem">Share this memory jar with friends by sending them a link to this page.</p>';
      html += '<div class="btn-row">';
      html +=
        '<button type="button" class="btn ghost" id="btn-copy-share" data-burst="plus" data-burst-char="*" data-burst-count="10">Copy share text</button>';
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
        modalMemoryImg.src = photoSrc(pick);
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

    if (!jar.isShared) {
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
    }

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
    html += '<div class="shared-grid">';
    shared.forEach(function (j) {
      html += '<article class="card shared-card">';
      html += '<p class="shared-profile">';
      html += '<span class="shared-avatar shared-avatar--letter" aria-hidden="true">' + escapeHtml(ownerInitial(j.ownerName)) + "</span>";
      html += '<span class="shared-profile-text">';
      html += '<strong>' + escapeHtml(j.ownerName || "Friend") + "</strong> ";
      html += '<span class="shared-handle">' + escapeHtml(j.ownerHandle || "@friend") + "</span>";
      html += "</span></p>";
      html += '<p class="shared-jar-title">' + escapeHtml(j.name) + "</p>";
      html += '<p class="jar-meta">' + j.photos.length + " memories</p>";
      html += '<div class="btn-row btn-row--stack">';
      html +=
        '<a class="btn secondary btn-block" href="' +
        jarPageUrl(j.id) +
        '" data-burst="spark" data-burst-count="10" data-burst-distance="20">Open jar</a>';
      html += "</div>";
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

  function readFileAsDataUrl(file, onDone) {
    var reader = new FileReader();
    reader.onload = function () {
      onDone(reader.result || "");
    };
    reader.onerror = function () {
      onDone("");
    };
    reader.readAsDataURL(file);
  }

  function compressDataUrl(dataUrl, maxEdge, quality, onDone) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width || 1;
      var h = img.naturalHeight || img.height || 1;
      var scale = Math.min(1, maxEdge / Math.max(w, h));
      var outW = Math.max(1, Math.round(w * scale));
      var outH = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      var ctx = canvas.getContext("2d");
      if (!ctx) {
        onDone(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, outW, outH);
      try {
        onDone(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        onDone(dataUrl);
      }
    };
    img.onerror = function () {
      onDone(dataUrl);
    };
    img.src = dataUrl;
  }

  function preparePhotoDataUrl(file, onDone) {
    readFileAsDataUrl(file, function (rawDataUrl) {
      if (!rawDataUrl) {
        onDone("");
        return;
      }
      var type = (file.type || "").toLowerCase();
      var shouldCompress =
        file.size > 420 * 1024 || type.indexOf("heic") !== -1 || type.indexOf("heif") !== -1;
      if (!shouldCompress) {
        onDone(rawDataUrl);
        return;
      }
      compressDataUrl(rawDataUrl, 1400, 0.8, function (compressed) {
        if (!compressed) {
          onDone(rawDataUrl);
          return;
        }
        onDone(compressed.length < rawDataUrl.length ? compressed : rawDataUrl);
      });
    });
  }

  function addPhotoWithStorageFallback(jarId, dataUrl, onDone) {
    var attempts = [
      { dataUrl: dataUrl },
      { maxEdge: 1100, quality: 0.68 },
      { maxEdge: 780, quality: 0.56 },
    ];

    function tryAttempt(idx, candidateDataUrl) {
      if (idx >= attempts.length || !candidateDataUrl) {
        onDone(false, null);
        return;
      }
      var state = loadState();
      var jar = findJar(state, jarId);
      if (!jar) {
        onDone(false, null);
        return;
      }
      var label = formatToday() + " — " + todayPrompt();
      jar.photos.push({
        id: photoId(),
        dataUrl: candidateDataUrl,
        caption: "",
        addedLabel: label,
        createdAt: Date.now(),
      });
      if (saveState(state, true)) {
        onDone(true, jar);
        return;
      }
      jar.photos.pop();
      var next = attempts[idx + 1];
      if (!next) {
        onDone(false, jar);
        return;
      }
      compressDataUrl(candidateDataUrl, next.maxEdge, next.quality, function (smallerDataUrl) {
        tryAttempt(idx + 1, smallerDataUrl);
      });
    }

    tryAttempt(0, dataUrl);
  }

  cameraInput.addEventListener("change", function () {
    var f = cameraInput.files && cameraInput.files[0];
    if (!pendingCapture) return;
    if (!f) {
      pendingCapture = null;
      return;
    }
    var jarId = pendingCapture.jarId;
    pendingCapture = null;
    preparePhotoDataUrl(f, function (dataUrl) {
      if (!dataUrl) {
        toast("Could not read this photo.");
        return;
      }
      addPhotoWithStorageFallback(jarId, dataUrl, function (ok, jar) {
        if (!ok || !jar) {
          toast("Could not save photo on this device — try a smaller image.");
          return;
        }
        toast("Saved to " + jar.name + "!");
        var page = document.body.getAttribute("data-page");
        if (page === "jar") {
          renderJar(jar.id);
        } else {
          window.location.href = jarPageUrl(jar.id);
        }
      });
    });
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

  function motionReduced() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function ensureStarField() {
    var existing = document.getElementById("star-field");
    if (existing) return existing;
    var el = document.createElement("div");
    el.id = "star-field";
    el.className = "star-field";
    el.setAttribute("aria-hidden", "true");
    document.body.insertBefore(el, document.body.firstChild);
    return el;
  }

  function starFieldStarCount() {
    var w = window.innerWidth || 400;
    var h = window.innerHeight || 700;
    return Math.max(42, Math.min(140, Math.floor((w * h) / 10500)));
  }

  function populateStarField() {
    var container = ensureStarField();
    container.innerHTML = "";
    var n = starFieldStarCount();
    var palette = ["#bae6fd", "#e0f2fe", "#e9d5ff", "#fbcfe8", "#a5f3fc"];
    for (var i = 0; i < n; i++) {
      var star = document.createElement("span");
      star.className = "star-field__star";
      star.textContent = "+";
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 100 + "%";
      star.style.setProperty("--star-size", (9 + Math.random() * 7).toFixed(1) + "px");
      star.style.setProperty("--star-color", palette[Math.floor(Math.random() * palette.length)]);
      if (!motionReduced()) {
        star.style.setProperty("--star-dur", (3.4 + Math.random() * 4.2).toFixed(2) + "s");
        star.style.setProperty("--star-delay", (-Math.random() * 8).toFixed(2) + "s");
      }
      container.appendChild(star);
    }
  }

  var resizeStarTimer;
  window.addEventListener(
    "resize",
    function () {
      clearTimeout(resizeStarTimer);
      resizeStarTimer = setTimeout(populateStarField, 220);
    },
    false
  );

  function burstMsFromEl(el) {
    var ms = parseInt(el.getAttribute("data-burst-duration") || "", 10);
    if (isNaN(ms)) return 500;
    return Math.min(1200, Math.max(220, ms));
  }

  function burstColorFromEl(el) {
    var attr = el.getAttribute("data-burst-color");
    if (attr && attr.trim()) return attr.trim();
    var v = window.getComputedStyle(el).getPropertyValue("--burst-color");
    return v ? v.trim() : "";
  }

  function burstVariantFromEl(el) {
    var raw = (el.getAttribute("data-burst") || "plus").trim().toLowerCase();
    if (raw === "none") return null;
    if (raw === "hearts") return "heart";
    if (raw === "rings") return "ring";
    if (raw === "plus" || raw === "spark" || raw === "ring" || raw === "confetti" || raw === "heart") {
      return raw;
    }
    return "plus";
  }

  function burstCountFor(el, variant) {
    var c = parseInt(el.getAttribute("data-burst-count") || "", 10);
    if (!isNaN(c) && c > 0) return Math.min(36, c);
    if (variant === "ring") return 3;
    if (variant === "spark") return 11;
    if (variant === "confetti") return 16;
    if (variant === "heart") return 7;
    return 10;
  }

  function burstDistanceFor(el, variant) {
    var d = parseFloat(el.getAttribute("data-burst-distance") || "");
    if (!isNaN(d) && d > 4) return Math.min(96, d);
    if (variant === "spark") return 21;
    if (variant === "confetti") return 32;
    if (variant === "heart") return 27;
    return 28;
  }

  function findBurstHost(target) {
    if (!target || typeof target.closest !== "function") return null;
    var h = target.closest(
      'button, input[type="submit"], input[type="button"], input[type="reset"], a.btn, .modal-close'
    );
    if (h) {
      if (h.disabled) return null;
      if (h.getAttribute("type") === "hidden") return null;
      return h;
    }
    return target.closest(".icon-nav__link");
  }

  function burstRings(cx, cy, color, durMs) {
    for (var r = 0; r < 3; r++) {
      (function (idx) {
        var ring = document.createElement("span");
        ring.className = "burst-ring";
        ring.setAttribute("aria-hidden", "true");
        ring.style.setProperty("--burst-cx", cx + "px");
        ring.style.setProperty("--burst-cy", cy + "px");
        ring.style.setProperty("--burst-dur", durMs / 1000 + "s");
        if (color) ring.style.setProperty("--burst-color", color);
        document.body.appendChild(ring);
        window.setTimeout(function () {
          requestAnimationFrame(function () {
            ring.classList.add("burst-ring--out");
          });
        }, idx * 55);
        window.setTimeout(function () {
          ring.remove();
        }, durMs + idx * 55 + 50);
      })(r);
    }
  }

  function burstParticlesRadial(el, opts) {
    if (motionReduced()) return;
    var rect = el.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var variant = opts.variant;
    var count = opts.count;
    var baseDist = opts.distance;
    var durS = opts.durMs / 1000;
    var color = opts.color;

    if (variant === "ring") {
      burstRings(cx, cy, color, opts.durMs);
      return;
    }

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var p = document.createElement("span");
        p.setAttribute("aria-hidden", "true");
        p.style.setProperty("--burst-dur", durS + "s");
        p.style.left = cx + "px";
        p.style.top = cy + "px";
        var angle = (Math.PI * 2 * idx) / count + (Math.random() - 0.45) * 0.35;
        var dist = baseDist * (0.75 + Math.random() * 0.55);
        p.style.setProperty("--burst-dx", Math.cos(angle) * dist + "px");
        p.style.setProperty("--burst-dy", Math.sin(angle) * dist + "px");

        if (variant === "confetti") {
          p.style.setProperty("--burst-rot", (Math.random() * 540 - 270).toFixed(1) + "deg");
          p.style.setProperty("--burst-end-scale", "0.08");
          var hues = ["#f472b6", "#a78bfa", "#38bdf8", "#facc15", "#4ade80", "#fb923c"];
          p.style.setProperty("--burst-color", color || hues[idx % hues.length]);
        } else if (color) {
          p.style.setProperty("--burst-color", color);
        }
        if (variant === "spark") {
          p.style.setProperty("--burst-end-scale", "0.06");
        }

        var baseCls = "burst-particle";
        if (variant === "heart") {
          baseCls += " burst-particle--heart";
          var ch = el.getAttribute("data-burst-char");
          p.textContent = ch && ch.trim() ? ch.trim() : "\u2665";
        } else if (variant === "plus") {
          baseCls += " burst-particle--plus";
          var chp = el.getAttribute("data-burst-char");
          p.textContent = chp && chp.trim() ? chp.trim() : "+";
        } else if (variant === "spark") {
          baseCls += " burst-particle--spark";
        } else if (variant === "confetti") {
          baseCls += " burst-particle--confetti";
        } else {
          baseCls += " burst-particle--plus";
          p.textContent = "+";
        }

        p.className = baseCls;
        document.body.appendChild(p);
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            p.classList.add("burst-particle--out");
          });
        });
        window.setTimeout(function () {
          p.remove();
        }, opts.durMs + 100);
      })(i);
    }
  }

  function playBurstForClickTarget(el) {
    if (motionReduced()) return;
    var variant = burstVariantFromEl(el);
    if (!variant) return;
    var durMs = burstMsFromEl(el);
    var color = burstColorFromEl(el);
    burstParticlesRadial(el, {
      variant: variant,
      count: burstCountFor(el, variant),
      distance: burstDistanceFor(el, variant),
      durMs: durMs,
      color: color,
    });
  }

  document.addEventListener(
    "click",
    function (e) {
      var host = findBurstHost(e.target);
      if (!host) return;
      if (burstVariantFromEl(host) === null) return;
      playBurstForClickTarget(host);
    },
    false
  );

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

  populateStarField();
  initPage();
})();
