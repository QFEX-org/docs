#!/usr/bin/env node
// merge-enums.js
// Usage: node merge-enums.js
// Reads the preamble from docs/api-reference/enums_pre.mdx,
// fetches and parses enums from common.proto, mds.proto, port.proto,
// then writes combined output to docs/api-reference/enums.mdx.

const https = require('https');
const fs = require('fs');
const path = require('path');

// Paths
const PREAMBLE_PATH = path.resolve(__dirname, 'docs/api-reference/enums_pre.mdx');
const OUTPUT_PATH   = path.resolve(__dirname, 'docs/api-reference/enums.mdx');

// Proto sources
const PROTO_FILES = [
  { url: 'https://raw.githubusercontent.com/QFEX-org/proto/main/common.proto' },
  { url: 'https://raw.githubusercontent.com/QFEX-org/proto/main/market_data.proto'    },
  { url: 'https://raw.githubusercontent.com/QFEX-org/proto/main/port.proto'   },
];

// Fetch a URL over HTTPS
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse enums from a proto file content
function parseEnums(protoText) {
  const enums = [];
  const enumRegex = /(?:\/\/[^\n]*\n\s*)*enum\s+(\w+)\s*\{([\s\S]*?)\}/gm;
  let match;
  while ((match = enumRegex.exec(protoText))) {
    const [full, name, body] = match;
    // Leading comments
    const lines = full.split(/\r?\n/);
    const leading = [];
    for (const l of lines) {
      if (l.trim().startsWith('//')) leading.push(l.trim().slice(2).trim());
      else if (l.includes(`enum ${name}`)) break;
    }
    const description = leading.join(' ');

    // Members
    const values = [];
    for (const line of body.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z0-9_]+)\s*=\s*(\d+)\s*;(?:\s*\/\/\s*(.*))?/);
      if (m) {
        const [, valName, valNum, inline] = m;
        let desc = inline || '';
        if (!desc) {
          // preceding comments not implemented here for brevity
        }
        values.push({ name: valName, number: valNum, description: desc });
      }
    }
    enums.push({ name, description, values });
  }
  return enums;
}

// Generate MDX table sections for enums
function generateEnumSections(enums) {
  return enums.map(e => {
    const header = [`## ${e.name}`, ''];
    if (e.description) header.push(e.description, '');
    const table = [
      '| Name | Value | Description |',
      '| ---- | ----- | ----------- |',
      ...e.values.map(v => `| \`${v.name}\` | ${v.number} | ${v.description} |`)
    ];
    return [...header, ...table].join('\n');
  });
}

(async () => {
  try {
    // Read preamble
    const preamble = fs.readFileSync(PREAMBLE_PATH, 'utf8').trim();

    // Fetch and parse enums
    let allEnums = [];
    for (const file of PROTO_FILES) {
      const text = await fetchText(file.url);
      allEnums = allEnums.concat(parseEnums(text));
    }

    // Build output
    const sections = generateEnumSections(allEnums).join('\n\n');
    const out = `${preamble}\n\n${sections}\n`;

    // Write enums.mdx
    fs.writeFileSync(OUTPUT_PATH, out, 'utf8');
    console.log(`✅ Written ${OUTPUT_PATH}`);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
})();
