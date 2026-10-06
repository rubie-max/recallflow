import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeModeProvider} from './helpers/themeMode';
import IndexPage from './pages/_index';
import {ZoomHost} from './ImageViewer';
import {LoginPage} from './LoginPage';
import {session,startSync,syncNow} from '../sync.js';

function App(){
 const [signedIn,setSignedIn]=useState(()=>!!session());
 useEffect(()=>{const update=()=>setSignedIn(!!session());window.addEventListener('recallflow:session',update);return()=>window.removeEventListener('recallflow:session',update);},[]);
 useEffect(()=>{if(signedIn){startSync();syncNow();}},[signedIn]);
 return signedIn?<><IndexPage/><ZoomHost/></>:<LoginPage onSignedIn={()=>setSignedIn(true)}/>;
}
createRoot(document.getElementById('app')!).render(<ThemeModeProvider><App/></ThemeModeProvider>);

if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
