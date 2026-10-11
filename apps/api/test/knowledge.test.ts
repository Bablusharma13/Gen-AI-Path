import { LlmService, ScriptedProvider } from '@genpath/ai-core/llm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AiInteractionModel } from '../src/db/models/ai.model';
import { KnowledgeChunkModel, KnowledgeDocumentModel } from '../src/db/models/knowledge.model';
import type { InlineJobQueue } from '../src/lib/jobs';
import { makePdf } from './fixtures/files';
import {
  createTestHarness,
  promote,
  registerClient,
  type TestClient,
  type TestHarness,
} from './helpers';

let h: TestHarness;
const provider = new ScriptedProvider();

const REFUND_POLICY = `# Refund policy

## Window
Customers can request a full refund within 14 days of purchase. After 14 days we offer store credit only.

## How to request
Email support with your order number. Refunds reach the original payment method in 5 to 7 business days.`;

const SALARY_BANDS = `# Salary bands (confidential)

Engineering level 3 salary band is 18 to 24 lakh per year. Bands are reviewed every April.`;

const OTHER_ORG_DOC = `# Laptop policy

Every new engineer receives a laptop with 32 GB RAM and a three year warranty.`;

beforeAll(async () => {
  h = await createTestHarness({ AI_DAILY_REQUEST_LIMIT: '50' }, (ctx) => ({
    ...ctx,
    llm: new LlmService({ provider, model: 'test-model', maxOutputTokens: 800, backoffMs: 0 }),
  }));
});

afterAll(async () => {
  await h.close();
});

beforeEach(() => {
  provider.requests.length = 0;
});

const drain = () => (h.ctx.jobs as InlineJobQueue).drain();

export function upload(
  client: TestClient,
  orgId: string,
  name: string,
  data: Buffer | string,
  fields: Record<string, string> = {},
  mime?: string,
) {
  let req = client.multipart(`/api/v1/orgs/${orgId}/documents`);
  for (const [k, v] of Object.entries(fields)) req = req.field(k, v);
  return req.attach('file', Buffer.isBuffer(data) ? data : Buffer.from(data), {
    filename: name,
    contentType: mime ?? 'text/markdown',
  });
}

async function orgWithAdmin(name: string) {
  const admin = await registerClient(h.app, { name: `${name} Admin` });
  await promote(admin.userId, 'instructor');
  const res = await admin.client.post('/api/v1/orgs', { name });
  expect(res.status).toBe(201);
  return { admin, orgId: res.body.data.id as string };
}

