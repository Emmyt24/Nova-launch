import ReportGenerator from '../src/reports/ReportGenerator.js';

async function main() {
  const month = process.argv[2] ? new Date(process.argv[2]) : new Date();
  
  console.log(`Generating report for ${month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}...`);
  
  const generator = new ReportGenerator();
  const report = await generator.generateMonthlyReport(month);
  
  console.log('\n📊 Report Summary:');
  console.log(`  Avg Gas: ${report.executiveSummary.avgGasCost.toLocaleString()}`);
  console.log(`  Total Savings: ${report.executiveSummary.totalSavings}`);
  console.log(`  Optimizations: ${report.executiveSummary.optimizationsDeployed}`);
  console.log(`  User Impact: ${report.executiveSummary.userCostImpact}`);
  
  console.log('\n✅ Report generated successfully');
}

main().catch(console.error);
