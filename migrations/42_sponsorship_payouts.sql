-- Migration 42: monthly transfers to sponsored families, and money added by hand.
--
-- The money a case holds is what it received (sponsorship payments, plus
-- funds staff record by hand: cash, a cheque, a transfer from a partner) minus
-- what was confirmed as received by the family. Each month staff prepare a
-- transfer per case — the monthly amount, capped at what is left, so a case
-- simply stops appearing once its money runs out — export the list to Excel,
-- send the money, and confirm each line. Only a confirmed transfer leaves the
-- balance; it is recorded as a disbursement, so sponsors see it too.
--
-- Additive and idempotent. Applied automatically by scripts/migrate.sh.

CREATE TABLE IF NOT EXISTS sponsorship_manual_credits (
    id              SERIAL PRIMARY KEY,
    case_id         INTEGER         NOT NULL REFERENCES sponsorship_cases(id),
    amount_cents    INTEGER         NOT NULL,
    method          VARCHAR(20)     NOT NULL,          -- cash | check | bank_transfer | other
    donor_name      VARCHAR(200),                      -- staff only, never shown to the family
    note            TEXT,
    received_on     DATE            NOT NULL,
    recorded_by     INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    CONSTRAINT sponsorship_manual_credits_amount_check CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_manual_credits_case
    ON sponsorship_manual_credits (case_id);

CREATE TABLE IF NOT EXISTS sponsorship_payouts (
    id              SERIAL PRIMARY KEY,
    case_id         INTEGER         NOT NULL REFERENCES sponsorship_cases(id),
    period          VARCHAR(7)      NOT NULL,          -- YYYY-MM the transfer is for
    amount_cents    INTEGER         NOT NULL,
    status          VARCHAR(12)     NOT NULL DEFAULT 'planned',  -- planned | confirmed | cancelled
    method          VARCHAR(20),
    reference       VARCHAR(120),                      -- the bank or mobile-money reference
    note            TEXT,
    planned_at      TIMESTAMP       NOT NULL DEFAULT NOW(),
    planned_by      INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    confirmed_at    TIMESTAMP,
    received_on     DATE,
    confirmed_by    INTEGER         REFERENCES users(id) ON DELETE SET NULL,
    disbursement_id INTEGER         REFERENCES sponsorship_disbursements(id) ON DELETE SET NULL,
    CONSTRAINT sponsorship_payouts_amount_check CHECK (amount_cents > 0),
    CONSTRAINT sponsorship_payouts_status_check CHECK (status IN ('planned', 'confirmed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_payouts_period ON sponsorship_payouts (period, status);
-- One live transfer per case and month: preparing the month twice adds nothing.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sponsorship_payouts_case_period
    ON sponsorship_payouts (case_id, period) WHERE status <> 'cancelled';

SELECT 'Migration 42 completed successfully!' as message;
