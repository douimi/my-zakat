"""Monthly transfers to sponsored families and orphans, and money added by hand.

The money a case holds:

    received  = sponsorship payments + money staff added by hand
    balance   = received - transfers confirmed as received (disbursements)
    available = balance - transfers prepared but not yet confirmed

Each month staff prepare the transfers (`plan_period`): one per case that has
money, for its monthly amount capped at what is available — so a case stops
appearing by itself once its money runs out. They export the list to Excel,
send the money, and confirm each line (`confirm`). Only a confirmed transfer
leaves the balance; it becomes a SponsorshipDisbursement, which sponsors see in
their space and the family sees in theirs.

Preparing a month twice is harmless: a case already holding a live transfer for
that month is skipped (and the database refuses a second one anyway).
"""
from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

import log_events as ev
import sponsorship_service as svc
from logging_config import get_logger
from models import (
    SponsorshipCase, SponsorshipFamilyDetails, SponsorshipManualCredit, SponsorshipOrphanDetails,
    SponsorshipPayout, User,
)

logger = get_logger(__name__)

PLANNED = "planned"
CONFIRMED = "confirmed"
CANCELLED = "cancelled"
METHODS = ("bank_transfer", "cash", "mobile_money", "check", "other")
CREDIT_METHODS = ("cash", "check", "bank_transfer", "other")
# Money collected for a closed case still belongs to it: it is paid out until
# it runs out. Cases never approved hold none.
PAYABLE_STATUSES = (svc.PUBLISHED, svc.PAUSED, svc.CLOSED)
_PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def check_period(period: str) -> str:
    if not period or not _PERIOD.match(period):
        raise svc.SponsorshipError("The month must be written YYYY-MM.")
    return period


def current_period(today: Optional[date] = None) -> str:
    today = today or date.today()
    return "%04d-%02d" % (today.year, today.month)


# ── Money in by hand ──────────────────────────────────────────────────

def add_manual_credit(db: Session, case: SponsorshipCase, staff: User, data: dict) -> SponsorshipManualCredit:
    amount = int(data.get("amount_cents") or 0)
    if amount <= 0:
        raise svc.SponsorshipError("The amount must be positive.")
    method = data.get("method") or "cash"
    if method not in CREDIT_METHODS:
        raise svc.SponsorshipError("Choose how the money was received.")
    row = SponsorshipManualCredit(
        case_id=case.id, amount_cents=amount, method=method,
        donor_name=(data.get("donor_name") or "").strip()[:200] or None,
        note=(data.get("note") or "").strip() or None,
        received_on=data.get("received_on") or date.today(),
        recorded_by=staff.id,
    )
    db.add(row)
    db.flush()
    # Internal: the donor's name is staff detail, and the family is not told
    # where the money came from.
    svc.record_event(db, case, "manual_funds_added", svc.Actor.staff(staff),
                     changes={"credit_id": row.id, "amount_cents": amount, "method": method})
    db.commit()
    db.refresh(row)
    logger.event(ev.SPONSORSHIP_MANUAL_FUNDS_ADDED, "money was added to a sponsored case by hand",
                 case_id=case.id, amount_cents=amount, method=method)
    return row


def credits_of(db: Session, case_id: int) -> list[SponsorshipManualCredit]:
    return (db.query(SponsorshipManualCredit).filter(SponsorshipManualCredit.case_id == case_id)
            .order_by(SponsorshipManualCredit.received_on.desc(), SponsorshipManualCredit.id.desc()).all())


# ── Balances ──────────────────────────────────────────────────────────

def planned_map(db: Session, case_ids: list[int]) -> dict[int, int]:
    if not case_ids:
        return {}
    return dict(
        db.query(SponsorshipPayout.case_id, func.coalesce(func.sum(SponsorshipPayout.amount_cents), 0))
        .filter(SponsorshipPayout.case_id.in_(case_ids), SponsorshipPayout.status == PLANNED)
        .group_by(SponsorshipPayout.case_id).all()
    )


def funds(db: Session, case_ids: list[int]) -> dict[int, dict]:
    """svc.finances_map, plus what is already promised in prepared transfers."""
    fin = svc.finances_map(db, case_ids)
    planned = planned_map(db, case_ids)
    for cid, f in fin.items():
        f["planned_cents"] = int(planned.get(cid, 0))
        f["available_cents"] = max(f["balance_cents"] - f["planned_cents"], 0)
    return fin


# ── Preparing a month ─────────────────────────────────────────────────

