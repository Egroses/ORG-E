import { t } from '../i18n';

export type DataErrorKind = 'timeout' | 'unreachable' | 'incomplete' | 'noBands' | 'noService' | 'server';

/**
 * An error of the data layer. It carries what happened (a kind, or the server's error code and message), not a
 * sentence, so the text is made in the current language when it is shown.
 */
export class DataError extends Error {
  kind: DataErrorKind;
  code?: string;
  serverMessage?: string;
  constructor(kind: DataErrorKind, opts: { code?: string; serverMessage?: string } = {}) {
    super(opts.serverMessage ?? kind);
    this.name = 'DataError';
    this.kind = kind;
    this.code = opts.code;
    this.serverMessage = opts.serverMessage;
  }
}

const SERVER_CODES = ['no_coverage', 'archive_unavailable', 'internal_error', 'bad_input'] as const;

/** Text for an error in the current language. A server code we know gets our own wording; an unknown code shows the server's message as it is. */
export function errorText(e: unknown): string {
  if (e instanceof DataError) {
    if (e.kind === 'server') {
      const known = SERVER_CODES.find((c) => c === e.code);
      if (known) return t(`err.${known}`);
      return e.serverMessage || t('err.service');
    }
    return t(`err.${e.kind}`);
  }
  return e instanceof Error ? e.message : '';
}
