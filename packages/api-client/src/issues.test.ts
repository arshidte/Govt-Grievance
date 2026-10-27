import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IssueDetailDTO, NotificationDTO } from '@pg/types';
import { createApiClient, ApiClientError } from './client';

const BASE_URL = 'https://api.example.test';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const issueDetail: IssueDetailDTO = {
  id: 'i1',
  referenceNo: 'REF-1',
  title: 'Pothole',
  status: 'SUBMITTED',
  priority: 'MEDIUM',
  categoryId: 'c1',
  createdAt: '2026-01-01T00:00:00.000Z',
  description: 'A pothole',
  panchayatId: 'p1',
  wardId: 'w1',
  subcategoryId: null,
  onBehalfOf: false,
  timeline: [],
  attachment: null,
};

describe('createApiClient — issues', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('createIssue POSTs to /api/v1/issues with the JSON body and returns IssueDetailDTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const input = {
      title: 'Pothole',
      description: 'A pothole',
      categoryId: 'c1',
      panchayatId: 'p1',
      wardId: 'w1',
    };
    const result = await client.createIssue(input);

    expect(result).toEqual(issueDetail);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues`);
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(input));
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('createIssue sends an Idempotency-Key header when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const input = {
      title: 'Pothole',
      description: 'A pothole',
      categoryId: 'c1',
      panchayatId: 'p1',
      wardId: 'w1',
    };
    await client.createIssue(input, 'idem-key-123');

    const callArgs = fetchMock.mock.calls[0]!;
    const init = callArgs[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('idem-key-123');
  });

  it('createIssue omits the Idempotency-Key header when not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const input = {
      title: 'Pothole',
      description: 'A pothole',
      categoryId: 'c1',
      panchayatId: 'p1',
      wardId: 'w1',
    };
    await client.createIssue(input);

    const callArgs = fetchMock.mock.calls[0]!;
    const init = callArgs[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.has('Idempotency-Key')).toBe(false);
  });

  it('createOnBehalf POSTs to /api/v1/issues/on-behalf and returns the OnBehalfResult shape', async () => {
    const onBehalfResult = {
      referenceNo: 'REF-2',
      id: 'i2',
      status: 'SUBMITTED',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(onBehalfResult, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const input = {
      title: 'Pothole',
      description: 'A pothole',
      categoryId: 'c1',
      wardId: 'w1',
      citizenPhone: '+919876543210',
    };
    const result = await client.createOnBehalf(input, 'idem-key-456');

    expect(result).toEqual(onBehalfResult);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues/on-behalf`);
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('Idempotency-Key')).toBe('idem-key-456');
  });

  it('listIssues GETs /api/v1/issues with no query string when params are omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.listIssues();

    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('listIssues GETs /api/v1/issues?status=... when a status filter is given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.listIssues({ status: 'SUBMITTED' });

    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues?status=SUBMITTED`);
  });

  it('getIssue GETs /api/v1/issues/:id and returns IssueDetailDTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.getIssue('i1');

    expect(result).toEqual(issueDetail);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues/i1`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('getIssue encodes the id for the URL path', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    await client.getIssue('weird/id with space');

    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(
      `${BASE_URL}/api/v1/issues/${encodeURIComponent('weird/id with space')}`,
    );
  });

  it('transitionIssue PATCHes /api/v1/issues/:id/status with the body and returns IssueDetailDTO', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(issueDetail, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const input = { toStatus: 'IN_PROGRESS' as const, note: 'Working on it' };
    const result = await client.transitionIssue('i1', input);

    expect(result).toEqual(issueDetail);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues/i1/status`);
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(input));
  });

  it('uploadAttachment POSTs multipart/form-data to /api/v1/issues/:id/attachment without forcing JSON content-type', async () => {
    const attachment = {
      id: 'a1',
      mimeType: 'image/png',
      sizeBytes: 100,
      originalName: 'photo.png',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(attachment, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const file = new File(['abc'], 'photo.png', { type: 'image/png' });
    const result = await client.uploadAttachment('i1', file);

    expect(result).toEqual(attachment);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/issues/i1/attachment`);
    const init = callArgs[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).not.toBe('application/json');
  });

  it('a non-OK response with { error: { code, messageKey } } throws ApiClientError with the right code/status', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'issue_not_found', messageKey: 'issues.notFound' } }, 404),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });

    await expect(client.getIssue('nope')).rejects.toBeInstanceOf(ApiClientError);
    await expect(client.getIssue('nope')).rejects.toMatchObject({
      code: 'issue_not_found',
      messageKey: 'issues.notFound',
      status: 404,
    });
  });
});

describe('createApiClient — notifications', () => {
  const notification: NotificationDTO = {
    id: 'n1',
    type: 'issue.status_changed',
    issueId: 'i1',
    readAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('listNotifications GETs /api/v1/notifications', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([notification], 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.listNotifications();

    expect(result).toEqual([notification]);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/notifications`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('unreadCount GETs /api/v1/notifications/unread-count', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ count: 3 }, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.unreadCount();

    expect(result).toEqual({ count: 3 });
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/notifications/unread-count`);
    expect((callArgs[1] as RequestInit).method).toBe('GET');
  });

  it('markNotificationRead PATCHes /api/v1/notifications/:id/read', async () => {
    const readNotification: NotificationDTO = { ...notification, readAt: '2026-01-02T00:00:00.000Z' };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readNotification, 200));
    vi.stubGlobal('fetch', fetchMock);

    const client = createApiClient({ baseUrl: BASE_URL });
    const result = await client.markNotificationRead('n1');

    expect(result).toEqual(readNotification);
    const callArgs = fetchMock.mock.calls[0]!;
    expect(callArgs[0]).toBe(`${BASE_URL}/api/v1/notifications/n1/read`);
    expect((callArgs[1] as RequestInit).method).toBe('PATCH');
  });
});
