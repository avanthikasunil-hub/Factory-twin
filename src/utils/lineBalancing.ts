
import type { Operation, MachinePosition } from '@/types';

/**
 * Calculates the required number of machines for each operation
 * based on SMV and Target Output.
 *
 * Formula:
 * Takt Time = (Working Hours * 60) / Target Output
 * Required Machines = Ceiling(SMV / Takt Time)
 */
export const calculateMachineRequirements = (
    operations: Operation[],
    targetOutput: number,
    workingHours: number,
    efficiency: number = 90
): { operation: Operation; count: number }[] => {
    if (targetOutput <= 0 || workingHours <= 0 || efficiency <= 0) {
        // Fallback if parameters are missing/zero: 1 machine per op
        return operations.map(op => ({ operation: op, count: 1 }));
    }

    const availableTime = workingHours * 60; // Total minutes available
    const efficiencyDecimal = efficiency / 100;

    // STEP 1: EffectiveTime = AvailableTime × Efficiency
    const effectiveTime = availableTime * efficiencyDecimal;
    const takt = effectiveTime / targetOutput;

    const results = operations.map(op => {
        if (op.smv <= 0) return { operation: { ...op, utilization: 0 }, count: 1 };

        // STEP 3: Machines = ceil(SMV / Takt)
        const neededMachines = op.smv / takt;
        let requiredMachines = Math.ceil(neededMachines);

        // Feature override: Enforce 2 machines for 'button wrapping'
        if (op.op_name.toLowerCase().includes('button wrapping') || op.op_name.toLowerCase().includes('button_wrapping')) {
            requiredMachines = 2;
        }

        const count = Math.min(100, Math.max(1, requiredMachines));
        const utilization = neededMachines / count;

        return {
            operation: { 
                ...op, 
                utilization,
                isBottleneck: utilization > 0.9 // Threshold for potential bottleneck
            },
            count
        };
    });

    // Identify the PRIMARY bottleneck (highest utilization)
    if (results.length > 0) {
        let maxUtil = -1;
        let primaryIdx = -1;
        results.forEach((r, idx) => {
            if (r.operation.utilization && r.operation.utilization > maxUtil) {
                maxUtil = r.operation.utilization;
                primaryIdx = idx;
            }
        });

        if (primaryIdx !== -1) {
            results[primaryIdx].operation.isBottleneck = true;
            results[primaryIdx].operation.bottleneckSeverity = 'high';
        }

        // Secondary bottlenecks
        results.forEach(r => {
            if (r.operation.isBottleneck && r.operation.bottleneckSeverity !== 'high') {
                r.operation.bottleneckSeverity = 'medium';
            }
        });
    }

    return results;
};
