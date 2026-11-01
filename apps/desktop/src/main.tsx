import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ConfigProvider } from './providers/ConfigProvider';
import { IpcProvider } from './providers/IpcProvider';
import { StoreProvider } from './providers/StoreProvider';
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
