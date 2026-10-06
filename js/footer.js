/* Rodapé: reprodução, BPM, ison, desfazer/limpar, exportar/importar e imprimir. */
(function (P) {
  "use strict";

  const S = P.state;
  const bpmRange = document.getElementById('bpmRange');
  const bpmVal = document.getElementById('bpmVal');

  // transporte
  document.getElementById('playBtn').addEventListener('click', P.playAll);
  document.getElementById('stopBtn').addEventListener('click', P.stopPlayback);

  bpmRange.addEventListener('input', function(){
    S.bpm = parseInt(this.value,10);
    bpmVal.textContent = S.bpm;
    P.updateMeta();
  });

  document.getElementById('isonCheck').addEventListener('change', function(){ S.isonOn = this.checked; });

  // edição
  document.getElementById('undoBtn').addEventListener('click', function(){ S.notes.pop(); P.render(); });
  document.getElementById('clearBtn').addEventListener('click', function(){
    if (S.notes.length && !confirm('Limpar toda a composição?')) return;
    S.notes = [];
    P.render();
  });

  // arquivo / impressão
  document.getElementById('exportBtn').addEventListener('click', P.exportJSON);
  document.getElementById('importLabel').addEventListener('click', function(){
    document.getElementById('importInput').click();
  });
  document.getElementById('importInput').addEventListener('change', function(ev){
    P.importJSON(ev.target.files[0]);
    ev.target.value = '';
  });
  document.getElementById('printBtn').addEventListener('click', function(){ window.print(); });

})(window.Psaltiki = window.Psaltiki || {});
