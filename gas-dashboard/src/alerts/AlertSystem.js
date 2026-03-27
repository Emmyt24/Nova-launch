import fs from 'fs/promises';
import path from 'path';

class AlertSystem {
  constructor(config = {}) {
    this.thresholds = {
      criticalIncrease: config.criticalIncrease || 20,
      warningIncrease: config.warningIncrease || 10,
      regressionThreshold: config.regressionThreshold || 5
    };
    this.webhookUrl = config.webhookUrl || process.env.ALERT_WEBHOOK_URL;
  }

  async checkAlerts() {
    const measurements = await this.loadRecentMeasurements(7);
    const alerts = [];

    const gasAlert = this.checkGasIncrease(measurements);
    if (gasAlert) alerts.push(gasAlert);

    const regressionAlert = await this.checkRegression(measurements);
    if (regressionAlert) alerts.push(regressionAlert);

    const anomalyAlert = this.checkAnomalies(measurements);
    if (anomalyAlert) alerts.push(anomalyAlert);

    if (alerts.length > 0) {
      await this.sendAlerts(alerts);
    }

    return alerts;
  }

  checkGasIncrease(measurements) {
    if (measurements.length < 2) return null;

    const latest = measurements[0];
    const previous = measurements[1];

    const avgLatest = this.calculateAverage(latest);
    const avgPrevious = this.calculateAverage(previous);
    const increase = ((avgLatest - avgPrevious) / avgPrevious) * 100;

    if (increase > this.thresholds.criticalIncrease) {
      return {
        severity: 'critical',
        type: 'gas_increase',
        message: `Critical: Gas cost increased by ${increase.toFixed(1)}%`,
        details: { current: avgLatest, previous: avgPrevious, increase: increase.toFixed(1) },
        timestamp: new Date().toISOString()
      };
    }

    if (increase > this.thresholds.warningIncrease) {
      return {
        severity: 'warning',
        type: 'gas_increase',
        message: `Warning: Gas cost increased by ${increase.toFixed(1)}%`,
        details: { current: avgLatest, previous: avgPrevious, increase: increase.toFixed(1) },
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  async checkRegression(measurements) {
    const optimizations = await this.loadOptimizations();
    const recentOpt = optimizations[0];
    
    if (!recentOpt || recentOpt.status !== 'deployed') return null;

    const currentGas = this.calculateAverage(measurements[0]);
    
    if (currentGas > recentOpt.gasBefore) {
      return {
        severity: 'critical',
        type: 'regression',
        message: `Regression detected: Gas higher than before optimization`,
        details: {
          optimization: recentOpt.name,
          expected: recentOpt.gasAfter,
          actual: currentGas
        },
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  checkAnomalies(measurements) {
    const values = measurements.map(m => this.calculateAverage(m));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / values.length);
    
    const latest = values[0];
    const zScore = Math.abs((latest - mean) / stdDev);

    if (zScore > 3) {
      return {
        severity: 'warning',
        type: 'anomaly',
        message: `Anomaly detected: Gas cost deviates significantly`,
        details: { current: latest, mean: mean.toFixed(0), zScore: zScore.toFixed(2) },
        timestamp: new Date().toISOString()
      };
    }

    return null;
  }

  async sendAlerts(alerts) {
    if (this.webhookUrl) await this.sendWebhook(alerts);
    await this.saveAlerts(alerts);
  }

  async sendWebhook(alerts) {
    const payload = {
      text: `🚨 Gas Optimization Alerts (${alerts.length})`,
      attachments: alerts.map(alert => ({
        color: alert.severity === 'critical' ? 'danger' : 'warning',
        title: alert.message,
        fields: Object.entries(alert.details).map(([key, value]) => ({
          title: key,
          value: value.toString(),
          short: true
        }))
      }))
    };

    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.error('Failed to send webhook:', error);
    }
  }

  async saveAlerts(alerts) {
    const filepath = path.join(process.cwd(), 'data', 'alerts', `${new Date().toISOString().split('T')[0]}.json`);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    
    let existing = [];
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      existing = JSON.parse(content);
    } catch {}

    await fs.writeFile(filepath, JSON.stringify([...existing, ...alerts], null, 2));
  }

  calculateAverage(measurement) {
    const values = measurement.map(m => m.cpuInstructions);
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  async loadRecentMeasurements(days) {
    const measurements = [];
    const dataDir = path.join(process.cwd(), 'data', 'measurements');
    
    try {
      const files = await fs.readdir(dataDir);
      const sorted = files.sort().reverse().slice(0, days);
      
      for (const file of sorted) {
        const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
        measurements.push(JSON.parse(content));
      }
    } catch (error) {
      console.error('Error loading measurements:', error);
    }

    return measurements;
  }

  async loadOptimizations() {
    try {
      const filepath = path.join(process.cwd(), 'data', 'optimizations.json');
      const content = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return [];
    }
  }
}

export default AlertSystem;
