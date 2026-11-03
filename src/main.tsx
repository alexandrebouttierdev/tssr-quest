/**
 * Point d'entrée du navigateur : monte la racine React, qui crée elle-même
 * l'instance Phaser (voir `src/app/GameCanvas.tsx`).
 */
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
