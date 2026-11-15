// Turkish. The keys must be exactly those of en.ts: a missing or extra key is a compile error.
import { en } from './en';
import { tr as app } from './parts/app';
import { tr as data } from './parts/data';
import { tr as realistic } from './parts/realistic';
import { tr as frontA } from './parts/front-a';

export type Dict = Record<keyof typeof en, string>;

export const tr: Dict = { ...app, ...data, ...realistic, ...frontA };
