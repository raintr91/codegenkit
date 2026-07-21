import fs from 'fs';
import path from 'path';

const files = [
  "adapters/nuxt4/codegen/runners/generate.mjs",
  "adapters/nextjs/codegen/runners/generate.mjs",
  "adapters/nextjs/contractgen/runners/generate.mjs",
  "adapters/nuxt4/codegen/runners/lib/read-spec.mjs",
  "adapters/nextjs/codegen/runners/lib/read-spec.mjs",
  "src/install/harness.ts",
  "src/install/init-wizard.ts",
  "test/uninstall.test.mjs",
  "test/init-wizard.test.mjs",
  "test/codegenkit.test.mjs",
  "README.md",
  "docs/INIT.md",
  "harness/fe/rules/team-flow-unit.mdc",
  "harness/fe/rules/team-flow-prototype.mdc",
  "harness/shared/rules/codegenkit-optional-integrations.mdc",
  "harness/fe/skills/unit/SKILL.md",
  "harness/fe/skills/wire/SKILL.md",
  "harness/fe/skills/prototype/SKILL.md",
  "harness/fe/skills/grill-prototype/SKILL.md",
  "harness/fe/skills/grill-unit/SKILL.md",
  "harness/fe/skills/model/SKILL.md",
  "harness/be/skills/grill-api/SKILL.md",
  "harness/be/skills/api/SKILL.md",
  "adapters/nuxt4/unitgen/runners/README.md",
  "adapters/nextjs/unitgen/runners/README.md",
  "TODO-spec-paths-update.md"
];

const replacements = [
  { from: /DOCS_HUB_ROOT/g, to: "DOCSKIT_ROOT" },
  { from: /HUBDOCS_ROOT/g, to: "DOCSKIT_ROOT" },
  { from: /docs-hub/g, to: "docskit" },
  { from: /hubdocs/g, to: "docskit" },
  { from: /Hubdocs/g, to: "Docskit" },
  { from: /\.hubdocs/g, to: ".docskit" }
];

files.forEach(file => {
  const filePath = path.resolve('/home/vutv/workspace/codegenkit', file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  replacements.forEach(r => {
    if (content.match(r.from)) {
      content = content.replace(r.from, r.to);
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${file}`);
  }
});
