'use strict';
(() => {
    const checks=[];
    function test(name,fn){try{checks.push([name,fn()===true]);}catch(e){checks.push([name,false,String(e)]);}}
    const frame=(m,s,objects=[])=>({...tick(m,s,objects),healthy:true});
    const store=()=>({value:'',read(){return this.value;},write(v){this.value=v;return true;}});
    const track=(id,t=0,lat=50,extra={})=>({id,observedAt:t*minute,lat,lon:30,
        uncertainty:4,maxSpeedKmh:300,count:1,timeBasis:'source-observation',...extra});
    test('Pierwsza obserwacja nie dowodzi nowego obiektu',()=>!new TrackGuard().check(track('A'),0).eligible);
    test('Dwie rosnące obserwacje: ciągłość śladu, nie pewna identyfikacja',()=>{
        const g=new TrackGuard();g.check(track('A'),0);return g.check(track('A',1),minute).eligible;});
    test('Ponowny odbiór tego samego czasu nie daje drugiego potwierdzenia',()=>{
        const g=new TrackGuard();g.check(track('A'),0);return !g.check(track('A'),minute).eligible;});
    test('Nowe ID w starej pozycji nie jest nowym dronem',()=>{
        const g=new TrackGuard();g.check(track('A'),0);return g.check(track('B',1),minute).reason==='possible-reacquisition-or-overlap';});
    test('Podejrzenie duplikatu nie znika po kolejnym raporcie',()=>{
        const g=new TrackGuard();g.check(track('A'),0);g.check(track('B',1),minute);return !g.check(track('B',2),2*minute).eligible;});
    test('Zmiana klasy obiektu nie omija ochrony duplikatów',()=>{
        const g=new TrackGuard();g.check(track('A',0,50,{type:'uav'}),0);return !g.check(track('B',1,50,{type:'missile'}),minute).eligible;});
    test('Dwa bliskie ślady pozostają nierozstrzygnięte',()=>{
        const g=new TrackGuard();g.check(track('A'),0);g.check(track('B',0,50.01),0);return !g.check(track('B',1,50.01),minute).eligible;});
    test('Odległy spójny ślad może kwalifikować się niezależnie',()=>{
        const g=new TrackGuard();g.check(track('A'),0);g.check(track('B',0,55),0);return g.check(track('B',1,55.01),minute).eligible;});
    test('Teleportacja tego samego ID nie daje zbliżenia',()=>{
        const g=new TrackGuard();g.check(track('A'),0);return !g.check(track('A',1,55),minute).eligible;});
    test('Brak obserwacji nie jest uzupełniany czasem odbioru',()=>!new TrackGuard().check(track('A',0,50,{observedAt:undefined,receivedAt:0}),0).eligible);
    test('Nieudokumentowany updatedAt nie jest obserwacją',()=>!new TrackGuard().check(track('A',0,50,{timeBasis:'updatedAt'}),0).eligible);
    test('Przyszła obserwacja odrzucona',()=>!new TrackGuard().check(track('A',1),0).eligible);
    test('Raport odebrany po sześciu minutach odrzucony',()=>!new TrackGuard().check(track('A'),6*minute).eligible);
    test('Grupa count>1 nie udaje pojedynczej tożsamości',()=>!new TrackGuard().check(track('A',0,50,{count:3}),0).eligible);
    test('Zapis i odczyt rejestru zachowuje podejrzenie zmiany ID',()=>{
        const g=new TrackGuard();g.check(track('A'),0);const h=new TrackGuard();h.restore(JSON.parse(JSON.stringify(g.export())));
        return h.check(track('B',1),minute).reason==='possible-reacquisition-or-overlap';});
    test('Rejestr nie rośnie bez końca',()=>{
        const g=new TrackGuard();g.check(track('A'),0);g.check(track('B',61,55),61*minute);return g.records.size===1;});
    test('Uszkodzony rejestr odrzucony',()=>{try{new TrackGuard().restore({version:1,records:[['A',{}]]});return false;}catch(e){return true;}});
    test('Restart nie powtarza stopnia 2,5',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));x.advance(frame(1,2.5,[a()]));
        return new IncidentSession(s).advance(frame(1.1,2.5,[a()])).kind==='none';});
    test('Po restarcie następny świeży próg 3,0 nadal działa',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));x.advance(frame(1,2.5,[a()]));
        return new IncidentSession(s).advance(frame(2,3,[a(),b()])).band===3;});
    test('Potwierdzenie nie zeruje stopni',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));const d=x.advance(frame(1,2.5,[a()]));
        return x.acknowledge(d.eventId)&&new IncidentSession(s).advance(frame(1.1,2.5,[a()])).kind==='none';});
    test('Potwierdzenie innego komunikatu odrzucone',()=>!new IncidentSession(store()).acknowledge('foreign'));
    test('Nieudany zapis nie pozwala ogłosić dodatkowego żółtego',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));s.write=()=>false;
        return x.advance(frame(1,2.5,[a()])).reason==='state-not-saved';});
    test('Awaria zapisu nie blokuje istniejącego czerwonego',()=>{
        const s=store();s.write=()=>false;const d=new IncidentSession(s).advance(frame(0,4));return d.kind==='high'&&d.storageWarning;});
    test('Uszkodzony stan: bez odgrywania zaległego żółtego',()=>{
        const s=store();s.value='{broken';return new IncidentSession(s).advance(frame(5,3.1)).reason==='recovery-baseline-no-replay';});
    test('Nieznana wersja stanu nie jest interpretowana na ślepo',()=>{
        const s=store();s.value=JSON.stringify({version:999});return new IncidentSession(s).recovering;});
    test('Stan innego województwa nie miesza progów',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));return new IncidentSession(s,'podkarpackie').recovering;});
    test('Krótki spadek poniżej 2 nie resetuje incydentu',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));x.advance(frame(1,2.5,[a()]));x.advance(frame(2,1.9));
        return x.advance(frame(3,2.5,[a()])).kind==='none'&&x.serial===0;});
    test('Pełna godzina potwierdzonego spokoju rozpoczyna nowy incydent',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));for(let i=1;i<=61;i++)x.advance(frame(i,0));
        return x.serial===1&&x.advance(frame(62,2.1)).kind==='elevated';});
    test('Godzinna przerwa w danych nie jest godziną spokoju',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));x.advance(frame(1,0));x.advance(frame(62,0));return x.serial===0;});
    test('Niezdrowe źródła nie potwierdzają spokoju',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));for(let i=1;i<=65;i++)x.advance({...frame(i,0),healthy:false});return x.serial===0;});
    test('Zegar wstecz nie zmienia incydentu',()=>{
        const x=new IncidentSession(store());x.advance(frame(5,2.1));return x.advance(frame(4,3)).reason==='invalid-clock-or-score';});
    test('Długi restart nie odgrywa narosłych stopni',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));x.advance(frame(1,2.5,[a()]));
        return new IncidentSession(s).advance(frame(20,3.5,[obj('C',1.4,20)])).kind==='none';});
    test('Czerwony po restarcie pozostaje natychmiastowy',()=>{
        const s=store(),x=new IncidentSession(s);x.advance(frame(0,2.1));return new IncidentSession(s).advance(frame(20,4.3)).kind==='high';});
    test('Ścieżka guard → próg: zmiana ID nie powoduje dodatkowego żółtego',()=>{
        const g=new TrackGuard(),x=new IncidentSession(store());g.check(track('A'),0);x.advance(frame(0,2.1));
        const candidate=g.check(track('B',1),minute);
        return x.advance(frame(1,2.6,candidate.eligible?[obj('B',0.5)]:[])).kind==='none';});
    test('Ścieżka kontrakt → próg: sam czas dodania nie wystarcza',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));
        const candidate=escalationObservation({source:'neptun',voivodeship:'lubelskie',ts:new Date(minute).toISOString(),details:{}},null,minute);
        return x.advance(frame(1,2.6,candidate.eligible?[candidate.object]:[])).kind==='none';});
    test('Pogorszenie po pięciu minutach przy ciągłości danych nadal alarmuje',()=>{
        const x=new IncidentSession(store());x.advance(frame(0,2.1));
        for(let i=1;i<5;i++)x.advance(frame(i,2.1));
        return x.advance(frame(5,2.6,[obj('A',0.5,5)])).band===2.5;});
    for(const [name,ok,error] of checks)OfflineResults.report(JSON.stringify({suite:'refinement',name,ok,error}));
    const n=checks.filter(x=>x[1]).length;
    OfflineResults.report(`REFINEMENT_RESULT ${n}/${checks.length} ${n===checks.length?'PASS':'FAIL'} NO_SEND`);
    document.getElementById('refinement-checks').textContent=`Ponowne wykrycia i pamięć: ${n}/${checks.length} kontroli. Reguły laboratoryjne, bez wdrożenia.`;

    // Real process-death test, persistence in THIS isolated Android package only.
    const phase=OfflineResults.readTestState('phase');
    let ledger=new TrackGuard(),saved=null;
    if(phase.startsWith('v2-'))saved=JSON.parse(OfflineResults.readTestState('restart'));
    if(saved)ledger.restore(saved.ledger);
    const nativeStore={read:()=>saved?.session||'',write:v=>{
        saved={session:v,ledger:ledger.export()};
        return OfflineResults.writeTestState('restart',JSON.stringify(saved));
    }};
    if(!phase.startsWith('v2-')){
        ledger.check(track('A'),0);
        const x=new IncidentSession(nativeStore);x.advance(frame(0,2.1));const d=x.advance(frame(1,2.5,[a()]));
        const ok=d.band===2.5&&x.acknowledge(d.eventId)&&OfflineResults.writeTestState('phase','v2-armed');
        OfflineResults.report(`PROCESS_RESTART ARMED ${ok?'PASS':'FAIL'} NO_SEND`);
    }else{
        const aliasSuppressed=!ledger.check(track('B',1),minute).eligible;
        const x=new IncidentSession(nativeStore);
        const noRepeat=x.advance(frame(1.1,2.5,[a()]));
        const next=x.advance(frame(2,3,[a(),b()]));
        const ok=aliasSuppressed&&(phase==='v2-armed'?noRepeat.kind==='none'&&next.band===3:
            noRepeat.kind==='none'&&next.kind==='none');
        if(ok)OfflineResults.writeTestState('phase','v2-verified');
        OfflineResults.report(`PROCESS_RESTART VERIFIED ${ok?'PASS':'FAIL'} NO_SEND`);
        document.getElementById('restart-checks').textContent=ok?'Restart procesu: OK — zachowano progi, potwierdzenie i pamięć śladów. Podejrzane nowe ID nie wywołało dodatkowego żółtego.':'Restart procesu: BŁĄD';
    }
})();
