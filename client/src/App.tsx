import { Link, Route, Routes } from 'react-router-dom';
import CasesPage from './pages/CasesPage';
import CasePage from './pages/CasePage';
import AssessmentPage from './pages/AssessmentPage';

export default function App() {
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">Grant Completeness Assistant</Link>
        <span className="topbar-note">Review aid only — not an eligibility or funding decision</span>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<CasesPage />} />
          <Route path="/cases/:caseId" element={<CasePage />} />
          <Route path="/assessments/:assessmentId" element={<AssessmentPage />} />
          <Route path="*" element={<p>Page not found. <Link to="/">Back to cases</Link></p>} />
        </Routes>
      </main>
    </div>
  );
}
