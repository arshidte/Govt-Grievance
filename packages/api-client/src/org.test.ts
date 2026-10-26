import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PanchayatDTO, WardDTO } from '@pg/types';
import { createApiClient } from './client';

const BASE_URL = 'https://api.example.test';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const panchayat: PanchayatDTO = {
  id: 'p1',
  code: 'PG-001',
  name: 'Example Panchayat',
  nameMl: 'ഉദാഹരണ പഞ്ചായത്ത്',
  status: 'active',
};

const ward: WardDTO = {
  id: 'w1',
  number: 1,
  name: 'Ward 1',
  nameMl: 'വാർഡ് 1',
  panchayatId: 'p1',
};

describe('createApiClient — org reads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getPanchayats GETs /api/v1/panchayats and returns PanchayatDTO[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([panchayat], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.getPanchayats();

    expect(result).toEqual([panchayat]);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/panchayats`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('getWards GETs /api/v1/panchayats/:id/wards and returns WardDTO[]', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([ward], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.getWards('p1');

    expect(result).toEqual([ward]);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/panchayats/p1/wards`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('getWards encodes the panchayat id for the URL path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([ward], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.getWards('weird/id with space');

    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(
      `${BASE_URL}/api/v1/panchayats/${encodeURIComponent('weird/id with space')}/wards`,
    );
  });
});
