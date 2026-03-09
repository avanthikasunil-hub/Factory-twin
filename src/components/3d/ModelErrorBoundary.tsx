import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Html } from '@react-three/drei';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    machineName?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ModelErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Error loading model for ${this.props.machineName || 'machine'}:`, error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default Fallback: Red Box with Error Text
            return (
                <group>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color="red" wireframe />
                    </mesh>
                    <Html position={[0, 1.2, 0]} center>
                        <div className="bg-red-900/90 text-white px-2 py-1 rounded text-xs whitespace-nowrap border border-red-500">
                            <p className="font-bold">Error Loading</p>
                            <p className="text-[10px] opacity-80">{this.props.machineName}</p>
                        </div>
                    </Html>
                </group>
            );
        }

        return this.props.children;
    }
}
