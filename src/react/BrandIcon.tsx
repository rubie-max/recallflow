import React from "react";
import {BookOpen} from "lucide-react";

export function BrandIcon({size=28}:{size?:number}){return <button type="button" className="recallflow-home-logo" aria-label="Go to home" title="Go to home" onClick={()=>window.dispatchEvent(new Event('recallflow-home'))}><BookOpen size={size} className="recallflow-brand-icon" role="img" aria-label="RecallFlow logo"/></button>;}
