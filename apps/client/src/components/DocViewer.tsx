import { useState, useEffect } from 'react';
import { ExternalLink, Maximize2, Minimize2, FileWarning, FileText } from 'lucide-react';
import { api } from '../api/client';

interface Props {
  entryId: string;
  selectedFile?: string;
}

export default function DocViewer({ entryId, selectedFile }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState(false);
  const url = selectedFile
    ? `${api.bundleUrl(entryId)}${selectedFile}`
    : api.bundleUrl(entryId);

  useEffect(() => { setError(false); }, [selectedFile]);

  if (!selectedFile) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-alt flex items-center justify-center">
          <FileText size={26} className="text-text-muted" />
        </div>
        <div>
          <p className="text-sm text-text-dim font-medium">No document selected</p>
          <p className="text-xs text-text-muted mt-1">Search for a document and click a result to view it here.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-bg-alt flex items-center justify-center">
          <FileWarning size={26} className="text-text-muted" />
        </div>
        <div>
          <p className="text-sm text-text-dim font-medium">Could not load document</p>
          <p className="text-xs text-text-muted mt-1">The documentation may not be built yet. Click &ldquo;Build&rdquo; to generate it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${expanded ? 'fixed inset-0 z-40 bg-bg p-4' : ''}`}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className="text-xs text-text-muted font-mono truncate flex-1">{selectedFile}</span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
          title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 rounded text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
          title="Open in new tab"
        >
          <ExternalLink size={14} />
        </a>
      </div>
      <iframe
        src={url}
        onError={() => setError(true)}
        className="flex-1 w-full ring-1 ring-border rounded-lg bg-surface min-h-0"
        title="Documentation Viewer"
      />
    </div>
  );
}
