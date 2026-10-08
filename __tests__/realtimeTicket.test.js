import { signTicket, verifyTicket, timingSafeEqualString } from '../lib/realtime/ticket';

const SECRET = 'test-ticket-secret';

describe('realtime tickets', () => {
  it('round-trips claims through sign and verify', async () => {
    const ticket = await signTicket({ sub: 'user-1', role: 'admin' }, SECRET);
    const claims = await verifyTicket(ticket, SECRET);
    expect(claims).toMatchObject({ sub: 'user-1', role: 'admin' });
    expect(claims.exp - claims.iat).toBe(60);
  });

  it('rejects a tampered payload', async () => {
    const ticket = await signTicket({ sub: 'user-1', role: 'staff' }, SECRET);
    const [, signature] = ticket.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'user-2', role: 'admin', exp: 9999999999 }))
      .toString('base64url');
    expect(await verifyTicket(`${forgedPayload}.${signature}`, SECRET)).toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const ticket = await signTicket({ sub: 'user-1', role: 'admin' }, SECRET);
    const [payload] = ticket.split('.');
    expect(await verifyTicket(`${payload}.AAAA`, SECRET)).toBeNull();
  });

  it('rejects a ticket signed with a different secret', async () => {
    const ticket = await signTicket({ sub: 'user-1', role: 'admin' }, 'other-secret');
    expect(await verifyTicket(ticket, SECRET)).toBeNull();
  });

  it('rejects an expired ticket', async () => {
    const ticket = await signTicket({ sub: 'user-1', role: 'admin' }, SECRET, -1);
    expect(await verifyTicket(ticket, SECRET)).toBeNull();
  });

  it('rejects malformed input and a missing secret', async () => {
    expect(await verifyTicket(undefined, SECRET)).toBeNull();
    expect(await verifyTicket('not-a-ticket', SECRET)).toBeNull();
    expect(await verifyTicket('a.b.c', SECRET)).toBeNull();
    const ticket = await signTicket({ sub: 'user-1', role: 'admin' }, SECRET);
    expect(await verifyTicket(ticket, '')).toBeNull();
  });

  it('compares strings in constant time helper correctly', async () => {
    expect(await timingSafeEqualString('Bearer abc', 'Bearer abc')).toBe(true);
    expect(await timingSafeEqualString('Bearer abc', 'Bearer abd')).toBe(false);
    expect(await timingSafeEqualString('Bearer abc', undefined)).toBe(false);
  });
});
