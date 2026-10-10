const fs = require('fs');
const path = require('path');

const walk = dir => {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
        results.push(file);
      }
    }
  });
  return results;
};

const files = walk('web/src');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  const original = content;
  content = content
    .replace(/forest-800/g, 'brand-900')
    .replace(/forest-700/g, 'brand-700')
    .replace(/forest-100/g, 'brand-50')
    .replace(/forest-950/g, 'brand-950')
    .replace(/x9fd0a8/g, 'brand-200')
    .replace(/xdce7dc/g, 'brand-200')
    .replace(/x5d8369/g, 'brand-700')
    .replace(/xf0f5eb/g, 'surface-2')
    .replace(/xeef1ed/g, 'surface-2')
    .replace(/xfff8e8/g, 'surface-2')
    .replace(/xfdf1f1/g, 'danger-50');
  
  if (original !== content) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
  }
}
