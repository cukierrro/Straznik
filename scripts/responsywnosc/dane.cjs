// Syntetyczne dane dla testu responsywności (scripts/test_responsywnosc.cjs).
//
// Celowo NIE nagranie z serwera: paczka historii waży ~7,7 MB, a prawdziwe dane
// zawierają cudze treści (tytuły artykułów, meldunki NEPTUN-a), których nie
// trzymamy w publicznym repozytorium. Tu wszystko jest wymyślone, ale ma kształt
// prawdziwego /api/state i /api/history/bundle — i celowo NAJGORSZE przypadki:
// długie nazwy miejscowości, długie opisy, kilka województw powyżej progu.
"use strict";

const WOJ = ["lubelskie", "podkarpackie", "podlaskie", "mazowieckie", "świętokrzyskie",
  "małopolskie", "warmińsko-mazurskie", "łódzkie", "śląskie", "kujawsko-pomorskie",
  "pomorskie", "zachodniopomorskie", "lubuskie", "wielkopolskie", "dolnośląskie", "opolskie"];

const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "+00:00");

function obiekty(teraz, przesuniecieMin = 0) {
  const t = iso(teraz - 60000 * (1 + przesuniecieMin));
  const ocena = (km, ku = true, znany = false) => ({ dist_km: km, border_voiv: "lubelskie",
    bearing_to_border: 243.1, course_factor: znany ? 1 : 0.5, heading_known: znany, toward_pl: ku, inside_pl: false });
  return [
    { id: "trk_test_01", type: "uav", lat: 51.5994 + przesuniecieMin * 0.002, lon: 23.7094 - przesuniecieMin * 0.004,
      heading: null, confidenceLevel: "high", sourceCount: 3, uncertaintyKm: 4, region: "Волинська область",
      locality: "Ростань", destination: null, positionQuality: "confirmed", areaOnly: null, status: "active",
      lifecycle: "created", updatedAt: t, confirmedAt: t, straznik_position: { quality: "point", reason: "source_point" },
      pl_assessment: ocena(10.2) },
    { id: "trk_test_02", type: "uav", lat: 50.0884, lon: 24.4626, heading: 246.4, confidenceLevel: "medium",
      sourceCount: 6, uncertaintyKm: 25, region: "Львівська область", locality: "Новояворівськ-Дрогобицький",
      destination: true, positionQuality: "approx", areaOnly: null, status: "active", lifecycle: "uncertain",
      updatedAt: t, confirmedAt: t, straznik_position: { quality: "approx", reason: "source_approx" },
      pl_assessment: ocena(48.9, true, true) },
    { id: "trk_test_03", type: "cruise", lat: 50.62, lon: 25.33, heading: 270, confidenceLevel: "medium",
      sourceCount: 2, uncertaintyKm: 25, region: "Волинська область", locality: "Луцьк", destination: null,
      positionQuality: "approx", areaOnly: true, status: "active", lifecycle: "uncertain", updatedAt: t,
      confirmedAt: t, straznik_position: { quality: "approx", reason: "source_approx" }, pl_assessment: ocena(118) },
    { id: "trk_test_04", type: "shahed", count: 4, lat: 50.95, lon: 24.6, heading: 280, confidenceLevel: "high",
      sourceCount: 5, uncertaintyKm: 10, region: "Волинська область", locality: "Володимир-Волинський",
      destination: null, positionQuality: "confirmed", areaOnly: null, status: "active", lifecycle: "confirmed",
      updatedAt: t, confirmedAt: t, straznik_position: { quality: "point", reason: "source_point" },
      pl_assessment: ocena(34.5, true, true) },
    { id: "trk_test_05", type: "recon", lat: 49.85, lon: 24.03, heading: null, confidenceLevel: "low",
      sourceCount: 1, uncertaintyKm: 10, region: "Львівська область", locality: "Львів", destination: null,
      positionQuality: "confirmed", areaOnly: null, status: "active", lifecycle: "created", updatedAt: t,
      confirmedAt: t, straznik_position: { quality: "point", reason: "source_point" }, pl_assessment: ocena(57.2) },
  ];
}

