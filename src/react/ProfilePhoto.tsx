import {useEffect,useState} from 'react';
import {profilePhoto,onProfilePhoto} from '../profile-photo.js';

export function useProfilePhoto(){
 const [photo,setPhoto]=useState(profilePhoto);
 useEffect(()=>onProfilePhoto(setPhoto),[]);
 return photo;
}
