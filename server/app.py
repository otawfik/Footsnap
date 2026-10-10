"""
FootSnap Flask Backend
Proxies all requests to football-data.org so the API key is never exposed
to the frontend client.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from dotenv import load_dotenv
from functools import wraps

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["*"])  # Restrict in production

FOOTBALL_API_KEY = os.getenv("FOOTBALL_API_KEY", "")
FOOTBALL_BASE_URL = "https://api.football-data.org/v4"

# Top 5 league IDs on football-data.org
ALLOWED_LEAGUES = {2021, 2014, 2002, 2019, 2015}

HEADERS = {
    "X-Auth-Token": FOOTBALL_API_KEY,
}


def require_api_key(f):
    """Guard: refuse requests if no API key is configured."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not FOOTBALL_API_KEY:
            return jsonify({"error": "FOOTBALL_API_KEY not configured on server."}), 500
        return f(*args, **kwargs)
    return decorated


def proxy_request(path: str, params: dict = None):
    """Generic helper to proxy a GET request to football-data.org."""
    url = f"{FOOTBALL_BASE_URL}/{path}"
    try:
        resp = requests.get(url, headers=HEADERS, params=params, timeout=10)
        resp.raise_for_status()
        return jsonify(resp.json()), resp.status_code
    except requests.exceptions.Timeout:
        return jsonify({"error": "Upstream API timed out."}), 504
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response else 502
        try:
            detail = e.response.json()
        except Exception:
            detail = {"error": str(e)}
        return jsonify(detail), status
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 502


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "FootSnap API"}), 200


# ---------------------------------------------------------------------------
# Competitions / Leagues
# ---------------------------------------------------------------------------

@app.route("/api/competitions")
@require_api_key
def get_competitions():
    """Return the top-5 league metadata."""
    return proxy_request("competitions", {"areas": "2072,2224,2088,2081,2163"})


@app.route("/api/competitions/<int:league_id>")
@require_api_key
def get_competition(league_id: int):
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400
    return proxy_request(f"competitions/{league_id}")


# ---------------------------------------------------------------------------
# Standings
# ---------------------------------------------------------------------------

@app.route("/api/standings/<int:league_id>")
@require_api_key
def get_standings(league_id: int):
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400
    season = request.args.get("season")
    params = {"season": season} if season else {}
    return proxy_request(f"competitions/{league_id}/standings", params)


# ---------------------------------------------------------------------------
# Fixtures / Matches
# ---------------------------------------------------------------------------

@app.route("/api/matches/live")
@require_api_key
def get_live_matches():
    """All live matches across the top 5 leagues."""
    competitions = ",".join(str(lid) for lid in ALLOWED_LEAGUES)
    return proxy_request("matches", {"status": "IN_PLAY,PAUSED", "competitions": competitions})


@app.route("/api/matches/today")
@require_api_key
def get_today_matches():
    """Today's matches across the top 5 leagues."""
    competitions = ",".join(str(lid) for lid in ALLOWED_LEAGUES)
    return proxy_request("matches", {"status": "SCHEDULED,TIMED,IN_PLAY,PAUSED,FINISHED", "competitions": competitions})


@app.route("/api/matches/<int:league_id>")
@require_api_key
def get_league_matches(league_id: int):
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400
    params = {k: v for k, v in request.args.items()}
    return proxy_request(f"competitions/{league_id}/matches", params)


@app.route("/api/matches/team/<int:team_id>")
@require_api_key
def get_team_matches(team_id: int):
    params = {k: v for k, v in request.args.items()}
    return proxy_request(f"teams/{team_id}/matches", params)


# ---------------------------------------------------------------------------
# Scorers / Top Players
# ---------------------------------------------------------------------------

@app.route("/api/scorers/<int:league_id>")
@require_api_key
def get_scorers(league_id: int):
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400
    limit = request.args.get("limit", "20")
    season = request.args.get("season")
    params = {"limit": limit}
    if season:
        params["season"] = season
    return proxy_request(f"competitions/{league_id}/scorers", params)


# ---------------------------------------------------------------------------
# Teams
# ---------------------------------------------------------------------------

@app.route("/api/teams/<int:league_id>")
@require_api_key
def get_league_teams(league_id: int):
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400
    season = request.args.get("season")
    params = {"season": season} if season else {}
    return proxy_request(f"competitions/{league_id}/teams", params)


@app.route("/api/team/<int:team_id>")
@require_api_key
def get_team(team_id: int):
    return proxy_request(f"teams/{team_id}")


# ---------------------------------------------------------------------------
# Person (Player)
# ---------------------------------------------------------------------------

@app.route("/api/person/<int:person_id>")
@require_api_key
def get_person(person_id: int):
    return proxy_request(f"persons/{person_id}")


@app.route("/api/person/<int:person_id>/matches")
@require_api_key
def get_person_matches(person_id: int):
    params = {k: v for k, v in request.args.items()}
    return proxy_request(f"persons/{person_id}/matches", params)


# ---------------------------------------------------------------------------
# Predictions (aggregated stats from standings + scorers)
# A lightweight "prediction" endpoint that computes form data on the server
# so the frontend doesn't have to crunch numbers.
# ---------------------------------------------------------------------------

@app.route("/api/predictions/<int:league_id>")
@require_api_key
def get_predictions(league_id: int):
    """
    Returns the top-5 teams by recent form (last 5 games won ratio)
    and the top scorers as prediction signals.
    This is a best-effort aggregation on the free tier.
    """
    if league_id not in ALLOWED_LEAGUES:
        return jsonify({"error": "League not supported."}), 400

    # Fetch standings
    standings_url = f"{FOOTBALL_BASE_URL}/competitions/{league_id}/standings"
    standings_resp = requests.get(standings_url, headers=HEADERS, timeout=10)
    if standings_resp.status_code != 200:
        return jsonify({"error": "Could not fetch standings."}), 502

    standings_data = standings_resp.json()
    table = (
        standings_data.get("standings", [{}])[0].get("table", [])
        if standings_data.get("standings")
        else []
    )

    # Score teams by form string (W=3, D=1, L=0)
    def form_score(form_str: str) -> float:
        if not form_str:
            return 0
        scores = {"W": 3, "D": 1, "L": 0}
        total = sum(scores.get(c, 0) for c in form_str[-5:])
        return total / 15  # normalize to 0-1

    predictions = []
    for entry in table:
        team = entry.get("team", {})
        form = entry.get("form", "")
        score = form_score(form)
        predictions.append(
            {
                "team": {
                    "id": team.get("id"),
                    "name": team.get("name"),
                    "crestUrl": team.get("crest"),
                },
                "position": entry.get("position"),
                "points": entry.get("points"),
                "form": form,
                "formScore": round(score, 2),
                "formLabel": (
                    "Hot" if score > 0.6 else "Warm" if score > 0.35 else "Cold"
                ),
                "playedGames": entry.get("playedGames"),
                "won": entry.get("won"),
                "draw": entry.get("draw"),
                "lost": entry.get("lost"),
                "goalDifference": entry.get("goalDifference"),
            }
        )

    # Sort by formScore desc
    predictions.sort(key=lambda x: x["formScore"], reverse=True)

    return jsonify({"leagueId": league_id, "predictions": predictions[:10]}), 200


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
