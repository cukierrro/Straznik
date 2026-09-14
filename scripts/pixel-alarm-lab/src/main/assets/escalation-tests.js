'use strict';
const minute=60000;
function obj(id,points,t=1,extra={}) { return {
    physicalId:id,identityConfirmed:true,source:'neptun',region:'lubelskie',
    points,observedAt:t*minute,distance:150,uncertainty:4,...extra
}; }
function tick(t,score,objects=[]) { return {now:t*minute,score,objects}; }
const a=()=>obj('A',0.4);
const b=()=>obj('B',0.5,2);
const c=()=>obj('C',0.5,3);
const cases=[];
function trial(name,frames,expected) { cases.push({name,frames,expected}); }
trial('Wszystkie zatwierdzone stopnie',[tick(0,2.1),tick(1,2.5,[a()]),tick(2,3,[a(),b()]),tick(3,3.5,[a(),b(),c()])],['elevated','escalation:2.5','escalation:3','escalation:3.5']);
trial('Istotne pogorszenie po 5 min — bez blokady 10 min',[tick(0,2.1),tick(5,2.6,[obj('A',0.5,5)])],['elevated','escalation:2.5']);
trial('Skok kilku progów = jedna informacja',[tick(0,2.1),tick(1,3.6,[obj('A',1.5)])],['elevated','escalation:3.5']);
trial('RSS bez nowego obiektu',[tick(0,2.1),tick(1,3.6)],['elevated','none']);
trial('RSS + mały nowy sygnał nie odblokowuje progu',[tick(0,2.1),tick(1,3.6,[obj('A',0.1)])],['elevated','none']);
trial('RSS nie zawyża zapamiętanego punktu odniesienia',[tick(0,2.1),tick(1,3.8,[a()]),tick(2,3.9,[a(),obj('B',0.1,2)])],['elevated','escalation:2.5','none']);
trial('Propagacja województw wykluczona',[tick(0,2.1),tick(1,3,[obj('A',0.9,1,{propagated:true})])],['elevated','none']);
trial('Obiekt innego województwa wykluczony',[tick(0,2.1),tick(1,3,[obj('A',0.9,1,{region:'podkarpackie'})])],['elevated','none']);
trial('RSS nie może udawać obiektu',[tick(0,2.1),tick(1,3,[obj('A',0.9,1,{source:'rss'})])],['elevated','none']);
trial('Stara obserwacja odebrana teraz',[tick(0,2.1),tick(8,3,[obj('A',0.9,1)])],['elevated','none']);
trial('Obserwacja starsza od pierwszego żółtego',[tick(0,2.1),tick(1,3,[obj('A',0.9,-1)])],['elevated','none']);
trial('Przyszły czas obserwacji odrzucony',[tick(0,2.1),tick(1,3,[obj('A',0.9,2)])],['elevated','none']);
trial('Świeżość dokładnie 5 minut',[tick(0,2.1),tick(6,2.5,[a()])],['elevated','escalation:2.5']);
trial('Świeżość ponad 5 minut',[tick(0,2.1),tick(6.001,2.5,[a()])],['elevated','none']);
trial('Ponowne dane nie powtarzają stopnia',[tick(0,2.1),tick(1,2.5,[a()]),tick(2,2.5,[a()]),tick(3,2.5,[a()])],['elevated','escalation:2.5','none','none']);
trial('Oscylacja wokół progu nie powtarza alarmu',[tick(0,2.1),tick(1,2.5,[a()]),tick(2,2.4,[a()]),tick(3,2.6,[obj('A',0.5,3)])],['elevated','escalation:2.5','none','none']);
trial('Zmiana raw ID przy tej samej tożsamości',[tick(0,2.1,[obj('A',0.2,0,{rawId:'old'})]),tick(1,3,[obj('A',0.9,1,{rawId:'new'})])],['elevated','none']);
trial('Niepewna tożsamość nowego obiektu',[tick(0,2.1),tick(1,3,[obj('new-id',0.9,1,{identityConfirmed:false})])],['elevated','none']);
trial('Duplikaty obiektu odrzucone',[tick(0,2.1),tick(1,3,[a(),a()])],['elevated','none']);
trial('Zbliżenie większe niż niepewność',[tick(0,2.1,[obj('A',0.2,0,{distance:150})]),tick(1,2.6,[obj('A',0.7,1,{distance:110})])],['elevated','escalation:2.5']);
trial('Zmiana w granicy niepewności nie alarmuje',[tick(0,2.1,[obj('A',0.2,0,{distance:150,uncertainty:20})]),tick(1,2.6,[obj('A',0.7,1,{distance:120,uncertainty:20})])],['elevated','none']);
trial('Zbliżenie równe sumie niepewności odrzucone',[tick(0,2.1,[obj('A',0.2,0,{uncertainty:10})]),tick(1,2.6,[obj('A',0.7,1,{distance:130,uncertainty:10})])],['elevated','none']);
trial('Oddalający się obiekt mimo wzrostu punktów',[tick(0,2.1,[obj('A',0.2,0)]),tick(1,2.6,[obj('A',0.7,1,{distance:180})])],['elevated','none']);
trial('Więcej potwierdzeń bez zbliżenia',[tick(0,2.1,[obj('A',0.2,0)]),tick(1,2.6,[obj('A',0.7,1,{sourceCount:20})])],['elevated','none']);
trial('Zniknięcie starego obiektu kompensuje nowy',[tick(0,2.1,[obj('A',0.5,0)]),tick(1,2.6,[obj('B',0.5)])],['elevated','none']);
trial('Wynik rzeczywisty poniżej progu ogranicza eskalację',[tick(0,2.1),tick(1,2.4,[obj('A',1)])],['elevated','none']);
trial('Czerwony bez czekania po dodatkowym żółtym',[tick(0,2.1),tick(1,2.5,[a()]),tick(1.1,4,[a()])],['elevated','escalation:2.5','high']);
trial('Start już na 3,1 nie emituje zaległych stopni',[tick(0,3.1),tick(1,3.3,[obj('A',0.2)])],['elevated','none']);
trial('Spadek poniżej 2 nie zeruje pamięci stopnia',[tick(0,2.1),tick(1,2.5,[a()]),tick(2,1.9),tick(3,2.5,[a()])],['elevated','escalation:2.5','none','none']);
trial('Czas wstecz odrzucony',[tick(3,2.1),tick(2,3,[obj('A',0.9,2)])],['elevated','none']);
trial('Nieprawidłowa niepewność odrzucona',[tick(0,2.1),tick(1,3,[obj('A',0.9,1,{uncertainty:NaN})])],['elevated','none']);
trial('Kolejne świeże zbliżenia tego samego obiektu',[tick(0,2.1,[obj('A',0.1,0,{distance:190})]),tick(1,2.6,[obj('A',0.6,1,{distance:150})]),tick(2,3.1,[obj('A',1.1,2,{distance:110})])],['elevated','escalation:2.5','escalation:3']);
// Odtworzenie 10.09.2026 po wszystkich wdrożonych poprawkach fuzji. RCB
// podniósł wynik ponad kilka pasm naraz, ale był to pierwszy żółty w incydencie;
// wtórny artykuł nie wniósł punktów i nie może generować kolejnego komunikatu.
trial('10 IX rano: 1,21 → 3,166 i wtórne media bez eskalacji',[
    tick(0,1.21),tick(13.35,3.166,[obj('trk_00178073',0.55,13.35)]),
    tick(16.58,3.146,[obj('trk_00178073',0.55,13.35)])
],['none','elevated','none']);
// Drugi dzisiejszy skok miał produkcyjnie 3,4, bo dwie aktualizacje jednego
// track_id policzyły się osobno. Aktualny silnik zostawia 2,95 (w UI 3,0).
trial('10 IX po południu: skorygowany pierwszy skok 0,95 → 2,95',[
    tick(0,0.95),tick(15,2.95,[obj('trk_00178954',0.57,15,{distance:91.8})]),
    tick(19.5,2.92,[obj('trk_00178954',0.57,15,{distance:91.8})])
],['none','elevated','none']);

