/* This file mounts the React application and boots the RunAnywhere SDK before first render. */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import './index.css';
import { initSDK } from './runanywhere';

// Boot the RunAnywhere SDK as early as possible (non-blocking — errors are
// handled inside initSDK; the app still renders and uses fallback grading
// if the WASM module fails to load).
initSDK().catch((err) => {
  console.warn('[SDK] Initialization warning (non-fatal):', err);
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
