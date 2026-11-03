/**
 * Point d'entrée du navigateur : polices, styles globaux, puis la racine React,
 * qui crée elle-même l'instance Phaser (voir `src/app/GameCanvas.tsx`).
 */
import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@ui/styles/global.css';
import './app/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@app/App';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Élément #root introuvable dans index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
