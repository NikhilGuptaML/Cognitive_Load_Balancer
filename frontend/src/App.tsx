/* This component defines the app routes so the browser opens on setup, then transitions into the live session and report views without any server-side rendering dependency. */

import { Navigate, Route, Routes } from 'react-router-dom';

import { ReportPage } from './pages/ReportPage';
import { SessionPage } from './pages/SessionPage';
import { SetupPage } from './pages/SetupPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/session/:sessionId" element={<SessionPage />} />
      <Route path="/report/:sessionId" element={<ReportPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}