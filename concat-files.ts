import { promises as fs } from 'fs';
import * as path from 'path';

const srcDir = path.join(__dirname, 'src'); // path to your src folder
const outputFile = path.join(__dirname, 'all-ts-files.txt');

async function getAllTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await getAllTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function concatFiles() {
  const tsFiles = await getAllTsFiles(srcDir);
  let allContent = '';

  for (const file of tsFiles) {
    const content = await fs.readFile(file, 'utf-8');
    allContent += `\n\n// ===== ${file} =====\n\n`;
    allContent += content;
  }

  await fs.writeFile(outputFile, allContent, 'utf-8');
  console.log(`All .ts files concatenated into ${outputFile}`);
}

concatFiles().catch((err) => console.error(err));
