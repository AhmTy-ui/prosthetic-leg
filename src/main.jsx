import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { Chart, registerables } from 'chart.js';
import App from './App.jsx';
import { LiveHub } from './lib/data.js';
import './styles.css';

Chart.register(...registerables);
Chart.defaults.font.family = '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
Chart.defaults.color = '#667382';
Chart.defaults.borderColor = '#e9eef2';

LiveHub.init();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
