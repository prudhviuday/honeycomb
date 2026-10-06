import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.tsx';
import './index.css';

const HONEYCOMB_BUILD = '2026-10-04-ui-3';
console.info('[Honeycomb] Build:', HONEYCOMB_BUILD);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
