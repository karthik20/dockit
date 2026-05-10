import { useEffect, useState, useRef } from 'react';
import { Terminal, ChevronDown, ChevronRight, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import type { BuildStatusResponse } from '../types';
import { api } from '../api/client';

interface Props {
  entryId: string;
  refreshKey: number;
}

export default function BuildPanel({ entryId, refreshKey }: Props) {
  const [status, setStatus] = useState<BuildStatusResponse | null>(null);
  const [open, setOpen] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await api.build.status(entryId);
        setStatus(data);
        if (data.status === 'building') {
          setOpen(true);
        }
        if (data.status === 'ready' || data.status === 'error') {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
        }
      } catch {
        // ignored
      }
    };
    fetch();
    intervalRef.current = setInterval(fetch, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [entryId, refreshKey]);

  if (!status || status.status === 'none') return null;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <Terminal size={16} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Build Log</span>
        <span className="flex items-center gap-1 ml-auto">
          {status.status === 'building' && <Loader2 size={14} className="animate-spin text-blue-500" />}
          {status.status === 'ready' && <CheckCircle size={14} className="text-green-500" />}
          {status.status === 'error' && <AlertCircle size={14} className="text-red-500" />}
          <span className={`text-xs font-medium ${
            status.status === 'ready' ? 'text-green-600' :
            status.status === 'error' ? 'text-red-600' :
            'text-blue-600'
          }`}>
            {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
          </span>
        </span>
      </button>
      {open && (
        <div className="bg-gray-900 text-green-400 p-4 max-h-64 overflow-auto font-mono text-xs leading-relaxed">
          <pre className="whitespace-pre-wrap">{status.log || 'Waiting for build to start...'}</pre>
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
