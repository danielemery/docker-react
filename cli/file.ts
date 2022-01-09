import { promises as fs } from 'fs';

export async function findAndReplaceInFile(
  filePath: string,
  fromSearchValue: RegExp | string,
  toSearchFile: string,
) {
  const data = await fs.readFile(filePath, 'utf8');
  const result = data.replace(fromSearchValue, toSearchFile);
  await fs.writeFile(filePath, result, 'utf8');
}
