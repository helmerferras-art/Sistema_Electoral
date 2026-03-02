import fs from 'fs';

const text = fs.readFileSync('C:/Users/helme/Downloads/Subir CSV/padron_edad_sexo.csv', 'utf8');

// The CSV seems to have very long lines and potentially messy quoting.
// Let's use a more robust parsing approach for this specific file.
const lines = text.split('\n');

const tuxtlaSections = new Set();
const otherSections = {}; // section -> municipality

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('TUXTLA')) {
        // Try to find the section number in the line.
        // Looking at the previous output, sections seem to be alone in a column or surrounded by commas.
        const parts = line.split(',');
        // This is a heuristic search for things that look like section numbers (3-4 digits usually)
        parts.forEach(p => {
            const clean = p.trim();
            if (/^\d{3,5}$/.test(clean)) {
                if (line.toUpperCase().includes('MUNICIPIO') || line.toUpperCase().includes('GUTIERREZ')) {
                    tuxtlaSections.add(clean);
                }
            }
        });
    }
}

console.log(`Unique sections found in lines containing TUXTLA: ${tuxtlaSections.size}`);
console.log('Sample sections:', Array.from(tuxtlaSections).slice(0, 50).join(', '));

// Search specifically for 2414 and 2402 again
const problematic = ['2414', '2402', '1748'];
problematic.forEach(sec => {
    const matchingLines = lines.filter(l => l.includes(`,${sec},`) || l.includes(`,${sec}\r`));
    console.log(`\nResults for section ${sec}:`);
    matchingLines.forEach(l => {
        // Extract municipality (heuristic: look for uppercase names)
        const munMatch = l.match(/[A-Z\s]{4,}/g);
        console.log(`  - Line contains: ${munMatch?.join(' | ')}`);
    });
});
