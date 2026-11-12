
from app.rag.document_loader import load_document
from app.rag.chunker import chunk_documents
from app.rag.vector_store import store_documents, search_documents
text = load_document("tests/sample.pdf")
chunks = chunk_documents(text)
store_documents(
    chunks,
    project_id="proofpay_demo",
)
results = search_documents(
    query="how will you make a personalized learning buddy?",
    project_id="proofpay_demo",
)
for i,chunk in enumerate(results):
    print(f'retrieved chunk{i+1}:')
    print(chunk.page_content)
    print(f'Metadata:{chunk.metadata}')

