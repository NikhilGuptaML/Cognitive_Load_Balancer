"""Test question gen with tools parameter (like the actual server does)."""
import traceback

try:
    from db.database import get_db
    db = next(get_db())
    from db.models import Session as StudySession, Document
    session = db.get(StudySession, "c8d328b2-25e3-443c-b41a-29dc0c40dddc")
    doc = db.get(Document, session.doc_id)
    coll = doc.chroma_path.split("::", 1)[1]
    from core.document_processor import get_all_chunks
    chunks = get_all_chunks(coll)
    print("Got", len(chunks), "chunks")
    from core.chunk_manager import ChunkSessionManager
    mgr = ChunkSessionManager(chunks)
    from llm.prompt_builder import build_messages, get_chunk_tool
    messages = build_messages(mgr, "OPTIMAL")
    tools = [get_chunk_tool()]
    from llm.groq_client import groq_client
    print("Calling Groq with tools param (like server does)...")
    result = groq_client.generate_json("llama-3.3-70b-versatile", messages, tools=tools)
    print("Result keys:", list(result.keys()))
    if "tool_calls" in result:
        print("GOT TOOL CALLS! This is the problem path.")
        for tc in result["tool_calls"]:
            print("  Tool call:", tc.function.name)
    else:
        print("Got question:", result.get("question", "")[:100])
except Exception as e:
    print("FAILED:", e)
    traceback.print_exc()
