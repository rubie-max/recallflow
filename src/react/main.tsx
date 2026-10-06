import React from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeModeProvider} from './helpers/themeMode';
import IndexPage from './pages/_index';
import {ZoomHost} from './ImageViewer';
createRoot(document.getElementById('app')!).render(<ThemeModeProvider><IndexPage/><ZoomHost/></ThemeModeProvider>);

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
