// English is the source of truth: every key used in code lives here. tr.ts must have exactly the same keys
// (TypeScript enforces it: `Dict` is built from this object).
import { en as app } from './parts/app';
import { en as data } from './parts/data';
import { en as realistic } from './parts/realistic';
import { en as frontB } from './parts/front-b';
import { en as frontA } from './parts/front-a';
import { en as specUi } from './parts/spec-ui';

export const en = { ...app, ...data, ...realistic, ...frontB, ...frontA, ...specUi } as const;
