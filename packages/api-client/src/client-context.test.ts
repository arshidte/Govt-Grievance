import { BFF_AUTH_HEADER, CLIENT_IP_HEADER, CLIENT_UA_HEADER } from '@pg/types';
import { describe, expect, it } from 'vitest';

import { clientContextHeaders } from './client-context';

const SECRET = 'z'.repeat(48);

describe('clientContextHeaders (BFF → API end-user context)', () => {
  it('asserts the end user ip (first X-Forwarded-For hop) + user-agent, authenticated by the shared secret', () => {
    const incoming = new Headers({
      'x-forwarded-for': '203.0.113.7, 10.0.0.1',
      'user-agent': 'Mozilla/5.0 (citizen)',
    });

    expect(clientContextHeaders(incoming, SECRET)).toEqual({
      [BFF_AUTH_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.7',
      [CLIENT_UA_HEADER]: 'Mozilla/5.0 (citizen)',
    });
  });

  it('prefers X-Real-IP over X-Forwarded-For when both are present', () => {
    const incoming = new Headers({ 'x-real-ip': '198.51.100.4', 'x-forwarded-for': '203.0.113.7' });
    expect(clientContextHeaders(incoming, SECRET)[CLIENT_IP_HEADER]).toBe('198.51.100.4');
  });

  it('omits the user-agent header when the browser sent none', () => {
    const headers = clientContextHeaders(new Headers({ 'x-real-ip': '198.51.100.4' }), SECRET);
    expect(headers).not.toHaveProperty(CLIENT_UA_HEADER);
  });

  it('sends nothing when no shared secret is configured (feature off; never leaks client context)', () => {
    const incoming = new Headers({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'ua' });
    expect(clientContextHeaders(incoming, undefined)).toEqual({});
  });

  it('sends nothing when the client ip is unknown (e.g. local `next start` without a proxy)', () => {
    expect(clientContextHeaders(new Headers({ 'user-agent': 'ua' }), SECRET)).toEqual({});
  });
});
