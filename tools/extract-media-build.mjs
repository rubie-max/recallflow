import fs from 'fs';
import path from 'path';

const transcript = process.argv[2];
const root = process.argv[3];
const line = fs.readFileSync(transcript, 'utf8').trim().split('\n').pop();
const text = JSON.parse(line).message.content.find((c) => c.type === 'text').text;

function extractAfter(header, fence) {
  const i = text.indexOf(header);
  if (i < 0) throw new Error('missing header: ' + header);
  const start = text.indexOf('```' + fence + '\n', i);
  if (start < 0) throw new Error('missing fence for ' + header);
  const bodyStart = start + ('```' + fence + '\n').length;
  const end = text.indexOf('\n```', bodyStart);
  if (end < 0) throw new Error('missing end fence for ' + header);
  return text.slice(bodyStart, end);
}

const mc = extractAfter('## 01-MediaClipEditor.tsx (complete replacement)', 'tsx')
  .replace("from './05-question-types-media.js'", "from '../question-types.js'")
  .replace("from './06-feedback-sounds-stub.js'", "from '../feedback-sounds.js'");

const qv = extractAfter('## 03-QuestionVideo.tsx (complete replacement)', 'tsx')
  .replace("from './04-MediaLinkForm'", "from './MediaLinkForm'")
  .replace("from './05-question-types-media.js'", "from '../question-types.js'")
  .replace("from './01-MediaClipEditor'", "from './MediaClipEditor'");

const css = extractAfter('## 07-editor-styles.css — replace every', 'css');

const jsBlock = extractAfter('## 05-question-types-media.js — replace `mediaEditSafe`', 'js');

fs.writeFileSync(path.join(root, 'src/react/MediaClipEditor.tsx'), mc);
fs.writeFileSync(path.join(root, 'src/react/QuestionVideo.tsx'), qv);
fs.writeFileSync(path.join(root, 'src/react/_me-css-block.css'), css);
fs.writeFileSync(path.join(root, 'src/react/_mediaEditSafe.js'), jsBlock);
console.log('OK', { mc: mc.length, qv: qv.length, css: css.length, js: jsBlock.length });
