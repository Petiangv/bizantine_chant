/* Teoria: escalas em morias, sinais (átomos), fatores de duração e funções puras de intervalo. */
(function (P) {
  "use strict";

  // Zo:12 -> o Ζω fica acima do Κε dentro da mesma oitava (Νη=2 ... Κε=11, Ζω=12)
  const PITCH_CLASS = { Ni:2, Pa:4, Vou:5, Ga:7, Di:9, Ke:11, Zo:12 };
  const NOTE_LABEL = { Ni:'Νη', Pa:'Πα', Vou:'Βου', Ga:'Γα', Di:'Δι', Ke:'Κε', Zo:'Ζω' };

  // ---------- escalas em morias (12 morias = 1 tom; oitava = 72) ----------
  const MORIA_OCTAVE = 72;
  const NOTE_ORDER = ['Ni','Pa','Vou','Ga','Di','Ke','Zo'];

  // start = nota onde a lista de intervalos começa; steps[k] = distância da
  // k-ésima nota (a partir de start) até a seguinte.
  const SCALES = {
    diatonic:   { start:'Ni', steps:[12,10, 8,12,12,10, 8] },
    chromHard:  { start:'Pa', steps:[ 6,20, 4,12, 6,20, 4] },
    chromSoft:  { start:'Di', steps:[ 8,14, 8,12, 8,14, 8] },
    graveDiat:  { start:'Zo', steps:[ 8,12,10,12, 8,16, 6] },
    enharmonic: { start:'Zo', steps:[12,12, 6,12,12,12, 6] }
  };

  const MODE_SCALE = {
    'Α΄':'diatonic',    'Β΄':'chromSoft',    'Γ΄':'enharmonic',  'Δ΄':'diatonic',
    'Πλ.Α΄':'diatonic', 'Πλ.Β΄':'chromHard', 'Βαρύς':'enharmonic', 'Πλ.Δ΄':'diatonic',
    'Βαρύς δ.':'graveDiat'
  };

  // tabela: índice da nota (em NOTE_ORDER) -> intervalo (em morias) até a nota seguinte
  function stepTable(scaleKey){
    const sc = SCALES[scaleKey];
    const s0 = NOTE_ORDER.indexOf(sc.start);
    const t = [];
    sc.steps.forEach(function(v,k){ t[(s0+k)%7] = v; });
    return t;
  }

  // distância em morias entre a nota base e o grau `deg` (positivo ou negativo)
  function degreeMoria(deg, mode, baseNote){
    const t = stepTable(MODE_SCALE[mode] || 'diatonic');
    let idx = NOTE_ORDER.indexOf(baseNote), m = 0;
    if (idx < 0) idx = 0;
    for (; deg > 0; deg--){ m += t[idx]; idx = (idx+1)%7; }
    for (; deg < 0; deg++){ idx = (idx+6)%7; m -= t[idx]; }
    return m;
  }

  // ---------- altura absoluta: Νη3 = Dó3 (130,81 Hz) ----------
  // A oitava começa no Νη (Νη Πα Βου Γα Δι Κε Ζω | Νη'). O número da oitava
  // (campo "octave") é o da nota base; com octave=3, Νη = Dó3.
  const NI_REF_FREQ = 130.8128;   // Hz de Νη na oitava de referência
  const NI_REF_OCTAVE = 3;

  // morias entre o Νη e a nota `note`, segundo a escala do ἦχος
  function moriaFromNi(note, mode){
    const t = stepTable(MODE_SCALE[mode] || 'diatonic');
    const idx = Math.max(0, NOTE_ORDER.indexOf(note));
    let m = 0;
    for (let k = 0; k < idx; k++) m += t[k];
    return m;
  }

  // frequência (Hz) da nota base: Νη da oitava + morias até a nota
  function baseFrequency(mode, note, octave){
    const niFreq = NI_REF_FREQ * Math.pow(2, octave - NI_REF_OCTAVE);
    return niFreq * Math.pow(2, moriaFromNi(note, mode) / MORIA_OCTAVE);
  }

  // ---------- sinais de χρόνος (duração) ----------
  // ἁπλή/διπλή/τριπλή e κλάσμα alteram só a própria nota.
  // γοργόν/δίγοργον/τρίγοργον são sinais de AGRUPAMENTO: afetam também as notas vizinhas.
  const SELF_FACTOR = { normal:1, klasma:1.5, apli:2, dipli:3, tripli:4 };
  const GROUP_DEF = {
    gorgon:    { span:[-1,0],     factor:1/2 },
    digorgon:  { span:[-1,0,1],   factor:1/3 },
    trigorgon: { span:[-1,0,1,2], factor:1/4 }
  };
  const MOD_BADGE = { gorgon:'½', digorgon:'⅓', trigorgon:'¼', klasma:'1½', apli:'2', dipli:'3', tripli:'4' };

  // sinais "corpo" atômicos: uma neuma bizantina real pode combinar vários
  // sinais do mesmo sentido (todos ascendentes ou todos descendentes) para
  // formar intervalos compostos (ex.: Ὑψηλή+Ὀλίγον = +5, Ὑψηλή×2 = +8).
  const ATOM_VALUE = { ison:0, oligon:1, kentima:1, Petasti: 1, ypsili:4, apostrophos:-1, elaphron:-2, hamile:-4 };
  const ATOM_NAME  = { ison:'Ἴσον', oligon:'Ὀλίγον', Petasti: 'Pestasti' ,  kentima:'Κέντημα', ypsili:'Ὑψηλή', apostrophos:'Ἀπόστροφος', elaphron:'Ἐλαφρόν', hamile:'Χαμηλή' };
  const ATOM_DIR   = { ison:0, oligon:1, kentima:1, Petasti: 1, ypsili:1, apostrophos:-1, elaphron:-1, hamile:-1 };

  const ASCEND_ATOMS  = ['ypsili','kentima','oligon','Petasti'];
  const DESCEND_ATOMS = ['hamile','elaphron','apostrophos'];

  function neumeInterval(note){
    return note.atoms.reduce(function(s,k){ return s + ATOM_VALUE[k]; }, 0);
  }

  function neumeName(atoms){
    return atoms.map(function(k){ return ATOM_NAME[k]; }).join('+');
  }

  Object.assign(P, {
    PITCH_CLASS, NOTE_LABEL, SELF_FACTOR, GROUP_DEF, MOD_BADGE,
    ATOM_VALUE, ATOM_NAME, ATOM_DIR, ASCEND_ATOMS, DESCEND_ATOMS,
    MORIA_OCTAVE, SCALES, MODE_SCALE, degreeMoria,
    NI_REF_FREQ, NI_REF_OCTAVE, moriaFromNi, baseFrequency,
    neumeInterval, neumeName
  });

})(window.Psaltiki = window.Psaltiki || {});
