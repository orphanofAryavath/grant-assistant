import { Link, Route, Routes, useLocation } from 'react-router-dom';
import CasesPage from './pages/CasesPage';
import CasePage from './pages/CasePage';
import AssessmentPage from './pages/AssessmentPage';
import ThemeToggle from './components/ThemeToggle';

export default function App() {
  const location = useLocation();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></svg>
            </span>
            Grant Completeness Assistant
          </Link>
          <span className="topbar-note">Review aid only — not an eligibility or funding decision</span>
          <span className="spacer" />
          <ThemeToggle />
        </div>
      </header>
      {/* keyed by path so each page fades in on navigation */}
      <main className="container page" key={location.pathname}>
        <Routes>
          <Route path="/" element={<CasesPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back to reviews</Link></p>} />
        </Routes>
      </main>
    </div>
  );
}
