from app.rag.document_loader import extract_text
from app.rag.chunker import chunk_text
from app.rag.embeddings import create_embeddings
import numpy as np
pdf_path="tests/sample.pdf"
text=extract_text(pdf_path)
chunks=chunk_text(text,chunk_size=400,overlap=40)
print(chunks[0])
print(len(chunks))
embeddings=create_embeddings(chunks)
similarity=np.dot(embeddings,embeddings.T)
print(embeddings.shape)
print("\nCosine similarity matrix")
print(similarity)

