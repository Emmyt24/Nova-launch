import { Container } from "../components/Layout";
import { Button, Card } from "../components/UI";

export default function NotFoundRoute() {
  return (
    <Container>
      <Card title="Page not found">
        <p className="text-gray-600">
          The page you requested does not exist.
        </p>
        <div className="mt-4">
          <Button onClick={() => window.location.assign("/")}>Return home</Button>
        </div>
      </Card>
    </Container>
  );
}
