export type Theme = 'light' | 'dark';
const KEY = 'skyquest.theme.v1';

/** Light unless the visitor has chosen dark before. */
export function loadTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try {
    localStorage.setItem(KEY, t);
  } catch {
    // not remembered
  }
}
