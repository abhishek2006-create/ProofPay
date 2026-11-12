from app.rag.document_loader import extract_text
pdf_path="tests\sample.pdf"
result=extract_text(pdf_path)
print(result)