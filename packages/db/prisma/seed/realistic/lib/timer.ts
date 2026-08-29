const stageStarts = new Map<string, number>();

export function startStage(name: string): void {
  stageStarts.set(name, Date.now());
  console.log(`  ▶ ${name}...`);
}

export function endStage(name: string): void {
  const start = stageStarts.get(name);
  if (start === undefined) return;
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`  ✔ ${name} (${elapsed}s)`);
}
