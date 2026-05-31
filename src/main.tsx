import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PaletteWindow } from './windows/PaletteWindow';
// Self-hosted Geist via @fontsource — Tauri's CSP locks out external font
// CDNs, so we ship the woff2 with the bundle instead of relying on Google
// Fonts at runtime. Only the weights we actually render are imported to
// keep the JS bundle tight.
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/geist-mono/600.css';
import '@fontsource/geist-mono/700.css';
import 'ember-design-system/tokens.css';
import 'ember-design-system/styles.css';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

const params = new URLSearchParams(window.location.search);
const isPalette = params.get('window') === 'palette';

if (isPalette) {
  document.documentElement.setAttribute('data-window', 'palette');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>{isPalette ? <PaletteWindow /> : <App />}</React.StrictMode>
);
