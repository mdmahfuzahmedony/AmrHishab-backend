import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import adminRouter from "./routes/admin.routes.js";
import authRouter from "./routes/auth.routes.js";
import vendorRouter from "./routes/vendor.routes.js";
import customerRouter from "./routes/customer.routes.js";
import publicRouter from "./routes/public.routes.js";
import businessCategoryRouter from "./routes/business-category.routes.js";

const app = express();

const allowedOrigins = new Set(
  env.FRONTEND_URL.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use(helmet());

app.use(
  cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/vendor", vendorRouter);
app.use("/api/customer", customerRouter);
app.use("/api/public", publicRouter);
app.use("/api/business-categories", businessCategoryRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: "Route not found",
  });
});

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400
    ) {
      response.status(400).json({
        error: "Invalid JSON body",
      });
      return;
    }

    console.error("Unhandled error:", error);
    response.status(500).json({
      error: "Internal server error",
    });
  },
);

const PORT = env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AmrHishab API listening on port ${PORT}`);
});

export default app;
