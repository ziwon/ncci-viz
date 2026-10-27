// English is the shipping locale. Add a dictionary with this shape to extend it.
export const en = {
  appName: 'NCCL Lab',
  tagline: 'Collective communication, made visible.',
  playground: 'Collective playground',
  playgroundDescription: 'See how data moves. Understand what makes it fast.',
  simulator: 'Simulator',
  comparison: 'Algorithm comparison',
  reference: 'Collective reference',
  operations: 'Collective operations',
  configuration: 'Configuration',
  topology: 'Communication topology',
  inspector: 'Step inspector',
  modelNote: 'Educational model · not a hardware benchmark',
  initial: 'Ready to communicate',
  initialDescription: 'Input buffers are initialized. Press play or advance one step to follow the data.',
  complete: 'Collective complete',
  completeDescription: 'All required output buffers are ready. Inspect the results below or replay the collective.',
  share: 'Share configuration',
  export: 'Export trace',
  docs: 'NCCL docs',
};
export type Messages = typeof en;
export const t: Messages = en;
