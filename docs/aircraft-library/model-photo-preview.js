/* Isolated, offline selection experiment. NOT imported by the application.
   verifiedModelId must come from a reviewed model mapping, never fuzzy reg matching. */
(function (root) {
  'use strict';
  function selectPhoto(aircraft, catalog, language = 'pl') {
    if (!aircraft || !catalog || catalog.status !== 'isolated_preview_only') return null;
    const code = String(aircraft.type || '').trim().toUpperCase();
    if (!code) return null;
    const explicit = Object.prototype.hasOwnProperty.call(aircraft, 'verifiedModelId');
    const id = explicit ? aircraft.verifiedModelId : catalog.codeDefaults?.[code];
    if (typeof id !== 'string' || !id) return null;
    const photo = catalog.photos?.find(p => p.id === id && p.status === 'reviewed_preview');
    if (!photo || !photo.codes.includes(code)) return null;
    if (!/^assets\/[a-z0-9-]+\.jpg$/.test(photo.src)) return null;
    if (!photo.author || !photo.license || !photo.sourceUrl?.startsWith('https://') || !photo.licenseUrl?.startsWith('https://')) return null;
    return {...photo, caption: language === 'en'
      ? `Example aircraft: ${photo.model}. Not a photo of the tracked aircraft.`
      : `Przykładowy egzemplarz: ${photo.model}. Zdjęcie nie przedstawia obserwowanej maszyny.`};
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {selectPhoto};
  else root.AircraftPhotoPreview = {selectPhoto};
})(globalThis);
