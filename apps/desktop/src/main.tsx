import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StoreProvider } from './providers/StoreProvider';
import { IpcProvider } from './providers/IpcProvider';
import { ConfigProvider } from './providers/ConfigProvider';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider>
      <IpcProvider>
        <StoreProvider>
          <App />
        </StoreProvider>
      </IpcProvider>
    </ConfigProvider>
  </React.StrictMode>
);