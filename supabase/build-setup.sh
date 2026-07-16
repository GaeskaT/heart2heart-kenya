#!/usr/bin/env bash
# Regenerates setup-all.sql (all migrations concatenated, for one-paste setup
# in the Supabase SQL editor). Source of truth remains migrations/*.sql.
set -euo pipefail
cd "$(dirname "$0")"
OUT="setup-all.sql"
{
  echo "-- ============================================================================"
  echo "-- Heart2Heart Kenya — FULL SETUP (phases 0-3)"
  echo "-- GENERATED FILE — do not edit. Source of truth: supabase/migrations/*.sql"
  echo "-- Regenerate: bash supabase/build-setup.sh"
  echo "--"
  echo "-- Paste this whole file into the Supabase SQL editor and Run."
  echo "-- ============================================================================"
  echo ""
  for f in migrations/[0-9]*.sql; do
    echo ""
    echo "-- ############################################################################"
    echo "-- ## $(basename "$f")"
    echo "-- ############################################################################"
    echo ""
    cat "$f"
  done
} > "$OUT"
echo "generated $OUT ($(wc -l < "$OUT") lines)"
