// Remove items by id, remembering where each one was so it can be put back.
export function removeWithPositions(items,ids){
 const remove=new Set(ids),kept=[],removed=[];
 items.forEach((item,index)=>remove.has(item.id)?removed.push({item,index}):kept.push(item));
 return {kept,removed};
}

// Put removed items back at their old positions. Items added since keep their place;
// an id that already exists again is not duplicated.
export function restoreRemoved(items,removed){
 const out=[...items],have=new Set(items.map(x=>x.id));
 [...removed].sort((a,b)=>a.index-b.index).forEach(({item,index})=>{if(have.has(item.id))return;out.splice(Math.min(index,out.length),0,item);have.add(item.id);});
 return out;
}
