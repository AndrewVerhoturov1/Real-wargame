import { MovementProfileRegistry, getBuiltInMovementProfile, type MovementProfile } from '../core/movement/MovementProfiles';
import { getMovementProfileRegistry, saveMovementProfileRegistry, subscribeMovementProfileRegistry } from '../core/movement/MovementProfileStorage';
import { MOVEMENT_EDITOR_GROUPS } from './MovementProfileEditorSchema';
import { renderMovementProfileEditorView } from './MovementProfileEditorView';

let registry=getMovementProfileRegistry(),selectedId=registry.listProfiles()[0]?.id??'normal_walk',draft=registry.getProfile(selectedId);
let activePanel:HTMLElement|null=null,unsubscribe:(()=>void)|null=null,dirty=false;

export function renderMovementProfiles(panel:HTMLElement):void{activePanel=panel;panel.dataset.activeProfileEditor='movement';ensureSubscription();panel.innerHTML=renderMovementProfileEditorView(registry,draft,selectedId,dirty);bind(panel);}
export function disposeMovementProfileEditorPanel():void{unsubscribe?.();unsubscribe=null;activePanel=null;}
function ensureSubscription():void{if(unsubscribe)return;unsubscribe=subscribeMovementProfileRegistry(next=>{registry=next;if(!registry.hasProfile(selectedId))selectedId='normal_walk';draft=registry.getProfile(selectedId);dirty=false;if(activePanel?.dataset.activeProfileEditor==='movement')renderMovementProfiles(activePanel);});}

