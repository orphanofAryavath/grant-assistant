import { useEffect, type ReactNode } from 'react';
import type { Coverage, ReviewStatus } from '../api';

export function Spinner({ label }: { label?: string }) {
  return <div className="spinner-row" role="status"><span className="spinner" />{label && <span>{label}</span>}</div>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>{message}</span>
      {onRetry && <button className="btn btn-sm" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

const coverageLabel: Record<Coverage, string> = { met: 'Met', weak: 'Weak', ambiguous: 'Ambiguous', missing: 'Missing' };
export const CoverageBadge = ({ value }: { value: Coverage }) => <span className={`badge cov-${value}`}>{coverageLabel[value]}</span>;

const reviewLabel: Record<ReviewStatus, string> = { pending: 'Awaiting review', confirmed: 'Confirmed', corrected: 'Corrected', rejected: 'Rejected' };
export const ReviewBadge = ({ value }: { value: ReviewStatus }) => <span className={`badge rev-${value}`}>{reviewLabel[value]}</span>;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [message, onDone]);
  return <div className="toast" role="status">{message}</div>;
}

export const fmtDate = (s: string) => new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
