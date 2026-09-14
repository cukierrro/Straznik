'use strict';
// EXPERIMENT ONLY. No imports from production, no network or notification APIs.
// Objects supplied by fixtures already have identity resolved and counted points.
// A production identity/freshness adapter does NOT exist in this experiment.
class EscalationPrototype {
    constructor() {
        this.anchor = null;
        this.anchorScore = 0;
        this.anchorAt = 0;
        this.highWater = 2;
        this.previousScore = 0;
        this.lastTick = -Infinity;
    }
    valid(o) {
        return o && typeof o.physicalId === 'string' && o.physicalId.length > 0 &&
            o.identityConfirmed === true && o.source === 'neptun' &&
            o.region === 'lubelskie' && o.propagated !== true &&
            [o.observedAt,o.points,o.distance,o.uncertainty].every(Number.isFinite) &&
            o.points >= 0 && o.distance >= 0 && o.uncertainty >= 0;
    }
    snapshot(objects) {
        const out = new Map();
        // Conflicting duplicates are discarded, not selected by highest score.
        const duplicate = new Set();
        for (const o of objects) {
            if (!this.valid(o)) continue;
            if (out.has(o.physicalId)) duplicate.add(o.physicalId);
            out.set(o.physicalId, {...o});
        }
        for (const id of duplicate) out.delete(id);
        return out;
    }
    advance({now,score,objects=[]}) {
        if (!Number.isFinite(now) || now < this.lastTick || !Number.isFinite(score) || score < 0)
            return {kind:'none',reason:'Nieprawidłowy lub cofnięty czas/wynik'};
        this.lastTick=now;
        const previous=this.previousScore;
        this.previousScore=score;
        const current=this.snapshot(objects);
        if (score >= 4) {
            this.highWater=4;
            return {kind:previous<4?'high':'none',reason:'Próg czerwony — niezależny od ostrzeżeń żółtych'};
        }
        if (score < 2) return {kind:'none',reason:'Poniżej żółtego; pamięć stopni zachowana do resetu scenariusza'};
        if (!this.anchor) {
            this.anchor=current; this.anchorScore=score; this.anchorAt=now;
            this.highWater=Math.max(this.highWater,...[2,2.5,3,3.5].filter(t=>t<=score));
            return {kind:'elevated',reason:'Pierwszy żółty; zapamiętano punkt odniesienia'};
        }
        let growth=0;
        const reasons=[];
        for (const [id, old] of this.anchor) {
            const next=current.get(id);
            // Loss of a contributing object cannot strengthen escalation.
            if (!next) growth-=old.points;
            else if (next.points<old.points) growth+=next.points-old.points;
        }
        for (const [id, next] of current) {
            const age=now-next.observedAt;
            if (age<0 || age>5*60000 || next.observedAt<=this.anchorAt) continue;
            const old=this.anchor.get(id);
            if (!old && next.points>0) {
                growth+=next.points;
                reasons.push(`Nowy odrębny obiekt ${id}`);
            } else if (old && next.points>old.points && next.observedAt>old.observedAt) {
                const approach=old.distance-next.distance;
                // Trial assumption, not an approved production distance threshold.
                if (approach>Math.max(10,old.uncertainty+next.uncertainty)) {
                    growth+=next.points-old.points;
                    reasons.push(`${id}: zbliżenie ${approach.toFixed(0)} km (±${next.uncertainty} km)`);
                }
            }
        }
        // Counterfactual score: omit positive RSS/propagation growth entirely.
        // RSS + a token new object must not jointly unlock a tier.
        const qualified=Math.min(score,this.anchorScore+growth);
        const bands=[2.5,3,3.5].filter(t=>t>this.highWater && qualified+1e-9>=t);
        if (!bands.length || !reasons.length || growth<=0) return {
            kind:'none',qualified,reason:'Brak nowego stopnia uzasadnionego świeżą zmianą obiektów'
        };
        const band=Math.max(...bands);
        this.highWater=band;
        this.anchor=current;
        this.anchorAt=now;
        this.anchorScore=qualified; // Never rebase to the RSS-inflated total.
        return {kind:'escalation',band,qualified,reasons,
            reason:'Sytuacja narasta — '+reasons.join('; ')};
    }
}
