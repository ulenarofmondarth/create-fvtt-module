import { expect, test as setup } from '@playwright/test';

import { joinAs, MODULE_ID, USERS, waitForReady, WORLD } from '../support/foundry';

/**
 * Take a freshly started Foundry server to a launched world with the module under test enabled.
 *
 * Every step is skipped when it has already happened, so the setup can be re-run against the same server. Locators
 * follow Foundry's own v14 templates (licence form, admin authentication, setup screen, world configuration).
 */
setup('prepare the Foundry world', async ({ page }) => {
  setup.setTimeout(300_000);

  await page.goto('/');

  // 1. End User License Agreement (first start of a new data directory only).
  if (new URL(page.url()).pathname.startsWith('/license')) {
    await page.getByLabel('I agree to these terms').check();
    await page.getByRole('button', { name: 'Agree' }).click();
  }

  await page.waitForURL(/\/(auth|setup|join|game)/);

  // 2. Administrator login.
  if (new URL(page.url()).pathname.startsWith('/auth')) {
    const adminKey = process.env.FOUNDRY_ADMIN_KEY;
    if (!adminKey) throw new Error('FOUNDRY_ADMIN_KEY must be set to log in to the Foundry setup screen');

    await page.locator('input[name="adminPassword"]').fill(adminKey);
    await page.getByRole('button', { name: 'Log In' }).click();
    await page.waitForURL(/\/(setup|join|game)/);
  }

  // 3. Create and launch the world (when the server is still on the setup screen).
  if (new URL(page.url()).pathname.startsWith('/setup')) {
    const worldTile = page.locator(`[data-package-id="${WORLD.id}"]`);

    if ((await worldTile.count()) === 0) {
      await page.getByRole('button', { name: 'Create World' }).click();
      const worldForm = page.locator('form:has(input[name="id"])');
      await worldForm.locator('input[name="title"]').fill(WORLD.title);
      await worldForm.locator('input[name="id"]').fill(WORLD.id);
      await worldForm.locator('select[name="system"]').selectOption(WORLD.system);
      await worldForm.locator('button[type="submit"]').click();
      await expect(worldTile).toBeVisible();
    }

    await worldTile.hover();
    await worldTile.locator('[data-action="worldLaunch"]').click();
    await page.waitForURL('**/join');
  }

  // 4. Enable the module (and any modules it requires) and create a player to test non-GM behaviour with.
  await joinAs(page, USERS.gm);

  const needsReload = await page.evaluate(
    async ({ moduleIds, playerName }) => {
      if (!game.ready) throw new Error('Foundry is not ready');

      if (!game.users.getName(playerName)) {
        await User.create({ name: playerName, role: CONST.USER_ROLES.PLAYER });
      }

      const configuration = game.settings.get('core', 'moduleConfiguration');
      if (moduleIds.every(id => configuration[id])) return false;

      // Changing this setting does not load the modules; the page must be reloaded afterwards.
      await game.settings.set('core', 'moduleConfiguration', {
        ...configuration,
        ...Object.fromEntries(moduleIds.map(id => [id, true])),
      });
      return true;
    },
    { moduleIds: [MODULE_ID], playerName: USERS.player },
  );

  if (needsReload) {
    await page.reload();
    await waitForReady(page);
  }

  const active = await page.evaluate(id => {
    const moduleUnderTest = game.modules?.get(id);
    return moduleUnderTest?.active ?? false;
  }, MODULE_ID);
  expect(active, `${MODULE_ID} should be active in the test world`).toBe(true);
});
