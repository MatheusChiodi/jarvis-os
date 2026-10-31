import { test, expect } from '@playwright/test';

test.describe('Overlay Window', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForSelector('#root', { state: 'attached' });
  });

  test('should show floating button initially', async ({ page }) => {
    const floatingButton = page.locator('button:has-text("JARVIS-OS")').or(
      page.locator('button[aria-label="Open JARVIS-OS"]')
    );
    await expect(floatingButton).toBeVisible();
  });

  test('should open overlay when floating button clicked', async ({ page }) => {
    const floatingButton = page.locator('button[aria-label="Open JARVIS-OS"]');
    await floatingButton.click();

    // Overlay window should appear
    await expect(page.locator('text=JARVIS-OS')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Teams')).toBeVisible();
  });

  test('should close overlay when close button clicked', async ({ page }) => {
    const floatingButton = page.locator('button[aria-label="Open JARVIS-OS"]');
    await floatingButton.click();

    await expect(page.locator('text=JARVIS-OS')).toBeVisible();

    const closeButton = page.locator('button[aria-label="Close"]');
    await closeButton.click();

    // Floating button should be visible again
    await expect(floatingButton).toBeVisible({ timeout: 3000 });
  });

  test('should show teams sidebar', async ({ page }) => {
    const floatingButton = page.locator('button[aria-label="Open JARVIS-OS"]');
    await floatingButton.click();

    await expect(page.locator('text=Teams')).toBeVisible();
    await expect(page.locator('text=Default Team')).toBeVisible();
  });

  test('should switch views in main area', async ({ page }) => {
    const floatingButton = page.locator('button[aria-label="Open JARVIS-OS"]');
    await floatingButton.click();

    // Click Chat tab
    await page.locator('button:has-text("Chat")').click();
    await expect(page.locator('text=Welcome to JARVIS-OS')).toBeVisible();

    // Click Plan tab
    await page.locator('button:has-text("Plan")').click();
    await expect(page.locator('text=No active plan')).toBeVisible();

    // Click Memory tab
    await page.locator('button:has-text("Memory")').click();
    await expect(page.locator('text=Search memory')).toBeVisible();

    // Click Settings tab
    await page.locator('button:has-text("Settings")').click();
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('should toggle sidebar', async ({ page }) => {
    const floatingButton = page.locator('button[aria-label="Open JARVIS-OS"]');
    await floatingButton.click();

    // Sidebar should be visible
    await expect(page.locator('text=Teams')).toBeVisible();

    // Click collapse button
    await page.locator('button[aria-label="Collapse sidebar"]').click();

    // Sidebar should be hidden
    await expect(page.locator('text=Teams')).toBeHidden({ timeout: 1000 });

    // Click expand button
    await page.locator('button[aria-label="Expand sidebar"]').click();

    // Sidebar should be visible again
    await expect(page.locator('text=Teams')).toBeVisible();
  });
});

test.describe('Floating Button Hotkey', () => {
  test('should toggle overlay with keyboard shortcut', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#root', { state: 'attached' });

    // Press Cmd+Shift+J (Mac) or Ctrl+Shift+J (Windows/Linux)
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+J' : 'Control+Shift+J');

    await expect(page.locator('text=JARVIS-OS')).toBeVisible({ timeout: 3000 });

    // Press again to close
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+J' : 'Control+Shift+J');

    await expect(page.locator('button[aria-label="Open JARVIS-OS"]')).toBeVisible({ timeout: 2000 });
  });
});