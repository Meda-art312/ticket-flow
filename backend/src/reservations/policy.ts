export interface Clock {
  now(): Date;
}
export class FixedClock implements Clock {
  constructor(private instant: Date) {}
  now() {
    return this.instant;
  }
  set(instant: Date) {
    this.instant = instant;
  }
}
// Projection only: transactional SQL uses PostgreSQL clock_timestamp after locks.
export function holdEligible(
  bookingState: string,
  eventState: string,
  deadline: Date,
  clock: Clock,
) {
  return (
    bookingState === "RESERVED" &&
    eventState === "PUBLISHED" &&
    clock.now().getTime() < deadline.getTime()
  );
}
