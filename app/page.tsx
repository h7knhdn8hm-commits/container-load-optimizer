"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";

type LoadType = "Palletized" | "Loose";
type PalletPreset = "database" | "euro" | "industrial" | "gma";
type Item = {
  id: string; description: string; supplier: string; loadType: LoadType;
  qty: number; l: number; w: number; h: number; weight: number;
  cartonsPerPallet: number; cartonsPerLayer: number; layers: number;
  palletL: number; palletW: number; palletH: number; palletBaseH?: number;
  stackable?: boolean; maxStackLayers?: number; maxStackWeightKg?: number;
  cartonRotatable?: boolean; mustStayUpright?: boolean; estimated?: boolean;
};

const containers = {
  "20FT": { l: 589, w: 235, h: 239, maxKg: 28000 },
  "40FT": { l: 1203, w: 235, h: 239, maxKg: 26500 },
  "40HC": { l: 1203, w: 235, h: 269, maxKg: 26500 },
  "40RF": { l: 1158, w: 228, h: 243, maxKg: 28200 },
};

const demoItems: Item[] = [
  { id:"0310118", description:"מיני מנטוס 150 יח׳ בצילינדר", supplier:"VAN MELLE", loadType:"Palletized", qty:336, l:40,w:30,h:25,weight:9.45,cartonsPerPallet:24,cartonsPerLayer:4,layers:6,palletL:120,palletW:100,palletH:165 },
  { id:"0310124", description:"מנטוס שקית מסיבה 430 גרם", supplier:"VAN MELLE", loadType:"Palletized", qty:600, l:40,w:30,h:25,weight:5.16,cartonsPerPallet:60,cartonsPerLayer:10,layers:6,palletL:120,palletW:100,palletH:165 },
  { id:"2263001", description:"בראוניז שוקולד 200 גרם", supplier:"MR BROWNIE", loadType:"Palletized", qty:756, l:20,w:40,h:35,weight:2.4,cartonsPerPallet:63,cartonsPerLayer:9,layers:7,palletL:120,palletW:80,palletH:260,estimated:true },
  { id:"2401503", description:"חטיף לואקר קלאסי", supplier:"LOACKER 50CM 2026", loadType:"Loose", qty:960, l:20,w:40,h:35,weight:4,cartonsPerPallet:60,cartonsPerLayer:10,layers:6,palletL:120,palletW:80,palletH:225,estimated:true },
  { id:"6500404", description:"Lavazza Crema Gusto", supplier:"LAVAZZA", loadType:"Palletized", qty:1240, l:50,w:40,h:35,weight:5.55,cartonsPerPallet:155,cartonsPerLayer:31,layers:5,palletL:120,palletW:100,palletH:190,estimated:true },
  { id:"6912046", description:"יוגורטה תות 80 גרם", supplier:"GENERAL MILLS", loadType:"Loose", qty:720, l:50,w:50,h:35,weight:5.76,cartonsPerPallet:66,cartonsPerLayer:11,layers:6,palletL:120,palletW:100,palletH:225,estimated:true },
  { id:"9301170", description:"מרכך כביסה 1 ליטר", supplier:"BIOMAT", loadType:"Palletized", qty:540, l:50,w:50,h:35,weight:12.04,cartonsPerPallet:60,cartonsPerLayer:10,layers:6,palletL:120,palletW:100,palletH:225,estimated:true },
];

type Packed = { x:number; y:number; z:number; l:number; w:number; h:number; item:Item; units:number };

function effectiveCartonsPerPallet(item:Item, cartonScale:number){
  const layers=Math.max(1,item.layers||1);
  const basePerLayer=Math.max(1,item.cartonsPerLayer||Math.ceil(item.cartonsPerPallet/layers));
  const scaledPerLayer=Math.max(1,Math.floor(basePerLayer/(cartonScale*cartonScale)));
  return scaledPerLayer*layers;
}

function pack(items: Item[], c: typeof containers["40HC"], cartonScale = 1) {
  const packed: Packed[] = [];
  let x=0,y=0,z=0,rowDepth=0,layerHeight=0,totalKg=0,requested=0,loaded=0;
  requested=items.reduce((sum,item)=>sum+item.qty,0);
  const queues=items.filter(item=>item.qty>0).map(item=>{const pallet=item.loadType==="Palletized",unitSize=pallet?effectiveCartonsPerPallet(item,cartonScale):1;return{item,pallet,unitSize,remaining:Math.ceil(item.qty/unitSize),used:0,blocked:false}});
  let safety=0;
  while(safety<6000){
    const candidates=queues.filter(q=>q.remaining>0&&!q.blocked).sort((a,b)=>(a.used/Math.max(1,a.item.qty))-(b.used/Math.max(1,b.item.qty)));
    if(!candidates.length)break;safety++;
    const q=candidates[0],{item,pallet,unitSize}=q,L=pallet?item.palletL:Math.max(8,item.l*cartonScale),W=pallet?item.palletW:Math.max(8,item.w*cartonScale),H=pallet?item.palletH:Math.max(8,item.h);
    let nx=x,ny=y,nz=z,nRow=rowDepth,nLayer=layerHeight;
    if(nx+L>c.l){nx=0;ny+=nRow;nRow=0}
    if(ny+W>c.w){ny=0;nx=0;nz+=nLayer;nRow=0;nLayer=0}
    const actualUnits=Math.min(unitSize,item.qty-q.used),kg=actualUnits*item.weight;
    const palletTier=pallet?Math.floor(nz/Math.max(1,H))+1:1;
    const tierBlocked=pallet&&((!item.stackable&&nz>0)||Boolean(item.maxStackLayers&&palletTier>item.maxStackLayers));
    if(nz+H>c.h||totalKg+kg>c.maxKg||tierBlocked){q.blocked=true;continue}
    x=nx;y=ny;z=nz;rowDepth=nRow;layerHeight=nLayer;
    packed.push({x,y,z,l:L,w:W,h:H,item,units:actualUnits});x+=L;rowDepth=Math.max(rowDepth,W);layerHeight=Math.max(layerHeight,H);totalKg+=kg;loaded+=actualUnits;q.used+=actualUnits;q.remaining--;
  }
  const usedVol=packed.reduce((s,p)=>s+p.l*p.w*p.h,0);
  return {packed,totalKg,requested,loaded,volumePct:usedVol/(c.l*c.w*c.h)*100,weightPct:totalKg/c.maxKg*100};
}

