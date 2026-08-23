import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/index.css';

/**
 * SPA entry point. Mounts the console's root React tree into the
 * `#root` element declared by `index.html`.
 *
 * Wave 8A placeholder — replaced by Phase 3 T034 App stub (which adds
 * the MapCanvas + GridOverlay composition) and wrapped in the Phase 8
 * T085 ErrorBoundary once it exists.
 */

/**
 * Wave 8A placeholder App — renders static text so the entry compiles
 * and boots standalone before Phase 3 lands the real root component.
 * The `<main id="main">` wrapper gives `index.html`'s skip link a
 * valid target from day one (WCAG 2.4.1 Bypass Blocks).
 */
function App() {
  return (
    <main id="main">
      <p>Europa Neo</p>
    </main>
  );
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Europa Neo console: #root element not found in document.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
