/**
 * Shared helpers for admin-side e2e tests.
 *
 * Credentials come from TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD in .env.local,
 * which also points NEXT_PUBLIC_SUPABASE_URL at the test Supabase project.
 */

const { expect } = require('@playwright/test');

async function adminLogin(page) {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error('TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD must be set in .env.local');
  }

  await page.goto('/admin/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin/dashboard', { timeout: 60000 });
}

/**
 * The desktop table. The list also renders a mobile card view for the same rows,
 * so every row locator must be scoped here to stay unambiguous.
 */
function listTable(page) {
  return page.getByRole('table');
}

/**
 * /api/admin/applications is Redis-cached for 2 minutes. Fixtures are seeded out-of-band
 * through the service-role client, so no realtime event invalidates that cache and a fresh
 * page load would render pre-seed data. Re-request with bypassCache=true (which also
 * re-writes the cache) for both keys the list uses: the initial fetch has no search term,
 * the post-debounce one does.
 */
async function refreshApplicationsCache(page, applicationId) {
  await page.evaluate(async (id) => {
    const base = '/api/admin/applications?status=all&sortBy=submitted_at&sortOrder=desc';
    await fetch(`${base}&bypassCache=true`);
    await fetch(`${base}&search=${id}&bypassCache=true`);
  }, String(applicationId));
}

/**
 * Open the applications list filtered down to a single application id.
 *
 * Both cache defeats are needed: the pre-navigation bypass fetch refreshes the stored
 * payload, and "Refresh List" makes the mounted page refetch with bypassCache=true so it
 * cannot keep rendering a payload SWR already had in memory.
 */
async function searchApplication(page, applicationId) {
  await refreshApplicationsCache(page, applicationId);

  await page.goto('/admin/applications');
  const search = page.getByPlaceholder(/Search by property address/i);
  await search.waitFor({ state: 'visible', timeout: 60000 });
  await search.fill(String(applicationId));
  await expect(appRow(page, applicationId)).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Refresh List' }).click();
  await expect(appRow(page, applicationId)).toBeVisible({ timeout: 30000 });
}

/** The application's parent row in the desktop table. */
function appRow(page, applicationId) {
  return listTable(page)
    .locator('tbody tr')
    .filter({ hasText: `App ${applicationId}` })
    .first();
}

/**
 * The list's ASSIGNEE column (5th cell) for the application's parent row —
 * for a multi-community app this reflects the PRIMARY property group.
 */
function parentAssigneeCell(page, applicationId) {
  return appRow(page, applicationId).locator('td').nth(4);
}

/** The ASSIGNEE cell of the expanded child row for a given secondary property. */
function childAssigneeCell(page, propertyName) {
  return listTable(page)
    .locator('tbody tr')
    .filter({ hasText: 'Secondary Property' })
    .filter({ hasText: propertyName })
    .first()
    .locator('td')
    .nth(4);
}

module.exports = {
  adminLogin,
  refreshApplicationsCache,
  searchApplication,
  appRow,
  parentAssigneeCell,
  childAssigneeCell,
};
