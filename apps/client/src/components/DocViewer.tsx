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
    <div className={`${expanded ? 'fixed inset-0 z-40 bg-white' : ''}`}>
      <div className={`flex items-center justify-between ${expanded ? 'h-12 px-4 border-b border-gray-200' : 'mb-3'}`}>
        <h3 className="text-sm font-semibold text-gray-700">
          Documentation Viewer
          {selectedFile && (
            <span className="ml-2 text-xs font-normal text-gray-400 font-mono truncate inline-block max-w-[200px] align-bottom">
              {selectedFile}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title={expanded ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Open in new tab"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {!selectedFile ? (
        <div className={`flex flex-col items-center justify-center gap-2 text-center ${expanded ? 'h-[calc(100%-3rem)]' : 'h-64'} bg-gray-50 rounded-lg border border-gray-200`}>
          <FileText size={32} className="text-gray-300" />
          <p className="text-sm text-gray-500">Select a document from search results</p>
          <p className="text-xs text-gray-400">Use the search bar above to find and view documentation.</p>
        </div>
      ) : error ? (
        <div className={`flex flex-col items-center justify-center gap-2 text-center ${expanded ? 'h-[calc(100%-3rem)]' : 'h-64'} bg-gray-50 rounded-lg border border-gray-200`}>
          <FileWarning size={32} className="text-gray-300" />
          <p className="text-sm text-gray-500">Documentation not built yet.</p>
          <p className="text-xs text-gray-400">Click &ldquo;Build Now&rdquo; to generate the documentation.</p>
        </div>
      ) : (
        <iframe
          src={url}
          onError={() => setError(true)}
          className={`w-full border border-gray-200 rounded-lg bg-white ${expanded ? 'h-[calc(100%-3rem)]' : 'h-[70vh]'}`}
          title="Documentation Viewer"
        />
      )}
    </div>
  );
}
