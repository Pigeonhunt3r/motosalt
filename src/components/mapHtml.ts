import { leafletCss, leafletJs } from "../generated/map-assets";
import type {
  Point,
  RouteWinter,
  TripRoute,
  Poi,
  GroupMember,
  RiderReport,
} from "../core/models";
export interface MapPayload {
  route: TripRoute | null;
  center: Point;
  position?: Point | null;
  pois?: Poi[];
  members?: GroupMember[];
  reports?: RiderReport[];
  showSalt: boolean;
  winter?: RouteWinter | null;
}
export function mapHtml(initial: MapPayload): string {
  const safe = (value: unknown) =>
    JSON.stringify(value).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https://tile.openstreetmap.org data:; connect-src https://tile.openstreetmap.org;"><style>${leafletCss}html,body,#map{height:100%;width:100%;margin:0;background:#e5eadc;font-family:system-ui}.leaflet-control-attribution{font-size:9px!important}.pin{background:#243d32;color:#e4efb0;border:3px solid white;border-radius:50%;width:18px;height:18px;box-shadow:0 2px 5px #0003}.map-message{position:absolute;bottom:25px;left:12px;right:12px;z-index:999;background:#fffef9ed;border-radius:8px;padding:9px;color:#495b40;font-size:11px;pointer-events:none;display:none}</style></head><body><div id="map" role="application" aria-label="Interaktivt rutekort"></div><div id="error" class="map-message">Kortfelterne kunne ikke hentes. Ruten er stadig gemt; kontrollér din forbindelse.</div><script>${leafletJs.replaceAll("</script", "<\\/script")}</script><script>
const send=(value)=>{const message=JSON.stringify({source:'motosalt-map',...value});if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(message);else parent.postMessage(message,'*');};
const map=L.map('map',{zoomControl:true}).setView([${initial.center.lat},${initial.center.lon}],11);
const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',crossOrigin:true});tile.on('tileerror',()=>document.getElementById('error').style.display='block');tile.on('load',()=>document.getElementById('error').style.display='none');tile.addTo(map);
const shapes=L.layerGroup().addTo(map);let routeId=null;
const textNode=(text)=>{const el=document.createElement('span');el.textContent=text;return el;};
window.__MOTOSALT_UPDATE__=(data)=>{shapes.clearLayers();const r=data.route;
 if(r){const line=L.polyline(r.points.map(p=>[p.lat,p.lon]),{color:data.showSalt?'#848b7d':'#274f3a',weight:5,opacity:.95,dashArray:data.showSalt?'8,7':undefined}).addTo(shapes);if(routeId!==r.id){map.fitBounds(line.getBounds(),{padding:[30,30]});routeId=r.id;}L.circleMarker([r.start.lat,r.start.lon],{radius:7,color:'#fff',weight:3,fillColor:'#243d32',fillOpacity:1}).bindPopup(textNode('Start og slut: '+r.start.label)).addTo(shapes);}
 else if(routeId!==null){routeId=null;map.setView([data.center.lat,data.center.lon],11);}
 const winter=data.winter, winterAge=Date.now()-Date.parse(winter?.dataUpdatedAt||'');
 if(data.showSalt&&winter?.status==='available'&&winterAge>=0&&winterAge<=1800000)for(const section of winter.sections){const recent=section.lastSaltingAt&&Date.now()-Date.parse(section.lastSaltingAt)<172800000;const color=section.condition==='winter'?'#b34e38':section.saltingNow||recent?'#ba8227':'#797e78';L.polyline(section.points.map(p=>[p.lat,p.lon]),{color,weight:7,opacity:.7}).bindPopup(textNode((section.saltingNow?'Vinterarbejde registreret i gang':section.lastSaltingAt?'Senest registreret saltning/snerydning: '+new Date(section.lastSaltingAt).toLocaleString():'Saltningstidspunkt ukendt')+' · Vejdirektoratets offentlige feed. Geografisk match; ikke en restsaltmåling.')).addTo(shapes);}
 for(const p of data.pois||[])L.circleMarker([p.lat,p.lon],{radius:6,color:p.kind==='fuel'?'#bb7b31':'#92755c',fillOpacity:.9}).bindPopup(textNode(p.name+(p.kind==='fuel'?' · tankstation':' · café'))).addTo(shapes);
 for(const report of data.reports||[])L.circleMarker([report.lat,report.lon],{radius:7,color:'#b0753f',fillOpacity:.6}).bindPopup(textNode('Kørerobservation: '+report.note+' · '+new Date(report.createdAt).toLocaleString())).addTo(shapes);
 for(const member of data.members||[]){if(!member.location)continue;const age=Date.now()-Date.parse(member.location.updatedAt);L.circleMarker([member.location.lat,member.location.lon],{radius:7,color:age>120000?'#999':'#557ca0',fillOpacity:.8}).bindPopup(textNode(member.name+' · '+(age>120000?'forældet position':'senest '+new Date(member.location.updatedAt).toLocaleTimeString()))).addTo(shapes);}
 if(data.position)L.circleMarker([data.position.lat,data.position.lon],{radius:8,color:'#fff',weight:3,fillColor:'#4584ba',fillOpacity:1}).bindPopup(textNode('Din position')).addTo(shapes);
};
window.addEventListener('message',(event)=>{if(event.source!==parent)return;try{const d=typeof event.data==='string'?JSON.parse(event.data):event.data;if(d.type==='update')window.__MOTOSALT_UPDATE__(d.payload);}catch{}});
map.on('click',e=>send({type:'tap',point:{lat:e.latlng.lat,lon:e.latlng.lng}}));
window.__MOTOSALT_UPDATE__(${safe(initial)});send({type:'ready'});
</script></body></html>`;
}
