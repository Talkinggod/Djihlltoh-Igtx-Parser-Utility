
import React from 'react';
import { MeasurementLayer, ApplicationLayer, CalibrationEntry } from '../types';
import { CalibrationService } from '../services/calibrationService';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Activity, Target, ShieldCheck, AlertTriangle, Zap, Gauge, Binary, GitBranch, Shield, Search } from 'lucide-react';
import { cn } from '../lib/utils';

interface PhysicsDashboardProps {
    physics: MeasurementLayer;
    control: ApplicationLayer;
    curve: number[];
}

export const PhysicsDashboard: React.FC<PhysicsDashboardProps> = ({ physics, control, curve }) => {
    const calibration = CalibrationService.getBaseline(control.target_domain);
    const status = CalibrationService.checkAdmissibility(physics.λ_measured, control.target_domain);

    // Derived Kernel Metric: ISI (Interpretive Symmetry Index)
    const isi = 1.0 - Math.min(1.0, physics.κ_physics);

    return (
        <div className="p-6 space-y-8 animate-in fade-in duration-500">
            {/* LAYER 1: MEASUREMENT (PHYSICS KERNEL) */}
            <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Layer 1: Physics Kernel Observables
                    </h3>
                    <Badge variant={physics.is_admissible ? "success" : "destructive"} className="font-mono text-[9px]">
                        {physics.is_admissible ? "Kernel Validated" : "Gating Refusal"}
                    </Badge>
                </div>

                {!physics.is_admissible ? (
                    <div className="bg-destructive/5 border border-destructive/20 p-6 rounded-lg flex items-center gap-4 text-destructive">
                        <AlertTriangle className="w-6 h-6 shrink-0" />
                        <p className="text-sm font-mono italic leading-relaxed">{physics.refusal_reason}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="bg-muted/10 border-primary/5">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-[9px] uppercase text-muted-foreground flex justify-between">
                                    λ_measured <span>Decay Rate</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-3">
                                <div className="text-2xl font-black tabular-nums">{physics.λ_measured.toFixed(6)}</div>
                                <div className="text-[8px] text-muted-foreground uppercase mt-1">Units: Semantic-Units / Lag</div>
                            </CardContent>
                        </Card>

                        <Card className="bg-muted/10 border-primary/5">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-[9px] uppercase text-muted-foreground">ISI (Symmetry Index)</CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-3">
                                <div className="text-2xl font-black tabular-nums">{(isi * 100).toFixed(2)}%</div>
                                <div className="text-[9px] text-muted-foreground mt-1">
                                    {isi > 0.95 ? 'Stable Trajectory' : 'Directional Drift'}
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-muted/10 border-primary/5">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-[9px] uppercase text-muted-foreground">R² (Spectral Fit)</CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-3">
                                <div className="text-2xl font-black tabular-nums">{physics.r_squared.toFixed(4)}</div>
                                <div className="h-1 w-full bg-muted mt-2 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary"
                                        style={{ width: `${physics.r_squared * 100}%` }}
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="bg-muted/10 border-primary/5">
                            <CardHeader className="py-2 px-3">
                                <CardTitle className="text-[9px] uppercase text-muted-foreground">Log-Linear Curve</CardTitle>
                            </CardHeader>
                            <CardContent className="px-3 pb-3 flex items-end gap-1 h-12">
                                {curve.map((v, i) => (
                                    <div 
                                        key={i} 
                                        className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors"
                                        style={{ height: `${Math.max(5, v * 100)}%` }}
                                    />
                                ))}
                            </CardContent>
                        </Card>
                    </div>
                )}
            </section>

            {/* LAYER 2: APPLICATION (LOGIC GATES) */}
            <section className="space-y-4">
                <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                        <Target className="w-4 h-4" /> Layer 2: Application Constraints
                    </h3>
                    <Badge variant="outline" className="font-mono text-[9px] bg-primary/5">
                        <Search className="w-2.5 h-2.5 mr-1" /> Precision Scan
                    </Badge>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold uppercase flex items-center gap-2">
                                    <Zap className="w-3 h-3 text-primary" /> λ_control (Intent)
                                </label>
                                <span className="font-mono text-xs font-bold text-primary">{control.λ_control.toFixed(2)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-muted rounded-full relative">
                                <div 
                                    className="absolute h-full bg-primary rounded-full transition-all"
                                    style={{ width: `${control.λ_control * 100}%` }}
                                />
                                <div 
                                    className="absolute w-4 h-4 bg-background border-2 border-primary rounded-full top-1/2 -translate-y-1/2 shadow-sm"
                                    style={{ left: `calc(${control.λ_control * 100}% - 8px)` }}
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground italic">Targeting restructuration depth based on observed gravity.</p>
                        </div>

                        <div className="p-4 rounded-lg border border-dashed border-primary/20 bg-primary/5 flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="text-[10px] font-black uppercase text-primary/60 tracking-widest">Calibration Status</div>
                                <div className="text-xs flex items-center gap-2 font-medium">
                                    {status.status === 'calibrated' ? (
                                        <><ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Object Aligned with {calibration.domain}</>
                                    ) : (
                                        <><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Structural Divergence Detected</>
                                    )}
                                </div>
                            </div>
                            <div className="text-[10px] font-mono text-muted-foreground bg-background px-2 py-1 rounded border">
                                Baseline λ: {calibration.λ_baseline[0]}..{calibration.λ_baseline[1]}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Card className="flex flex-col items-center justify-center p-4 bg-card border-primary/10 shadow-sm">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">κ_preserve</span>
                            <div className="text-3xl font-black text-primary">{(control.κ_preserve * 100).toFixed(1)}%</div>
                            <span className="text-[9px] text-center mt-1 text-muted-foreground uppercase tracking-tighter">Entailment Lock</span>
                        </Card>
                        <Card className="flex flex-col items-center justify-center p-4 bg-card border-primary/10 shadow-sm">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase mb-1">κ_ground</span>
                            <div className="text-3xl font-black text-primary">{(control.κ_ground * 100).toFixed(1)}%</div>
                            <span className="text-[9px] text-center mt-1 text-muted-foreground uppercase tracking-tighter">Support Gating</span>
                        </Card>
                    </div>
                </div>
            </section>

            <div className="pt-6 border-t border-primary/5 text-center">
                <p className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-[0.2em]">
                    Kernel v1.3.0-Patent | Precision Mode: 128-bit | Deterministic Seed: 0x42
                </p>
            </div>
        </div>
    );
};
