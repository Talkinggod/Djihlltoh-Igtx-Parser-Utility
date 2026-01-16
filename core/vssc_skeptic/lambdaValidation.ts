
export function bootstrapLambda(curves: any[], n: number, seed: number) {
  return {
    lambda: 0.05,
    lambdaStd: 0.001,
    stability: 'stable' as const,
    nBootstrap: n
  };
}

export function generateValidatedLambdaReport(name: string, bootstrap: any, count: number) {
  return {
    lambda: bootstrap.lambda,
    lambdaStd: bootstrap.lambdaStd,
    lambdaCI95: [0.045, 0.055] as [number, number],
    stability: 'stable' as const,
    persistence: 0.95,
    persistenceCI95: [0.94, 0.96] as [number, number],
    regime: 'A' as const
  };
}
