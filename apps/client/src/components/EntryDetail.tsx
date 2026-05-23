import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Pencil, Trash2, Play, Download, Plus,
  Package, GitBranch, FileArchive, FileText, Github, Loader2,
  CheckCircle, AlertCircle, Clock, MoreHorizontal, FileCode, Network,
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
  'github-markdown': Github,
  'source-code': FileCode,
};

const TYPE_LABELS: Record<SourceType, string> = {
  zip: 'ZIP',
  antora: 'Antora',
  maven: 'Maven',
  asciidoc: 'AsciiDoc',
  'github-markdown': 'GitHub Markdown',
  'source-code': 'Source Code',
};

const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  pending:  { icon: Clock, color: 'text-text-muted', bg: 'bg-bg-alt', label: 'Pending' },
  building: { icon: Loader2, color: 'text-warning', bg: 'bg-warning/5', label: 'Building' },
  ready:    { icon: CheckCircle, color: 'text-success', bg: 'bg-success/5', label: 'Ready' },
  error:    { icon: AlertCircle, color: 'text-danger', bg: 'bg-danger/5', label: 'Error' },
};

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [entry, setEntry] = useState<EntryDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceFormOpen, setSourceFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [formRevision, setFormRevision] = useState(0);
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

  useEffect(() => {
    const doc = searchParams.get('doc');
    if (doc) {
      setSelectedFile(doc);
    }
  }, [searchParams]);

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
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <AlertCircle size={32} className="text-danger" />
        <p className="text-sm text-danger">{error || 'Entry not found'}</p>
        <Link to="/" className="text-sm text-primary hover:underline">Back to entries</Link>
      </div>
    );
  }

  const status = statusConfig[entry.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="flex h-full">
      {/* Left panel: config */}
      <div className="w-[420px] shrink-0 border-r border-border overflow-auto p-5">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-bg-alt transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-text truncate">{entry.name}</h1>
          </div>
          <Link
            to={`/entries/${entry.id}/edit`}
            className="p-1.5 rounded-md text-text-dim hover:text-text hover:bg-bg-alt transition-colors"
            title="Edit"
          >
            <Pencil size={14} />
          </Link>
          <button
            onClick={handleDeleteEntry}
            className="p-1.5 rounded-md text-text-dim hover:text-danger hover:bg-danger/5 transition-colors"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-text-dim font-mono bg-bg-alt px-2 py-0.5 rounded">{entry.version}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${status.color} ${status.bg}`}>
            <StatusIcon size={11} className={entry.status === 'building' ? 'animate-spin' : ''} />
            {status.label}
          </span>
        </div>

        {entry.description && (
          <p className="text-sm text-text-dim mb-4 leading-relaxed">{entry.description}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={handleBuild}
            disabled={entry.status === 'building'}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
          >
            <Play size={14} />
            Build
          </button>
          <button
            onClick={handleDownloadScript}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ring-1 ring-border text-text-dim hover:bg-bg-alt hover:text-text transition-colors"
            title="Download CLI script"
          >
            <Download size={14} />
          </button>
        </div>

        {/* Sources */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-xs font-semibold text-text-dim uppercase tracking-wider">
              Sources ({entry.sources.length})
            </h3>
            <button
              onClick={() => { setEditingSource(null); setFormRevision(r => r + 1); setSourceFormOpen(true); }}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus size={12} />
              Add
            </button>
          </div>

          {entry.sources.length === 0 ? (
            <div className="bg-bg-alt ring-1 ring-border rounded-lg p-4 text-center">
              <p className="text-xs text-text-muted">No sources yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {entry.sources.map((source) => {
                const Icon = TYPE_ICONS[source.type];
                return (
                  <div key={source.id} className="flex items-center gap-2.5 bg-surface ring-1 ring-border rounded-lg px-3 py-2 group/src">
                    <Icon size={14} className="text-text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{source.label}</p>
                      <p className="text-[11px] text-text-muted font-mono truncate">{getConfigSummary(source)}</p>
                    </div>
                    <span className="text-[10px] text-text-muted uppercase tracking-wider shrink-0">{TYPE_LABELS[source.type]}</span>
                    {Boolean((source.config as Record<string, unknown>)?.graphifyEnabled) && (
                      <Network size={11} className="text-accent shrink-0" aria-label="Knowledge graph enabled" />
                    )}
                    <div className="relative">
                      <button
                        onClick={() => setSourceMenuOpen(sourceMenuOpen === source.id ? null : source.id)}
                        className="p-1 rounded text-text-muted hover:text-text opacity-0 group-hover/src:opacity-100 transition-all"
                      >
                        <MoreHorizontal size={13} />
                      </button>
                      {sourceMenuOpen === source.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setSourceMenuOpen(null)} />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-surface ring-1 ring-border rounded-lg shadow-lg py-1 w-28">
                            <button
                              onClick={() => { setEditingSource(source); setFormRevision(r => r + 1); setSourceFormOpen(true); setSourceMenuOpen(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-bg-alt transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => { handleDeleteSource(source); setSourceMenuOpen(null); }}
                              className="w-full text-left px-3 py-1.5 text-xs text-danger hover:bg-danger/5 transition-colors"
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

        {/* Build Log */}
        <BuildPanel entryId={entry.id} refreshKey={buildKey} />
      </div>

      {/* Right panel: search + viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <SearchBar entryId={entry.id} onSelectFile={setSelectedFile} scopeLabel="Entry only" />
        </div>
        <div className="flex-1 overflow-auto p-4">
          <DocViewer entryId={entry.id} selectedFile={selectedFile} />
        </div>
      </div>

      <SourceForm
        key={formRevision}
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
    case 'zip': return c.localPath || c.url || '';
    case 'maven': return `${c.groupId || '?'}:${c.artifactId || '?'}:${c.version || '?'}`;
    case 'antora': return c.localPath || c.repoUrl || c.zipPath || '';
    case 'asciidoc': return c.localPath || c.repoUrl || c.zipPath || '';
    case 'github-markdown': return c.localPath || c.repoUrl || '';
    case 'source-code': return c.localPath || c.repoUrl || c.zipPath || '';
  }
}
