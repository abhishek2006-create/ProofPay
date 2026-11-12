from langchain_community.document_loaders import PyMuPDFLoader

def load_document(pdf_path):
    loader = PyMuPDFLoader(pdf_path, mode="page")
    return loader.load()