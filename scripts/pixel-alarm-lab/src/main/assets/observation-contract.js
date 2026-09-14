'use strict';
// LAB ONLY: proposed input contract, NOT an identity resolver or collector.
// Missing source time must never be replaced by signal.ts (local ingestion time).
function escalationObservation(signal, evidence, now, region='lubelskie') {
    const d=signal?.details || {};
    const reject=reason=>({eligible:false,reason});
    if (!Number.isFinite(now)) return reject('invalid-clock');
    if (signal?.source!=='neptun' || signal.voivodeship!==region || signal.propagated===true)
        return reject('wrong-source-or-region');
    if (typeof d.observed_at!=='string' || !/(Z|[+-]\d{2}:\d{2})$/.test(d.observed_at))
        return reject('missing-source-time');
    const observedAt=Date.parse(d.observed_at);
    if (!Number.isFinite(observedAt) || observedAt>now || now-observedAt>300000)
        return reject('stale-or-future');
    // Evidence must be supplied by a separate, validated identity adapter.
    if (!evidence || evidence.trackId!==d.track_id || evidence.confirmed!==true ||
        typeof evidence.physicalId!=='string' || !evidence.physicalId.trim())
        return reject('unresolved-identity');
    if (evidence.active!==true) return reject('not-currently-observed');
    if (evidence.observedAt!==observedAt || evidence.region!==region)
        return reject('evidence-not-bound-to-this-observation');
    if (![signal.counted_points,d.distance_to_region_km,d.uncertainty_km].every(Number.isFinite) ||
        signal.counted_points<0 || d.distance_to_region_km<0 || d.uncertainty_km<0)
        return reject('missing-counted-points-or-region-distance');
    return {eligible:true,object:{physicalId:evidence.physicalId,identityConfirmed:true,
        source:'neptun',region,observedAt,points:signal.counted_points,
        distance:d.distance_to_region_km,uncertainty:d.uncertainty_km}};
}
