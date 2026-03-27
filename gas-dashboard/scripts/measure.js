import GasTracker from '../src/tracker/GasTracker.js';

async function main() {
  console.log('Starting gas measurement...');
  
  const tracker = new GasTracker();
  const measurements = await tracker.measureAllFunctions();
  
  console.log('\nMeasurement Results:');
  measurements.forEach(m => {
    console.log(`  ${m.function}: ${m.cpuInstructions.toLocaleString()} instructions`);
  });
  
  await tracker.saveMeasurements(measurements);
  const metrics = await tracker.calculateMetrics(measurements);
  
  console.log('\nMetrics:');
  console.log(`  Avg Gas/Tx: ${metrics.avgGasPerTx.toLocaleString()}`);
  console.log(`  Total Memory: ${metrics.totalMemory.toLocaleString()} bytes`);
  console.log(`  Functions Measured: ${metrics.functionCount}`);
  
  console.log('\n✅ Measurement complete');
}

main().catch(console.error);
