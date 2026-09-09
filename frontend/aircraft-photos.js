/* Model photo library: no registration-photo API, network lookup or fuzzy match.
   This module changes photographs only, never scoring, tracking or map icons. */
(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[\s._-]+/g, '').trim();
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  function select(plane, catalog) {
    if (!plane || !catalog?.photos) return null;
    const code = String(plane.type || '').trim().toUpperCase();
    if (!own(catalog.photos, code)) return null;
    const photo = catalog.photos[code];
    const description = normalize(plane.desc);
    // An explicit conflicting/unrecognised description always wins over a code or identity.
    if (description && !photo.aliases.some(a => normalize(a) === description) && normalize(photo.model) !== description) return null;
    const identity = catalog.identities?.some(i => i.type === code &&
      String(plane.hex || '').toLowerCase() === i.hex &&
      String(plane.reg || '').trim().toUpperCase() === i.reg && i.photo === code);
    // The provider often omits `desc` even when its ICAO type code is present.
    // In that case the reviewed local photo is still a useful family/model
    // example; its caption explicitly says that subvariant/equipment may differ.
    // Identity-only entries remain fail-closed.
    if (!description && photo.mode === 'identity' && !identity) return null;
    if (!/^assets\/aircraft\/[a-z0-9]+-[a-f0-9]{12}\.jpg$/.test(photo.src)) return null;
    return {...photo};
  }
  function caption(photo, language) {
    return language === 'en'
      ? `Example aircraft: ${photo.model}. Not the tracked aircraft; equipment and subvariant may differ.`
      : `Przykładowy egzemplarz: ${photo.model}. Nie jest to śledzona maszyna; wyposażenie i podwariant mogą się różnić.`;
  }
  const api = {select, caption};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AircraftPhotos = api;
})(globalThis);
