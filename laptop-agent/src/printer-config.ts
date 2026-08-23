import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline-sync';
import { discoverPrinters } from './printer-discovery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'printers.json');

export interface ExposedPrinter {
  localName: string;
  publicSlug: string;
  displayName: string;
}

export interface PrinterConfig {
  exposed: ExposedPrinter[];
}

export function loadConfig(): PrinterConfig | null {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data) as PrinterConfig;
  } catch (err) {
    console.error(`[config] Error loading config:`, err);
    return null;
  }
}

export function saveConfig(config: PrinterConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`[config] Saved config to ${CONFIG_PATH}`);
  } catch (err) {
    console.error(`[config] Error saving config:`, err);
  }
}

export function findBySlug(config: PrinterConfig, slug: string): ExposedPrinter | undefined {
  return config.exposed.find(p => p.publicSlug === slug);
}

export async function runFirstTimeSetup(): Promise<PrinterConfig> {
  console.log(`[config] Running first-time setup...`);
  const config: PrinterConfig = { exposed: [] };
  const printers = await discoverPrinters();
  
  if (printers.length === 0) {
    console.log(`[config] No printers found. Creating empty config.`);
    saveConfig(config);
    return config;
  }

  let addMore = true;
  while (addMore) {
    console.log(`\nAvailable printers:`);
    printers.forEach((p, i) => console.log(`${i + 1}. ${p}`));
    
    const idxStr = readline.question(`Which printer to expose? (1-${printers.length}): `);
    const idx = parseInt(idxStr) - 1;
    
    if (idx >= 0 && idx < printers.length) {
      const localName = printers[idx];
      const defaultSlug = localName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      
      let slug = readline.question(`Public slug [${defaultSlug}]: `);
      if (!slug.trim()) slug = defaultSlug;
      
      let displayName = readline.question(`Display name [${localName}]: `);
      if (!displayName.trim()) displayName = localName;
      
      config.exposed.push({ localName, publicSlug: slug, displayName });
      console.log(`[config] Added ${displayName} as /printers/${slug}`);
    } else {
      console.log(`[config] Invalid selection.`);
    }
    
    const ans = readline.question(`Add another? (y/n) [n]: `);
    addMore = ans.toLowerCase() === 'y';
  }
  
  saveConfig(config);
  return config;
}
