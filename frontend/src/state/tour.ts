const KEY = 'skyquest.tour.v1';

export const tourSeen = () => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const markTourSeen = () => {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // not remembered: the tour may show again next visit
  }
};
