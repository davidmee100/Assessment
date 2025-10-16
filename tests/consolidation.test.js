#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'Assessment Tool_151025_Maria Special (4) (1).html');
const html = fs.readFileSync(htmlPath, 'utf8');

function extractFunctionSource(name) {
  const needle = `function ${name}(`;
  const start = html.indexOf(needle);
  if (start === -1) {
    throw new Error(`Missing ${name} declaration`);
  }
  let depth = 0;
  let inString = null;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === '"' || ch === '\'' || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }
  throw new Error(`Could not extract full body for ${name}`);
}

function instantiateDeclaration(name, regex) {
  const match = html.match(regex);
  if (!match) throw new Error(`Could not extract ${name}`);
  const declaration = match[0];
  return (0, eval)(`(function(){ ${declaration}\n return ${name}; })()`);
}

function extractIifeBody(labelRegex) {
  const match = html.match(labelRegex);
  if (!match) throw new Error('Could not extract IIFE body');
  return match[1];
}

const normaliseSite = instantiateDeclaration('normaliseSite', /const normaliseSite = function\(name\) {[\s\S]*?};/);
const bucketCapability = instantiateDeclaration('bucketCapability', /function bucketCapability\(avg\) {[\s\S]*?}/);
const capabilityCollectorBody = extractIifeBody(/\/\/ Capability comments:[\s\S]*?\(function\(\) {([\s\S]*?)\}\)\(\);/);
const retentionCollectorBody = extractIifeBody(/\/\/ Retention comments:[\s\S]*?\(function\(\) {([\s\S]*?)\}\)\(\);/);
const gatherCapabilityComments = (0, eval)(`(function(){ return function(r, entry){${capabilityCollectorBody}\n}; })()`);
const gatherRetentionComments = (0, eval)(`(function(){ return function(r, entry){${retentionCollectorBody}\n}; })()`);
const aggregationBlockMatch = html.match(/const siteAgg = {};([\s\S]*?)renderConsolidatedTable\(\);/);
if (!aggregationBlockMatch) throw new Error('Could not extract aggregation block');
const runAggregation = new Function('allData', 'selectedFiles', 'bucketCapability', `let consolidatedData; const siteAgg = {};${aggregationBlockMatch[1]} return consolidatedData;`);

assert.strictEqual(normaliseSite('billingfors_pulp.csv'), 'Billingfors Pulp');
assert.strictEqual(normaliseSite('billingfors_pulp_and_paper.csv'), 'Billingfors Paper and Shared');
assert.strictEqual(normaliseSite('JONKOPING_upload.csv'), 'Jönköping');
assert.strictEqual(normaliseSite('OtherSite.csv'), 'OtherSite.csv');

const entry = { capComments: [], retComments: [] };
const sampleRow = {
  'Capability Comment': 'First note',
  'Capability Comments (Detailed)': 'Second note',
  'capability_comments-2024': 'Third note',
  'Retention comment': 'Keep|Hold',
  'Retention Comment (extra)': 'Hold'
};
gatherCapabilityComments(sampleRow, entry);
gatherRetentionComments(sampleRow, entry);
assert.deepStrictEqual(entry.capComments, ['First note\nSecond note\nThird note']);
assert.deepStrictEqual(entry.retComments, ['Keep\nHold\nHold']);

