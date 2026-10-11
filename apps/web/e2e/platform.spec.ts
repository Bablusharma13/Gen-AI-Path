import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Projects, Career Center, Knowledge Base and Admin against a running stack. The account is
 * registered through the UI and then promoted with the real `create-admin` CLI. Run the API with
 * AI_PROVIDER=mock so knowledge-base answers come from the labelled mock provider.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const POLICY = `# Refund policy

## Window
Customers can request a full refund within 14 days of purchase. After 14 days we offer store credit only.

## How to request
Email support with your order number.`;

async function registerAndOnboard(page: Page, email: string) {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Platform Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-42');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'What do you want to become?' })).toBeVisible();
  await page.getByText('GenAI Application Engineer').first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Beginner', { exact: true }).click();
  await page.getByText('No programming experience').click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('30 minutes').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create my roadmap' }).click();
  await expect(page.getByRole('heading', { name: 'Your learning path' })).toBeVisible();
}

test('projects, career, knowledge base and admin', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes('/api/v1/'))
      errors.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  const shot = async (name: string) => {
    if (process.env.E2E_SCREENSHOTS)
      await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/${name}.png`, fullPage: true });
  };

  const email = `platform-${Date.now()}@example.com`;
  await registerAndOnboard(page, email);

  // ── Projects ────────────────────────────────────────────────────────────────
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Guided projects' })).toBeVisible();
  await page.getByRole('link', { name: 'Python API Assistant (CLI)' }).click();
  await expect(page.getByRole('heading', { name: 'Acceptance criteria' })).toBeVisible();
  // Content follows the learner's language (Hinglish by default), so locate by structure.
  await page
    .getByRole('complementary', { name: 'Project progress' })
    .getByRole('checkbox')
    .first()
    .check();
  await expect(page.getByText('Milestone done · +25 XP')).toBeVisible();
  await page.getByLabel('Repository URL').fill('https://github.com/example/ask-cli');
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByText('Awaiting review')).toBeVisible();
  await shot('30-project');

  // ── Career Center ───────────────────────────────────────────────────────────
  await page.goto('/career');
  await expect(page.getByText('Your checklist')).toBeVisible();
  await expect(page.getByText('1 submitted')).toBeVisible();
  const firstQuestion = page.getByRole('group', { name: 'How confident are you?' }).first();
  await firstQuestion.getByRole('button', { name: 'Confident' }).click();
  await expect(firstQuestion.getByRole('button', { name: 'Confident' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shot('31-career');

  // ── Promote with the real CLI, then use instructor/admin features ───────────
  execFileSync('pnpm', ['--filter', '@genpath/api', 'create-admin', '--', '--email', email], {
    cwd: REPO_ROOT,
    shell: process.platform === 'win32',
    stdio: 'pipe',
  });

  await page.goto('/knowledge');
  await page.getByLabel('Organization name').fill('E2E Learning Org');
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByText('you are an admin')).toBeVisible();

  await page.getByRole('tab', { name: /Documents/ }).click();
  await page.getByLabel('File').setInputFiles({
    name: 'refund-policy.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from(POLICY),
  });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('tab', { name: 'Ask' }).click();
  await page
    .getByLabel('Ask a question about your organization’s documents')
    .fill('How many days do customers have to request a refund?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Mock AI — no model was called')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByText('within 14 days of purchase').first()).toBeVisible();
  await shot('32-knowledge-answer');

  await page
    .getByLabel('Ask a question about your organization’s documents')
    .fill('Which telescope should I buy for astronomy?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Not found in your organization’s documents')).toBeVisible();

  await page.getByRole('tab', { name: 'Retrieval check' }).click();
  await page.getByLabel('Test query').fill('refund within 14 days');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByRole('cell', { name: /Refund policy/ }).first()).toBeVisible();
  await shot('33-retrieval-check');

  // ── Admin ───────────────────────────────────────────────────────────────────
  await page.goto('/admin');
  await expect(page.getByText('Accounts')).toBeVisible();
  await expect(page.getByText('Mock provider (development)')).toBeVisible();
  await shot('34-admin-overview');
  await page.getByRole('tab', { name: 'Users' }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole('tab', { name: 'AI usage' }).click();
  await expect(page.getByText('AI requests per day')).toBeVisible();
  await expect(page.getByText('rag.answer')).toBeVisible();
  await shot('35-admin-usage');
  await page.getByRole('tab', { name: 'Project reviews' }).click();
  await expect(page.getByText('https://github.com/example/ask-cli').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Audit log' }).click();
  await expect(page.getByText('knowledge.document_uploaded').first()).toBeVisible();

  expect(errors).toEqual([]);
});
