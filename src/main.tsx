import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Automatically attach local Admin Session Token and active Target VM Node ID (`x-target-node`) to all /api/* requests
const originalFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('smartmac_sec_token');
  const activeNode = localStorage.getItem('smartmac_active_node');
  if (token || (activeNode && activeNode !== 'local')) {
    const headers = new Headers(init?.headers || {});
    if (token && !headers.has('x-smartmac-token')) {
      headers.set('x-smartmac-token', token);
    }
    if (activeNode && activeNode !== 'local' && !headers.has('x-target-node')) {
      headers.set('x-target-node', activeNode);
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
