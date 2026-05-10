import { useState, useCallback } from 'react';
import { Search, FileText } from 'lucide-react';
import type { SearchResult } from '../types';
import { api } from '../api/client';

interface Props {
  entryId: string;
  onSelectFile: (path: string) => void;
}

export default function SearchBar({ entryId, onSelectFile }: Props) {
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
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search documentation..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        )}
      </div>

      {open && results.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-auto">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onSelectFile(r.path); setOpen(false); }}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 w-full text-left cursor-pointer"
              >
                <FileText size={16} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{r.snippet}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {open && query && !loading && results.length === 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-sm text-gray-500">
            No results found for &ldquo;{query}&rdquo;
          </div>
        </>
      )}
    </div>
  );
}
