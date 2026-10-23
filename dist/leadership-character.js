import {CREW_MODEL_URL,loadCrewTemplate} from './crew-character.js?v=smooth-20261023';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {attachCommanderCharacter} from './commander-character.js?v=smooth-20261023';

export const LEADERSHIP_MODELS={
 '小隊長':{url:CREW_MODEL_URL,name:'Squad_Leader_Navy_v03'},
 '分隊長':{url:new URL('./assets/station-chief-navy-v01.glb',import.meta.url),name:'Station_Chief_Navy_v01'},
 '大隊長':{url:new URL('./assets/division-chief-crimson-v02.glb',import.meta.url),name:'Division_Chief_Crimson_v02'}
};
const templates=new Map();
function loadTemplate(url){
 if(url.href===CREW_MODEL_URL.href)return loadCrewTemplate();
 if(!templates.has(url.href))templates.set(url.href,new GLTFLoader().loadAsync(url.href).catch(error=>{templates.delete(url.href);throw error;}));
 return templates.get(url.href);
}
export function attachLeadershipCharacter(person,{load}={}){
 const config=Object.hasOwn(LEADERSHIP_MODELS,person.rank)?LEADERSHIP_MODELS[person.rank]:null;
 if(!config)return person;
 attachCommanderCharacter(person,{load:load||(()=>loadTemplate(config.url))});
 const ready=person.ready;
 person.ready=ready.then(result=>{
  if(result.modelState==='ready'){
   result.visual.name=config.name;
   result.visual.userData.rank=person.rank;
  }
  return result;
 });
 return person;
}
