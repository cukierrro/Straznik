'use strict';
const articleURL='https://radio.lublin.pl/2026/09/rosja-zaatakowala-kijow-pociskami-balistycznymi-alert-rcb-dla-lubelszczyzny/';
function archiveScore(iso, omitArticle=false) {
    const now=Date.parse(iso),cut=now-ArchiveScoring.WINDOW_MIN*60000;
    const signals=morningArchive.signals.map(s=>({...s,t:Date.parse(s.ts)}))
        .filter(s=>s.t<=now&&s.t>cut)
        .map(s=>omitArticle && s.details?.link===articleURL ? {...s,points:0}:s);
    return {now,signals,result:ArchiveScoring.accumulate(signals,now).lubelskie};
}
function snapshotBefore(now) {
    return morningArchive.snaps.filter(s=>Date.parse(s.ts)<=now)
        .sort((a,b)=>Date.parse(b.ts)-Date.parse(a.ts))[0];
}
const before=archiveScore('2026-09-08T06:34:02+02:00');
const after=archiveScore('2026-09-08T06:34:03+02:00');
const comparison=archiveScore('2026-09-08T06:34:03+02:00',true);
const screen=archiveScore('2026-09-08T06:36:20+02:00');
const oldTracks=after.result.signals.filter(s=>s.source==='neptun');
const oldIds=new Set(oldTracks.map(s=>s.details.track_id));
const checks=[
    ['Przed artykułem 2,805644 pkt',Math.abs(before.result.score-2.8056444444444444)<1e-8],
    ['Po artykule 4,3056 pkt',Math.abs(after.result.score-4.3056)<1e-8],
    ['Wariant bez artykułu 2,8056 pkt',Math.abs(comparison.result.score-2.8056)<1e-8],
    ['Ekran 06:36:20 — wynik zaokrąglony 4,3',Math.round(screen.result.score*10)/10===4.3],
    ['Dokładnie pięć wcześniejszych ID śladów',oldTracks.length===5&&oldIds.size===5],
    ['Te pięć ID nie występuje w poprzedzającej migawce',snapshotBefore(after.now).threats.every(t=>!oldIds.has(t.id))],
    ['Nie pobrano przyszłego sygnału 06:42:38',after.signals.every(s=>s.details?.track_id!=='trk_00172883')],
    ['Wkład artykułu dokładnie 1,5',Math.abs(after.result.score-comparison.result.score-1.5)<1e-8],
    ['Wariant porównawczy nie mutuje danych',archiveScore('2026-09-08T06:34:03+02:00').result.score===after.result.score],
    ['Nie podmieniono czasu odbioru na obserwację',oldTracks.every(s=>!Object.hasOwn(s.details,'observed_at')&&!Object.hasOwn(s.details,'updatedAt'))],
    ['Brak wkładu innych regionów w tym oknie',after.signals.every(s=>s.voivodeship==='lubelskie')],
];
let archivePassed=0;
for(const [name,ok] of checks) {
    if(ok)archivePassed++;
    OfflineResults.report(JSON.stringify({suite:'real-archive',name,ok}));
}
OfflineResults.report(`ARCHIVE_RESULT ${archivePassed}/${checks.length} ${archivePassed===checks.length?'PASS':'FAIL'} NO_SEND; fixture=${morningArchive.sourceHash}`);
document.getElementById('archive-checks').textContent=`${archivePassed}/${checks.length} sprawdzeń archiwum OK. Bez wysyłki.`;
function drawArchive() {
    const value=document.getElementById('archive-time').value;
    const original=archiveScore(value), alt=archiveScore(value,true);
    const points=n=>n.toFixed(1).replace('.',',');
    document.getElementById('archive-current').textContent=`${points(original.result.score)} pkt — ${original.result.score>=4?'czerwony':'żółty'}`;
    document.getElementById('archive-current').style.color=original.result.score>=4?'#ff526c':'#ffbb24';
    document.getElementById('archive-alternative').textContent=`${points(alt.result.score)} pkt — ${alt.result.score>=4?'czerwony':'żółty'}`;
    document.getElementById('archive-alternative').style.color='#ffbb24';
    const snap=snapshotBefore(original.now),present=snap.threats.filter(t=>oldIds.has(t.id)).length;
    document.getElementById('archive-presence').textContent=`W poprzedzającej migawce obecnych ${present}/5 punktowanych wcześniej śladów. Migawka: ${new Date(snap.ts).toLocaleTimeString('pl-PL',{timeZone:'Europe/Warsaw'})}.`;
}
document.getElementById('archive-time').onchange=drawArchive;
document.getElementById('archive-toggle').onclick=()=>{
    const view=document.getElementById('archive-view');view.hidden=!view.hidden;
    document.getElementById('synthetic-view').hidden=!view.hidden;
    document.getElementById('archive-toggle').textContent=view.hidden?'Pokaż poranek z archiwum':'Wróć do scenariuszy progów';
    drawArchive();
};
drawArchive();
