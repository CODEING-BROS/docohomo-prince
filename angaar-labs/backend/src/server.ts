import { app } from "./app";
import { env } from "./config/env";
import { startHousekeeping } from "./lib/housekeeping";

app.listen(env.PORT, () => {
  console.log(`API ready on http://localhost:${env.PORT}`);
  startHousekeeping(); // re-checks open payments and releases unpaid orders every few minutes
});
