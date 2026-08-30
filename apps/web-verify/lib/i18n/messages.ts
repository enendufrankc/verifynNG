import en from '../../messages/en.json';
import pcm from '../../messages/pcm.json';
import yo from '../../messages/yo.json';
import ha from '../../messages/ha.json';
import ig from '../../messages/ig.json';

export const MESSAGES = { en, pcm, yo, ha, ig } as const;

export type Locale = keyof typeof MESSAGES;
export type MessageKey = keyof typeof en;

export const LOCALES = Object.keys(MESSAGES) as Locale[];
export const DEFAULT_LOCALE: Locale = 'en';
