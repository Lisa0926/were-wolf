import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('index.html 缺少 #root 挂载点');

createRoot(rootEl).render(
  <StrictMode>
    <h1>狼人杀 S0 · 脚手架占位</h1>
  </StrictMode>,
);
