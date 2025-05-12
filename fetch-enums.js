#!/usr/bin/env node
// merge-enums.js
// Usage: node merge-enums.js
// Reads a preamble from docs/api-reference/enums_pre.mdx,
// fetches and parses all enums (with '///' block comments) from the three .proto files,
// and writes the combined MDX to docs/api-reference/enums.mdx, including links to each enum's definition line.

const https = require("https");
const fs = require("fs");
const path = require("path");

// Paths
const PREAMBLE_PATH = path.resolve(
  __dirname,
  "docs/api-reference/enums_pre.mdx"
);
const OUTPUT_PATH = path.resolve(__dirname, "docs/api-reference/enums.mdx");

// Proto file specifications with raw and repo URLs
const PROTO_SPECS = [
  {
    name: "common.proto",
    rawUrl:
      "https://raw.githubusercontent.com/QFEX-org/proto/main/common.proto",
    repoUrl: "https://github.com/QFEX-org/proto/blob/main/proto/common.proto",
  },
  {
    name: "market_data.proto",
    rawUrl:
      "https://raw.githubusercontent.com/QFEX-org/proto/main/market_data.proto",
    repoUrl:
      "https://github.com/QFEX-org/proto/blob/main/proto/market_data.proto",
  },
  {
    name: "port.proto",
    rawUrl: "https://raw.githubusercontent.com/QFEX-org/proto/main/port.proto",
    repoUrl: "https://github.com/QFEX-org/proto/blob/main/proto/port.proto",
  },
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

// Parse enums with '///' description blocks, capturing file and line number
function parseEnums(protoText, fileSpec) {
  const lines = protoText.split(/\r?\n/);
  const enums = [];

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("enum ")) {
      const name = trimmed.split(/\s+/)[1];
      // Gather leading '///' description lines
      const descLines = [];
      let k = idx - 1;
      while (k >= 0 && lines[k].trim().startsWith("///")) {
        descLines.unshift(lines[k].trim().slice(3).trim());
        k--;
      }
      const description = descLines.join(" ");
      // Parse enum members until closing '}'
      const values = [];
      for (let j = idx + 1; j < lines.length && !lines[j].includes("}"); j++) {
        const m = lines[j]
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
      }
      enums.push({
        name,
        description,
        values,
        file: fileSpec.name,
        line: idx + 1,
        repoUrl: fileSpec.repoUrl,
      });
    }
  });

  return enums;
}

// Generate MDX sections for enums, including file link
function generateSections(enums) {
  return enums.map((e) => {
    const header = [`## [${e.name}](${e.repoUrl}#L${e.line})`, ""];
    // Link to definition
    // const link = `${e.repoUrl}#L${e.line}`;
    // header.push(`<Note>[${e.name}](${e.repoUrl}#L${e.line})</Note>`, "");
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
    for (const spec of PROTO_SPECS) {
      const text = await fetchText(spec.rawUrl);
      allEnums = allEnums.concat(parseEnums(text, spec));
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
