
from app.rag.retriever import ask_requirements

answer=ask_requirements(question="What should happen when a student scores below 60% on an algebra quiz?",
                        project_id="proofpay_demo")

print(answer)