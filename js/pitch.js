/* Afinação ao vivo + visualização da composição:
   microfone → pitch (YIN) → faixas das notas bizantinas, com a melodia do editor
   desenhada como barras e um cursor sincronizado com a reprodução. */
(function (P) {
  "use strict";

  const S = P.state;
  const CYCLE = ['Ni','Pa','Vou','Ga','Di','Ke','Zo'];
  const DEG_MIN = -7, DEG_MAX = 7;   // faixa mínima exibida (relativa à nota base)
  const HISTORY_SEC = 6;             // janela do modo "rolagem" (sem composição)
  const LABEL_W = 52;

  const canvas = document.getElementById('pitchCanvas');
  const ctx = canvas.getContext('2d');
  const btn = document.getElementById('pitchBtn');
  const readout = document.getElementById('pitchRead');
  const errBox = document.getElementById('pitchErr');
  const scoreChk = document.getElementById('pitchScoreCheck');

  let micCtx = null, stream = null, analyser = null, buf = null;
  let looping = false;
  let history = [];      // modo rolagem: {t, deg}
  let trace = [];        // modo composição: {t (s desde o início), deg}
  let lastPs = null;
  let recent = [];
  let current = null;
  let currentFreq = null;

  // ---------- teoria ----------
  function degName(deg){
    const baseIdx = CYCLE.indexOf(S.baseNote);
    const i = (((baseIdx + deg) % 7) + 7) % 7;
    const mark = deg >= 7 ? '′' : (deg < 0 ? '͵' : '');
    return P.NOTE_LABEL[CYCLE[i]] + mark;
  }
  function degFreq(deg){
    return 440 * Math.pow(2, (P.baseMidi() + P.degreeSemitone(deg) - 69) / 12);
  }
  function semitoneToDegree(st){
    const o = Math.floor(st / 12);
    const rem = st - o * 12;
    const steps = P.DIATONIC_STEPS.concat([12]);
    for (let k = 0; k < 7; k++){
      if (rem >= steps[k] && rem < steps[k+1]) return o*7 + k + (rem - steps[k]) / (steps[k+1] - steps[k]);
    }
    return o * 7;
  }
  function freqToDegree(f){
    return semitoneToDegree(69 + 12 * Math.log2(f / 440) - P.baseMidi());
  }

  // ---------- composição → linha do tempo (mesma lógica do audio.js) ----------
  function timeline(){
    const durs = P.computeDurations();
    let t = 0, cum = 0;
    const ev = [];
    S.notes.forEach(function(n, i){
      if (n.kind === 'rest'){ ev.push({ i:i, rest:true, start:t, dur:durs[i] }); }
      else {
        cum += P.neumeInterval(n);
        ev.push({ i:i, deg:cum, start:t, dur:durs[i], mod:n.mod });
      }
      t += durs[i];
    });
    return { ev:ev, total:t };
  }
  function scoreMode(){
    return (!scoreChk || scoreChk.checked) && S.notes.some(function(n){ return n.kind === 'neume'; });
  }
  function activePlay(){
    const ps = P.playState;
    if (ps && performance.now() > ps.start + ps.total*1000 + 150) { P.playState = null; return null; }
    return ps || null;
  }

  // ---------- detector YIN ----------
  function yin(data, sr){
    const minTau = Math.floor(sr / 1000);
    const maxTau = Math.min(Math.floor(sr / 70), (data.length >> 1) - 1);
    const W = data.length >> 1;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++){
      let sum = 0;
      for (let j = 0; j < W; j++){ const x = data[j] - data[j+tau]; sum += x*x; }
      d[tau] = sum;
    }
    let run = 0; d[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++){ run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }
    for (let tau = Math.max(2, minTau); tau < maxTau; tau++){
      if (d[tau] < 0.12){
        while (tau + 1 < maxTau && d[tau+1] < d[tau]) tau++;
        const a = d[tau-1], b = d[tau], c = d[tau+1];
        const den = a + c - 2*b;
        return sr / (tau + (den ? (a - c) / (2*den) : 0));
      }
    }
    return null;
  }
  function rms(data){
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i]*data[i];
    return Math.sqrt(s / data.length);
  }

  function detect(){
    analyser.getFloatTimeDomainData(buf);
    const now = performance.now() / 1000;
    const freq = rms(buf) > 0.01 ? yin(buf, micCtx.sampleRate) : null;
    currentFreq = freq;
    if (freq){
      recent.push(freqToDegree(freq));
      if (recent.length > 5) recent.shift();
      const s = recent.slice().sort(function(a,b){ return a-b; });
      current = s[s.length >> 1];
    } else { recent = []; current = null; }

    history.push({ t:now, deg:current });
    while (history.length && now - history[0].t > HISTORY_SEC) history.shift();

    const ps = activePlay();
    if (ps) trace.push({ t:(performance.now() - ps.start) / 1000, deg:current });
  }

  // ---------- desenho ----------
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  function css(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function draw(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const ps = activePlay();
    if (ps !== lastPs){ lastPs = ps; if (ps) trace = []; }

    const score = scoreMode();
    const tl = score ? timeline() : null;

    let lo = DEG_MIN, hi = DEG_MAX;
    if (tl) tl.ev.forEach(function(e){
      if (e.deg != null){ lo = Math.min(lo, Math.floor(e.deg)); hi = Math.max(hi, Math.ceil(e.deg)); }
    });
    const n = hi - lo + 1;
    const bandH = h / n;
    const yOf = function(deg){ return (hi - deg) * bandH + bandH / 2; };
    const plotW = w - LABEL_W;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--paper');
    ctx.fillRect(0, 0, w, h);

    // faixas
    ctx.font = '600 ' + Math.max(8, Math.min(12, bandH * 0.8)) + 'px "Noto Serif", serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (let deg = hi; deg >= lo; deg--){
      const top = (hi - deg) * bandH;
      const isBase = deg === 0, isOct = (((deg % 7) + 7) % 7) === 0;
      ctx.fillStyle = isBase ? '#c9a22740' : (deg % 2 === 0 ? '#00000008' : '#00000000');
      ctx.fillRect(0, top, w, bandH);
      ctx.strokeStyle = isOct ? '#5a463666' : '#5a463622';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LABEL_W, top + bandH); ctx.lineTo(w, top + bandH); ctx.stroke();
      ctx.fillStyle = isBase ? css('--accent-2') : css('--ink-soft');
      ctx.fillText(degName(deg), 8, top + bandH / 2);
    }
    ctx.strokeStyle = '#5a463655';
    ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, h); ctx.stroke();

    if (tl && tl.total > 0){
      drawScore(tl, ps, yOf, bandH, plotW, h);
    } else {
      drawHistory(yOf, plotW, w, lo, hi);
    }

    // linha vermelha: nota detectada agora
    if (current != null && current >= lo - 0.5 && current <= hi + 0.5){
      const y = yOf(current);
      ctx.strokeStyle = '#e01b1b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = '#e01b1b';
      ctx.beginPath(); ctx.arc(LABEL_W, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawScore(tl, ps, yOf, bandH, plotW, h){
    const xOf = function(t){ return LABEL_W + (t / tl.total) * plotW; };
    const pt = ps ? Math.max(0, Math.min(tl.total, (performance.now() - ps.start) / 1000)) : null;

    // contorno melódico (liga as notas)
    ctx.strokeStyle = '#2b181055'; ctx.lineWidth = 1;
    ctx.beginPath();
    let first = true;
    tl.ev.forEach(function(e){
      if (e.rest) return;
      const y = yOf(e.deg), x = xOf(e.start + e.dur / 2);
      if (first){ ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // barras das notas
    tl.ev.forEach(function(e){
      if (e.rest) return;
      const x = xOf(e.start);
      const bw = Math.max(3, xOf(e.start + e.dur) - x - 1.5);
      const bh = Math.max(4, bandH * 0.55);
      const active = pt != null && pt >= e.start && pt < e.start + e.dur;
      ctx.fillStyle = active ? '#c9a227' : css('--ink');
      ctx.globalAlpha = active ? 1 : 0.78;
      ctx.fillRect(x, yOf(e.deg) - bh / 2, bw, bh);
      ctx.globalAlpha = 1;
    });

    // traço do que foi cantado, alinhado ao tempo da composição
    ctx.strokeStyle = '#d3222299'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    trace.forEach(function(p){
      if (p.deg == null || p.t < 0 || p.t > tl.total){ pen = false; return; }
      const x = xOf(p.t), y = yOf(p.deg);
      if (!pen){ ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // cursor de reprodução
    if (pt != null){
      const x = xOf(pt);
      ctx.strokeStyle = css('--accent'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }

  function drawHistory(yOf, plotW, w, lo, hi){
    const now = performance.now() / 1000;
    ctx.strokeStyle = '#d3222299'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    history.forEach(function(p){
      if (p.deg == null || p.deg < lo - 0.5 || p.deg > hi + 0.5){ pen = false; return; }
      const x = w - (now - p.t) / HISTORY_SEC * plotW;
      if (x < LABEL_W){ pen = false; return; }
      const y = yOf(p.deg);
      if (!pen){ ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  function updateReadout(){
    if (currentFreq == null || current == null){ readout.textContent = '—'; return; }
    const nearest = Math.round(current);
    const cents = Math.round(1200 * Math.log2(currentFreq / degFreq(nearest)));
    readout.textContent = degName(nearest) + '  ' + currentFreq.toFixed(1) + ' Hz  (' + (cents > 0 ? '+' : '') + cents + '¢)';
  }

  // ---------- laço de animação (mic ativo OU reprodução em curso) ----------
  function frame(){
    looping = false;
    if (analyser){ detect(); updateReadout(); }
    draw();
    if (analyser || activePlay()) kick();
  }
  function kick(){
    if (!looping){ looping = true; requestAnimationFrame(frame); }
  }

  async function start(){
    errBox.textContent = '';
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation:false, noiseSuppression:false, autoGainControl:false }
      });
    }catch(e){
      errBox.textContent = 'Não foi possível acessar o microfone (' + (e.name || 'erro') + '). Use https ou localhost e permita o acesso.';
      return;
    }
    micCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (micCtx.state === 'suspended') await micCtx.resume();
    const src = micCtx.createMediaStreamSource(stream);
    analyser = micCtx.createAnalyser();
    analyser.fftSize = 2048;
    buf = new Float32Array(analyser.fftSize);
    src.connect(analyser);
    history = []; recent = []; current = null;
    btn.textContent = '■ Parar microfone';
    btn.classList.add('rec');
    kick();
  }

  function stop(){
    if (stream) stream.getTracks().forEach(function(t){ t.stop(); });
    if (micCtx) micCtx.close();
    stream = micCtx = analyser = null;
    current = currentFreq = null;
    readout.textContent = '—';
    btn.textContent = '🎤 Ativar microfone';
    btn.classList.remove('rec');
    draw();
  }

  btn.addEventListener('click', function(){ analyser ? stop() : start(); });
  if (scoreChk) scoreChk.addEventListener('change', draw);
  ['modeSelect','baseNoteSelect','octaveInput'].forEach(function(id){
    document.getElementById(id).addEventListener('change', draw);
  });
  window.addEventListener('resize', resize);

  // chamado pelo render.js (a cada edição / BPM) e pelo audio.js (início/fim da reprodução)
  P.drawPitchBands = function(){
    draw();
    if (activePlay()) kick();
  };

  resize();

})(window.Psaltiki = window.Psaltiki || {});
