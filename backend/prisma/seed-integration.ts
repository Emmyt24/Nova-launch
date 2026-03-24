// Keep the requested Prisma-side seed entrypoint while sourcing the
// deterministic compatibility harness from within `src` so backend TypeScript
// builds do not pull files from outside the configured rootDir.
export * from '../src/__tests__/utils/seedIntegration';
