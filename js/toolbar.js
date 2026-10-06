/* Painel lateral: sinais rápidos, combinador, duração, sílaba, pausas, ἦχος e nota base. */
(function (P) {
  "use strict";

  const S = P.state;
  const ATOM_VALUE = P.ATOM_VALUE, ATOM_NAME = P.ATOM_NAME, ATOM_DIR = P.ATOM_DIR;
  const ASCEND_ATOMS = P.ASCEND_ATOMS, DESCEND_ATOMS = P.DESCEND_ATOMS;
  const neumeIcon = P.neumeIcon;

  // ---------- toolbar: grid de sinais atômicos (clique rápido) ----------
  const QUICK_ATOMS = ['ypsili','kentima','oligon','ison','Petasti','apostrophos','elaphron','hamile'];
  const intGrid = document.getElementById('intGrid');
  QUICK_ATOMS.forEach(function(key){
    const v = ATOM_VALUE[key];
    const btn = document.createElement('button');
    btn.className = 'int-btn';
    btn.innerHTML = neumeIcon([key]) + '<small>'+ATOM_NAME[key]+'</small><span class="num">'+(v>0?'+':'')+v+'</span>';
    btn.addEventListener('click', function(){
      addNeume([key]);
    });
    intGrid.appendChild(btn);
  });

  function addNeume(atoms){
    let syll = '';
    let synapsis = false;
    if (S.armedSyll){
      if (!S.syllConsumed){ syll = S.armedSyll; S.syllConsumed = true; }
      else { synapsis = true; }
    }
    S.notes.push({ kind:'neume', atoms:atoms, mod:S.currentMod, syll:syll, synapsis:synapsis });
    P.render();
  }

  // ---------- toolbar: combinador de sinais ----------
  const ALL_COMBO_ATOMS = ['ison'].concat(ASCEND_ATOMS, DESCEND_ATOMS);
  const comboCount = { ison:0, oligon:0, kentima:0, Petasti: 0, ypsili:0, apostrophos:0, elaphron:0, hamile:0 };
  const comboGrid = document.getElementById('comboGrid');
  const comboButtons = {};

  ALL_COMBO_ATOMS.forEach(function(key){
    const btn = document.createElement('button');
    btn.className = 'combo-atom-btn';
    btn.innerHTML = neumeIcon([key]) + '<small>'+ATOM_NAME[key]+'</small>';
    btn.addEventListener('click', function(){
      if (key === 'ison'){
        // o ison não tem direção própria: pode acompanhar sinais de subida
        // ou de descida (ex.: Ἴσον+Ὀλίγον), por isso não zera nada.
        comboCount.ison = comboCount.ison ? 0 : 1;
      } else {
        const dir = ATOM_DIR[key];
        // um único neuma bizantino move-se numa só direção: escolher um sinal
        // de um lado zera os sinais do lado oposto (o ison fica intacto).
        (dir > 0 ? DESCEND_ATOMS : ASCEND_ATOMS).forEach(function(k){ comboCount[k] = 0; });
        comboCount[key] = (comboCount[key] + 1) % 3; // 0,1,2 (ypsili×2 = oitava)
      }
      renderCombo();
    });
    comboGrid.appendChild(btn);
    comboButtons[key] = btn;
  });

  function currentComboAtoms(){
    let atoms = [];
    ALL_COMBO_ATOMS.forEach(function(key){
      for (let i=0;i<comboCount[key];i++) atoms.push(key);
    });
    return atoms;
  }

  function renderCombo(){
    ALL_COMBO_ATOMS.forEach(function(key){
      const btn = comboButtons[key];
      const badge = btn.querySelector('.combo-count');
      if (badge) badge.remove();
      if (comboCount[key] > 0){
        btn.classList.add('on');
        if (comboCount[key] > 1){
          const b = document.createElement('span');
          b.className = 'combo-count';
          b.textContent = '×'+comboCount[key];
          btn.appendChild(b);
        }
      } else {
        btn.classList.remove('on');
      }
    });
    const atoms = currentComboAtoms();
    const total = atoms.reduce(function(s,k){ return s + ATOM_VALUE[k]; }, 0);
    document.getElementById('comboPreviewIcon').innerHTML = atoms.length ? neumeIcon(atoms) : neumeIcon(['ison']);
    document.getElementById('comboPreviewVal').textContent = (total>0?'+':'') + total;
  }

  document.getElementById('comboAddBtn').addEventListener('click', function(){
    const atoms = currentComboAtoms();
    if (!atoms.length) return;
    addNeume(atoms);
    ALL_COMBO_ATOMS.forEach(function(k){ comboCount[k]=0; });
    renderCombo();
  });
  document.getElementById('comboClearBtn').addEventListener('click', function(){
    ALL_COMBO_ATOMS.forEach(function(k){ comboCount[k]=0; });
    renderCombo();
  });
  renderCombo();

  document.querySelectorAll('[data-mod]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('[data-mod]').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      S.currentMod = btn.getAttribute('data-mod');
    });
  });

  document.getElementById('syllInput').addEventListener('input', function(){
    S.armedSyll = this.value;
    S.syllConsumed = false;
  });
  document.getElementById('newSyllBtn').addEventListener('click', function(){
    S.armedSyll = '';
    S.syllConsumed = false;
    document.getElementById('syllInput').value = '';
  });

  document.getElementById('restShort').addEventListener('click', function(){
    S.notes.push({ kind:'rest', len:'short' });
    S.armedSyll = '';
    S.syllConsumed = false;
    document.getElementById('syllInput').value = '';
    P.render();
  });
  document.getElementById('restLong').addEventListener('click', function(){
    S.notes.push({ kind:'rest', len:'long' });
    S.armedSyll = '';
    S.syllConsumed = false;
    document.getElementById('syllInput').value = '';
    P.render();
  });

  document.getElementById('modeSelect').addEventListener('change', function(){ S.mode = this.value; P.render(); });
  document.getElementById('baseNoteSelect').addEventListener('change', function(){ S.baseNote = this.value; P.render(); });
  document.getElementById('octaveInput').addEventListener('change', function(){
    S.octave = Math.max(1, Math.min(6, parseInt(this.value,10) || 3));
    this.value = S.octave;
    P.render();
  });

  P.addNeume = addNeume;

})(window.Psaltiki = window.Psaltiki || {});
