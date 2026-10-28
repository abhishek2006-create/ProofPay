import 'dotenv/config';
import { chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { db } from '../src/lib/db';
const base = process.env.PREVIEW_URL || 'http://localhost:3001';
const directory = '.data/previews/workspace';
async function login(page: Page, email: string, password: string) {
  await page.goto(`${base}/signin`);
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Your projects.', exact: true }).waitFor();
}
async function shot(page: Page, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: `${directory}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  if (dimensions.page > dimensions.viewport)
    throw new Error(`${name} overflows: ${JSON.stringify(dimensions)}`);
  console.log(`${name}: ${dimensions.viewport}px, no horizontal overflow`);
}
async function main() {
  await mkdir(directory, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await login(page, 'client@proofpay.example', 'Demo-Only-Password-2026!');
    await shot(page, 'dashboard-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, 'dashboard-mobile');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('.project-card').first().click();
    await page.getByRole('heading', { name: 'Requirements documents', exact: true }).waitFor();
    await shot(page, 'project-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await shot(page, 'project-mobile');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('heading', { name: 'Verification model', exact: true }).waitFor();
    await shot(page, 'settings-mobile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.waitForURL(base + '/');
    const user = await db.user.findFirst({
      where: { email: { startsWith: 'browser-client-' } },
      orderBy: { createdAt: 'desc' },
    });
    if (user) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await login(page, user.email, 'Browser-Only-Password-2026!');
      await page.getByRole('button', { name: /Browser verified project/ }).click();
      await page.getByRole('button', { name: /Homepage artifact/ }).click();
      await page
        .getByRole('heading', { name: 'Milestone evaluation report', exact: true })
        .waitFor();
      await shot(page, 'report-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await shot(page, 'report-mobile');
    }
  } finally {
    await browser.close();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
