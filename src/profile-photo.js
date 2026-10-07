// The profile picture is a small square data URL in its own synced key, so it travels with sync and backups.
export const profilePhotoKey='recallflow_profile_photo';
const EVENT='recallflow:profile-photo',VALID=/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/,SIZE=256,MAX_BYTES=25*1048576;

export function profilePhoto(){try{const v=localStorage.getItem(profilePhotoKey)||'';return VALID.test(v)?v:'';}catch{return '';}}
export function saveProfilePhoto(url){
  if(url&&!VALID.test(url))throw new Error('That picture could not be saved.');
  if(url)localStorage.setItem(profilePhotoKey,url);else localStorage.removeItem(profilePhotoKey);
  window.dispatchEvent(new CustomEvent(EVENT,{detail:profilePhoto()}));
}
export function onProfilePhoto(fn){
  const on=()=>fn(profilePhoto()),storage=e=>{if(e.key===profilePhotoKey||e.key===null)on();};
  window.addEventListener(EVENT,on);window.addEventListener('recallflow:remote-update',on);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(EVENT,on);window.removeEventListener('recallflow:remote-update',on);window.removeEventListener('storage',storage);};
}

// Center-crops to a square and shrinks it so the stored value stays around 10–30 KB.
export async function photoFromFile(file){
  if(!file)throw new Error('Choose a picture.');
  if(file.type&&!file.type.startsWith('image/'))throw new Error('That file is not a picture. Choose a JPG, PNG or WebP image.');
  if(file.size>MAX_BYTES)throw new Error('That picture is too large. Choose one under 25 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}
  catch{throw new Error('This picture could not be opened. Try a JPG, PNG or WebP image.');}
  const side=Math.min(bitmap.width,bitmap.height),canvas=document.createElement('canvas');
  canvas.width=canvas.height=SIZE;
  const ctx=canvas.getContext('2d');
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(bitmap,(bitmap.width-side)/2,(bitmap.height-side)/2,side,side,0,0,SIZE,SIZE);
  bitmap.close?.();
  const webp=canvas.toDataURL('image/webp',.85);
  return webp.startsWith('data:image/webp')?webp:canvas.toDataURL('image/jpeg',.88);
}
