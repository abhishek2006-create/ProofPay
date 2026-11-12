from pydantic import BaseModel,Field
from typing import Literal
class AcceptanceCriterion(BaseModel):
    id: str=Field(
        description="Unique requirement identifier"
    )
    description: str=Field(
        description="What the freelancer must implement"
    )
    verification_method: Literal[
        "FUNCTIONAL_TEST",
        "CODE_REVIEW",
        "MANUAL_REVIEW"
    ]
    expected_result: str=Field(
        description="Observable result proving completion"
    )
    source_page: int=Field(
        description="PDF page number, starting at 1"
    )
    source_excerpt: str = Field(
    description="Exact supporting text from the client document"
    )

    parent_requirement_id: str = Field(
    description=(
        "Original requirement ID from the client document. "
        "For example, if AUTH-01 is split into AUTH-01a "
        "and AUTH-01b, both must have parent_requirement_id='AUTH-01'."
    )
    )

    priority: Literal[
    "MANDATORY",
    "PREFERRED",
    "OPTIONAL",
    "UNSPECIFIED"
    ] = Field(
    description=(
        "Strength of the requirement in the original document. "
        "Preserve the distinction between must, should, "
        "may, preferred, and optional."
    )
    )

class TestScenario(BaseModel):
    id: str = Field(
        description="Unique test scenario identifier, such as TEST-01"
    )

    criterion_ids: list[str] = Field(
        description="IDs of acceptance criteria verified by this test scenario, such as AUTH-01"
    )

    test_description: str = Field(
        description="Step-by-step description of how to test the requirement"
    )

    expected_result: str = Field(
        description="Expected observable outcome if the test passes"
    )

    source_page: int = Field(
        description="Page number in the client document where this test scenario is specified, starting at 1"
    )
    
class RequirementsReport(BaseModel):
    requirements: list[AcceptanceCriterion]
    test_scenarios: list[TestScenario]