import {GLTFLoader} from './vendor/GLTFLoader.js';
import {attachCommanderCharacter} from './commander-character.js?v=smooth-20261023';

export const CREW_MODEL_URL=new URL('./assets/crew-navy-firefighter-v03.glb',import.meta.url);
let templatePromise;
export function loadCrewTemplate(){
 return templatePromise??=new GLTFLoader().loadAsync(CREW_MODEL_URL.href).catch(error=>{templatePromise=null;throw error;});
}

// The user's newest source is captain v03. Crew keep its navy equipment and rig,
// but the captain-only red sleeve ring is hidden on each cloned visual.
// The commander adapter is reused only as a rig driver; its yellow asset is unchanged.
export function attachCrewCharacter(person,{load=loadCrewTemplate}={}){
 if(person.rank!=='隊員')return person;
 attachCommanderCharacter(person,{load});
 const ready=person.ready;
 person.ready=ready.then(result=>{
  if(result.modelState==='ready'){
   result.visual.name='Crew_Navy_v03';
   result.visual.userData.rank='隊員';
   result.visual.traverse(object=>{if(object.name.includes('小隊長')&&object.name.includes('紅色識別袖環'))object.visible=false;});
  }
  return result;
 });
 return person;
}
