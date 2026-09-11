"""Diagnostic provenance only; no scoring, clock inference or side effects."""

# Keep raw source values and presence separately. Absent count is NOT count=1.
# updatedAt/confirmedAt/message ts do NOT assert physical observation time.
SOURCE_FIELDS = (
    "updatedAt", "confirmedAt", "createdAt", "observedAt", "observed_at",
    "count", "status", "lifecycle", "positionQuality", "areaOnly",
    "displayConfidence",
)


def source_metadata(track: dict) -> dict:
    return {
        "schema_version": 1,
        "source_fields": {key: track.get(key) for key in SOURCE_FIELDS},
        "field_presence": [key for key in SOURCE_FIELDS if key in track],
        "receipt": track.get("_receipt"),
    }