function capacityForMix(items:Item[],c:typeof containers["40HC"],cartonScale=1){
  const active=items.filter(item=>item.qty>0);
  const requested=active.reduce((sum,item)=>sum+item.qty,0);
  if(!requested)return pack([],c,cartonScale);
  const factor=Math.max(1,Math.ceil(50000/requested));
  return pack(active.map(item=>({...item,qty:item.qty*factor})),c,cartonScale);
}

function singleCapacity(item: Item, c: typeof containers["40HC"], palletized: boolean) {
  const palletTiers=palletized?(item.palletH>c.h?0:item.stackable?Math.min(Math.floor(c.h/item.palletH),item.maxStackLayers||99):1):1;
  const options = palletized
    ? [[item.palletL,item.palletW,item.palletH],[item.palletW,item.palletL,item.palletH]]
    : item.mustStayUpright!==false?[[item.l,item.w,item.h],[item.w,item.l,item.h]]:[[item.l,item.w,item.h],[item.w,item.l,item.h],[item.l,item.h,item.w],[item.h,item.l,item.w],[item.w,item.h,item.l],[item.h,item.w,item.l]];
  let geometric=0;
  for(const [l,w,h] of options) geometric=Math.max(geometric,Math.floor(c.l/l)*Math.floor(c.w/w)*(palletized?palletTiers:Math.floor(c.h/h)));
  const units=palletized?item.cartonsPerPallet:1;
  const byWeight=Math.floor(c.maxKg/(item.weight*units));
  const maxLoads=Math.min(geometric,byWeight);
  return {maximum:maxLoads*units,recommended:Math.floor(maxLoads*.94)*units,loads:maxLoads,weightLimited:byWeight<geometric};
}

function optimizePalletHeightForExtraTier(item:Item,c:typeof containers["40HC"]){
  if(item.loadType!=="Palletized"||!item.stackable||(item.maxStackLayers||2)<2||item.palletH<=c.h/2)return item;
  const palletBaseH=Math.max(8,item.palletBaseH||15),targetHeight=c.h/2;
  const layers=Math.max(1,Math.floor((targetHeight-palletBaseH)/Math.max(1,item.h)));
  if(layers>=item.layers||layers<1)return item;
  const candidate={...item,layers,cartonsPerPallet:layers*Math.max(1,item.cartonsPerLayer),palletH:palletBaseH+layers*item.h};
  return singleCapacity(candidate,c,true).maximum>singleCapacity(item,c,true).maximum?candidate:item;
}

const colors=["#2563eb","#0d9488","#f59e0b","#7c3aed","#e11d48","#0891b2","#65a30d","#ea580c","#4f46e5","#db2777","#16a34a","#9333ea"];

