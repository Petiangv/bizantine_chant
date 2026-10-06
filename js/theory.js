/* Teoria: escala, sinais (átomos), fatores de duração e funções puras de intervalo. */
(function (P) {
  "use strict";

  const PITCH_CLASS = { Ni:2, Pa:4, Vou:5, Ga:7, Di:9, Ke:11, Zo:0 };
  const NOTE_LABEL = { Ni:'Νη', Pa:'Πα', Vou:'Βου', Ga:'Γα', Di:'Δι', Ke:'Κε', Zo:'Ζω' };
  const DIATONIC_STEPS = [0,2,3,5,7,8,10]; // aproximação temperada, sabor "protos"
  // sinais de χρόνος (duração).
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
  // formar intervalos compostos (ex.: Ὑψηλή+Ὀλίγον = +5, Ὑψηλή×2 = +8/oitava).
  const ATOM_VALUE = { ison:0, oligon:1, kentima:1, Petasti: 1, ypsili:4, apostrophos:-1, elaphron:-2, hamile:-4 };
  const ATOM_NAME  = { ison:'Ἴσον', oligon:'Ὀλίγον', Petasti: 'Pestasti' ,  kentima:'Κέντημα', ypsili:'Ὑψηλή', apostrophos:'Ἀπόστροφος', elaphron:'Ἐλαφρόν', hamile:'Χαμηλή' };
  const ATOM_DIR   = { ison:0, oligon:1, kentima:1, Petasti: 1, ypsili:1, apostrophos:-1, elaphron:-1, hamile:-1 };

  const ASCEND_ATOMS  = ['ypsili','kentima','oligon','Petasti'];
  const DESCEND_ATOMS = ['hamile','elaphron','apostrophos'];

  function degreeSemitone(deg){
    const oct = Math.floor(deg/7);
    const idx = ((deg % 7) + 7) % 7;
    return oct*12 + DIATONIC_STEPS[idx];
  }

  function neumeInterval(note){
    return note.atoms.reduce(function(s,k){ return s + ATOM_VALUE[k]; }, 0);
  }

  function neumeName(atoms){
    return atoms.map(function(k){ return ATOM_NAME[k]; }).join('+');
  }

  Object.assign(P, {
    PITCH_CLASS, NOTE_LABEL, DIATONIC_STEPS, SELF_FACTOR, GROUP_DEF, MOD_BADGE,
    ATOM_VALUE, ATOM_NAME, ATOM_DIR, ASCEND_ATOMS, DESCEND_ATOMS,
    degreeSemitone, neumeInterval, neumeName
  });

})(window.Psaltiki = window.Psaltiki || {});
