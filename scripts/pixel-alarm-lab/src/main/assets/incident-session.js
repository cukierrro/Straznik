'use strict';
// LAB ONLY. Durable reservations before returning a decision, no delivery APIs.
class IncidentSession {
    constructor(store,region='lubelskie'){
        this.store=store;this.region=region;this.model=new EscalationPrototype();
        this.serial=0;this.quietSince=null;this.lastSeen=null;this.lastEvent=null;this.ack=null;
        this.recovering=false;
        try {const raw=store.read();if(raw)this.restore(JSON.parse(raw));}
        catch(e){this.recovering=true;}
    }
    restore(s){
        const m=s.model,finite=Number.isFinite;
        if(s.version!==1||s.region!==this.region||!Number.isSafeInteger(s.serial)||s.serial<0||
           !m||![m.anchorScore,m.anchorAt,m.highWater,m.previousScore].every(finite)||
           m.anchorScore<0||m.previousScore<0||![2,2.5,3,3.5,4].includes(m.highWater)||
           !(m.lastTick===null||finite(m.lastTick))||
           ![s.quietSince,s.lastSeen].every(v=>v===null||finite(v))||
           ![s.lastEvent,s.ack].every(v=>v===null||typeof v==='string')||
           !(m.anchor===null||Array.isArray(m.anchor)))throw Error('invalid state');
        const map=m.anchor===null?null:new Map();
        for(const row of m.anchor||[]){
            if(!Array.isArray(row)||row.length!==2||!this.model.valid(row[1])||
               row[0]!==row[1].physicalId||map.has(row[0]))throw Error('invalid anchor');
            map.set(row[0],row[1]);
        }
        Object.assign(this.model,m,{anchor:map,lastTick:m.lastTick??-Infinity});
        for(const k of ['serial','quietSince','lastSeen','lastEvent','ack'])this[k]=s[k];
    }
    export(){return {version:1,region:this.region,serial:this.serial,
        quietSince:this.quietSince,lastSeen:this.lastSeen,lastEvent:this.lastEvent,ack:this.ack,
        model:{...this.model,anchor:this.model.anchor?[...this.model.anchor]:null,
            lastTick:Number.isFinite(this.model.lastTick)?this.model.lastTick:null}};}
    save(){try{return this.store.write(JSON.stringify(this.export()))===true;}catch(e){return false;}}
    acknowledge(id){if(id!==this.lastEvent||id===null)return false;this.ack=id;return this.save();}
    advance(frame){
        const {now,score}=frame;
        if(!Number.isFinite(now)||!Number.isFinite(score)||score<0||
           (this.lastSeen!==null&&now<this.lastSeen))return {kind:'none',reason:'invalid-clock-or-score'};
        const gap=this.lastSeen!==null&&now-this.lastSeen>120000;
        if(gap)this.quietSince=null; // An outage does not prove that danger ended.
        this.lastSeen=now;
        if(frame.healthy!==true){this.quietSince=null;
            // Additional yellow is suppressed; this experiment never blocks existing red.
            const d=score>=4?this.model.advance(frame):{kind:'none',reason:'data-unavailable'};
            if(!this.save())d.storageWarning=true;
            return d;}
        if(score<2){
            if(this.quietSince===null)this.quietSince=now;
            // Trial reset: one full fusion window continuously below yellow.
            if(now-this.quietSince>=3600000){
                this.model=new EscalationPrototype();this.serial++;this.quietSince=now;
                this.lastEvent=null;this.ack=null;
            }
        }else this.quietSince=null;
        if(this.recovering||gap){
            // Do not replay yellow thresholds accumulated during an unobserved gap.
            if(!this.model.anchor&&score>=2&&score<4){
                this.model.advance(frame);this.recovering=false;this.save();
                return {kind:'none',reason:'recovery-baseline-no-replay'};
            }
            if(score>=2&&score<4){
                this.model.anchor=this.model.snapshot(frame.objects||[]);
                this.model.anchorScore=score;this.model.anchorAt=now;
                this.model.highWater=Math.max(this.model.highWater,...[2,2.5,3,3.5].filter(t=>t<=score));
            }
            this.recovering=false;
        }
        const d=this.model.advance(frame);
        if(d.kind!=='none'){
            const tier=d.band|| (d.kind==='high'?4:2);
            this.lastEvent=`${this.region}:${this.serial}:${tier}`;d.eventId=this.lastEvent;
        }
        if(!this.save())return d.kind==='high'?{...d,storageWarning:true}:
            {kind:'none',reason:'state-not-saved'};
        return d;
    }
}
