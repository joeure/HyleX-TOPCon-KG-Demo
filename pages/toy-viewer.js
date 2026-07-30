async function loadToy(){
  const [entities, relations, chunks] = await Promise.all([
    fetch('./toy-data/entities.jsonl').then(r=>r.text()),
    fetch('./toy-data/relations.jsonl').then(r=>r.text()),
    fetch('./toy-data/chunks.jsonl').then(r=>r.text())
  ]);
  const count = text => text.trim() ? text.trim().split(/\n+/).length : 0;
  document.querySelector('#stats').innerHTML = [['Entities',count(entities)],['Relations',count(relations)],['Chunks',count(chunks)]].map(([name,value])=>`<div class="stat"><strong>${value}</strong>${name}</div>`).join('');
  const first = chunks.trim().split(/\n+/)[0];
  document.querySelector('#preview').textContent = first ? JSON.stringify(JSON.parse(first), null, 2) : 'No synthetic chunks found.';
}
loadToy().catch(error => { document.querySelector('#preview').textContent = 'Toy data unavailable: ' + error.message; });
