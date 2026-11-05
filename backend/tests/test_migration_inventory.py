"""Guard the migration directory that scripts/migrate.sh walks.

The runner applies these files automatically on every deploy now, so a mistake
here is no longer caught by a human reading a command before pasting it. Each
of these checks maps to a way the runner could do the wrong thing quietly.
"""
import hashlib
import os
import re
import subprocess

import pytest

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MIGRATIONS = os.path.join(REPO, "migrations")
RUNNER = os.path.join(REPO, "scripts", "migrate.sh")

# Mirrors the runner's own glob: numbered files only, so run_all_migrations.sql
# and anything else in the directory is never executed.
NUMBERED = re.compile(r"^\d+_.+\.sql$")
PHASE_HEADER = re.compile(r"^--\s*migrate:phase\s+(pre|post)\s*$", re.M)


def migration_files():
    return sorted(n for n in os.listdir(MIGRATIONS) if NUMBERED.match(n))


def read(name):
    with open(os.path.join(MIGRATIONS, name), encoding="utf-8", errors="replace") as fh:
        return fh.read()


def test_there_are_migrations_to_run():
    files = migration_files()
    assert len(files) >= 36, "expected the full chain, found %d" % len(files)


def test_the_runner_exists_and_is_executable_in_git():
    """The deploy job calls ./scripts/migrate.sh directly. Committed without the
    executable bit, that is a red deploy on a line nobody reads."""
    assert os.path.exists(RUNNER)
    out = subprocess.run(
        ["git", "ls-files", "-s", "scripts/migrate.sh", "scripts/logs.sh"],
        cwd=REPO, capture_output=True, text=True).stdout
    assert out.strip(), "scripts are not tracked by git"
    for line in out.strip().splitlines():
        mode = line.split()[0]
        assert mode == "100755", "%s is not executable in git (mode %s)" % (line.split()[-1], mode)


def test_shell_scripts_are_stored_with_unix_line_endings():
    """A CRLF shell script dies on Linux with `/usr/bin/env^M: bad interpreter`.
    These are authored on Windows, so this is a live hazard, not a theoretical
    one."""
    for rel in ("scripts/migrate.sh", "scripts/logs.sh"):
        sha = subprocess.run(["git", "rev-parse", ":" + rel], cwd=REPO,
                             capture_output=True, text=True).stdout.strip()
        if not sha:
            pytest.skip("%s not staged" % rel)
        blob = subprocess.run(["git", "cat-file", "blob", sha], cwd=REPO,
                              capture_output=True).stdout
        assert b"\r" not in blob, "%s is stored with CR bytes" % rel


def test_no_duplicate_filenames_and_the_order_is_total():
    """The runner sorts by filename. Two files that sort equally would apply in
    an order that depends on the filesystem."""
    files = migration_files()
    assert len(files) == len(set(files))
    assert files == sorted(files)


def test_duplicate_numbers_still_order_deterministically():
    """07 is used twice. That is fine — filename sort is still total — but it
    must stay fine, so this pins it."""
    from collections import Counter
    numbers = Counter(n.split("_", 1)[0] for n in migration_files())
    shared = {k: v for k, v in numbers.items() if v > 1}
    for prefix in shared:
        same = sorted(n for n in migration_files() if n.startswith(prefix + "_"))
        assert same == sorted(same), prefix


@pytest.mark.parametrize("name", migration_files())
def test_phase_header_is_well_formed_if_present(name):
    """A typo like `-- migrate:phase after` silently falls back to `pre`, which
    for a destructive migration means running it while the old image is live."""
    body = read(name)
    if "migrate:phase" not in body:
        return
    assert PHASE_HEADER.search(body), (
        "%s mentions migrate:phase but not in the form the runner parses "
        "(`-- migrate:phase pre` or `-- migrate:phase post`)" % name)


def test_the_destructive_migration_is_marked_post_deploy():
    """33 drops columns the previous image still writes. docs/DEPLOYMENT.md said
    so in prose; now the runner has to know it."""
    body = read("33_drop_proposal_content_columns.sql")
    found = PHASE_HEADER.search(body)
    assert found and found.group(1) == "post"


@pytest.mark.parametrize("name", migration_files())
def test_a_migration_either_wraps_cleanly_or_manages_its_own_transaction(name):
    """The runner wraps each file in BEGIN/COMMIT together with its tracking
    row. A file that opens its own transaction cannot be wrapped, and the
    runner detects exactly this pattern — so the detection and the files must
    agree."""
    body = read(name)
    self_managing = bool(re.search(r"^\s*(BEGIN|COMMIT)\s*;", body, re.M | re.I))
    # CREATE INDEX CONCURRENTLY cannot run inside a transaction at all, so it
    # would need its own handling that the runner does not have.
    assert "CONCURRENTLY" not in body.upper(), (
        "%s uses CONCURRENTLY, which cannot run in the transaction the runner "
        "wraps migrations in" % name)
    if self_managing:
        # Only 32 is known to do this; a new one would need the same treatment.
        assert name == "32_proposal_versioning.sql", (
            "%s manages its own transaction. The runner handles that, but the "
            "tracking row then commits separately — confirm that is intended "
            "and add it here." % name)


def test_checksums_are_stable_and_distinct():
    """The runner stores a 16-char sha256 prefix to detect an applied migration
    being edited. Distinctness keeps that meaningful."""
    sums = {}
    for name in migration_files():
        digest = hashlib.sha256(
            open(os.path.join(MIGRATIONS, name), "rb").read()).hexdigest()[:16]
        assert digest not in sums, "%s and %s hash alike" % (name, sums[digest])
        sums[digest] = name


def test_no_compose_file_mounts_an_initdb_script():
    """An initdb script would leave a populated schema with no migration
    history, which the runner baselines as 'already applied' — silently
    skipping every migration after it. One path only."""
    for name in ("docker-compose.yml", "docker-compose.traefik.yml",
                 "docker-compose.prod.yml"):
        path = os.path.join(REPO, name)
        if not os.path.exists(path):
            continue
        body = open(path, encoding="utf-8").read()
        for line in body.splitlines():
            stripped = line.strip()
            if stripped.startswith("#"):
                continue
            assert "docker-entrypoint-initdb.d" not in stripped, (
                "%s mounts an initdb script: %s" % (name, stripped))


def test_production_does_not_create_tables_from_the_models():
    """create_all() creates missing tables but never a missing column, which is
    how a drifted schema becomes a 500 instead of an error. In production the
    schema is owned by migrations/."""
    body = open(os.path.join(REPO, "backend", "main.py"), encoding="utf-8").read()
    assert "IS_PRODUCTION" in body
    assert re.search(r"if not TESTING_MODE and not IS_PRODUCTION:\s*\n\s*Base\.metadata\.create_all",
                     body), "create_all() is no longer gated on production"
