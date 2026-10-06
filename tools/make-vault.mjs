// Usage: copy the GitHub token for the data repo, then run
//   node tools/make-vault.mjs <owner> <repo> <username>
// and type the password when asked. Writes public/sync-vault.json.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import readline from 'node:readline/promises';
import {sealVault} from '../src/sync.js';
const [owner,repo,username]=process.argv.slice(2);
if(!owner||!repo||!username){console.error('Usage: node tools/make-vault.mjs <owner> <repo> <username>');process.exit(1);}
const password=process.env.RF_PASSWORD||await readline.createInterface({input:process.stdin,output:process.stdout}).question('Password: ');
const token=execFileSync('powershell',['-NoProfile','-Command','Get-Clipboard'],{encoding:'utf8'}).trim();
if(!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)){console.error('The clipboard does not hold a GitHub token.');process.exit(1);}
const res=await fetch(`https://api.github.com/repos/${owner}/${repo}`,{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'}});
if(!res.ok){console.error(`The token cannot open ${owner}/${repo} (GitHub said ${res.status}).`);process.exit(1);}
const vault=await sealVault(username,password,{token,owner,repo});
fs.writeFileSync(new URL('../public/sync-vault.json',import.meta.url),JSON.stringify(vault)+'\n');
console.log(`Vault written for ${owner}/${repo} (repo is ${(await res.json()).private?'private':'PUBLIC'}).`);
process.exit(0);
