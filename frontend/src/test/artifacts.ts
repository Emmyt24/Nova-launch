export interface TestArtifact {
  testName: string;
  timestamp: number;
  seed?: string;
  failureMessage: string;
  callSequence: string[];
  stateSnapshot: Record<string, unknown>;
  replayCommand: string;
}

export class ArtifactCapture {
  private testName: string;
  private calls: string[] = [];
  private seed?: string;

  constructor(testName: string, seed?: string) {
    this.testName = testName;
    this.seed = seed;
  }

  addCall(call: string): void {
    this.calls.push(call);
  }

  capture(error: Error, state: Record<string, unknown>): TestArtifact {
    const artifact: TestArtifact = {
      testName: this.testName,
      timestamp: Date.now(),
      seed: this.seed,
      failureMessage: error.message,
      callSequence: this.calls,
      stateSnapshot: state,
      replayCommand: `npm test -- ${this.testName}`,
    };

    this.save(artifact);
    return artifact;
  }

  private save(artifact: TestArtifact): void {
    const filename = `test-artifacts/${artifact.testName.replace(/[^a-z0-9]/gi, '_')}-${artifact.timestamp}.json`;
    
    if (typeof window === 'undefined') {
      // Node environment
      try {
        const fs = require('fs');
        fs.mkdirSync('test-artifacts', { recursive: true });
        fs.writeFileSync(filename, JSON.stringify(artifact, null, 2));
        console.error(`\n🔍 Test artifact saved: ${filename}`);
        console.error(`📋 Replay: ${artifact.replayCommand}`);
        if (artifact.seed) {
          console.error(`🎲 Seed: ${artifact.seed}`);
        }
      } catch (e) {
        console.error('Failed to save artifact:', e);
      }
    }
  }
}

export function captureFailure(
  testName: string,
  error: Error,
  calls: string[],
  state: Record<string, unknown>,
  seed?: string
): TestArtifact {
  const capture = new ArtifactCapture(testName, seed);
  calls.forEach(call => capture.addCall(call));
  return capture.capture(error, state);
}
