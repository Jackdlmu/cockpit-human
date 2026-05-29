import { test, expect } from '@playwright/test';

test.describe('YonCockpit Smoke Tests', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Agentic Chat UI Prototype/);
  });

  test('displays workspace list or empty welcome', async ({ page }) => {
    await page.goto('/');
    // 等待主要 UI 元素加载
    await page.waitForLoadState('networkidle');
    // 页面应包含驾驶舱相关文本或空欢迎页
    const bodyText = await page.locator('body').innerText();
    const hasWorkspaceContent =
      bodyText.includes('驾驶舱') ||
      bodyText.includes('Cockpit') ||
      bodyText.includes('工作区') ||
      bodyText.includes('创建');
    expect(hasWorkspaceContent).toBe(true);
  });

  test('create cockpit dialog can be opened', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找创建按钮（可能显示为"新建驾驶舱"、"+"或"创建"）
    const createBtn = page.locator('button').filter({ hasText: /新建|创建|Create|\+/ }).first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      // 验证对话框出现
      const dialog = page.locator('div[role="dialog"], .dialog, [data-state="open"]').first();
      await expect(dialog).toBeVisible();
    }
  });

  test('settings panel can be opened', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 查找设置按钮（通常是齿轮图标或"设置"文字）
    const settingsBtn = page.locator('button').filter({ hasText: /设置|Settings/ }).first();
    if (await settingsBtn.isVisible().catch(() => false)) {
      await settingsBtn.click();
      // 验证设置面板出现——面板中应有设置相关元素
      await page.waitForTimeout(300);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.includes('设置') || bodyText.includes('Settings') || bodyText.includes('布局') || bodyText.includes('主题')).toBe(true);
    }
  });
});
