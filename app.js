(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  // Older Android browsers support getRandomValues but not randomUUID.
  function newCommandId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  const APP_VERSION = "0.5.1";
  let soundContext = null;
  function unlockAudio() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!soundContext) soundContext = new Audio();
      soundContext.resume().catch(()=>{});
    } catch {}
  }
  function playTone(frequency) {
    if (!soundContext || soundContext.state !== "running") return;
    try {
      const tone = soundContext.createOscillator(), gain = soundContext.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(.07, soundContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, soundContext.currentTime + .10);
      tone.connect(gain); gain.connect(soundContext.destination);
      tone.start(); tone.stop(soundContext.currentTime + .11);
    } catch {}
  }
  const COLOURS = {
    green: {hex:"#b8f65b", ink:"#102015", name:"Green"},
    blue: {hex:"#5ec9ff", ink:"#071c2b", name:"Blue"},
    coral: {hex:"#ff8775", ink:"#32120e", name:"Coral"},
    violet: {hex:"#beabff", ink:"#1d133c", name:"Violet"},
    white: {hex:"#eaf1ef", ink:"#172322", name:"White"}
  };
  const GAMES = [
    {id:"standard", title:"Quick reaction", subtitle:"See it. Play it.", category:"Reaction", colour:"green", min:1,
      description:"One random board lights up. Hit it to release the next target.", rules:"Hit the lit board. Every correct hit earns a point. Repeated targets are possible."},
    {id:"all", title:"All at once", subtitle:"Clear the whole field.", category:"Reaction", colour:"blue", min:2,
      description:"Several boards light together. Clear them all before the next wave.", rules:"Hit every lit board. Each board has its own timeout. The next wave starts after all targets are hit or expire."},
    {id:"sequence", title:"Sequence", subtitle:"Find your rhythm.", category:"Reaction", colour:"violet", min:2,
      description:"Follow your board order, one pass at a time.", rules:"Boards light in the order entered in setup, then repeat. A missed target advances to the next board."},
    {id:"truefalse", title:"Go / no-go", subtitle:"React. Or hold.", category:"Focus", colour:"coral", min:1,
      description:"Play green. Leave coral alone. Make the right decision.", rules:"Hit green GO targets. Leave coral HOLD targets untouched until they disappear. Correct holds also earn a point; hitting HOLD counts as an error."},
    {id:"focus", title:"Colour focus", subtitle:"Block out the noise.", category:"Focus", colour:"green", min:2,
      description:"Find your chosen colour among the distractions.", rules:"Only hit your chosen colour. Other colours are decoys. One attempt per wave; a wrong hit ends the wave and counts as an error."},
    {id:"odd", title:"Odd one out", subtitle:"Spot the difference.", category:"Focus", colour:"violet", min:3,
      description:"Find the board whose colour breaks the pattern.", rules:"At least three boards light together. Hit the only board with a different colour. One attempt per wave."},
    {id:"command", title:"Coach calls", subtitle:"Look up. Find the pass.", category:"Focus", colour:"blue", min:2,
      description:"Read the board number on the coach screen and find it.", rules:"Every board looks the same. The coach screen names the correct board. Hit only that board. Position the coach screen where the player can see it."},
    {id:"battle", title:"Battle", subtitle:"Make every chance count.", category:"Versus", colour:"coral", min:2,
      description:"Two players. Every missed target gives the opponent a point.", rules:"Board positions 1, 3, 5… belong to Player A; 2, 4, 6… to Player B. One target per player each wave. A miss awards one point to the opponent."},
    {id:"colourbattle", title:"Colour battle", subtitle:"Own your colour.", category:"Versus", colour:"blue", min:2,
      description:"Blue for A. Coral for B. Chase your colour wherever it appears.", rules:"Each wave has one blue A target and one coral B target on random boards. Each hit scores for that colour. Players must follow their own colour; the sensor cannot identify who struck it."},
    {id:"duel", title:"Colour sprint", subtitle:"Two targets. One point.", category:"Versus", colour:"violet", min:2,
      description:"A head-to-head reaction race. The quickest hit wins.", rules:"A uses boards in positions 1, 3, 5…; B uses 2, 4, 6…. Both targets light. The lower reaction time earns a point after both results arrive. Times within 25 ms tie. No hits means no point."},
    {id:"listening", title:"Listen & react", subtitle:"Hear it. Find it.", category:"Focus", colour:"blue", min:2,
      description:"Listen for a board number, then pass to it.", rules:"The coach phone speaks a board number. Targets stay dark. Hit the called board. Turn the coach volume up; this mode requires speech playback on that phone. Timing includes the spoken cue."},
    {id:"homebase", title:"Home base", subtitle:"Go out. Come home.", category:"Reaction", colour:"green", min:2,
      description:"Alternate between your home board and an away target.", rules:"The first board in setup is home. Hit HOME, then a random away board, then HOME again. Each correct hit earns a point."},
    {id:"multi", title:"Parallel play", subtitle:"Two lanes. Keep moving.", category:"Versus", colour:"coral", min:2,
      description:"Two independent reaction games running side by side.", rules:"Positions 1, 3, 5… form lane A; 2, 4, 6… form lane B. Each lane lights its next target independently. Hits score for that lane."}
  ];
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function persist(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }

  function gameArt(game, hero = false) {
    const colour = COLOURS[game.colour].hex, id = game.id;
    const dots = [[75,118],[162,75],[253,111]];
    const node = (x,y,n,c=colour) => '<g><ellipse cx="'+x+'" cy="'+(y+15)+'" rx="23" ry="8" fill="'+c+'" opacity=".13"/><rect x="'+(x-19)+'" y="'+(y-24)+'" width="38" height="49" rx="9" fill="#0b171f" stroke="'+c+'" stroke-width="2"/><rect x="'+(x-13)+'" y="'+(y-17)+'" width="26" height="32" rx="4" fill="'+c+'" opacity=".92"/><text x="'+x+'" y="'+(y+5)+'" font-family="system-ui,sans-serif" font-size="19" font-weight="800" text-anchor="middle" fill="#132025">'+n+'</text></g>';
    let content = '';
    if (id === "sequence" || id === "homebase") content += '<path d="M75 115 Q110 42 162 74 T253 111" fill="none" stroke="'+colour+'" stroke-width="2" stroke-dasharray="5 6"/>';
    if (["battle","colourbattle","duel","multi"].includes(id)) {
      content = '<path d="M164 27V181" stroke="#5e7180" stroke-dasharray="4 8"/>'+node(95,104,"A",COLOURS.blue.hex)+node(230,104,"B",COLOURS.coral.hex)+'<text x="163" y="105" font-family="system-ui" font-size="13" font-weight="800" text-anchor="middle" fill="#d9e7ea">VS</text>';
    } else if (id === "listening") {
      content = node(164,111,"?")+'<path d="M116 55 Q79 96 116 140 M98 38 Q43 96 98 157 M212 55 Q249 96 212 140 M230 38 Q285 96 230 157" fill="none" stroke="'+colour+'" stroke-width="3" opacity=".6"/>';
    } else if (id === "truefalse") {
      content = node(110,95,"✓",COLOURS.green.hex)+node(220,113,"×",COLOURS.coral.hex);
    } else if (id === "standard") {
      content = node(164,91,"1")+'<circle cx="164" cy="90" r="49" fill="none" stroke="'+colour+'" opacity=".25"/><circle cx="164" cy="90" r="69" fill="none" stroke="'+colour+'" opacity=".12"/><path d="M109 172L152 128" stroke="'+colour+'" stroke-width="3" stroke-dasharray="5 5"/>';
    } else {
      dots.forEach(([x,y],i) => content += node(x,y,id === "homebase" && !i ? "H" : i+1,
        ["focus","odd"].includes(id) ? (i===1?colour:COLOURS.blue.hex) : colour));
    }
    return '<svg viewBox="0 0 328 205" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">'+
      '<rect width="328" height="205" fill="#101e2b"/><path d="M0 40L328 205M0 110L181 205M80 0L328 140M200 0L328 69" stroke="#213342" opacity=".55"/>'+
      '<path d="M36 167L94 27H242L304 167Z" fill="#152938" stroke="#345165"/><path d="M65 97H274M164 28V167" stroke="#345165"/><ellipse cx="164" cy="97" rx="37" ry="20" fill="none" stroke="#345165"/>'+content+
      '<circle cx="'+(hero?101:52)+'" cy="175" r="11" fill="#e5eee7"/><path d="M'+(hero?101:52)+' 168l6 4-2 7h-8l-2-7z" fill="#1b343c"/></svg>';
  }

  function installDesign() {
    const style = document.createElement("style");
    style.textContent = `
      :root{--bg:#0b1320;--card:#132131;--line:#293a4c;--text:#eff5f7;--muted:#a2b2c1;--green:#b8f65b}
      html,body{background:#0b1320;color:#eff5f7}
      body{padding:20px 18px 100px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
      button,input,select,summary{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
      button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #b8f65b;outline-offset:4px}
      button{cursor:pointer;transition:background .15s,border-color .15s}button:hover:not(:disabled){border-color:#91b16a}
      button:disabled{cursor:default;opacity:.45}a{color:#b8f65b}
      .rebound-coach{max-width:1060px!important}.rb-brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:850;letter-spacing:-.6px}
      .rb-mark{display:grid;place-items:center;width:32px;height:32px;background:#b8f65b;color:#152113;border-radius:10px;font-size:22px}
      .rb-header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:28px}
      .rb-header .badge{font-size:9px;letter-spacing:.04em;white-space:nowrap;padding:8px 10px}
      .rb-kicker{font-size:10px;letter-spacing:.18em;font-weight:800;text-transform:uppercase;color:#b8f65b}
      .rb-heading{font-size:clamp(30px,6vw,46px);letter-spacing:-1.7px;line-height:1.06;margin:10px 0 12px}
      .rb-muted{color:#a2b2c1;line-height:1.5;font-size:14px}
      .rb-hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);align-items:center;overflow:hidden;border:1px solid #2b4253;border-radius:24px;background:#142635;margin-bottom:22px}
      .rb-hero>*{min-width:0}.rb-hero button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;max-width:100%}
      .rb-hero-copy{padding:28px}.rb-hero svg{width:100%;height:100%;min-height:210px;object-fit:cover}
      .rb-hero button{margin-top:8px;padding:12px 18px;font-size:14px}.rb-hero h2{font-size:30px;letter-spacing:-1px;margin:8px 0}
      .rb-bar{display:flex;gap:8px;overflow-x:auto;padding:4px 0 14px;scrollbar-width:none}
      .rb-filter{border-radius:30px;white-space:nowrap;background:transparent;padding:9px 15px;font-size:12px;color:#aebecb}
      .rb-filter[aria-pressed=true]{background:#b8f65b;color:#182616;border-color:#b8f65b}
      .rb-section-head{display:flex;justify-content:space-between;align-items:center;margin:18px 0 12px}
      .rb-section-head h2{font-size:20px;letter-spacing:-.5px}.rb-section-head span{color:#a2b2c1;font-size:12px}
      .rb-games{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
      .rb-game{position:relative;overflow:hidden;border:1px solid #2b3d4e;border-radius:20px;background:#132131}
      .rb-game-open{display:block;border:0;border-radius:0;padding:0;width:100%;background:transparent;text-align:left;color:inherit;height:100%}
      .rb-game svg{display:block;width:100%;height:auto;aspect-ratio:328/205}
      .rb-game-copy{padding:17px}.rb-tag{font-size:9px;font-weight:850;letter-spacing:.12em;text-transform:uppercase;color:var(--accent,#b8f65b)}
      .rb-game h3{font-size:19px;letter-spacing:-.5px;margin:7px 0}.rb-game p{font-size:12px;color:#a6b7c7;font-weight:400;line-height:1.45;margin:0}
      .rb-game small{display:block;color:#8b9caf;font-size:10px;margin-top:14px}
      .rb-favourite{position:absolute;right:10px;top:10px;background:#0b1320e6;padding:0;border-radius:50%;width:34px;height:34px;color:#e0ebef;font-size:22px;font-weight:400}
      .rb-favourite[aria-pressed=true]{color:#b8f65b;border-color:#7ba44e}
      .rb-nav{position:fixed;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:20;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;width:354px;padding:6px;background:#172534f2;border:1px solid #344b5e;border-radius:20px;box-shadow:0 10px 40px #0008;max-width:calc(100% - 28px)}
      .rb-nav button{border:0;background:none;border-radius:13px;font-size:12px;padding:12px 22px;color:#a9b9c8}.rb-nav button[aria-current=page]{background:#283e4f;color:#c8ff86}
      .rb-back{background:none;border:0;padding:10px 0;margin-bottom:14px;color:#aec1ce;font-size:13px}
      .rb-game-heading{display:grid;grid-template-columns:1fr 230px;gap:22px;align-items:center;margin-bottom:18px}
      .rb-game-heading svg{width:100%;border-radius:20px;border:1px solid #304759}.rb-game-heading h1{font-size:36px;letter-spacing:-1px}
      .rb-panel{background:#132131;border:1px solid #2b3d4e;border-radius:20px;padding:22px;margin:14px 0}
      .rb-panel h2{font-size:18px;letter-spacing:-.4px;margin-bottom:16px}
      .rb-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .rb-field label{display:block;font-size:12px;color:#b6c6d2;margin-bottom:7px}
      .rb-field select,.rb-field input{appearance:auto;width:100%;min-height:47px;border:1px solid #354b5d;border-radius:11px;padding:11px;background:#0e1a28;color:#f0f5f5;font-size:15px;text-align:left}
      .rb-checks{display:flex;flex-wrap:wrap;gap:20px;margin-top:20px;font-size:13px;color:#becbd5}.rb-checks input{accent-color:#b8f65b;width:17px;height:17px;vertical-align:middle}
      .rb-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.rb-chip{font-size:11px;border:1px solid #33495a;border-radius:30px;padding:7px 11px;color:#b9c7d2;background:#0c1a27}.rb-chip.ready{color:#b8f65b;border-color:#567c37}.rb-chip.problem{color:#ffae9e}
      .rb-start{width:100%;background:#b8f65b;color:#15200e;border:0;font-size:16px;margin-top:8px;min-height:52px}
      .rb-status{font-size:13px;line-height:1.5;color:#bac9d3;min-height:20px}
      .rb-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:20px 0}
      .rb-stat{padding:17px 10px;background:#10202e;border:1px solid #2b4050;border-radius:16px;text-align:center}
      .rb-stat span{font-size:9px;letter-spacing:.12em;font-weight:750;color:#8fa5b7;display:block}.rb-stat strong{font-size:20px;white-space:nowrap;letter-spacing:-.7px;display:block;margin-top:7px}
      .rb-live{text-align:center}.rb-live h1{font-size:26px;letter-spacing:-.8px}.rb-cue{font-size:clamp(34px,8vw,58px);font-weight:850;letter-spacing:-2px;color:#b8f65b;margin:30px 0}
      .rb-progress{height:5px;border-radius:5px;background:#263c4e;overflow:hidden;margin:20px 0}.rb-progress i{display:block;height:100%;background:#b8f65b;width:100%;transition:width .2s linear}
      .rb-scoreboard{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.rb-scoreboard div{border:1px solid #415c6a;padding:18px;border-radius:16px;color:#5ec9ff}.rb-scoreboard div+div{color:#ff8775}.rb-scoreboard strong{font-size:36px;display:block}.rb-scoreboard span{font-size:12px}
      .rb-stop{background:#3c2429;border-color:#70404a;color:#ffb7af;min-height:50px;width:100%;margin-top:18px}
      .rb-log{padding:0;list-style:none;text-align:left;max-height:250px;overflow:auto}.rb-log li{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #273b4c;font-size:12px;color:#b6c5d0}
      .rb-results{text-align:center}.rb-results .rb-heading{font-size:36px}.rb-result-list{text-align:left;padding:0;list-style:none}.rb-result-list li{padding:16px 0;border-bottom:1px solid #2b4052}.rb-result-list b{display:block;font-size:15px;margin-bottom:5px}.rb-result-list span{font-size:12px;color:#a6b8c6}
      .rb-empty{padding:24px;border:1px dashed #355063;border-radius:18px;color:#9eb3c3;line-height:1.5;font-size:14px}
      .rb-help{font-size:12px;color:#91a7b8;line-height:1.6}.rb-footer{font-size:10px;color:#758d9f;margin:28px 0;text-align:center}
      .rb-danger{color:#ffb7af}.card{background:#132131;border-color:#293e50}.status,.raw-grid>div{background:#0d1b28}
      @media(max-width:650px){.rb-games{grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.rb-game-copy{padding:13px}.rb-game h3{font-size:17px}.rb-game p{font-size:11px}.rb-hero{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr)}.rb-hero-copy{padding:19px}.rb-hero h2{font-size:24px}.rb-hero .rb-muted{font-size:12px}.rb-hero svg{height:auto;min-height:0;transform:none}.rb-game-heading{grid-template-columns:1fr 120px;gap:12px}.rb-game-heading h1{font-size:29px}.rb-panel{padding:18px}.rb-nav button{padding:12px 10px}.rb-stat strong{font-size:20px}}
      @media(max-width:370px){body{padding-left:12px;padding-right:12px}.rb-brand{font-size:16px}.rb-hero{grid-template-columns:1fr}.rb-hero svg{display:none}.rb-stat strong{font-size:18px}.rb-header .badge{font-size:8px}}
      @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    `;
    document.head.appendChild(style);
  }

  function renderCoach() {
    $("app").classList.add("rebound-coach");
    $("app").innerHTML = `
      <header class="rb-header"><div class="rb-brand"><span class="rb-mark" aria-hidden="true">↗</span>REBOUND<span class="rb-kicker">PLAY</span></div><div id="connectionBadge" class="badge neutral">CONNECTING</div></header>
      <section id="libraryView">
        <div class="rb-kicker">Your training ground</div><h1 class="rb-heading">Read the game.<br>Make your move.</h1>
        <p class="rb-muted">Reaction, focus and friendly competition. Pick a game and get the ball moving.</p>
        <div class="rb-hero"><div class="rb-hero-copy"><div class="rb-kicker">Start here</div><h2>Quick reaction</h2><p class="rb-muted">The original drill.<br>One light. One pass. Go again.</p><button id="heroStart" class="primary">Set up a game ↗</button></div>${gameArt(GAMES[0],true)}</div>
        <div class="rb-section-head"><h2>Game library</h2><span>13 ways to play</span></div>
        <div id="gameFilters" class="rb-bar" aria-label="Filter games">${["All","Reaction","Focus","Versus","Favourites"].map((f,i)=>'<button class="rb-filter" data-filter="'+f+'" aria-pressed="'+(!i)+'">'+f+'</button>').join("")}</div>
        <div id="gameCards" class="rb-games"></div>
      </section>
      <section id="gameView" class="hidden">
        <button id="backGames" class="rb-back">← All games</button>
        <div class="rb-game-heading"><div><div id="gameCategory" class="rb-kicker"></div><h1 id="gameTitle"></h1><p id="gameDescription" class="rb-muted"></p></div><div id="gameIllustration"></div></div>
        <div class="rb-panel"><h2>How to play</h2><p id="gameRules" class="rb-muted"></p></div>
        <div class="rb-panel"><h2>Make it your game</h2>
          <p id="selectedBoards" class="rb-help"></p><button id="editBoards" class="small">Choose boards</button><div id="gamePresence" class="rb-chips"></div>
          <div class="rb-fields">
            <div class="rb-field"><label for="gameDuration">Round length</label><select id="gameDuration"><option value="30">30 seconds</option><option value="60" selected>1 minute</option><option value="120">2 minutes</option><option value="180">3 minutes</option><option value="300">5 minutes</option></select></div>
            <div class="rb-field"><label for="gameTimeout">Target timeout</label><select id="gameTimeout"><option value="2">2 seconds</option><option value="3">3 seconds</option><option value="5" selected>5 seconds</option><option value="10">10 seconds</option><option value="20">20 seconds</option><option value="30">30 seconds</option></select></div>
            <div class="rb-field"><label for="delayMin">Minimum next-target delay</label><select id="delayMin"><option value="0.1">0.1 seconds</option><option value="0.5" selected>0.5 seconds</option><option value="1">1 second</option><option value="2">2 seconds</option></select></div>
            <div class="rb-field"><label for="delayMax">Maximum next-target delay</label><select id="delayMax"><option value="0.1">0.1 seconds</option><option value="0.5" selected>0.5 seconds</option><option value="1">1 second</option><option value="2">2 seconds</option><option value="3">3 seconds</option></select></div>
            <div class="rb-field"><label for="startDelay">Start countdown</label><select id="startDelay"><option value="0">None</option><option value="3" selected>3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select></div>
            <div class="rb-field"><label for="gameColour">Target / focus colour</label><select id="gameColour">${Object.keys(COLOURS).filter(k=>k!=="white").map(k=>'<option value="'+k+'">'+COLOURS[k].name+'</option>').join("")}</select></div>
            <div id="targetCountField" class="rb-field"><label for="targetCount">Targets per wave</label><select id="targetCount"><option value="0">All selected boards</option><option value="2">2 boards</option><option value="3">3 boards</option><option value="4">4 boards</option></select></div>
          </div>
          <div class="rb-checks"><label><input id="cueSound" type="checkbox"> Light sound</label><label><input id="hitSound" type="checkbox"> Hit sound</label></div>
          <p class="rb-help">Board sensitivity and debounce stay in Settings on each board phone. Keep the coach screen open while playing.</p>
          <p id="gameReady" class="rb-status" role="status"></p><button id="startGame" class="rb-start" disabled>Start game</button>
        </div>
      </section>
      <section id="liveView" class="hidden rb-live">
        <div class="rb-kicker">Session in progress</div><h1 id="liveTitle"></h1>
        <div class="rb-progress"><i id="gameProgress"></i></div><div id="liveCue" class="rb-cue" role="status">Ready</div>
        <p id="liveMessage" class="rb-status" role="status"></p>
        <div class="rb-stats"><div class="rb-stat"><span>TIME LEFT</span><strong id="timeLeft">60s</strong></div><div class="rb-stat"><span>HITS</span><strong id="sessionHits">0</strong></div><div class="rb-stat"><span>AVERAGE</span><strong id="sessionAverage">—</strong></div></div>
        <div id="liveScoreboard" class="rb-scoreboard"><div><span>PLAYER A · BLUE</span><strong id="scoreA">0</strong></div><div><span>PLAYER B · CORAL</span><strong id="scoreB">0</strong></div></div>
        <div class="rb-stats"><div class="rb-stat"><span>POINTS</span><strong id="sessionPoints">0</strong></div><div class="rb-stat"><span>MISSES</span><strong id="sessionMisses">0</strong></div><div class="rb-stat"><span>ERRORS</span><strong id="sessionErrors">0</strong></div></div>
        <ul id="liveLog" class="rb-log"></ul><button id="stopGame" class="rb-stop">Stop game</button>
      </section>
      <section id="resultsView" class="hidden rb-results"><div class="rb-kicker">Session complete</div><h1 id="resultsTitle" class="rb-heading"></h1><p id="resultsReason" class="rb-muted"></p><div id="resultsBody"></div><button id="playAgain" class="rb-start">Play again</button><button id="resultsGames" class="rb-back">← Choose another game</button></section>
      <section id="boardsView" class="hidden"><div class="rb-kicker">Your equipment</div><h1 class="rb-heading">Boards & controls</h1><div class="rb-panel"><h2>Boards in this session</h2><div class="rb-field"><label for="boardList">Board numbers, in playing order</label><input id="boardList" type="text" value="1, 2" autocomplete="off"></div><p class="rb-help">For example: 1, 2. Home base uses the first number. Two-player lanes alternate through this list.</p><div id="boardPresenceList" class="rb-chips"></div><p id="boardsMessage" class="rb-status"></p><button id="returnGame" class="primary">Back to game setup</button></div>
        <div class="rb-panel"><h2>Manual target</h2><div class="rb-field"><label for="coachBoard">Board number</label><input id="coachBoard" type="number" min="1" max="99" value="1"></div><div class="button-grid" style="margin-top:16px"><button id="lightBoard" class="primary" disabled>Light target</button><button id="offBoard" disabled>Turn off</button></div><p id="coachMessage" class="rb-status" role="status">Open a target on the board phone to get ready.</p><p id="reaction" class="rb-muted">—</p></div><a href="?board=1">Open this phone as a board ↗</a>
      </section>
      <section id="historyView" class="hidden"><div class="rb-kicker">Your progress</div><h1 class="rb-heading">Recent sessions</h1><p class="rb-muted">Your last 20 sessions, saved on this coach phone.</p><ul id="historyList" class="rb-result-list"></ul></section>
      <p class="rb-footer">REBOUND PLAY · v${APP_VERSION}</p>
      <nav id="mainNav" class="rb-nav" aria-label="Main navigation"><button data-view="libraryView" aria-current="page">Games</button><button data-view="boardsView">Boards</button><button data-view="historyView">History</button></nav>
      <div id="status" class="hidden"></div>`;
  }

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
  let motionSeen = false, startingBoard = false, motionCheckTimer = null;
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

  $("enableSensor").addEventListener("click", () => startBoard(true));
  $("wakeButton").addEventListener("click", () => requestWakeLock());
  $("resetButton").addEventListener("click", resetReadings);
  $("calibrateButton").addEventListener("click", startCalibration);
  $("targetButton").addEventListener("click", () => startBoard(true));
  $("target").addEventListener("click", closeTarget);

  document.addEventListener("visibilitychange", async () => {
    if (coachMode) return;
    if (document.visibilityState === "visible" && wakeLock === null && $("wakeButton").dataset.enabled === "1") {
      await requestWakeLock(true);
    }
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  async function enableSensor(){
    if (sensorEnabled) return true;
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
      return true;
    } catch(err) {
      setStatus("Sensor error: " + err.message, true);
      return false;
    }
  }

  function requestBoardFullscreen() {
    if (document.fullscreenElement) return;
    try { document.documentElement.requestFullscreen?.()?.catch(()=>{}); } catch {}
  }

  async function startBoard(userInitiated) {
    if (coachMode || startingBoard || document.visibilityState === "hidden") return;
    if (calibrating) {
      setStatus("Finish calibration before opening the target.", true);
      return;
    }
    startingBoard = true;
    $("targetButton").disabled = true;
    try {
      if (userInitiated) unlockAudio();
      if (!await enableSensor() || document.visibilityState === "hidden") return;
      openTarget();
      $("targetButton").textContent = "Return to target";
      // Automatic page startup cannot request browser fullscreen or unlock sound.
      if (userInitiated) requestBoardFullscreen();
      $("wakeButton").dataset.enabled = "1";
      requestWakeLock(true);
      clearTimeout(motionCheckTimer);
      if (!motionSeen) motionCheckTimer = setTimeout(() => {
        if (motionSeen || !targetOpen) return;
        closeTarget();
        $("targetButton").textContent = "Start board";
        setStatus("No motion data received. Allow motion sensors in this browser, then tap Start board. If this phone has no motion sensor, use another phone.", true);
      }, 4000);
    } finally {
      startingBoard = false;
      $("targetButton").disabled = false;
    }
  }

  function autoStartBoard() {
    if (document.visibilityState === "hidden") {
      const whenVisible = () => {
        if (document.visibilityState !== "visible") return;
        document.removeEventListener("visibilitychange", whenVisible);
        autoStartBoard();
      };
      document.addEventListener("visibilitychange", whenVisible);
      return;
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      setStatus("Tap Start board and allow motion access. The target opens automatically after permission is granted.");
      return;
    }
    startBoard(false);
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

    if (!motionSeen) {
      motionSeen = true;
      clearTimeout(motionCheckTimer);
      publishReady();
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
    if (trial && now >= trial.deadline) {
      disarm("WAIT");
      reportResult(trial.id, { state: "timeout" }).catch(networkError);
    } else if (trial) {
      const reactionMs = Math.max(0, Math.round(now - trial.started));
      if (trial.hitSound) playTone(760);
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

  async function requestWakeLock(quiet = false){
    if (wakeLock) return;
    try{
      if (!("wakeLock" in navigator)) throw new Error("Wake Lock is not supported by this browser.");
      wakeLock = await navigator.wakeLock.request("screen");
      $("wakeButton").dataset.enabled = "1";
      $("wakeButton").textContent = "Screen will stay awake";
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }catch(err){
      $("wakeButton").textContent = "Keep screen awake";
      if (!quiet) setStatus("Wake lock unavailable: " + err.message + " Set Android's screen timeout manually.", true);
    }
  }

  function setupBoardSettings() {
    // Move the existing controls so their values and event listeners stay intact.
    const detection = $("threshold").closest("section");
    const diagnostics = $("xVal").closest("section");
    const targetCard = $("targetButton").closest("section");
    const settingsMenu = document.createElement("details");
    settingsMenu.id = "boardSettings";
    settingsMenu.className = "card";

    const summary = document.createElement("summary");
    summary.textContent = "Settings";
    summary.style.cssText = "cursor:pointer;font-size:18px;font-weight:750;padding:10px 0;min-height:44px";
    settingsMenu.appendChild(summary);

    const help = document.createElement("p");
    help.className = "help";
    help.textContent = "Changes save automatically on this phone. Lower the hit threshold for more sensitivity. Increase debounce if one strike counts more than once.";
    settingsMenu.appendChild(help);

    for (const section of [detection, diagnostics]) {
      section.classList.remove("card");
      section.style.cssText = "margin-top:20px";
      settingsMenu.appendChild(section);
    }
    targetCard.after(settingsMenu);
    const sensitivityLabel = detection.querySelector(".slider-label");
    sensitivityLabel.setAttribute("for", "threshold");
    sensitivityLabel.querySelector("span").textContent = "Sensitivity (hit threshold)";
    $("debounceLabel").closest("label").setAttribute("for", "debounce");
    $("resetButton").textContent = "Reset readings";

    // Keep one startup action at the top; preserve the existing controls/listeners.
    $("enableSensor").before($("targetButton"));
    $("enableSensor").style.display = "none";
    const helpText = targetCard.querySelector(".help");
    helpText.textContent = "This phone starts its sensor and opens the target automatically when allowed. Tap the target to return here for Settings.";
    $("status").after(helpText);
    targetCard.remove();

    const extras = document.createElement("button");
    extras.id = "targetExtras";
    extras.type = "button";
    extras.textContent = "Enable sound / fullscreen";
    extras.style.cssText = "position:absolute;top:max(16px,env(safe-area-inset-top));right:16px;z-index:3;min-height:44px;padding:10px 16px;border:1px solid #657080;border-radius:24px;background:#15212c;color:#fff;font:600 14px system-ui";
    extras.addEventListener("click", event => {
      event.stopPropagation();
      unlockAudio();
      requestBoardFullscreen();
      requestWakeLock(true);
      extras.style.display = "none";
    });
    $("target").appendChild(extras);
  }

  function openTarget(){
    if (targetOpen) return;
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
    readyToken = newCommandId();
    disarm("WAIT");
    publishReady();
    $("targetExtras").style.display = "";
  }

  function closeTarget(){
    clearTimeout(motionCheckTimer);
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
        update(sessionRef, {
          readyToken: targetOpen && sensorEnabled && motionSeen ? readyToken : null,
          debounceMs: Number($("debounce").value),
          protocol: 2, version: APP_VERSION
        }).catch(networkError);
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
          if (targetOpen) readyToken = newCommandId();
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
          await set(session, { connectedAt: serverTimestamp(), readyToken: targetOpen && motionSeen ? readyToken : null, protocol: 2, version: APP_VERSION });
          await update(ref(db, boardPath), {
            boardId: activeBoardId, lastSeen: serverTimestamp()
          });
          if (thisGeneration !== generation) return;
          firebaseReady = true;
          if (targetOpen && !armed) disarm("WAIT");
          publishReady();
          showConnection("ONLINE • BOARD " + activeBoardId, "#16833b");
        })().catch(err => {
          if (thisGeneration !== generation) return;
          firebaseReady = false;
          if (targetOpen) disarm("OFFLINE");
          showConnection("FIREBASE ERROR", "#8b2d2d");
          setStatus("Firebase: " + err.message + " Local sensor testing still works.", true);
        });
      });
    } catch (err) {
      if (targetOpen) disarm("OFFLINE");
      showConnection("LOCAL ONLY", "#8b2d2d");
      setStatus("Firebase could not load: " + err.message + " Refresh to retry. Local testing still works.", true);
    }
  }


  function startCoach(sdk, db) {
    const {ref, onValue, set, serverTimestamp} = sdk;
    let connected = false, selected = GAMES[0], filter = "All", run = null, manualBoard = "1";
    const savedBoards = stored("rebound-play-boards", ["1","2"]);
    let boardIds = Array.isArray(savedBoards) && savedBoards.length && savedBoards.every(validBoardId) ?
      [...new Set(savedBoards.map(String))] : ["1","2"];
    let favourites = stored("rebound-play-favourites", []);
    if (!Array.isArray(favourites)) favourites = [];
    let history = stored("rebound-play-history", []);
    if (!Array.isArray(history)) history = [];
    history = history.filter(x => x && typeof x.title === "string" && Number.isFinite(x.hits)).slice(0,20);
    const presence = new Map(), watchers = new Map(), offWrites = new Map();
    const now = () => performance.now();
    const ready = id => {
      const p = presence.get(id);
      return p && p.protocol >= 2 && p.token && !p.duplicate ? p.token : null;
    };
    const rand = list => list[Math.floor(Math.random() * list.length)];
    function shuffled(list) {
      const out = list.slice();
      for (let i=out.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1)); [out[i],out[j]]=[out[j],out[i]];}
      return out;
    }
    const groupBoards = (r, side) => r.boards.filter((_,i) => i%2 === side);
    const seconds = ms => (ms/1000).toFixed(3) + " s";
    const isVersus = r => r.game.category === "Versus";
    const choiceMode = r => ["focus","odd","command","listening"].includes(r.game.id);
    function view(id) {
      for (const name of ["libraryView","gameView","liveView","resultsView","boardsView","historyView"]) {
        $(name).classList.toggle("hidden", name !== id);
      }
      $("mainNav").classList.toggle("hidden", id === "liveView");
      document.querySelectorAll("[data-view]").forEach(b => {
        if (b.dataset.view === id || (["gameView","resultsView"].includes(id) && b.dataset.view === "libraryView")) b.setAttribute("aria-current","page");
        else b.removeAttribute("aria-current");
      });
      window.scrollTo({top:0,behavior:"auto"});
    }
    function cards() {
      const list = GAMES.filter(g => filter === "All" || g.category === filter || (filter === "Favourites" && favourites.includes(g.id)));
      $("gameCards").innerHTML = list.map(g => '<article class="rb-game" style="--accent:'+COLOURS[g.colour].hex+'"><button class="rb-game-open" data-game="'+g.id+'" aria-label="Set up '+g.title+'">'+gameArt(g)+'<div class="rb-game-copy"><div class="rb-tag">'+g.category+'</div><h3>'+g.title+'</h3><p>'+g.subtitle+'</p><small>'+g.min+'+ boards · '+(g.category==="Versus"?"2 players":"Solo / team")+' ↗</small></div></button><button class="rb-favourite" data-favourite="'+g.id+'" aria-label="Favourite '+g.title+'" aria-pressed="'+favourites.includes(g.id)+'">'+(favourites.includes(g.id)?"♥":"♡")+'</button></article>').join("") || '<p class="rb-empty">Tap the heart on a game to keep it here.</p>';
    }
    function configuration() {
      const number = (id, low, high) => Math.max(low, Math.min(high, Number($(id).value) || low));
      return {
        duration: number("gameDuration",30,300)*1000, timeout:number("gameTimeout",2,30)*1000,
        delayMin:number("delayMin",0.1,3)*1000, delayMax:number("delayMax",0.1,3)*1000,
        countdown:number("startDelay",0,10)*1000, colour:COLOURS[$("gameColour").value]?$("gameColour").value:"green",
        count:number("targetCount",0,99), sound:$("cueSound").checked, hitSound:$("hitSound").checked
      };
    }
    function whyNot() {
      if (!connected) return "Waiting for the coach connection.";
      if (offWrites.size) return "Finishing the previous target. Start will unlock when it is off.";
      if (boardIds.length < selected.min) return selected.title + " needs at least " + selected.min + " different boards.";
      if (!boardIds.every(id=>ready(id))) return "Every selected board must be ready. Check Boards for its status.";
      if (selected.id === "listening" && (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window))) return "Speech playback is unavailable in this browser.";
      const config = configuration();
      if (config.delayMax < config.delayMin) return "Maximum delay must be at least the minimum delay.";
      if (selected.id === "all" && config.count > boardIds.length) return "Choose no more targets than the number of selected boards.";
      return "";
    }
    function buttons() {
      const busy = !!run || offWrites.size > 0;
      $("startGame").disabled = busy || !!whyNot();
      $("gameReady").textContent = run ? "A game is running." : whyNot() || "Ready to play.";
      $("boardList").disabled = busy; $("coachBoard").disabled = busy;
      $("lightBoard").disabled = busy || !connected || !ready(manualBoard);
      $("offBoard").disabled = !run?.manual;
      $("playAgain").disabled = busy;
    }
    function showPresence() {
      const text = id => {
        const p = presence.get(id);
        return !p ? "checking" : p.duplicate ? "duplicate board ID" : p.token && p.protocol < 2 ? "update to v0.5.0" :
          ready(id) ? "ready" : p.online ? "open target" : "offline";
      };
      const markup = boardIds.map(id=>'<span class="rb-chip '+(ready(id)?"ready":"problem")+'">Board '+id+' · '+text(id)+'</span>').join("");
      $("boardPresenceList").innerHTML = $("gamePresence").innerHTML = markup;
      $("selectedBoards").textContent = "Playing boards: " + (boardIds.join(" → ") || "none selected");
      $("boardsMessage").textContent = boardIds.length ? "Enable each board’s sensor and leave its target open." : "Enter different board numbers from 1 to 99.";
      buttons();
    }
    function watchBoards() {
      watchers.forEach(fn=>fn()); watchers.clear(); presence.clear();
      for (const id of new Set([...boardIds,manualBoard])) {
        const updatePresence = value => {
          const sessions = Object.values(value || {}).filter(s=>s && typeof s === "object");
          const usable = sessions.filter(s=>typeof s.readyToken === "string" && s.readyToken);
          const p = usable.length===1 ? usable[0] : null;
          presence.set(id,{online:sessions.length>0,duplicate:usable.length>1,token:p?.readyToken,protocol:p?.protocol||0,
            debounce:Math.max(150,Math.min(1500,Number(p?.debounceMs)||1500))});
          if (run?.tokens[id] && ready(id)!==run.tokens[id]) endRun("Stopped: Board "+id+" is no longer ready.");
          showPresence();
        };
        watchers.set(id,onValue(ref(db,"boards/"+id+"/connections"),snap=>updatePresence(snap.val()),()=>updatePresence(null)));
      }
      showPresence();
    }
    function chooseGame(id) {
      if (run) return;
      selected = GAMES.find(g=>g.id===id) || GAMES[0];
      $("gameTitle").textContent=selected.title;
      $("gameDescription").textContent=selected.description;
      $("gameCategory").textContent=selected.category+" · "+selected.min+"+ boards";
      $("gameRules").textContent=selected.rules;
      $("gameIllustration").innerHTML=gameArt(selected);
      $("targetCountField").classList.toggle("hidden",selected.id!=="all");
      $("gameColour").disabled=!["standard","all","sequence","focus","homebase"].includes(selected.id);
      buttons(); view("gameView");
    }
    function later(r,fn,ms) {
      const timer=setTimeout(()=>{r.timers.delete(timer); if(run===r) fn();},Math.max(0,ms));
      r.timers.add(timer); return timer;
    }
    function stats(r) {
      $("timeLeft").textContent=Math.ceil(Math.max(0,r.endsAt-now())/1000)+"s";
      $("sessionHits").textContent=String(r.times.length);
      $("sessionAverage").textContent=r.times.length?seconds(r.times.reduce((a,b)=>a+b,0)/r.times.length):"—";
      $("sessionPoints").textContent=String(r.points); $("sessionMisses").textContent=String(r.misses); $("sessionErrors").textContent=String(r.errors);
      $("scoreA").textContent=String(r.scores[0]); $("scoreB").textContent=String(r.scores[1]);
      $("gameProgress").style.width=Math.max(0,Math.min(100,(r.endsAt-now())/r.config.duration*100))+"%";
    }
    function log(r,label,value) {
      r.log.unshift({label,value}); r.log=r.log.slice(0,12);
      $("liveLog").innerHTML=r.log.map(x=>"<li><span>"+esc(x.label)+"</span><b>"+esc(x.value)+"</b></li>").join("");
    }
    function off(cue) {
      cue.unwatch?.(); clearTimeout(cue.responseTimer);
      const pending = {id:cue.id};
      offWrites.set(cue.board,pending); buttons();
      const release=()=>{if(offWrites.get(cue.board)!==pending)return; clearTimeout(pending.timer);offWrites.delete(cue.board);buttons();};
      pending.timer=setTimeout(release,Math.max(0,cue.expiresAt-serverNow())+1500);
      set(ref(db,"controls/"+cue.board+"/command"),{id:newCommandId(),action:"off",readyToken:cue.token,targetCommandId:cue.id})
        .then(release).catch(()=>{$("gameReady").textContent="A light-off confirmation failed. Waiting for that target to expire.";});
    }
    function historyMarkup(result) {
      return "<li><b>"+esc(result.title)+"</b><span>"+esc(new Date(result.date).toLocaleString())+" · "+result.hits+" hits · "+(result.average==null?"No hit times":esc(seconds(result.average))+" average")+"<br>"+esc(result.reason)+"</span></li>";
    }
    function showHistory() {
      $("historyList").innerHTML=history.length?history.map(historyMarkup).join(""):'<li class="rb-empty">Your first completed session will appear here.</li>';
    }
    function endRun(reason) {
      if(!run)return;
      const r=run; run=null;
      r.timers.forEach(clearTimeout); r.timers.clear();
      r.active.forEach(cue=>off(cue)); r.active.clear();
      if("speechSynthesis" in window) window.speechSynthesis.cancel();
      if(r.manual){$("coachMessage").textContent=reason;buttons();return;}
      const total=r.times.reduce((a,b)=>a+b,0);
      const result={title:r.game.title,id:r.game.id,date:Date.now(),hits:r.times.length,average:r.times.length?total/r.times.length:null,
        fastest:r.times.length?Math.min(...r.times):null,slowest:r.times.length?Math.max(...r.times):null,
        points:r.points,misses:r.misses,errors:r.errors,scores:r.scores.slice(),reason,elapsed:Math.max(0,Math.min(r.config.duration,now()-r.startsAt))};
      history.unshift(result);history=history.slice(0,20);persist("rebound-play-history",history);showHistory();
      $("resultsTitle").textContent=r.game.title;
      $("resultsReason").textContent=reason;
      const metric=(name,value)=>'<div class="rb-stat"><span>'+name+'</span><strong>'+value+'</strong></div>';
      $("resultsBody").innerHTML='<div class="rb-stats">'+metric("HITS",result.hits)+metric("AVERAGE",result.average==null?"—":seconds(result.average))+metric("POINTS",result.points)+'</div><div class="rb-stats">'+metric("FASTEST",result.fastest==null?"—":seconds(result.fastest))+metric("MISSES",result.misses)+metric("ERRORS",result.errors)+'</div>'+
        (isVersus(r)?'<div class="rb-scoreboard"><div><span>PLAYER A</span><strong>'+r.scores[0]+'</strong></div><div><span>PLAYER B</span><strong>'+r.scores[1]+'</strong></div></div><p class="rb-muted">'+(r.scores[0]===r.scores[1]?"Draw":r.scores[0]>r.scores[1]?"Player A wins":"Player B wins")+'</p>':'')+
        '<p class="rb-help">'+Math.round(result.elapsed/1000)+' seconds played. Reaction times are measured on each board phone.</p>';
      view("resultsView");buttons();
    }
    function closeWave(r,wave) {
      if(wave.done || run!==r)return;
      wave.done=true;
      for(const cue of wave.cues) {
        if(!cue.done){cue.done=true;r.active.delete(cue.board);off(cue);}
      }
      if(r.game.id==="duel"){
        const landed=wave.cues.filter(c=>c.result?.state==="hit").sort((a,b)=>a.result.reactionMs-b.result.reactionMs);
        if(landed.length && !(landed.length>1 && Math.abs(landed[0].result.reactionMs-landed[1].result.reactionMs)<=25)){
          r.scores[landed[0].side]++;r.points++;log(r,"Sprint winner",landed[0].side===0?"Player A":"Player B");
        } else if(landed.length) log(r,"Sprint result","Tie");
      }
      stats(r);
      if(r.manual){endRun("Target finished. Light off.");return;}
      queueWave(r,wave.channel);
    }
    function queueWave(r,channel,initial=false) {
      const delay=initial?0:r.config.delayMin+Math.random()*(r.config.delayMax-r.config.delayMin);
      if(r.game.id!=="multi") $("liveCue").textContent="Next target…";
      later(r,()=>launchWave(r,channel),delay);
    }
    function specifications(r,channel) {
      const ids=r.boards, mode=r.game.id, colour=r.config.colour;
      const spec=(board,extra={})=>({board,colour,label:"GO",correct:true,...extra});
      if(mode==="multi")return [spec(rand(groupBoards(r,channel)),{side:channel,colour:channel?"coral":"blue",label:channel?"B":"A"})];
      if(mode==="battle" || mode==="duel")return [0,1].map(side=>spec(rand(groupBoards(r,side)),{side,colour:side?"coral":"blue",label:side?"B":"A"}));
      if(mode==="colourbattle")return shuffled(ids).slice(0,2).map((id,side)=>spec(id,{side,colour:side?"coral":"blue",label:side?"B":"A"}));
      if(mode==="all")return shuffled(ids).slice(0,r.config.count||ids.length).map(id=>spec(id));
      if(mode==="sequence")return [spec(ids[(r.sequence++)%ids.length])];
      if(mode==="homebase"){const home=(r.sequence++ % 2)===0;return [spec(home?ids[0]:rand(ids.slice(1)),{label:home?"HOME":"GO"})];}
      if(mode==="truefalse"){const correct=Math.random()<.65;return [spec(rand(ids),{correct,colour:correct?"green":"coral",label:correct?"GO":"HOLD"})];}
      if(choiceMode(r)){
        const target=rand(ids), other=rand(Object.keys(COLOURS).filter(c=>c!==colour && c!=="white"));
        return ids.map(id=>spec(id,{correct:id===target,
          colour:["command","listening"].includes(mode)?"white":id===target?colour:other,
          label:mode==="listening"?"LISTEN":mode==="command"?"READY":COLOURS[id===target?colour:other].name.toUpperCase(),
          dark:mode==="listening"}));
      }
      return [spec(rand(ids))];
    }
    function launchWave(r,channel) {
      if(run!==r)return;
      if(now()>=r.endsAt){endRun("Round complete.");return;}
      const ids=r.game.id==="multi"?groupBoards(r,channel):r.boards;
      const availableAt=Math.max(now(),...ids.map(id=>r.cooldown[id]||0));
      if(ids.some(id=>offWrites.has(id)) || availableAt>now()){
        later(r,()=>launchWave(r,channel),Math.max(100,availableAt-now()));return;
      }
      const wave={channel,done:false,cues:[],spoken:false};
      const specs=specifications(r,channel);
      const expiry=serverNow()+Math.min(r.config.timeout,r.endsAt-now());
      wave.cues=specs.map(s=>({...s,id:newCommandId(),token:r.tokens[s.board],expiresAt:expiry,done:false,lit:false,wave}));
      if(r.game.id==="command")$("liveCue").textContent="Board "+specs.find(s=>s.correct).board;
      else if(r.game.id==="listening")$("liveCue").textContent="Listen…";
      else if(r.game.id==="focus")$("liveCue").textContent="Find "+COLOURS[r.config.colour].name;
      else if(r.game.id==="odd")$("liveCue").textContent="Find the odd colour";
      else if(isVersus(r))$("liveCue").textContent="A  /  B";
      else $("liveCue").textContent=r.game.id==="all"?"Clear the targets":specs[0].label==="HOLD"?"Hold your pass":specs[0].label==="HOME"?"Return home":"Play the light";
      $("liveMessage").textContent="Waiting for the boards…";
      // Register all cues before sending any, so fast responses cannot finish a partial wave.
      wave.cues.forEach(cue=>r.active.set(cue.board,cue));
      for(const cue of wave.cues) {
        cue.unwatch=onValue(ref(db,"controls/"+cue.board+"/results/"+cue.id),snap=>{
          if(run!==r || cue.done || wave.done)return;
          const result=snap.val();if(!result)return;
          if(now()>=r.endsAt){endRun("Round complete.");return;}
          if(result.state==="lit"){
            cue.lit=true;
            if(wave.cues.every(c=>c.lit || c.done)){
              $("liveMessage").textContent="Targets ready.";
              if(r.game.id==="listening" && !wave.spoken){
                wave.spoken=true;
                const words=new SpeechSynthesisUtterance("Board "+wave.cues.find(c=>c.correct).board);
                words.onerror=()=>{if(run===r && !wave.done)endRun("Stopped: speech playback failed. Check the coach volume and browser.");};
                window.speechSynthesis.speak(words);
              }
            }
            if(r.manual)$("coachMessage").textContent="Board "+cue.board+" is lit.";
            return;
          }
          if(!["hit","timeout","cancelled"].includes(result.state))return;
          if(result.state==="cancelled"){endRun("Stopped: a board target was closed or replaced.");return;}
          if(result.state==="hit" && (!Number.isFinite(result.reactionMs)||result.reactionMs<0||result.reactionMs>35000)){
            endRun("Stopped: invalid reaction time from a board.");return;
          }
          cue.done=true;cue.result=result;cue.unwatch?.();clearTimeout(cue.responseTimer);r.active.delete(cue.board);
          if(result.state==="hit"){
            r.cooldown[cue.board]=now()+(presence.get(cue.board)?.debounce||1500)+100;
            if(cue.correct){
              r.times.push(result.reactionMs);
              if(!["battle","duel"].includes(r.game.id))r.points++;
              if(["colourbattle","multi"].includes(r.game.id))r.scores[cue.side]++;
              log(r,"Board "+cue.board,seconds(result.reactionMs));
              $("reaction").textContent=seconds(result.reactionMs);
            }else{r.errors++;log(r,"Board "+cue.board,"Wrong target");}
          }else{
            if(r.game.id==="truefalse" && !cue.correct){r.points++;log(r,"Board "+cue.board,"Correct hold");}
            else if(cue.correct){r.misses++;if(r.game.id==="battle"){r.scores[1-cue.side]++;r.points++;}log(r,"Board "+cue.board,"Miss");}
          }
          stats(r);
          if(choiceMode(r) && (result.state==="hit" || cue.correct))closeWave(r,wave);
          else if(wave.cues.every(c=>c.done))closeWave(r,wave);
        },()=>{if(run===r)endRun("Stopped: a board response could not be read.");});
        cue.responseTimer=setTimeout(()=>{if(run===r&&!cue.done)endRun("Stopped: no response from Board "+cue.board+".");},Math.max(0,expiry-serverNow())+1500);
        set(ref(db,"controls/"+cue.board+"/command"),{
          id:cue.id,action:"light",readyToken:cue.token,issuedAt:serverTimestamp(),expiresAt:expiry,
          colour:cue.colour,label:cue.label,dark:!!cue.dark,lightSound:r.config.sound && !cue.dark,hitSound:r.config.hitSound
        }).catch(()=>{if(run===r&&!cue.done)endRun("Stopped: the light command failed.");});
      }
    }
    function start(manual=false) {
      if(run || offWrites.size || !connected || document.visibilityState==="hidden")return;
      if(!manual && whyNot())return;
      if(manual && !ready(manualBoard))return;
      unlockAudio();
      const game=manual?GAMES[0]:selected;
      const config=manual?{duration:30000,timeout:30000,delayMin:500,delayMax:500,countdown:0,colour:"green",count:1,sound:false,hitSound:false}:configuration();
      const ids=manual?[manualBoard]:boardIds.slice();
      const r={game,config,boards:ids,tokens:Object.fromEntries(ids.map(id=>[id,ready(id)])),manual,
        startsAt:now()+config.countdown,endsAt:now()+config.countdown+config.duration,active:new Map(),timers:new Set(),
        cooldown:{},sequence:0,times:[],scores:[0,0],points:0,misses:0,errors:0,log:[]};
      run=r;buttons();stats(r);$("liveLog").innerHTML="";
      $("liveTitle").textContent=game.title;
      $("liveScoreboard").classList.toggle("hidden",!isVersus(r));
      if(!manual)view("liveView");
      if(game.id==="listening"){
        const readyWords=new SpeechSynthesisUtterance("Ready");
        readyWords.onerror=()=>{if(run===r)endRun("Stopped: speech playback is unavailable.");};
        window.speechSynthesis.speak(readyWords);
      }
      let launched=false;
      const tick=()=>{
        if(run!==r)return;
        if(now()<r.startsAt){$("liveCue").textContent=String(Math.ceil((r.startsAt-now())/1000));$("liveMessage").textContent="Get ready."; $("timeLeft").textContent=Math.ceil(config.duration/1000)+"s";}
        else{
          if(!launched){launched=true;launchWave(r,0);if(game.id==="multi"&&run===r)launchWave(r,1);}
          if(run!==r)return;
          stats(r);
          if(now()>=r.endsAt){endRun("Round complete.");return;}
        }
        later(r,tick,100);
      };
      tick();
    }
    onValue(ref(db,".info/connected"),snap=>{
      connected=snap.val()===true;
      showConnection(connected?"COACH ONLINE":"COACH OFFLINE",connected?"#24482b":"#61332e");
      if(!connected && run)endRun("Stopped: coach connection lost.");
      buttons();
    });
    $("heroStart").addEventListener("click",()=>chooseGame("standard"));
    $("gameCards").addEventListener("click",event=>{
      const favourite=event.target.closest("[data-favourite]"),game=event.target.closest("[data-game]");
      if(favourite){const id=favourite.dataset.favourite;favourites=favourites.includes(id)?favourites.filter(x=>x!==id):[...favourites,id];persist("rebound-play-favourites",favourites);cards();}
      else if(game)chooseGame(game.dataset.game);
    });
    $("gameFilters").addEventListener("click",event=>{
      const button=event.target.closest("[data-filter]");if(!button)return;
      filter=button.dataset.filter;document.querySelectorAll("[data-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));cards();
    });
    $("mainNav").addEventListener("click",event=>{
      const button=event.target.closest("[data-view]");if(!button||run)return;
      if(button.dataset.view==="historyView")showHistory();view(button.dataset.view);
    });
    for(const id of ["backGames","resultsGames"])$(id).addEventListener("click",()=>view("libraryView"));
    $("editBoards").addEventListener("click",()=>view("boardsView"));
    $("returnGame").addEventListener("click",()=>chooseGame(selected.id));
    $("playAgain").addEventListener("click",()=>chooseGame(selected.id));
    $("startGame").addEventListener("click",()=>start());
    $("stopGame").addEventListener("click",()=>endRun("Round stopped."));
    $("lightBoard").addEventListener("click",()=>start(true));
    $("offBoard").addEventListener("click",()=>{if(run?.manual)endRun("Target switched off.");});
    $("boardList").value=boardIds.join(", ");
    $("boardList").addEventListener("input",()=>{
      if(run||offWrites.size)return;
      const values=$("boardList").value.trim().split(/[\s,]+/);
      boardIds=values.every(validBoardId) && new Set(values).size===values.length?values:[];
      if(boardIds.length)persist("rebound-play-boards",boardIds);
      watchBoards();
    });
    $("coachBoard").addEventListener("change",()=>{
      if(run||offWrites.size)return;
      const value=$("coachBoard").value.trim();
      if(!validBoardId(value)){$("coachBoard").value=manualBoard;return;}
      manualBoard=value;watchBoards();
    });
    const optionIds=["gameDuration","gameTimeout","delayMin","delayMax","startDelay","gameColour","targetCount","cueSound","hitSound"];
    const options=stored("rebound-play-options",{});
    for(const id of optionIds){
      if(options && typeof options==="object" && id in options){
        if($(id).type==="checkbox")$(id).checked=options[id]===true;
        else if([...$(id).options].some(o=>o.value===String(options[id])))$(id).value=String(options[id]);
      }
      $(id).addEventListener("change",()=>{const values={};optionIds.forEach(key=>values[key]=$(key).type==="checkbox"?$(key).checked:$(key).value);persist("rebound-play-options",values);buttons();});
    }
    const leave=()=>{if(run)endRun("Stopped: coach screen was left.");};
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")leave();});
    window.addEventListener("pagehide",leave);
    cards();showHistory();watchBoards();
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
    const lit = !!armed && !armed.dark;
    const colour = COLOURS[armed?.colour] || COLOURS.green;
    ctx.fillStyle = lit ? colour.hex : "#080a0b";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = lit ? colour.ink : label === "HIT" ? "#b8f65b" : "#a0a5af";
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
    ctx.fillText("v0.5.1", width / 2, height - 32);
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
        !targetOpen || !sensorEnabled || !motionSeen || !readyToken ||
        command.readyToken !== readyToken || document.visibilityState === "hidden") return;
    if (command.action === "off") {
      if (command.targetCommandId && armed && command.targetCommandId !== armed.id) return;
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
    const started = performance.now();
    const colour = COLOURS[command.colour] ? command.colour : "green";
    const label = typeof command.label === "string" ? command.label.slice(0,20) : "GO";
    armed = {id: command.id, started, deadline: started + Math.max(0, command.expiresAt - serverNow()),
      colour, dark: command.dark === true, hitSound: command.hitSound === true};
    $("target").style.background = armed.dark ? "#080a0b" : COLOURS[colour].hex;
    $("target").style.color = armed.dark ? "#a0a5af" : COLOURS[colour].ink;
    $("targetText").textContent = label;
    paintTarget(label);
    if (command.lightSound) playTone(520);
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
  installDesign();
  if (coachMode) {
    renderCoach();
  } else {
    setupBoardSettings();
    $("targetButton").textContent = "Start board";
    const link = document.createElement("a");
    link.href = "?mode=coach"; link.textContent = "Open coach controls";
    link.style.cssText = "display:block;color:#34e27a;margin:16px 0";
    $("app").prepend(link);
  }
  connectFirebase();
  if (!coachMode) autoStartBoard();

})();
