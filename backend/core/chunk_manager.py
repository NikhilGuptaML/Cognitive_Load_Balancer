import json

class ChunkSessionManager:
    def __init__(self, chunks: list[str]):
        self.chunks = {i: {"text": c, "exhausted": False} for i, c in enumerate(chunks)}
        self.current_chunk_index = 0
        self.used_indices = set()
        self.questions_asked_this_chunk = []   # list of {question, correct_answer, explanation}
        self.llm_history = []                  # only covers current chunk's Q&A turns

    def get_active_chunk(self) -> str:
        if self.current_chunk_index not in self.chunks:
            return ""
        return self.chunks[self.current_chunk_index]["text"]

    def record_question(self, q_obj: dict):
        self.questions_asked_this_chunk.append(q_obj)
        # Add to LLM history as assistant turn
        self.llm_history.append({"role": "assistant", "content": json.dumps(q_obj)})

    def is_chunk_exhausted(self, max_questions_per_chunk: int = 5) -> bool:
        return len(self.questions_asked_this_chunk) >= max_questions_per_chunk

    def advance_to_next_chunk(self):
        """Wipes LLM history and loads the next unexhausted chunk."""
        if self.current_chunk_index in self.chunks:
            self.chunks[self.current_chunk_index]["exhausted"] = True
            self.used_indices.add(self.current_chunk_index)
            
        self.questions_asked_this_chunk = []
        self.llm_history = []  # wipe history here

        # Find next available chunk (sequential; skip exhausted)
        for i in range(len(self.chunks)):
            if not self.chunks[i]["exhausted"]:
                self.current_chunk_index = i
                return True
        return False  # all chunks exhausted -> session complete
