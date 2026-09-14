'use strict';
// Experimental anti-duplication, not positive identification of aircraft.
// Input time MUST be observation time, never ingest time or undocumented updatedAt.
class TrackGuard {
    constructor(){this.records=new Map();this.last=-Infinity;}
    export(){return {version:1,last:Number.isFinite(this.last)?this.last:null,records:[...this.records]};}
    restore(s){
        if(s?.version!==1||!(s.last===null||Number.isFinite(s.last))||!Array.isArray(s.records)||s.records.length>1000)throw Error('invalid ledger');
        const records=new Map();
        for(const [id,o] of s.records){
            if(typeof id!=='string'||id!==o.id||records.has(id)||
               ![o.lat,o.lon,o.uncertainty,o.observedAt,o.maxSpeedKmh].every(Number.isFinite)||
               Math.abs(o.lat)>90||Math.abs(o.lon)>180||o.uncertainty<0||o.maxSpeedKmh<=0||
               o.timeBasis!=='source-observation'||o.count!==1||
               !Number.isSafeInteger(o.observations)||o.observations<1||typeof o.quarantined!=='boolean')throw Error('invalid track');
            records.set(id,{...o});
        }
        this.records=records;this.last=s.last??-Infinity;
    }
    distance(a,b){
        const r=Math.PI/180,dl=(a.lon-b.lon)*r,da=(a.lat-b.lat)*r;
        return 12742*Math.asin(Math.sqrt(Math.min(1,Math.sin(da/2)**2+
            Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dl/2)**2)));
    }
    check(o,now){
        const no=reason=>({eligible:false,reason});
        if(!Number.isFinite(now)||now<this.last)return no('clock');
        this.last=now;
        if(!o||typeof o.id!=='string'||!o.id||o.count!==1||
           ![o.lat,o.lon,o.uncertainty,o.observedAt,o.maxSpeedKmh].every(Number.isFinite)||
           Math.abs(o.lat)>90||Math.abs(o.lon)>180||o.uncertainty<0||o.maxSpeedKmh<=0||
           o.timeBasis!=='source-observation'||o.observedAt>now||now-o.observedAt>300000)
            return no('invalid-or-stale-observation');
        // Keep one hour of possible predecessors even when no longer on the map.
        for(const [id,p] of this.records)if(now-p.observedAt>3600000)this.records.delete(id);
        const old=this.records.get(o.id);
        if(!old&&this.records.size>=1000)return no('ledger-full');
        if(old&&o.observedAt<=old.observedAt)return no('repeated-or-reversed-observation');
        const reachable=p=>this.distance(p,o)<=p.uncertainty+o.uncertainty+
            Math.max(p.maxSpeedKmh,o.maxSpeedKmh)*Math.abs(o.observedAt-p.observedAt)/3600000;
        // Classification can change: do not assume different types mean distinct objects.
        const aliases=[...this.records.values()].filter(p=>p.id!==o.id&&reachable(p));
        let reason='candidate-needs-second-observation';
        let observations=1,quarantined=false;
        if(aliases.length){reason='possible-reacquisition-or-overlap';quarantined=true;}
        else if(old){
            quarantined=old.quarantined||!reachable(old)||o.observedAt-old.observedAt>300000;
            reason=quarantined?'uncertain-continuity':'continuous-source-track';
            observations=old.observations+1;
        }
        this.records.set(o.id,{...o,observations,quarantined});
        return {eligible:!!old&&!quarantined&&!aliases.length,reason,trackKey:o.id,
            identity:'source-track-not-confirmed-physical-object'};
    }
}
