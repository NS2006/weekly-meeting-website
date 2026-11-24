import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// First: the screens' language is set before anything is drawn.
import './i18n/i18n';
import { App } from './app/App';
import './styles/blue-tokens.css';
import './components/blue/blue-components.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('index.html has no #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
