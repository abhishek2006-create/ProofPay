from app.rag.document_loader import extract_text
from app.rag.chunker import chunk_text

text = extract_text("tests\sample.pdf")

chunks = chunk_text(
    text,
    chunk_size=200,
    overlap=40
)

print("Total chunks:", len(chunks))

for i, chunk in enumerate(chunks[:3]):
    print(f"\nChunk {i + 1}:\n{chunk}")