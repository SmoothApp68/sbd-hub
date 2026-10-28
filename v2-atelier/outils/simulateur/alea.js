'use strict';
// PRNG à graine (mulberry32). Aucun Math.random dans le simulateur.
function hacher(s) { let h = 1779033703 ^ String(s).length; for (let i = 0; i < String(s).length; i++) { h = Math.imul(h ^ String(s).charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; }
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// graine(profil, graine, ...cles) -> générateur déterministe
function creer(...cles) { return mulberry32(hacher(cles.join('|'))()); }
function gauss(r, mu, sd) { const u = Math.max(r(), 1e-12), v = r(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
module.exports = { creer, gauss };
