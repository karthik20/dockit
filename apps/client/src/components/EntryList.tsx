import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen, Clock, CheckCircle, AlertCircle, Loader2, Trash2, Pencil } from 'lucide-react';
import type { Entry } from '../types';
import { api } from '../api/client';

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  pending:  { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-100', label: 'Pending' },
  building: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Building' },
  ready:    { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Ready' },
  error:    { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Error' },
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
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={fetchEntries} className="text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <BookOpen size={40} className="text-gray-300" />
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-700">No documentation entries yet</h2>
          <p className="text-sm text-gray-500 mt-1">Create your first entry to start building your documentation hub.</p>
        </div>
        <Link
          to="/entries/new"
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} />
          New Entry
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Documentation Hub</h1>
        <Link
          to="/entries/new"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
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
              className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <Link to={`/entries/${entry.id}`} className="no-underline flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate hover:text-primary transition-colors">
                    {entry.name}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5 font-mono">{entry.version}</p>
                </Link>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-3">
                  <Link
                    to={`/entries/${entry.id}/edit`}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </Link>
                  <button
                    onClick={(e) => { e.preventDefault(); handleDelete(entry.id, entry.name); }}
                    className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {entry.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{entry.description}</p>
              )}
              <div className="flex items-center gap-3 mt-3">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
                  <StatusIcon size={12} className={animClass} />
                  {status.label}
                </span>
                {entry.source_count !== undefined && (
                  <span className="text-xs text-gray-400">
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
