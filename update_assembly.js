const fs = require('fs');

function updateFile(path) {
    let content = fs.readFileSync(path, 'utf8');

    // 1. Update Lane Centers
    content = content.replace(/export const LANE_Z_CENTER_AB = -3\.0;/, 'export const LANE_Z_CENTER_AB = -2.7;');
    content = content.replace(/export const LANE_Z_CENTER_CD = 0\.0;/, 'export const LANE_Z_CENTER_CD = -0.3;');
    
    // 2. Update Lane Z values for equal small gaps (1.2m spacing)
    content = content.replace(/export const LANE_Z_A = -2\.25;/, 'export const LANE_Z_A = -2.1;');
    content = content.replace(/export const LANE_Z_B = -3\.75;/, 'export const LANE_Z_B = -3.3;');
    content = content.replace(/export const LANE_Z_C = 0\.75;/, 'export const LANE_Z_C = 0.3;');
    content = content.replace(/export const LANE_Z_D = -0\.75;/, 'export const LANE_Z_D = -0.9;');

    // 3. Update X offsets to strictly + 2.5 buffer
    content = content.replace(/let currentX_AB = startX_AssemblyAB \+ 1\.5;/g, 'let currentX_AB = startX_AssemblyAB + 2.5;');
    content = content.replace(/let currentX_CD = startX_AssemblyCD \+ 1\.5;/g, 'let currentX_CD = startX_AssemblyCD + 2.5;');
    content = content.replace(/let hX = startX_AssemblyCD;/g, 'let hX = startX_AssemblyCD + 2.5;');

    fs.writeFileSync(path, content, 'utf8');
}

updateFile('./src/utils/layoutGenerator.ts');
updateFile('./src/utils/cotLayoutGenerator.ts');
console.log('Update script completed.');
