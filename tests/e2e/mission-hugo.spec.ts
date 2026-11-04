/**
 * Parcours E2E de la phase 0 (docs/09) : arrivée dans la salle serveurs, dialogue
 * avec Hugo, mission « L'intranet est tombé » jouée au terminal, récompenses.
 */
import { expect, test, type Page } from '@playwright/test';
// Charge la déclaration de window.__TSSR_DEBUG__.
import type {} from '../../src/app/debug';

/** Attend que le jeu soit chargé et pilotable. */
async function openGame(page: Page): Promise<void> {
  await page.goto('/');
  // Écran titre : nouvelle partie avec un prénom.
  await page.getByRole('button', { name: 'Nouvelle partie' }).click();
  await page.getByLabel('Comment t’appelles-tu ?').fill('Alex');
  await page.getByRole('button', { name: 'Commencer le stage' }).click();
  await expect(page.getByTestId('game-canvas').locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__TSSR_DEBUG__ !== undefined);
}

/** Fait défiler le dialogue jusqu'à ce que `until` soit visible ou que la boîte disparaisse. */
async function advanceDialogue(page: Page, until?: () => Promise<boolean>): Promise<void> {
  const box = page.getByRole('region', { name: 'Dialogue' });
  for (let i = 0; i < 12; i++) {
    if (until && (await until())) return;
    if (!(await box.isVisible())) return;
    await box.click();
    await page.waitForTimeout(150);
  }
}

test('affiche le monde et le HUD de départ', async ({ page }) => {
  await openGame(page);

  await expect(page.getByText('Stagiaire')).toBeVisible();
  await expect(page.getByText('0 / 300 XP')).toBeVisible();
});

test("joue la mission d'Hugo de bout en bout", async ({ page }) => {
  await openGame(page);
  // Le chapitre 4 est supposé fait : Hugo propose alors la panne de l'intranet.
  await page.evaluate(() => {
    window.__TSSR_DEBUG__?.completeMissions([
      'linux.decouverte',
      'linux.connexion',
      'linux.aide',
      'linux.arborescence',
      'linux.fichiers',
      'linux.regex',
      'linux.recherche',
      'linux.vim',
      'linux.processus',
      'linux.archives',
      'linux.epreuve',
    ]);
  });

  // Le joueur se place sous Hugo et lui parle avec la touche E.
  await page.evaluate(() =>
    window.__TSSR_DEBUG__?.teleport('salle-serveurs', 32 * 16 + 8, 13 * 16 - 3),
  );
  await page.waitForTimeout(600);
  await expect(page.getByRole('button', { name: 'E Parler à Hugo' })).toBeVisible();
  await page.keyboard.press('e');
  const dialogue = page.getByRole('region', { name: 'Dialogue' });
  await expect(dialogue).toContainText('Hugo');

  const confident = page.getByRole('button', { name: 'Non, je gère' });
  await advanceDialogue(page, () => confident.isVisible());
  await confident.click();
  await advanceDialogue(page);

  // Mission au terminal : les objectifs se cochent au fil des commandes.
  const mission = page.getByRole('dialog', { name: "Ticket #2046 · L'intranet est tombé" });
  await expect(mission).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Commande' });
  await input.fill('systemctl status apache2');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Sortie du terminal' })).toContainText(
    'No space left on device',
  );
  await expect(
    mission.locator('li[data-done="true"]', { hasText: "Consulter l'état du service apache2" }),
  ).toBeVisible();

  await input.fill('df -h');
  await input.press('Enter');
  await input.fill('rm /var/log/debug.log');
  await input.press('Enter');
  await expect(page.getByRole('log', { name: 'Sortie du terminal' })).toContainText(
    'Permission non accordée',
  );
  await input.fill('sudo rm /var/log/debug.log');
  await input.press('Enter');
  await input.fill('sudo systemctl restart apache2');
  await input.press('Enter');
  await expect(mission.getByText('Tous les objectifs sont atteints.')).toBeVisible();
  await mission.getByRole('button', { name: 'Continuer' }).click();

  // Question de prévention.
  await mission.getByLabel('Supprimer /var/log chaque matin').check();
  await mission.getByRole('button', { name: 'Valider' }).click();
  await expect(mission).toContainText('Tu perdrais les journaux');
  await mission.getByLabel('Configurer logrotate et une alerte de supervision à 80 %').check();
  await mission.getByRole('button', { name: 'Valider' }).click();
  await mission.getByRole('button', { name: 'Terminer la mission' }).click();

  // Débriefing et récompenses.
  await expect(mission).toBeHidden();
  await expect(dialogue).toContainText('grand classique');
  await expect(page.getByText(/Mission terminée : \+\d+ XP/)).toBeVisible();
  const state = await page.evaluate(() => {
    const s = window.__TSSR_DEBUG__?.state();
    return {
      xp: s?.progression.xp,
      linux: s?.progression.skills.linux,
      done: Object.keys(s?.progress.completedMissions ?? {}).includes('linux-admin.intranet-down'),
    };
  });
  // Deux étapes avec une erreur chacune (rm sans sudo, mauvaise option) : 20 + 20, + 150 de fin.
  expect(state).toEqual({ xp: 20 + 20 + 150, linux: 12, done: true });
  await advanceDialogue(page);
  await expect(page.getByText('190 / 300 XP')).toBeVisible();
});
