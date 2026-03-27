#[cfg(test)]
mod test_artifact_system {
    use crate::test_artifacts::TestArtifact;

    #[test]
    fn test_artifact_creation() {
        let artifact = TestArtifact::new("test_example")
            .with_seed(12345)
            .with_failure("Example failure message");
        
        assert_eq!(artifact.test_name, "test_example");
        assert_eq!(artifact.seed, Some(12345));
        assert_eq!(artifact.failure_message, "Example failure message");
        
        // This will print to stderr during test
        artifact.save();
    }

    #[test]
    fn test_artifact_without_seed() {
        let artifact = TestArtifact::new("test_no_seed")
            .with_failure("Failure without seed");
        
        assert_eq!(artifact.seed, None);
        artifact.save();
    }
}