function bind(panel:HTMLElement):void{
 panel.querySelectorAll<HTMLButtonElement>('[data-movement-profile-id]').forEach(b=>b.addEventListener('click',()=>{selectedId=b.dataset.movementProfileId??'normal_walk';draft=registry.getProfile(selectedId);dirty=false;renderMovementProfiles(panel);}));
 panel.querySelectorAll<HTMLInputElement>('[data-movement-number]').forEach(input=>input.addEventListener('input',()=>{const path=input.dataset.movementNumber??'',f=MOVEMENT_EDITOR_GROUPS.flatMap(g=>g[2]).find(x=>x[0]===path);setPath(path,clamp(Number(input.value),f?.[3]??Number(input.min||0),f?.[4]??Number(input.max||100000)));panel.querySelectorAll<HTMLInputElement>(`[data-movement-number="${css(path)}"]`).forEach(peer=>{if(peer!==input)peer.value=input.value;});markDirty(panel);}));
 panel.querySelectorAll<HTMLInputElement>('[data-movement-text]').forEach(i=>i.addEventListener('input',()=>{setPath(i.dataset.movementText??'',i.value);markDirty(panel);}));
 panel.querySelectorAll<HTMLTextAreaElement>('[data-movement-area]').forEach(i=>i.addEventListener('input',()=>{setPath(i.dataset.movementArea??'',i.value);markDirty(panel);}));
 panel.querySelectorAll<HTMLSelectElement>('[data-movement-select]').forEach(i=>i.addEventListener('change',()=>{setPath(i.dataset.movementSelect??'',i.value||null);markDirty(panel);}));
 panel.querySelectorAll<HTMLInputElement>('[data-movement-checkbox]').forEach(i=>i.addEventListener('change',()=>{setPath(i.dataset.movementCheckbox??'',i.checked);markDirty(panel);}));
 panel.querySelectorAll<HTMLButtonElement>('[data-movement-reset]').forEach(b=>b.addEventListener('click',()=>{const p=b.dataset.movementReset??'';setPath(p,getPath(getBuiltInMovementProfile(draft.templateProfileId),p));dirty=true;renderMovementProfiles(panel);}));
 panel.querySelectorAll<HTMLButtonElement>('[data-movement-action]').forEach(b=>b.addEventListener('click',()=>handleAction(panel,b.dataset.movementAction??'')));
 panel.querySelector<HTMLInputElement>('[data-movement-import]')?.addEventListener('change',e=>void importFile(panel,e));
}
function handleAction(panel:HTMLElement,name:string):void{
 if(name==='save'){const{id:_id,revision:_revision,builtIn:_builtIn,...changes}=draft;registry.updateProfile(selectedId,changes);saveMovementProfileRegistry(registry);draft=registry.getProfile(selectedId);dirty=false;renderMovementProfiles(panel);return;}
 if(name==='cancel'){draft=registry.getProfile(selectedId);dirty=false;renderMovementProfiles(panel);return;}
 if(name==='reset'){if(!confirm(`Сбросить профиль «${draft.nameRu}»?`))return;registry.resetProfile(selectedId);saveMovementProfileRegistry(registry);draft=registry.getProfile(selectedId);dirty=false;renderMovementProfiles(panel);return;}
 if(name==='create'||name==='copy'){const ru=prompt('Название нового профиля:',name==='copy'?`${draft.nameRu} — копия`:'Новый профиль движения');if(!ru)return;const id=uniqueId(slug(ru)),created=registry.createCustomProfile(id,id,ru,name==='copy'?selectedId:'normal_walk');selectedId=created.id;saveMovementProfileRegistry(registry);draft=created;dirty=false;renderMovementProfiles(panel);return;}
 if(name==='rename'){const ru=prompt('Новое русское название:',draft.nameRu);if(!ru)return;const en=prompt('Новое английское название:',draft.nameEn)||draft.nameEn;registry.renameProfile(selectedId,en,ru);saveMovementProfileRegistry(registry);draft=registry.getProfile(selectedId);renderMovementProfiles(panel);return;}
 if(name==='delete'){if(draft.builtIn||!confirm(`Удалить профиль «${draft.nameRu}»?`))return;registry.deleteProfile(selectedId);selectedId='normal_walk';saveMovementProfileRegistry(registry);draft=registry.getProfile(selectedId);renderMovementProfiles(panel);return;}
 if(name==='export'){download('real-wargame-movement-profiles.json',registry.exportJson());return;}if(name==='import')panel.querySelector<HTMLInputElement>('[data-movement-import]')?.click();
}
async function importFile(panel:HTMLElement,event:Event):Promise<void>{const input=event.currentTarget as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;try{registry=MovementProfileRegistry.importJson(await file.text());selectedId=registry.hasProfile(selectedId)?selectedId:'normal_walk';saveMovementProfileRegistry(registry);draft=registry.getProfile(selectedId);dirty=false;renderMovementProfiles(panel);}catch(error){alert(`Не удалось импортировать профили движения. Текущие настройки сохранены. ${error instanceof Error?error.message:String(error)}`);}}
function getPath(source:unknown,path:string):unknown{return path.split('.').reduce<unknown>((v,k)=>typeof v==='object'&&v!==null?(v as Record<string,unknown>)[k]:undefined,source);}
function setPath(path:string,value:unknown):void{const clone=structuredClone(draft) as unknown as Record<string,unknown>,parts=path.split('.');let target=clone;for(const part of parts.slice(0,-1))target=target[part] as Record<string,unknown>;target[parts.at(-1)??'']=value;draft=clone as unknown as MovementProfile;}
function markDirty(panel:HTMLElement):void{dirty=true;const status=panel.querySelector<HTMLElement>('[data-movement-status]');if(status)status.textContent='Есть несохранённые изменения.';panel.querySelectorAll<HTMLButtonElement>('[data-movement-action="save"],[data-movement-action="cancel"]').forEach(b=>b.disabled=false);}
function uniqueId(base:string):string{let candidate=base||'custom_movement',n=2;while(registry.hasProfile(candidate))candidate=`${base||'custom_movement'}_${n++}`;return candidate;}
function slug(value:string):string{return value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||`custom_${Date.now().toString(36)}`;}
function clamp(value:number,min:number,max:number):number{return Number.isFinite(value)?Math.max(min,Math.min(max,value)):min;}
function css(value:string):string{return typeof CSS!=='undefined'&&CSS.escape?CSS.escape(value):value.replace(/[^a-zA-Z0-9_-]/g,'\\$&');}
function download(name:string,content:string):void{const blob=new Blob([content],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();URL.revokeObjectURL(url);}
