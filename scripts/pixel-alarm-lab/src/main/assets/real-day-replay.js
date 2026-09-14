'use strict';
(() => {
    const snaps=realDay.snaps,signals=realDay.signals;
    const stats={snapshots:snaps.length,from:snaps[0]?.ts,to:snaps.at(-1)?.ts,
        signals:signals.length,rows:0,missingObserved:0,missingUpdated:0,missingCount:0,
        unchangedPositions:0,changedPositions:0,changesBeyondUncertainty:0,
        comparablePositions:0,duplicateRows:0,snapshotGapsOver125s:0,sourceTimeEligible:0};
    const ids=new Set(),latest=new Map(),first=new Map(),exactPairs=[],usedPairs=new Set();
    const guard=new TrackGuard();
    let prevSnap=null;
    for(const snap of snaps){
        const now=Date.parse(snap.ts),localIds=new Set();
        if(prevSnap!==null&&now-prevSnap>125000)stats.snapshotGapsOver125s++;
        prevSnap=now;
        for(const t of snap.threats){
            stats.rows++;ids.add(t.id);
            if(localIds.has(t.id))stats.duplicateRows++;localIds.add(t.id);
            if(!t.observed_at)stats.missingObserved++;
            if(!t.updatedAt)stats.missingUpdated++;
            if(!Number.isFinite(t.count))stats.missingCount++;
            // Deliberately do NOT substitute snapshot time or default count=1.
            const input={id:t.id,lat:t.lat,lon:t.lon,uncertainty:t.uncertaintyKm,count:t.count,
                observedAt:typeof t.observed_at==='string'?Date.parse(t.observed_at):NaN,
                timeBasis:t.observed_at?'source-observation':'unknown',maxSpeedKmh:300};
            if(guard.check(input,now).eligible)stats.sourceTimeEligible++;
            const old=latest.get(t.id);
            if(old){
                stats.comparablePositions++;
                if(t.lat===old.lat&&t.lon===old.lon)stats.unchangedPositions++;
                else {stats.changedPositions++;
                    if(Number.isFinite(t.uncertaintyKm)&&Number.isFinite(old.uncertaintyKm)&&
                       guard.distance(t,old)>t.uncertaintyKm+old.uncertaintyKm)
                        stats.changesBeyondUncertainty++;
                }
            }else{
                first.set(t.id,snap.ts);
                for(const p of latest.values()){
                    if(p.type===t.type&&p.lat===t.lat&&p.lon===t.lon&&now-p.seenAt<=3600000){
                        const key=p.id+':'+t.id;if(usedPairs.has(key))continue;usedPairs.add(key);
                        exactPairs.push({previous:p.id,next:t.id,previousSnapshot:p.ts,newSnapshot:snap.ts,
                            lat:t.lat,lon:t.lon,headingSame:p.heading===t.heading,
                            previousStillPresent:snap.threats.some(x=>x.id===p.id)});
                    }
                }
            }
            latest.set(t.id,{...t,seenAt:now,ts:snap.ts});
        }
    }
    stats.uniqueTrackIds=ids.size;
    // Score reconstruction at observed signal arrival instants, not inferred FCM delivery.
    const start=Date.parse(stats.from),end=Date.parse(stats.to);
    const times=[...new Set([...snaps.map(s=>Date.parse(s.ts)),...signals.map(s=>Date.parse(s.ts))])]
        .filter(t=>t>=start&&t<=end).sort((a,b)=>a-b);
    const transitions=[],model=new EscalationPrototype();let oldLevel=null,oldBand=null,extra=0;
    for(const now of times){
        const window=signals.filter(s=>Date.parse(s.ts)<=now&&Date.parse(s.ts)>now-3600000)
            .map(s=>({...s,t:Date.parse(s.ts)}));
        const state=ArchiveScoring.accumulate(window,now).lubelskie;
        const score=state.score,level=score>=4?'high':score>=2?'elevated':'calm';
        const band=score>=4?4:score>=3.5?3.5:score>=3?3:score>=2.5?2.5:score>=2?2:0;
        if(level!==oldLevel||band!==oldBand)transitions.push({at:new Date(now).toISOString(),score,
            level,band,cause:signals.filter(s=>Date.parse(s.ts)===now).map(s=>({source:s.source,id:s.id}))});
        oldLevel=level;oldBand=band;
        // Input cannot be certified fresh. This is an abstention, NOT proof no alarm was warranted.
        if(model.advance({now,score,objects:[]}).kind==='escalation')extra++;
    }
    const live=realDay.live,clockDifferences=live.filter(t=>t.updatedAt&&t.confirmedAt&&t.updatedAt!==t.confirmedAt)
        .map(t=>({id:t.id,updatedAt:t.updatedAt,confirmedAt:t.confirmedAt,
            differenceMinutes:(Date.parse(t.confirmedAt)-Date.parse(t.updatedAt))/60000}));
    const report={stats,live:{at:realDay.liveAt,tracks:live.length,
        groups:live.filter(t=>Number.isFinite(t.count)&&t.count>1).map(t=>({id:t.id,count:t.count})),
        missingCount:live.filter(t=>!Number.isFinite(t.count)).length,clockDifferences},
        exactPositionCandidates:exactPairs,transitions,extraDecisions:extra,
        verdict:'UNASSESSABLE_FRESHNESS_AND_IDENTITY_NOT_NO_DANGER',hashes:realDay.hashes};
    const checks=[
        ['Zbiór obejmuje rano i popołudnie',stats.snapshots>400&&end-start>12*3600000],
        ['Porządek czasu bez przyszłych migawek',snaps.every((s,i)=>!i||Date.parse(s.ts)>Date.parse(snaps[i-1].ts))],
        ['Brak syntetycznego czasu obserwacji',stats.missingObserved===stats.rows&&stats.sourceTimeEligible===0],
        ['Liczby grup nie uzupełniono jedynkami',stats.missingCount===stats.rows],
        ['Wykryto parę ID wskazaną w porannym audycie',exactPairs.some(p=>p.previous==='trk_00172849'&&p.next==='trk_00172883')],
        ['Odtworzono czerwony po artykule o 06:34:03',transitions.some(t=>t.at==='2026-09-08T04:34:03.000Z'&&Math.abs(t.score-4.3056)<1e-8)],
        ['W bieżącym źródle występują grupy',report.live.groups.length>0],
        ['updatedAt i confirmedAt nie są równoważne',clockDifferences.length>0],
        ['Bez kwalifikowanych danych brak decyzji o dodatkowym żółtym',extra===0],
        ['Wynik oznaczony jako nierozstrzygnięty, nie bezpieczny',report.verdict.startsWith('UNASSESSABLE')],
    ];
    for(const [name,ok] of checks)OfflineResults.report(JSON.stringify({suite:'real-day',name,ok}));
    const passed=checks.filter(x=>x[1]).length;
    OfflineResults.report(`REAL_DAY_RESULT ${passed}/${checks.length} ${passed===checks.length?'PASS':'FAIL'} NO_SEND`);
    // Local result file in THIS test package; no network bridge.
    OfflineResults.writeTestState('real-report',JSON.stringify(report));
    OfflineResults.report('REAL_DAY_SUMMARY '+JSON.stringify({stats,live:report.live,
        exactPositionCandidateCount:exactPairs.length,extraDecisions:extra,verdict:report.verdict}));
    for(const row of transitions)OfflineResults.report('REAL_DAY_TRANSITION '+JSON.stringify(row));
    for(const row of exactPairs.slice(0,8))OfflineResults.report('REAL_DAY_PAIR '+JSON.stringify(row));
    document.getElementById('real-day-results').textContent=
        `Dane rzeczywiste: ${stats.snapshots} migawek, ${stats.uniqueTrackIds} ID śladów, ${stats.rows} zapisów pozycji. `+
        `Brak czasu obserwacji: ${stats.missingObserved}/${stats.rows}. Nie można potwierdzić nowych progów na tych danych. `+
        `Pary różnych ID w tej samej pozycji: ${exactPairs.length} (kandydaci, nie dowód duplikacji). `+
        `Sprawdzenia odtworzenia: ${passed}/${checks.length}. Bez wysyłki.`;
})();
