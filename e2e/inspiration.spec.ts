import { test, expect } from '@playwright/test';

test.describe('Inspiration E2E Tests', () => {
  
  test('01 - Homepage loads with all sections', async ({ page }) => {
    await page.goto('/');
    
    // Header
    await expect(page.getByRole('heading', { name: /inspiration/i })).toBeVisible();
    await expect(page.getByText('Turn your Cursor conversations into ideas and insights')).toBeVisible();
    
    // Theme/Mode selection (v1) - check for theme selector or tool selection (backward compatibility)
    const themeHeading = page.getByRole('heading', { name: /theme/i });
    const toolHeading = page.getByRole('heading', { name: 'What do you want to do?' });
    await expect(themeHeading.or(toolHeading)).toBeVisible();
    
    // Check for either Theme/Mode selectors (v1) or tool buttons (v0)
    const ideasBtn = page.getByRole('button', { name: /idea/i }).or(page.getByRole('button', { name: 'Generate Ideas: Prototype & tool ideas worth building' }));
    const insightsBtn = page.getByRole('button', { name: /insight/i }).or(page.getByRole('button', { name: 'Generate Insights: LinkedIn posts to share learnings' }));
    await expect(ideasBtn.or(insightsBtn)).toBeVisible();
    
    // Presets
    await expect(page.getByRole('heading', { name: 'Time period & depth' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Today mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 14 days mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 30 days mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 90 days mode/i })).toBeVisible();
    
    // Bank section (v1: unified bank, v0: separate banks)
    const bankHeading = page.getByRole('heading', { name: /Your Bank/i }).or(page.getByRole('heading', { name: /Your Banks/i }));
    await expect(bankHeading).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/01-homepage.png', fullPage: true });
  });

  test('02 - Toggle between Ideas and Insights (v0/v1 compatible)', async ({ page }) => {
    await page.goto('/');
    
    // Try v1 Theme/Mode selectors first, fallback to v0 tool buttons
    const ideasBtn = page.getByRole('button', { name: /idea/i }).first();
    const insightsBtn = page.getByRole('button', { name: /insight/i }).first();
    
    // Check if buttons exist, if not try v0 format
    const ideasBtnV0 = page.getByRole('button', { name: 'Generate Ideas: Prototype & tool ideas worth building' });
    const insightsBtnV0 = page.getByRole('button', { name: 'Generate Insights: LinkedIn posts to share learnings' });
    
    const ideasButton = await ideasBtn.count() > 0 ? ideasBtn : ideasBtnV0;
    const insightsButton = await insightsBtn.count() > 0 ? insightsBtn : insightsBtnV0;
    
    // Click Insights
    await insightsButton.click();
    await page.screenshot({ path: 'e2e-results/02a-insights-selected.png', fullPage: true });
    
    // Generate button should say "Insight" or contain "Insight"
    await expect(page.locator('button.btn-primary')).toContainText(/insight/i);
    
    // Click Ideas back
    await ideasButton.click();
    await page.screenshot({ path: 'e2e-results/02b-ideas-selected.png', fullPage: true });
    
    // Generate button should say "Idea" or contain "Idea"
    await expect(page.locator('button.btn-primary')).toContainText(/idea/i);
  });

  test('03 - Preset modes update expected output', async ({ page }) => {
    await page.goto('/');
    
    // Click each preset and verify expected output changes
    const presets = [
      { name: /Today mode/i },
      { name: /Last 14 days mode/i },
      { name: /Last 30 days mode/i },
      { name: /Last 90 days mode/i },
    ];
    
    for (const preset of presets) {
      await page.getByRole('button', { name: preset.name }).click();
      // Verify Expected Output section is visible
      await expect(page.getByText('Expected Output')).toBeVisible();
      await expect(page.getByText('output file')).toBeVisible();
      // Either "candidate" or "candidates" depending on preset
      await expect(page.locator('text=/^candidate[s]?$/')).toBeVisible();
    }
    
    await page.screenshot({ path: 'e2e-results/03-presets.png', fullPage: true });
  });

  test('04 - Advanced settings toggle', async ({ page }) => {
    await page.goto('/');
    
    // Click advanced settings
    await page.getByRole('button', { name: /Advanced settings/i }).click();
    await page.waitForTimeout(500);
    
    // Should see sliders - check for range inputs
    await expect(page.locator('input[type="range"]').first()).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/04-advanced-settings.png', fullPage: true });
  });

  test('05 - Settings page navigation and sections', async ({ page }) => {
    await page.goto('/');
    
    // Click settings link
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL('/settings');
    
    await expect(page.getByRole('heading', { name: /Settings/i })).toBeVisible();
    await page.screenshot({ path: 'e2e-results/05a-settings-page.png', fullPage: true });
    
    // Check main content sections exist (using headings)
    await expect(page.getByRole('heading', { name: /Workspaces/i })).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/05b-settings-full.png', fullPage: true });
  });

  test('06 - Bank viewer (v0/v1 compatible)', async ({ page }) => {
    await page.goto('/');
    
    // Try v1 unified bank first, fallback to v0 separate banks
    const expandBtn = page.getByRole('button', { name: /Expand/i }).or(
      page.getByRole('button', { name: /Idea Bank:.*ideas.*Click to/ })
    );
    
    if (await expandBtn.count() > 0) {
      await expandBtn.first().click();
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'e2e-results/06a-bank-expanded.png', fullPage: true });
      
      // Check for export buttons (v1: Export .md, v0: Download/Copy)
      const exportBtn = page.getByRole('button', { name: /Export/i }).or(
        page.getByRole('button', { name: /Download/i })
      );
      await expect(exportBtn.first()).toBeVisible();
    } else {
      // v0: Try Idea Bank
      const ideaBankBtn = page.getByRole('button', { name: /Idea Bank:.*ideas.*Click to/ });
      if (await ideaBankBtn.count() > 0) {
        await ideaBankBtn.click();
        await page.waitForTimeout(500);
        await expect(page.getByRole('button', { name: /Download idea bank/i })).toBeVisible();
      }
    }
  });

  test('07 - Run History (v1)', async ({ page }) => {
    await page.goto('/');
    
    // Check for Run History section (v1 feature)
    const runHistoryHeading = page.getByRole('heading', { name: /Run History/i });
    if (await runHistoryHeading.count() > 0) {
      await expect(runHistoryHeading).toBeVisible();
      await page.screenshot({ path: 'e2e-results/07-run-history.png', fullPage: true });
    }
  });

  test('08 - API endpoints respond correctly', async ({ request }) => {
    // Test config API
    const configRes = await request.get('/api/config');
    expect(configRes.ok()).toBeTruthy();
    const config = await configRes.json();
    expect(config.success).toBeTruthy();
    expect(config.config).toHaveProperty('workspaces');
    
    // Test themes API (v1)
    const themesRes = await request.get('/api/themes');
    expect(themesRes.ok()).toBeTruthy();
    const themes = await themesRes.json();
    expect(themes.success).toBeTruthy();
    
    // Test items API (v1)
    const itemsRes = await request.get('/api/items');
    expect(itemsRes.ok()).toBeTruthy();
    const items = await itemsRes.json();
    expect(items.success).toBeTruthy();
    expect(items.stats).toBeDefined();
    
    // Test banks API - ideas (v0 legacy)
    const ideasRes = await request.get('/api/banks?type=idea');
    expect(ideasRes.ok()).toBeTruthy();
    const ideas = await ideasRes.json();
    expect(ideas.success).toBeTruthy();
    
    // Test banks API - insights (v0 legacy)
    const insightsRes = await request.get('/api/banks?type=insight');
    expect(insightsRes.ok()).toBeTruthy();
    const insights = await insightsRes.json();
    expect(insights.success).toBeTruthy();
  });

  test('09 - Responsive design - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    
    await page.screenshot({ path: 'e2e-results/09a-mobile-home.png', fullPage: true });
    
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL('/settings');
    await page.screenshot({ path: 'e2e-results/09b-mobile-settings.png', fullPage: true });
  });

  test('10 - Responsive design - tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    await page.screenshot({ path: 'e2e-results/10-tablet-home.png', fullPage: true });
  });

});
