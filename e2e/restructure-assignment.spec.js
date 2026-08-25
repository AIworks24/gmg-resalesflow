/**
 * Regression tests for ClickUp 86d43hbwj — "Restructure Function App Assignment Issue".
 *
 * Restructuring a multi-community SETTLEMENT application (Correct Property) used to:
 *   1. delete and rebuild application_property_groups without re-running the settlement
 *      auto-assignment, dropping every group's assigned_to to NULL,
 *   2. fall back to the property's community manager (default_assignee_email) on the list,
 *      because /api/admin/applications never selected settlement_assignee_email, and
 *   3. leave applications.assigned_to pointing at the OLD primary property's assignee.
 *
 * The visible symptom was the list showing community managers while the detail view showed
 * the correct accounting user.
 *
 * NOTE: /api/admin/applications is Redis-cached for 2 minutes. These tests deliberately stay
 * on the same page after a correction so the realtime subscription's cache-bypassing refresh
 * repaints the list — reloading the page would re-serve the stale cached payload and the
 * assertions would pass against pre-restructure data.
 */

const { test, expect } = require('@playwright/test');
const {
  adminLogin,
  searchApplication,
  appRow,
  parentAssigneeCell,
  childAssigneeCell,
} = require('./helpers/adminLogin');
const {
  seedSettlementMcApplication,
  readAssignments,
  ACCOUNTING,
  OTHER_ACCOUNTING,
} = require('./helpers/fixture');

const APP_ID = Number(process.env.E2E_RESTRUCTURE_APP_ID || 563);

const OLD_PRIMARY = 'Unit Owners Association of Greenwich Walk Condominiums';
const NEW_PRIMARY = 'Greenwich Walk Homeowners Association, Inc.';
const SECONDARY = 'Foxcreek Owners Association, Inc.';

const CURTIS = 'Curtis Jackson'; // rizh.hrly@gmail.com, accounting
const MANUAL_ASSIGNEE = 'matt@aiworks-consulting.com'; // admin — matches no property default

/**
 * Drive Restructure → Correct Property, dropping the primary community in favour of
 * one of its linked communities. Fewer properties means no delta is owed, so the
 * single-button confirmation path applies.
 */
async function correctPrimaryProperty(page, applicationId) {
  await appRow(page, applicationId).getByRole('button', { name: 'View' }).click();
  await expect(page.getByRole('button', { name: 'Restructure Application' })).toBeVisible();

  await page.getByRole('button', { name: 'Restructure Application' }).click();
  await page.getByRole('button', { name: /^Correct Property/ }).click();

  await expect(page.getByText('Select the correct primary community:')).toBeVisible();
  await page.getByRole('button', { name: NEW_PRIMARY }).click();

  const confirm = page.getByRole('button', { name: 'Confirm Correction' });
  await expect(confirm).toBeVisible();
  await confirm.click();

  // Only the success snackbar proves the API actually applied the correction.
  await expect(page.getByText(`Primary corrected to "${NEW_PRIMARY}"`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Restructure Application' })).toBeHidden();
}

/** Close the detail modal — its close control is the icon button next to refresh. */
async function closeDetailModal(page) {
  await page.locator('button[title="Refresh application data"] + button').click();
}

test.describe('Restructure — settlement assignment', () => {
  test('list and detail agree on the accounting assignee after a restructure', async ({ page }) => {
    await seedSettlementMcApplication(APP_ID);

    await adminLogin(page);
    await searchApplication(page, APP_ID);
    await expect(appRow(page, APP_ID)).toContainText(OLD_PRIMARY);

    await correctPrimaryProperty(page, APP_ID);

    // Detail view: every rebuilt group resolves to the accounting user.
    await expect(
      page.locator('h4').filter({ hasText: NEW_PRIMARY }).filter({ hasText: 'Primary' })
    ).toBeVisible();

    const detailAssignees = await page
      .locator('label:text-is("Assigned to") + div select')
      .evaluateAll((els) => els.map((el) => el.options[el.selectedIndex]?.text?.trim() ?? ''));

    expect(detailAssignees).toHaveLength(2);
    for (const value of detailAssignees) {
      expect(value).toContain(CURTIS);
    }

    // List view must agree — this is what regressed.
    await closeDetailModal(page);
    await expect(appRow(page, APP_ID)).toContainText(NEW_PRIMARY, { timeout: 30000 });
    await expect(appRow(page, APP_ID)).not.toContainText(OLD_PRIMARY);

    await expect(parentAssigneeCell(page, APP_ID)).toHaveText(CURTIS);
    await expect(childAssigneeCell(page, SECONDARY)).toHaveText(CURTIS);

    // The rebuilt groups are persisted with the settlement assignee, not left NULL.
    const { app, groups } = await readAssignments(APP_ID);
    expect(app.assigned_to).toBe(ACCOUNTING);
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.assigned_to).toBe(ACCOUNTING);
    }
  });

  test('an auto-assigned application follows the new primary property', async ({ page }) => {
    // The old primary routes settlement work to a different accounting user, and the
    // application is assigned to exactly that — i.e. it was auto-assigned, never edited.
    await seedSettlementMcApplication(APP_ID, {
      appAssignee: OTHER_ACCOUNTING,
      primarySettlementEmail: OTHER_ACCOUNTING,
    });

    await adminLogin(page);
    await searchApplication(page, APP_ID);
    await correctPrimaryProperty(page, APP_ID);

    const { app, groups } = await readAssignments(APP_ID);
    expect(app.assigned_to).toBe(ACCOUNTING); // re-derived from the new primary
    for (const group of groups) {
      expect(group.assigned_to).toBe(ACCOUNTING);
    }
  });

  test('a manual assignment survives a restructure', async ({ page }) => {
    // assigned_to matches no property's derived assignee, so an admin must have set it.
    await seedSettlementMcApplication(APP_ID, { appAssignee: MANUAL_ASSIGNEE });

    await adminLogin(page);
    await searchApplication(page, APP_ID);
    await correctPrimaryProperty(page, APP_ID);

    const { app, groups } = await readAssignments(APP_ID);
    expect(app.assigned_to).toBe(MANUAL_ASSIGNEE); // left untouched

    // Group-level assignment still follows the property, as it always has.
    for (const group of groups) {
      expect(group.assigned_to).toBe(ACCOUNTING);
    }
  });
});
