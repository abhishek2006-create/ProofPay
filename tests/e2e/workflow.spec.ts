import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
const password = 'Browser-Only-Password-2026!';
async function register(page: Page, email: string, name: string, role: string) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('I am a').selectOption(role);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole('heading', { name: 'Your projects.' })).toBeVisible();
}
test('full browser workflow: account → agreement → evidence → revisions → acceptance', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const freelancerContext = await browser.newContext();
  const freelancer = await freelancerContext.newPage();
  const stamp = Date.now();
  const clientEmail = `browser-client-${stamp}@example.test`,
    freelancerEmail = `browser-freelancer-${stamp}@example.test`;
  await register(freelancer, freelancerEmail, 'Jamie Browser Test', 'FREELANCER');
  await register(page, clientEmail, 'Alex Browser Test', 'CLIENT');
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await page.getByLabel('Project title').fill('Browser verified project');
  await page.getByLabel('Project scope').fill('End-to-end acceptance workflow test.');
  await page.getByLabel('Freelancer email').fill(freelancerEmail);
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByRole('button', { name: /Browser verified project/ }).click();
  await page.getByLabel('Requirements document', { exact: true }).setInputFiles({
    name: 'browser-scope.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('Homepage must contain the agreed heading Design for a brighter web.'),
  });
  await page.getByRole('checkbox', { name: /I authorize parsing this document/ }).check();
  await page.getByRole('button', { name: 'Upload requirements document', exact: true }).click();
  await expect(page.getByRole('button', { name: /browser-scope.md/ })).toBeVisible();
  await page.getByLabel('Search requirements documents').fill('Homepage');
  await page.getByRole('button', { name: 'Retrieve requirements', exact: true }).click();
  await expect(page.getByText(/Retrieval: LEXICAL_FALLBACK/)).toBeVisible();
  await page.getByRole('button', { name: 'New milestone' }).click();
  await page.getByLabel('Milestone title').fill('Homepage artifact');
  await page
    .getByLabel('Deliverables', { exact: true })
    .fill('Deliver the agreed homepage content artifact.');
  await page.getByLabel('Amount', { exact: true }).fill('450.00');
  await page.getByLabel('Due date').fill('2026-11-10');
  await page.getByLabel('Description', { exact: true }).fill('Homepage contains agreed heading');
  await page
    .getByRole('combobox', { name: 'Verification', exact: true })
    .selectOption('TEXT_CONTAINS');
  await page.getByLabel('Expected value').fill('Design for a brighter web');
  await page.getByLabel('Required evidence').fill('Homepage text artifact');
  await page.getByRole('button', { name: 'Save & continue' }).click();
  await page.getByRole('button', { name: /Homepage artifact/ }).click();
  await page.getByRole('button', { name: 'Review & agree' }).click();
  await page.getByRole('dialog').getByRole('checkbox').last().check();
  await page.getByRole('button', { name: 'Confirm agreement' }).click();
  await freelancer.reload();
  await freelancer.getByRole('button', { name: /Browser verified project/ }).click();
  await freelancer.getByRole('button', { name: /Homepage artifact/ }).click();
  await freelancer.getByRole('button', { name: 'Review & agree' }).click();
  await freelancer.getByRole('dialog').getByRole('checkbox').last().check();
  await freelancer.getByRole('button', { name: 'Confirm agreement' }).click();
  await expect(
    freelancer.getByRole('button', { name: 'Submit evidence', exact: true }),
  ).toBeVisible();
  await freelancer.getByRole('button', { name: 'Submit evidence', exact: true }).click();
  await freelancer
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles(path.resolve('tests/fixtures/incomplete-homepage.txt'));
  await freelancer
    .getByRole('textbox', { name: 'Submission notes', exact: true })
    .fill('Incomplete submission for a real failed check.');
  await freelancer.getByRole('dialog').getByRole('checkbox').last().check();
  await freelancer
    .getByRole('dialog')
    .getByRole('button', { name: 'Submit evidence', exact: true })
    .click();
  await freelancer.getByRole('button', { name: 'Run evidence checks' }).click();
  await expect(
    freelancer.getByText('× Failed', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Browser verified project/ }).click();
  await page.getByRole('button', { name: /Homepage artifact/ }).click();
  await page.getByRole('button', { name: 'Request revisions', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Revision instructions', exact: true })
    .fill('Please include the agreed homepage heading.');
  await page.getByRole('dialog').getByRole('checkbox').last().check();
  await page.getByRole('button', { name: 'Send revision request' }).click();
  await freelancer.reload();
  await freelancer.getByRole('button', { name: /Browser verified project/ }).click();
  await freelancer.getByRole('button', { name: /Homepage artifact/ }).click();
  await freelancer.getByRole('button', { name: 'Submit evidence', exact: true }).click();
  await freelancer
    .getByRole('dialog')
    .locator('input[type=file]')
    .setInputFiles(path.resolve('tests/fixtures/corrected-homepage.txt'));
  await freelancer
    .getByRole('textbox', { name: 'Submission notes', exact: true })
    .fill('Corrected heading supplied in text artifact.');
  await freelancer.getByRole('dialog').getByRole('checkbox').last().check();
  await freelancer
    .getByRole('dialog')
    .getByRole('button', { name: 'Submit evidence', exact: true })
    .click();
  await freelancer.getByRole('button', { name: 'Run evidence checks' }).click();
  await expect(
    freelancer.getByText('✓ Passed', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    freelancer.getByRole('heading', { name: 'Milestone evaluation report', exact: true }),
  ).toBeVisible();
  await expect(freelancer.getByText('10.00 / 10', { exact: true })).toBeVisible();
  await expect(
    freelancer
      .getByText('Test counts unavailable — unexecuted tests are not reported as passed.', {
        exact: true,
      })
      .filter({ visible: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Browser verified project/ }).click();
  await page.getByRole('button', { name: /Homepage artifact/ }).click();
  await page.getByRole('button', { name: 'Accept milestone', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Acceptance rationale', exact: true })
    .fill('Reviewed corrected content and accepted the artifact.');
  await page.getByRole('dialog').getByRole('checkbox').last().check();
  await page.getByRole('button', { name: 'Confirm acceptance' }).click();
  await expect(page.getByRole('button', { name: /Continue to PayPal sandbox/ })).toBeDisabled();
  await expect(
    page.getByText('Sandbox credentials are missing. Checkout is unavailable.'),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/review-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/review-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL('/');
  await context.close();
  await freelancerContext.close();
});
test('public pages, sign-in and access boundaries', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Great work deserves/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/landing-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('link', { name: /Get started/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/signin/);
  const denied = await request.get('/api/v1/projects');
  expect(denied.status()).toBe(401);
  const badOrigin = await request.post('/api/v1/register', {
    headers: { Origin: 'https://untrusted.example' },
    data: {},
  });
  expect(badOrigin.status()).toBe(403);
});
test('model settings show truthful placeholder state and no browser training controls', async ({
  page,
}) => {
  await page.goto('/signin');
  await page
    .getByRole('textbox', { name: 'Email address', exact: true })
    .fill('client@proofpay.example');
  await page.getByLabel('Password', { exact: true }).fill('Demo-Only-Password-2026!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verification model', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Test model with fictional evidence' }),
  ).toBeDisabled();
  await expect(
    page.getByText('Requirements RAG → repository inspection → scoring → report', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Pretrained model name is missing.', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/model-settings.png', fullPage: true });
});
