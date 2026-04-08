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

  var mainEl = document.getElementById("main");
  var drawer = document.getElementById("drawer");
  var drawerScrim = document.getElementById("drawer-scrim");
  var btnMenu = document.getElementById("btn-menu");
  var drawerClose = document.getElementById("drawer-close");
  var modalMemory = document.getElementById("modal-memory");
  var modalMemoryImg = document.getElementById("modal-memory-img");
  var modalMemoryCaption = document.getElementById("modal-memory-caption");
  var modalMemoryClose = document.getElementById("modal-memory-close");
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
    return (
      '<svg class="jar-svg" viewBox="0 0 100 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path fill="#4a3426" d="M28 18h44l6 14v8H22v-8l6-14z"/>' +
      '<path fill="#6b4a2e" d="M26 40h48v6H26z"/>' +
      '<path fill="#c44b4b" stroke="#2d1f14" stroke-width="2" d="M22 46c2 52 8 72 28 78 20-6 26-26 28-78H22z"/>' +
      '<ellipse cx="50" cy="46" rx="26" ry="5" fill="#e8a838" opacity="0.35"/>' +
      '<path fill="none" stroke="#2d1f14" stroke-width="2" d="M22 46c2 52 8 72 28 78 20-6 26-26 28-78"/>' +
      "</svg>"
    );
  }

  function renderHome() {
    var state = loadState();
    getOrCreateDefaultJar(state);
    saveState(state);

    var html = "";
    html += '<h2 class="screen-title">Home</h2>';
    html += '<div class="card">';
    html += '<p class="prompt-date">' + escapeHtml(formatToday()) + "</p>";
    html += '<p class="prompt-box">Today\'s prompt: <strong>' + escapeHtml(todayPrompt()) + "</strong></p>";
    html += '<div class="btn-row">';
    html +=
      '<button type="button" class="btn primary" id="btn-capture-prompt">Add photo to Daily jar</button>';
    html += "</div>";
    html += '<p class="jar-hint">Your daily capture goes into the <em>Daily memories</em> jar unless you pick another jar inside <a href="#jars">My jars</a>.</p>';
    html += "</div>";

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.75rem">Quick open</p>';
    html += '<div class="btn-row">';
    html += '<a class="btn secondary" href="#jars">My jars</a>';
    html += '<a class="btn ghost" href="#import">Import shared jar</a>';
    html += "</div>";
    html += "</div>";

    html += '<div class="jar-preview-wrap" id="home-jar-tease">';
    html += jarSvg();
    html += "</div>";
    html += '<p class="jar-hint">Tip: open any jar and shake to pull a random memory.</p>';

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
    html += '<p class="jar-hint">Shake the jar to surface a random memory from this jar.</p>';

    html += '<div class="card">';
    html += '<p class="prompt-box" style="margin:0 0 0.5rem"><strong>Today:</strong> ' + escapeHtml(todayPrompt()) + "</p>";
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
    html += '<p class="jar-hint" style="text-align:left;margin:0 0 0.5rem">Export a file and send it to a friend. They can import it from Home → Import.</p>';
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
        modalMemoryCaption.textContent = cap || "";
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

  modalMemoryClose.addEventListener("click", function () {
    modalMemory.hidden = true;
    modalMemoryImg.src = "";
  });
  modalMemory.addEventListener("click", function (e) {
    if (e.target === modalMemory) {
      modalMemory.hidden = true;
      modalMemoryImg.src = "";
    }
  });

  newJarCancel.addEventListener("click", function () {
    modalNewJar.hidden = true;
  });
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
    modalNewJar.hidden = true;
    toast("Jar created!");
    location.hash = "#jar/" + encodeURIComponent(j.id);
  });

  function route() {
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
