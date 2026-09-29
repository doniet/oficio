import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import './index.css';

// Sin zoom de página (decisión de Dariel, 2026-09-29), salvo en los mapas. Son tres capas porque
// cada navegador zoomea a su manera: maximum-scale y user-scalable=no en index.html (Android),
// touch-action: manipulation en index.css (doble toque) y esto, que es lo único que frena el
// pellizco en iOS Safari, que ignora user-scalable=no desde iOS 10. Leaflet hace su propio zoom
// con eventos táctiles, así que basta dejarle el gesto libre dentro de .leaflet-container.
document.addEventListener('gesturestart', (e) => {
  if (!(e.target as Element | null)?.closest?.('.leaflet-container')) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