function sygnaly(teraz) {
  const s = (id, minut, source, event_type, voiv, points, title, details = {}) => ({
    id, ts: iso(teraz - minut * 60000), source, event_type, voivodeship: voiv, points, title,
    counted_points: points, weight: 1, details });
  return [
    s(1, 3, "neptun", "neptun_threat", "lubelskie", 2.0,
      "Dron / BpSP kursem na granicę PL, 10,2 km [kurs nieznany] [blisko granicy] (woj. lubelskie, wiarygodność: wysoka, 3 potwierdzenia, ±4 km)",
      { track_id: "trk_test_01", type: "uav", dist_km: 10.2, course: "unknown", source_count: 3,
        border_floor: true, bez_przeniesienia_pkt: 1.4, eta_border_min: 1 }),
    s(2, 5, "neptun", "neptun_threat", "lubelskie", 1.6,
      "4× Shahed kursem na granicę PL, 34,5 km, konserwatywny czas dolotu ~8 min (woj. lubelskie, wiarygodność: wysoka, 5 potwierdzeń, ±10 km)",
      { track_id: "trk_test_04", type: "shahed", dist_km: 34.5, course: "known", source_count: 5, eta_border_min: 8 }),
    s(3, 20, "ua_alert", "ua_alert_border", "lubelskie", 1.0,
      "Alarm powietrzny w obwodzie wołyńskim (woj. lubelskie — przy granicy)", { oblast: "Волинська", distance_km: 0 }),
    s(4, 25, "rcb", "rso_alert", "lubelskie", 1.5,
      "Alert RCB (RSO): „UWAGA! Rosyjski atak powietrzny na terenie Ukrainy. Sytuacja jest monitorowana. W przestrzeni RP operuje polskie lotnictwo.”",
      { rcb_level: 1, rso_id: "test-1" }),
    s(5, 8, "neptun", "neptun_threat", "podkarpackie", 1.3,
      "Dron / BpSP w odległości 29,1 km od woj. podkarpackie [blisko granicy] (wiarygodność: wysoka, 3 potwierdzenia)",
      { track_id: "trk_test_02", type: "uav", dist_km: 29.1, voiv_secondary: true }),
    s(6, 9, "ua_alert", "ua_alert_border", "podkarpackie", 1.0,
      "Alarm powietrzny w obwodzie lwowskim (woj. podkarpackie — przy granicy)", { oblast: "Львівська", distance_km: 0 }),
    s(7, 15, "media", "baltic_alert", "podlaskie", 0.3,
      "Alarm powietrzny — Litwa: „Testowy tytuł z bardzo długą nazwą okręgu i dodatkowym opisem sytuacji”",
      { country: "LT", incident_key: "LT:test" }),
  ];
}

function stan(teraz) {
  const syg = sygnaly(teraz);
  const voivodeships = {};
  for (const v of WOJ) {
    const wl = syg.filter(s => s.voivodeship === v);
    const pkt = Math.round(wl.reduce((a, s) => a + s.points, 0) * 10) / 10;
    const poziom = pkt >= 4 ? "high" : pkt >= 2 ? "elevated" : "none";
    voivodeships[v] = { score: pkt, own_score: pkt, own_level: poziom, level: poziom === "high" ? "elevated" : poziom,
      alert_level: poziom === "high" ? "elevated" : poziom, red_key: null, spill_raised: false, signals: wl };
  }
  return {
    notice: null, wylaczniki: {},
    fusion: { ts: iso(teraz), window_min: 60, thresholds: { elevated: 2, high: 4 }, voivodeships },
    neptun: { status: { connected: true, mode: "ws", last_msg: teraz / 1000 }, threats: obiekty(teraz),
      alert_oblasts: [], alert_areas: [{ w: "raion", k: "kovel", n: "Ковельський район", o: "Волинська область",
        l: "red", s: iso(teraz - 20 * 60000), r: "Загроза застосування БпЛА" }] },
    adsb: { aircraft: [
      { hex: "abc001", callsign: "TEST01", type: "A332", lat: 51.2, lon: 21.9, alt: 30000, gs: 420, track: 90,
        voivodeship: "lubelskie", desc: "Samolot testowy o bardzo długiej nazwie modelu", reg: "SP-TST", op: null,
        cat: "A5", vr: 0, year: null, source: "ADS-B", detection: "mil_registry" }],
      counts: {}, baselines: {}, trails: {} },
    health: { neptun: true, ua_alerts: true, adsb: true, pansa: true, rcb: true, rss: {},
      baltic: { LT: { feeds_ok: 2, feeds: 2, newest_item: teraz / 1000, last_alert: null },
                LV: { feeds_ok: 2, feeds: 2, newest_item: teraz / 1000, last_alert: null },
                EE: { feeds_ok: 2, feeds: 2, newest_item: teraz / 1000, last_alert: null } },
      neighbour_zones: {} },
  };
}

function paczkaHistorii(teraz) {
  const snaps = [];
  for (let m = 60; m >= 0; m--) {
    snaps.push({ ts: iso(teraz - m * 60000), aircraft: [], zones: [],
      threats: obiekty(teraz - m * 60000, 0).map(o => ({ ...o, age_min: 1 + (m % 7) })) });
  }
  return { hours: 12, window_min: 60, snaps, signals: sygnaly(teraz), adsb_watch_events: [], zone_defs: [] };
}

module.exports = { stan, paczkaHistorii, WOJ };
