/* Local-only saved places. Exact locations never leave this module. */
(function (root) {
  'use strict';
  const KEY = 'straznik_places_v1';
  const REGIONS = ['dolnośląskie','kujawsko-pomorskie','lubelskie','lubuskie','łódzkie','małopolskie','mazowieckie','opolskie','podkarpackie','podlaskie','pomorskie','śląskie','świętokrzyskie','warmińsko-mazurskie','wielkopolskie','zachodniopomorskie'];
  const PRECISIONS = new Set(['region','gps']);
  const trim = (value, max) => String(value || '').trim().slice(0, max);
  const validCoord = (lat,lon) => lat !== null && lat !== undefined && lon !== null && lon !== undefined
    && Number.isFinite(+lat) && Number.isFinite(+lon) && +lat >= -90 && +lat <= 90 && +lon >= -180 && +lon <= 180;
  function clean(place) {
    const precision = PRECISIONS.has(place?.precision) ? place.precision : 'region';
    const region = REGIONS.includes(place?.region) ? place.region : '';
    const gps = place?.gps && validCoord(place.gps.lat,place.gps.lon)
      ? {lat:+place.gps.lat, lon:+place.gps.lon, accuracy:Math.max(0,+place.gps.accuracy||0), capturedAt:trim(place.gps.capturedAt,40)} : null;
    return {id:trim(place?.id,64) || String(Date.now()), name:trim(place?.name,40), precision, region,
      gps:precision==='gps'?gps:null, alerts:Boolean(place?.alerts)};
  }
  function load(storage) {
    try {
      const parsed=JSON.parse(storage.getItem(KEY)||'[]');
      if(Array.isArray(parsed)) return parsed.slice(0,8).map(clean).filter(p=>p.name&&p.region);
    } catch {}
    return [];
  }
  function migrate(storage) {
    const current=load(storage); if(current.length) return current;
    const legacy=storage.getItem('straznik_voiv');
    if(!REGIONS.includes(legacy)) return [];
    const places=[clean({id:'legacy-home',name:'Dom',precision:'region',region:legacy,alerts:true})];
    save(storage,places); return places;
  }
  function save(storage, places) {
    const safe=places.slice(0,8).map(clean).filter(p=>p.name&&p.region);
    storage.setItem(KEY,JSON.stringify(safe));
    const primary=safe[0]?.region;
    if(primary) storage.setItem('straznik_voiv',primary); else storage.removeItem('straznik_voiv');
    return safe;
  }
  const observedVoivodeships = places => [...new Set(places.filter(p=>p.alerts&&p.region).map(p=>p.region))];
  const primaryVoivodeship = places => places[0]?.region || null;
  const rad = value => value * Math.PI / 180;
  function distanceKm(aLat,aLon,bLat,bLon){
    const p1=rad(aLat),p2=rad(bLat),dp=rad(bLat-aLat),dl=rad(bLon-aLon);
    const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  }
  function bearingDeg(aLat,aLon,bLat,bLon){
    const p1=rad(aLat),p2=rad(bLat),dl=rad(bLon-aLon);
    return (Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*180/Math.PI+360)%360;
  }
  const courseDelta=(a,b)=>Math.abs((((a-b)+540)%360)-180);
  function exactPoint(place,threat,speedKmh,bufferMin=2.5){
    if(!place?.gps||!validCoord(threat?.lat,threat?.lon))return null;
    const distance=distanceKm(+threat.lat,+threat.lon,place.gps.lat,place.gps.lon);
    const heading=threat.velocity?.bearingDeg??threat.heading;
    if(!Number.isFinite(+heading))return {distanceKm:distance,etaMin:null,reason:'heading'};
    const delta=courseDelta(+heading,bearingDeg(+threat.lat,+threat.lon,place.gps.lat,place.gps.lon));
    if(delta>50)return {distanceKm:distance,etaMin:null,reason:'course',courseDelta:delta};
    if(!Number.isFinite(+speedKmh)||+speedKmh<=0)return {distanceKm:distance,etaMin:null,reason:'speed',courseDelta:delta};
    return {distanceKm:distance,etaMin:Math.max(0,Math.floor(distance/(+speedKmh)*60-bufferMin)),reason:null,courseDelta:delta};
  }
  const api={KEY,REGIONS,clean,load,migrate,save,observedVoivodeships,primaryVoivodeship,distanceKm,bearingDeg,courseDelta,exactPoint};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.StraznikPlaces=api;
})(globalThis);
