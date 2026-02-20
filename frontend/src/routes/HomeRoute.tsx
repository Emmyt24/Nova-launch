import { Container } from "../components/Layout";
import { Card } from "../components/UI";

export default function HomeRoute() {
  return (
    <Container>
      <Card title="Deploy Your Token">
        <p className="text-gray-600">
          Welcome to Stellar Token Deployer. Connect your wallet to get started.
        </p>
      </Card>
    </Container>
  );
}
