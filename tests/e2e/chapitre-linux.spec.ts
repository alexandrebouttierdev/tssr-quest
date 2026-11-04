/**
 * Parcours E2E du début du chapitre 4 : Hugo propose « Pourquoi Linux ? », le joueur
 * répond aux trois questions et reçoit la fiche.
 */
import { expect, test } from '@playwright/test';
// Charge la déclaration de window.__TSSR_DEBUG__.
import type {} from '../../src/app/debug';

test('joue la première mission du chapitre 4', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await page.getByLabel('Comment t’appelles-tu ?').fill('Alex');
  await page.getByRole('button', { name: 'Commencer le stage' }).click();
  await page.waitForFunction(() => window.__TSSR_DEBUG__ !== undefined);

  await page.evaluate(() => window.__TSSR_DEBUG__?.interact('hugo'));
  const dialogue = page.getByRole('region', { name: 'Dialogue' });
  await expect(dialogue).toContainText('Linux');
  for (let i = 0; i < 6 && (await dialogue.isVisible()); i++) {
    await dialogue.click();
    await page.waitForTimeout(150);
  }

  const mission = page.getByRole('dialog', { name: /Pourquoi Linux/ });
  await expect(mission).toBeVisible();
  await mission
    .getByLabel("On peut l'utiliser, étudier son code, le modifier et le redistribuer")
    .check();
  await mission.getByRole('button', { name: 'Valider' }).click();
  await mission.getByRole('button', { name: 'Continuer' }).click();
  await mission.getByLabel(/^Des distributions/).check();
  await mission.getByRole('button', { name: 'Valider' }).click();
  await mission.getByRole('button', { name: 'Continuer' }).click();
  await mission.getByLabel(/^Une version stable/).check();
  await mission.getByLabel(/^Pas de coût de licence/).check();
  await mission.getByLabel(/^Une installation légère/).check();
  await mission.getByRole('button', { name: 'Valider' }).click();
  await mission.getByRole('button', { name: 'Terminer la mission' }).click();

  await expect(mission).toBeHidden();
  await expect(page.getByText(/Mission terminée : \+\d+ XP/)).toBeVisible();
  const done = await page.evaluate(
    () =>
      window.__TSSR_DEBUG__?.state().progress.completedMissions['linux.decouverte'] !== undefined,
  );
  expect(done).toBe(true);
});
