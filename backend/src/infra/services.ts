import { Db } from "./db";
import { Identity } from "../identity/service";
import { Catalog } from "../catalog/service";
import { Reservations } from "../reservations/service";
import { Payments } from "../payments/service";
import { Ticketing } from "../ticketing/service";
import { Reporting } from "../reporting/service";
import { Operations } from "../operations/service";
import { provider } from "../payments/provider";
import { PublicCache } from "./cache";
export function services() {
  const db = new Db(),
    reservations = new Reservations(db),
    reporting = new Reporting(db),
    ticketing = new Ticketing(db, reservations);
  return {
    db,
    reservations,
    reporting,
    identity: new Identity(db),
    catalog: new Catalog(db),
    payments: new Payments(db, reservations, provider(db), ticketing),
    ticketing,
    operations: new Operations(db, reporting),
    cache: new PublicCache(db),
  };
}
export type Services = ReturnType<typeof services>;
