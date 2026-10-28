// Ready-made question sets shipped with the app under public/packs/<id>/: index.json lists the topics,
// each topic is its own file, and pictures are stored once in a shared file and referenced as "img:<key>".
export const packBase=id=>new URL(`public/packs/${id}/`,document.baseURI).href;

async function getJson(url,fetcher){
  let res;
  try{res=await fetcher(url,{cache:'no-cache'});}catch{throw new Error('Could not download this set. Check your internet connection and try again.');}
  if(!res.ok)throw new Error(`Could not download this set (error ${res.status}). Try again later.`);
  try{return await res.json();}catch{throw new Error('This set could not be read. Try again later.');}
}

export function expandImages(questions,images){
  return questions.map(q=>{
    if(typeof q.image!=='string'||!q.image.startsWith('img:'))return q;
    const src=images?.[q.image.slice(4)];
    if(typeof src!=='string'||!src.startsWith('data:image/'))throw new Error('A picture is missing from this set. Try again later.');
    return {...q,image:src};
  });
}

export async function readPackIndex(base,fetcher=fetch){
  const index=await getJson(base+'index.json',fetcher);
  if(!Array.isArray(index?.topics)||!index.topics.length)throw new Error('This set could not be read. Try again later.');
  return index;
}

export async function loadPackQuestions(base,index,topicIds,fetcher=fetch){
  const topics=index.topics.filter(t=>topicIds.includes(t.id));
  if(!topics.length)throw new Error('Choose at least one topic.');
  const [images,...files]=await Promise.all([index.images?getJson(base+index.images,fetcher):{},...topics.map(t=>getJson(base+t.file,fetcher))]);
  return expandImages(files.flatMap(f=>Array.isArray(f?.questions)?f.questions:[]),images);
}
