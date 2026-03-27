import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { buildCorsOptions } from "./auth/cors.config";

async function bootstrap() {
  const logger = new Logger("Bootstrap");
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // CORS
  const allowedOrigins = config
    .get<string>("ALLOWED_ORIGINS", "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());
  app.enableCors(buildCorsOptions(allowedOrigins));

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Cheese Platform API")
    .setDescription("Crypto payment platform API with Stellar wallet auth")
    .setVersion("1.0")
    .addBearerAuth()
    .addApiKey({ type: "apiKey", in: "header", name: "X-Api-Key" }, "api-key")
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  const port = config.get<number>("PORT", 3000);
  await app.listen(port);
  logger.log(`Application running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
