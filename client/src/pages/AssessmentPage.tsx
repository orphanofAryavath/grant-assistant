import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage, type AssessmentView, type Coverage, type Mapping, type Requirement } from '../api';
import { CoverageBadge, Empty, ErrorBox, Modal, ReviewBadge, Spinner, Toast, fmtDate } from '../components/ui';

type Filter = 'all' | 'pending' | 'mandatory' | 'recommended' | 'gaps';

function ReviewRow({ requirement: r, mapping: m, onChange, onError }: {
  requirement: Requirement; mapping: Mapping; onChange: (msg: string) => void; onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'correct' | 'reject'>('idle');
  const [coverage, setCoverage] = useState<Coverage>(m.aiCoverage);
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState('');

  async function send(body: Parameters<typeof api.reviewMapping>[1], msg: string) {
    setBusy(true); setNoteError('');
    try { await api.reviewMapping(m.id, body); setMode('idle'); setNote(''); setEvidence(''); onChange(msg); }
    catch (e) { onError(errorMessage(e)); } finally { setBusy(false); }
  }
  function submitNoted() {
    if (!note.trim()) return setNoteError(mode === 'correct' ? 'Explain the correction.' : 'Explain why the mapping is wrong.');
    if (mode === 'correct') send({ action: 'correct', coverage, note: note.trim(), evidence: evidence.trim() || undefined }, `${r.code} corrected`);
    else send({ action: 'reject', note: note.trim() }, `${r.code} rejected`);
  }

  return (
    <article className={`req req-${m.reviewStatus}`}>
      <div className="req-head">
        <strong>{r.code}</strong>
        <span className={`badge lvl-${r.level}`}>{r.level}</span>
        <span className="badge">{r.category}</span>
        <span className="spacer" />
        <span className="muted small">AI:</span> <CoverageBadge value={m.aiCoverage} />
        <ReviewBadge value={m.reviewStatus} />
        {m.reviewStatus === 'corrected' && m.reviewedCoverage && <>→ <CoverageBadge value={m.reviewedCoverage} /></>}
      </div>
      <p className="req-text">{r.text}</p>
      <p className="quote small">
        Guideline: “{r.sourceQuote}” {r.sourceVerified ? <span className="ok">✓ found in guideline</span> : <span className="warn">⚠ not found verbatim — check</span>}
      </p>
      <p className="small"><span className="muted">AI reasoning:</span> {m.rationale}</p>
      {m.evidenceQuote ? (
        <p className="quote small">
          Evidence: “{m.evidenceQuote}” {m.evidenceVerified ? <span className="ok">✓ found in application</span> : <span className="warn">⚠ not found in application — possible fabrication</span>}
        </p>
      ) : m.evidenceSource && m.evidenceSource !== 'application' ? (
        <p className="small">Evidence: supporting document “{m.evidenceSource}” {m.evidenceVerified ? <span className="ok">✓ listed as provided</span> : <span className="warn">⚠ not listed as provided</span>}</p>
      ) : m.aiCoverage === 'missing'
        ? <p className="small muted">No evidence found in the application.</p>
        : <p className="small warn">⚠ The AI marked this “{m.aiCoverage}” without citing any evidence — verify before confirming.</p>}
      {m.reviewerNote && <p className="small"><span className="muted">Reviewer note:</span> {m.reviewerNote}</p>}
      {m.reviewedEvidence && (
        <p className="quote small">
          Reviewer evidence: “{m.reviewedEvidence}” {m.reviewedEvidenceVerified ? <span className="ok">✓ found in application</span> : <span className="warn">⚠ not found in the assessed application version</span>}
        </p>
      )}

      {mode === 'idle' ? (
        <div className="row">
          {m.reviewStatus === 'pending' ? (
            <>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => send({ action: 'confirm' }, `${r.code} confirmed`)}>Confirm</button>
              <button className="btn btn-sm" disabled={busy} onClick={() => setMode('correct')}>Correct</button>
              <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => setMode('reject')}>Reject</button>
            </>
          ) : <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => send({ action: 'reset' }, `${r.code} reset to pending`)}>Undo review</button>}
        </div>
      ) : (
        <div className="review-form">
          {mode === 'correct' && (
            <label>Actual coverage{' '}
              <select value={coverage} onChange={(e) => setCoverage(e.target.value as Coverage)}>
                <option value="met">Met</option><option value="weak">Weak</option><option value="ambiguous">Ambiguous</option><option value="missing">Missing</option>
              </select>
            </label>
          )}
          <textarea rows={2} placeholder={mode === 'correct' ? 'Why is the AI wrong? (required)' : 'Why is this mapping wrong? (required)'}
            value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reviewer note" />
          {mode === 'correct' && (
            <textarea rows={2} placeholder="Correct evidence — paste the exact text from the application (optional, checked against it)"
              value={evidence} onChange={(e) => setEvidence(e.target.value)} aria-label="Corrected evidence" />
          )}
          {noteError && <p className="field-error">{noteError}</p>}
          <div className="row">
            <button className="btn btn-sm btn-primary" disabled={busy} onClick={submitNoted}>{mode === 'correct' ? 'Save correction' : 'Reject mapping'}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { setMode('idle'); setNoteError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </article>
  );
}

export default function AssessmentPage() {
  const { assessmentId = '' } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<AssessmentView | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  const load = useCallback(() => {
    setError('');
    api.getAssessment(assessmentId).then(setView).catch((e) => setError(errorMessage(e)));
  }, [assessmentId]);
  useEffect(load, [load]);

  const items = useMemo(() => (view?.items ?? []).filter(({ requirement: r, mapping: m }) => {
    switch (filter) {
      case 'pending': return m.reviewStatus === 'pending';
      case 'mandatory': case 'recommended': return r.level === filter;
      case 'gaps': return (m.reviewedCoverage ?? m.aiCoverage) !== 'met' || m.reviewStatus === 'rejected';
      default: return true;
    }
  }), [view, filter]);

  async function openSummary() {
    setSummaryLoading(true);
    try { setSummary((await api.getSummary(assessmentId)).markdown); }
    catch (e) { setToast(errorMessage(e)); } finally { setSummaryLoading(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([summary ?? ''], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `completeness-summary-${assessmentId.slice(0, 8)}.md` });
    a.click(); URL.revokeObjectURL(url);
  }
  async function rerun() {
    if (!view) return;
    setRerunning(true);
    try { const v = await api.runAssessment(view.assessment.caseId); navigate(`/assessments/${v.assessment.id}`); }
    catch (e) { setToast(errorMessage(e)); } finally { setRerunning(false); }
  }

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!view) return <Spinner label="Loading assessment…" />;
  const { assessment: a, completion: c } = view;
  const questions = view.findings.filter((f) => f.type === 'clarification');
  const claims = view.findings.filter((f) => f.type === 'unsupported_claim');
  const toggleFinding = (id: string, dismissed: boolean) =>
    api.setFindingDismissed(id, dismissed).then(load).catch((e) => setToast(errorMessage(e)));

  return (
    <>
      <p className="crumbs"><Link to="/">Reviews</Link> / <Link to={`/cases/${a.caseId}`}>{view.caseName}</Link> / Assessment</p>
      <div className="row between">
        <h1>Assessment</h1>
        <div className="row">
          <button className="btn" onClick={openSummary} disabled={a.status !== 'ready' || summaryLoading}>{summaryLoading ? 'Building…' : 'Completeness summary'}</button>
        </div>
      </div>
      <p className="muted small">Run {fmtDate(a.createdAt)} · guideline v{view.guidelineVersion} · application v{view.applicationVersion} · model {a.model}</p>

      <div className="alert alert-info">This tool checks completeness against the guideline to support a human reviewer. It does not decide legal or funding eligibility.</div>
      {view.stale.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <div><strong>Stale assessment.</strong> {view.stale.join(' ')} Reviews below refer to the old versions.</div>
          <button className="btn btn-sm" onClick={rerun} disabled={rerunning}>{rerunning ? 'Re-running…' : 'Re-run on latest versions'}</button>
        </div>
      )}
      {a.status === 'failed' && <ErrorBox message={`The AI workflow failed: ${a.error}`} onRetry={rerun} />}

      {a.status === 'ready' && (
        <>
          <section className="stats">
            <div className="stat"><span className="stat-num">{c.mandatory.percent}%</span><span>Mandatory met<br /><span className="muted small">{c.mandatory.met}/{c.mandatory.total} · {c.mandatory.pending} awaiting review</span></span></div>
            <div className="stat"><span className="stat-num">{c.recommended.percent}%</span><span>Recommendations met<br /><span className="muted small">{c.recommended.met}/{c.recommended.total} · {c.recommended.pending} awaiting review</span></span></div>
            <div className="stat"><span className="stat-num">{c.mandatory.pending + c.recommended.pending}</span><span>Items to review<br /><span className="muted small">Only reviewed items count towards completion</span></span></div>
          </section>

          <section className="card">
            <div className="row between wrap">
              <h2>Requirements</h2>
              <div className="tabs" role="tablist">
                {(['all', 'pending', 'gaps', 'mandatory', 'recommended'] as Filter[]).map((f) => (
                  <button key={f} role="tab" aria-selected={filter === f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</button>
                ))}
              </div>
            </div>
            {items.length === 0 ? <Empty title="Nothing in this view">{filter === 'pending' ? 'Every item has been reviewed.' : 'Try another filter.'}</Empty>
              : items.map((i) => <ReviewRow key={i.mapping.id} {...i} onChange={(msg) => { setToast(msg); load(); }} onError={setToast} />)}
          </section>

          <section className="grid-2">
            <div className="card">
              <h2>Supporting documents required</h2>
              {view.documents.length === 0 ? <Empty title="The guideline names no specific documents" /> : (
                <table className="table">
                  <thead><tr><th>Document</th><th>Req.</th><th>Status</th></tr></thead>
                  <tbody>{view.documents.map((d) => (
                    <tr key={d.requirementCode + d.document}>
                      <td>{d.document}{d.matchedName && <div className="muted small">matched: {d.matchedName}</div>}</td>
                      <td>{d.requirementCode} <span className={`badge lvl-${d.level}`}>{d.level}</span></td>
                      <td><span className={`badge doc-${d.status}`}>{d.status}</span></td>
                    </tr>))}
                  </tbody>
                </table>
              )}
              <p className="muted small">Update statuses on the <Link to={`/cases/${a.caseId}`}>review page</Link>; this table refreshes without re-running the AI.</p>
            </div>
            <div className="card">
              <h2>Clarification questions</h2>
              {questions.length === 0 ? <Empty title="No questions raised" /> : (
                <ul className="list">{questions.map((q) => (
                  <li key={q.id} className={q.dismissed ? 'dismissed' : ''}>
                    <span>{q.requirementCode && <strong>{q.requirementCode}: </strong>}{q.text}</span>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleFinding(q.id, !q.dismissed)}>{q.dismissed ? 'Restore' : 'Dismiss'}</button>
                  </li>))}
                </ul>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Claims without supporting evidence</h2>
            {claims.length === 0 ? <Empty title="No unsupported claims found" /> : (
              <ul className="list">{claims.map((f) => (
                <li key={f.id} className={f.dismissed ? 'dismissed' : ''}>
                  <span>{f.text}{f.quote && <span className="quote small"> “{f.quote}” {f.quoteVerified ? <span className="ok">✓</span> : <span className="warn">⚠ quote not found</span>}</span>}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => toggleFinding(f.id, !f.dismissed)}>{f.dismissed ? 'Restore' : 'Dismiss'}</button>
                </li>))}
              </ul>
            )}
          </section>
        </>
      )}

      <section className="card">
        <h2>AI workflow log</h2>
        {view.aiRuns.length === 0 ? <Empty title="No AI calls recorded" /> : (
          <table className="table small">
            <thead><tr><th>Step</th><th>Model</th><th>Attempt</th><th>Duration</th><th>Tokens in/out</th><th>Result</th></tr></thead>
            <tbody>{view.aiRuns.map((r) => (
              <tr key={r.id}>
                <td>{r.step}</td><td>{r.model}</td><td>{r.attempt}</td><td>{(r.durationMs / 1000).toFixed(1)}s</td>
                <td>{r.inputTokens ?? '–'} / {r.outputTokens ?? '–'}</td>
                <td>{r.ok ? <span className="ok">ok</span> : <span className="warn" title={r.error ?? ''}>failed: {r.error?.slice(0, 60)}</span>}</td>
              </tr>))}
            </tbody>
          </table>
        )}
      </section>

      {summary !== null && (
        <Modal title="Reviewed completeness summary" onClose={() => setSummary(null)} wide>
          <div className="row"><button className="btn btn-primary btn-sm" onClick={download}>Download .md</button>
            <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(summary).then(() => setToast('Copied'))}>Copy</button></div>
          <pre className="doc-view">{summary}</pre>
        </Modal>
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}
