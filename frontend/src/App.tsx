/* This component defines the app routes so the browser opens on setup, then transitions into the live session and report views without any server-side rendering dependency. */

import { Navigate, Route, Routes } from 'react-router-dom';

import { ParticipantDashboard } from './pages/ParticipantDashboard';
import { ReportPage } from './pages/ReportPage';
import { SessionPage } from './pages/SessionPage';
import { SetupPage } from './pages/SetupPage';
import { SimulationDashboard } from './pages/SimulationDashboard';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SetupPage />} />
      <Route path="/session/:sessionId" element={<SessionPage />} />
      <Route path="/report/:sessionId" element={<ReportPage />} />
      <Route path="/simulations" element={<SimulationDashboard />} />
      <Route path="/participants" element={<ParticipantDashboard />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}