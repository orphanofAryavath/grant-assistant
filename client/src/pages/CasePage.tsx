import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, type AuditEvent, type CaseDetail, type DocKind, type SupportStatus, type Version } from '../api';
import { Empty, ErrorBox, Modal, Spinner, Toast, fmtDate } from '../components/ui';

const MAX_CHARS = 60_000;

function DocumentEditor({ caseId, kind, latest, onSaved }: { caseId: string; kind: DocKind; latest?: Version; onSaved: (msg: string) => void }) {
  const [title, setTitle] = useState(latest?.title ?? '');
  const [content, setContent] = useState(latest?.content ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dirty = title !== (latest?.title ?? '') || content !== (latest?.content ?? '');

  useEffect(() => { setTitle(latest?.title ?? ''); setContent(latest?.content ?? ''); }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!title.trim()) return setError('Add a title.');
    if (content.trim().length < 50) return setError('Paste the full document (at least 50 characters).');
    setSaving(true); setError('');
    try {
      const r = await api.saveDocument(caseId, { kind, title: title.trim(), content });
      onSaved(r.unchanged ? 'No changes — version kept' : `Saved as version ${r.version.versionNo}`);
    } catch (e) { setError(errorMessage(e)); } finally { setSaving(false); }
  }

  return (
    <div className="doc-editor">
      <div className="doc-head">
        <h3>{kind === 'guideline' ? 'Grant guideline' : 'Draft application'}</h3>
        {latest ? <span className="badge">v{latest.versionNo}</span> : <span className="badge badge-warn">not added</span>}
      </div>
      <input aria-label={`${kind} title`} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
      <textarea aria-label={`${kind} text`} placeholder={kind === 'guideline' ? 'Paste the funder’s guideline text…' : 'Paste the draft application text…'}
        value={content} onChange={(e) => setContent(e.target.value)} rows={14} />
      <div className="row between">
        <span className={`muted ${content.length > MAX_CHARS ? 'text-error' : ''}`}>{content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters</span>
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty || content.length > MAX_CHARS}>
          {saving ? 'Saving…' : latest ? 'Save new version' : 'Save'}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function SupportingDocs({ detail, reload, notify }: { detail: CaseDetail; reload: () => void; notify: (m: string) => void }) {
  const [form, setForm] = useState({ name: '', docType: '', description: '', status: 'provided' as SupportStatus });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.docType.trim()) return setError('Name and type are required.');
    setBusy(true); setError('');
    try { await api.addSupporting(detail.case.id, form); setForm({ name: '', docType: '', description: '', status: 'provided' }); notify('Document added'); reload(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function act(fn: () => Promise<unknown>, msg: string) {
    try { await fn(); notify(msg); reload(); } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <section className="card">
      <div className="section-head">
        <div>
          <h2>Supporting documents <span className="optional-pill">optional</span></h2>
          <p className="muted small">What the applicant has attached or promised. Only <strong>provided</strong> documents count as evidence; the AI and the document tracker both use this list.</p>
        </div>
        <span className="muted small">{detail.supporting.length} listed</span>
      </div>

      {detail.supporting.length === 0 ? <Empty title="No supporting documents listed">Add certificates, letters, accounts or CVs below.</Empty> : (
        <ul className="doc-list">
          {detail.supporting.map((d) => (
            <li key={d.id} className="doc-item">
              <span className="doc-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></svg>
              </span>
              <div className="doc-main">
                <div className="doc-name">{d.name}</div>
                <div className="doc-meta"><span className="badge">{d.docType}</span>{d.description && <span className="muted small">{d.description}</span>}</div>
              </div>
              <select className={`status-select st-${d.status}`} aria-label={`Status of ${d.name}`} value={d.status}
                onChange={(e) => act(() => api.updateSupporting(d.id, { status: e.target.value as SupportStatus }), 'Status updated')}>
                <option value="provided">Provided</option><option value="requested">Requested</option><option value="missing">Missing</option>
              </select>
              <button className="icon-btn" aria-label={`Remove ${d.name}`} title="Remove" onClick={() => act(() => api.deleteSupporting(d.id), 'Removed')}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="add-doc" onSubmit={add}>
        <div className="add-doc-title">Add a document</div>
        <div className="add-doc-grid">
          <label className="field"><span>Name</span>
            <input placeholder="e.g. Partner letter — City Library" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field"><span>Type</span>
            <input placeholder="e.g. letter of support" value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })} />
          </label>
          <label className="field field-wide"><span>Notes <em>(optional)</em></span>
            <input placeholder="Anything a reviewer should know" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <label className="field"><span>Status</span>
            <select className={`status-select st-${form.status}`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SupportStatus })}>
              <option value="provided">Provided</option><option value="requested">Requested</option><option value="missing">Missing</option>
            </select>
          </label>
          <button className="btn btn-primary add-doc-btn" disabled={busy}>{busy ? 'Adding…' : 'Add document'}</button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </form>
    </section>
  );
}

export default function CasePage() {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [history, setHistory] = useState<AuditEvent[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState('');
  const [viewing, setViewing] = useState<Version | null>(null);

  const load = useCallback(() => {
    setError('');
    Promise.all([api.getCase(caseId), api.getHistory(caseId)])
      .then(([d, h]) => { setDetail(d); setHistory(h); })
      .catch((e) => setError(errorMessage(e)));
  }, [caseId]);
  useEffect(load, [load]);

  async function run() {
    setRunning(true); setRunError('');
    try {
      // The server starts the AI work in the background and returns at once; the assessment
      // page shows live progress.
      const view = await api.runAssessment(caseId);
      navigate(`/assessments/${view.assessment.id}`);
    } catch (e) { setRunError(errorMessage(e)); setRunning(false); }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!detail) return <Spinner label="Loading review…" />;
  const latest = (k: DocKind) => detail.latest.find((v) => v.kind === k);
  const canRun = !!latest('guideline') && !!latest('application');
  const notify = (m: string) => { setToast(m); load(); };

  return (
    <>
      <p className="crumbs"><Link to="/">Reviews</Link> / {detail.case.name}</p>
      <h1>{detail.case.name}</h1>

      <section className="card">
        <div className="row between">
          <h2>Assessments</h2>
          <button className="btn btn-primary" onClick={run} disabled={!canRun || running}>{running ? 'Running…' : 'Run assessment'}</button>
        </div>
        {!canRun && <p className="muted">Add both the guideline and the application to run an assessment.</p>}
        {running && <Spinner label="Starting the assessment…" />}
        {runError && <ErrorBox message={runError} onRetry={run} />}
        {detail.assessments.length === 0 ? <Empty title="No assessments yet" /> : (
          <ul className="list">
            {detail.assessments.map((a) => (
              <li key={a.id}>
                <Link to={`/assessments/${a.id}`}>Assessment of {fmtDate(a.createdAt)}</Link>
                <span className={`badge status-${a.status}`}>{a.status}</span>
                {a.error && <span className="muted small">{a.error.slice(0, 80)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid-2">
        <DocumentEditor caseId={caseId} kind="guideline" latest={latest('guideline')} onSaved={notify} />
        <DocumentEditor caseId={caseId} kind="application" latest={latest('application')} onSaved={notify} />
      </section>

      <SupportingDocs detail={detail} reload={load} notify={setToast} />

      <section className="grid-2">
        <div className="card">
          <h2>Version history</h2>
          {detail.versions.length === 0 ? <Empty title="No versions yet" /> : (
            <ul className="list">
              {detail.versions.map((v) => (
                <li key={v.id}>
                  <button className="link" onClick={() => api.getVersion(v.id).then(setViewing).catch((e) => setToast(errorMessage(e)))}>
                    {v.kind} v{v.versionNo} — {v.title}
                  </button>
                  <span className="muted small">{fmtDate(v.createdAt)} · #{v.contentHash.slice(0, 7)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <h2>Activity</h2>
          {history.length === 0 ? <Empty title="No activity yet" /> : (
            <ul className="list small">
              {history.slice(0, 25).map((h) => (
                <li key={h.id}><span>{h.type.replaceAll('_', ' ')}</span><span className="muted">{fmtDate(h.createdAt)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {viewing && (
        <Modal title={`${viewing.kind} v${viewing.versionNo} — ${viewing.title}`} onClose={() => setViewing(null)} wide>
          <pre className="doc-view">{viewing.content}</pre>
        </Modal>
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}
