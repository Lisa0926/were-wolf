import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html 缺少 #root 挂载点');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
