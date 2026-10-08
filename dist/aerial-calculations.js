import {rosenbauerProfile as profile} from './rosenbauer.js';
export function calculateAerialLoads(values){
 const read=k=>values[k]!==''&&values[k]!=null&&Number.isFinite(Number(values[k]))&&Number(values[k])>=0?Number(values[k]):null;
 const masses=['firefighter','gear','victim','equipment'].map(read),total=masses.every(v=>v!==null)?masses.reduce((a,b)=>a+b,0):null;
 const capacity=read('capacity'),soil=read('soil');
 const supports=Array.from({length:4},(_,i)=>{const force=read('force'+i),area=read('area'+i);return {force,area,pressure:force!==null&&area>0?force/area:null,requiredArea:force!==null&&soil>0?force/soil:null}});
 return {total,capacity,soil,supports};
}
export function addAerialCalculations(parent,aerial){
 const panel=document.createElement('details');parent.append(panel);
 panel.innerHTML='<summary>作業幾何與載重試算</summary><p class="note">已載入 Rosenbauer L32A-XS 3.2 公開規格；尚缺該工況作業曲線與支腿反力。以下場景以 1 單位＝1 公尺示意，非測繪值；不能據此核定伸梯或載人。</p><p data-geometry></p><p>實車容許半徑：待原廠作業曲線、載重、支腿展幅及作業方向資料。</p>';
 const specs=document.createElement('p');specs.textContent=profile.model+'／'+profile.configuration+'：工作高度 32 m、救援高度 30 m、籃架最高 500 kg（5 人）、支腿展幅 2.5–4.8 m、曲折末節 4.35 m、車體 10.05 × 2.5 × 3.3 m。最高額定值不等於所有工況可用值。';panel.prepend(specs);
 function input(label,name,unit){const wrap=document.createElement('label');wrap.textContent=label+'（'+unit+'）';const input=document.createElement('input');input.type='number';input.min='0';input.step='any';input.name=name;input.placeholder='待輸入';input.style.cssText='width:100%;box-sizing:border-box;min-height:40px;background:#1d2a34;color:#edf1f2;border:1px solid #53636d;border-radius:6px;padding:8px';wrap.append(input);panel.append(wrap);return input}
 const fields={};
 for(const [k,l] of [['firefighter','籃內消防員體重'],['gear','消防衣、SCBA 與隨身裝備'],['victim','待救者體重'],['equipment','籃內其他器材'],['capacity','原廠對應工況之容許籃載重']])fields[k]=input(l,k,'kg');
 const loadOutput=document.createElement('p');panel.append(loadOutput);
 const note=document.createElement('p');note.className='note';note.textContent='總載重為籃內人員與器材合計。旋轉台操作員不計入籃載重，但其重量會影響車體及支腿反力。籃架自重依原廠載重定義處理，不可重複扣算。';panel.append(note);
 fields.soil=input('經確認的地盤容許承壓','soil','kPa');
 const outputs=[];
 for(let i=0;i<4;i++){const title=document.createElement('p');title.textContent='支腿 '+(i+1);panel.append(title);fields['force'+i]=input('原廠／合格分析提供的該支腿反力','force'+i,'kN');fields['area'+i]=input('經確認可有效分布荷重的面積','area'+i,'m²');const output=document.createElement('p');panel.append(output);outputs.push(output)}
 const warning=document.createElement('p');warning.className='note';warning.textContent='支腿壓力＝反力 ÷ 有效面積；理論需求面積＝反力 ÷ 地盤容許承壓。不能將車重除以四當作支腿反力。本表不計算實車支腿反力、不核定墊板強度或穩定性；地下空洞、管溝、坡度與墊板剛性仍需確認。';panel.append(warning);
 const sources=document.createElement('p');sources.className='note';sources.innerHTML='<a href="https://www.ipaf.org/en/spreader-pad-calculator" target="_blank" rel="noopener">IPAF 支腿墊板資料</a> · <a href="https://www.rosenbauer.com/Sharepoint/aerial/Sales/Rosenbauer_L32A-XS_A2EA068_EN.pdf" target="_blank" rel="noopener">Rosenbauer 本車型原廠規格表</a>';panel.append(sources);
 let signature='';
 function update(){const values=Object.fromEntries(Object.entries(fields).map(([k,e])=>[k,e.value]));const r=calculateAerialLoads(values);const radius=Math.hypot(aerial.basket.position.x-aerial.pivot.x,aerial.basket.position.z-aerial.pivot.z),targetRadius=Math.hypot(aerial.target.x-aerial.pivot.x,aerial.target.z-aerial.pivot.z);
 const key=JSON.stringify([values,radius.toFixed(2),aerial.basket.position.y.toFixed(2)]);if(key===signature)return;signature=key;
 panel.querySelector('[data-geometry]').textContent='模型水平半徑（旋轉軸至籃中心）：'+radius.toFixed(2)+' m；二樓目標：'+targetRadius.toFixed(2)+' m；籃底面距道路：'+(aerial.basket.position.y+.065).toFixed(2)+' m。';
 loadOutput.textContent=r.total===null?'籃內總載重：待輸入四項重量（無器材請填 0）。':'籃內總載重：'+r.total.toFixed(1)+' kg。'+(r.capacity===null?'容許載重待原廠資料。':r.total>r.capacity?'超過輸入載重上限。':'未超過輸入載重上限；不代表實車安全核定。');
 outputs.forEach((out,i)=>{const s=r.supports[i];out.textContent=s.pressure===null?'承壓試算：待反力與有效面積。':'平均接地壓力：'+s.pressure.toFixed(1)+' kPa。'+(s.requiredArea===null?'地盤承壓資料不足。':'理論需求面積：'+s.requiredArea.toFixed(3)+' m²。'+(s.pressure>r.soil?'超過輸入地盤承壓。':'未超過輸入地盤承壓；非承載核定。'))});
 }
 panel.addEventListener('input',update);update();return update;
}
