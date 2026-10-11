import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage, type Case } from '../api';
import { Empty, ErrorBox, Spinner, fmtDate } from '../components/ui';

export default function CasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.listCases().then(setCases).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setFormError('Give the review a name.');
    setBusy(true); setFormError('');
    try {
      const c = await api.createCase(name.trim());
      navigate(`/cases/${c.id}`);
    } catch (err) { setFormError(errorMessage(err)); } finally { setBusy(false); }
  }

  async function sample() {
    setBusy(true); setFormError('');
    try { const c = await api.createSampleCase(); navigate(`/cases/${c.id}`); }
    catch (err) { setFormError(errorMessage(err)); } finally { setBusy(false); }
  }

  return (
    <>
      <section className="card">
        <h2>New review</h2>
        <p className="muted">A review pairs one grant guideline with one draft application. Paste both, list any supporting documents, then run the assessment.</p>
        <form className="row" onSubmit={create}>
          <input aria-label="Review name" placeholder="e.g. Reading Corners — CLF 2027" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          <button className="btn btn-primary" disabled={busy}>Create</button>
          <span className="muted">or</span>
          <button type="button" className="btn" onClick={sample} disabled={busy}>Load sample review</button>
        </form>
        {formError && <p className="field-error">{formError}</p>}
      </section>

      <section className="card">
        <h2>Reviews</h2>
        {error ? <ErrorBox message={error} onRetry={load} />
          : cases === null ? <Spinner label="Loading reviews…" />
          : cases.length === 0 ? <Empty title="No reviews yet">Create one above, or load the sample to see the full workflow.</Empty>
          : (
            <ul className="list">
              {cases.map((c) => (
                <li key={c.id}><Link to={`/cases/${c.id}`}>{c.name}</Link><span className="muted">{fmtDate(c.createdAt)}</span></li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
