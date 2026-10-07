// tests/playwright/helpers.js
async function setupPage(page) {
  await page.goto('http://localhost:8080');
  // Ajoute ici d'autres configurations si nécessaire
}

module.exports = { setupPage };
