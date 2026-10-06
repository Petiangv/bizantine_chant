/* Estado compartilhado, duração base e cálculo de durações (incl. agrupamentos γοργόν). */
(function (P) {
  "use strict";

  // Estado único da aplicação. Os demais módulos leem/escrevem aqui.
  // notes: {kind:'neume', atoms, mod, syll, synapsis} | {kind:'rest', len:'short'|'long'}
  const S = {
    notes: [],
    currentMod: 'normal',
    armedSyll: '',
    syllConsumed: false,   // true assim que a sílaba armada já foi mostrada numa nota
    bpm: 80,
    isonOn: true,
    mode: 'Α΄',
    baseNote: 'Di',
    octave: 3
  };

  function unitSeconds(){ return 60 / S.bpm; }
  function baseMidi(){ return (S.octave + 1) * 12 + P.PITCH_CLASS[S.baseNote]; }

  // calcula a duração final (em segundos) de cada evento da sequência,
  // aplicando primeiro os sinais próprios (ἁπλή/διπλή/τριπλή/κλάσμα) e depois
  // os sinais de agrupamento (γοργόν/δίγοργον/τρίγοργον), que multiplicam
  // também as notas vizinhas indicadas.
  function computeDurations(){
    const uSec = unitSeconds();
    const n = S.notes.length;
    const baseLen = new Array(n);
    const groupFactor = new Array(n).fill(1);

    S.notes.forEach(function(note, i){
      if (note.kind === 'rest') baseLen[i] = note.len === 'long' ? 1.5 : 0.5;
      else baseLen[i] = P.SELF_FACTOR[note.mod] || 1;
    });

    S.notes.forEach(function(note, i){
      if (note.kind === 'neume' && P.GROUP_DEF[note.mod]){
        const def = P.GROUP_DEF[note.mod];
        def.span.forEach(function(offset){
          const t = i + offset;
          if (t >= 0 && t < n) groupFactor[t] *= def.factor;
        });
      }
    });

    const durSec = new Array(n);
    for (let i = 0; i < n; i++) durSec[i] = uSec * baseLen[i] * groupFactor[i];
    return durSec;
  }

  Object.assign(P, { state: S, unitSeconds, baseMidi, computeDurations });

})(window.Psaltiki = window.Psaltiki || {});
