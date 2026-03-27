/* This file mounts the React application so routing, shared context, and the adaptive session UI all start from a single browser entry point. Uses HashRouter for native Capacitor builds (file:// doesn't support history routing). */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';

import App from './App';
import './index.css';

const Router = Capacitor.isNativePlatform() ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
