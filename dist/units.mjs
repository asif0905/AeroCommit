// Screening density shared by both fuels to preserve equal-energy comparison.
export const LITRES_PER_US_GALLON=3.785411784;
export const FUEL_DENSITY_KG_PER_LITRE=0.8;
export const KG_PER_GALLON=LITRES_PER_US_GALLON*FUEL_DENSITY_KG_PER_LITRE;
export const GALLONS_PER_TONNE=1000/KG_PER_GALLON;
export const gallons=tonnes=>tonnes*GALLONS_PER_TONNE;
export const tonnes=volume=>volume/GALLONS_PER_TONNE;
const volumeKeys=new Set(['supply','demand','capacity','target']);
const priceKeys=new Set(['price','freight','jetPrice','fee']);
export const toDisplay=(key,value)=>volumeKeys.has(key)?gallons(value):priceKeys.has(key)?value/GALLONS_PER_TONNE:value;
export const fromDisplay=(key,value)=>volumeKeys.has(key)?tonnes(value):priceKeys.has(key)?value*GALLONS_PER_TONNE:value;
export const isVolume=key=>volumeKeys.has(key);
export const isPrice=key=>priceKeys.has(key);
