"""Offline tests; no application imports, network, DB or notifications."""
import unittest
from audit_aircraft_models import inventory


class InventoryTests(unittest.TestCase):
    def test_deduplicates_hex_and_preserves_descriptions(self):
        a = {"type": " c17 ", "hex": "AB12", "desc": "C-17"}
        source = {"snaps": [{"ts": "2026-09-08T10:00:00+00:00", "aircraft": [a, a]}]}
        result = inventory([("first", source), ("second", source)])
        self.assertEqual(result["model_count"], 1)
        self.assertEqual(result["models"][0]["distinct_hex"], 1)
        self.assertEqual(result["models"][0]["descriptions"], ["C-17"])
        self.assertEqual(result["models"][0]["sources"], ["first", "second"])

    def test_aggregates_snapshot_watch_signal_and_live(self):
        data = {"snaps": [{"ts": "2026-09-08T10:00:00+00:00", "aircraft": [{"type": "C17"}]}],
                "adsb_watch_events": [{"ts": "2026-09-08T10:01:00+00:00", "type": "IL76"}],
                "signals": [{"source": "adsb", "details": {"aircraft": [{"t": "H60"}]}}],
                "adsb": {"aircraft": [{"type": "W3"}]}}
        self.assertEqual({r["type"] for r in inventory([("test", data)])["models"]}, {"C17", "IL76", "H60", "W3"})

    def test_unknown_is_not_guessed(self):
        result = inventory([("test", {"adsb": {"aircraft": [{"desc": "helicopter"}]}})])
        self.assertEqual(result["model_count"], 0)
        self.assertEqual(result["unknown_type_observations"], 1)

    def test_empty(self):
        self.assertEqual(inventory([])["models"], [])


if __name__ == "__main__":
    unittest.main()
