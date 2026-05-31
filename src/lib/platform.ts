export type OS = 'macos' | 'windows' | 'linux' | 'other';

function detect(): OS {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(ua)) return 'linux';
  return 'other';
}

export const OS: OS = detect();
export const IS_MAC = OS === 'macos';
