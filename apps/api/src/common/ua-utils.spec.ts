import { describe, it, expect } from 'vitest';
import { classifyUa } from './ua-utils';

describe('classifyUa', () => {
  const botUas = [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'AhrefsBot/7.0; +http://ahrefs.com/robot/',
    'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36',
  ];

  it.each(botUas)('classifies bot UA as "bot": %s', (ua) => {
    expect(classifyUa(ua)).toBe('bot');
  });

  const mobileUas = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
  ];

  it.each(mobileUas)('classifies mobile UA as "mobile": %s', (ua) => {
    expect(classifyUa(ua)).toBe('mobile');
  });

  const desktopUas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  ];

  it.each(desktopUas)('classifies desktop UA as "desktop": %s', (ua) => {
    expect(classifyUa(ua)).toBe('desktop');
  });

  it('classifies undefined as "unknown"', () => {
    expect(classifyUa(undefined)).toBe('unknown');
  });

  it('classifies an unrecognised UA as "unknown"', () => {
    expect(classifyUa('curl/8.4.0')).toBe('unknown');
  });
});
