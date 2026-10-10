/* Renderização da partitura (neumas, melismas, martíria) e destaque durante a reprodução. */
(function (P) {
  "use strict";

  const S = P.state;
  const NOTE_LABEL = P.NOTE_LABEL, MOD_BADGE = P.MOD_BADGE;
  const neumeName = P.neumeName, neumeInterval = P.neumeInterval;
  const neumeIcon = P.neumeIcon, restIcon = P.restIcon;

  const neumeRow = document.getElementById('neumeRow');

  function render(){
    let html = '<div class="martyria-cell"><div class="mart-mode">'+S.mode+'</div><div class="mart-note">'+NOTE_LABEL[S.baseNote]+S.octave+'</div></div>';

    // agrupa notas consecutivas que pertencem à mesma sílaba (melisma) numa
    // única célula visual; cada sinal continua sendo tocado com sua própria
    // duração e continua podendo ser apagado individualmente.
    let i = 0;
    while (i < S.notes.length){
      const n = S.notes[i];
      if (n.kind === 'rest'){
        html += '<div class="neume-cell rest" data-idx="'+i+'"><div class="neume-glyph">'+restIcon(n.len)+'</div><div class="neume-syll">&nbsp;</div></div>';
        i++;
        continue;
      }
      const idxs = [i];
      let j = i+1;
      while (j < S.notes.length && S.notes[j].kind === 'neume' && S.notes[j].synapsis){ idxs.push(j); j++; }

      const syllSource = S.notes[idxs[0]];
      const syll = syllSource.syll ? syllSource.syll.replace(/</g,'&lt;') : '&nbsp;';
      let parts = '';
      idxs.forEach(function(idx){
        const note = S.notes[idx];
        const badge = note.mod !== 'normal' ? '<span class="mod-badge" title="'+note.mod+'">'+MOD_BADGE[note.mod]+'</span>' : '';
        const tooltip = neumeName(note.atoms) + ' (' + (neumeInterval(note)>0?'+':'') + neumeInterval(note) + ')';
        parts += '<span class="glyph-part" data-idx="'+idx+'" title="'+tooltip+'">'+neumeIcon(note.atoms)+badge+'</span>';
      });
      const multiClass = idxs.length > 1 ? ' multi' : '';
      html += '<div class="neume-cell'+multiClass+'"><div class="neume-glyph-group">'+parts+'</div><div class="neume-syll">'+syll+'</div></div>';
      i = j;
    }

    neumeRow.innerHTML = html;

    neumeRow.querySelectorAll('.glyph-part').forEach(function(part){
      part.addEventListener('click', function(ev){
        ev.stopPropagation();
        const i = parseInt(part.getAttribute('data-idx'),10);
        S.notes.splice(i,1);
        render();
      });
    });
    neumeRow.querySelectorAll('.neume-cell.rest').forEach(function(cell){
      cell.addEventListener('click', function(){
        const i = parseInt(cell.getAttribute('data-idx'),10);
        S.notes.splice(i,1);
        render();
      });
    });

    updateMeta();
  }

  function updateMeta(){
    document.getElementById('metaInfo').textContent = S.notes.length + (S.notes.length===1 ? ' neuma' : ' neumas');
    const durSec = P.computeDurations();
    const total = durSec.reduce(function(a,b){ return a+b; }, 0);
    const sec = Math.round(total);
    const mm = Math.floor(sec/60), ss = sec%60;
    document.getElementById('metaDur').textContent = mm+':'+(ss<10?'0':'')+ss+' estimado';
    // redesenha o gráfico de pitch (definido em pitch.js, que carrega depois)
    if (P.drawPitchBands) P.drawPitchBands();
  }

  function clearHighlight(){
    neumeRow.querySelectorAll('.glyph-part.active, .neume-cell.rest.active').forEach(function(c){ c.classList.remove('active'); });
  }
  function highlight(i){
    clearHighlight();
    const c = neumeRow.querySelector('.glyph-part[data-idx="'+i+'"], .neume-cell.rest[data-idx="'+i+'"]');
    if (c) c.classList.add('active');
  }

  Object.assign(P, { render, updateMeta, clearHighlight, highlight });

})(window.Psaltiki = window.Psaltiki || {});
