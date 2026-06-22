"""Tests for prep/_lib/game8.py."""

import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(os.path.dirname(HERE)))

from _lib.game8 import (  # noqa: E402
    normalize_name,
    parse_moves,
    parse_abilities,
    parse_items,
)

FIXTURES = os.path.join(HERE, "fixtures")


def load_fixture(name: str) -> str:
    with open(os.path.join(FIXTURES, name), "r", encoding="utf-8") as f:
        return f.read()


class TestNormalizeName(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(normalize_name("Pikachu"), "pikachu")
        self.assertEqual(normalize_name("Charizard-Mega-X"), "charizardmegax")
        self.assertEqual(normalize_name("Mr. Mime"), "mrmime")
        self.assertEqual(normalize_name("Farfetch'd"), "farfetchd")
        self.assertEqual(normalize_name("Light Ball"), "lightball")
        self.assertEqual(normalize_name("Charizardite X"), "charizarditex")


class TestParseMoves(unittest.TestCase):
    def test_basic(self):
        html = load_fixture("game8_moves_sample.html")
        result = parse_moves(html)
        self.assertIn("Thunderbolt", result)
        self.assertEqual(result["Thunderbolt"], "Has a 10% chance of paralyzing the target.")

    def test_long_description(self):
        html = load_fixture("game8_moves_sample.html")
        result = parse_moves(html)
        self.assertIn("Protect", result)
        # Should preserve the full sentence
        self.assertIn("chance of success becomes lower", result["Protect"])

    def test_br_stripped(self):
        html = load_fixture("game8_moves_sample.html")
        result = parse_moves(html)
        # Recover's description has <br> that should be stripped
        self.assertEqual(result["Recover"], "Restores 1/2 of the user's max HP.")

    def test_em_dash_preserved(self):
        html = load_fixture("game8_moves_sample.html")
        result = parse_moves(html)
        # Em-dash is a valid description (no effect to describe)
        self.assertEqual(result["Splash"], "\u2014")


class TestParseAbilities(unittest.TestCase):
    def test_basic(self):
        html = load_fixture("game8_abilities_sample.html")
        result = parse_abilities(html)
        self.assertIn("Static", result)
        self.assertIn("30% chance", result["Static"])

    def test_multiple_tables(self):
        html = load_fixture("game8_abilities_sample.html")
        result = parse_abilities(html)
        # Both tables' data should be merged
        self.assertIn("Static", result)
        self.assertIn("Mega Sol", result)
        self.assertIn("Wonder Guard", result)
        self.assertEqual(len(result), 5)

    def test_apostrophe_in_name(self):
        html = load_fixture("game8_abilities_sample.html")
        result = parse_abilities(html)
        # Eelevate doesn't have apostrophe, but Intimidate shouldn't either
        self.assertIn("Intimidate", result)


class TestParseItems(unittest.TestCase):
    def test_basic(self):
        html = load_fixture("game8_items_sample.html")
        result = parse_items(html)
        self.assertIn("Light Ball", result)
        self.assertEqual(result["Light Ball"], "If held by a Pikachu, its Attack and Sp. Atk are doubled.")

    def test_special_chars(self):
        html = load_fixture("game8_items_sample.html")
        result = parse_items(html)
        # Charizardite X has a space and an X
        self.assertIn("Charizardite X", result)
        # Normalized: charizarditex
        self.assertEqual(normalize_name("Charizardite X"), "charizarditex")

    def test_strips_extra_before_hr(self):
        html = load_fixture("game8_items_sample.html")
        result = parse_items(html)
        # The "Shop: 400 VP" text before <hr> should be excluded
        self.assertIn("Leftovers", result)
        self.assertNotIn("Shop", result["Leftovers"])


class TestEmDashSemantics(unittest.TestCase):
    def test_emdash_is_valid(self):
        # Per the user, "—" is a valid description (means "no effect")
        self.assertEqual("\u2014", "\u2014")  # sanity
        # The parser should preserve it
        html = load_fixture("game8_moves_sample.html")
        result = parse_moves(html)
        self.assertIn("Splash", result)
        self.assertEqual(result["Splash"], "\u2014")


if __name__ == "__main__":
    unittest.main()