let escalationPassed=0;
for(const test of cases) {
    const model=new EscalationPrototype();
    const actual=test.frames.map(f=>{const d=model.advance(f);return d.kind+(d.band?':'+d.band:'');});
    const ok=JSON.stringify(actual)===JSON.stringify(test.expected);
    if(ok) escalationPassed++;
    const li=document.createElement('li');li.textContent=`${ok?'OK':'BŁĄD'} · ${test.name}`;
    document.getElementById('checks').appendChild(li);
    OfflineResults.report(JSON.stringify({suite:'escalation-v1',name:test.name,ok,actual,expected:test.expected}));
}
OfflineResults.report(`ESCALATION_RESULT ${escalationPassed}/${cases.length} ${escalationPassed===cases.length?'PASS':'FAIL'} NO_SEND`);
document.getElementById('result').textContent=`Nowa reguła testowa: ${escalationPassed}/${cases.length} OK. Obecna logika: ${passed}/${total} OK. Bez wdrożenia.`;

const scenarios=[
    {name:'Narastanie w ciągu 5 minut',frames:[tick(0,2.1),tick(1,2.5,[a()]),tick(3,3,[a(),obj('B',0.5,3)]),tick(5,3.5,[a(),obj('B',0.5,3),obj('C',0.5,5)])]},
    {name:'RSS + mały nowy sygnał',frames:[tick(0,2.1),tick(1,3.6,[obj('A',0.1)])]},
    {name:'Istotne zbliżenie jednego obiektu',frames:[tick(0,2.1,[obj('A',0.2,0)]),tick(5,2.6,[obj('A',0.7,5,{distance:110})])]},
    {name:'Stary raport odebrany z opóźnieniem',frames:[tick(0,2.1),tick(8,3,[obj('A',0.9,1)])]},
    {name:'Czerwony nie czeka',frames:[tick(0,2.1),tick(1,2.5,[a()]),tick(1.1,4.3,[a()])]},
];
const selector=document.getElementById('scenario');
scenarios.forEach((s,i)=>{const option=document.createElement('option');option.value=i;option.textContent=s.name;selector.appendChild(option);});
let demo, demoIndex;
function drawDemo() {
    const f=scenarios[+selector.value].frames[demoIndex],d=demo.advance(f);
    document.getElementById('score').textContent=f.score.toFixed(1).replace('.',',')+' pkt';
    document.getElementById('score').style.color=f.score>=4?'#ff526c':'#ffbb24';
    document.getElementById('level').textContent=d.kind==='escalation'?'SYTUACJA NARASTA · '+d.band.toFixed(1)+' pkt':f.score>=4?'WYSOKI PRIORYTET (TEST)':'PODWYŻSZONA UWAGA';
    document.getElementById('reason').textContent=`Czas scenariusza: +${(f.now/minute).toFixed(1)} min. ${d.reason}`;
    document.getElementById('action').textContent=d.kind==='none'?'Bez ponownego ostrzeżenia.':'Tylko zapis lokalny — nie wysłano powiadomienia.';
    const li=document.createElement('li');li.textContent=`+${(f.now/minute).toFixed(1)} min · ${f.score.toFixed(1)} pkt → ${d.kind==='escalation'?'Sytuacja narasta':d.kind==='none'?'bez ponownego ostrzeżenia':d.kind==='high'?'czerwony (symulacja)':'pierwszy żółty (symulacja)'}`;
    document.getElementById('events').appendChild(li);
    document.getElementById('next').disabled=demoIndex===scenarios[+selector.value].frames.length-1;
    OfflineResults.report(`DEMO ${selector.value} STEP ${demoIndex} ${JSON.stringify(d)} NO_SEND`);
}
function resetDemo(){demo=new EscalationPrototype();demoIndex=0;document.getElementById('events').replaceChildren();drawDemo();}
selector.onchange=resetDemo;
document.getElementById('next').onclick=()=>{if(demoIndex<scenarios[+selector.value].frames.length-1){demoIndex++;drawDemo();}};
document.getElementById('reset').onclick=resetDemo;
resetDemo();
