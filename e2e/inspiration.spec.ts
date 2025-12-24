import { test, expect } from '@playwright/test';

test.describe('Inspiration E2E Tests', () => {
  
  test('01 - Homepage loads with all sections', async ({ page }) => {
    await page.goto('/');
    
    // Header
    await expect(page.getByRole('heading', { name: /inspiration/i })).toBeVisible();
    await expect(page.getByText('Turn your Cursor conversations into ideas and insights')).toBeVisible();
    
    // Tool selection
    await expect(page.getByRole('heading', { name: 'What do you want to generate?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Ideas: Prototype & tool ideas worth building' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generate Insights: LinkedIn posts to share learnings' })).toBeVisible();
    
    // Presets
    await expect(page.getByRole('heading', { name: 'Time period & depth' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Today mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 14 days mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 30 days mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 90 days mode/i })).toBeVisible();
    
    // Bank section
    await expect(page.getByRole('heading', { name: /Your Bank/i })).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/01-homepage.png', fullPage: true });
  });

  test('02 - Toggle between Ideas and Insights', async ({ page }) => {
    await page.goto('/');
    
    // Get the tool selection buttons specifically
    const ideasBtn = page.getByRole('button', { name: 'Generate Ideas: Prototype & tool ideas worth building' });
    const insightsBtn = page.getByRole('button', { name: 'Generate Insights: LinkedIn posts to share learnings' });
    
    // Click Insights
    await insightsBtn.click();
    await page.screenshot({ path: 'e2e-results/02a-insights-selected.png', fullPage: true });
    
    // Generate button should say "Insight"
    await expect(page.locator('button.btn-primary')).toContainText('Insight');
    
    // Click Ideas back
    await ideasBtn.click();
    await page.screenshot({ path: 'e2e-results/02b-ideas-selected.png', fullPage: true });
    
    // Generate button should say "Idea"
    await expect(page.locator('button.btn-primary')).toContainText('Idea');
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

  test('06 - Bank viewer - Idea Bank', async ({ page }) => {
    await page.goto('/');
    
    // Click Idea Bank button - use exact aria-label pattern
    const ideaBankBtn = page.getByRole('button', { name: /Idea Bank:.*ideas.*Click to/ });
    await ideaBankBtn.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'e2e-results/06a-idea-bank-expanded.png', fullPage: true });
    
    // Check for export buttons
    await expect(page.getByRole('button', { name: /Download idea bank/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Copy idea bank/i })).toBeVisible();
    
    // Collapse - re-locate with updated aria-label
    await page.getByRole('button', { name: /Idea Bank:.*ideas.*Click to/ }).click();
    await page.waitForTimeout(300);
  });

  test('07 - Bank viewer - Insight Bank', async ({ page }) => {
    await page.goto('/');
    
    // Click Insight Bank button
    const insightBankBtn = page.getByRole('button', { name: /Insight Bank:.*insights.*Click to/ });
    await insightBankBtn.click();
    await page.waitForTimeout(500);
    
    await page.screenshot({ path: 'e2e-results/07-insight-bank-expanded.png', fullPage: true });
  });

  test('08 - API endpoints respond correctly', async ({ request }) => {
    // Test config API
    const configRes = await request.get('/api/config');
    expect(configRes.ok()).toBeTruthy();
    const config = await configRes.json();
    expect(config.success).toBeTruthy();
    expect(config.config).toHaveProperty('workspaces');
    
    // Test banks API - ideas
    const ideasRes = await request.get('/api/banks?type=idea');
    expect(ideasRes.ok()).toBeTruthy();
    const ideas = await ideasRes.json();
    expect(ideas.success).toBeTruthy();
    expect(ideas.stats).toBeDefined();
    
    // Test banks API - insights
    const insightsRes = await request.get('/api/banks?type=insight');
    expect(insightsRes.ok()).toBeTruthy();
    const insights = await insightsRes.json();
    expect(insights.success).toBeTruthy();
    expect(insights.stats).toBeDefined();
    
    // Test banks summary
    const summaryRes = await request.get('/api/banks');
    expect(summaryRes.ok()).toBeTruthy();
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
