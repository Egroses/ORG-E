// English is the source of truth: every key used in code lives here. tr.ts must have exactly the same keys
// (TypeScript enforces it: `Dict` is built from this object).
import { en as app } from './parts/app';
import { en as data } from './parts/data';
import { en as realistic } from './parts/realistic';

export const en = { ...app, ...data, ...realistic } as const;
