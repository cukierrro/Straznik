'use strict';
window.addEventListener('error', e => {
    const where = `${e.filename || 'unknown'}:${e.lineno || 0}:${e.colno || 0}`;
    const stack = e.error?.stack ? `; stack=${e.error.stack}` : '';
    document.getElementById('result').textContent = `BŁĄD TESTU: ${e.message} (${where})`;
    OfflineResults.report(`FAIL: ${e.message}; at=${where}${stack}`);
});
const tests = [
    ['Narastanie 1,9 → 2 → 2,3 → 2,8 → 3 → 3,9 → 4 → 4,3', [1.9,2,2.3,2.8,3,3.9,4,4.3], ['elevated','high']],
    ['Wewnątrz żółtego brak powtórki', [2,2.3,3,3.9,3], ['elevated']],
    ['Spadek z czerwonego do żółtego bez alarmu', [4.3,3,2], ['high']],
    ['Aktualizacja tego samego poziomu', [2,2,2,2], ['elevated']],
    ['Bezpośredni skok do czerwonego', [1.9,4.3], ['high']],
    ['Żółty nie blokuje wejścia w czerwony', [2,4], ['elevated','high']]
];
let passed=0, total=0;
for (const [name, scores, expected] of tests) {
    for (const [path, fn] of [['UI',updateAlarmMood],['Standalone',reevaluate]]) {
        clearReplay();
        for (const score of scores) { setScore(score); fn(); }
        const ok = JSON.stringify(recorded) === JSON.stringify(expected);
        total++; if(ok) passed++;
        const item=document.createElement('li');
        item.textContent = `${ok?'OK':'BŁĄD'} · ${path}: ${name}`;
        document.getElementById('checks').appendChild(item);
        OfflineResults.report(JSON.stringify({path,name,expected,actual:recorded,ok}));
    }
}
document.getElementById('result').textContent = `${passed}/${total} testów ${passed===total?'OK':'— BŁĄD'}. Obecna logika: alarm przy zmianie poziomu, nie przy każdym wzroście punktów.`;
document.getElementById('source').textContent='SHA-256 frontend/app.js: '+sourceHash;
OfflineResults.report(`RESULT ${passed}/${total} ${passed===total?'PASS':'FAIL'}; source=${sourceHash}`);

const steps=[
    [1.9,'Poniżej progu żółtego.'],
    [2,'Pierwsze przekroczenie 2 pkt.'],
    [2.3,'Wynik rośnie, poziom pozostaje żółty.'],
    [2.8,'Dalszy wzrost w tym samym poziomie.'],
    [3,'3 pkt: nadal ten sam poziom.'],
    [4.3,'Wynik widoczny na zrzucie z 06:36:20. Test reakcji na próg, nie potwierdzenie prawidłowości sumy.']
];
let index=0;
function step() {
    const [score,reason]=steps[index];
    const level=setScore(score), before=recorded.length;
    updateAlarmMood();
    const triggered=recorded.length>before;
    document.getElementById('score').textContent=score.toFixed(1).replace('.',',')+' pkt';
    document.getElementById('score').style.color={none:'#aac1ea',elevated:'#ffbb24',high:'#ff526c'}[level];
    document.getElementById('level').textContent={none:'PONIŻEJ PROGU',elevated:'PODWYŻSZONA UWAGA',high:'WYSOKI PRIORYTET'}[level];
    document.getElementById('reason').textContent=reason;
    const action=triggered?`Logika zgłasza ${level==='high'?'czerwony':'żółty'} alarm. Tutaj tylko zapis — bez dźwięku i wysyłki.`:'Brak nowego alarmu. Zmienia się tylko informacja na ekranie.';
    document.getElementById('action').textContent=action;
    const item=document.createElement('li');
    item.textContent=score.toFixed(1)+' pkt → '+(triggered?LEVEL_LABELS[level]+' (symulacja)':'bez nowego alarmu');
    document.getElementById('events').appendChild(item);
    document.getElementById('next').disabled=index===steps.length-1;
    OfflineResults.report(`STEP ${index} score=${score} decision=${triggered?level:'none'}; NO_SEND`);
}
document.getElementById('next').onclick=()=>{if(index<steps.length-1){index++;step();}};
document.getElementById('reset').onclick=()=>{clearReplay();index=0;document.getElementById('events').replaceChildren();step();};
clearReplay();step();
