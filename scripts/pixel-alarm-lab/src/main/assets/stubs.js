'use strict';
// The ONLY notification implementations available to the extracted functions.
// No Firebase, native Capacitor, audio, vibration or HTTP implementation exists.
let state, lastMood = 'none', recorded = [], lastLevels = {}, lastNotif = {};
const COOLDOWN_MIN = 10;
const LEVEL_LABELS = {none:'BRAK',elevated:'ŻÓŁTY',high:'CZERWONY'};
function myVoiv() { return 'lubelskie'; }
function attentionChime() { recorded.push('elevated'); }
function showAlarm() { recorded.push('high'); }
function computeState() { return state.fusion; }
function shouldNotify(voiv) { return voiv === myVoiv(); }
function persistLevels() {}
function emit() {}
function notifyNative(title, body, high) { recorded.push(high ? 'high' : 'elevated'); }
function setScore(score) {
    const level = score >= 4 ? 'high' : score >= 2 ? 'elevated' : 'none';
    state = {fusion:{voivodeships:{lubelskie:{level,score,signals:[]}}}};
    return level;
}
function clearReplay() { lastMood='none'; lastLevels={}; lastNotif={}; recorded=[]; }