def plan_period(db: Session, period: str, staff: User, kind: Optional[str] = None) -> list[SponsorshipPayout]:
    """Prepare one transfer per case that has money for `period`. Commits."""
    check_period(period)
    q = db.query(SponsorshipCase).filter(SponsorshipCase.status.in_(PAYABLE_STATUSES),
                                         SponsorshipCase.approved_monthly_cents.isnot(None))
    if kind:
        q = q.filter(SponsorshipCase.kind == kind)
    cases = q.all()
    if not cases:
        return []
    already = {cid for (cid,) in db.query(SponsorshipPayout.case_id).filter(
        SponsorshipPayout.period == period, SponsorshipPayout.status != CANCELLED,
        SponsorshipPayout.case_id.in_([c.id for c in cases])).all()}
    money = funds(db, [c.id for c in cases])
    created = []
    for case in cases:
        if case.id in already:
            continue
        amount = min(case.approved_monthly_cents or 0, money[case.id]["available_cents"])
        if amount <= 0:
            continue
        row = SponsorshipPayout(case_id=case.id, period=period, amount_cents=amount,
                                status=PLANNED, planned_by=staff.id, planned_at=datetime.utcnow())
        db.add(row)
        created.append(row)
    db.commit()
    for row in created:
        db.refresh(row)
    logger.event(ev.SPONSORSHIP_PAYOUT_PLANNED, "monthly transfers were prepared",
                 period=period, count=len(created), total_cents=sum(r.amount_cents for r in created))
    return created


def update_planned(db: Session, payout: SponsorshipPayout, *, amount_cents: Optional[int], note: Optional[str]) -> None:
    if payout.status != PLANNED:
        raise svc.SponsorshipError("Only a transfer that has not been confirmed can be changed.")
    if amount_cents is not None:
        if amount_cents <= 0:
            raise svc.SponsorshipError("The amount must be positive.")
        money = funds(db, [payout.case_id])[payout.case_id]
        # What else is promised, without this transfer's own amount.
        room = money["balance_cents"] - (money["planned_cents"] - payout.amount_cents)
        if amount_cents > room:
            raise svc.SponsorshipError("Only $%s is left for this case." % svc._dollars(max(room, 0)))
        payout.amount_cents = amount_cents
    if note is not None:
        payout.note = note.strip() or None
    db.commit()


def cancel(db: Session, payout: SponsorshipPayout, staff: User, note: Optional[str]) -> None:
    if payout.status != PLANNED:
        raise svc.SponsorshipError("Only a transfer that has not been confirmed can be cancelled.")
    payout.status = CANCELLED
    payout.note = (note or "").strip() or payout.note
    case = db.query(SponsorshipCase).get(payout.case_id)
    svc.record_event(db, case, "payout_cancelled", svc.Actor.staff(staff), note=payout.note,
                     changes={"payout_id": payout.id, "period": payout.period, "amount_cents": payout.amount_cents})
    db.commit()


def confirm(db: Session, payout: SponsorshipPayout, staff: User, *, method: Optional[str] = None,
            reference: Optional[str] = None, received_on: Optional[date] = None,
            amount_cents: Optional[int] = None, note: Optional[str] = None) -> SponsorshipPayout:
    """The family received the money: it leaves the balance. Commits.

    `amount_cents` lower than planned records what actually arrived; the rest
    stays in the case's balance for next month.
    """
    if payout.status != PLANNED:
        raise svc.SponsorshipError("This transfer is already %s." % payout.status)
    if method is not None and method not in METHODS:
        raise svc.SponsorshipError("Choose how the money was sent.")
    amount = amount_cents if amount_cents is not None else payout.amount_cents
    if amount <= 0 or amount > payout.amount_cents:
        raise svc.SponsorshipError("The amount received must be between $0 and the planned amount.")
    case = db.query(SponsorshipCase).get(payout.case_id)
    received_on = received_on or date.today()
    # The payout is marked first: record_disbursement commits, and it must
    # commit both together, so a transfer can never be recorded as paid
    # while still showing as waiting (and then be paid twice).
    payout.status = CONFIRMED
    payout.amount_cents = amount
    payout.method = method or payout.method
    payout.reference = (reference or "").strip()[:120] or payout.reference
    payout.note = (note or "").strip() or payout.note
    payout.received_on = received_on
    payout.confirmed_at = datetime.utcnow()
    payout.confirmed_by = staff.id
    disbursement = svc.record_disbursement(db, case, staff, {
        "amount_cents": amount,
        "category": "monthly_support",
        "period": payout.period,
        "description": "Monthly support for %s" % payout.period,
        "description_ar": "الدعم الشهري لشهر %s" % payout.period,
        "internal_note": " · ".join(x for x in (payout.method, payout.reference, payout.note) if x) or None,
        "disbursed_at": received_on,
    })
    payout.disbursement_id = disbursement.id
    db.commit()
    db.refresh(payout)
    logger.event(ev.SPONSORSHIP_PAYOUT_CONFIRMED, "a monthly transfer was confirmed as received",
                 case_id=case.id, payout_id=payout.id, period=payout.period, amount_cents=amount)
    return payout


# ── Listing and the Excel sheet ───────────────────────────────────────

