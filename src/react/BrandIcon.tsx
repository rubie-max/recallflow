import React from "react";
import {Lightbulb} from "lucide-react";

export function Brand({size=28}:{size?:number}){return <button type="button" className="recallflow-home-logo" aria-label="RecallFlow, go to home" title="Go to home" onClick={()=>window.dispatchEvent(new Event('recallflow-home'))}><Lightbulb size={size} className="recallflow-brand-icon" aria-hidden="true"/><strong className="recallflow-wordmark">Recall<span>Flow</span></strong></button>;}
