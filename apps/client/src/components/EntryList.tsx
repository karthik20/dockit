import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen, Clock, CheckCircle, AlertCircle, Loader2, Trash2, Pencil, ArrowRight } from 'lucide-react';
import type { Entry } from '../types';
import { api } from '../api/client';

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  pending:  { icon: Clock, color: 'text-text-muted', bg: 'bg-surface', label: 'Pending' },
  building: { icon: Loader2, color: 'text-warning', bg: 'bg-bg-alt', label: 'Building' },
  ready:    { icon: CheckCircle, color: 'text-success', bg: 'bg-bg-alt', label: 'Ready' },
  error:    { icon: AlertCircle, color: 'text-danger', bg: 'bg-bg-alt', label: 'Error' },
};

export default function EntryList() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const data = await api.entries.list();
      setEntries(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete entry "${name}" and all its data?`)) return;
    try {
      await api.entries.delete(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={32} className="text-danger" />
        <p className="text-sm text-danger">{error}</p>
        <button onClick={fetchEntries} className="text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-5">
        <div className="w-16 h-16 rounded-2xl bg-bg-alt flex items-center justify-center">
          <BookOpen size={28} className="text-text-muted" />
        </div>
        <div className="text-center max-w-xs">
          <h2 className="text-lg font-semibold text-text">No documentation entries yet</h2>
          <p className="text-sm text-text-dim mt-1.5">Create your first entry to start building your documentation hub.</p>
        </div>
        <Link
          to="/entries/new"
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          New Entry
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-text">Documentation Hub</h1>
          <p className="text-sm text-text-dim mt-1">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <Link
          to="/entries/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          New Entry
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map((entry) => {
          const status = statusConfig[entry.status] || statusConfig.pending;
          const StatusIcon = status.icon;
          const animClass = entry.status === 'building' ? 'animate-spin' : '';
          return (
            <div
              key={entry.id}
              className="group bg-surface ring-1 ring-border rounded-xl p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <Link to={`/entries/${entry.id}`} className="no-underline flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text truncate group-hover:text-primary transition-colors">
                      {entry.name}
                    </h3>
                    <ArrowRight size={14} className="text-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                  </div>
                  <p className="text-xs text-text-dim mt-0.5 font-mono">{entry.version}</p>
                </Link>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Link
                    to={`/entries/${entry.id}/edit`}
                    className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(entry.id, entry.name); }}
                    className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/5 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {entry.description && (
                <p className="text-sm text-text-dim mt-2.5 line-clamp-2 leading-relaxed">{entry.description}</p>
              )}
              <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg} ring-1 ring-border`}>
                  <StatusIcon size={11} className={animClass} />
                  {status.label}
                </span>
                {entry.source_count !== undefined && (
                  <span className="text-xs text-text-muted">
                    {entry.source_count} source{entry.source_count !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
