/* Exportar / importar a composição em JSON. */
(function (P) {
  "use strict";

  const S = P.state;

  function exportJSON(){
    const data = { mode:S.mode, baseNote:S.baseNote, octave:S.octave, bpm:S.bpm, isonOn:S.isonOn, notes:S.notes };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'notacao-bizantina.json';
    a.click();
  }

  function importJSON(file){
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(){
      try{
        const data = JSON.parse(reader.result);
        S.mode = data.mode || 'Α΄';
        S.baseNote = data.baseNote || 'Di';
        S.octave = data.octave || 3;
        S.bpm = data.bpm || 80;
        S.isonOn = data.isonOn !== undefined ? data.isonOn : true;
        S.notes = data.notes || [];
        document.getElementById('modeSelect').value = S.mode;
        document.getElementById('baseNoteSelect').value = S.baseNote;
        document.getElementById('octaveInput').value = S.octave;
        document.getElementById('bpmRange').value = S.bpm;
        document.getElementById('bpmVal').textContent = S.bpm;
        document.getElementById('isonCheck').checked = S.isonOn;
        P.render();
      }catch(e){
        alert('Arquivo inválido.');
      }
    };
    reader.readAsText(file);
  }

  Object.assign(P, { exportJSON, importJSON });

})(window.Psaltiki = window.Psaltiki || {});
