import React from 'react';
import ReactDOM from 'react-dom/client';
import AppRouter from './router';
import { setupVersionSync } from './utils/setupVersionSync';
import './index.css';

setupVersionSync();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>,
);
