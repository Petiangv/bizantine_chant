/* Síntese de áudio (Web Audio): melodia, ison e controle de reprodução. */
(function (P) {
  "use strict";

  const S = P.state;
  const neumeInterval = P.neumeInterval, degreeSemitone = P.degreeSemitone;

  let audioCtx = null;
  let activeNodes = [];
  let activeTimeouts = [];

  function stopPlayback(){
    activeNodes.forEach(function(n){ try{ n.stop(); }catch(e){} });
    activeTimeouts.forEach(function(t){ clearTimeout(t); });
    activeNodes = [];
    activeTimeouts = [];
    P.clearHighlight();
P.playState = null;
if (P.drawPitchBands) P.drawPitchBands();
	
  }

  function playAll(){
    if (!S.notes.length) return;
    stopPlayback();
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const bMidi = P.baseMidi();
    let cumulative = 0;
    let t = audioCtx.currentTime + 0.08;

    const durSec = P.computeDurations();
    const totalDur = durSec.reduce(function(a,b){ return a+b; }, 0);
// sinaliza ao módulo de pitch onde está o início da reprodução (em performance.now)
P.playState = { start: performance.now() + (t - audioCtx.currentTime) * 1000, total: totalDur };

    if (S.isonOn){
      const freq = 440*Math.pow(2,(bMidi-69)/12);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t+0.4);
      gain.gain.setValueAtTime(0.09, t+totalDur-0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t+totalDur);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t+totalDur+0.05);
      activeNodes.push(osc);
    }

    S.notes.forEach(function(n, i){
      const dur = durSec[i];
      if (n.kind === 'rest'){
        const delayMs = Math.max((t-audioCtx.currentTime)*1000, 0);
        activeTimeouts.push(setTimeout(function(){ P.highlight(i); }, delayMs));
        t += dur;
        return;
      }
      cumulative += neumeInterval(n);
      const midi = bMidi + degreeSemitone(cumulative);
      const freq = 440*Math.pow(2,(midi-69)/12);

      const osc = audioCtx.createOscillator();
      const lfo = audioCtx.createOscillator();
      const lfoGain = audioCtx.createGain();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      lfo.frequency.value = 5.2;
      lfoGain.gain.value = freq*0.004;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.26, t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t+dur*0.94);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t); lfo.start(t);
      osc.stop(t+dur); lfo.stop(t+dur);
      activeNodes.push(osc); activeNodes.push(lfo);

      const delayMs = Math.max((t-audioCtx.currentTime)*1000, 0);
      activeTimeouts.push(setTimeout(function(){ P.highlight(i); }, delayMs));
      t += dur;
    });

   activeTimeouts.push(setTimeout(function(){
  P.clearHighlight();
  P.playState = null;
  if (P.drawPitchBands) P.drawPitchBands();
}, (t-audioCtx.currentTime)*1000+80));

if (P.drawPitchBands) P.drawPitchBands();   // inicia a animação do cursor


  }

  Object.assign(P, { playAll, stopPlayback });

})(window.Psaltiki = window.Psaltiki || {});
