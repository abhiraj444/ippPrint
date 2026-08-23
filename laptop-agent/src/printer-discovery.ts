import { execSync } from 'child_process';
import os from 'os';

export async function discoverPrinters(): Promise<string[]> {
  try {
    const platform = os.platform();
    if (platform === 'win32') {
      console.log(`[printer] Discovering printers on Windows...`);
      const output = execSync('powershell -Command "Get-Printer | Select-Object -Property Name | ConvertTo-Json"', { encoding: 'utf-8', windowsHide: true });
      const parsed = JSON.parse(output || '[]');
      const array = Array.isArray(parsed) ? parsed : [parsed];
      return array.map((p: any) => p.Name).filter(Boolean);
    } else {
      console.log(`[printer] Discovering printers on Unix-like...`);
      const output = execSync('lpstat -p', { encoding: 'utf-8', windowsHide: true });
      const lines = output.split('\n');
      const printers: string[] = [];
      for (const line of lines) {
        if (line.startsWith('printer ')) {
          const name = line.split(' ')[1];
          if (name) printers.push(name);
        }
      }
      return printers;
    }
  } catch (err) {
    console.warn(`[printer] Error discovering printers:`, err);
    return [];
  }
}
