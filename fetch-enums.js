#!/usr/bin/env node
// merge-enums.js
// Usage: node merge-enums.js
// Reads a preamble from docs/api-reference/enums_pre.mdx,
// fetches and parses all enums (with '///' block comments) from the three .proto files,
// and writes the combined MDX to docs/api-reference/enums.mdx.

const https = require("https");
const fs = require("fs");
const path = require("path");

// Paths
const PREAMBLE_PATH = path.resolve(
  __dirname,
  "docs/api-reference/enums_pre.mdx"
);
const OUTPUT_PATH = path.resolve(__dirname, "docs/api-reference/enums.mdx");

// Proto source URLs
const PROTO_URLS = [
  "https://raw.githubusercontent.com/QFEX-org/proto/main/common.proto",
  "https://raw.githubusercontent.com/QFEX-org/proto/main/market_data.proto",
  "https://raw.githubusercontent.com/QFEX-org/proto/main/port.proto",
];

// Fetch text over HTTPS
function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// Parse enums with '///' leading description blocks
function parseEnums(protoText) {
  const lines = protoText.split(/\r?\n/);
  const enums = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("enum ")) {
      const name = trimmed.split(/\s+/)[1];
      // Gather leading '///' description lines
      const descLines = [];
      let k = i - 1;
      while (k >= 0 && lines[k].trim().startsWith("///")) {
        descLines.unshift(lines[k].trim().slice(3).trim());
        k--;
      }
      const description = descLines.slice(1).join(" ");
      // Collect enum members
      const values = [];
      i++;
      while (i < lines.length && !lines[i].includes("}")) {
        const m = lines[i]
          .trim()
          .match(/^([A-Z0-9_]+)\s*=\s*(\d+)\s*;(?:\s*\/\/\s*(.*))?/);
        if (m) {
          const [, valName, valNum, inlineDesc] = m;
          values.push({
            name: valName,
            number: valNum,
            description: inlineDesc || "",
          });
        }
        i++;
      }
      enums.push({ name, description, values });
    }
  }
  return enums;
}

// Generate MDX sections for enums
function generateSections(enums) {
  return enums.map((e) => {
    const header = [`## ${e.name}`, ""];
    if (e.description) header.push(e.description, "");
    const table = [
      "| Name | Value | Description |",
      "| ---- | ----- | ----------- |",
      ...e.values.map(
        (v) => `| \`${v.name}\` | ${v.number} | ${v.description} |`
      ),
    ];
    return [...header, ...table].join("\n");
  });
}

(async () => {
  try {
    // Read preamble
    const preamble = fs.readFileSync(PREAMBLE_PATH, "utf8").trim();

    // Fetch and parse enums from all protos
    let allEnums = [];
    for (const url of PROTO_URLS) {
      const text = await fetchText(url);
      allEnums = allEnums.concat(parseEnums(text));
    }

    // Build output MDX
    const sections = generateSections(allEnums).join("\n\n");
    const output = `${preamble}\n\n${sections}\n`;

    // Write to file
    fs.writeFileSync(OUTPUT_PATH, output, "utf8");
    console.log(`✅ Written ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
