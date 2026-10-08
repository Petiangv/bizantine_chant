/* Afinação ao vivo: microfone → pitch (YIN) → gráfico de faixas com as notas bizantinas. */
(function (P) {
  "use strict";

  const S = P.state;
  const CYCLE = ['Ni','Pa','Vou','Ga','Di','Ke','Zo'];   // ordem dos graus bizantinos
  const DEG_MIN = -7, DEG_MAX = 7;                        // faixa exibida (relativa à nota base)
  const HISTORY_SEC = 6;                                  // janela de tempo do traço

  const canvas = document.getElementById('pitchCanvas');
  const ctx = canvas.getContext('2d');
  const btn = document.getElementById('pitchBtn');
  const readout = document.getElementById('pitchRead');
  const errBox = document.getElementById('pitchErr');

  let micCtx = null, stream = null, analyser = null, buf = null, rafId = null;
  let history = [];          // {t, deg} (deg = grau contínuo ou null)
  let recent = [];           // mediana curta para suavizar
  let current = null;        // último grau contínuo detectado

  // ---------- teoria: grau <-> frequência ----------
  function degName(deg){
    const baseIdx = CYCLE.indexOf(S.baseNote);
    const i = (((baseIdx + deg) % 7) + 7) % 7;
    const mark = deg >= 7 ? '′' : (deg < 0 ? '͵' : '');
    return P.NOTE_LABEL[CYCLE[i]] + mark;
  }
  function degFreq(deg){
    return 440 * Math.pow(2, (P.baseMidi() + P.degreeSemitone(deg) - 69) / 12);
  }
  // semitons (float, relativos à base) → grau contínuo, interpolando na escala do projeto
  function semitoneToDegree(st){
    let deg = Math.floor(st / 12) * 7;
    const rem = st - Math.floor(st / 12) * 12;
    const steps = P.DIATONIC_STEPS.concat([12]);
    for (let k = 0; k < 7; k++){
      if (rem >= steps[k] && rem < steps[k+1]){
        return deg + k + (rem - steps[k]) / (steps[k+1] - steps[k]);
      }
    }
    return deg;
  }
  function freqToDegree(f){
    const midi = 69 + 12 * Math.log2(f / 440);
    return semitoneToDegree(midi - P.baseMidi());
  }

  // ---------- detector de pitch (YIN) ----------
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
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= maxTau; tau++){ run += d[tau]; d[tau] = d[tau] * tau / (run || 1); }
    for (let tau = Math.max(2, minTau); tau < maxTau; tau++){
      if (d[tau] < 0.12){
        while (tau + 1 < maxTau && d[tau+1] < d[tau]) tau++;
        const a = d[tau-1], b = d[tau], c = d[tau+1];
        const den = a + c - 2*b;
        const shift = den ? (a - c) / (2*den) : 0;
        return sr / (tau + shift);
      }
    }
    return null;
  }

  function rms(data){
    let s = 0;
    for (let i = 0; i < data.length; i++) s += data[i]*data[i];
    return Math.sqrt(s / data.length);
  }

  // ---------- desenho ----------
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function css(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function draw(){
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const labelW = 52;
    const n = DEG_MAX - DEG_MIN + 1;
    const bandH = h / n;
    const yOf = function(deg){ return (DEG_MAX - deg) * bandH + bandH / 2; };

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--paper');
    ctx.fillRect(0, 0, w, h);

    // faixas horizontais
    ctx.font = '600 12px "Noto Serif", serif';
    ctx.textBaseline = 'middle';
    for (let deg = DEG_MAX; deg >= DEG_MIN; deg--){
      const top = (DEG_MAX - deg) * bandH;
      const isBase = (deg === 0), isOctave = (((deg % 7) + 7) % 7 === 0);
      ctx.fillStyle = isBase ? '#c9a22740'
                    : (deg % 2 === 0 ? '#00000008' : '#00000000');
      ctx.fillRect(0, top, w, bandH);
      ctx.strokeStyle = isOctave ? '#5a463666' : '#5a463622';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(labelW, top + bandH); ctx.lineTo(w, top + bandH); ctx.stroke();
      ctx.fillStyle = isBase ? css('--accent-2') : css('--ink-soft');
      ctx.textAlign = 'left';
      ctx.fillText(degName(deg), 8, top + bandH / 2);
    }
    ctx.strokeStyle = '#5a463655';
    ctx.beginPath(); ctx.moveTo(labelW, 0); ctx.lineTo(labelW, h); ctx.stroke();

    // traço histórico
    const now = performance.now() / 1000;
    const x0 = labelW, x1 = w;
    ctx.strokeStyle = '#d3222299';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    history.forEach(function(p){
      if (p.deg == null || p.deg < DEG_MIN - 0.5 || p.deg > DEG_MAX + 0.5){ pen = false; return; }
      const x = x1 - (now - p.t) / HISTORY_SEC * (x1 - x0);
      if (x < x0) { pen = false; return; }
      const y = yOf(p.deg);
      if (!pen){ ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // linha vermelha na posição da nota detectada
    if (current != null && current >= DEG_MIN - 0.5 && current <= DEG_MAX + 0.5){
      const y = yOf(current);
      ctx.strokeStyle = '#e01b1b';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(labelW, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = '#e01b1b';
      ctx.beginPath(); ctx.arc(labelW, y, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function updateReadout(freq){
    if (freq == null || current == null){ readout.textContent = '—'; return; }
    const nearest = Math.round(current);
    const target = degFreq(nearest);
    const cents = Math.round(1200 * Math.log2(freq / target));
    readout.textContent = degName(nearest) + '  ' + freq.toFixed(1) + ' Hz  (' + (cents > 0 ? '+' : '') + cents + '¢)';
  }

  // ---------- laço em tempo real ----------
  function loop(){
    rafId = requestAnimationFrame(loop);
    analyser.getFloatTimeDomainData(buf);
    const t = performance.now() / 1000;
    let freq = null;
    if (rms(buf) > 0.01) freq = yin(buf, micCtx.sampleRate);

    if (freq){
      recent.push(freqToDegree(freq));
      if (recent.length > 5) recent.shift();
      const sorted = recent.slice().sort(function(a,b){ return a-b; });
      current = sorted[sorted.length >> 1];
      history.push({ t: t, deg: current });
    } else {
      recent = [];
      current = null;
      history.push({ t: t, deg: null });
    }
    while (history.length && t - history[0].t > HISTORY_SEC) history.shift();
    updateReadout(freq);
    draw();
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
    src.connect(analyser);               // não conecta ao destino: evita microfonia
    history = []; recent = []; current = null;
    btn.textContent = '■ Parar microfone';
    btn.classList.add('rec');
    loop();
  }

  function stop(){
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (stream) stream.getTracks().forEach(function(t){ t.stop(); });
    if (micCtx) micCtx.close();
    stream = micCtx = analyser = null;
    current = null;
    readout.textContent = '—';
    btn.textContent = '🎤 Ativar microfone';
    btn.classList.remove('rec');
    draw();
  }

  btn.addEventListener('click', function(){ rafId ? stop() : start(); });

  // redesenha as faixas quando ἦχος / nota base / oitava mudam
  ['modeSelect','baseNoteSelect','octaveInput'].forEach(function(id){
    document.getElementById(id).addEventListener('change', draw);
  });
  window.addEventListener('resize', resize);

  resize();
  P.drawPitchBands = draw;

})(window.Psaltiki = window.Psaltiki || {});
