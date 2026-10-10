/* Afinação ao vivo + visualização da composição:
   microfone → pitch (YIN) → linhas das notas bizantinas posicionadas em MORIAS
   (alturas desiguais, conforme a escala do ἦχος), com a melodia do editor
   desenhada como barras e um cursor sincronizado com a reprodução. */
(function (P) {
  "use strict";

  const S = P.state;
  const CYCLE = ['Ni','Pa','Vou','Ga','Di','Ke','Zo'];
  const DEG_MIN = -7, DEG_MAX = 7;   // faixa mínima exibida (graus relativos à nota base)
  const HISTORY_SEC = 6;             // janela do modo "rolagem" (sem composição)
  const LABEL_W = 52;
  const PAD = 5;                     // folga (em morias) acima e abaixo da faixa

  const canvas = document.getElementById('pitchCanvas');
  const ctx = canvas.getContext('2d');
  const btn = document.getElementById('pitchBtn');
  const readout = document.getElementById('pitchRead');
  const errBox = document.getElementById('pitchErr');
  const scoreChk = document.getElementById('pitchScoreCheck');

  let micCtx = null, stream = null, analyser = null, buf = null;
  let looping = false;
  let history = [];      // modo rolagem: {t, m}   (m = morias a partir da nota base)
  let trace = [];        // modo composição: {t (s desde o início), m}
  let lastPs = null;
  let recent = [];
  let current = null;    // morias da nota detectada agora
  let currentFreq = null;
  let playingEv = null;  // neuma da composição que está soando agora
  let lastReadHtml = '';

  // ---------- teoria (tudo em morias) ----------
  function moriaOf(deg){ return P.degreeMoria(deg, S.mode, S.baseNote); }
  function baseFreq(){ return P.baseFrequency(S.mode, S.baseNote, S.octave); }
  function degFreq(deg){ return baseFreq() * Math.pow(2, moriaOf(deg) / P.MORIA_OCTAVE); }
  function freqToMoria(f){ return P.MORIA_OCTAVE * Math.log2(f / baseFreq()); }
  // grau (inteiro) cuja nota está mais perto de `m` morias
  function nearestDeg(m){
    let best = 0, bd = Infinity;
    for (let d = -21; d <= 21; d++){
      const dist = Math.abs(moriaOf(d) - m);
      if (dist < bd){ bd = dist; best = d; }
    }
    return best;
  }
  function degName(deg){
    const baseIdx = CYCLE.indexOf(S.baseNote);
    const i = (((baseIdx + deg) % 7) + 7) % 7;
    const mark = deg >= 7 ? '′' : (deg < 0 ? '͵' : '');
    return P.NOTE_LABEL[CYCLE[i]] + mark;
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
        ev.push({ i:i, deg:cum, m:moriaOf(cum), start:t, dur:durs[i], mod:n.mod });
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
      recent.push(freqToMoria(freq));
      if (recent.length > 5) recent.shift();
      const s = recent.slice().sort(function(a,b){ return a-b; });
      current = s[s.length >> 1];
    } else { recent = []; current = null; }

    history.push({ t:now, m:current });
    while (history.length && now - history[0].t > HISTORY_SEC) history.shift();

    const ps = activePlay();
    if (ps) trace.push({ t:(performance.now() - ps.start) / 1000, m:current });
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
    playingEv = null;
    if (tl && ps){
      const pt0 = (performance.now() - ps.start) / 1000;
      playingEv = tl.ev.find(function(e){ return !e.rest && pt0 >= e.start && pt0 < e.start + e.dur; }) || null;
    }

    let lo = DEG_MIN, hi = DEG_MAX;
    if (tl) tl.ev.forEach(function(e){
      if (e.deg != null){ lo = Math.min(lo, Math.floor(e.deg)); hi = Math.max(hi, Math.ceil(e.deg)); }
    });

    // posição vertical de cada grau, proporcional às morias
    const ms = [];
    for (let deg = lo; deg <= hi; deg++) ms.push(moriaOf(deg));
    const mTop = ms[ms.length - 1] + PAD, mBot = ms[0] - PAD;
    const yOf = function(m){ return (mTop - m) / (mTop - mBot) * h; };
    const plotW = w - LABEL_W;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css('--paper');
    ctx.fillRect(0, 0, w, h);

    // faixas alternadas entre graus vizinhos (altura = tamanho do intervalo em morias)
    for (let k = 0; k < ms.length - 1; k++){
      if ((lo + k) % 2 !== 0) continue;
      const yTop = yOf(ms[k+1]), yBot = yOf(ms[k]);
      ctx.fillStyle = '#00000008';
      ctx.fillRect(0, yTop, w, yBot - yTop);
    }

    // linhas e rótulos de cada grau
    ctx.font = '600 10px "Noto Serif", serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let lastLabelY = null;
    for (let deg = hi; deg >= lo; deg--){
      const y = yOf(ms[deg - lo]);
      const isBase = deg === 0, isOct = (((deg % 7) + 7) % 7) === 0;
      if (isBase){
        ctx.fillStyle = '#c9a22740';
        ctx.fillRect(0, y - 3, w, 6);
      }
      ctx.strokeStyle = isOct ? '#5a463699' : '#5a463644';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(w, y); ctx.stroke();
      if (isBase || lastLabelY == null || y - lastLabelY >= 10){
        ctx.fillStyle = isBase ? css('--accent-2') : css('--ink-soft');
        ctx.fillText(degName(deg), 8, y);
        lastLabelY = y;
      }
    }
    ctx.strokeStyle = '#5a463655';
    ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, h); ctx.stroke();

    // morias de cada intervalo, no espaço entre duas notas (fonte menor que a das notas)
    ctx.font = '400 8px "Noto Serif", serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = css('--accent-2');
    for (let k = 0; k < ms.length - 1; k++){
      const yTop = yOf(ms[k+1]), yBot = yOf(ms[k]);
      if (yBot - yTop < 7) continue;   // intervalo pequeno demais para caber o número
      ctx.fillText(String(ms[k+1] - ms[k]), LABEL_W - 5, (yTop + yBot) / 2);
    }
    ctx.textAlign = 'left';

    if (tl && tl.total > 0){
      drawScore(tl, ps, yOf, plotW, h);
    } else {
      drawHistory(yOf, plotW, w, mBot, mTop);
    }

    // linha vermelha: nota detectada agora
    if (current != null && current >= mBot && current <= mTop){
      const y = yOf(current);
      ctx.strokeStyle = '#e01b1b'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(LABEL_W, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.fillStyle = '#e01b1b';
      ctx.beginPath(); ctx.arc(LABEL_W, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    updateReadout();
  }

  function drawScore(tl, ps, yOf, plotW, h){
    const xOf = function(t){ return LABEL_W + (t / tl.total) * plotW; };
    const pt = ps ? Math.max(0, Math.min(tl.total, (performance.now() - ps.start) / 1000)) : null;

    // contorno melódico (liga as notas)
    ctx.strokeStyle = '#2b181055'; ctx.lineWidth = 1;
    ctx.beginPath();
    let first = true;
    tl.ev.forEach(function(e){
      if (e.rest) return;
      const y = yOf(e.m), x = xOf(e.start + e.dur / 2);
      if (first){ ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // barras das notas
    const bh = 8;
    tl.ev.forEach(function(e){
      if (e.rest) return;
      const x = xOf(e.start);
      const bw = Math.max(3, xOf(e.start + e.dur) - x - 1.5);
      const active = pt != null && pt >= e.start && pt < e.start + e.dur;
      ctx.fillStyle = active ? '#c9a227' : css('--ink');
      ctx.globalAlpha = active ? 1 : 0.78;
      ctx.fillRect(x, yOf(e.m) - bh / 2, bw, bh);
      ctx.globalAlpha = 1;
    });

    // traço do que foi cantado, alinhado ao tempo da composição
    ctx.strokeStyle = '#d3222299'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    trace.forEach(function(p){
      if (p.m == null || p.t < 0 || p.t > tl.total){ pen = false; return; }
      const x = xOf(p.t), y = yOf(p.m);
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

  function drawHistory(yOf, plotW, w, mBot, mTop){
    const now = performance.now() / 1000;
    ctx.strokeStyle = '#d3222299'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.beginPath();
    let pen = false;
    history.forEach(function(p){
      if (p.m == null || p.m < mBot || p.m > mTop){ pen = false; return; }
      const x = w - (now - p.t) / HISTORY_SEC * plotW;
      if (x < LABEL_W){ pen = false; return; }
      const y = yOf(p.m);
      if (!pen){ ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // Leitura única: nota da composição (♪) e do microfone (🎤), no mesmo lugar.
  function updateReadout(){
    const lines = [];
    if (playingEv){
      lines.push('<span class="rd-score">♪ ' + degName(playingEv.deg) + ' · ' + degFreq(playingEv.deg).toFixed(1) + ' Hz</span>');
    }
    if (analyser){
      if (currentFreq != null && current != null){
        const nearest = nearestDeg(current);
        const dm = current - moriaOf(nearest);
        const cents = Math.round(1200 * Math.log2(currentFreq / degFreq(nearest)));
        lines.push('🎤 ' + degName(nearest) + ' · ' + currentFreq.toFixed(1) + ' Hz (' +
          (dm > 0 ? '+' : '') + dm.toFixed(1) + ' mo · ' + (cents > 0 ? '+' : '') + cents + '¢)');
      } else {
        lines.push('🎤 —');
      }
    }
    const html = lines.length ? lines.join('<br>') : '—';
    if (html !== lastReadHtml){ readout.innerHTML = html; lastReadHtml = html; }
  }

  // ---------- laço de animação (mic ativo OU reprodução em curso) ----------
  function frame(){
    looping = false;
    if (analyser) detect();
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
