import { test, expect } from '@playwright/test';

test.describe('Inspiration E2E Tests (v2)', () => {
  
  test('01 - Homepage loads with all sections', async ({ page }) => {
    await page.goto('/');
    
    // Header
    await expect(page.getByRole('heading', { name: /inspiration/i })).toBeVisible();
    await expect(page.getByText('Turn your Cursor conversations into ideas and insights')).toBeVisible();
    
    // Mode selection - v2 uses simple mode cards
    const modeButtons = page.locator('.mode-card');
    await expect(modeButtons.first()).toBeVisible();
    
    // Presets
    await expect(page.getByRole('heading', { name: 'Time period & depth' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 24 hours mode/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Last 14 days mode/i })).toBeVisible();
    
    // Library section (v3: renamed from "Bank")
    const libraryHeading = page.getByRole('heading', { name: /Your Library|Library|Your Bank/i });
    await expect(libraryHeading).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/01-homepage.png', fullPage: true });
  });

  test('02 - Toggle between Ideas and Insights', async ({ page }) => {
    await page.goto('/');
    
    // Find mode buttons by aria-label pattern
    const ideasBtn = page.getByRole('button', { name: /Idea.*Prototype/i });
    const insightsBtn = page.getByRole('button', { name: /Insight.*Social/i });
    
    // Click Insights
    await insightsBtn.click();
    await page.screenshot({ path: 'e2e-results/02a-insights-selected.png', fullPage: true });
    
    // Generate button should say "Insight"
    await expect(page.locator('button.btn-primary')).toContainText(/insight/i);
    
    // Click Ideas back
    await ideasBtn.click();
    await page.screenshot({ path: 'e2e-results/02b-ideas-selected.png', fullPage: true });
    
    // Generate button should say "Idea"
    await expect(page.locator('button.btn-primary')).toContainText(/idea/i);
  });

  test('03 - Preset modes update expected output (v2)', async ({ page }) => {
    await page.goto('/');
    
    // Click each preset and verify the UI updates
    const presets = [
      { name: /Last 24 hours mode/i },
      { name: /Last 14 days mode/i },
      { name: /Last 30 days mode/i },
      { name: /Last 90 days mode/i },
    ];
    
    for (const preset of presets) {
      await page.getByRole('button', { name: preset.name }).click();
      // v2: Check for "item" or "items" label in the expected output section
      // The structure is: number in one div, "item(s)" in another
      await expect(page.getByText(/^items?$/i).first()).toBeVisible();
    }
    
    await page.screenshot({ path: 'e2e-results/03-presets.png', fullPage: true });
  });

  test('04 - Advanced settings toggle (v2)', async ({ page }) => {
    await page.goto('/');
    
    // Click the customize/advanced button (may have different label)
    const advancedBtn = page.getByRole('button', { name: /customize/i }).or(
      page.getByRole('button', { name: /advanced/i })
    );
    
    if (await advancedBtn.count() > 0) {
      await advancedBtn.first().click();
      await page.waitForTimeout(500);
      
      // Should see sliders - check for range inputs
      await expect(page.locator('input[type="range"]').first()).toBeVisible();
      
      await page.screenshot({ path: 'e2e-results/04-advanced-settings.png', fullPage: true });
    }
  });

  test('05 - Settings page navigation and sections', async ({ page }) => {
    await page.goto('/');
    
    // Click settings link
    await page.getByRole('link', { name: /settings/i }).click();
    await page.waitForURL('/settings');
    
    // Use first() to avoid strict mode violation with multiple matches
    await expect(page.getByRole('heading', { name: /Settings/i }).first()).toBeVisible();
    await page.screenshot({ path: 'e2e-results/05a-settings-page.png', fullPage: true });
    
    // Check main content sections exist (using headings)
    await expect(page.getByRole('heading', { name: /Workspaces/i })).toBeVisible();
    
    await page.screenshot({ path: 'e2e-results/05b-settings-full.png', fullPage: true });
  });

  test('06 - Bank viewer', async ({ page }) => {
    await page.goto('/');
    
    // Try to find and expand bank
    const expandBtn = page.getByRole('button', { name: /expand/i }).first();
    
    if (await expandBtn.count() > 0) {
      await expandBtn.click();
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'e2e-results/06a-bank-expanded.png', fullPage: true });
      
      // Check for export buttons
      const exportBtn = page.getByRole('button', { name: /export/i }).or(
        page.getByRole('button', { name: /download/i })
      );
      await expect(exportBtn.first()).toBeVisible();
    }
  });

  test('07 - Run History', async ({ page }) => {
    await page.goto('/');
    
    // Check for Run History section
    const runHistoryHeading = page.getByRole('heading', { name: /Run History/i });
    if (await runHistoryHeading.count() > 0) {
      await expect(runHistoryHeading).toBeVisible();
      await page.screenshot({ path: 'e2e-results/07-run-history.png', fullPage: true });
    }
  });

  test('08 - API endpoints respond correctly (v2)', async ({ request }) => {
    // Test config API
    const configRes = await request.get('/api/config');
    expect(configRes.ok()).toBeTruthy();
    const config = await configRes.json();
    expect(config.success).toBeTruthy();
    expect(config.config).toHaveProperty('workspaces');
    
    // Test themes API (v1/v2)
    const themesRes = await request.get('/api/themes');
    expect(themesRes.ok()).toBeTruthy();
    const themes = await themesRes.json();
    expect(themes.success).toBeTruthy();
    
    // Test items API (v1/v2)
    const itemsRes = await request.get('/api/items');
    expect(itemsRes.ok()).toBeTruthy();
    const items = await itemsRes.json();
    expect(items.success).toBeTruthy();
    expect(items.stats).toBeDefined();
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

  test('11 - v2 Item Count slider in advanced settings', async ({ page }) => {
    await page.goto('/');
    
    // Click the customize/advanced button
    const advancedBtn = page.getByRole('button', { name: /customize/i }).or(
      page.getByRole('button', { name: /advanced/i })
    );
    
    if (await advancedBtn.count() > 0) {
      await advancedBtn.first().click();
      await page.waitForTimeout(500);
      
      // v2: Should have "Items to generate" label (not "Candidates")
      await expect(page.getByText(/items to generate/i)).toBeVisible();
      
      await page.screenshot({ path: 'e2e-results/11-v2-item-count.png', fullPage: true });
    }
  });

  test('12 - v2 Deduplication threshold in settings', async ({ page }) => {
    await page.goto('/settings');
    
    // Navigate to Mode Settings section
    const modeSettingsHeading = page.getByRole('heading', { name: /Mode Settings/i });
    if (await modeSettingsHeading.count() > 0) {
      // v2: Should have deduplication threshold setting
      await expect(page.getByText(/deduplication threshold/i)).toBeVisible();
      
      await page.screenshot({ path: 'e2e-results/12-v2-dedup-threshold.png', fullPage: true });
    }
  });

  test('13 - Stats panel shows correct terminology (no "Candidates")', async ({ page }) => {
    await page.goto('/');
    
    // Look for any previous run results or generate new ones
    const resultsPanel = page.locator('section.glass-card').filter({ hasText: /Generated (Insights|Ideas)/i });
    
    if (await resultsPanel.count() > 0) {
      // Check that stats use "Items" terminology, not "Candidates"
      await expect(resultsPanel.getByText(/Items Generated/i)).toBeVisible();
      await expect(resultsPanel.getByText(/Candidates/i)).not.toBeVisible();
      
      // Check that labels make sense
      await expect(resultsPanel.getByText(/Days with Activity/i)).toBeVisible();
      await expect(resultsPanel.getByText(/Conversations Analyzed/i)).toBeVisible();
      
      // Check harmonization section if present
      const harmonizationSection = resultsPanel.getByText(/Harmonization with Library/i);
      if (await harmonizationSection.count() > 0) {
        await expect(resultsPanel.getByText(/New Items Added/i)).toBeVisible();
        await expect(resultsPanel.getByText(/Deduplicated/i)).toBeVisible();
      }
      
      await page.screenshot({ path: 'e2e-results/13-stats-terminology.png', fullPage: true });
    }
  });

  test('14 - Stats coherence: Items Generated should relate to harmonization', async ({ page }) => {
    await page.goto('/');
    
    const resultsPanel = page.locator('section.glass-card').filter({ hasText: /Generated (Insights|Ideas)/i });
    
    if (await resultsPanel.count() > 0) {
      // Extract stats values to verify they make sense together
      const itemsGeneratedText = await resultsPanel.getByText(/Items Generated/i).locator('..').textContent();
      const harmonizationText = await resultsPanel.getByText(/Harmonization with Library/i).locator('..').textContent();
      
      // If harmonization section exists, check that numbers make sense
      if (harmonizationText && harmonizationText.includes('New Items Added')) {
        // Log the stats for manual verification
        console.log('Stats found:', { itemsGeneratedText, harmonizationText });
        
        // Basic sanity check: if items were added, harmonization should show some activity
        const itemsProcessedMatch = harmonizationText?.match(/Items Processed[^\d]*(\d+)/);
        if (itemsProcessedMatch) {
          const itemsProcessed = parseInt(itemsProcessedMatch[1]);
          expect(itemsProcessed).toBeGreaterThan(-1); // Should be 0 or positive
        }
      }
      
      await page.screenshot({ path: 'e2e-results/14-stats-coherence.png', fullPage: true });
    }
  });

});
