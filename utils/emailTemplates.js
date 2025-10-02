const fs = require('fs');
const path = require('path');

function renderTemplate(templateName, data) {
  const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
  
  let html = fs.readFileSync(templatePath, 'utf8');
  
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    html = html.replace(regex, value || '');
  }
  
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
  
  return { html, text };
}

module.exports = { renderTemplate };
