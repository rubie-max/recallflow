import React,{useState} from 'react';
import {Eye,EyeOff,LockKeyhole,LogIn} from 'lucide-react';
import {Button} from './components/Button';
import {signIn,startSync,syncNow} from '../sync.js';

export function LoginPage({onSignedIn}:{onSignedIn:()=>void}){
 const [user,setUser]=useState(''),[pass,setPass]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(busy)return;setError('');setBusy('Checking…');
  try{await signIn(user,pass);setBusy('Loading your questions…');startSync();await syncNow();onSignedIn();}
  catch(err:any){setError(err.message||'Could not sign in.');setBusy('');}
 }
 return <main className="login-page">
  <form className="login-card" onSubmit={submit}>
   <img className="login-logo" src="./public/recallflow-logo.png" alt="" width={56} height={56}/>
   <h1>RecallFlow</h1>
   <p className="login-sub">Sign in to open your questions on any device.</p>
   <label className="login-field">Username<input value={user} onChange={e=>setUser(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus/></label>
   <label className="login-field">Password<span className="login-password"><input type={show?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} autoComplete="current-password" required/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>
   {error&&<p className="login-error" role="alert">{error}</p>}
   <Button type="submit" disabled={!!busy||!user.trim()||!pass}><LogIn size={17}/>{busy||'Sign in'}</Button>
   <p className="login-note"><LockKeyhole size={14}/>Your questions are kept in a private store only this login can open.</p>
  </form>
 </main>;
}
