import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputFile = path.join(__dirname, '../public/data/ICAO_Aircraft.txt');
const outputFile = path.join(__dirname, '../public/data/wtc.json');

const lines = fs.readFileSync(inputFile, 'utf-8').split(/\r?\n/);

const wtcMap = {};
let count = 0;

for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length >= 2) {
        const type = parts[0].trim();
        const designator = parts[1].trim();
        if (type && designator) {
            const wtcChar = designator.charAt(0).toUpperCase();
            let wtc = null;
            if (wtcChar === 'J') wtc = 'S'; // Super
            else if (wtcChar === 'H') wtc = 'H'; // Heavy
            else if (wtcChar === 'M') wtc = 'M'; // Medium
            else if (wtcChar === 'L') wtc = 'L'; // Light
            
            if (wtc) {
                wtcMap[type] = wtc;
                count++;
            }
        }
    }
}

fs.writeFileSync(outputFile, JSON.stringify(wtcMap, null, 0));
console.log(`Generated ${outputFile} with ${count} aircraft types.`);
