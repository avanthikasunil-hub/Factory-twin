
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

    return operations.map(op => {
        if (op.smv <= 0) return { operation: op, count: 1 };

        let takt = effectiveTime / targetOutput;

        // Feature override: Enforce 2 machines for 'button wrapping'
        if (op.op_name.toLowerCase().includes('button wrapping') || op.op_name.toLowerCase().includes('button_wrapping')) {
            return { operation: op, count: 2 };
        }

        // STEP 3: Machines = ceil(SMV / Takt)
        const requiredMachines = Math.ceil(op.smv / takt);

        return {
            operation: op,
            count: Math.min(100, Math.max(1, requiredMachines)) // Cap at 100 to prevent infinite loops
        };
    });
};
