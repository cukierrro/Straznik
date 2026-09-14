'use strict';
(() => {
    const now=Date.parse('2026-09-08T06:34:03+02:00');
    const make=()=>({source:'neptun',voivodeship:'lubelskie',counted_points:0.5,
        ts:new Date(now).toISOString(),details:{track_id:'track-a',
            observed_at:new Date(now-60000).toISOString(),distance_to_region_km:100,uncertainty_km:4}});
    const evidence={trackId:'track-a',physicalId:'resolved-a',confirmed:true,active:true,observedAt:now-60000,region:'lubelskie'};
    const accept=(s,e={...evidence,observedAt:Date.parse(s.details.observed_at)})=>escalationObservation(s,e,now).eligible;
    const changed=(field,value)=>{const s=make();s.details[field]=value;return s;};
    const checks=[
        ['Kompletne dane źródłowe kwalifikują obserwację',accept(make())],
        ['Czas odbioru nie zastępuje obserwacji',!accept(changed('observed_at',undefined))],
        ['Czas bez strefy odrzucony',!accept(changed('observed_at','2026-09-08T06:34:00'))],
        ['Obserwacja starsza niż 5 minut odrzucona',!accept(changed('observed_at',new Date(now-300001).toISOString()))],
        ['Obserwacja z przyszłości odrzucona',!accept(changed('observed_at',new Date(now+1).toISOString()))],
        ['Niepotwierdzona tożsamość odrzucona',!accept(make(),{...evidence,confirmed:false})],
        ['Dowód innego śladu odrzucony',!accept(make(),{...evidence,trackId:'different'})],
        ['Nieobecny ślad nie jest nowym pogorszeniem',!accept(make(),{...evidence,active:false})],
        ['Odległość do granicy nie zastępuje odległości do regionu',!accept({...make(),details:{...make().details,distance_to_region_km:undefined,dist_km:100}})],
        ['Surowe punkty nie zastępują naliczonych',!accept({...make(),counted_points:undefined,points:0.5})],
        ['Propagacja odrzucona',!accept({...make(),propagated:true})],
        ['RSS odrzucony',!accept({...make(),source:'media'})],
        ['Inny region odrzucony',!accept({...make(),voivodeship:'podkarpackie'})],
        ['Granica 5 minut dopuszczona w eksperymencie',accept(changed('observed_at',new Date(now-300000).toISOString()))],
        ['Archiwalne ślady nie stają się świeże przez czas dodania',oldTracks.every(s=>!accept(s,null))],
        ['Zmiana ID z rozpoznaną tożsamością zachowuje physicalId',escalationObservation(changed('track_id','track-b'),{...evidence,trackId:'track-b'},now).object?.physicalId==='resolved-a'],
        ['Stary dowód obecności nie potwierdza nowej obserwacji',!accept(make(),{...evidence,observedAt:now-120000})],
        ['Dowód innego regionu odrzucony',!accept(make(),{...evidence,region:'podkarpackie'})],
    ];
    for(const [name,ok] of checks) OfflineResults.report(JSON.stringify({suite:'observation-contract',name,ok}));
    const passed=checks.filter(([,ok])=>ok).length;
    OfflineResults.report(`CONTRACT_RESULT ${passed}/${checks.length} ${passed===checks.length?'PASS':'FAIL'} NO_SEND`);
    document.getElementById('contract-checks').textContent=`Dane wejściowe: ${passed}/${checks.length} sprawdzeń. Brak czasu obserwacji lub rozpoznanej tożsamości = bez dodatkowego żółtego, bez usuwania historii.`;
})();
