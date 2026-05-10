import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, X } from 'lucide-react';

interface GlobalResult {
  entryId: string;
  entryName: string;
  entryVersion: string;
  path: string;
  title: string;
  headings: string[];
  snippet: string;
}

export default function GlobalSearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults(data);
      setOpen(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => doSearch(value), 300);
    setDebounceTimer(timer);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (result: GlobalResult) => {
    setOpen(false);
    setQuery('');
    navigate(`/entries/${result.entryId}?doc=${encodeURIComponent(result.path)}`);
  };

  const groupedResults: Array<{ entryId: string; entryName: string; entryVersion: string; items: GlobalResult[] }> = [];
  for (const r of results) {
    let group = groupedResults.find((g) => g.entryId === r.entryId);
    if (!group) {
      group = { entryId: r.entryId, entryName: r.entryName, entryVersion: r.entryVersion, items: [] };
      groupedResults.push(group);
    }
    group.items.push(r);
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-xl">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          placeholder="Search all docs..."
          className="w-full pl-9 pr-16 py-1.5 bg-surface ring-1 ring-border rounded-md text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
        {loading && (
          <div className="absolute right-12 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        )}
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text transition-colors"
          >
            <X size={13} />
          </button>
        )}
        {!query && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-text-muted bg-bg-alt ring-1 ring-border rounded">
              ⌘K
            </kbd>
          </div>
        )}
      </div>

      {open && groupedResults.length > 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 top-full mt-1.5 bg-surface ring-1 ring-border rounded-xl shadow-xl max-h-96 overflow-auto">
            {groupedResults.map((group) => (
              <div key={group.entryId}>
                <div className="px-3 py-1.5 text-[11px] font-semibold text-text-muted uppercase tracking-wider bg-bg-alt/50 border-b border-border">
                  {group.entryName} <span className="font-normal lowercase text-text-dim">({group.entryVersion})</span>
                </div>
                {group.items.map((r, i) => (
                  <button
                    key={`${group.entryId}-${i}`}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className="flex items-start gap-2.5 px-3 py-2.5 hover:bg-bg-alt transition-colors border-b border-border last:border-b-0 w-full text-left cursor-pointer"
                  >
                    <FileText size={14} className="text-text-muted mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text truncate">{r.title}</div>
                      <div className="text-xs text-text-dim mt-0.5 line-clamp-2">{r.snippet}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

      {open && query && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-50 top-full mt-1.5 bg-surface ring-1 ring-border rounded-xl shadow-xl p-4 text-center text-sm text-text-dim">
            No results found for &ldquo;{query}&rdquo;
          </div>
        </>
      )}
    </div>
  );
}
