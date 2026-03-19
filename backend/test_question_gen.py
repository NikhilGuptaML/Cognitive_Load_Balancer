"""Minimal test - just call Groq with actual document chunks."""
import traceback, sys, os
os.environ["PYTHONIOENCODING"] = "utf-8"

try:
    from db.database import get_db
    db = next(get_db())
    from db.models import Session as StudySession, Document
    from sqlalchemy import select
    
    sessions = db.scalars(select(StudySession).order_by(StudySession.started_at.desc()).limit(1)).all()
    session = sessions[0]
    doc = db.get(Document, session.doc_id)
    coll = doc.chroma_path.split("::", 1)[1]
    
    from core.document_processor import get_all_chunks
    chunks = get_all_chunks(coll)
    
    from core.chunk_manager import ChunkSessionManager
    mgr = ChunkSessionManager(chunks)
    
    from llm.prompt_builder import build_messages, get_chunk_tool
    messages = build_messages(mgr, "OPTIMAL")
    tools = [get_chunk_tool()]
    
    from llm.groq_client import groq_client
    
    # Test WITH tools (the actual server path that fails)
    try:
        result = groq_client.generate_json("llama-3.3-70b-versatile", messages, tools=tools)
        if "tool_calls" in result:
            sys.stdout.buffer.write(b"STEP5: Got tool_calls, advancing chunk\n")
            mgr.advance_to_next_chunk()
            messages = build_messages(mgr, "OPTIMAL")
            result = groq_client.generate_json("llama-3.3-70b-versatile", messages)
        
        q = result.get("question", "")
        opts = result.get("options", {})
        ca = result.get("correct_answer", "")
        
        if q and opts and ca:
            sys.stdout.buffer.write(f"SUCCESS: question generated OK\n".encode("utf-8"))
        else:
            sys.stdout.buffer.write(f"INCOMPLETE: q={bool(q)}, opts={bool(opts)}, ca={bool(ca)}\n".encode("utf-8"))
    except Exception as e:
        sys.stdout.buffer.write(f"GROQ CALL FAILED: {type(e).__name__}: {e}\n".encode("utf-8"))
        traceback.print_exc()

except Exception as e:
    sys.stdout.buffer.write(f"SETUP FAILED: {type(e).__name__}: {e}\n".encode("utf-8"))
    traceback.print_exc()
