export function Footer() {
  return (
    <footer style={{ padding: "8px 16px 32px", fontSize: 12, color: "var(--color-neutral-600)" }}>
      Markets: Polymarket, Kalshi. Polls:{" "}
      <a href="https://votehub.com/polls/" style={{ textDecoration: "underline" }}>
        VoteHub
      </a>
      . Probabilities are the chance the Democrat wins, with each market&apos;s D and R prices normalized to sum to 100%.
    </footer>
  );
}
