from langchain_chroma import Chroma
from app.rag.embeddings import embeddings

vector_store = Chroma(
    collection_name="proofpay_requirements",
    embedding_function=embeddings,
    persist_directory="./langchain_chroma_data",
)

def store_documents(documents, project_id):
    for doc in documents:
        doc.metadata["project_id"] = project_id

    return vector_store.add_documents(documents)

def search_documents(query, project_id):
    return vector_store.similarity_search(
        query,
        k=3,
        filter={"project_id": project_id}
    )