def _recipient(case: SponsorshipCase, details) -> dict:
    """Who the money goes to: the head of household, or the child's guardian."""
    if case.kind == svc.FAMILY:
        return {"recipient": details.head_full_name if details else case.submitter_name,
                "child": None, "phone": case.submitter_phone}
    return {"recipient": details.guardian_name if details else case.submitter_name,
            "child": details.full_name if details else None,
            "phone": (details.guardian_phone if details else None) or case.submitter_phone}


def period_rows(db: Session, period: str) -> list[dict]:
    check_period(period)
    payouts = (db.query(SponsorshipPayout).filter(SponsorshipPayout.period == period,
                                                  SponsorshipPayout.status != CANCELLED)
               .order_by(SponsorshipPayout.id).all())
    if not payouts:
        return []
    ids = list({p.case_id for p in payouts})
    cases = {c.id: c for c in db.query(SponsorshipCase).filter(SponsorshipCase.id.in_(ids)).all()}
    details = {d.case_id: d for d in db.query(SponsorshipFamilyDetails).filter(
        SponsorshipFamilyDetails.case_id.in_(ids)).all()}
    details.update({d.case_id: d for d in db.query(SponsorshipOrphanDetails).filter(
        SponsorshipOrphanDetails.case_id.in_(ids)).all()})
    money = funds(db, ids)
    rows = []
    for p in payouts:
        c = cases[p.case_id]
        m = money[c.id]
        # "Before" is the balance as it stands; a planned line is not out yet.
        before = m["balance_cents"] + (p.amount_cents if p.status == CONFIRMED else 0)
        rows.append({
            "payout_id": p.id, "case_id": c.id, "reference": c.reference, "kind": c.kind,
            "case_status": c.status, **_recipient(c, details.get(c.id)),
            "organization": c.organization_name, "address": c.address, "city": c.city,
            "region": c.region, "country": c.country,
            "monthly_cents": c.approved_monthly_cents or 0,
            "balance_before_cents": before, "amount_cents": p.amount_cents,
            "balance_after_cents": before - p.amount_cents,
            "status": p.status, "method": p.method, "transfer_reference": p.reference, "note": p.note,
            "received_on": p.received_on.isoformat() if p.received_on else None,
        })
    rows.sort(key=lambda r: (r["country"] or "", r["city"] or "", r["reference"]))
    return rows


def export_xlsx(rows: list[dict], period: str) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Transfers %s" % period
    headers = [
        ("Line", 7), ("Reference", 12), ("Kind", 9), ("Recipient", 28), ("Child (orphans)", 24),
        ("Phone", 18), ("Association", 24), ("Address", 34), ("City", 16), ("Region", 16), ("Country", 14),
        ("Monthly amount (USD)", 14), ("Balance before (USD)", 14), ("Amount to transfer (USD)", 16),
        ("Balance after (USD)", 14), ("Status", 11), ("Method", 14), ("Transfer reference", 20),
        ("Received on", 13), ("Note", 30),
    ]
    ws.append([h for h, _ in headers])
    for i, (_, width) in enumerate(headers, start=1):
        ws.column_dimensions[get_column_letter(i)].width = width
    head_fill = PatternFill("solid", fgColor="1E40AF")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = head_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[1].height = 32

    money = lambda c: round(c / 100, 2)  # noqa: E731
    for r in rows:
        ws.append([
            r["payout_id"], r["reference"], r["kind"], r["recipient"], r["child"], r["phone"], r["organization"],
            r["address"], r["city"], r["region"], r["country"], money(r["monthly_cents"]),
            money(r["balance_before_cents"]), money(r["amount_cents"]), money(r["balance_after_cents"]),
            r["status"], r["method"], r["transfer_reference"], r["received_on"], r["note"],
        ])
    for col in (12, 13, 14, 15):
        for row in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            row[0].number_format = '#,##0.00'
    total_row = len(rows) + 2
    ws.cell(row=total_row, column=13, value="Total").font = Font(bold=True)
    total = ws.cell(row=total_row, column=14, value="=SUM(N2:N%d)" % (total_row - 1) if rows else 0)
    total.font = Font(bold=True)
    total.number_format = '#,##0.00'
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(headers)), max(len(rows) + 1, 1))

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def payout_view(p: SponsorshipPayout) -> dict:
    return {
        "id": p.id, "period": p.period, "amount_cents": p.amount_cents, "status": p.status,
        "method": p.method, "reference": p.reference, "note": p.note,
        "planned_at": p.planned_at.isoformat() if p.planned_at else None,
        "received_on": p.received_on.isoformat() if p.received_on else None,
        "confirmed_at": p.confirmed_at.isoformat() if p.confirmed_at else None,
    }


def credit_view(c: SponsorshipManualCredit) -> dict:
    return {"id": c.id, "amount_cents": c.amount_cents, "method": c.method, "donor_name": c.donor_name,
            "note": c.note, "received_on": c.received_on.isoformat() if c.received_on else None}
