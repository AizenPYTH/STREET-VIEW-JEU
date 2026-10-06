import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/**
 * A full party: PHONE A (host) + PHONE B/C/D, each in its own browser context
 * (own localStorage = own device token), on an emulated iPhone viewport.
 */

interface Phone {
  name: string;
  context: BrowserContext;
  page: Page;
}

async function phone(browser: Browser, name: string): Promise<Phone> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(`[${name}] page error:`, error.message));
  return { name, context, page };
}

async function typeCode(page: Page, code: string): Promise<void> {
  for (const ch of code) await page.locator(`[data-key="${ch}"]`).click();
}

async function placeGuess(page: Page, x = 160, y = 200): Promise<void> {
  const map = page.getByTestId('guess-map');
  await expect(map).toBeVisible();
  await map.click({ position: { x, y } });
  const lock = page.getByTestId('lock-guess');
  await expect(lock).toBeEnabled();
  await lock.click();
  // The reveal starts the instant the last player locks, so either screen is fine.
  await expect(page.getByTestId('waiting').or(page.getByTestId('reveal'))).toBeVisible();
}

/** From the street view, open the map early and lock a guess. */
async function guessNow(page: Page, x?: number, y?: number): Promise<void> {
  await page.getByTestId('guess-now').click();
  await placeGuess(page, x, y);
}

