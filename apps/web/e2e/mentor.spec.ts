import { expect, test, type Page } from '@playwright/test';

/**
 * Requires the API to run with AI_PROVIDER=mock (answers are labelled as mock).
 * Skips itself otherwise, so it never depends on a paid provider.
 */
async function register(page: Page) {
  await page.goto('/register');
  await page.getByLabel('Name').fill('Mentor Tester');
  await page.getByLabel('Email').fill(`mentor-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-42');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'What do you want to become?' })).toBeVisible();
  // Finish onboarding quickly with defaults.
  await page.getByText('General AI Learning').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Beginner', { exact: true }).click();
  await page.getByText('No programming experience').click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('30 minutes').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Create my roadmap' }).click();
  await expect(page.getByRole('heading', { name: 'Your learning path' })).toBeVisible();
}

test('mentor streams answers, labels mock output and keeps history', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await register(page);

  const status = await page.request.get('/api/v1/ai/status');
  const body = (await status.json()) as { data: { isMock: boolean } };
  test.skip(!body.data.isMock, 'Run the API with AI_PROVIDER=mock for this test');
  void request;

  await page.goto('/mentor');
  await page.getByLabel('Message the AI Mentor').fill('What is an embedding?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Mock response — no AI model was called.')).toBeVisible();
  await expect(page.getByText('Mock AI — no model was called').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Helpful', exact: true })).toBeVisible();
  await expect(
    page.getByRole('complementary', { name: 'Conversations' }).getByText('What is an embedding?'),
  ).toBeVisible();
  if (process.env.E2E_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.E2E_SCREENSHOTS}/20-mentor.png` });

  // Reload: the conversation is persisted and reopens from the URL.
  await page.reload();
  await expect(page.getByText('What is an embedding?').last()).toBeVisible();

  // Lesson context chip from the lesson page.
  await page.goto('/mentor?lessonId=py-functions');
  await expect(page.getByText('Functions, parameters aur type hints')).toBeVisible();

  // AI hint on a practice exercise.
  await page.goto('/practice/ex-py-build-prompt');
  await page.getByRole('button', { name: 'Ask the mentor for a hint' }).click();
  await expect(page.getByText('AI mentor hint')).toBeVisible();
  await expect(page.getByText('Mock AI').first()).toBeVisible();

  expect(errors).toEqual([]);
});
