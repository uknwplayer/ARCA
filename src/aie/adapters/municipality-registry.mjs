export const municipalityAdapters=new Map();
export function registerMunicipalityAdapter(ibgeCode,adapter){if(!/^\d{7}$/.test(String(ibgeCode)))throw new Error("invalid IBGE municipality code");municipalityAdapters.set(String(ibgeCode),adapter);}
export function getMunicipalityAdapter(ibgeCode){return municipalityAdapters.get(String(ibgeCode))??null;}
