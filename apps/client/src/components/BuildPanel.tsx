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

  const accentColor = status.status === 'ready' ? 'bg-success' :
                      status.status === 'error' ? 'bg-danger' : 'bg-warning';

  return (
    <div className="bg-surface ring-1 ring-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-bg-alt transition-colors text-left"
      >
        {open ? <ChevronDown size={16} className="text-text-muted" /> : <ChevronRight size={16} className="text-text-muted" />}
        <Terminal size={16} className="text-text-dim" />
        <span className="text-sm font-medium text-text">Build Log</span>
        <span className="flex items-center gap-1.5 ml-auto">
          {status.status === 'building' && <Loader2 size={14} className="animate-spin text-warning" />}
          {status.status === 'ready' && <CheckCircle size={14} className="text-success" />}
          {status.status === 'error' && <AlertCircle size={14} className="text-danger" />}
          <span className={`text-xs font-medium ${
            status.status === 'ready' ? 'text-success' :
            status.status === 'error' ? 'text-danger' :
            'text-warning'
          }`}>
            {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
          </span>
        </span>
      </button>
      {open && (
        <div className="relative">
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentColor}`} />
          <div className="bg-terminal-bg text-terminal-fg p-4 pl-5 max-h-72 overflow-auto font-mono text-xs leading-relaxed">
            <pre className="whitespace-pre-wrap">{status.log || 'Waiting for build to start...'}</pre>
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
