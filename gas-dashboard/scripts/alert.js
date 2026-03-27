import AlertSystem from '../src/alerts/AlertSystem.js';

async function main() {
  console.log('Checking for alerts...');
  
  const alertSystem = new AlertSystem();
  const alerts = await alertSystem.checkAlerts();
  
  if (alerts.length === 0) {
    console.log('✅ No alerts detected');
  } else {
    console.log(`\n⚠️  ${alerts.length} alert(s) detected:\n`);
    alerts.forEach((alert, i) => {
      console.log(`${i + 1}. [${alert.severity.toUpperCase()}] ${alert.message}`);
      console.log(`   Type: ${alert.type}`);
      console.log(`   Details:`, alert.details);
      console.log('');
    });
  }
}

main().catch(console.error);
