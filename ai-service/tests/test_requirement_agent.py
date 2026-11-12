
from app.agents.requirements_agent import extract_requirements

result = extract_requirements("tests/sample.pdf")

print("\nTotal requirements:", len(result.requirements))
print("Total test scenarios:", len(result.test_scenarios))

print("\nExtracted requirements:")

for req in result.requirements:
    print("\nID:", req.id)
    print("Parent ID:", req.parent_requirement_id)
    print("Priority:", req.priority)
    print("Description:", req.description)
    print("Source excerpt:", req.source_excerpt)

print("\nTest scenarios:")

for test in result.test_scenarios:
    print(f"\nTest ID: {test.id}")
    print(f"Verifies: {test.criterion_ids}")
