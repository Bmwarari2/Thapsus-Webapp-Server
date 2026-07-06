import { describe, it, expect } from 'vitest';
import { hashIp, parseDeviceType, getClientIp, geoFromHeaders, lookupGeo } from '../../utils/ipGeolocation.js';

describe('ipGeolocation helpers', () => {
  it('hashes IPs deterministically and never returns the raw IP', () => {
    const a = hashIp('41.90.1.2');
    const b = hashIp('41.90.1.2');
    const c = hashIp('41.90.1.3');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain('41.90');
    expect(hashIp('')).toBeNull();
  });

  it('classifies device from the User-Agent', () => {
    expect(parseDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(parseDeviceType('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(parseDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop');
    expect(parseDeviceType('')).toBe('unknown');
  });

  it('reads the client IP from X-Forwarded-For', () => {
    const req = { headers: { 'x-forwarded-for': '41.90.1.2, 10.0.0.1' }, ip: '10.0.0.1' };
    expect(getClientIp(req)).toBe('41.90.1.2');
    const req2 = { headers: {}, ip: '::ffff:41.90.1.9' };
    expect(getClientIp(req2)).toBe('41.90.1.9');
  });

  it('uses a CDN country header as a fast path', () => {
    expect(geoFromHeaders({ headers: { 'cf-ipcountry': 'ke' } })).toMatchObject({ country_code: 'KE' });
    expect(geoFromHeaders({ headers: { 'cf-ipcountry': 'XX' } })).toBeNull();
    expect(geoFromHeaders({ headers: {} })).toBeNull();
  });

  it('returns empty geo for private/localhost IPs without any network call', async () => {
    const g = await lookupGeo('127.0.0.1');
    expect(g).toEqual({ country: null, country_code: null, region: null, city: null, latitude: null, longitude: null });
    const g2 = await lookupGeo('10.0.0.5');
    expect(g2.country).toBeNull();
  });
});
