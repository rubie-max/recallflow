import {rollup} from 'rollup';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import ts from 'typescript';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
export async function buildApp() {
  const styles=[];
  const bundle=await rollup({input:path.join(root,'src/react/main.tsx'),onwarn(warning,warn){if(warning.code!=='MODULE_LEVEL_DIRECTIVE')warn(warning)},plugins:[
    {name:'typescript',transform(code,id){if(!/\.tsx?$/.test(id))return null;return ts.transpileModule(code,{compilerOptions:{jsx:ts.JsxEmit.React,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;}},
    {name:'css-modules',async load(id){if(!id.endsWith('.module.css'))return null;let css=await fs.readFile(id,'utf8');const globals=[];css=css.replace(/:global\(([^)]+)\)/g,(_,value)=>`GLOBAL${globals.push(value)-1}PLACEHOLDER`);const classes={};const prefix=path.basename(id,'.module.css').replace(/\W/g,'_');css=css.replace(/\.([a-zA-Z_][\w-]*)/g,(_,name)=>'.'+(classes[name]=`rf_${prefix}_${name}`));css=css.replace(/GLOBAL(\d+)PLACEHOLDER/g,(_,i)=>globals[+i]);styles.push(css);return `export default ${JSON.stringify(classes)}`;}},
    {name:'environment',transform(code,id){if(!id.includes('node_modules'))return null;return code.replaceAll('process.env.NODE_ENV','"production"');}},
    nodeResolve({browser:true,extensions:['.mjs','.js','.json','.ts','.tsx']}),commonjs(),
  ]});
  await fs.mkdir(path.join(root,'assets'),{recursive:true});
  await bundle.write({file:path.join(root,'assets/app.js'),format:'es',sourcemap:false});await bundle.close();
  const base=await fs.readFile(path.join(root,'src/react/base.css'),'utf8');
  const voice=await fs.readFile(path.join(root,'src/react/voice.css'),'utf8');
  await fs.writeFile(path.join(root,'assets/app.css'),base+'\n'+styles.join('\n')+'\n'+voice);
  await fs.copyFile(path.join(root,'src/tts-worker.js'),path.join(root,'assets/tts-worker.js'));
  const html='<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>RecallFlow</title><link rel="icon" type="image/svg+xml" href="./public/recallflow-logo.svg"><link rel="manifest" href="./manifest.webmanifest"><meta name="theme-color" content="#4f46e5"><link rel="apple-touch-icon" href="./public/icon-192.png"><link rel="stylesheet" href="./assets/app.css"></head><body><div id="app"></div><script type="module" src="./assets/app.js"></script></body></html>\n';
  await fs.writeFile(path.join(root,'index.html'),html);
  await fs.mkdir(path.join(root,'dist'),{recursive:true});
  await fs.writeFile(path.join(root,'dist/index.html'),html);
  await fs.writeFile(path.join(root,'dist/.nojekyll'),'');
  for(const file of ['sw.js','manifest.webmanifest'])await fs.copyFile(path.join(root,file),path.join(root,'dist',file));
  await fs.cp(path.join(root,'assets'),path.join(root,'dist/assets'),{recursive:true});
  await fs.cp(path.join(root,'public'),path.join(root,'dist/public'),{recursive:true});
  console.log('RecallFlow React build ready. GitHub Pages files: dist/');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildApp();
