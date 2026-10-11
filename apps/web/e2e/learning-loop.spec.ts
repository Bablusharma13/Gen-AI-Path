import { expect, test, type Page } from '@playwright/test';

const SCREENSHOTS = process.env.E2E_SCREENSHOTS;

/** Fails the test on uncaught page errors and console errors (CSP violations, hydration errors). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    // Failed requests are reported with their URL by the response listener below.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) {
      errors.push(`console: ${msg.text()}`);
    }
  });
  page.on('response', (res) => {
    if (res.status() >= 400)
      errors.push(`http ${res.status()}: ${res.request().method()} ${res.url()}`);
  });
  return errors;
}

async function shot(page: Page, name: string) {
  if (SCREENSHOTS) await page.screenshot({ path: `${SCREENSHOTS}/${name}.png`, fullPage: true });
}

test('register → onboarding → roadmap → lesson → quiz → labs → practice', async ({ page }) => {
  const errors = watchErrors(page);
  const email = `e2e-${Date.now()}@example.com`;

  // Register
  await page.goto('/register');
  await page.getByLabel('Name').fill('E2E Learner');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-42');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Onboarding (6 steps)
  await expect(page.getByRole('heading', { name: 'What do you want to become?' })).toBeVisible();
  await page.getByText('GenAI Application Engineer').first().click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Beginner', { exact: true }).click();
  await page.getByText('Web development').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('TypeScript', { exact: true }).click();
  // Primary language choice appears when more than one language is selected.
  await page.getByRole('group', { name: 'Primary language' }).getByText('TypeScript').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('1 hour').click();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByRole('heading', { name: 'Skip what you already know' })).toBeVisible();
  await shot(page, '01-onboarding-placement');
  await page.getByRole('button', { name: 'Create my roadmap' }).click();

  // Roadmap
  await expect(page.getByRole('heading', { name: 'Your learning path' })).toBeVisible();
  await expect(page.getByText('Recommended next').first()).toBeVisible();
  await shot(page, '02-roadmap');

  // Lesson: language switch changes explanations but never the code language
  await page.goto('/courses/python-foundations/variables-and-data-types');
  await expect(
    page.getByRole('heading', { level: 1, name: /Variables, data types aur strings/ }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'TypeScript', selected: true })).toBeVisible();
  await page.getByRole('radio', { name: 'English' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Variables, data types and strings' }),
  ).toBeVisible();
  await expect(page.getByRole('tab', { name: 'TypeScript', selected: true })).toBeVisible();
  await shot(page, '03-lesson');
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByText(/Lesson complete! \+20 XP/)).toBeVisible();

  // Quiz
  await page.goto('/assessments/quiz-py-variables-types');
  await page.getByText('float', { exact: true }).click();
  await page.getByText('It raises a ValueError').click();
  await page.getByRole('button', { name: 'Submit answers' }).click();
  await expect(page.getByText(/points · pass mark 70%/)).toBeVisible();
  await shot(page, '04-quiz-results');

  // Labs render and compute
  await page.goto('/labs/attention');
  await expect(page.getByText('Tokens become vectors')).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page.getByText('Queries, keys and values')).toBeVisible();
  await shot(page, '05-attention-lab');

  await page.goto('/labs/rag-pipeline');
  await expect(page.getByText('Ingest and extract text')).toBeVisible();
  await shot(page, '06-rag-lab');

  await page.goto('/labs/gradient-descent');
  await expect(page.getByText('Loss over training steps')).toBeVisible();
  await shot(page, '07-gd-lab');

  await page.goto('/labs/embeddings');
  await expect(page.getByText('Similarity matrix')).toBeVisible();
  await shot(page, '08-embeddings-lab');

  await page.goto('/labs/tokens');
  await expect(page.getByText('Characters per token')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Hindi' }).click();
  await shot(page, '09-tokens-lab');

  // Practice: real Python in the browser
  await page.goto('/practice/ex-py-build-prompt');
  await expect(page.getByRole('heading', { name: /Build a prompt/ })).toBeVisible();
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(
    page.getByText(/of 4 tests passed|raised an error before the tests ran/),
  ).toBeVisible({ timeout: 100_000 });
  await shot(page, '10-practice-starter');

  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await editor.pressSequentially(
    'def build_prompt(topic, max_words):\nwords = int(max_words)\nif words < 1:\nraise ValueError("bad")\n',
    { delay: 5 },
  );
  // CodeMirror auto-indents; dedent for the final return.
  await page.keyboard.press('Shift+Tab');
  await editor.pressSequentially('return f"Explain {topic.strip()} in at most {words} words."', {
    delay: 5,
  });
  await page.getByRole('button', { name: 'Run tests' }).click();
  await expect(page.getByText('4 of 4 tests passed')).toBeVisible({ timeout: 60_000 });
  await shot(page, '11-practice-passed');

  // Dashboard reflects everything
  await page.goto('/dashboard');
  await expect(page.getByText('Continue learning')).toBeVisible();
  await shot(page, '12-dashboard');

  expect(errors, errors.join('\n')).toEqual([]);
});
