import cron from 'node-cron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

console.log('🚀 Gas Dashboard Scheduler Started');

// Daily gas measurement at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running daily gas measurement...');
  try {
    await execAsync('node scripts/measure.js');
    console.log('✅ Daily measurement complete');
  } catch (error) {
    console.error('❌ Measurement failed:', error);
  }
});

// Alert check every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('Checking for alerts...');
  try {
    await execAsync('node scripts/alert.js');
    console.log('✅ Alert check complete');
  } catch (error) {
    console.error('❌ Alert check failed:', error);
  }
});

// Monthly report on 1st of each month at 9 AM
cron.schedule('0 9 1 * *', async () => {
  console.log('Generating monthly report...');
  try {
    await execAsync('node scripts/report.js');
    console.log('✅ Monthly report generated');
  } catch (error) {
    console.error('❌ Report generation failed:', error);
  }
});

console.log('📅 Scheduled tasks:');
console.log('  - Daily measurement: 2:00 AM');
console.log('  - Alert check: Every 6 hours');
console.log('  - Monthly report: 1st of month, 9:00 AM');
