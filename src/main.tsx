import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Automatically attach local Admin Session Token (if set) to all /api/* requests
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('smartmac_sec_token');
  if (token) {
    const headers = new Headers(init?.headers || {});
    if (!headers.has('x-smartmac-token')) {
      headers.set('x-smartmac-token', token);
    }
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