function shadeColor(hex:string,factor:number){
  const value=parseInt(hex.slice(1),16);
  const channel=(shift:number)=>Math.max(0,Math.min(255,Math.round(((value>>shift)&255)*factor)));
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function rowsToItems(rows: Record<string,unknown>[]) {
  const n=(v:unknown,f:number)=>Number(v)||f;
  const optionalNumber=(v:unknown)=>v===null||v===undefined||v===""?undefined:Number(v)||undefined;
  const yes=(v:unknown,f=false)=>v===null||v===undefined||v===""?f:/^(y|yes|true|1|כן)$/i.test(String(v).trim());
  const supplierName=(v:unknown)=>String(v||"ספק לא מוגדר").replace("LI}TON","LIPTON");
  return rows.slice(0,1000).map((r,idx):Item=>({
    id:String(r.ItemNumber||`ITEM-${idx+1}`),description:String(r.ItemDescription||r.ENG||"פריט ללא תיאור"),supplier:supplierName(r.Supplier),
    loadType:String(r.LoadType).toLowerCase().includes("pallet")?"Palletized":"Loose",qty:n(r.Quantity,n(r.CartonsPerPallet,60)*8),
    l:n(r.CartonLengthCm,40),w:n(r.CartonWidthCm,30),h:n(r.CartonHeightCm,25),weight:n(r.CartonWeightKg,5),cartonsPerPallet:n(r.CartonsPerPallet,60),
    cartonsPerLayer:n(r.CartonsPerLayer,10),layers:n(r.LayersPerPallet,6),palletL:n(r.PalletLengthCm,120),palletW:n(r.PalletWidthCm,100),
    palletH:n(r.LoadedPalletHeightCm,Math.min(220,n(r.CartonHeightCm,25)*n(r.LayersPerPallet,6)+n(r.PalletHeightCm,15))),palletBaseH:n(r.PalletHeightCm,15),
    stackable:yes(r.Stackable,false),maxStackLayers:optionalNumber(r.MaxStackLayers),maxStackWeightKg:optionalNumber(r.MaxStackWeightKg),
    cartonRotatable:yes(r.CartonRotatable,true),mustStayUpright:yes(r.MustStayUpright,true),
    estimated:![r.CartonLengthCm,r.CartonWidthCm,r.CartonHeightCm,r.PalletLengthCm,r.PalletWidthCm,r.LoadedPalletHeightCm].every(Boolean)
  }));
}

function applyPalletPreset(item:Item,preset:PalletPreset){
  if(preset==="database")return item;
  const [palletL,palletW]=preset==="euro"?[120,80]:preset==="gma"?[122,102]:[120,100];
  const baseArea=Math.max(1,item.palletL*item.palletW);
  const areaRatio=palletL*palletW/baseArea;
  const cartonsPerLayer=Math.max(1,Math.floor(item.cartonsPerLayer*areaRatio));
  return {...item,palletL,palletW,cartonsPerLayer,cartonsPerPallet:cartonsPerLayer*Math.max(1,item.layers)};
}

function ContainerCanvas({result, mode, container, colorById}:{result:ReturnType<typeof pack>;mode:"2d"|"3d";container:typeof containers["40HC"];colorById:Map<string,string>}){
  const ref=useRef<HTMLCanvasElement>(null);
  const drag=useRef<{x:number;y:number;yaw:number;pitch:number}|null>(null);
  const [view,setView]=useState({yaw:-0.42,pitch:0.38,zoom:1});
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;const ctx=canvas.getContext("2d");if(!ctx)return;
    const dpr=window.devicePixelRatio||1;const rect=canvas.getBoundingClientRect();canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;ctx.scale(dpr,dpr);
    const W=rect.width,H=rect.height;ctx.clearRect(0,0,W,H);const packedColor=(id:string)=>colorById.get(id)||colors[0];
    if(mode==="2d"){
      const pad=22,scale=Math.min((W-pad*2)/container.l,(H-pad*2)/container.w);const ox=(W-container.l*scale)/2,oy=(H-container.w*scale)/2;
      ctx.fillStyle="#f8fafc";ctx.strokeStyle="#334155";ctx.lineWidth=2;ctx.fillRect(ox,oy,container.l*scale,container.w*scale);ctx.strokeRect(ox,oy,container.l*scale,container.w*scale);
      result.packed.filter(p=>p.z===0).forEach((p)=>{ctx.fillStyle=packedColor(p.item.id);ctx.fillRect(ox+p.x*scale,oy+p.y*scale,p.l*scale,p.w*scale);ctx.strokeStyle=p.item.loadType==="Palletized"?"#6b4423":"#fff";ctx.lineWidth=p.item.loadType==="Palletized"?2:1;ctx.strokeRect(ox+p.x*scale,oy+p.y*scale,p.l*scale,p.w*scale);if(p.l*scale>34){ctx.fillStyle="#fff";ctx.font="600 10px Arial";ctx.fillText(p.item.id.slice(-4),ox+p.x*scale+4,oy+p.y*scale+13)}});
    }else{
      const sx=Math.min(W/(container.l+container.w),H/(container.h+container.w*.55))*.88*view.zoom,cx=container.l/2,cy=container.w/2,cz=container.h/2,cosY=Math.cos(view.yaw),sinY=Math.sin(view.yaw),sinP=Math.sin(view.pitch),cosP=Math.cos(view.pitch);
      const iso=(x:number,y:number,z:number)=>{const dx=x-cx,dy=y-cy,dz=z-cz,rx=dx*cosY-dy*sinY,depth=dx*sinY+dy*cosY;return{x:W/2+rx*sx,y:H/2+(depth*sinP-dz*cosP)*sx}};
      const ordered=[...result.packed].sort((a,b)=>{const da=(a.x+a.l/2-cx)*sinY+(a.y+a.w/2-cy)*cosY;const db=(b.x+b.l/2-cx)*sinY+(b.y+b.w/2-cy)*cosY;return da-db});
      const drawSolid=(x:number,y:number,z:number,l:number,w:number,h:number,col:string,stroke:string="#ffffff")=>{const a=iso(x,y,z),b=iso(x+l,y,z),c=iso(x+l,y+w,z),at=iso(x,y,z+h),bt=iso(x+l,y,z+h),ct=iso(x+l,y+w,z+h),dt=iso(x,y+w,z+h);ctx.globalAlpha=1;ctx.lineWidth=.8;ctx.strokeStyle=stroke;ctx.fillStyle=shadeColor(col,1.08);ctx.beginPath();ctx.moveTo(at.x,at.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(ct.x,ct.y);ctx.lineTo(dt.x,dt.y);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=col;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(bt.x,bt.y);ctx.lineTo(at.x,at.y);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=shadeColor(col,.78);ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(ct.x,ct.y);ctx.lineTo(bt.x,bt.y);ctx.closePath();ctx.fill();ctx.stroke()};
      ordered.forEach((p)=>{const col=packedColor(p.item.id);if(p.item.loadType==="Palletized"){const palletH=Math.min(12,Math.max(8,p.h*.09)),runnerH=Math.min(4,palletH/2),runnerW=Math.min(12,p.w/5);[0,(p.w-runnerW)/2,p.w-runnerW].forEach(offset=>drawSolid(p.x,p.y+offset,p.z,p.l,runnerW,runnerH,"#6b4423","#5b3a20"));drawSolid(p.x,p.y,p.z+runnerH,p.l,p.w,palletH-runnerH,"#a4713f","#5b3a20");drawSolid(p.x,p.y,p.z+palletH,p.l,p.w,Math.max(1,p.h-palletH),col)}else drawSolid(p.x,p.y,p.z,p.l,p.w,p.h,col)});ctx.globalAlpha=1;
      const corners=[[0,0,0],[container.l,0,0],[container.l,container.w,0],[0,container.w,0],[0,0,container.h],[container.l,0,container.h],[container.l,container.w,container.h],[0,container.w,container.h]].map(v=>iso(v[0],v[1],v[2]));ctx.strokeStyle="#334155";ctx.lineWidth=1.4;[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]].forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(corners[a].x,corners[a].y);ctx.lineTo(corners[b].x,corners[b].y);ctx.stroke()});
    }
  },[result,mode,container,view,colorById]);
  const pointerDown=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(mode!=="3d")return;drag.current={x:e.clientX,y:e.clientY,yaw:view.yaw,pitch:view.pitch};e.currentTarget.setPointerCapture(e.pointerId)};
  const pointerMove=(e:React.PointerEvent<HTMLCanvasElement>)=>{if(!drag.current||mode!=="3d")return;const d=drag.current;setView(v=>({...v,yaw:d.yaw+(e.clientX-d.x)*.009,pitch:Math.max(-.15,Math.min(1.15,d.pitch+(e.clientY-d.y)*.006))}))};
  const pointerUp=()=>{drag.current=null};
  return <div className="canvas-shell"><canvas ref={ref} className={`container-canvas ${mode==="3d"?"interactive":""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={e=>{if(mode!=="3d")return;e.preventDefault();setView(v=>({...v,zoom:Math.max(.55,Math.min(1.8,v.zoom*(e.deltaY>0?.92:1.08)))}))}} aria-label={mode==="2d"?"מבט על של המכולה":"המחשה תלת ממדית אינטראקטיבית של המכולה"}/></div>;
}

export default function Home(){
  const [items,setItems]=useState<Item[]>(demoItems);const [selected,setSelected]=useState<string[]>(demoItems.map(x=>x.id));const [containerType,setContainerType]=useState<keyof typeof containers>("40HC");const [supplier,setSupplier]=useState("הכול");const [tab,setTab]=useState<"2d"|"3d">("3d");const [fileName,setFileName]=useState("LOADING DEMO.xlsx");const [workMode,setWorkMode]=useState<"single"|"mixed">("single");const [simulationMode,setSimulationMode]=useState<"database"|"palletized"|"loose">("database");const [palletPreset,setPalletPreset]=useState<PalletPreset>("database");const [heightOptimization,setHeightOptimization]=useState(false);const [focusId,setFocusId]=useState(demoItems[0].id);
  const c=containers[containerType];
  const visible=useMemo(()=>items.filter(i=>(supplier==="הכול"||i.supplier===supplier)&&selected.includes(i.id)),[items,supplier,selected]);
  const simulationItems=useMemo(()=>visible.map(item=>{const withMode=simulationMode==="database"?item:{...item,loadType:simulationMode==="palletized"?"Palletized" as LoadType:"Loose" as LoadType};const prepared=withMode.loadType==="Palletized"?applyPalletPreset(withMode,palletPreset):withMode;return heightOptimization?optimizePalletHeightForExtraTier(prepared,c):prepared}),[visible,simulationMode,palletPreset,heightOptimization,c]);
  const result=useMemo(()=>pack(simulationItems,c,1),[simulationItems,c]);
  const currentCapacity=useMemo(()=>capacityForMix(simulationItems,c,1),[simulationItems,c]);
  const palletizedItems=useMemo(()=>visible.map(item=>applyPalletPreset({...item,loadType:"Palletized" as LoadType},palletPreset)),[visible,palletPreset]);
  const optimizedPalletizedItems=useMemo(()=>palletizedItems.map(item=>optimizePalletHeightForExtraTier(item,c)),[palletizedItems,c]);
  const looseItems=useMemo(()=>visible.map(item=>({...item,loadType:"Loose" as LoadType})),[visible]);
  const rotatedPalletizedItems=useMemo(()=>palletizedItems.map(item=>({...item,palletL:item.palletW,palletW:item.palletL,l:item.w,w:item.l})),[palletizedItems]);
  const rotatedLooseItems=useMemo(()=>looseItems.map(item=>({...item,l:item.w,w:item.l,palletL:item.palletW,palletW:item.palletL})),[looseItems]);
  const palletBase=useMemo(()=>capacityForMix(palletizedItems,c,1),[palletizedItems,c]);
  const palletRotated=useMemo(()=>capacityForMix(rotatedPalletizedItems,c,1),[rotatedPalletizedItems,c]);
  const optimizedPalletRotatedItems=useMemo(()=>optimizedPalletizedItems.map(item=>({...item,palletL:item.palletW,palletW:item.palletL,l:item.w,w:item.l})),[optimizedPalletizedItems]);
  const optimizedPalletBase=useMemo(()=>capacityForMix(optimizedPalletizedItems,c,1),[optimizedPalletizedItems,c]);
  const optimizedPalletRotated=useMemo(()=>capacityForMix(optimizedPalletRotatedItems,c,1),[optimizedPalletRotatedItems,c]);
  const looseBase=useMemo(()=>capacityForMix(looseItems,c,1),[looseItems,c]);
  const looseRotated=useMemo(()=>capacityForMix(rotatedLooseItems,c,1),[rotatedLooseItems,c]);
  const palletScenario=palletRotated.loaded>palletBase.loaded?palletRotated:palletBase;
  const optimizedPalletScenario=optimizedPalletRotated.loaded>optimizedPalletBase.loaded?optimizedPalletRotated:optimizedPalletBase;
  const looseScenario=looseRotated.loaded>looseBase.loaded?looseRotated:looseBase;
  const palletRotationGain=Math.max(0,palletRotated.loaded-palletBase.loaded);
  const stackHeightGain=Math.max(0,optimizedPalletScenario.loaded-palletScenario.loaded);
  const looseRotationGain=Math.max(0,looseRotated.loaded-looseBase.loaded);
  const noCapacity=result.requested>0&&currentCapacity.loaded===0;
  const capacityFillPct=currentCapacity.loaded?result.requested/currentCapacity.loaded*100:0;
  const canAdd=Math.max(0,currentCapacity.loaded-result.requested);
  const overflow=noCapacity?result.requested:Math.max(0,result.requested-currentCapacity.loaded);
  const fillStatus=noCapacity||capacityFillPct>100?"critical":capacityFillPct>=90?"good":capacityFillPct>=75?"near":"under";
  const weightIsLimiting=currentCapacity.weightPct>=99&&currentCapacity.volumePct<95;
  const recommendedMode=looseScenario.loaded>palletScenario.loaded?"loose":palletScenario.loaded>looseScenario.loaded?"palletized":"equal";
  const recommendedCapacity=Math.max(looseScenario.loaded,palletScenario.loaded);
  const recommendedDifference=Math.abs(looseScenario.loaded-palletScenario.loaded);
  const containerCbm=c.l*c.w*c.h/1_000_000;
  const netCargoCbm=visible.reduce((sum,item)=>sum+item.qty*item.l*item.w*item.h,0)/1_000_000;
  const plannedPhysicalCbm=simulationItems.reduce((sum,item)=>sum+(item.loadType==="Palletized"?Math.ceil(item.qty/Math.max(1,item.cartonsPerPallet))*item.palletL*item.palletW*item.palletH:item.qty*item.l*item.w*item.h),0)/1_000_000;
  const palletizedPhysicalCbm=palletizedItems.reduce((sum,item)=>sum+Math.ceil(item.qty/Math.max(1,item.cartonsPerPallet))*item.palletL*item.palletW*item.palletH,0)/1_000_000;
  const cbmDemandPct=containerCbm?plannedPhysicalCbm/containerCbm*100:0;
  const netCargoPct=containerCbm?netCargoCbm/containerCbm*100:0;
  const palletizedCbmPct=containerCbm?palletizedPhysicalCbm/containerCbm*100:0;
  const plannedWeightKg=visible.reduce((sum,item)=>sum+item.qty*item.weight,0);
  const weightDemandPct=c.maxKg?plannedWeightKg/c.maxKg*100:0;
  const scenarioVolumeLabel=simulationMode==="loose"?"נפח קרטונים ללא משטחים":simulationMode==="palletized"?"נפח כולל משטחים":"נפח לפי שיטת ההעמסה מהקובץ";
  const palletPresetLabel=palletPreset==="database"?"לפי נתוני הפריטים":palletPreset==="euro"?"Euro 120×80":palletPreset==="gma"?"GMA 122×102":"ISO 120×100";
  const heightCandidateIndex=palletizedItems.findIndex((item,index)=>optimizedPalletizedItems[index]&&optimizedPalletizedItems[index].palletH<item.palletH);
  const heightCandidate=heightCandidateIndex>=0?palletizedItems[heightCandidateIndex]:null;
  const optimizedHeightCandidate=heightCandidateIndex>=0?optimizedPalletizedItems[heightCandidateIndex]:null;
  const mixedOpportunity=visible.length>1&&(visible.some(item=>item.loadType==="Loose")||visible.some(item=>item.stackable)&&visible.some(item=>!item.stackable));
  const estimatedItemsCount=visible.filter(item=>item.estimated).length;
  const singleMixItem=visible.length===1?palletizedItems[0]:null;
  const looseVsPalletRatio=palletScenario.loaded?looseScenario.loaded/palletScenario.loaded:0;
  const suppliers=["הכול",...Array.from(new Set(items.map(i=>i.supplier)))];
  useEffect(()=>{let active=true;(async()=>{const saved=localStorage.getItem("container-suppliers-v4");if(saved){try{const parsed=(JSON.parse(saved) as Item[]).map(item=>({...item,supplier:item.supplier==="LI}TON"?"LIPTON":item.supplier}));if(Array.isArray(parsed)&&parsed.length){setItems(parsed);setSelected(parsed.slice(0,7).map((x:Item)=>x.id));setFocusId(parsed[0].id);return}}catch{}}try{const XLSX=await import("xlsx");const response=await fetch("assets/loading-demo.xlsx");const wb=XLSX.read(await response.arrayBuffer());const parsed=rowsToItems(XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]]));if(active&&parsed.length){setItems(parsed);setSelected(parsed.slice(0,7).map(x=>x.id));setFocusId(parsed[0].id);localStorage.setItem("container-suppliers-v4",JSON.stringify(parsed))}}catch{}})();return()=>{active=false}},[]);
  useEffect(()=>localStorage.setItem("container-suppliers-v4",JSON.stringify(items)),[items]);
  const importFile=async(e:ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;setFileName(file.name);const XLSX=await import("xlsx");const wb=XLSX.read(await file.arrayBuffer());const mapped=rowsToItems(XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[wb.SheetNames[0]]));if(mapped.length){setItems(mapped);setSelected(mapped.slice(0,7).map(x=>x.id));setSupplier("הכול");setFocusId(mapped[0].id);localStorage.setItem("container-suppliers-v4",JSON.stringify(mapped))}};
  const changeSupplier=(value:string)=>{setSupplier(value);const pool=value==="הכול"?items:items.filter(i=>i.supplier===value);if(pool.length){setFocusId(pool[0].id);setSelected(pool.slice(0,7).map(i=>i.id))}};
  const updateQty=(id:string,qty:number)=>setItems(v=>v.map(x=>x.id===id?{...x,qty:Math.max(0,qty)}:x));
  const focus=items.find(x=>x.id===focusId)||items[0];
  const legendItems=Array.from(new Map(result.packed.map(p=>[p.item.id,p.item])).values()).slice(0,7);
  const colorById=useMemo(()=>{
    const map=new Map<string,string>();
    const supplierIndex=new Map<string,number>();
    items.forEach((item)=>{
      const index=supplierIndex.get(item.supplier)||0;
      map.set(item.id,colors[index%colors.length]);
      supplierIndex.set(item.supplier,index+1);
    });
    return map;
  },[items]);
  return <main dir="rtl">
    <header className="topbar"><div className="brand"><img src="assets/ls-logo.png" alt="ליימן שליסל"/><div><div className="eyebrow">LOADWISE · כלי תכנון יבוא</div><h1>מקסום העמסת מכולות</h1></div></div><label className="upload"><span>＋</span><span><b>ייבוא Excel / CSV</b><small>{fileName}</small></span><input type="file" accept=".xlsx,.xls,.csv" onChange={importFile}/></label></header>
    <nav className="mode-switch"><button className={workMode==="single"?"active":""} onClick={()=>setWorkMode("single")}><b>יכולת העמסה לפריט</b><small>מקסימום ומומלץ לכל מק״ט</small></button><button className={workMode==="mixed"?"active":""} onClick={()=>setWorkMode("mixed")}><b>העמסה מעורבת</b><small>בניית הזמנה ממספר פריטים</small></button></nav>
    <section className="controls card"><label>ספק<select value={supplier} onChange={e=>changeSupplier(e.target.value)}>{suppliers.map(s=><option key={s}>{s}</option>)}</select></label><label>מכולה לסימולציה<select value={containerType} onChange={e=>setContainerType(e.target.value as keyof typeof containers)}>{Object.keys(containers).map(s=><option key={s} value={s}>{s==="40RF"?"40RF · Reefer":s}</option>)}</select></label>{workMode==="mixed"&&<label>איך להעמיס בסימולציה<select value={simulationMode} onChange={e=>setSimulationMode(e.target.value as "database"|"palletized"|"loose")}><option value="database">כמו שמוגדר בקובץ לכל פריט</option><option value="palletized">הכול על משטחים</option><option value="loose">הכול ללא משטחים · Loose</option></select></label>}{workMode==="mixed"&&<label>סוג משטח להשוואה<select value={palletPreset} onChange={e=>setPalletPreset(e.target.value as PalletPreset)}><option value="database">המידות שמופיעות בקובץ</option><option value="euro">Euro · 120×80</option><option value="industrial">ISO / תעשייתי · 120×100</option><option value="gma">GMA · 122×102</option></select></label>}{workMode==="mixed"&&<label>בדיקת קומה נוספת<select value={heightOptimization?"optimized":"original"} onChange={e=>setHeightOptimization(e.target.value==="optimized")}><option value="original">גובה המשטח המקורי</option><option value="optimized">התאמת גובה אוטומטית לקומה נוספת</option></select></label>}</section>
    {workMode==="mixed"&&<section className={`container-summary card ${cbmDemandPct>100||weightDemandPct>100||weightIsLimiting?"over":""}`}><div className="container-capacity"><span>קיבולת המכולה הנבחרת</span><strong>{containerCbm.toFixed(1)} <small>CBM</small></strong><b>{containerType==="40RF"?"40RF · Reefer":containerType}</b></div><div className="container-facts"><div><span>מידות פנימיות</span><b>{c.l} × {c.w} × {c.h} ס״מ</b></div><div><span>משקל מטען מרבי לפי הציוד</span><b>{c.maxKg.toLocaleString()} ק״ג</b></div><div className={weightDemandPct>100||weightIsLimiting?"fact-alert":""}><span>משקל המטען שבחרת</span><b>{plannedWeightKg.toLocaleString()} ק״ג · {weightDemandPct.toFixed(1)}%</b>{(weightDemandPct>100||weightIsLimiting)&&<small>לא ניתן למלא את המכולה מעבר לנקודה זו עקב מגבלת משקל</small>}</div></div><p>CBM הוא נפח תיאורטי. הקיבולת המעשית מחושבת גם לפי מידות הקרטונים, המשטחים, צורת הסידור והמשקל. יש לאמת מגבלות כביש ונמל לפי מדינת היעד.</p></section>}
    {workMode==="single"&&focus&&<section className="single card"><div className="single-picker"><label>בחרי פריט לבדיקה<select value={focus.id} onChange={e=>setFocusId(e.target.value)}>{items.filter(i=>supplier==="הכול"||i.supplier===supplier).map(i=><option key={i.id} value={i.id}>{i.id} · {i.description}</option>)}</select></label><div><span>ספק</span><b>{focus.supplier}</b></div><div><span>מידות קרטון</span><b>{focus.l}×{focus.w}×{focus.h} ס״מ</b></div><div><span>משקל קרטון</span><b>{focus.weight} ק״ג</b></div></div><div className="capacity-grid">{Object.entries(containers).map(([name,cont])=>{const loose=singleCapacity(focus,cont,false),pal=singleCapacity(focus,cont,true);return <article key={name}><h3>{name}</h3><div className="capacity-row"><span>קרטונים חופשיים</span><b>{loose.maximum.toLocaleString()}</b><small>מקסימום</small><strong>{loose.recommended.toLocaleString()}</strong><small>מומלץ</small><em>{loose.weightLimited?"מוגבל משקל":"מוגבל נפח"}</em></div><div className="capacity-row"><span>העמסה ממושטחת</span><b>{pal.maximum.toLocaleString()}</b><small>מקסימום</small><strong>{pal.recommended.toLocaleString()}</strong><small>מומלץ</small><em>{pal.loads.toLocaleString()} משטחים · {pal.weightLimited?"מוגבל משקל":"מוגבל נפח"}</em></div></article>})}</div><p className="method-note">הכמות המקסימלית היא גבול גאומטרי/משקלי. הכמות המומלצת מחושבת ב־94% מהקיבולת ומשאירה מרווח תפעולי לפתחים, סטיות מידות ואבטחת מטען.</p></section>}
    {workMode==="mixed"&&<>
    <section className="kpis">
      <article><span>כמות שבחרת להעמיס</span><strong>{result.requested.toLocaleString()}</strong><small>קרטונים בתמהיל הנוכחי</small></article>
      <article><span>קיבולת מרבית · {containerType}</span><strong>{currentCapacity.loaded.toLocaleString()}</strong><small>{simulationMode==="database"?"לפי שיטת ההעמסה של כל פריט":simulationMode==="palletized"?"בסימולציה ממושטחת":"בסימולציית Loose"}</small></article>
      <article className={overflow>0?"critical":"good"}><span>{overflow>0?"חריגה מקיבולת המכולה":"אפשר להוסיף עד למילוי"}</span><strong>{(overflow>0?overflow:canAdd).toLocaleString()}</strong><small>{overflow>0?"קרטונים מעבר לקיבולת — לא ייכנסו":"קרטונים נוספים באותו יחס תמהיל"}</small></article>
      <article className={fillStatus}><span>מילוי ביחס לקיבולת</span><strong>{noCapacity?"לא ניתן":`${capacityFillPct.toFixed(1)}%`}</strong><small>{noCapacity?"היחידות אינן נכנסות במידות המכולה":`${result.requested.toLocaleString()} קרטונים מתוך קיבולת של ${currentCapacity.loaded.toLocaleString()}`}</small><i className="bar capacity-bar"><i style={{width:`${noCapacity?100:Math.min(100,capacityFillPct)}%`}}/></i></article>
      <article className={cbmDemandPct>100?"critical":cbmDemandPct>=85?"good":"under"}><span>{scenarioVolumeLabel}</span><strong>{plannedPhysicalCbm.toFixed(1)} CBM</strong><small>{cbmDemandPct.toFixed(1)}% מקיבולת המכולה · {containerCbm.toFixed(1)} CBM</small><i className="bar cbm-bar"><i style={{width:`${Math.min(100,cbmDemandPct)}%`}}/></i></article>
    </section>
    <div className={`load-summary ${weightIsLimiting?"critical":fillStatus}`}><strong>{weightIsLimiting?"לא ניתן למלא את המכולה עד סוף הנפח עקב מגבלת משקל":noCapacity?"לא ניתן להעמיס בתצורה שנבחרה":capacityFillPct>100?`חריגה של ${overflow.toLocaleString()} קרטונים`:capacityFillPct>=90?"המכולה מנוצלת היטב":`ניתן להוסיף עוד ${canAdd.toLocaleString()} קרטונים`}</strong><span>{weightIsLimiting?`המשקל מגיע ל־${currentCapacity.weightPct.toFixed(1)}% לפני שהנפח מתמלא. זו המגבלה הקובעת בתרחיש.`:noCapacity?"בדקי את גובה המשטח או עברי לתרחיש Loose.":capacityFillPct>100?`הכמות היא ${capacityFillPct.toFixed(1)}% מהקיבולת. יש להפחית את החריגה או לפצל למכולה נוספת.`:capacityFillPct>=90?`הכמות היא ${capacityFillPct.toFixed(1)}% מהקיבולת ונמצאת בטווח יעיל.`:`הכמות היא ${capacityFillPct.toFixed(1)}% מהקיבולת של ${containerType}.`}</span></div>
    <section className="workspace"><div className="visual card"><div className="section-head"><div><h2>תכנית העמסה · {containerType}</h2><p>{simulationMode==="database"?"שיטת העמסה לפי נתוני הפריטים":simulationMode==="palletized"?"תרחיש: הכול ממושטַח":"תרחיש: הכול Loose"} · ניצולת נפח {result.volumePct.toFixed(1)}% · משקל {result.weightPct.toFixed(1)}%</p></div><div className="tabs"><button className={tab==="3d"?"active":""} onClick={()=>setTab("3d")}>תלת־ממד</button><button className={tab==="2d"?"active":""} onClick={()=>setTab("2d")}>מבט־על 2D</button></div></div><ContainerCanvas result={result} mode={tab} container={c} colorById={colorById}/><div className="legend">{legendItems.map((x)=><span key={x.id}><i style={{background:colorById.get(x.id)||colors[0]}}/>{x.id}</span>)}</div></div>
      <aside className="optimizer card"><div className="section-head"><div><h2>המלצת העמסה · {containerType}</h2><p>אותם פריטים ואותן כמויות — השוואה בין משטחים ל־Loose</p></div></div>
      <div className="cbm-analysis"><h3>נפח מכולה פנימי</h3><div className="cbm-container"><strong>{containerCbm.toFixed(1)} CBM</strong><small>CBM למכולה נבחרת · {containerType}</small></div><div className={`cbm-metric ${netCargoPct>100?"critical":netCargoPct>=95?"good":"low"}`}><span>CBM נטו · כמות נבחרת</span><strong>{netCargoCbm.toFixed(1)} CBM</strong><small>{netCargoPct.toFixed(1)}% מנפח המכולה · קרטונים בלבד</small></div><div className={`cbm-metric ${palletizedCbmPct>100?"critical":palletizedCbmPct>=95?"good":"low"}`}><span>CBM כולל ממושטַח</span><strong>{palletizedPhysicalCbm.toFixed(1)} CBM</strong><small>{palletizedCbmPct.toFixed(1)}% מנפח המכולה · כולל מעטפת המשטחים</small></div><p>אדום = חריגה מעל 100% · ירוק = 95%–100% · כתום = פחות מ־95%.</p></div>
      <div className="load-methods"><article className={recommendedMode==="palletized"?"best":""}><header><span>העמסה ממושטחת</span>{recommendedMode==="palletized"&&<b>קיבולת גבוהה יותר</b>}</header><strong>{palletScenario.loaded.toLocaleString()}</strong><small>קרטונים מרביים · {palletScenario.packed.length.toLocaleString()} משטחים · {palletPresetLabel}</small><p>{result.requested>palletScenario.loaded?`${(result.requested-palletScenario.loaded).toLocaleString()} קרטונים לא ייכנסו`:`אפשר להוסיף ${(palletScenario.loaded-result.requested).toLocaleString()} קרטונים`}</p><button onClick={()=>setSimulationMode("palletized")}>הציגי העמסה ממושטחת בהדמיה</button></article>
      <article className={recommendedMode==="loose"?"best":""}><header><span>העמסת Loose</span>{recommendedMode==="loose"&&<b>קיבולת גבוהה יותר</b>}</header><strong>{looseScenario.loaded.toLocaleString()}</strong><small>קרטונים מרביים ללא משטחים</small><p>{result.requested>looseScenario.loaded?`${(result.requested-looseScenario.loaded).toLocaleString()} קרטונים לא ייכנסו`:`אפשר להוסיף ${(looseScenario.loaded-result.requested).toLocaleString()} קרטונים`}</p><button onClick={()=>setSimulationMode("loose")}>הציגי העמסת Loose בהדמיה</button></article></div>
      <section className="smart-recommendations"><div className="smart-head"><div><span>מנוע המלצות</span><h3>מה אפשר לשפר בתרחיש?</h3></div><b>{containerType}</b></div>
      {heightCandidate&&optimizedHeightCandidate&&stackHeightGain>0&&<article className="smart-card featured"><div className="smart-icon">↥</div><div><span>הזדמנות לקומה נוספת</span><strong>להפחית את גובה המשטח ל־{optimizedHeightCandidate.palletH.toFixed(0)} ס״מ</strong><p>מק״ט {heightCandidate.id}: מעבר מ־{heightCandidate.layers} ל־{optimizedHeightCandidate.layers} שכבות במשטח מאפשר שתי קומות ומוסיף עד {stackHeightGain.toLocaleString()} קרטונים לתרחיש.</p>{heightCandidate.estimated&&<small>המלצה משוערת — חלק ממידות הפריט הושלמו בנתוני דמה.</small>}<button onClick={()=>{setHeightOptimization(true);setSimulationMode("palletized")}}>חשבי והציגי את התרחיש</button></div></article>}
      <article className="smart-card"><div className="smart-icon">⇄</div><div><span>השוואת שיטת העמסה</span><strong>{recommendedDifference?`${recommendedMode==="loose"?"Loose":"ממושטַח"} מוסיפה ${recommendedDifference.toLocaleString()} קרטונים`:"אין פער בין השיטות"}</strong><p>{recommendedCapacity?`הקיבולת הגבוהה ביותר כרגע היא ${recommendedCapacity.toLocaleString()} קרטונים.`:"בחרי פריטים וכמויות כדי לקבל המלצה."}</p></div></article>
      <article className="smart-card"><div className="smart-icon">↻</div><div><span>בדיקת סיבוב</span><strong>{Math.max(looseRotationGain,palletRotationGain)>0?`סיבוב מוסיף עד ${Math.max(looseRotationGain,palletRotationGain).toLocaleString()} קרטונים`:"לא נמצא רווח מסיבוב של 90°"}</strong><p>נבדקו בנפרד סיבוב קרטונים בתרחיש Loose וסיבוב משטחים בתרחיש ממושטַח.</p></div></article>
      {mixedOpportunity&&<article className="smart-card mixed"><div className="smart-icon">◫</div><div><span>מבנה העמסה מעורב</span><strong>כדאי להשוות בין אזורי משטחים לאזורי Loose</strong><p>בתמהיל יש שיטות העמסה או מגבלות Stackable שונות. אפשר להשאיר פריטים רגישים על משטחים ולנצל אזורים פנויים עם פריטים חופשיים או משטחים נמוכים.</p><button onClick={()=>{setSimulationMode("database");setHeightOptimization(true)}}>חשבי תרחיש לפי נתוני הפריטים</button></div></article>}
      {estimatedItemsCount>0&&<article className="smart-card warning"><div className="smart-icon">!</div><div><span>איכות הנתונים</span><strong>{estimatedItemsCount} פריטים מבוססים חלקית על נתוני דמה</strong><p>המלצות גובה, קומה נוספת ו־CBM יהפכו מדויקות כאשר מידות הקרטון, המשטח והגובה הטעון יהיו מלאות בקובץ האמיתי.</p></div></article>}
      </section>
      <details className="calc-method" open><summary>איך מחושבת הקיבולת?</summary><ol><li>ב־Loose כל קרטון הוא יחידת העמסה. המערכת בודקת סיבוב על רצפת המכולה ומסדרת קרטונים בשורות ובשכבות.</li><li>בממושטַח יחידת ההעמסה היא משטח מלא. אם Stackable מסומן כן, נבדקות קומות נוספות לפי הגובה ומספר הקומות המרבי; אם לא, נשארים בקומה אחת.</li><li>מספר המשטחים מוכפל במספר הקרטונים למשטח. החישוב נעצר במגבלת המידות או המשקל — המגבלה הראשונה קובעת.</li></ol>{singleMixItem&&<div className="calc-example"><b>למה הפער גדול בפריט הזה?</b><p>משטח {singleMixItem.palletL}×{singleMixItem.palletW} ס״מ, בגובה {singleMixItem.palletH} ס״מ, מכיל {singleMixItem.cartonsPerPallet} קרטונים ומוגדר {singleMixItem.stackable?"Stackable":"לא ניתן לערימה"}. במכולה נכנסים {palletScenario.packed.length} משטחים — כלומר {palletScenario.loaded.toLocaleString()} קרטונים. ב־Loose המקסימום המחושב הוא {looseScenario.loaded.toLocaleString()} קרטונים{looseVsPalletRatio>1?` — פי ${looseVsPalletRatio.toFixed(2)} מהתרחיש הממושטַח.`:"."}</p></div>}</details>
      {simulationMode!=="database"&&<button className="reset-method" onClick={()=>setSimulationMode("database")}>הציגי שוב את שיטות ההעמסה שמוגדרות בקובץ</button>}</aside>
    </section>
    <section className="items card"><div className="section-head"><div><h2>פריטים בסימולציה</h2><p>{items.length} פריטים במאגר · הנתונים נשמרים בדפדפן שלך</p></div><button className="ghost" onClick={()=>setSelected(selected.length?[]:items.map(x=>x.id))}>{selected.length?"נקה בחירה":"בחר הכול"}</button></div><div className="table-wrap"><table><thead><tr><th></th><th>מק״ט ותיאור</th><th>ספק</th><th>שיטת העמסה</th><th>מידות קרטון</th><th>מידות משטח וגובה</th><th>קרטונים/משטח</th><th>Stackable</th><th>מקס׳ קומות</th><th>כמות לסימולציה</th><th>איכות נתון</th></tr></thead><tbody>{items.filter(i=>supplier==="הכול"||i.supplier===supplier).slice(0,80).map(item=><tr key={item.id}><td><input type="checkbox" checked={selected.includes(item.id)} onChange={()=>setSelected(v=>v.includes(item.id)?v.filter(x=>x!==item.id):[...v,item.id])}/></td><td><b>{item.id}</b><small>{item.description}</small></td><td>{item.supplier}</td><td><span className={item.loadType==="Palletized"?"pill blue":"pill amber"}>{item.loadType==="Palletized"?"ממושטַח":"קרטונים חופשיים"}</span></td><td>{item.l}×{item.w}×{item.h}</td><td>{item.palletL}×{item.palletW}×{item.palletH}</td><td>{item.cartonsPerPallet}</td><td><span className={item.stackable?"pill green":"pill amber"}>{item.stackable?"כן":"לא"}</span></td><td>{item.maxStackLayers||"לפי גובה"}</td><td><input className="qty" type="number" value={item.qty} onChange={e=>updateQty(item.id,Number(e.target.value))}/></td><td><span className={item.estimated?"pill amber":"pill green"}>{item.estimated?"משוער":"מלא"}</span></td></tr>)}</tbody></table></div></section></>}
  </main>;
}
