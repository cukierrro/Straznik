'use strict';
(() => {
    // Pixel checks the declarative projection verified by Python AST inspection.
    // This is NOT execution of the Python collector, database or network stack.
    const project=t=>({schema_version:1,
        source_fields:Object.fromEntries(archiveSchema.fields.map(k=>[k,t[k]??null])),
        field_presence:archiveSchema.fields.filter(k=>Object.hasOwn(t,k)),receipt:t._receipt??null});
    const receipt={received_at:'2026-09-08T15:30:49.000+00:00',transport:'ws',message_type:'upsert',source_message_ts:'raw-envelope-time'};
    const sample={id:'sample',updatedAt:'2026-09-08T13:07:56Z',confirmedAt:'2026-09-08T15:24:31Z',
        count:4,status:'active',lifecycle:'uncertain',_receipt:receipt};
    const original=JSON.stringify(sample),result=project(sample);
    const checks=[
        ['Surowe czasy pozostają rozdzielone',result.source_fields.updatedAt!==result.source_fields.confirmedAt],
        ['Odbiór lokalny ma osobne pole',result.receipt.received_at===receipt.received_at],
        ['Nie tworzono fikcyjnego observed_at',result.source_fields.observed_at===null&&!result.field_presence.includes('observed_at')],
        ['Grupa czterech obiektów zachowana',result.source_fields.count===4],
        ['Brak count pozostaje brakiem, nie jedynką',project({}).source_fields.count===null&&!project({}).field_presence.includes('count')],
        ['Jawny null odróżniony od braku pola',project({count:null}).field_presence.includes('count')],
        ['Wartość zero nie zastępowana domyślną',project({count:0}).source_fields.count===0],
        ['Nieprzetworzony tekst czasu zachowany',project({updatedAt:'invalid'}).source_fields.updatedAt==='invalid'],
        ['Status i lifecycle nie zmienione',result.source_fields.status==='active'&&result.source_fields.lifecycle==='uncertain'],
        ['Ramka i transport zachowane',result.receipt.message_type==='upsert'&&result.receipt.source_message_ts==='raw-envelope-time'],
        ['Stary rekord nie otrzymuje nowego czasu odbioru',project({}).receipt===null],
        ['Projekcja nie zmienia oryginalnego obiektu',JSON.stringify(sample)===original],
        ['Kolejne migawki nie odmładzają odbioru',JSON.stringify(project(sample))===JSON.stringify(result)],
        ['Metadane nie wprowadzają pól punktacji',!Object.hasOwn(result,'points')&&!Object.hasOwn(result,'level')],
        ['Zapis JSON zachowuje kontrakt',JSON.stringify(JSON.parse(JSON.stringify(result)))===JSON.stringify(result)],
        ['Rzeczywiste grupy zachowują count',realDay.live.filter(t=>t.count>1).every(t=>project(t).source_fields.count===t.count)],
        ['Rzeczywiste stare migawki nie uzupełniane fikcyjnymi czasami',realDay.snaps[0].threats.every(t=>project(t).source_fields.updatedAt===null)],
        ['Kod bez metadanych zgodny z HEAD (audyt statyczny)',archiveSchema.staticAudit.startsWith('PASS:')],
    ];
    for(const [name,ok] of checks)OfflineResults.report(JSON.stringify({suite:'archive-metadata-projection',name,ok}));
    const n=checks.filter(x=>x[1]).length;
    OfflineResults.report(`METADATA_RESULT ${n}/${checks.length} ${n===checks.length?'PASS':'FAIL'} NO_SEND; source=${archiveSchema.sha256}`);
    const bytes=s=>new TextEncoder().encode(JSON.stringify(s)).length;
    const added=realDay.live.map(t=>bytes({source_metadata:project({...t,_receipt:receipt})})-2);
    OfflineResults.report('METADATA_SIZE '+JSON.stringify({tracks:added.length,totalAddedBytes:added.reduce((a,b)=>a+b,0),
        minPerTrack:Math.min(...added),maxPerTrack:Math.max(...added),receipt:'synthetic; fields from captured live data'}));
    document.getElementById('metadata-checks').textContent=`Archiwizacja: ${n}/${checks.length} kontroli struktury danych. Statycznie: punktacja i wywołania alarmów bez zmian. Kolektor Python i zapis bazy nie były uruchamiane.`;
})();
