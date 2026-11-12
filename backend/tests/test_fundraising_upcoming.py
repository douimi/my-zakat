"""Upcoming fundraising projects: announced before they open for donations."""


def _create(client, headers, **over):
    body = {"title": "Winter clothing", "slug": "winter-clothing", "short_description": "Coats for 200 children.",
            "goal_amount": 8000, "status": "upcoming", "starts_at": "2026-12-01T00:00:00"}
    body.update(over)
    return client.post("/api/fundraising-projects/", json=body, headers=headers)


def test_a_project_can_be_announced_as_upcoming_with_its_opening_date(client, auth_headers):
    r = _create(client, auth_headers)

    assert r.status_code == 201, r.text
    assert r.json()["status"] == "upcoming"
    assert r.json()["starts_at"].startswith("2026-12-01")
    public = client.get("/api/fundraising-projects/").json()
    assert [p["slug"] for p in public if p["status"] == "upcoming"] == ["winter-clothing"]


def test_opening_an_upcoming_project_is_a_status_change(client, auth_headers):
    pid = _create(client, auth_headers, slug="water-wells").json()["id"]

    r = client.put("/api/fundraising-projects/%d" % pid, json={"status": "active"}, headers=auth_headers)

    assert r.status_code == 200 and r.json()["status"] == "active"


def test_an_unknown_status_is_still_refused(client, auth_headers):
    assert _create(client, auth_headers, slug="x-project", status="soon").status_code == 422
