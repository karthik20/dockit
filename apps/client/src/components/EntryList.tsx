import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Clock, CheckCircle, AlertCircle, Loader2, Trash2, Package } from 'lucide-react';
import type { Entry } from '../types';
import { api } from '../api/client';

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  pending:  { icon: Clock, color: 'text-text-muted', bg: 'bg-bg-alt', label: 'Pending' },
  building: { icon: Loader2, color: 'text-warning', bg: 'bg-warning/5', label: 'Building' },
  ready:    { icon: CheckCircle, color: 'text-success', bg: 'bg-success/5', label: 'Ready' },
  error:    { icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/5', label: 'Error' },
};

export default function EntryList() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

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

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
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
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={32} className="text-danger" />
        <p className="text-sm text-danger">{error}</p>
        <button onClick={fetchEntries} className="text-sm text-primary hover:underline">Retry</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
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
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-text">Documentation Hub</h1>
          <p className="text-sm text-text-dim mt-0.5">{entries.length} entr{entries.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <Link
          to="/entries/new"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
        >
          <Plus size={15} />
          New Entry
        </Link>
      </div>

      <div className="ring-1 ring-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-bg-alt text-xs text-text-dim uppercase tracking-wider">
              <th className="text-left px-4 py-2.5 font-medium">Name</th>
              <th className="text-left px-4 py-2.5 font-medium w-24">Version</th>
              <th className="text-left px-4 py-2.5 font-medium w-20">Status</th>
              <th className="text-left px-4 py-2.5 font-medium w-20">Sources</th>
              <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Description</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const status = statusConfig[entry.status] || statusConfig.pending;
              const StatusIcon = status.icon;
              const animClass = entry.status === 'building' ? 'animate-spin' : '';
              return (
                <tr
                  key={entry.id}
                  onClick={() => navigate(`/entries/${entry.id}`)}
                  className="border-t border-border hover:bg-bg-alt/50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-text group-hover:text-primary transition-colors">
                      {entry.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-dim font-mono">{entry.version}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
                      <StatusIcon size={11} className={animClass} />
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-text-dim">
                      {entry.source_count ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-text-dim truncate block max-w-xs">
                      {entry.description || '—'}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={(e) => handleDelete(e, entry.id, entry.name)}
                      className="p-1 rounded text-text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
