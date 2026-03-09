import { generateLayout } from "./src/utils/layoutGenerator";

const defaultOperations = [
  ...Array(11).fill(0).map((_, i) => ({
    op_no: String(i+1),
    op_name: 'Front op ' + (i+1),
    machine_type: 'Single Needle Lock Stitch',
    smv: 3,
    section: 'Front'
  })),
  ...Array(11).fill(0).map((_, i) => ({
    op_no: String(i+12),
    op_name: 'Collar op ' + (i+1),
    machine_type: 'Single Needle Lock Stitch',
    smv: 1,
    section: 'Collar'
  }))
];

const result = generateLayout(defaultOperations as any, 1000, 8, 100);
const layout = result.machines;

const fronts = layout.filter(l => (l.section || "").toLowerCase() === "front" && !l.isInspection);
console.log(`Front total: ${fronts.length}`);
if (fronts.length > 0) {
    const m = fronts[fronts.length - 1];
    console.log(`Last machine object snippet: id=${m.id}, section=${m.section}, index=${m.machineIndex}`);
}

const insp = layout.find(l => l.isInspection && (l.section || "").toLowerCase() === "front");
console.log(`Front Inspection X: ${insp?.position.x.toFixed(2)}`);
