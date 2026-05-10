import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Play, Download, Plus,
  Package, GitBranch, FileArchive, FileText, ChevronDown, Loader2,
  CheckCircle, AlertCircle, Clock, MoreHorizontal,
} from 'lucide-react';
import type { EntryDetail as EntryDetailType, Source, SourceType, SourceConfig } from '../types';
import { api } from '../api/client';
import SourceForm from './SourceForm';
import BuildPanel from './BuildPanel';
import SearchBar from './SearchBar';
import DocViewer from './DocViewer';

const TYPE_ICONS: Record<SourceType, typeof Package> = {
  zip: FileArchive,
  antora: GitBranch,
  maven: Package,
  asciidoc: FileText,
};

const TYPE_LABELS: Record<SourceType, string> = {
  zip: 'ZIP',
  antora: 'Antora',
  maven: 'Maven',
  asciidoc: 'AsciiDoc',
};

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  pending:  { icon: Clock, color: 'text-gray-400', bg: 'bg-gray-100', label: 'Pending' },
  building: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Building' },
  ready:    { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50', label: 'Ready' },
  error:    { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Error' },
};

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [entry, setEntry] = useState<EntryDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [buildKey, setBuildKey] = useState(0);
  const [sourceMenuOpen, setSourceMenuOpen] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);

  const fetchEntry = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.entries.get(id);
      setEntry(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchEntry(); }, [fetchEntry]);

  const handleDeleteEntry = async () => {
    if (!entry) return;
    if (!confirm(`Delete entry "${entry.name}" and all its data permanently?`)) return;
    try {
      await api.entries.delete(entry.id);
      navigate('/');
    } catch (err) {
      alert(`Failed to delete: ${(err as Error).message}`);
    }
  };

  const handleAddSource = async (data: { type: SourceType; label: string; config: SourceConfig }) => {
    if (!entry) return;
    await api.sources.create(entry.id, data);
    await fetchEntry();
  };

  const handleEditSource = async (data: { type: SourceType; label: string; config: SourceConfig }) => {
    if (!editingSource) return;
    await api.sources.update(editingSource.id, { label: data.label, config: data.config });
    setEditingSource(null);
    await fetchEntry();
  };

  const handleDeleteSource = async (source: Source) => {
    if (!confirm(`Remove source "${source.label}"?`)) return;
    await api.sources.delete(source.id);
    await fetchEntry();
  };

  const handleBuild = async () => {
    if (!entry) return;
    try {
      await api.build.trigger(entry.id);
      setBuildKey((k) => k + 1);
      await fetchEntry();
    } catch (err) {
      alert(`Build failed: ${(err as Error).message}`);
    }
  };

  const handleDownloadScript = async () => {
    if (!entry) return;
    try {
      const script = await api.build.cliScript(entry.id);
      const blob = new Blob([script], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      a.download = `dockit-build-${slug}.sh`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Failed to generate script: ${(err as Error).message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertCircle size={32} className="text-red-400" />
        <p className="text-sm text-red-600">{error || 'Entry not found'}</p>
        <Link to="/" className="text-sm text-primary hover:underline">Back to entries</Link>
      </div>
    );
  }

  const status = statusConfig[entry.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-gray-900 truncate">{entry.name}</h1>
          <p className="text-sm text-gray-500 font-mono">{entry.version}</p>
        </div>
        <Link
          to={`/entries/${entry.id}/edit`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Pencil size={15} />
          Edit
        </Link>
        <button
          onClick={handleDeleteEntry}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <Trash2 size={15} />
          Delete
        </button>
      </div>

      {entry.description && (
        <p className="text-sm text-gray-500 mb-4">{entry.description}</p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={handleBuild}
          disabled={entry.status === 'building'}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          <Play size={15} />
          Build Now
        </button>
        <button
          onClick={handleDownloadScript}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <Download size={15} />
          Download Script
        </button>
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
          <StatusIcon size={12} className={entry.status === 'building' ? 'animate-spin' : ''} />
          {status.label}
        </span>
      </div>

      {/* Build Panel */}
      <div className="mb-6">
        <BuildPanel entryId={entry.id} refreshKey={buildKey} />
      </div>

      {/* Sources */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Sources ({entry.sources.length})
          </h3>
          <button
            onClick={() => { setEditingSource(null); setSourceFormOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            <Plus size={15} />
            Add Source
          </button>
        </div>

        {entry.sources.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
            <FileArchive size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">No sources added yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add a ZIP, Maven, or Antora source to build documentation.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entry.sources.map((source) => {
              const Icon = TYPE_ICONS[source.type];
              return (
                <div key={source.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <Icon size={18} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{source.label}</p>
                    <p className="text-xs text-gray-400 font-mono truncate">{getConfigSummary(source)}</p>
                  </div>
                  <span className="text-xs text-gray-400 uppercase font-medium">{TYPE_LABELS[source.type]}</span>
                  <div className="relative">
                    <button
                      onClick={() => setSourceMenuOpen(sourceMenuOpen === source.id ? null : source.id)}
                      className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {sourceMenuOpen === source.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setSourceMenuOpen(null)} />
                        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32">
                          <button
                            onClick={() => { setEditingSource(source); setSourceFormOpen(true); setSourceMenuOpen(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { handleDeleteSource(source); setSourceMenuOpen(null); }}
                            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Search</h3>
        <SearchBar entryId={entry.id} onSelectFile={setSelectedFile} />
      </div>

      {/* Doc Viewer */}
      <DocViewer entryId={entry.id} selectedFile={selectedFile} />

      {/* Source Form Modal */}
      <SourceForm
        open={sourceFormOpen}
        onClose={() => { setSourceFormOpen(false); setEditingSource(null); }}
        onCreate={editingSource ? handleEditSource : handleAddSource}
        initial={editingSource ? { type: editingSource.type, label: editingSource.label, config: editingSource.config } : undefined}
      />
    </div>
  );
}

function getConfigSummary(source: Source): string {
  const c = source.config as Record<string, string>;
  switch (source.type) {
    case 'zip': return c.url || '';
    case 'maven': return `${c.groupId || '?'}:${c.artifactId || '?'}:${c.version || '?'}`;
    case 'antora': return c.repoUrl || c.zipPath || '';
    case 'asciidoc': return c.repoUrl || c.zipPath || '';
  }
}