const files = [
  { name: 'Billingfors_pulp_and_paper.csv' },
  { name: 'jonkoping_upload.csv' }
];
const allData = [
  [
    {
      'Mill': '',
      'Role Area': 'Tech',
      'Criticality': '3',
      'Technical Knowledge': '4',
      'Experience': '3',
      'Crisis Management': '4',
      'Leadership/Communication': '2',
      'Safety': '4',
      'Capability Comment': 'Main note',
      'Capability Comments (Detailed)': 'Extra info',
      'capability_comments-2024': 'Addl piece',
      'Retention Comment': 'First comment',
      'Retention Comment (Detailed)': 'First comment',
      'Retention Risk': 'High'
    },
    {
      'Role Area': 'Tech',
      'Criticality': '2',
      'Technical Knowledge': '2',
      'Experience': '2',
      'Crisis Management': '2',
      'Leadership/Communication': '2',
      'Safety': '2',
      'Capability Comment': 'Main note',
      'Retention Comment': '  Second | comment  ',
      'Retention Risk': 'High'
    }
  ],
  [
    {
      'Site': '',
      'Role': 'Engineer',
      'Criticality': '4',
      'Tech': '3',
      'Exp': '2',
      'Crisis': '3',
      'LeadComm': '4',
      'Safety': '3',
      'capability_comments_additional': 'Alpha',
      'Retention comments additional': 'Gamma',
      'Retention Risk': 'Medium'
    }
  ]
];
const consolidated = runAggregation(allData, files, bucketCapability);
assert.strictEqual(consolidated.length, 2);
const billingfors = consolidated.find(r => r.mill === 'Billingfors Paper and Shared');
assert(billingfors, 'Missing Billingfors Paper and Shared aggregate');
assert.strictEqual(billingfors.roleArea, 'Tech');
assert.strictEqual(billingfors.criticality, 2.5);
assert.strictEqual(billingfors.capTech, 3.0);
assert.strictEqual(billingfors.capExperience, 2.5);
assert.strictEqual(billingfors.capCrisis, 3.0);
assert.strictEqual(billingfors.capLeadComm, 2.0);
assert.strictEqual(billingfors.capSafety, 3.0);
assert.strictEqual(billingfors.capabilityAvg, 2.7);
assert.strictEqual(billingfors.retentionRisk, 'H');
assert(billingfors.capabilityComment.includes('Main note'));
assert(billingfors.capabilityComment.includes('Extra info'));
assert(billingfors.capabilityComment.includes('Addl piece'));
assert(billingfors.retentionComment.includes('First comment'));
assert(billingfors.retentionComment.includes('Second\ncomment'));
const jonkoping = consolidated.find(r => r.mill === 'Jönköping');
assert(jonkoping, 'Missing Jönköping aggregate');
assert.strictEqual(jonkoping.roleArea, 'Engineer');
assert.strictEqual(jonkoping.criticality, 4.0);
assert.strictEqual(jonkoping.capTech, 3.0);
assert.strictEqual(jonkoping.capExperience, 2.0);
assert.strictEqual(jonkoping.capCrisis, 3.0);
assert.strictEqual(jonkoping.capLeadComm, 4.0);
assert.strictEqual(jonkoping.capSafety, 3.0);
assert.strictEqual(jonkoping.capabilityAvg, 3.0);
assert.strictEqual(jonkoping.retentionRisk, 'M');
assert.strictEqual(jonkoping.capabilityComment, 'Alpha');
assert.strictEqual(jonkoping.retentionComment, 'Gamma');

const legacyTokens = [
  ['M', 'o', 's', 'i', 'n', 'e', 'e'],
  ['T', 'h', 'i', 'l', 'm', 'a', 'n', 'y'],
  ['M', 'O', 'S'],
  ['T', 'H', 'I'],
].map((parts) => parts.join(''));

for (const token of legacyTokens) {
  if (new RegExp(`\\b${token}\\b`, 'i').test(html)) {
    throw new Error('Found forbidden legacy mill reference in exported tool');
  }
}

if (!/downloadUpdatedBtn\) downloadUpdatedBtn\.addEventListener\('click', saveCurrentVersion\)/.test(html)) {
  throw new Error('Download updated tool button is not wired to saveCurrentVersion');
}

const legacyStart = html.indexOf('var legacyWordTokens');
if (legacyStart === -1) {
  throw new Error('Missing legacy sanitiser token setup');
}
const sanitizeRowsSrc = extractFunctionSource('sanitizeRows');
const sanitizeRowsStart = html.indexOf('function sanitizeRows');
const sanitizeSource = html.slice(legacyStart, sanitizeRowsStart + sanitizeRowsSrc.length);
const sanitizeHelpers = (0, eval)(`(function(){ ${sanitizeSource}\n return { scrubLegacyText, sanitizeRow, sanitizeRows, legacyWordTokens, legacyInitialTokens }; })()`);
const { scrubLegacyText, sanitizeRow, sanitizeRows } = sanitizeHelpers;

assert.strictEqual(scrubLegacyText('Operations Manager (Paper)'), 'Operations Manager (Paper)');
const dirtyRows = [{
  roleArea: 'Operations Manager (MOS and THI)',
  capabilityComment: 'Lead assignments in Mosinee and THI plants.',
  retentionComment: 'Backfill MOS focus with Thilmany experience.',
  notes: 'Transferred from MOS / THI legacy team.'
}];
sanitizeRows(dirtyRows);
const cleaned = dirtyRows[0];
assert.strictEqual(cleaned.roleArea, 'Operations Manager');
['capabilityComment', 'retentionComment', 'notes'].forEach((key) => {
  const val = cleaned[key] || '';
  if (/\b(MOS|THI|Mosinee|Thilmany)\b/i.test(val)) {
    throw new Error(`Legacy mill token survived sanitisation in ${key}`);
  }
});

if (!/sanitizeRows\(rows\);\s*\/\/ Removed per-site retention risk/.test(html)) {
  throw new Error('loadRowsForSite does not sanitise loaded data');
}

if (!/function saveData\(\) {[\s\S]*?sanitizeRows\(rows\);[\s\S]*?localStorage\.setItem/.test(html)) {
  throw new Error('saveData is not sanitising rows before persisting');
}

if (!/sanitizeRows\(existingRows\);[\s\S]*?localStorage\.setItem\(key, JSON\.stringify\(existingRows\)\)/.test(html)) {
  throw new Error('updateToolData does not sanitise persisted rows');
}

if (!/sanitizeRows\(siteRows\);[\s\S]*?siteRows\.forEach\(row => {/.test(html)) {
  throw new Error('downloadAllCSV does not sanitise exported rows');
}

console.log('All consolidation tests passed.');