test('four phones play a complete game, reconnect mid-round, then rematch', async ({ browser }, testInfo) => {
  const shot = async (p: Phone, label: string): Promise<void> => {
    await p.page.waitForTimeout(900); // let entrance animations settle
    await p.page.screenshot({ path: testInfo.outputPath(`${label}-${p.name}.png`) });
  };

  const host = await phone(browser, 'alex');
  const yass = await phone(browser, 'yass');
  const sam = await phone(browser, 'sam');
  const adam = await phone(browser, 'adam');
  const guests = [yass, sam, adam];

  // ── HOME → CRÉER ROOM → VILLE → LOBBY (host) ──
  await host.page.goto('/');
  await expect(host.page.getByTestId('home')).toBeVisible();
  await shot(host, '01-home');
  await host.page.getByTestId('create-room').click();
  await host.page.getByTestId('name-input').fill('Alex');
  await host.page.getByRole('radio', { name: '15 s' }).click();
  await host.page.getByLabel('Manches').getByRole('radio', { name: '3', exact: true }).click();
  await shot(host, '02-create');
  await host.page.getByTestId('create-submit').click();
  await expect(host.page.getByTestId('city-screen')).toBeVisible();
  await host.page.getByTestId('city-paris').click();
  await shot(host, '03-city');
  await host.page.getByTestId('open-room').click();
  await expect(host.page.getByTestId('lobby')).toBeVisible();
  const code = (await host.page.getByTestId('room-code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[A-Z2-9]{5}$/);
  await expect(host.page.getByTestId('player-Alex')).toContainText('Prêt');

  // ── Guests: REJOINDRE → CODE (keypad) → PSEUDO → LOBBY ──
  for (const [i, g] of guests.entries()) {
    await g.page.goto('/');
    await g.page.getByTestId('join-room').click();
    await expect(g.page.getByTestId('join-submit')).toBeDisabled();
    await typeCode(g.page, code);
    await expect(g.page.getByTestId('join-submit')).toBeEnabled();
    if (i === 0) await shot(g, '04-join');
    await g.page.getByTestId('join-submit').click();
    await g.page.getByTestId('name-input').fill(g.name[0]!.toUpperCase() + g.name.slice(1));
    await g.page.getByTestId('join-name-submit').click();
    await expect(g.page.getByTestId('lobby')).toBeVisible();
  }
  // A wrong code shows the error screen, not a toast.
  const stranger = await phone(browser, 'stranger');
  await stranger.page.goto('/join');
  await typeCode(stranger.page, 'ZZZZZ');
  await stranger.page.getByTestId('join-submit').click();
  await expect(stranger.page.getByTestId('error-roomNotFound')).toBeVisible();
  await stranger.context.close();

  await expect(host.page.getByTestId('player-count')).toHaveText('4/4 joueurs');
  for (const name of ['Alex', 'Yass', 'Sam', 'Adam']) await expect(host.page.getByTestId(`player-${name}`)).toContainText('Prêt');
  await expect(yass.page.getByTestId('waiting-host')).toBeDisabled();
  await shot(host, '05-lobby');
  await shot(yass, '05-lobby');

  // ── START → intro → round 1 ──
  const start = host.page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await expect(start).toHaveText(/Lancer la partie/);
  await start.click();
  const everyone = [host, ...guests];
  for (const p of everyone) await expect(p.page.getByTestId('round-intro')).toBeVisible({ timeout: 10_000 });
  await shot(host, '06-intro');
  for (const p of everyone) await expect(p.page.getByTestId('round-pill')).toContainText('Manche 1/3', { timeout: 15_000 });
  await expect(host.page.getByTestId('panorama')).toHaveAttribute('data-provider', 'mock');
  const panoHost = await host.page.getByTestId('panorama').getAttribute('data-pano');
  const panoYass = await yass.page.getByTestId('panorama').getAttribute('data-pano');
  expect(panoHost).toBe(panoYass); // same location for everyone
  await expect(host.page.getByTestId('timer')).toBeVisible();
  await shot(host, '07-round');

  // Round 1: everyone guesses early, Sam reloads the app while guessing (reconnection).
  await guessNow(host.page, 120, 160);
  await shot(host, '08-waiting');
  await guessNow(yass.page, 200, 240);
  await sam.page.reload();
  await expect(sam.page.getByTestId('round-pill')).toContainText('Manche 1/3', { timeout: 15_000 });
  await guessNow(sam.page, 90, 280);
  await expect(host.page.getByTestId('locked-count')).toHaveText('3/4 verrouillés');
  await guessNow(adam.page, 250, 120);

  // ── REVEAL (scripted) → SCORES ──
  for (const p of everyone) await expect(p.page.getByTestId('reveal')).toBeVisible({ timeout: 10_000 });
  await expect(host.page.getByTestId('truth-label')).toBeVisible();
  await expect(host.page.getByTestId('distances')).toBeVisible();
  await expect(host.page.getByTestId('distances').locator('.dist')).toHaveCount(4);
  await shot(host, '09-reveal');
  for (const p of everyone) await expect(p.page.getByTestId('scores')).toBeVisible({ timeout: 10_000 });
  await expect(host.page.getByTestId('score-rows').locator('.score-row')).toHaveCount(4);
  await expect(host.page.getByTestId('ranking')).toBeVisible();
  await expect(host.page.getByTestId('leaderboard').locator('.lb__row')).toHaveCount(4);
  await expect(host.page.getByTestId('lb-Alex')).toContainText(/LEADER|−/);
  await shot(host, '10-scores');
  await expect(yass.page.getByText("En attente de l'hôte…")).toBeVisible();
  await host.page.getByTestId('next-round').click();

  // Round 2: nobody guesses in time → auto guesses, round still resolves.
  for (const p of everyone) await expect(p.page.getByTestId('round-pill')).toContainText('Manche 2/3', { timeout: 15_000 });
  for (const p of everyone) await expect(p.page.getByTestId('guess')).toBeVisible({ timeout: 25_000 });
  await shot(host, '11-guess');
  for (const p of everyone) await expect(p.page.getByTestId('reveal')).toBeVisible({ timeout: 30_000 });
  await expect(host.page.getByTestId('distances').locator('.dist__auto')).toHaveCount(4);
  for (const p of everyone) await expect(p.page.getByTestId('scores')).toBeVisible({ timeout: 10_000 });
  await host.page.getByTestId('next-round').click();

  // Round 3 (doubled): only the host guesses; the rest lock during the guess phase.
  for (const p of everyone) await expect(p.page.getByTestId('round-pill')).toContainText('Manche 3/3', { timeout: 15_000 });
  await guessNow(host.page, 150, 150);
  for (const g of guests) await expect(g.page.getByTestId('guess')).toBeVisible({ timeout: 25_000 });
  await placeGuess(yass.page, 100, 100);
  await placeGuess(sam.page, 200, 300);
  await placeGuess(adam.page, 60, 300);

  // ── FINAL ──
  for (const p of everyone) await expect(p.page.getByTestId('scores')).toBeVisible({ timeout: 20_000 });
  await expect(host.page.getByTestId('next-round')).toHaveText(/Résultats finaux/);
  await host.page.getByTestId('next-round').click();
  for (const p of everyone) await expect(p.page.getByTestId('final')).toBeVisible({ timeout: 10_000 });
  await expect(host.page.getByTestId('winner-name')).toBeVisible();
  await expect(host.page.getByTestId('final-ranking')).toBeVisible();
  await expect(host.page.getByTestId('final-stats')).toBeVisible();
  await expect(host.page.getByTestId('rematch')).toBeVisible();
  await expect(yass.page.getByTestId('rematch')).toHaveCount(0);
  await shot(host, '12-final');
  await shot(adam, '12-final');

  // ── REVANCHE: same players, straight into a new game ──
  await host.page.getByTestId('rematch').click();
  for (const p of everyone) await expect(p.page.getByTestId('starting')).toContainText('Revanche demandée par Alex', { timeout: 10_000 });
  await shot(yass, '13-rematch');
  for (const p of everyone) await expect(p.page.getByTestId('round-pill')).toContainText('Manche 1/3', { timeout: 15_000 });

  // ⌂ leaves the room for one guest; the game continues for the others.
  await guessNow(adam.page);
  await guessNow(host.page);
  await guessNow(yass.page);
  await guessNow(sam.page);
  for (const p of everyone) await expect(p.page.getByTestId('reveal')).toBeVisible({ timeout: 10_000 });

  for (const p of everyone) await p.context.close();
});

test('settings, share link and lobby leave', async ({ browser }) => {
  const host = await phone(browser, 'host');
  await host.page.goto('/settings');
  await expect(host.page.getByTestId('settings-screen')).toBeVisible();
  await host.page.getByRole('switch', { name: 'Son' }).click();
  await expect(host.page.getByRole('switch', { name: 'Son' })).toHaveAttribute('aria-checked', 'false');

  await host.page.goto('/create');
  await host.page.getByTestId('name-input').fill('Farouq');
  await host.page.getByTestId('create-submit').click();
  await host.page.getByTestId('open-room').click();
  const code = (await host.page.getByTestId('room-code').textContent())?.trim() ?? '';

  // Invite link pre-fills the code.
  const friend = await phone(browser, 'friend');
  await friend.page.goto(`/join/${code}`);
  await expect(friend.page.getByTestId('join-submit')).toBeEnabled();
  await friend.page.getByTestId('join-submit').click();
  await friend.page.getByTestId('name-input').fill('Yanis');
  await friend.page.getByTestId('join-name-submit').click();
  await expect(friend.page.getByTestId('lobby')).toBeVisible();
  await expect(host.page.getByTestId('player-Yanis')).toBeVisible();

  // Host leaves → friend becomes host.
  await host.page.getByTestId('leave-room').click();
  await host.page.getByRole('button', { name: 'Quitter', exact: true }).click();
  await expect(host.page.getByTestId('home')).toBeVisible();
  await expect(friend.page.getByTestId('start-game')).toBeVisible();
  await expect(friend.page.getByTestId('player-Yanis')).toContainText('hôte');

  // Reload keeps the seat.
  await friend.page.reload();
  await expect(friend.page.getByTestId('lobby')).toBeVisible();
  await expect(friend.page.getByTestId('player-Yanis')).toContainText('toi');

  await host.context.close();
  await friend.context.close();
});
