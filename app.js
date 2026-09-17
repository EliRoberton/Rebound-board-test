(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "rebound-board-v01";
  const settings = loadSettings();
  const coachMode = new URLSearchParams(location.search).get("mode") === "coach";
  let armed = null, armTimer = null, readyToken = null;
  let publishReady = () => {};
  let reportResult = () => Promise.resolve();
  let serverOffset = 0;
  const serverNow = () => Date.now() + serverOffset;

  function validBoardId(value) {
    return /^[1-9][0-9]?$/.test(String(value));
  }
  const requestedBoard = new URLSearchParams(window.location.search).get("board");
  const activeBoardId = validBoardId(requestedBoard) ? requestedBoard :
    (validBoardId(settings.boardId) ? String(settings.boardId) : "1");
  settings.boardId = activeBoardId;
  let firebaseReady = false;
  let sendHit = null;
  let sensorEnabled = false;
  let wakeLock = null;
  let peak = 0;
  let hits = 0;
  let lastHitAt = -Infinity;
  let sampleCounter = 0;
  let sampleWindowStart = performance.now();
  let recentHits = [];
  let fallbackGravity = {x:0,y:0,z:0};
  let calibrating = false;
  let calibrationCandidates = [];
  let calibrationLastCapture = -Infinity;
  let targetOpen = false;

  $("boardId").value = settings.boardId;
  $("threshold").value = settings.threshold;
  $("debounce").value = settings.debounce;
  refreshLabels();
  refreshBoardNumber();

  if (!window.isSecureContext) $("httpsWarning").classList.remove("hidden");

  function loadSettings(){
    try{
      return Object.assign(
        {boardId:"1", threshold:2.5, debounce:450},
        JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
      );
    }catch{
      return {boardId:"1", threshold:2.5, debounce:450};
    }
  }

  function saveSettings(){
    const data = {
      boardId: $("boardId").value.trim() || "1",
      threshold: Number($("threshold").value),
      debounce: Number($("debounce").value)
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }

  function refreshLabels(){
    $("thresholdLabel").textContent = Number($("threshold").value).toFixed(2) + " m/s²";
    $("debounceLabel").textContent = Number($("debounce").value) + " ms";
  }

  function refreshBoardNumber(){
    const id = $("boardId").value.trim() || "1";
    $("targetBoardNumber").textContent = id;
    $("boardTitle").textContent = "Board " + id + " Sensor";
  }

  $("boardId").addEventListener("change", () => {
    const next = $("boardId").value.trim();
    if (!validBoardId(next)) {
      $("boardId").value = activeBoardId;
      setStatus("Use a Board ID from 1 to 99.", true);
      return;
    }
    saveSettings();
    if (next !== activeBoardId) {
      const url = new URL(window.location.href);
      url.searchParams.set("board", next);
      window.location.assign(url.href);
    }
  });
  saveSettings();
  $("threshold").addEventListener("input", () => { refreshLabels(); saveSettings(); });
  $("debounce").addEventListener("input", () => { refreshLabels(); saveSettings(); });

  $("enableSensor").addEventListener("click", enableSensor);
  $("wakeButton").addEventListener("click", requestWakeLock);
  $("resetButton").addEventListener("click", resetReadings);
  $("calibrateButton").addEventListener("click", startCalibration);
  $("targetButton").addEventListener("click", openTarget);
  $("target").addEventListener("click", closeTarget);

  document.addEventListener("visibilitychange", async () => {
    if (coachMode) return;
    if (document.visibilityState === "visible" && wakeLock === null && $("wakeButton").dataset.enabled === "1") {
      await requestWakeLock();
    }
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  async function enableSensor(){
    try{
      if (typeof DeviceMotionEvent === "undefined") {
        throw new Error("This browser does not expose DeviceMotionEvent.");
      }

      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== "granted") throw new Error("Motion permission was not granted.");
      }

      if (!sensorEnabled) {
        window.addEventListener("devicemotion", onMotion, {passive:true});
        sensorEnabled = true;
      }

      $("enableSensor").disabled = true;
      $("enableSensor").textContent = "Sensor enabled";
      setStatus("Listening for motion. Samples/sec should rise above zero.");
    } catch(err) {
      setStatus("Sensor error: " + err.message, true);
    }
  }

  function onMotion(e){
    const linear = e.acceleration;
    const withGravity = e.accelerationIncludingGravity;
    let x=0,y=0,z=0, magnitude=0, source="—";

    if (linear && isFiniteNumber(linear.x) && isFiniteNumber(linear.y) && isFiniteNumber(linear.z)) {
      x = linear.x; y = linear.y; z = linear.z;
      magnitude = Math.sqrt(x*x + y*y + z*z);
      source = "linear";
    } else if (withGravity && isFiniteNumber(withGravity.x) && isFiniteNumber(withGravity.y) && isFiniteNumber(withGravity.z)) {
      const alpha = 0.86;
      fallbackGravity.x = alpha * fallbackGravity.x + (1-alpha) * withGravity.x;
      fallbackGravity.y = alpha * fallbackGravity.y + (1-alpha) * withGravity.y;
      fallbackGravity.z = alpha * fallbackGravity.z + (1-alpha) * withGravity.z;
      x = withGravity.x - fallbackGravity.x;
      y = withGravity.y - fallbackGravity.y;
      z = withGravity.z - fallbackGravity.z;
      magnitude = Math.sqrt(x*x + y*y + z*z);
      source = "filtered";
    } else {
      return;
    }

    sampleCounter++;
    const now = performance.now();

    $("liveValue").textContent = magnitude.toFixed(2);
    $("xVal").textContent = x.toFixed(2);
    $("yVal").textContent = y.toFixed(2);
    $("zVal").textContent = z.toFixed(2);
    $("sensorSource").textContent = source;

    if (magnitude > peak){
      peak = magnitude;
      $("peakValue").textContent = peak.toFixed(2);
    }

    if (now - sampleWindowStart >= 1000){
      $("sampleRate").textContent = String(sampleCounter);
      sampleCounter = 0;
      sampleWindowStart = now;
    }

    if (calibrating) observeCalibration(magnitude, now);

    const threshold = Number($("threshold").value);
    const debounce = Number($("debounce").value);

    if (magnitude >= threshold && now - lastHitAt >= debounce){
      registerHit(magnitude, now);
    }
  }

  function isFiniteNumber(v){ return typeof v === "number" && Number.isFinite(v); }

  function registerHit(value, now){
    lastHitAt = now;
    hits++;
    const trial = armed;
    if (trial) {
      const reactionMs = Math.max(0, Math.round(now - trial.started));
      disarm("HIT");
      reportResult(trial.id, { state: "hit", reactionMs, magnitude: value }).catch(networkError);
    }
    if (firebaseReady && sendHit) {
      sendHit(value).catch(err => {
        setStatus("Hit counted locally; upload failed: " + err.message, true);
      });
    }
    $("hitCount").textContent = String(hits);

    recentHits.unshift({
      value,
      time: new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})
    });
    recentHits = recentHits.slice(0, 8);
    renderHitLog();

    if (targetOpen && !readyToken){
      $("target").classList.add("hit");
      $("targetText").textContent = "HIT";
      if (navigator.vibrate) navigator.vibrate(55);
      setTimeout(() => {
        if (!targetOpen) return;
        $("target").classList.remove("hit");
        $("targetText").textContent = "GO";
      }, 700);
    }
  }

  function renderHitLog(){
    if (!recentHits.length){
      $("hitLog").innerHTML = "<li>No hits yet.</li>";
      return;
    }
    $("hitLog").innerHTML = recentHits
      .map((h,i) => `<li><b>${h.value.toFixed(2)} m/s²</b> — ${h.time}${i===0 ? " (latest)" : ""}</li>`)
      .join("");
  }

  function resetReadings(){
    peak = 0;
    hits = 0;
    recentHits = [];
    $("peakValue").textContent = "0.00";
    $("hitCount").textContent = "0";
    renderHitLog();
    setStatus(sensorEnabled ? "Readings reset. Sensor is still active." : "Sensor not started.");
  }

  function startCalibration(){
    if (targetOpen) closeTarget();
    if (!sensorEnabled){
      setStatus("Enable the sensor before calibrating.", true);
      return;
    }
    calibrating = true;
    calibrationCandidates = [];
    calibrationLastCapture = -Infinity;
    $("calibrateButton").disabled = true;
    $("calibrateButton").textContent = "Calibration running…";
    setStatus("Make 5 normal passes into the board, about one second apart.");
  }

  function observeCalibration(value, now){
    // Ignore small motion. Each pass captures the largest local spike during a short window.
    if (value < 0.8) return;
    if (now - calibrationLastCapture < 700) return;

    calibrationCandidates.push(value);
    calibrationLastCapture = now;
    setStatus(`Calibration: ${calibrationCandidates.length}/5 strikes captured.`);

    if (calibrationCandidates.length >= 5){
      const sorted = calibrationCandidates.slice().sort((a,b)=>a-b);
      const median = sorted[Math.floor(sorted.length/2)];
      const suggested = Math.max(0.3, Math.min(20, median * 0.42));
      $("threshold").value = suggested.toFixed(2);
      refreshLabels();
      saveSettings();

      calibrating = false;
      $("calibrateButton").disabled = false;
      $("calibrateButton").textContent = "Calibrate from 5 passes";
      setStatus(`Calibration complete. Median strike ${median.toFixed(2)} m/s²; threshold set to ${suggested.toFixed(2)} m/s².`);
    }
  }

  async function requestWakeLock(){
    try{
      if (!("wakeLock" in navigator)) throw new Error("Wake Lock is not supported by this browser.");
      wakeLock = await navigator.wakeLock.request("screen");
      $("wakeButton").dataset.enabled = "1";
      $("wakeButton").textContent = "Screen will stay awake";
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }catch(err){
      setStatus("Wake lock unavailable: " + err.message + " Set Android's screen timeout manually.", true);
    }
  }

  function openTarget(){
    if (!sensorEnabled){
      setStatus("Enable the sensor first.", true);
      return;
    }
    if (calibrating) {
      setStatus("Finish calibration before opening the target.", true);
      return;
    }
    targetOpen = true;
    refreshBoardNumber();
    $("target").classList.remove("hidden","hit");
    readyToken = crypto.randomUUID();
    disarm("WAIT");
    publishReady();
    document.documentElement.requestFullscreen?.().catch(()=>{});
  }

  function closeTarget(){
    if (armed) reportResult(armed.id, { state: "cancelled" }).catch(networkError);
    disarm("WAIT");
    readyToken = null;
    targetOpen = false;
    publishReady();
    $("target").classList.add("hidden");
    $("target").classList.remove("hit");
    document.exitFullscreen?.().catch(()=>{});
  }

  function setStatus(text, error=false){
    $("status").textContent = text;
    $("status").style.color = error ? "#ffd08a" : "#d9dce1";
  }

  // Firebase loads separately so local motion testing still works if it fails.
  function showConnection(text, colour) {
    $("connectionBadge").textContent = text;
    $("connectionBadge").style.background = colour;
    $("connectionBadge").style.color = "white";
  }

  async function connectFirebase() {
    showConnection("CONNECTING • BOARD " + activeBoardId, "#555");
    try {
      const [{ initializeApp }, sdk] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js")
      ]);
      const { getDatabase, ref, push, set, update, onValue, onDisconnect, serverTimestamp } = sdk;
      const app = initializeApp({
        apiKey: "AIzaSyBwa_ZiaVEo8sSz4NGIe93DCDREmq7387k",
        authDomain: "rebound-boards.firebaseapp.com",
        databaseURL: "https://rebound-boards-default-rtdb.firebaseio.com",
        projectId: "rebound-boards",
        storageBucket: "rebound-boards.firebasestorage.app",
        messagingSenderId: "1088085580500",
        appId: "1:1088085580500:web:4146980a5a3c5a30593941"
      });
      const db = getDatabase(app);
      onValue(ref(db, ".info/serverTimeOffset"), snap => { serverOffset = Number(snap.val()) || 0; });
      if (coachMode) {
        startCoach(sdk, db);
        return;
      }
      let sessionRef = null;
      publishReady = () => {
        if (!firebaseReady || !sessionRef) return;
        update(sessionRef, {readyToken: targetOpen && sensorEnabled ? readyToken : null}).catch(networkError);
      };
      reportResult = (id, details) => update(ref(db, "controls/" + activeBoardId + "/results/" + id),
        {...details, time: serverTimestamp()});
      onValue(ref(db, "controls/" + activeBoardId + "/command"), snap => receiveCommand(snap.val()), networkError);
      const boardPath = "boards/" + activeBoardId;
      let generation = 0;

      sendHit = async magnitude => {
        const hitRef = push(ref(db, boardPath + "/hits"));
        await update(ref(db, boardPath), {
          ["hits/" + hitRef.key]: {
            time: serverTimestamp(),
            clientTime: Date.now(),
            magnitude: Number(magnitude.toFixed(3)),
            sensorSource: $("sensorSource").textContent
          },
          lastHit: serverTimestamp()
        });
      };

      onValue(ref(db, ".info/connected"), snapshot => {
        const thisGeneration = ++generation;
        firebaseReady = false;
        if (snapshot.val() !== true) {
          sessionRef = null;
          disarm("OFFLINE");
          // Require a fresh command after reconnect, never replay the last light.
          if (targetOpen) readyToken = crypto.randomUUID();
          showConnection("OFFLINE • BOARD " + activeBoardId, "#8b2d2d");
          return;
        }
        showConnection("REGISTERING • BOARD " + activeBoardId, "#555");
        // Each connection has its own record: one tab cannot mark another offline.
        const session = push(ref(db, boardPath + "/connections"));
        sessionRef = session;
        (async () => {
          await onDisconnect(session).remove();
          if (thisGeneration !== generation) return;
          await set(session, { connectedAt: serverTimestamp(), readyToken: targetOpen ? readyToken : null });
          await update(ref(db, boardPath), {
            boardId: activeBoardId, lastSeen: serverTimestamp()
          });
          if (thisGeneration !== generation) return;
          firebaseReady = true;
          publishReady();
          showConnection("ONLINE • BOARD " + activeBoardId, "#16833b");
        })().catch(err => {
          if (thisGeneration !== generation) return;
          firebaseReady = false;
          showConnection("FIREBASE ERROR", "#8b2d2d");
          setStatus("Firebase: " + err.message + " Local sensor testing still works.", true);
        });
      });
    } catch (err) {
      showConnection("LOCAL ONLY", "#8b2d2d");
      setStatus("Firebase could not load: " + err.message + " Refresh to retry. Local testing still works.", true);
    }
  }


  function startCoach(sdk, db) {
    const { ref, onValue, set, serverTimestamp } = sdk;
    let connected = false, board = "1", ready = null, pending = null;
    let unwatch = () => {}, unresult = () => {}, timeout;
    function buttons() {
      $("lightBoard").disabled = !connected || !ready || !!pending;
      $("offBoard").disabled = !connected || !ready;
      $("coachBoard").disabled = !!pending;
      $("lightBoard").textContent = "Light up Board " + board;
    }
    function finish(message) {
      clearTimeout(timeout); pending = null;
      $("coachMessage").textContent = message; buttons();
    }
    function watchBoard() {
      unwatch(); unresult();
      ready = null; buttons();
      $("reaction").textContent = "—";
      unwatch = onValue(ref(db, "boards/" + board + "/connections"), snap => {
        const sessions = Object.values(snap.val() || {});
        const usable = sessions.filter(s => typeof s.readyToken === "string");
        ready = usable.length === 1 ? usable[0].readyToken : null;
        $("boardPresence").textContent = usable.length > 1 ? "Multiple ready phones share this Board ID. Give each phone a different number." :
          ready ? "Board " + board + " is ready" : sessions.length ? "Board is online. Enable its sensor and open the target." : "Board is offline";
        if (pending && ready !== pending.token) {
          unresult(); finish("Board stopped being ready. Reopen its target and try again.");
        }
        buttons();
      }, err => { ready = null; buttons(); networkError(err); });
    }
    onValue(ref(db, ".info/connected"), snap => {
      connected = snap.val() === true;
      showConnection(connected ? "COACH ONLINE" : "COACH OFFLINE", connected ? "#16833b" : "#8b2d2d");
      if (!connected && pending) { unresult(); finish("Connection lost. The board light will expire automatically."); }
      buttons();
    });
    $("coachBoard").addEventListener("change", () => {
      const value = $("coachBoard").value.trim();
      if (!validBoardId(value)) { $("coachBoard").value = board; return; }
      board = value; watchBoard();
    });
    $("lightBoard").addEventListener("click", async () => {
      if (!connected || !ready || pending) return;
      const id = crypto.randomUUID(), token = ready, selected = board;
      pending = {id, token}; buttons();
      $("reaction").textContent = "—";
      $("coachMessage").textContent = "Sending light command…";
      unresult();
      unresult = onValue(ref(db, "controls/" + selected + "/results/" + id), snap => {
        const result = snap.val();
        if (!result || pending?.id !== id) return;
        if (result.state === "lit") $("coachMessage").textContent = "Board " + selected + " is lit. Waiting for a hit.";
        if (result.state === "hit") {
          $("reaction").textContent = (Number(result.reactionMs) / 1000).toFixed(3) + " s";
          finish("HIT • Board " + selected + " • Light off"); unresult();
        } else if (result.state === "timeout" || result.state === "cancelled") {
          finish(result.state === "timeout" ? "No hit within 30 seconds. Light off." : "Target cancelled. Light off."); unresult();
        }
      }, err => { finish("Could not read the board response."); networkError(err); });
      timeout = setTimeout(() => {
        if (pending?.id !== id) return;
        unresult(); finish("No final response. Check the board phone and try again.");
      }, 32000);
      try {
        await set(ref(db, "controls/" + selected + "/command"), {
          id, action: "light", readyToken: token,
          issuedAt: serverTimestamp(), expiresAt: serverNow() + 30000
        });
      } catch (err) {
        if (pending?.id === id) { unresult(); finish("Light command failed."); networkError(err); }
      }
    });
    $("offBoard").addEventListener("click", async () => {
      if (!connected || !ready) return;
      try {
        await set(ref(db, "controls/" + board + "/command"), {
          id: crypto.randomUUID(), action: "off", readyToken: ready
        });
        unresult(); finish("Turn-off command sent.");
      } catch (err) { networkError(err); }
    });
    watchBoard();
  }

  function networkError(err) {
    setStatus("Firebase: " + err.message, true);
    if ($("coachMessage")) $("coachMessage").textContent = "Firebase: " + err.message;
  }

  // A canvas keeps the target's signal colours separate from page background styling.
  let signalCanvas = null;
  let signalLabel = "WAIT";
  function paintTarget(label = signalLabel) {
    signalLabel = label;
    const target = $("target");
    if (!signalCanvas) {
      signalCanvas = document.createElement("canvas");
      signalCanvas.setAttribute("aria-hidden", "true");
      signalCanvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;forced-color-adjust:none;color-scheme:only light";
      target.appendChild(signalCanvas);
      target.style.setProperty("color-scheme", "only light");
      target.style.setProperty("forced-color-adjust", "none");
    }
    if (!targetOpen) return;
    const width = target.clientWidth || window.innerWidth;
    const height = target.clientHeight || window.innerHeight;
    if (!width || !height) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    signalCanvas.width = Math.round(width * scale);
    signalCanvas.height = Math.round(height * scale);
    const ctx = signalCanvas.getContext("2d");
    if (!ctx) return; // Existing HTML remains the fallback.
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const lit = label === "GO";
    ctx.fillStyle = lit ? "#34e27a" : "#080a0b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = lit ? "#06140b" : label === "HIT" ? "#34e27a" : "#a0a5af";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const numberSize = Math.min(width * 0.24, height * 0.22, 180);
    const labelSize = Math.min(width * 0.16, height * 0.14, 110);
    ctx.font = "900 " + numberSize + "px system-ui, sans-serif";
    ctx.fillText(activeBoardId, width / 2, height * 0.40);
    ctx.font = "900 " + labelSize + "px system-ui, sans-serif";
    ctx.fillText(label, width / 2, height * 0.57, width * 0.9);
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillText("Tap anywhere to exit", width / 2, height * 0.72);
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("v0.3.1", width / 2, height - 32);
    target.setAttribute("aria-label", "Board " + activeBoardId + ": " + label);
  }
  window.addEventListener("resize", () => { if (targetOpen) paintTarget(); });
  document.addEventListener("fullscreenchange", () => { if (targetOpen) paintTarget(); });

  function disarm(label = "WAIT") {
    clearTimeout(armTimer);
    armed = null;
    $("target").classList.remove("hit");
    $("target").style.background = "#080a0b";
    $("target").style.color = label === "HIT" ? "#34e27a" : "#a0a5af";
    $("targetText").textContent = label;
    paintTarget(label);
  }
  function receiveCommand(command) {
    if (!command || typeof command.id !== "string" || !firebaseReady ||
        !targetOpen || !sensorEnabled || !readyToken ||
        command.readyToken !== readyToken || document.visibilityState === "hidden") return;
    if (command.action === "off") {
      if (armed) reportResult(armed.id, {state: "cancelled"}).catch(networkError);
      disarm();
      return;
    }
    if (command.action !== "light" || typeof command.expiresAt !== "number" ||
        command.expiresAt <= serverNow() || command.expiresAt > serverNow() + 35000 ||
        command.id === lastCommandId) return;
    lastCommandId = command.id;
    if (armed) reportResult(armed.id, {state: "cancelled"}).catch(networkError);
    disarm();
    armed = {id: command.id, started: performance.now()};
    $("target").style.background = "#34e27a";
    $("target").style.color = "#06140b";
    $("targetText").textContent = "GO";
    paintTarget("GO");
    reportResult(command.id, {state: "lit"}).catch(networkError);
    armTimer = setTimeout(() => {
      if (armed?.id !== command.id) return;
      disarm();
      reportResult(command.id, {state: "timeout"}).catch(networkError);
    }, Math.max(0, command.expiresAt - serverNow()));
  }
  let lastCommandId = null;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && targetOpen) closeTarget();
  });
  if (coachMode) {
    $("app").innerHTML = `
      <section class="topbar"><div><div class="eyebrow">REBOUND BOARD • v0.3.1</div>
      <h1>Coach controls</h1></div><div id="connectionBadge" class="badge neutral">CONNECTING</div></section>
      <section class="card">
        <div class="field-row"><label for="coachBoard">Board number</label>
        <input id="coachBoard" type="number" min="1" max="99" value="1"></div>
        <p id="boardPresence" role="status">Checking board…</p>
        <div class="button-grid"><button id="lightBoard" class="primary" disabled>Light up Board 1</button>
        <button id="offBoard" disabled>Turn off</button></div>
        <p id="coachMessage" class="status" role="status">Connect the Android, enable its sensor and open its target screen.</p>
      </section>
      <section class="card"><h2>Last reaction</h2><p id="reaction" style="font-size:36px;margin:12px 0">—</p>
        <p class="help">Measured on the board phone from the green screen update to the detected hit. Lights expire after 30 seconds.</p>
      </section>
      <a href="?board=1" style="color:#34e27a">Open board setup</a>
      <div id="status" class="hidden"></div>`;
  } else {
    $("targetButton").textContent = "Open target — wait for coach (v0.3.1)";
    $("targetButton").nextElementSibling.textContent = "Enable the sensor, then open the target. It waits dark until the coach lights it. A hit turns the light off.";
    const link = document.createElement("a");
    link.href = "?mode=coach"; link.textContent = "Open coach controls";
    link.style.cssText = "display:block;color:#34e27a;margin:16px 0";
    $("app").prepend(link);
  }
  connectFirebase();

})();


