import { expect, test } from '../support/fixtures';
import { joinAs, MODULE_ID, USERS } from '../support/foundry';

for (const [role, userName] of Object.entries(USERS)) {
  test(`the module loads for a ${role}`, async ({ page }) => {
    await joinAs(page, userName);

    const active = await page.evaluate(id => {
      const moduleUnderTest = game.modules?.get(id);
      return moduleUnderTest?.active ?? false;
    }, MODULE_ID);

    expect(active).toBe(true);
  });
}
