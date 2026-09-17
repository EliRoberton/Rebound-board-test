
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = "rebound-board-v01";
  const settings = loadSettings();

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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

  $("boardId").addEventListener("input", () => {
    refreshBoardNumber();
    saveSettings();
  });
  $("threshold").addEventListener("input", () => { refreshLabels(); saveSettings(); });
  $("debounce").addEventListener("input", () => { refreshLabels(); saveSettings(); });

  $("enableSensor").addEventListener("click", enableSensor);
  $("wakeButton").addEventListener("click", requestWakeLock);
  $("resetButton").addEventListener("click", resetReadings);
  $("calibrateButton").addEventListener("click", startCalibration);
  $("targetButton").addEventListener("click", openTarget);
  $("target").addEventListener("click", closeTarget);

  document.addEventListener("visibilitychange", async () => {
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
    $("hitCount").textContent = String(hits);

    recentHits.unshift({
      value,
      time: new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit"})
    });
    recentHits = recentHits.slice(0, 8);
    renderHitLog();

    if (targetOpen){
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
    targetOpen = true;
    refreshBoardNumber();
    $("target").classList.remove("hidden","hit");
    $("targetText").textContent = "GO";
    document.documentElement.requestFullscreen?.().catch(()=>{});
  }

  function closeTarget(){
    targetOpen = false;
    $("target").classList.add("hidden");
    $("target").classList.remove("hit");
    document.exitFullscreen?.().catch(()=>{});
  }

  function setStatus(text, error=false){
    $("status").textContent = text;
    $("status").style.color = error ? "#ffd08a" : "#d9dce1";
  }
})();
