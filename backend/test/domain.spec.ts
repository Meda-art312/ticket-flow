import { encrypt, decrypt, hash, pagination } from "../src/infra/common";
import contract from "../docs/openapi.json";
import { FixedClock, holdEligible } from "../src/reservations/policy";
describe("domain and frontend representation", () => {
  it("rejects exact-deadline, canceled and expired holds under a controllable projection clock", () => {
    const deadline = new Date("2026-10-13T20:00:00Z"),
      clock = new FixedClock(new Date(deadline.getTime() - 1));
    expect(holdEligible("RESERVED", "PUBLISHED", deadline, clock)).toBe(true);
    clock.set(deadline);
    expect(holdEligible("RESERVED", "PUBLISHED", deadline, clock)).toBe(false);
    clock.set(new Date(deadline.getTime() - 1));
    expect(holdEligible("EXPIRED", "PUBLISHED", deadline, clock)).toBe(false);
    expect(holdEligible("RESERVED", "CANCELED", deadline, clock)).toBe(false);
  });
  it("protects recoverable check-in credentials and rejects tampering", () => {
    const value = "opaque-ticket-credential-without-pii",
      sealed = encrypt(value);
    expect(sealed).not.toContain(value);
    expect(decrypt(sealed)).toBe(value);
    const tampered = Buffer.from(sealed, "base64");
    tampered[20] ^= 1;
    expect(() => decrypt(tampered.toString("base64"))).toThrow();
    expect(hash(value)).toHaveLength(64);
  });
  it("bounds pagination before querying", () => {
    expect(pagination({})).toEqual({ page: 1, page_size: 20, offset: 0 });
    expect(() => pagination({ page_size: 101 })).toThrow();
    expect(() => pagination({ page: "1 OR 1=1" })).toThrow();
  });
  it("exports independent financial and booking state enums", () => {
    expect(contract.info.version).toBe("ticketflow-api-v1");
    expect(contract.components.schemas.BookingState.enum).toContain("EXPIRED");
    expect(contract.components.schemas.PaymentState.enum).toContain(
      "SUCCEEDED",
    );
    expect(contract.components.schemas.RefundState.enum).toContain(
      "PROCESSING",
    );
  });
});
