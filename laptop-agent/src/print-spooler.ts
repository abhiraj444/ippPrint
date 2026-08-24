import { createRequire } from 'module';
import { exec, execFile, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import fs from 'fs/promises';
import fsSync from 'fs';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const require = createRequire(import.meta.url);
const pdfToPrinter = require('pdf-to-printer');
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const PRINT_AS_IMAGE = process.env.PRINT_AS_IMAGE !== 'false'; // default true
const RASTER_DPI = parseInt(process.env.IMAGE_DPI || '150', 10); // default 150 DPI

/**
 * Locate Ghostscript executable on the system
 */
function findGhostscript(): string | null {
  const platform = os.platform();
  if (platform === 'win32') {
    // 1. Try PATH
    try {
      const whereOut = execSync('where.exe gswin64c.exe', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
      if (whereOut) return whereOut.split('\r\n')[0].split('\n')[0];
    } catch {}

    // 2. Check standard Program Files directories
    const gsBase = 'C:\\Program Files\\gs';
    if (fsSync.existsSync(gsBase)) {
      try {
        const dirs = fsSync.readdirSync(gsBase);
        for (const d of dirs.reverse()) {
          const binPath = path.join(gsBase, d, 'bin', 'gswin64c.exe');
          if (fsSync.existsSync(binPath)) return binPath;
        }
      } catch {}
    }
    return null;
  } else {
    try {
      const whichOut = execSync('which gs', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
      if (whichOut) return whichOut;
    } catch {}
    return null;
  }
}

/**
 * Pre-rasterize PDF pages into 150 DPI bitmap image PDF for fast RIP printing
 */
async function rasterizePdf(inputPath: string, outputPath: string, dpi: number = 150, isColor: boolean = false): Promise<boolean> {
  try {
    const gs = findGhostscript();
    if (!gs) {
      console.log(`[printer] Ghostscript not located; skipping image rasterization.`);
      return false;
    }

    // pdfimage8 for monochrome/grayscale copiers (3x smaller & much faster RIP), pdfimage24 for color
    const device = isColor ? 'pdfimage24' : 'pdfimage8';
    console.log(`[printer] Pre-rasterizing PDF to image @ ${dpi} DPI (device: ${device}, fast mode) using Ghostscript...`);
    const cmd = `"${gs}" -dNOPAUSE -dBATCH -dQUIET -sDEVICE=${device} -r${dpi} -sOutputFile="${outputPath}" "${inputPath}"`;
    await execAsync(cmd, { windowsHide: true });
    
    if (fsSync.existsSync(outputPath)) {
      const stat = fsSync.statSync(outputPath);
      console.log(`[printer] Fast 150 DPI raster PDF created (${stat.size} bytes)`);
      return true;
    }
  } catch (err) {
    console.warn(`[printer] Rasterization warning:`, err);
  }
  return false;
}

/**
 * Determine if a printer is a color printer based on its name
 */
function isColorPrinter(printerName: string): boolean {
  const name = printerName.toLowerCase();
  if (name.includes('canon') || name.includes('ir') || name.includes('brother') || name.includes('bw') || name.includes('laser') || name.includes('mono')) {
    return false; // Fast monochrome 8-bit grayscale raster
  }
  if (name.includes('color') || name.includes('epson') || name.includes('photo') || name.includes('inkjet')) {
    return true;
  }
  return false;
}

export async function printDocument(
  printerName: string,
  data: Buffer,
  jobId: number,
  documentName: string = `Job-${jobId}`
): Promise<void> {
  // Sanitize document name for valid Windows filename & print job title
  const cleanName = (documentName || `Job-${jobId}`)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .trim()
    .slice(0, 80) || `Job-${jobId}`;
  const fileName = cleanName.toLowerCase().endsWith('.pdf') ? cleanName : `${cleanName}.pdf`;

  // Embed clean title metadata into PDF binary
  try {
    const pdfDoc = await PDFDocument.load(data, { ignoreEncryption: true });
    pdfDoc.setTitle(cleanName);
    pdfDoc.setSubject(cleanName);
    pdfDoc.setProducer('Cloud Print Kiosk');
    data = Buffer.from(await pdfDoc.save());
  } catch (e) {}

  // Use a dedicated per-job temp folder so the file is named with the real document name
  const jobDir = path.join(os.tmpdir(), `ipp-job-${jobId}-${Date.now()}`);
  await fs.mkdir(jobDir, { recursive: true });

  const tempFile = path.join(jobDir, fileName);
  const rasterFile = path.join(jobDir, `raster-temp.pdf`);
  
  let fileToPrint = tempFile;

  try {
    await fs.writeFile(tempFile, data);
    console.log(`[printer] Saved job ${jobId} "${fileName}" (${data.length} bytes) to ${tempFile}`);

    // If PRINT_AS_IMAGE is enabled, rasterize the PDF to 150 DPI images before sending to printer
    if (PRINT_AS_IMAGE) {
      const isColor = isColorPrinter(printerName);
      const success = await rasterizePdf(tempFile, rasterFile, RASTER_DPI, isColor);
      if (success && fsSync.existsSync(rasterFile)) {
        // Re-embed title in rasterized PDF as well
        try {
          const rasterBytes = await fs.readFile(rasterFile);
          const rasterDoc = await PDFDocument.load(rasterBytes, { ignoreEncryption: true });
          rasterDoc.setTitle(cleanName);
          await fs.writeFile(tempFile, await rasterDoc.save());
        } catch {
          await fs.copyFile(rasterFile, tempFile);
        }
        try { await fs.unlink(rasterFile); } catch {}
        fileToPrint = tempFile;
      }
    }

    const platform = os.platform();
    if (platform === 'win32') {
      console.log(`[printer] Spooling "${fileName}" to "${printerName}" on Windows with clean document title...`);
      
      const sumatraExe = path.join(__dirname, '..', 'node_modules', 'pdf-to-printer', 'dist', 'SumatraPDF-3.4.6-32.exe');
      if (fsSync.existsSync(sumatraExe)) {
        await execFileAsync(sumatraExe, ['-print-to', printerName, '-silent', fileName], {
          cwd: jobDir,
          windowsHide: true
        });
      } else {
        await pdfToPrinter.print(fileToPrint, { printer: printerName });
      }

      console.log(`[printer] Successfully sent "${fileName}" (job ${jobId}) to printer "${printerName}"`);
    } else {
      console.log(`[printer] Spooling "${fileName}" to "${printerName}" on Unix-like...`);
      await execAsync(`lp -d '${printerName}' -t '${cleanName}' '${fileToPrint}'`);
      console.log(`[printer] Spooled "${fileName}" (job ${jobId}) to "${printerName}" successfully`);
    }
  } catch (err) {
    console.error(`[printer] Failed to spool "${fileName}" (job ${jobId}) to "${printerName}":`, err);
  } finally {
    // Schedule cleanups for the job directory
    setTimeout(async () => {
      try {
        if (fsSync.existsSync(jobDir)) {
          await fs.rm(jobDir, { recursive: true, force: true });
          console.log(`[printer] Cleaned up job directory ${jobDir}`);
        }
      } catch (e) {}
    }, 60000);
  }
}

