import "dotenv/config";
import { validateGatewayEnv } from "./config";
import { createApp } from "./app";

const env = validateGatewayEnv();
const app = createApp({ env });

app.listen(env.PORT, () => {
  console.log(`🚪 API Gateway running on port ${env.PORT}`);
  console.log(`   → Proxying to ${env.BACKEND_URL}`);
  console.log(`   → Environment: ${env.NODE_ENV}`);
});
