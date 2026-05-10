import { useState, useCallback } from 'react';
import { Search, FileText, Filter } from 'lucide-react';
import type { SearchResult } from '../types';
import { api } from '../api/client';

interface Props {
  entryId: string;
  onSelectFile: (path: string) => void;
  scopeLabel?: string;
}

export default function SearchBar({ entryId, onSelectFile, scopeLabel }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.search(entryId, q);
      setResults(data);
      setOpen(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  const handleChange = (value: string) => {
    setQuery(value);
    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => doSearch(value), 300);
    setDebounceTimer(timer);
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        {scopeLabel && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-text-muted bg-bg-alt ring-1 ring-border shrink-0">
            <Filter size={10} />
            {scopeLabel}
          </span>
        )}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search documentation..."
            className="w-full pl-10 pr-3 py-2.5 bg-surface ring-1 ring-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-2 w-full bg-surface ring-1 ring-border rounded-xl shadow-lg max-h-80 overflow-auto">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onSelectFile(r.path); setOpen(false); }}
                className="flex items-start gap-3 px-4 py-3 hover:bg-bg-alt transition-colors border-b border-border last:border-b-0 w-full text-left cursor-pointer"
              >
                <FileText size={16} className="text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text truncate">{r.title}</div>
                  <div className="text-xs text-text-dim mt-0.5 line-clamp-2">{r.snippet}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {open && query && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-2 w-full bg-surface ring-1 ring-border rounded-xl shadow-lg p-4 text-center text-sm text-text-dim">
            No results found for &ldquo;{query}&rdquo;
          </div>
        </>
      )}
    </div>
  );
}
