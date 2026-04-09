import off from './off.js';
import crtDefault from './crt-default.js';

export const EFFECTS = new Map([
  ['off', off],
  ['crt-default', crtDefault],
]);

export const EFFECT_ORDER = ['off', 'crt-default'];
