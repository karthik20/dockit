import { useState } from 'react';
import type { SourceType, SourceConfig } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { type: SourceType; label: string; config: SourceConfig }) => Promise<void>;
  initial?: { type: SourceType; label: string; config: SourceConfig };
}

const TYPE_LABELS: Record<SourceType, string> = {
  zip: 'ZIP Bundle',
  antora: 'Antora',
  maven: 'Maven',
  asciidoc: 'AsciiDoc',
};

type ZipMode = 'remote' | 'local';
type MavenMode = 'direct' | 'cli' | 'localJar';
type RepoMode = 'git' | 'localDir' | 'zipFile';

export default function SourceForm({ open, onClose, onCreate, initial }: Props) {
  const [type, setType] = useState<SourceType>(initial?.type || 'zip');
  const [label, setLabel] = useState(initial?.label || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function getInitialMode(): ZipMode {
    if (initial?.config && (initial.config as Record<string, unknown>).localPath) return 'local';
    return 'remote';
  }
  function getInitialMavenMode(): MavenMode {
    if (initial?.config && (initial.config as Record<string, unknown>).localJar) return 'localJar';
    if (initial?.config && (initial.config as Record<string, unknown>).useMavenCommand) return 'cli';
    return 'direct';
  }
  function getInitialRepoMode(): RepoMode {
    const c = initial?.config as Record<string, unknown> | undefined;
    if (c?.localPath) return 'localDir';
    if (c?.zipPath && !c?.repoUrl) return 'zipFile';
    return 'git';
  }

  const [zipMode, setZipMode] = useState<ZipMode>(getInitialMode());
  const [mavenMode, setMavenMode] = useState<MavenMode>(getInitialMavenMode());
  const [antoraMode, setAntoraMode] = useState<RepoMode>(getInitialRepoMode());
  const [adocMode, setAdocMode] = useState<RepoMode>(getInitialRepoMode());

  const [zipUrl, setZipUrl] = useState((initial?.config as { url?: string })?.url || '');
  const [zipLocalPath, setZipLocalPath] = useState((initial?.config as { localPath?: string })?.localPath || '');
  const [antoraRepoUrl, setAntoraRepoUrl] = useState((initial?.config as { repoUrl?: string })?.repoUrl || '');
  const [antoraZipPath, setAntoraZipPath] = useState((initial?.config as { zipPath?: string })?.zipPath || '');
  const [antoraLocalPath, setAntoraLocalPath] = useState((initial?.config as { localPath?: string })?.localPath || '');
  const [mavenGroupId, setMavenGroupId] = useState((initial?.config as { groupId?: string })?.groupId || '');
  const [mavenArtifactId, setMavenArtifactId] = useState((initial?.config as { artifactId?: string })?.artifactId || '');
  const [mavenVersion, setMavenVersion] = useState((initial?.config as { version?: string })?.version || '');
  const [mavenClassifier, setMavenClassifier] = useState((initial?.config as { classifier?: string })?.classifier || 'javadoc');
  const [mavenLocalJar, setMavenLocalJar] = useState((initial?.config as { localJar?: string })?.localJar || '');
  const [adocRepoUrl, setAdocRepoUrl] = useState((initial?.config as { repoUrl?: string })?.repoUrl || '');
  const [adocSourcePath, setAdocSourcePath] = useState((initial?.config as { sourcePath?: string })?.sourcePath || '');
  const [adocZipPath, setAdocZipPath] = useState((initial?.config as { zipPath?: string })?.zipPath || '');
  const [adocLocalPath, setAdocLocalPath] = useState((initial?.config as { localPath?: string })?.localPath || '');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let config: SourceConfig;
    switch (type) {
      case 'zip':
        if (zipMode === 'remote') {
          if (!zipUrl.trim()) { setError('URL is required'); return; }
          config = { url: zipUrl.trim() };
        } else {
          if (!zipLocalPath.trim()) { setError('Local path is required'); return; }
          config = { localPath: zipLocalPath.trim() };
        }
        break;
      case 'antora':
        if (antoraMode === 'git') {
          if (!antoraRepoUrl.trim()) { setError('Repository URL is required'); return; }
          config = { repoUrl: antoraRepoUrl.trim() };
        } else if (antoraMode === 'localDir') {
          if (!antoraLocalPath.trim()) { setError('Local path is required'); return; }
          config = { localPath: antoraLocalPath.trim() };
        } else {
          if (!antoraZipPath.trim()) { setError('ZIP path is required'); return; }
          config = { zipPath: antoraZipPath.trim() };
        }
        break;
      case 'maven':
        if (!mavenGroupId.trim() || !mavenArtifactId.trim() || !mavenVersion.trim()) {
          setError('Group ID, Artifact ID, and Version are required');
          return;
        }
        if (mavenMode === 'direct') {
          config = { groupId: mavenGroupId.trim(), artifactId: mavenArtifactId.trim(), version: mavenVersion.trim(), classifier: mavenClassifier.trim() || 'javadoc' };
        } else if (mavenMode === 'cli') {
          config = { groupId: mavenGroupId.trim(), artifactId: mavenArtifactId.trim(), version: mavenVersion.trim(), classifier: mavenClassifier.trim() || 'javadoc', useMavenCommand: true };
        } else {
          if (!mavenLocalJar.trim()) { setError('Local JAR path is required'); return; }
          config = { groupId: mavenGroupId.trim(), artifactId: mavenArtifactId.trim(), version: mavenVersion.trim(), classifier: mavenClassifier.trim() || 'javadoc', localJar: mavenLocalJar.trim() };
        }
        break;
      case 'asciidoc':
        if (adocMode === 'git') {
          if (!adocRepoUrl.trim()) { setError('Repository URL is required'); return; }
          config = { repoUrl: adocRepoUrl.trim(), sourcePath: adocSourcePath.trim() || undefined };
        } else if (adocMode === 'localDir') {
          if (!adocLocalPath.trim()) { setError('Local path is required'); return; }
          config = { localPath: adocLocalPath.trim(), sourcePath: adocSourcePath.trim() || undefined };
        } else {
          config = { zipPath: adocZipPath.trim(), sourcePath: adocSourcePath.trim() || undefined };
        }
        break;
    }

    setSaving(true);
    try {
      await onCreate({ type, label: label.trim() || `${TYPE_LABELS[type]} source`, config });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full px-3.5 py-2.5 bg-bg ring-1 ring-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";
  const labelClass = "block text-sm font-medium text-text mb-2";
  const helpClass = "text-xs text-text-muted mt-1.5";

  const modeBtnClass = (active: boolean) =>
    `flex-1 px-2.5 py-2 rounded-lg text-xs font-medium ring-1 transition-all cursor-pointer text-center ${
      active
        ? 'ring-primary bg-primary/10 text-primary'
        : 'ring-border text-text-dim hover:ring-text-muted hover:bg-bg-alt'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface ring-1 ring-border rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-auto">
        <h2 className="text-lg font-semibold text-text mb-1">
          {initial ? 'Edit Source' : 'Add Source'}
        </h2>
        <p className="text-sm text-text-dim mb-5">
          Select the source type and fill in the details.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className={labelClass}>Type</label>
            <div className="flex gap-2">
              {(['zip', 'maven', 'antora', 'asciidoc'] as SourceType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={modeBtnClass(type === t)}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. API Docs" className={inputClass} />
          </div>

          {type === 'zip' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Source</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setZipMode('remote')} className={modeBtnClass(zipMode === 'remote')}>Remote URL</button>
                  <button type="button" onClick={() => setZipMode('local')} className={modeBtnClass(zipMode === 'local')}>Local File</button>
                </div>
              </div>
              {zipMode === 'remote' ? (
                <div>
                  <label className={labelClass}>ZIP URL</label>
                  <input type="url" value={zipUrl} onChange={(e) => setZipUrl(e.target.value)} placeholder="https://example.com/docs.zip" className={inputClass} />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>File Path</label>
                  <input type="text" value={zipLocalPath} onChange={(e) => setZipLocalPath(e.target.value)} placeholder="/home/user/docs.zip" className={inputClass} />
                  <p className={helpClass}>Absolute path on the server to a pre-downloaded ZIP file.</p>
                </div>
              )}
            </div>
          )}

          {type === 'antora' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Source</label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setAntoraMode('git')} className={modeBtnClass(antoraMode === 'git')}>Git Repo</button>
                  <button type="button" onClick={() => setAntoraMode('localDir')} className={modeBtnClass(antoraMode === 'localDir')}>Local Dir</button>
                  <button type="button" onClick={() => setAntoraMode('zipFile')} className={modeBtnClass(antoraMode === 'zipFile')}>ZIP File</button>
                </div>
              </div>
              {antoraMode === 'git' && (
                <div>
                  <label className={labelClass}>Git Repository URL</label>
                  <input type="text" value={antoraRepoUrl} onChange={(e) => setAntoraRepoUrl(e.target.value)} placeholder="https://github.com/spring-projects/spring-boot.git" className={inputClass} />
                </div>
              )}
              {antoraMode === 'localDir' && (
                <div>
                  <label className={labelClass}>Directory Path</label>
                  <input type="text" value={antoraLocalPath} onChange={(e) => setAntoraLocalPath(e.target.value)} placeholder="/home/user/repos/spring-boot" className={inputClass} />
                  <p className={helpClass}>Absolute path to a pre-cloned Antora documentation repository.</p>
                </div>
              )}
              {antoraMode === 'zipFile' && (
                <div>
                  <label className={labelClass}>ZIP File Path</label>
                  <input type="text" value={antoraZipPath} onChange={(e) => setAntoraZipPath(e.target.value)} placeholder="/tmp/antora-content.zip" className={inputClass} />
                </div>
              )}
            </div>
          )}

          {type === 'maven' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Mode</label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setMavenMode('direct')} className={modeBtnClass(mavenMode === 'direct')}>Direct Download</button>
                  <button type="button" onClick={() => setMavenMode('cli')} className={modeBtnClass(mavenMode === 'cli')}>Maven CLI</button>
                  <button type="button" onClick={() => setMavenMode('localJar')} className={modeBtnClass(mavenMode === 'localJar')}>Local JAR</button>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Group ID</label>
                  <input type="text" value={mavenGroupId} onChange={(e) => setMavenGroupId(e.target.value)} placeholder="io.quarkus" className={inputClass} />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Artifact ID</label>
                  <input type="text" value={mavenArtifactId} onChange={(e) => setMavenArtifactId(e.target.value)} placeholder="quarkus-core-docs" className={inputClass} />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Version</label>
                  <input type="text" value={mavenVersion} onChange={(e) => setMavenVersion(e.target.value)} placeholder="3.8.0" className={inputClass} />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Classifier</label>
                  <input type="text" value={mavenClassifier} onChange={(e) => setMavenClassifier(e.target.value)} placeholder="javadoc" className={inputClass} />
                </div>
              </div>
              {mavenMode === 'cli' && (
                <p className="text-xs text-accent bg-accent/5 ring-1 ring-accent/20 rounded-lg px-3 py-2">
                  Uses <code className="text-xs bg-accent/10 px-1 rounded">mvn dependency:copy</code> with your local
                  <code className="text-xs bg-accent/10 px-1 rounded ml-1">~/.m2/settings.xml</code> (proxy, mirrors, private repos).
                  Requires Maven installed and in PATH.
                </p>
              )}
              {mavenMode === 'localJar' && (
                <div>
                  <label className={labelClass}>JAR File Path</label>
                  <input type="text" value={mavenLocalJar} onChange={(e) => setMavenLocalJar(e.target.value)}
                    placeholder="/home/user/.m2/repository/.../library-1.0-javadoc.jar"
                    className={inputClass} />
                  <p className={helpClass}>Absolute path to a pre-downloaded javadoc JAR.</p>
                </div>
              )}
            </div>
          )}

          {type === 'asciidoc' && (
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Source</label>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setAdocMode('git')} className={modeBtnClass(adocMode === 'git')}>Git Repo</button>
                  <button type="button" onClick={() => setAdocMode('localDir')} className={modeBtnClass(adocMode === 'localDir')}>Local Dir</button>
                  <button type="button" onClick={() => setAdocMode('zipFile')} className={modeBtnClass(adocMode === 'zipFile')}>ZIP File</button>
                </div>
              </div>
              {adocMode === 'git' && (
                <div>
                  <label className={labelClass}>Repository URL</label>
                  <input type="text" value={adocRepoUrl} onChange={(e) => setAdocRepoUrl(e.target.value)} placeholder="https://github.com/quarkusio/quarkus.git" className={inputClass} />
                </div>
              )}
              {adocMode === 'localDir' && (
                <div>
                  <label className={labelClass}>Directory Path</label>
                  <input type="text" value={adocLocalPath} onChange={(e) => setAdocLocalPath(e.target.value)} placeholder="/home/user/repos/quarkus" className={inputClass} />
                  <p className={helpClass}>Absolute path to a pre-cloned repository with .adoc files.</p>
                </div>
              )}
              {adocMode === 'zipFile' && (
                <div>
                  <label className={labelClass}>ZIP File Path</label>
                  <input type="text" value={adocZipPath} onChange={(e) => setAdocZipPath(e.target.value)} placeholder="/tmp/docs.zip" className={inputClass} />
                </div>
              )}
              <div>
                <label className={labelClass}>Source Path <span className="text-text-muted font-normal">(optional)</span></label>
                <input type="text" value={adocSourcePath} onChange={(e) => setAdocSourcePath(e.target.value)}
                  placeholder="e.g. docs/src/main/asciidoc" className={inputClass} />
                <p className={helpClass}>Path within the source where .adoc files are located. Leave empty to scan entire source.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 bg-danger/5 ring-1 ring-danger/20 rounded-lg text-sm text-danger">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-text-dim hover:bg-bg-alt hover:text-text transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : initial ? 'Save' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
