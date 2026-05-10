import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../api/client';

export default function EntryForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);

  useEffect(() => {
    if (!id) return;
    api.entries.get(id).then((data) => {
      setName(data.name);
      setVersion(data.version);
      setDescription(data.description);
    }).catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !version.trim()) {
      setError('Name and version are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit && id) {
        await api.entries.update(id, { name: name.trim(), version: version.trim(), description: description.trim() });
      } else {
        await api.entries.create({ name: name.trim(), version: version.trim(), description: description.trim() });
      }
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-sm text-text-muted">Loading...</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-xl">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-text-dim hover:text-text mb-6 transition-colors"
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <h1 className="text-xl font-semibold text-text mb-6">
        {isEdit ? 'Edit Entry' : 'Create New Entry'}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-text mb-2">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Quarkus"
            className="w-full px-3.5 py-2.5 bg-surface ring-1 ring-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-2">Version</label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="e.g. 3.8.0"
            className="w-full px-3.5 py-2.5 bg-surface ring-1 ring-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text mb-2">Description <span className="text-text-muted font-normal">(optional)</span></label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this documentation entry"
            rows={3}
            className="w-full px-3.5 py-2.5 bg-surface ring-1 ring-border rounded-lg text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all resize-none"
          />
        </div>

        {error && (
          <div className="px-3 py-2 bg-danger/5 ring-1 ring-danger/20 rounded-lg text-sm text-danger">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Entry'}
        </button>
      </form>
    </div>
  );
}
