import { test, expect } from '@playwright/test';

test('new player can create a wizard, duel, invent, forge, and the game persists offline', async ({ page, context }) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Block anything that is not the local server: the game must work fully offline.
  await context.route(/^(?!http:\/\/127\.0\.0\.1:4317)(?!data:)(?!blob:).*/, (route) => {
    external.push(route.request().url());
    return route.abort();
  });

  await page.goto('/');
  await page.fill('[data-testid=name-input]', 'Test Wizard');
  await page.click('[data-testid=begin]');
  await expect(page.getByTestId('nav-DUEL')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('money')).toHaveText('$250');

  // first duel (instant simulation) earns Dollars
  await page.getByText('Instant simulation').click();
  await page.click('[data-testid=start-duel]');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.banner')).toHaveText(/VICTORY|DEFEAT/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('money')).not.toHaveText('$250');

  // invent a component
  await page.click('[data-testid=nav-FORGE]');
  await page.click('[data-testid=mat-ember_moss]');
  await page.click('[data-testid=mat-chalk_rune]');
  await page.click('[data-testid=invent]');
  await expect(page.getByText('Fresh from the crucible')).toBeVisible();

  // research + forge a custom spell from the invented component
  await page.click('[data-testid=forge-tab-research]');
  await page.click('[data-testid="research-form:lance"]');
  await page.click('[data-testid=forge-tab-lab]');
  await page.click('[data-testid=slot-essence]');
  await page.locator('[data-testid^=comp-]').first().click();
  await page.getByRole('button', { name: 'Lance', exact: true }).click();
  await page.click('[data-testid=forge-spell]');
  await expect(page.getByText(/inscribed into your archive/)).toBeVisible();

  // watch it in a real (animated) duel for a few seconds
  await page.click('[data-testid=nav-DUEL]');
  await page.getByText('Instant simulation').click();
  await page.click('[data-testid=start-duel]');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByText('Skip to result').click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  const money = await page.getByTestId('money').textContent();

  // persistence across reload
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId('money')).toHaveText(money!, { timeout: 30000 });
  await page.click('[data-testid=nav-WIZARD]');
  await page.click('[data-testid=wizard-tab-spellbook]');
  await expect(page.locator('.spellcard')).toHaveCount(2);

  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
