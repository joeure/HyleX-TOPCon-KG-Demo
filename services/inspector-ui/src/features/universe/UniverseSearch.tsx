import { useState, type FormEvent, type ReactElement } from "react";

export type UniverseSearchResult = { id: string; label: string; kind: string };

export function UniverseSearch({ onSearch, onClear, results = [], onSelectResult }: { onSearch: (query: string) => Promise<unknown>; onClear: () => void; results?: UniverseSearchResult[]; onSelectResult?: (id: string) => void }): ReactElement {
  const [query, setQuery] = useState("");
  const submit = (event: FormEvent): void => { event.preventDefault(); if (query.trim()) void onSearch(query); };
  return <div className="universe-search-wrap"><form className="universe-search" onSubmit={submit}><input aria-label="Search Universe" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search concepts, entities, evidence" /><button type="submit">Search</button><button type="button" aria-label="Clear search" onClick={() => { setQuery(""); onClear(); }}>Clear</button></form>{results.length > 0 && <div className="universe-search-results" role="listbox" aria-label="Universe search results">{results.map((result) => <button key={result.id} type="button" role="option" aria-label={`Open ${result.label}`} onClick={() => onSelectResult?.(result.id)}><span>{result.label}</span><small>{result.kind}</small></button>)}</div>}</div>;
}
