import unittest
from datetime import date
from unittest.mock import patch

from fetch_schedule import build_snapshot


class SnapshotTests(unittest.TestCase):
    def test_includes_boundary_dates_and_deduplicates_overlapping_weeks(self):
        requested = []
        game = {
            "id": 1,
            "homeTeam": {"abbrev": "BOS"},
            "awayTeam": {"abbrev": "NYR"},
        }

        def fake_week(day):
            requested.append(day)
            return [{"date": "2026-07-01", "games": [game]}]

        with patch("fetch_schedule.fetch_week", side_effect=fake_week):
            snapshot = build_snapshot(date(2026, 11, 16))

        self.assertEqual(snapshot["startDate"], "2026-07-01")
        self.assertEqual(snapshot["endDate"], "2027-07-01")
        self.assertLess(min(requested), date(2026, 7, 1))
        self.assertGreater(max(requested), date(2027, 8, 1))
        self.assertEqual(len(snapshot["gameWeek"][0]["games"]), 1)

    def test_refuses_to_publish_empty_or_partial_download(self):
        with patch("fetch_schedule.fetch_week", return_value=[]):
            with self.assertRaisesRegex(ValueError, "no games"):
                build_snapshot(date(2026, 11, 16))
        with patch("fetch_schedule.fetch_week", side_effect=OSError("NHL unavailable")):
            with self.assertRaises(OSError):
                build_snapshot(date(2026, 11, 16))


if __name__ == "__main__":
    unittest.main()
