import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ResourceProvider } from './context/ResourceContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ResourceProvider>
        <App />
      </ResourceProvider>
    </BrowserRouter>
  </React.StrictMode>
);