describe('organizations and membership', () => {
  it('only instructors and admins can create organizations', async () => {
    const student = await registerClient(h.app);
    expect((await student.client.post('/api/v1/orgs', { name: 'Nope' })).status).toBe(403);
    const { admin } = await orgWithAdmin('Acme Learning');
    const list = await admin.client.get('/api/v1/orgs');
    expect(list.body.data).toEqual([
      expect.objectContaining({ name: 'Acme Learning', role: 'admin', memberCount: 1 }),
    ]);
  });

  it('manages members and protects the last admin', async () => {
    const { admin, orgId } = await orgWithAdmin('Members Inc');
    const member = await registerClient(h.app, { name: 'Meera Member' });
    const added = await admin.client.post(`/api/v1/orgs/${orgId}/members`, {
      email: member.email,
      role: 'member',
    });
    expect(added.status).toBe(201);
    expect(
      (await admin.client.post(`/api/v1/orgs/${orgId}/members`, { email: member.email })).status,
    ).toBe(409);
    expect(
      (await admin.client.post(`/api/v1/orgs/${orgId}/members`, { email: 'nobody@example.com' }))
        .status,
    ).toBe(404);

    // Members cannot manage the organization.
    expect((await member.client.get(`/api/v1/orgs/${orgId}/members`)).status).toBe(403);
    expect(
      (await member.client.post(`/api/v1/orgs/${orgId}/members`, { email: 'x@example.com' }))
        .status,
    ).toBe(403);

    // The only admin cannot demote or remove themselves.
    expect(
      (
        await admin.client.patch(`/api/v1/orgs/${orgId}/members/${admin.userId}`, {
          role: 'member',
        })
      ).status,
    ).toBe(409);
    expect(
      (await admin.client.delete(`/api/v1/orgs/${orgId}/members/${admin.userId}`)).status,
    ).toBe(409);

    expect(
      (
        await admin.client.patch(`/api/v1/orgs/${orgId}/members/${member.userId}`, {
          role: 'admin',
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await admin.client.patch(`/api/v1/orgs/${orgId}/members/${admin.userId}`, {
          role: 'member',
        })
      ).status,
    ).toBe(204);
  });

  it('hides organizations from non-members with 404', async () => {
    const { orgId } = await orgWithAdmin('Private Co');
    const outsider = await registerClient(h.app);
    expect((await outsider.client.get(`/api/v1/orgs/${orgId}/documents`)).status).toBe(404);
    expect(
      (await outsider.client.post(`/api/v1/orgs/${orgId}/ask`, { question: 'refund window?' }))
        .status,
    ).toBe(404);
    expect((await outsider.client.get('/api/v1/orgs/not-an-id/documents')).status).toBe(400);
  });
});

describe('document ingestion', () => {
  it('validates uploads before storing anything', async () => {
    const { admin, orgId } = await orgWithAdmin('Upload Checks');
    expect(
      (await upload(admin.client, orgId, 'virus.exe', 'MZ', {}, 'application/octet-stream')).status,
    ).toBe(415);
    expect(
      (await upload(admin.client, orgId, 'fake.pdf', 'plain text', {}, 'application/pdf')).status,
    ).toBe(415);
    expect((await upload(admin.client, orgId, 'notes.md', '# hi', {}, 'image/png')).status).toBe(
      415,
    );
    expect(
      (await upload(admin.client, orgId, 'notes.md', '# hi', { visibility: 'everyone' })).status,
    ).toBe(400);
    expect(await KnowledgeDocumentModel.countDocuments({ orgId })).toBe(0);

    const member = await registerClient(h.app);
    await admin.client.post(`/api/v1/orgs/${orgId}/members`, { email: member.email });
    expect((await upload(member.client, orgId, 'notes.md', '# hi')).status).toBe(403);
  });

  it('indexes Markdown and PDF documents, and rejects duplicates', async () => {
    const { admin, orgId } = await orgWithAdmin('Index Co');
    const res = await upload(admin.client, orgId, 'refund-policy.md', REFUND_POLICY, {
      title: 'Refund policy',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'queued',
      fileType: 'md',
      title: 'Refund policy',
      visibility: 'members',
    });
    expect((await upload(admin.client, orgId, 'copy.md', REFUND_POLICY)).status).toBe(409);

    const pdf = await upload(
      admin.client,
      orgId,
      'handbook.pdf',
      makePdf(['Office hours are 10am to 6pm on weekdays.']),
      {},
      'application/pdf',
    );
    expect(pdf.status).toBe(201);
    await drain();

    const docs = await admin.client.get(`/api/v1/orgs/${orgId}/documents`);
    for (const d of docs.body.data) {
      expect(d.status, d.title).toBe('ready');
      expect(d.chunkCount).toBeGreaterThan(0);
      expect(d.embeddingModel).toBe('local-hash-v1');
    }
    const chunks = await KnowledgeChunkModel.find({ documentId: res.body.data.id }).lean();
    expect(chunks.every((c) => c.active && c.orgId.toString() === orgId)).toBe(true);
    expect(chunks.some((c) => c.headingPath.join('/') === 'Refund policy/Window')).toBe(true);
  });

  it('re-indexes by replacing chunks, and deleting removes them everywhere', async () => {
    const { admin, orgId } = await orgWithAdmin('Lifecycle Co');
    const res = await upload(admin.client, orgId, 'refund.md', REFUND_POLICY);
    const id = res.body.data.id as string;
    await drain();
    const before = await KnowledgeChunkModel.countDocuments({ documentId: id });

    expect((await admin.client.post(`/api/v1/orgs/${orgId}/documents/${id}/reindex`)).status).toBe(
      200,
    );
    await drain();
    const after = await KnowledgeChunkModel.find({ documentId: id }).lean();
    expect(after).toHaveLength(before);
    expect(new Set(after.map((c) => c.indexVersion))).toEqual(new Set([2]));

    expect((await admin.client.delete(`/api/v1/orgs/${orgId}/documents/${id}`)).status).toBe(204);
    expect(await KnowledgeChunkModel.countDocuments({ documentId: id })).toBe(0);
    expect(await KnowledgeDocumentModel.exists({ _id: id })).toBeNull();
    const ask = await admin.client.post(`/api/v1/orgs/${orgId}/ask`, {
      question: 'How long is the refund window?',
    });
    expect(ask.body.data).toMatchObject({ found: false, reason: 'not_found' });
  });

  it('marks unreadable documents as failed with a safe message', async () => {
    const { admin, orgId } = await orgWithAdmin('Broken Co');
    // Valid magic bytes but no extractable text.
    const res = await upload(admin.client, orgId, 'scan.pdf', makePdf([]), {}, 'application/pdf');
    expect(res.status).toBe(201);
    await drain();
    const doc = await KnowledgeDocumentModel.findById(res.body.data.id).lean();
    expect(doc?.status).toBe('failed');
    expect(doc?.error).toMatch(/No text found/);
    expect(await KnowledgeChunkModel.countDocuments({ documentId: res.body.data.id })).toBe(0);
  });
});

describe('grounded answers', () => {
  let orgA: string;
  let adminA: TestClient;
  let memberA: TestClient;
  let orgB: string;
  let adminB: TestClient;

  beforeAll(async () => {
    const a = await orgWithAdmin('Tenant A');
    orgA = a.orgId;
    adminA = a.admin.client;
    const member = await registerClient(h.app, { name: 'Member A' });
    await adminA.post(`/api/v1/orgs/${orgA}/members`, { email: member.email });
    memberA = member.client;
    await upload(adminA, orgA, 'refund.md', REFUND_POLICY, { title: 'Refund policy' });
    await upload(adminA, orgA, 'salaries.md', SALARY_BANDS, {
      title: 'Salary bands',
      visibility: 'admins',
    });

    const b = await orgWithAdmin('Tenant B');
    orgB = b.orgId;
    adminB = b.admin.client;
    await upload(adminB, orgB, 'laptops.md', OTHER_ORG_DOC, { title: 'Laptop policy' });
    await drain();
  });

  it('answers with validated citations and records usage without content', async () => {
    provider.push({
      kind: 'reply',
      text: 'You can get a full refund within 14 days of purchase [1]. Cash back is also offered [9].',
    });
    const res = await memberA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'How many days do I have to get a refund?',
    });
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data).toMatchObject({
      found: true,
      reason: 'answered',
      isMock: false,
      model: 'test-model',
      droppedCitations: [9],
    });
    expect(data.answer).toContain('[1]');
    expect(data.answer).not.toContain('[9]');
    expect(data.citations).toHaveLength(1);
    expect(data.citations[0]).toMatchObject({ n: 1, documentTitle: 'Refund policy' });
    expect(data.retrieval).toMatchObject({
      semantic: false,
      vectorStore: 'mongodb-local',
      embeddingModel: 'local-hash-v1',
    });

    // The question and sources reached the model as delimited data.
    const sent = provider.requests[0]!;
    expect(sent.messages[0]!.content).toMatch(/^<sources>\n<source id="1" title="Refund policy › /);
    expect(sent.system).toContain('NOT_FOUND');
    const record = await AiInteractionModel.findOne({ feature: 'rag' }).lean();
    expect(record).toMatchObject({ promptId: 'rag.answer', status: 'ok' });
    expect(JSON.stringify(record)).not.toContain('refund');
  });

  it('withholds answers with no valid citation and honours the model saying NOT_FOUND', async () => {
    provider.push({ kind: 'reply', text: 'Refunds are always available, trust me.' });
    const uncited = await memberA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'What is the refund window in days?',
    });
    expect(uncited.body.data).toMatchObject({
      found: false,
      reason: 'uncited',
      answer: null,
    });
    // The model's unsupported text is never shown, but the retrieved passages are, for reading.
    expect(JSON.stringify(uncited.body.data)).not.toContain('trust me');
    expect(uncited.body.data.citations[0]).toMatchObject({ n: 1, documentTitle: 'Refund policy' });

    provider.push({ kind: 'reply', text: 'NOT_FOUND' });
    const notFound = await memberA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'How do I request a refund by phone?',
    });
    expect(notFound.body.data).toMatchObject({
      found: false,
      reason: 'model_not_found',
      answer: null,
    });
    expect(notFound.body.data.citations.length).toBeGreaterThan(0);
  });

  it('skips the model entirely when nothing relevant is retrieved', async () => {
    const res = await memberA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'Which quantum chromodynamics textbook do you recommend?',
    });
    expect(res.body.data).toMatchObject({ found: false, reason: 'not_found', citations: [] });
    expect(provider.requests).toHaveLength(0);
  });

  it('never retrieves another tenant’s documents', async () => {
    // Tenant B asks about Tenant A's refund policy: nothing, and no model call.
    const cross = await adminB.post(`/api/v1/orgs/${orgB}/ask`, {
      question: 'How many days do I have to get a refund?',
    });
    expect(cross.body.data).toMatchObject({ found: false, reason: 'not_found' });
    expect(provider.requests).toHaveLength(0);

    // Even naming Tenant A's document id does not leak it.
    const aDoc = await KnowledgeDocumentModel.findOne({
      orgId: orgA,
      title: 'Refund policy',
    }).lean();
    const forged = await adminB.post(`/api/v1/orgs/${orgB}/ask`, {
      question: 'How many days do I have to get a refund?',
      documentIds: [aDoc!._id.toString()],
    });
    expect(forged.body.data.found).toBe(false);
    expect(
      (await adminB.delete(`/api/v1/orgs/${orgB}/documents/${aDoc!._id.toString()}`)).status,
    ).toBe(404);
    expect((await adminB.get(`/api/v1/orgs/${orgA}/diagnostics?q=refund`)).status).toBe(404);
  });

  it('applies document visibility: admin-only documents are invisible to members', async () => {
    const memberDocs = await memberA.get(`/api/v1/orgs/${orgA}/documents`);
    expect(memberDocs.body.data.map((d: { title: string }) => d.title)).toEqual(['Refund policy']);
    const memberAsk = await memberA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'What is the level 3 salary band?',
    });
    expect(
      memberAsk.body.data.citations.map((c: { documentTitle: string }) => c.documentTitle),
    ).not.toContain('Salary bands');

    provider.push({ kind: 'reply', text: 'The level 3 band is 18 to 24 lakh per year [1].' });
    const adminAsk = await adminA.post(`/api/v1/orgs/${orgA}/ask`, {
      question: 'What is the level 3 salary band?',
    });
    expect(adminAsk.body.data.citations[0].documentTitle).toBe('Salary bands');
  });

  it('shows retrieval diagnostics to org admins only', async () => {
    const diag = await adminA.get(`/api/v1/orgs/${orgA}/diagnostics?q=refund%20within%2014%20days`);
    expect(diag.status).toBe(200);
    expect(diag.body.data.results[0]).toMatchObject({
      documentTitle: 'Refund policy',
      passesThreshold: true,
    });
    expect(diag.body.data.results[0].keywordScore).toBeGreaterThan(0);
    expect((await memberA.get(`/api/v1/orgs/${orgA}/diagnostics?q=refund`)).status).toBe(403);
  });
});
