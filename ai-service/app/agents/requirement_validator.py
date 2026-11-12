
import re
from collections import Counter


def validate_test_references(report):
    requirement_ids = {
        req.id for req in report.requirements
    }

    for test in report.test_scenarios:
        for criterion_id in test.criterion_ids:

            if criterion_id not in requirement_ids:
                print(
                    f"Invalid reference: {criterion_id} "
                    f"in test {test.id}"
                )
                return False

    return True


def validate_unique_ids(report):
    ids = set()

    for item in report.requirements + report.test_scenarios:

        if item.id in ids:
            print(f"Duplicate ID found: {item.id}")
            return False

        ids.add(item.id)

    return True


def normalize_text(text):
    # Normalize whitespace and common quotation marks.
    text = text.casefold()
    text = text.replace("\u2018", "'")
    text = text.replace("\u2019", "'")
    text = text.replace("\u201c", '"')
    text = text.replace("\u201d", '"')
    text = re.sub(r"\s+", " ", text)

    return text.strip()


def validate_source_excerpts(report, documents):
    # Map PDF page numbers (starting at 1) to text.
    pages = {}

    for index, doc in enumerate(documents):
        page_index = doc.metadata.get("page", index)
        pages[page_index + 1] = doc.page_content

    valid = True

    for req in report.requirements:
        page_text = pages.get(req.source_page)

        if page_text is None:
            print(
                f"{req.id}: Invalid source page "
                f"{req.source_page}"
            )
            valid = False
            continue

        excerpt = normalize_text(req.source_excerpt)
        original = normalize_text(page_text)

        if not excerpt or excerpt not in original:
            print(
                f"{req.id}: Source excerpt does not "
                f"match page {req.source_page}"
            )
            valid = False

    return valid


def validate_requirement_meaning(report):
    """
    Detect obvious changes from optional/preferred
    wording to mandatory wording.

    This is a heuristic, not full semantic validation.
    Returns (passed, warnings).
    """

    warnings = []

    optional_patterns = [
        r"\bpreferred\b",
        r"\bpreferably\b",
        r"\boptional\b",
        r"\bmay\b",
        r"\brecommended\b",
        r"\bshould\b",
    ]

    mandatory_patterns = [
        r"\bmust\b",
        r"\bshall\b",
        r"\brequired\b",
        r"\bmandatory\b",
    ]

    for req in report.requirements:
        source = normalize_text(req.source_excerpt)
        description = normalize_text(req.description)

        source_optional = any(
            re.search(pattern, source)
            for pattern in optional_patterns
        )

        description_mandatory = any(
            re.search(pattern, description)
            for pattern in mandatory_patterns
        )

        source_mandatory = any(
            re.search(pattern, source)
            for pattern in mandatory_patterns
        )

        if (
            source_optional
            and description_mandatory
            and not source_mandatory
        ):
            warnings.append(
                f"{req.id}: Possible optional-to-mandatory "
                f"wording change. Review the original text."
            )

    for warning in warnings:
        print("Meaning warning:", warning)

    return len(warnings) == 0, warnings


def validate_requirements(report, documents):
    """
    Run all validation checks.
    """

    print("\nValidating extracted requirements...\n")

    references_valid = validate_test_references(report)
    unique_ids_valid = validate_unique_ids(report)
    excerpts_valid = validate_source_excerpts(
        report, documents
    )

    meaning_valid, warnings = validate_requirement_meaning(
        report
    )

    results = {
        "references_valid": references_valid,
        "unique_ids_valid": unique_ids_valid,
        "source_excerpts_valid": excerpts_valid,
        "meaning_check_passed": meaning_valid,
        "meaning_warnings": warnings,
    }

    print("\nValidation results:")

    for key, value in results.items():
        print(f"{key}: {value}")

    return (
        references_valid
        and unique_ids_valid
        and excerpts_valid
        and meaning_valid
    )
