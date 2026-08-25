import { appendProcessNote } from '../lib/processHistoryServer';
import { parseProcessNotes } from '../lib/processHistory';

/**
 * Minimal stand-in for the Supabase query builder, covering only the two chains
 * appendProcessNote uses:
 *   .from('applications').select('notes').eq('id', x).single()
 *   .from('applications').update({...}).eq('id', x)
 */
function mockSupabase({ notes = null, readError = null, writeError = null } = {}) {
  const captured = { update: null };

  const client = {
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: readError ? null : { notes }, error: readError }),
        }),
      }),
      update: (payload) => {
        captured.update = payload;
        return { eq: async () => ({ error: writeError }) };
      },
    })),
  };

  return { client, captured };
}

beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('appendProcessNote', () => {
  it('appends to existing notes separated by a blank line', async () => {
    const { client, captured } = mockSupabase({ notes: '[2026-08-25T12:00:00.000Z] Earlier entry.' });

    const result = await appendProcessNote(client, 'app-1', 'Completed lender questionnaire uploaded by Jane Doe.');

    expect(result.ok).toBe(true);
    expect(captured.update.notes).toContain('[2026-08-25T12:00:00.000Z] Earlier entry.\n\n[');
    expect(parseProcessNotes(captured.update.notes)).toHaveLength(2);
  });

  it('writes the bare note when notes is null', async () => {
    const { client, captured } = mockSupabase({ notes: null });

    await appendProcessNote(client, 'app-1', 'Original lender questionnaire downloaded by Jane Doe.');

    expect(captured.update.notes.startsWith('\n')).toBe(false);
    const entries = parseProcessNotes(captured.update.notes);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('Original lender questionnaire downloaded by Jane Doe.');
  });

  it('writes the bare note when notes is an empty string', async () => {
    const { client, captured } = mockSupabase({ notes: '' });

    await appendProcessNote(client, 'app-1', 'A milestone.');

    expect(parseProcessNotes(captured.update.notes)).toHaveLength(1);
  });

  it('preserves operator free text already in notes', async () => {
    const { client, captured } = mockSupabase({ notes: 'Operator comment.' });

    await appendProcessNote(client, 'app-1', 'A milestone.');

    expect(captured.update.notes).toBe(`Operator comment.\n\n${captured.update.notes.split('\n\n')[1]}`);
    expect(parseProcessNotes(captured.update.notes)).toHaveLength(1);
  });

  it('bumps updated_at', async () => {
    const { client, captured } = mockSupabase({ notes: null });

    await appendProcessNote(client, 'app-1', 'A milestone.');

    expect(typeof captured.update.updated_at).toBe('string');
  });

  it('returns ok:false without throwing when the read fails', async () => {
    const { client, captured } = mockSupabase({ readError: { message: 'boom' } });

    const result = await appendProcessNote(client, 'app-1', 'A milestone.');

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ message: 'boom' });
    expect(captured.update).toBeNull(); // must not attempt a write
  });

  it('returns ok:false without throwing when the write fails', async () => {
    const { client } = mockSupabase({ notes: 'x', writeError: { message: 'nope' } });

    const result = await appendProcessNote(client, 'app-1', 'A milestone.');

    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ message: 'nope' });
  });

  it('swallows unexpected exceptions from the client', async () => {
    const exploding = { from: () => { throw new Error('connection reset'); } };

    await expect(appendProcessNote(exploding, 'app-1', 'A milestone.')).resolves.toMatchObject({ ok: false });
  });

  it.each([
    ['no client', null, 'app-1', 'msg'],
    ['no applicationId', {}, null, 'msg'],
    ['no message', {}, 'app-1', ''],
  ])('returns ok:false for invalid arguments (%s)', async (_label, client, appId, message) => {
    const result = await appendProcessNote(client, appId, message);
    expect(result.ok).toBe(false);
  });

  it('never rejects, so an audit failure cannot fail the parent request', async () => {
    const { client } = mockSupabase({ readError: { message: 'boom' } });
    await expect(appendProcessNote(client, 'app-1', 'A milestone.')).resolves.toBeDefined();
  });
});
