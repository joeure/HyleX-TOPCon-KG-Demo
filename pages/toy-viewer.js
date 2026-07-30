async function loadToy(){
  const script = document.currentScript instanceof HTMLScriptElement
    ? new URL(document.currentScript.src)
    : new URL('./toy-viewer.js', document.baseURI);
  const dataUrl = file => new URL(`toy-data/${file}`, new URL('.', script)).href;
  const read = async file => {
    const response = await fetch(dataUrl(file), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Toy data request failed (${response.status})`);
    return response.text();
  };
  const [entities, relations, chunks] = await Promise.all([
    read('entities.jsonl'),
    read('relations.jsonl'),
    read('chunks.jsonl')
  ]);
  const count = text => text.trim() ? text.trim().split(/\n+/).length : 0;
  document.querySelector('#stats').innerHTML = [['Entities',count(entities)],['Relations',count(relations)],['Chunks',count(chunks)]].map(([name,value])=>`<div class="stat"><strong>${value}</strong>${name}</div>`).join('');
  const first = chunks.trim().split(/\n+/)[0];
  document.querySelector('#preview').textContent = first ? JSON.stringify(JSON.parse(first), null, 2) : 'No synthetic chunks found.';
}
loadToy().catch(error => { document.querySelector('#preview').textContent = 'Toy data unavailable: ' + error.message; });
