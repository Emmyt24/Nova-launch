#[cfg(test)]
#[derive(Debug, Clone)]
pub struct TestArtifact {
    pub test_name: &'static str,
    pub timestamp: u64,
    pub seed: Option<u64>,
    pub failure_message: &'static str,
}

#[cfg(test)]
impl TestArtifact {
    pub fn new(test_name: &'static str) -> Self {
        Self {
            test_name,
            timestamp: 0,
            seed: None,
            failure_message: "",
        }
    }

    pub fn with_seed(mut self, seed: u64) -> Self {
        self.seed = Some(seed);
        self
    }

    pub fn with_failure(mut self, msg: &'static str) -> Self {
        self.failure_message = msg;
        self
    }

    pub fn save(&self) {
        // Print to stderr for test output capture
        extern crate std;
        std::eprintln!("\n🔍 Test Artifact:");
        std::eprintln!("  Test: {}", self.test_name);
        std::eprintln!("  Timestamp: {}", self.timestamp);
        if let Some(seed) = self.seed {
            std::eprintln!("  Seed: {}", seed);
        }
        std::eprintln!("  Failure: {}", self.failure_message);
        std::eprintln!("📋 Replay: cargo test {} -- --exact", self.test_name);
    }
}
