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
  var drawer = document.getElementById("drawer");
  var drawerScrim = document.getElementById("drawer-scrim");
  var btnMenu = document.getElementById("btn-menu");
  var drawerClose = document.getElementById("drawer-close");
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
  var importFile = document.getElementById("import-file");

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

  function findJar(state, id) {
    return state.jars.find(function (j) {
      return j.id === id;
    });
  }

  function openDrawer() {
    drawer.hidden = false;
    drawerScrim.hidden = false;
  }

  function closeDrawer() {
    drawer.hidden = true;
    drawerScrim.hidden = true;
  }

  btnMenu.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerScrim.addEventListener("click", closeDrawer);

  document.querySelectorAll(".nav-link").forEach(function (a) {
    a.addEventListener("click", closeDrawer);
  });

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
    saveState(state);

    var memories = totalPhotoCount(state);
    var jarCount = state.jars.length;

    setFooter(
      "Memory Jam · starlight & snapshots · shake the jar for a random glow-memory",
      true
    );

    var html = "";
    html += '<div class="home-hero">';
    html += '<p class="cozy-pill">Tonight</p>';
    html += '<h2 class="home-hero-kicker">Welcome home</h2>';
    html += '<p class="home-hero-tagline">A cute pixel nightlife journal — one photo prompt each day, tucked into jars you can shake whenever you want a soft memory under the stars.</p>';
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
      '<p class="jar-hint">Saves to <em>Daily memories</em>. Open <a href="#jars">My jars</a> to use a different jar or start a new one.</p>';
    html += "</div>";

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.65rem">Where to next</p>';
    html += '<div class="quick-links">';
    html += '<a class="btn secondary" href="#jars">My jars — create &amp; open</a>';
    html += '<a class="btn ghost" href="#import">Import a shared jar</a>';
    html += "</div>";
    html += "</div>";

    html += '<div class="jar-preview-wrap" id="home-jar-tease">';
    html += jarSvg();
    html += "</div>";
    html += '<p class="jar-hint">Open any jar, tap <strong>Shake jar</strong>, and a random photo will float up — like catching a firefly memory from a neon jar.</p>';

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
    saveState(state);

    var html = "";
    html += '<h2 class="screen-title">My jars</h2>';
    html += '<div class="btn-row" style="margin-bottom:1rem">';
    html += '<button type="button" class="btn primary" id="btn-new-jar">New jar</button>';
    html += "</div>";

    if (state.jars.length === 0) {
      html += '<p class="empty-state">No jars yet. Create one!</p>';
    } else {
      html += '<ul class="jar-list">';
      state.jars.forEach(function (j) {
        html += "<li>";
        html += '<a href="#jar/' + encodeURIComponent(j.id) + '">';
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
    var jar = findJar(state, jarId);
    if (!jar) {
      mainEl.innerHTML =
        '<h2 class="screen-title">Jar not found</h2><p class="empty-state"><a href="#jars">Back to jars</a></p>';
      return;
    }

    state.activeJarId = jar.id;
    saveState(state);

    var html = "";
    html += '<h2 class="screen-title">' + escapeHtml(jar.name) + "</h2>";
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

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.5rem">Share this jar</p>';
    html += '<p class="jar-hint" style="text-align:left;margin:0 0 0.5rem">Export the JSON file and send it to someone you trust. They import it from the menu under <strong>Import jar</strong> — your memories stay on your devices.</p>';
    html += '<div class="btn-row">';
    html += '<button type="button" class="btn secondary" id="btn-export">Export .json</button>';
    html += '<button type="button" class="btn ghost" id="btn-copy-share">Copy share text</button>';
    html += "</div>";
    html += "</div>";

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

    document.getElementById("btn-export").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify(exportJarPayload(jar), null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = slugName(jar.name) + "-memory-jam.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast("Jar exported.");
    });

    document.getElementById("btn-copy-share").addEventListener("click", function () {
      var payload = exportJarPayload(jar);
      var text =
        "Memory Jam — shared jar \"" +
        jar.name +
        "\"\n\nImport this JSON in Memory Jam (Import jar), or use the file from Export.\n\n" +
        "Preview: " +
        jar.photos.length +
        " photos.\n";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () {
            toast("Share blurb copied.");
          },
          function () {
            toast("Could not copy — try Export instead.");
          }
        );
      } else {
        toast("Clipboard not available — use Export.");
      }
    });
  }

  function slugName(name) {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "jar"
    );
  }

  function exportJarPayload(jar) {
    return {
      app: "memory-jam",
      version: 1,
      exportedAt: Date.now(),
      jar: {
        name: jar.name,
        photos: jar.photos.map(function (p) {
          return {
            id: p.id,
            dataUrl: p.dataUrl,
            caption: p.caption || "",
            createdAt: p.createdAt,
          };
        }),
      },
    };
  }

  function importJarFromObject(data) {
    if (!data || data.app !== "memory-jam" || !data.jar) {
      throw new Error("Invalid file");
    }
    var j = data.jar;
    var state = loadState();
    var newJar = {
      id: uid(),
      name: j.name || "Imported jar",
      createdAt: Date.now(),
      photos: (j.photos || []).map(function (p) {
        return {
          id: p.id || photoId(),
          dataUrl: p.dataUrl,
          caption: p.caption || "",
          createdAt: p.createdAt || Date.now(),
        };
      }),
    };
    state.jars.push(newJar);
    state.activeJarId = newJar.id;
    saveState(state);
    return newJar.id;
  }

  function renderImport() {
    setFooter("", false);
    var html = "";
    html += '<h2 class="screen-title">Import jar</h2>';
    html += '<div class="card">';
    html +=
      "<p>Someone shared a <strong>Memory Jam</strong> export with you? Choose the <code>.json</code> file below. It will appear in <a href=\"#jars\">My jars</a> as a new jar.</p>";
    html += '<div class="btn-row">';
    html += '<button type="button" class="btn primary" id="btn-pick-import">Choose file</button>';
    html += "</div>";
    html += "</div>";
    mainEl.innerHTML = html;
    document.getElementById("btn-pick-import").addEventListener("click", function () {
      importFile.click();
    });
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
      if (location.hash.indexOf("#jar/") === 0) {
        renderJar(jar.id);
      } else {
        location.hash = "#jar/" + encodeURIComponent(jar.id);
      }
    };
    reader.readAsDataURL(f);
  });

  importFile.addEventListener("change", function () {
    var f = importFile.files && importFile.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        var id = importJarFromObject(data);
        toast("Jar imported!");
        location.hash = "#jar/" + encodeURIComponent(id);
      } catch (e) {
        toast("Could not read that file.");
      }
      importFile.value = "";
    };
    reader.readAsText(f);
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
    location.hash = "#jar/" + encodeURIComponent(j.id);
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

  function route() {
    closeNewJarModal();
    var h = location.hash.slice(1) || "home";
    if (h === "home" || h === "") {
      renderHome();
      return;
    }
    if (h === "jars") {
      renderJars();
      return;
    }
    if (h === "import") {
      renderImport();
      return;
    }
    if (h.indexOf("jar/") === 0) {
      var id = decodeURIComponent(h.slice(4));
      renderJar(id);
      return;
    }
    renderHome();
  }

  window.addEventListener("hashchange", route);
  route();
})();
