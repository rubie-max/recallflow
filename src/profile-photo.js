// The profile picture is a small square data URL in its own synced key, so it travels with sync and backups.
export const profilePhotoKey='recallflow_profile_photo';
const EVENT='recallflow:profile-photo',VALID=/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/,SIZE=256,MAX_BYTES=25*1048576,MAX_SIDE=1600;
export const MIN_ZOOM=1,MAX_ZOOM=5;
export const defaultEdit=()=>({zoom:1,x:0,y:0,rotate:0,flip:false,brightness:1,contrast:1,saturation:1});

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

// Decodes a chosen file (or the current photo's data URL) for the editor, shrinking very large photos first.
export async function openPhoto(source){
  if(!source)throw new Error('Choose a picture.');
  let blob=source;
  if(typeof source==='string')blob=await (await fetch(source)).blob();
  else{
    if(source.type&&!source.type.startsWith('image/'))throw new Error('That file is not a picture. Choose a JPG, PNG or WebP image.');
    if(source.size>MAX_BYTES)throw new Error('That picture is too large. Choose one under 25 MB.');
  }
  let bitmap;
  try{bitmap=await createImageBitmap(blob);}
  catch{throw new Error('This picture could not be opened. Try a JPG, PNG or WebP image.');}
  const scale=MAX_SIDE/Math.max(bitmap.width,bitmap.height);
  if(scale<1){
    try{const small=await createImageBitmap(bitmap,{resizeWidth:Math.round(bitmap.width*scale),resizeHeight:Math.round(bitmap.height*scale),resizeQuality:'high'});bitmap.close();bitmap=small;}catch{}
  }
  return bitmap;
}

// Offsets x/y are fractions of the square's side, so the same edit draws identically at any size.
// At zoom 1 the picture's short side exactly fills the square.
export function photoLayout(w,h,edit){
  const turned=edit.rotate%180!==0,rw=turned?h:w,rh=turned?w:h,scale=edit.zoom/Math.min(rw,rh);
  return {scale,maxX:Math.max(0,(rw*scale-1)/2),maxY:Math.max(0,(rh*scale-1)/2)};
}
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v))+0;
export function clampEdit(w,h,edit){
  const zoom=clamp(edit.zoom,MIN_ZOOM,MAX_ZOOM),{maxX,maxY}=photoLayout(w,h,{...edit,zoom});
  return {...edit,zoom,x:clamp(edit.x,-maxX,maxX),y:clamp(edit.y,-maxY,maxY)};
}

// Same maths as CSS brightness() contrast() saturate(), applied in that order.
export function adjustPixels(data,{brightness:b=1,contrast:c=1,saturation:s=1}){
  if(b===1&&c===1&&s===1)return;
  const m=[.213+.787*s,.715-.715*s,.072-.072*s,.213-.213*s,.715+.285*s,.072-.072*s,.213-.213*s,.715-.715*s,.072+.928*s];
  const step=v=>clamp((clamp(v*b,0,255)-127.5)*c+127.5,0,255);
  for(let i=0;i<data.length;i+=4){
    const r=step(data[i]),g=step(data[i+1]),bl=step(data[i+2]);
    data[i]=m[0]*r+m[1]*g+m[2]*bl;data[i+1]=m[3]*r+m[4]*g+m[5]*bl;data[i+2]=m[6]*r+m[7]*g+m[8]*bl;
  }
}
export function drawPhoto(ctx,image,edit,size){
  const w=image.width,h=image.height,{scale}=photoLayout(w,h,edit);
  ctx.save();ctx.clearRect(0,0,size,size);
  ctx.translate(size*(.5+edit.x),size*(.5+edit.y));ctx.rotate(edit.rotate*Math.PI/180);
  if(edit.flip)ctx.scale(-1,1);
  ctx.scale(scale*size,scale*size);ctx.imageSmoothingQuality='high';
  ctx.drawImage(image,-w/2,-h/2);ctx.restore();
  if(edit.brightness!==1||edit.contrast!==1||edit.saturation!==1){const px=ctx.getImageData(0,0,size,size);adjustPixels(px.data,edit);ctx.putImageData(px,0,0);}
}
export function exportPhoto(image,edit){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
  drawPhoto(canvas.getContext('2d'),image,edit,SIZE);
  const webp=canvas.toDataURL('image/webp',.85);
  return webp.startsWith('data:image/webp')?webp:canvas.toDataURL('image/jpeg',.88);
}
