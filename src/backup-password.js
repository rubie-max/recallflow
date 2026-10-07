// The Telegram backup password set in Settings. The app encrypts it with this public key; only the backup
// workflow in the data repo holds the private key, so the password is never stored readable anywhere.
export const BACKUP_PUBLIC_KEY='MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEArh9uBwnoPFrVJwurBbpfvv+rmYpEPaYBjHLUErDfYCRt1Udty8JAv/A5sE1TabKYDH7d5ZXvTBfjpAXB/krm+T77gjPp6FXywuh7Usq9N9TwCv6YLn0TNaznOtzOaIJj3+Lh4Txk2fNREBk+0rtirw9FGVTieg5a5r8iBEQpvcCTa4EcaLh6sE+U4znLCrqTRrFSa5GdhGEW2IPQP0XRfcUegRRQwtFNY4m3cQTRUH+85EKtoy6MnM2vOlT43wbETuQNDdwLvaA3SCh+XEdJybu0LOKUVcXARtvwuTvzR3zA2/Dq4/5qbek8eIMnI1Dw8y/MfsigUZWjBB1Hau+iGQRrRNWixvEClZODOn0i6qHdRpPMyr2ocGhXFNANVCPjyvqE8xV5x2bo3Ninx1nKNTnOCCFjSERTejEKf0czsqyAj+4VYzGN9MHaNmUIHtxf1pexoSP5LB83t9iwEqbPEp3ZWiHZgiLtJ9t8yIqnSB8hwSt/ptmJIY/dag5CnzyzAgMBAAE=';
export const MIN_PASSWORD=8,MAX_PASSWORD=64;

export function passwordProblem(pw,confirm){
  if(pw.length<MIN_PASSWORD)return `Use at least ${MIN_PASSWORD} characters.`;
  if(pw.length>MAX_PASSWORD)return `Use at most ${MAX_PASSWORD} characters.`;
  if(pw!==pw.trim())return 'Remove the space at the start or end.';
  if(confirm!==undefined&&pw!==confirm)return 'The two passwords don’t match.';
  return '';
}
export async function encryptBackupPassword(pw,publicKey=BACKUP_PUBLIC_KEY){
  const der=Uint8Array.from(atob(publicKey),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('spki',der,{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const data=new Uint8Array(await crypto.subtle.encrypt({name:'RSA-OAEP'},key,new TextEncoder().encode(pw)));
  let s='';for(const b of data)s+=String.fromCharCode(b);
  return btoa(s);
}
