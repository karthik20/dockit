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

  return (
    <div className={`${expanded ? 'fixed inset-0 z-40 bg-bg' : ''}`}>
      <div className={`flex items-center justify-between ${expanded ? 'h-14 px-4 border-b border-border' : 'mb-3'}`}>
        <h3 className="text-sm font-semibold text-text">
          Documentation Viewer
          {selectedFile && (
            <span className="ml-2 text-xs font-normal text-text-muted font-mono truncate inline-block max-w-[240px] align-bottom">
              {selectedFile}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
            title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-alt transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {!selectedFile ? (
        <div className={`flex flex-col items-center justify-center gap-3 text-center ${expanded ? 'h-[calc(100%-3.5rem)]' : 'h-64'} bg-bg-alt rounded-xl ring-1 ring-border`}>
          <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center">
            <FileText size={24} className="text-text-muted" />
          </div>
          <div>
            <p className="text-sm text-text-dim">Select a document from search results</p>
            <p className="text-xs text-text-muted mt-0.5">Use the search bar above to find and view documentation.</p>
          </div>
        </div>
      ) : error ? (
        <div className={`flex flex-col items-center justify-center gap-3 text-center ${expanded ? 'h-[calc(100%-3.5rem)]' : 'h-64'} bg-bg-alt rounded-xl ring-1 ring-border`}>
          <div className="w-12 h-12 rounded-xl bg-surface flex items-center justify-center">
            <FileWarning size={24} className="text-text-muted" />
          </div>
          <div>
            <p className="text-sm text-text-dim">Documentation not built yet.</p>
            <p className="text-xs text-text-muted mt-0.5">Click &ldquo;Build Now&rdquo; to generate the documentation.</p>
          </div>
        </div>
      ) : (
        <iframe
          src={url}
          onError={() => setError(true)}
          className={`w-full ring-1 ring-border rounded-xl bg-surface ${expanded ? 'h-[calc(100%-3.5rem)]' : 'h-[70vh]'}`}
          title="Documentation Viewer"
        />
      )}
    </div>
  );
}
