// @ts-nocheck
import off from './off.js';
import crtDefault from './crt-default.js';
import crtAmber from './crt-amber.js';
import crtGreen from './crt-green.js';
import crtApple2 from './crt-apple2.js';
import crtVintage from './crt-vintage.js';
import crtIbm3278 from './crt-ibm3278.js';

export const EFFECTS = new Map([
  ['off', off],
  ['crt-default', crtDefault],
  ['crt-amber', crtAmber],
  ['crt-green', crtGreen],
  ['crt-apple2', crtApple2],
  ['crt-vintage', crtVintage],
  ['crt-ibm3278', crtIbm3278],
]);

export const EFFECT_ORDER = [
  'off',
  'crt-default',
  'crt-amber',
  'crt-green',
  'crt-apple2',
  'crt-vintage',
  'crt-ibm3278',
];
