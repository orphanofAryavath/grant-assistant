import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage, type CaseListItem } from '../api';
import { Empty, ErrorBox, Spinner, Toast, fmtDate } from '../components/ui';

export default function CasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useState('');
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

  async function remove(id: string) {
    try { await api.deleteCase(id); setConfirming(null); setToast('Review deleted'); load(); }
    catch (err) { setToast(errorMessage(err)); }
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
            <ul className="case-list">
              {cases.map((c) => {
                const a = c.latestAssessment;
                const pct = a && a.total ? Math.round((a.reviewed / a.total) * 100) : 0;
                return (
                  <li key={c.id} className="case-item">
                    <Link to={`/cases/${c.id}`} className="case-link">
                      <span className="case-name">{c.name}</span>
                      <span className="case-meta">
                        <span className="muted small">Created {fmtDate(c.createdAt)}</span>
                        {!a && <span className="badge">Not assessed</span>}
                        {a?.status === 'running' && <span className="badge status-running">Assessing…</span>}
                        {a?.status === 'failed' && <span className="badge status-failed">Last run failed</span>}
                        {a?.status === 'ready' && (
                          <span className="case-progress">
                            <span className="progress progress-sm" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                            <span className="muted small">{a.reviewed}/{a.total} reviewed</span>
                          </span>
                        )}
                      </span>
                    </Link>
                    {confirming === c.id ? (
                      <span className="confirm-row">
                        <span className="small">Delete this review?</span>
                        <button className="btn btn-sm btn-danger" onClick={() => remove(c.id)}>Delete</button>
                        <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                      </span>
                    ) : (
                      <button className="icon-btn" aria-label={`Delete ${c.name}`} title="Delete review" onClick={() => setConfirming(c.id)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
      </section>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}
